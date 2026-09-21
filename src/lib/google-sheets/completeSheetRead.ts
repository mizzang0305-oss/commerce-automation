import { createHash } from "node:crypto";
import type { SheetsGateway, SheetUserEnteredCell } from "./googleSheetsClient";
import { SHEET_NAMES, type SheetRow } from "./sheetSchemas";
import { RESERVE_SHEET_NAME, SYNC_SHEET_NAME } from "@/lib/queue-control-integration/contracts";

// Explicit projection columns only; metadata bounds rows, never a whole-spreadsheet read.
export const COMPLETE_SHEET_COLUMNS: Readonly<Record<string, number>> = {
  [SHEET_NAMES.queue]: 34, [RESERVE_SHEET_NAME]: 12, [SYNC_SHEET_NAME]: 12,
};
export const COMPLETE_SHEET_PAGE_ROWS = 500;
export const COMPLETE_SHEET_MAX_ROWS = 10_000;

export type SheetsMetadata = { sheets?: Array<{ properties?: {
  title?: string; sheetId?: number;
  gridProperties?: { rowCount?: number; columnCount?: number; frozenRowCount?: number };
} }> };
export type SheetReadPage<T> = { sheetName: string; startRow: number; endRow: number; columnCount: number; rows: T[][] };
export type CompleteSheetRead<T> = {
  rows: T[][]; gridRows: number; gridColumns: number; columnCount: number; pageCount: number;
};
export type GoogleValuesPage = { range?: string; majorDimension?: string; values?: SheetRow[] };
export type GoogleGridPage = { sheets?: Array<{ properties?: { title?: string }; data?: Array<{
  startRow?: number; startColumn?: number;
  rowData?: Array<{ values?: Array<{ userEnteredValue?: {
    stringValue?: string; numberValue?: number; boolValue?: boolean; formulaValue?: string;
  } }> }>;
}> }> };
export const USER_ENTERED_PAGE_FIELDS = "sheets(properties(title),data(startRow,startColumn,rowData(values(userEnteredValue))))";

export function parseBoundedSheetRange(range: string) {
  const match = /^A([1-9]\d*):([A-Z]+)([1-9]\d*)$/u.exec(range);
  if (!match) throw new Error("SHEETS_COMPLETE_RANGE_INVALID");
  const startRow = Number(match[1]); const endRow = Number(match[3]);
  const columnCount = [...match[2]].reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0);
  if (![startRow, endRow, columnCount].every(Number.isSafeInteger) || endRow < startRow) throw new Error("SHEETS_COMPLETE_RANGE_INVALID");
  return { startRow, endRow, columnCount };
}

export function valuesPageFromResponse(sheetName: string, range: string, response: GoogleValuesPage): SheetReadPage<SheetRow[number]> {
  const expected = parseBoundedSheetRange(range);
  const match = /^(?:'((?:[^']|'')+)'|([^'!]+))!(\$?A\$?[1-9]\d*:\$?[A-Z]+\$?[1-9]\d*)$/u.exec(response?.range ?? "");
  if (!match || (match[1]?.replace(/''/gu, "'") ?? match[2]) !== sheetName || match[3].replace(/\$/gu, "") !== range
    || (response.majorDimension !== undefined && response.majorDimension !== "ROWS")) throw new Error("SHEETS_COMPLETE_PAGE_IDENTITY_INVALID");
  if (response.values !== undefined && !Array.isArray(response.values)) throw new Error("SHEETS_COMPLETE_PAGE_ROWS_INVALID");
  const rows = response.values ?? [];
  assertPageRows(rows, expected, (cell) => typeof cell === "string" || typeof cell === "boolean" || (typeof cell === "number" && Number.isFinite(cell)));
  return { sheetName, ...expected, rows };
}

export function userEnteredPageFromResponse(sheetName: string, range: string, response: GoogleGridPage): SheetReadPage<SheetUserEnteredCell> {
  const expected = parseBoundedSheetRange(range);
  const sheets = response?.sheets;
  if (!Array.isArray(sheets) || sheets.length !== 1 || sheets[0].properties?.title !== sheetName
    || !Array.isArray(sheets[0].data) || sheets[0].data.length !== 1) throw new Error("SHEETS_COMPLETE_PAGE_IDENTITY_INVALID");
  const data = sheets[0].data[0];
  if ((data.startRow ?? 0) !== expected.startRow - 1 || (data.startColumn ?? 0) !== 0) throw new Error("SHEETS_COMPLETE_PAGE_IDENTITY_INVALID");
  if (data.rowData !== undefined && !Array.isArray(data.rowData)) throw new Error("SHEETS_COMPLETE_PAGE_ROWS_INVALID");
  const rows = (data.rowData ?? []).map((row) => {
    if (row.values !== undefined && !Array.isArray(row.values)) throw new Error("SHEETS_COMPLETE_PAGE_ROWS_INVALID");
    return (row.values ?? []).map((cell): SheetUserEnteredCell => {
      const value = cell.userEnteredValue;
      if (!value || Object.keys(value).length === 0) return { kind: "blank" };
      if (Object.keys(value).length !== 1) throw new Error("SHEETS_COMPLETE_CELL_INVALID");
      if (typeof value.formulaValue === "string") return { kind: "formula", value: value.formulaValue };
      if (typeof value.stringValue === "string") return { kind: "literal_string", value: value.stringValue };
      if (typeof value.numberValue === "number" && Number.isFinite(value.numberValue)) return { kind: "literal_number", value: value.numberValue };
      if (typeof value.boolValue === "boolean") return { kind: "literal_boolean", value: value.boolValue };
      throw new Error("SHEETS_COMPLETE_CELL_INVALID");
    });
  });
  assertPageRows(rows, expected, validSemanticCell);
  return { sheetName, ...expected, rows };
}

function validSemanticCell(cell: unknown): boolean {
  if (!cell || typeof cell !== "object" || !("kind" in cell)) return false;
  const entry = cell as SheetUserEnteredCell;
  return entry.kind === "blank" || ((entry.kind === "formula" || entry.kind === "literal_string") && typeof entry.value === "string")
    || (entry.kind === "literal_boolean" && typeof entry.value === "boolean") || (entry.kind === "literal_number" && Number.isFinite(entry.value));
}
function assertPageRows<T>(rows: T[][], expected: ReturnType<typeof parseBoundedSheetRange>, validCell: (cell: T) => boolean) {
  if (!Array.isArray(rows) || rows.length > expected.endRow - expected.startRow + 1
    || rows.some((row) => !Array.isArray(row) || row.length > expected.columnCount || row.some((cell) => !validCell(cell)))) throw new Error("SHEETS_COMPLETE_PAGE_ROWS_INVALID");
}
function grid(metadata: SheetsMetadata, sheetName: string) {
  const columnCount = COMPLETE_SHEET_COLUMNS[sheetName];
  if (!columnCount) throw new Error("SHEETS_COMPLETE_SCHEMA_UNSUPPORTED");
  const matches = metadata?.sheets?.filter((sheet) => sheet.properties?.title === sheetName) ?? [];
  if (matches.length !== 1) throw new Error("SHEETS_COMPLETE_METADATA_INVALID");
  const properties = matches[0].properties?.gridProperties;
  const gridRows = properties?.rowCount ?? 0; const gridColumns = properties?.columnCount ?? 0;
  if (!Number.isSafeInteger(gridRows) || gridRows < 1 || gridRows > COMPLETE_SHEET_MAX_ROWS) throw new Error("SHEETS_COMPLETE_ROW_BOUND_EXCEEDED");
  if (!Number.isSafeInteger(gridColumns) || gridColumns < columnCount) throw new Error("SHEETS_COMPLETE_COLUMN_SCHEMA_INVALID");
  return { gridRows, gridColumns, columnCount };
}
function endColumn(count: number) {
  let result = "";
  for (let value = count; value > 0; value = Math.floor((value - 1) / 26)) result = String.fromCharCode(65 + (value - 1) % 26) + result;
  return result;
}
async function readComplete<T>(gateway: SheetsGateway, sheetName: string, pageReader: ((sheet: string, range: string) => Promise<SheetReadPage<T>>) | undefined, blank: (cell: T) => boolean, valid: (cell: T) => boolean): Promise<CompleteSheetRead<T>> {
  if (!gateway.metadata || !pageReader) throw new Error("SHEETS_COMPLETE_CAPABILITY_REQUIRED");
  const limits = grid(await gateway.metadata(), sheetName);
  const rows: T[][] = []; let pageCount = 0;
  for (let startRow = 1; startRow <= limits.gridRows; startRow += COMPLETE_SHEET_PAGE_ROWS) {
    const endRow = Math.min(startRow + COMPLETE_SHEET_PAGE_ROWS - 1, limits.gridRows);
    const range = `A${startRow}:${endColumn(limits.columnCount)}${endRow}`;
    const page = await pageReader.call(gateway, sheetName, range);
    if (!page || page.sheetName !== sheetName || page.startRow !== startRow || page.endRow !== endRow || page.columnCount !== limits.columnCount) throw new Error("SHEETS_COMPLETE_PAGE_IDENTITY_INVALID");
    assertPageRows(page.rows, { startRow, endRow, columnCount: limits.columnCount }, valid);
    // APIs omit trailing empty rows/cells. Restore physical row offsets between pages;
    // never terminate early on an empty page. Trim only after the final page is read.
    for (let offset = 0; offset <= endRow - startRow; offset += 1) {
      const row = [...(page.rows[offset] ?? [])];
      while (row.length && blank(row[row.length - 1])) row.pop();
      rows.push(row);
    }
    pageCount += 1;
  }
  if (JSON.stringify(grid(await gateway.metadata(), sheetName)) !== JSON.stringify(limits)) throw new Error("SHEETS_COMPLETE_METADATA_CHANGED");
  while (rows.length && rows[rows.length - 1].length === 0) rows.pop();
  return { rows, ...limits, pageCount };
}
export function readCompleteSheetValues(gateway: SheetsGateway, sheetName: string) {
  return readComplete(gateway, sheetName, gateway.getValuesPage, (cell) => cell === "", (cell) => typeof cell === "string" || typeof cell === "boolean" || (typeof cell === "number" && Number.isFinite(cell)));
}
export function readCompleteSheetUserEntered(gateway: SheetsGateway, sheetName: string) {
  return readComplete(gateway, sheetName, gateway.getUserEnteredPage, (cell) => cell.kind === "blank", validSemanticCell);
}
export function completeSheetSemanticHash(snapshot: CompleteSheetRead<SheetUserEnteredCell>) {
  const rows = snapshot.rows.map((row) => Array.from({ length: snapshot.columnCount }, (_, index) => row[index] ?? { kind: "blank" }));
  return createHash("sha256").update(JSON.stringify({ rows, gridRows: snapshot.gridRows, gridColumns: snapshot.gridColumns, columnCount: snapshot.columnCount })).digest("hex");
}
export function assertCompleteSheetAppendCapacity(snapshot: Pick<CompleteSheetRead<unknown>, "rows" | "gridRows">, additions: number) {
  if (!Number.isSafeInteger(additions) || additions < 0 || Math.max(snapshot.rows.length, 1) + additions > snapshot.gridRows
    || snapshot.gridRows > COMPLETE_SHEET_MAX_ROWS) throw new Error("SHEETS_COMPLETE_APPEND_CAPACITY_EXCEEDED");
}
