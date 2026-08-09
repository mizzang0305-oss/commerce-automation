import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { GoogleAuth } from "google-auth-library";
import {
  resolveGoogleServiceAccountCredential,
  type GoogleCredentialResolverOptions
} from "./googleServiceAccountCredential";
import { SHEET_NAMES, SheetsControlError, type SheetRow } from "./sheetSchemas";

export const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export type GoogleSheetsConfig = {
  spreadsheetId: string;
  serviceAccountEmail: string;
  privateKey: string;
  driveVideoFolderId: string;
  credentialSource: "key_file" | "legacy";
  keyFileOutsideRepo: boolean;
  keyFilePermissionsChecked: boolean;
  privateKeyParseReady: boolean;
};

export interface SheetsGateway {
  getValues(sheetName: string, range: string): Promise<SheetRow[]>;
  updateValues(sheetName: string, range: string, values: SheetRow[]): Promise<void>;
  appendValues(sheetName: string, range: string, values: SheetRow[]): Promise<void>;
  clearValues(sheetName: string, range: string): Promise<void>;
}

export function buildGoogleAuthScopes(config: Pick<GoogleSheetsConfig, "driveVideoFolderId">): string[] {
  return config.driveVideoFolderId.trim() ? [SHEETS_SCOPE, DRIVE_FILE_SCOPE] : [SHEETS_SCOPE];
}

export function googleSheetsConfigured(
  env: NodeJS.ProcessEnv = process.env,
  options: GoogleCredentialResolverOptions = {}
) {
  try {
    readGoogleSheetsConfig(env, options);
    return true;
  } catch {
    return false;
  }
}

export function googleDriveConfigured(
  env: NodeJS.ProcessEnv = process.env,
  options: GoogleCredentialResolverOptions = {}
) {
  try {
    return Boolean(readGoogleSheetsConfig(env, options).driveVideoFolderId.trim());
  } catch {
    return false;
  }
}

export function readGoogleSheetsConfig(
  env: NodeJS.ProcessEnv = process.env,
  options: GoogleCredentialResolverOptions = {}
): GoogleSheetsConfig {
  const spreadsheetId = env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() ?? "";
  if (!spreadsheetId) {
    throw new SheetsControlError("GOOGLE_SHEETS_SPREADSHEET_ID_MISSING", "Google Sheets spreadsheet ID 설정이 없습니다.", 503);
  }
  const credential = resolveGoogleServiceAccountCredential(env, options);
  return {
    spreadsheetId,
    serviceAccountEmail: credential.serviceAccountEmail,
    privateKey: credential.privateKey,
    driveVideoFolderId: env.GOOGLE_DRIVE_VIDEO_FOLDER_ID?.trim() ?? "",
    credentialSource: credential.source,
    keyFileOutsideRepo: credential.keyFileOutsideRepo,
    keyFilePermissionsChecked: credential.keyFilePermissionsChecked,
    privateKeyParseReady: credential.privateKeyParseReady
  };
}

function a1(sheetName: string, range: string) {
  const escaped = sheetName.replace(/'/g, "''");
  return `'${escaped}'!${range}`;
}

export class GoogleSheetsClient implements SheetsGateway {
  private readonly auth: GoogleAuth;

  constructor(private readonly config: GoogleSheetsConfig = readGoogleSheetsConfig()) {
    this.auth = new GoogleAuth({
      credentials: { client_email: config.serviceAccountEmail, private_key: config.privateKey },
      scopes: buildGoogleAuthScopes(config)
    });
  }

  private async request<T>(url: string, init: RequestInit, errorCode: "GOOGLE_SHEETS_READ_FAILED" | "GOOGLE_SHEETS_WRITE_FAILED") {
    try {
      const token = await this.auth.getAccessToken();
      if (!token) throw new Error("token unavailable");
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${token}`);
      const response = await fetch(url, { ...init, headers, cache: "no-store" });
      if (!response.ok) throw new Error(`google api status ${response.status}`);
      if (response.status === 204) return undefined as T;
      return await response.json() as T;
    } catch {
      throw new SheetsControlError(
        errorCode,
        errorCode === "GOOGLE_SHEETS_READ_FAILED" ? "Google Sheets 읽기에 실패했습니다." : "Google Sheets 쓰기에 실패했습니다.",
        502
      );
    }
  }

  async getValues(sheetName: string, range: string) {
    const encoded = encodeURIComponent(a1(sheetName, range));
    const result = await this.request<{ values?: SheetRow[] }>(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.config.spreadsheetId)}/values/${encoded}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`,
      { method: "GET" },
      "GOOGLE_SHEETS_READ_FAILED"
    );
    return result.values ?? [];
  }

  async updateValues(sheetName: string, range: string, values: SheetRow[]) {
    const encoded = encodeURIComponent(a1(sheetName, range));
    await this.request(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.config.spreadsheetId)}/values/${encoded}?valueInputOption=RAW`,
      { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values }) },
      "GOOGLE_SHEETS_WRITE_FAILED"
    );
  }

  async appendValues(sheetName: string, range: string, values: SheetRow[]) {
    const encoded = encodeURIComponent(a1(sheetName, range));
    await this.request(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.config.spreadsheetId)}/values/${encoded}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values }) },
      "GOOGLE_SHEETS_WRITE_FAILED"
    );
  }

  async clearValues(sheetName: string, range: string) {
    const encoded = encodeURIComponent(a1(sheetName, range));
    await this.request(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.config.spreadsheetId)}/values/${encoded}:clear`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
      "GOOGLE_SHEETS_WRITE_FAILED"
    );
  }

  async uploadVideo(localPath: string, fileName?: string) {
    if (!this.config.driveVideoFolderId) {
      throw new SheetsControlError("GOOGLE_SHEETS_NOT_CONFIGURED", "Google Drive 영상 폴더가 설정되지 않았습니다.", 503);
    }
    const bytes = await readFile(localPath);
    const boundary = `commerce-control-${crypto.randomUUID()}`;
    const metadata = JSON.stringify({
      name: fileName || path.basename(localPath),
      parents: [this.config.driveVideoFolderId]
    });
    const prefix = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`);
    const suffix = Buffer.from(`\r\n--${boundary}--`);
    const body = Buffer.concat([prefix, bytes, suffix]);
    const result = await this.request<{ id: string }>(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
      { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body },
      "GOOGLE_SHEETS_WRITE_FAILED"
    );
    return {
      fileId: result.id,
      previewUrl: `https://drive.google.com/file/d/${encodeURIComponent(result.id)}/preview`,
      openUrl: `https://drive.google.com/file/d/${encodeURIComponent(result.id)}/view`
    };
  }
}

export const LIVE_HEADER_RANGES = {
  [SHEET_NAMES.queue]: "A1:T1",
  [SHEET_NAMES.commands]: "A1:L1",
  [SHEET_NAMES.logs]: "A1:L1"
} as const;
