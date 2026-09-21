import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { COMMAND_HEADERS, QUEUE_HEADERS, SHEET_NAMES } from "../../src/lib/google-sheets/sheetSchemas";
import {
  NoUploadGoogleSheetsClient,
  QUEUE_PROJECTION_EXTRA_HEADERS,
  RESERVE_HEADERS,
  RESERVE_SHEET_NAME,
  SYNC_HEADERS,
  SYNC_SHEET_NAME,
} from "../../src/lib/queue-control-integration";

const QUEUE_RANGE = "A1:AH1000";
const RESERVE_RANGE = "A1:L1000";
const SYNC_RANGE = "A1:L100";
const COMMAND_RANGE = "A1:O1000";

async function main() {
  const output = resolve(requiredArg("--output"));
  const client = new NoUploadGoogleSheetsClient();
  const metadata = await client.metadata();
  const properties = (metadata.sheets ?? []).map((sheet) => sheet.properties).filter(Boolean);
  const exactNames = [SHEET_NAMES.queue, RESERVE_SHEET_NAME, SYNC_SHEET_NAME, SHEET_NAMES.commands];
  if (exactNames.some((name) => !properties.some((entry) => entry?.title === name))) {
    throw new Error("GOOGLE_SHEETS_REQUIRED_SHEET_MISSING");
  }
  const [queue, reserve, sync, commands] = await Promise.all([
    client.getValues(SHEET_NAMES.queue, QUEUE_RANGE),
    client.getValues(RESERVE_SHEET_NAME, RESERVE_RANGE),
    client.getValues(SYNC_SHEET_NAME, SYNC_RANGE),
    client.getValues(SHEET_NAMES.commands, COMMAND_RANGE),
  ]);
  const queueColumns = columns(queue[0] ?? [], [...QUEUE_HEADERS, ...QUEUE_PROJECTION_EXTRA_HEADERS], SHEET_NAMES.queue);
  const reserveColumns = columns(reserve[0] ?? [], RESERVE_HEADERS, RESERVE_SHEET_NAME);
  const syncColumns = columns(sync[0] ?? [], SYNC_HEADERS, SYNC_SHEET_NAME);
  const commandColumns = columns(commands[0] ?? [], COMMAND_HEADERS, SHEET_NAMES.commands);
  const result = {
    schemaVersion: "daily69-sheets-live-sanitized-snapshot-v1",
    capturedAt: new Date().toISOString(),
    requestAccounting: { metadataReads: 1, valueReads: 4, writes: 0 },
    workbookOpaqueHash: hash(requiredSpreadsheetId()).slice(0, 16),
    worksheets: properties.map((entry) => ({
      title: entry?.title,
      sheetId: entry?.sheetId,
      rowCount: entry?.gridProperties?.rowCount,
      columnCount: entry?.gridProperties?.columnCount,
      frozenRowCount: entry?.gridProperties?.frozenRowCount ?? 0,
    })),
    queue: {
      sheetName: SHEET_NAMES.queue,
      range: QUEUE_RANGE,
      rowCount: Math.max(0, queue.length - 1),
      rows: queue.slice(1).map((row, index) => ({
        rowNumber: index + 2,
        queueIdHash: hash(text(row, queueColumns, "Queue ID")),
        namespace: text(row, queueColumns, "Namespace"),
        queueDate: text(row, queueColumns, "Queue Date"),
        slotId: text(row, queueColumns, "Slot ID"),
        queueRank: text(row, queueColumns, "Queue Rank"),
        projectionRevision: text(row, queueColumns, "Projection Revision"),
        localRevision: text(row, queueColumns, "Local Revision"),
        status: text(row, queueColumns, "진행상태"),
        rowHash: hash(JSON.stringify(row)),
      })),
    },
    reserve: {
      sheetName: RESERVE_SHEET_NAME,
      range: RESERVE_RANGE,
      rowCount: Math.max(0, reserve.length - 1),
      rows: reserve.slice(1).map((row, index) => ({
        rowNumber: index + 2,
        productKeyHashHash: hash(text(row, reserveColumns, "Product Key Hash")),
        namespace: text(row, reserveColumns, "Namespace"),
        queueDate: text(row, reserveColumns, "Queue Date"),
        reserveRank: text(row, reserveColumns, "Reserve Rank"),
        projectionRevision: text(row, reserveColumns, "Projection Revision"),
        claimedSlot: text(row, reserveColumns, "Claimed Slot"),
        rowHash: hash(JSON.stringify(row)),
      })),
    },
    sync: {
      sheetName: SYNC_SHEET_NAME,
      range: SYNC_RANGE,
      rowCount: Math.max(0, sync.length - 1),
      rows: sync.slice(1).map((row, index) => ({
        rowNumber: index + 2,
        namespace: text(row, syncColumns, "Namespace"),
        localRevision: text(row, syncColumns, "Local Revision"),
        projectionRevision: text(row, syncColumns, "Projection Revision"),
        queueCount: text(row, syncColumns, "Queue Count"),
        reserveCount: text(row, syncColumns, "Reserve Count"),
        paused: text(row, syncColumns, "Paused"),
        enabled: text(row, syncColumns, "Enabled"),
        uploadEnabled: text(row, syncColumns, "Upload Enabled"),
        status: text(row, syncColumns, "Projection Status"),
        rowHash: hash(JSON.stringify(row)),
      })),
    },
    commands: {
      sheetName: SHEET_NAMES.commands,
      range: COMMAND_RANGE,
      rowCount: Math.max(0, commands.length - 1),
      rows: commands.slice(1).map((row, index) => ({
        rowNumber: index + 2,
        commandIdHash: hash(text(row, commandColumns, "명령 ID")),
        queueIdHash: hash(text(row, commandColumns, "Queue ID")),
        namespace: text(row, commandColumns, "Namespace"),
        command: text(row, commandColumns, "명령"),
        status: text(row, commandColumns, "상태"),
        expectedRevision: text(row, commandColumns, "Expected Revision"),
        localRevision: text(row, commandColumns, "Local Revision"),
        rowHash: hash(JSON.stringify(row)),
      })),
    },
    rawValuesStored: false,
    affiliateUrlsStored: false,
    localPathsStored: false,
    credentialIdentifiersStored: false,
    SAFE_TO_UPLOAD: false,
    PLATFORM_UPLOAD: 0,
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  process.stdout.write(`${JSON.stringify({
    event: "daily69_sheets_live_sanitized_snapshot",
    queueRows: result.queue.rowCount,
    reserveRows: result.reserve.rowCount,
    syncRows: result.sync.rowCount,
    commandRows: result.commands.rowCount,
    metadataReads: 1,
    valueReads: 4,
    writes: 0,
    rawValuesStored: false,
    SAFE_TO_UPLOAD: false,
  })}\n`);
}

function columns(actual: unknown[], expected: readonly string[], sheet: string) {
  const result = new Map(actual.map((value, index) => [String(value), index]));
  if (expected.some((header) => !result.has(header))) throw new Error(`GOOGLE_SHEETS_SCHEMA_MISMATCH:${sheet}`);
  return result;
}
function text(row: unknown[], columns: Map<string, number>, header: string) { return String(row[columns.get(header)!] ?? ""); }
function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function requiredArg(name: string) { const index = process.argv.indexOf(name); const value = index >= 0 ? process.argv[index + 1] : ""; if (!value) throw new Error(`MISSING_ARGUMENT_${name.replace(/^-+/u, "").toUpperCase()}`); return value; }
function requiredSpreadsheetId() { const value = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim(); if (!value) throw new Error("GOOGLE_SHEETS_SPREADSHEET_ID_MISSING"); return value; }

void main().catch((error: unknown) => {
  const value = error instanceof Error ? error.message : "DAILY69_SHEETS_SNAPSHOT_FAILED";
  process.stderr.write(`${JSON.stringify({ event: "daily69_sheets_live_sanitized_snapshot_failed", safeError: /^[A-Z0-9_:가-힣-]+$/u.test(value) ? value : "DAILY69_SHEETS_SNAPSHOT_FAILED", writes: 0, SAFE_TO_UPLOAD: false })}\n`);
  process.exitCode = 1;
});
