import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { atomicWriteJson } from "../../src/lib/queue-scheduler/atomicJson";
import { NoUploadGoogleSheetsClient } from "../../src/lib/queue-control-integration";
import { SHEET_NAMES } from "../../src/lib/google-sheets/sheetSchemas";
import { COMPLETE_SHEET_COLUMNS, readCompleteSheetValues } from "../../src/lib/google-sheets/completeSheetRead";
import { RESERVE_SHEET_NAME, SYNC_SHEET_NAME } from "../../src/lib/queue-control-integration/contracts";

async function main() {
  const root = resolve(requiredEnv("QUEUE_SCHEDULER_ROOT"));
  const label = optionalArg("--label") || "snapshot";
  if (!/^[a-z0-9-]{1,40}$/u.test(label)) throw new Error("SHEETS_SNAPSHOT_LABEL_INVALID");
  const client = new NoUploadGoogleSheetsClient();
  const metadata = await client.metadata();
  const names = (metadata.sheets ?? []).map((sheet) => sheet.properties?.title).filter((value): value is string => Boolean(value));
  const baseSheets = [SHEET_NAMES.dashboard, SHEET_NAMES.queue, SHEET_NAMES.settings, SHEET_NAMES.guide, SHEET_NAMES.commands, SHEET_NAMES.logs];
  if (baseSheets.some((name) => !names.includes(name))) throw new Error("GOOGLE_SHEETS_SCHEMA_MISMATCH");
  const ranges = new Map<string, string>([
    [SHEET_NAMES.dashboard, "A1:Z500"], [SHEET_NAMES.settings, "A1:Z500"],
    [SHEET_NAMES.guide, "A1:Z500"], [SHEET_NAMES.commands, "A1:O1000"], [SHEET_NAMES.logs, "A1:Z2000"]
  ]);
  const sheets = [];
  for (const name of [...baseSheets, ...[RESERVE_SHEET_NAME, SYNC_SHEET_NAME].filter((sheetName) => names.includes(sheetName))]) {
    const rows = COMPLETE_SHEET_COLUMNS[name] ? (await readCompleteSheetValues(client, name)).rows : await client.getValues(name, ranges.get(name)!);
    sheets.push({ name, headers: (rows[0] ?? []).map(String), rowCount: Math.max(0, rows.length - 1), sanitizedHash: hash(JSON.stringify(rows)) });
  }
  await atomicWriteJson(resolve(root, `${label}-sheets-snapshot.json`), { schemaVersion: "daily69-first-operation-sheets-snapshot-v1", label, worksheetNames: names, baseWorksheetCount: 6, sheets, credentialIdentifiersStored: false, rawValuesStored: false, driveCalls: 0, SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 });
  process.stdout.write(`${JSON.stringify({ event: "daily69_first_operation_sheets_snapshot", label, worksheetCount: names.length, baseWorksheetCount: 6, snapshots: sheets.length, rawValuesStored: false, driveCalls: 0, SAFE_TO_UPLOAD: false })}\n`);
}

function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function optionalArg(name: string) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] ?? "" : ""; }
function requiredEnv(name: string) { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name}_MISSING`); return value; }
function safeError(error: unknown) { const value = error instanceof Error ? error.message : String(error); return /^[A-Z0-9_:-]+$/u.test(value) ? value : "SHEETS_SNAPSHOT_FAILED"; }
void main().catch((error: unknown) => { process.stderr.write(`${JSON.stringify({ event: "daily69_first_operation_sheets_snapshot_failed", safeError: safeError(error), driveCalls: 0, SAFE_TO_UPLOAD: false })}\n`); process.exitCode = 1; });
