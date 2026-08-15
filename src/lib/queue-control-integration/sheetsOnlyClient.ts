import "server-only";

import { GoogleAuth } from "google-auth-library";
import { readGoogleSheetsConfig, type GoogleSheetsConfig, type SheetsGateway } from "@/lib/google-sheets/googleSheetsClient";
import { SheetsControlError, type SheetRow } from "@/lib/google-sheets/sheetSchemas";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

function a1(sheetName: string, range: string) { return `'${sheetName.replace(/'/gu, "''")}'!${range}`; }

export class NoUploadGoogleSheetsClient implements SheetsGateway {
  private readonly auth: GoogleAuth;
  constructor(private readonly config: GoogleSheetsConfig = readGoogleSheetsConfig()) {
    this.auth = new GoogleAuth({ credentials: { client_email: config.serviceAccountEmail, private_key: config.privateKey }, scopes: [SHEETS_SCOPE] });
  }

  private async request<T>(url: string, init: RequestInit, write: boolean): Promise<T> {
    try {
      const token = await this.auth.getAccessToken();
      if (!token) throw new Error("token unavailable");
      const headers = new Headers(init.headers); headers.set("Authorization", `Bearer ${token}`);
      const response = await fetch(url, { ...init, headers, cache: "no-store" });
      if (!response.ok) throw new Error(`google api status ${response.status}`);
      if (response.status === 204) return undefined as T;
      return await response.json() as T;
    } catch {
      throw new SheetsControlError(write ? "GOOGLE_SHEETS_WRITE_FAILED" : "GOOGLE_SHEETS_READ_FAILED", write ? "Google Sheets 쓰기에 실패했습니다." : "Google Sheets 읽기에 실패했습니다.", 502);
    }
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
