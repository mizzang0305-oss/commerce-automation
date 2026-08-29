import "server-only";

import { GoogleAuth } from "google-auth-library";
import {
  readGoogleSheetsConfig,
  type GoogleSheetsConfig,
  type SheetsGateway,
  type SheetUserEnteredCell,
  type UserEnteredSheetsGateway,
} from "@/lib/google-sheets/googleSheetsClient";
import { SheetsControlError, type SheetRow } from "@/lib/google-sheets/sheetSchemas";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const READ_RETRY_DELAYS_MS = [250, 1_000] as const;

export type SanitizedSheetsAttempt = {
  attempt: number;
  method: string;
  write: boolean;
  status: number;
  classification: "success" | "transient_http" | "transient_network" | "permanent_http" | "auth_failure" | "invalid_response";
  retried: boolean;
};

type SheetsOnlyClientDependencies = {
  getAccessToken?: () => Promise<string | null>;
  fetch?: typeof fetch;
  sleep?: (delayMs: number) => Promise<void>;
};

function a1(sheetName: string, range: string) { return `'${sheetName.replace(/'/gu, "''")}'!${range}`; }

export class NoUploadGoogleSheetsClient implements SheetsGateway, UserEnteredSheetsGateway {
  private readonly auth: GoogleAuth;
  private readonly attempts: SanitizedSheetsAttempt[] = [];
  private readonly dependencies: Required<SheetsOnlyClientDependencies>;
  constructor(private readonly config: GoogleSheetsConfig = readGoogleSheetsConfig(), dependencies: SheetsOnlyClientDependencies = {}) {
    this.auth = new GoogleAuth({ credentials: { client_email: config.serviceAccountEmail, private_key: config.privateKey }, scopes: [SHEETS_SCOPE] });
    this.dependencies = {
      getAccessToken: dependencies.getAccessToken ?? (async () => (await this.auth.getAccessToken()) ?? null),
      fetch: dependencies.fetch ?? fetch,
      sleep: dependencies.sleep ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs))),
    };
  }

  sanitizedAttempts(): SanitizedSheetsAttempt[] { return structuredClone(this.attempts); }

  private async request<T>(url: string, init: RequestInit, write: boolean): Promise<T> {
    let token: string | null;
    try {
      token = await this.dependencies.getAccessToken();
      if (!token) throw new Error("token unavailable");
    } catch {
      this.attempts.push({ attempt: 1, method: init.method ?? "GET", write, status: 0, classification: "auth_failure", retried: false });
      throw new SheetsControlError(write ? "GOOGLE_SHEETS_WRITE_FAILED" : "GOOGLE_SHEETS_READ_FAILED", write ? "Google Sheets 쓰기에 실패했습니다." : "Google Sheets 읽기에 실패했습니다.", 502);
    }

    const maxAttempts = write ? 1 : READ_RETRY_DELAYS_MS.length + 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const headers = new Headers(init.headers); headers.set("Authorization", `Bearer ${token}`);
        const response = await this.dependencies.fetch(url, { ...init, headers, cache: "no-store" });
        if (!response.ok) {
          const transient = !write && (response.status === 429 || response.status >= 500);
          const retried = transient && attempt < maxAttempts;
          this.attempts.push({ attempt, method: init.method ?? "GET", write, status: response.status, classification: transient ? "transient_http" : "permanent_http", retried });
          if (retried) { await this.dependencies.sleep(READ_RETRY_DELAYS_MS[attempt - 1]); continue; }
          break;
        }
        if (response.status === 204) {
          this.attempts.push({ attempt, method: init.method ?? "GET", write, status: response.status, classification: "success", retried: false });
          return undefined as T;
        }
        try {
          const value = await response.json() as T;
          this.attempts.push({ attempt, method: init.method ?? "GET", write, status: response.status, classification: "success", retried: false });
          return value;
        } catch {
          this.attempts.push({ attempt, method: init.method ?? "GET", write, status: response.status, classification: "invalid_response", retried: false });
          break;
        }
      } catch {
        const retried = !write && attempt < maxAttempts;
        this.attempts.push({ attempt, method: init.method ?? "GET", write, status: 0, classification: "transient_network", retried });
        if (retried) { await this.dependencies.sleep(READ_RETRY_DELAYS_MS[attempt - 1]); continue; }
        break;
      }
    }
    throw new SheetsControlError(write ? "GOOGLE_SHEETS_WRITE_FAILED" : "GOOGLE_SHEETS_READ_FAILED", write ? "Google Sheets 쓰기에 실패했습니다." : "Google Sheets 읽기에 실패했습니다.", 502);
  }

  async metadata() {
    return this.request<{ sheets?: Array<{ properties?: { title?: string; sheetId?: number; gridProperties?: { rowCount?: number; columnCount?: number; frozenRowCount?: number } } }> }>(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.config.spreadsheetId)}?fields=sheets.properties(sheetId,title,gridProperties(rowCount,columnCount,frozenRowCount))`,
      { method: "GET" }, false
    );
  }

  async ensureSheets(names: string[]) {
    const existing = new Set((await this.metadata()).sheets?.map((sheet) => sheet.properties?.title).filter((value): value is string => Boolean(value)) ?? []);
    const missing = names.filter((name) => !existing.has(name));
    if (missing.length === 0) return;
    await this.request(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.config.spreadsheetId)}:batchUpdate`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requests: missing.map((title) => ({ addSheet: { properties: { title } } })) }) }, true
    );
  }

  async getValues(sheetName: string, range: string) {
    const result = await this.request<{ values?: SheetRow[] }>(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.config.spreadsheetId)}/values/${encodeURIComponent(a1(sheetName, range))}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`,
      { method: "GET" }, false
    );
    return result.values ?? [];
  }

  async getUserEnteredCells(sheetName: string, range: string) {
    const result = await this.request<{
      sheets?: Array<{ data?: Array<{ rowData?: Array<{ values?: Array<{ userEnteredValue?: GoogleExtendedValue }> }> }> }>;
    }>(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.config.spreadsheetId)}?ranges=${encodeURIComponent(a1(sheetName, range))}&includeGridData=true&fields=${encodeURIComponent("sheets(data(rowData(values(userEnteredValue))))")}`,
      { method: "GET" }, false
    );
    return (result.sheets?.[0]?.data?.[0]?.rowData ?? []).map((row) =>
      (row.values ?? []).map((cell) => userEnteredCell(cell.userEnteredValue))
    );
  }

  async updateValues(sheetName: string, range: string, values: SheetRow[]) {
    await this.request(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.config.spreadsheetId)}/values/${encodeURIComponent(a1(sheetName, range))}?valueInputOption=RAW`,
      { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values }) }, true
    );
  }

  async appendValues(sheetName: string, range: string, values: SheetRow[]) {
    await this.request(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.config.spreadsheetId)}/values/${encodeURIComponent(a1(sheetName, range))}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values }) }, true
    );
  }

  async clearValues(sheetName: string, range: string) {
    await this.request(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.config.spreadsheetId)}/values/${encodeURIComponent(a1(sheetName, range))}:clear`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }, true
    );
  }
}

type GoogleExtendedValue = {
  stringValue?: string;
  numberValue?: number;
  boolValue?: boolean;
  formulaValue?: string;
};

function userEnteredCell(value?: GoogleExtendedValue): SheetUserEnteredCell {
  if (!value) return { kind: "blank" };
  if (typeof value.formulaValue === "string") return { kind: "formula", value: value.formulaValue };
  if (typeof value.stringValue === "string") return { kind: "literal_string", value: value.stringValue };
  if (typeof value.numberValue === "number") return { kind: "literal_number", value: value.numberValue };
  if (typeof value.boolValue === "boolean") return { kind: "literal_boolean", value: value.boolValue };
  return { kind: "blank" };
}
