import { createHash } from "node:crypto";
import type {
  SheetsGateway,
  SheetUserEnteredCell,
  UserEnteredSheetsGateway,
} from "@/lib/google-sheets/googleSheetsClient";
import { COMMAND_HEADERS, QUEUE_HEADERS, SHEET_NAMES, assertHeaders, rowValue, type SheetRow } from "@/lib/google-sheets/sheetSchemas";
import {
  QUEUE_PROJECTION_EXTRA_HEADERS,
  RESERVE_HEADERS,
  RESERVE_SHEET_NAME,
  SYNC_HEADERS,
  SYNC_SHEET_NAME,
} from "./contracts";
import type { ProjectionSheetDiff } from "./projection";
import { readCompleteSheetUserEntered, readCompleteSheetValues } from "@/lib/google-sheets/completeSheetRead";

const QUEUE_CUTOVER_HEADERS = [...QUEUE_HEADERS, ...QUEUE_PROJECTION_EXTRA_HEADERS] as const;
const CUTOVER_RANGES = {
  [SHEET_NAMES.commands]: "A1:O1000",
} as const;

type FingerprintedRow = { rowNumber: number; rowHash: string };
type CutoverSheetsGateway = SheetsGateway & UserEnteredSheetsGateway;

export type CellSemanticFingerprint = {
  kind: SheetUserEnteredCell["kind"];
  valueHash: string;
};
export type QueueCutoverFingerprint = FingerprintedRow & {
  namespace: string;
  queueIdHash: string;
  slotId: string;
  queueDate: string;
  queueRank: number;
  status: string;
};
export type ReserveCutoverFingerprint = FingerprintedRow & {
  namespace: string;
  productKeyHash: string;
};
export type SyncCutoverFingerprint = FingerprintedRow & {
  namespace: string;
  revision: number;
  snapshotHash: string;
};

export type PreCutoverSheetBaselineV1 = {
  schemaVersion: "daily69-sheets-pre-cutover-baseline-v1";
  capturedAt: string;
  queue: QueueCutoverFingerprint[];
  reserve: ReserveCutoverFingerprint[];
  sync: SyncCutoverFingerprint[];
  aggregateHash: string;
  rawValuesStored: false;
  credentialIdentifiersStored: false;
  SAFE_TO_UPLOAD: false;
};

export type PreCutoverSheetBaselineV2 = {
  schemaVersion: "daily69-sheets-pre-cutover-baseline-v2";
  fingerprintMode: "USER_ENTERED_VALUE";
  capturedAt: string;
  queue: QueueCutoverFingerprint[];
  reserve: ReserveCutoverFingerprint[];
  sync: SyncCutoverFingerprint[];
  headerHashes?: { queue: string; reserve: string; sync: string };
  aggregateHash: string;
  rawValuesStored: false;
  formulaTextStored: false;
  effectiveValuesStored: false;
  formattedValuesStored: false;
  credentialIdentifiersStored: false;
  SAFE_TO_UPLOAD: false;
};

export type PreCutoverSheetBaseline = PreCutoverSheetBaselineV1 | PreCutoverSheetBaselineV2;

export async function capturePreCutoverSheetBaseline(gateway: CutoverSheetsGateway, now = new Date()): Promise<PreCutoverSheetBaselineV2> {
  const [queueRows, reserveRows, syncRows] = await Promise.all([
    semanticRows(gateway, SHEET_NAMES.queue),
    semanticRows(gateway, RESERVE_SHEET_NAME),
    semanticRows(gateway, SYNC_SHEET_NAME),
  ]);
  const queueValues = semanticRowsToValues(queueRows);
  const reserveValues = semanticRowsToValues(reserveRows);
  const syncValues = semanticRowsToValues(syncRows);
  const queueColumns = assertHeaders(queueValues[0] ?? [], QUEUE_CUTOVER_HEADERS, SHEET_NAMES.queue);
  const reserveColumns = assertHeaders(reserveValues[0] ?? [], RESERVE_HEADERS, RESERVE_SHEET_NAME);
  const syncColumns = assertHeaders(syncValues[0] ?? [], SYNC_HEADERS, SYNC_SHEET_NAME);
  const queue = queueRows.slice(1).map((row, index) => ({
    rowNumber: index + 2,
    namespace: rowValue(queueValues[index + 1] ?? [], queueColumns, "Namespace"),
    queueIdHash: hash(rowValue(queueValues[index + 1] ?? [], queueColumns, "Queue ID")),
    slotId: rowValue(queueValues[index + 1] ?? [], queueColumns, "Slot ID"),
    queueDate: rowValue(queueValues[index + 1] ?? [], queueColumns, "Queue Date"),
    queueRank: Number(rowValue(queueValues[index + 1] ?? [], queueColumns, "Queue Rank") || 0),
    status: rowValue(queueValues[index + 1] ?? [], queueColumns, "진행상태"),
    rowHash: hashSemanticRow(row, queueRows[0]?.length ?? 0),
  }));
  const reserve = reserveRows.slice(1).map((row, index) => ({
    rowNumber: index + 2,
    namespace: rowValue(reserveValues[index + 1] ?? [], reserveColumns, "Namespace"),
    productKeyHash: rowValue(reserveValues[index + 1] ?? [], reserveColumns, "Product Key Hash"),
    rowHash: hashSemanticRow(row, reserveRows[0]?.length ?? 0),
  }));
  const sync = syncRows.slice(1).map((row, index) => ({
    rowNumber: index + 2,
    namespace: rowValue(syncValues[index + 1] ?? [], syncColumns, "Namespace"),
    revision: Number(rowValue(syncValues[index + 1] ?? [], syncColumns, "Projection Revision") || 0),
    snapshotHash: rowValue(syncValues[index + 1] ?? [], syncColumns, "Snapshot Hash"),
    rowHash: hashSemanticRow(row, syncRows[0]?.length ?? 0),
  }));
  const headerHashes = { queue: hashSemanticRow(queueRows[0], queueRows[0].length), reserve: hashSemanticRow(reserveRows[0], reserveRows[0].length), sync: hashSemanticRow(syncRows[0], syncRows[0].length) };
  return {
    schemaVersion: "daily69-sheets-pre-cutover-baseline-v2",
    fingerprintMode: "USER_ENTERED_VALUE",
    capturedAt: now.toISOString(),
    queue,
    reserve,
    sync,
    headerHashes,
    aggregateHash: aggregateFingerprintHashV2({ queue, reserve, sync, headerHashes }),
    rawValuesStored: false,
    formulaTextStored: false,
    effectiveValuesStored: false,
    formattedValuesStored: false,
    credentialIdentifiersStored: false,
    SAFE_TO_UPLOAD: false,
  };
}

export async function verifyPreexistingRowsUnchanged(gateway: CutoverSheetsGateway, baseline: PreCutoverSheetBaseline) {
  const fingerprintMode = baseline.schemaVersion === "daily69-sheets-pre-cutover-baseline-v2"
    ? "USER_ENTERED_VALUE" as const
    : "FORMATTED_VALUE" as const;
  if (baseline.schemaVersion === "daily69-sheets-pre-cutover-baseline-v2") {
    if (baseline.fingerprintMode !== "USER_ENTERED_VALUE") throw new Error("CUTOVER_BASELINE_FINGERPRINT_MODE_INVALID");
    if (aggregateFingerprintHashV2(baseline) !== baseline.aggregateHash) throw new Error("CUTOVER_BASELINE_HASH_INVALID");
  } else if (baseline.schemaVersion === "daily69-sheets-pre-cutover-baseline-v1") {
    if (aggregateFingerprintHashV1(baseline) !== baseline.aggregateHash) throw new Error("CUTOVER_BASELINE_HASH_INVALID");
  } else throw new Error("CUTOVER_BASELINE_SCHEMA_INVALID");
  let currentHashes: { queue: string[]; reserve: string[]; sync: string[] };
  let headersUnchanged = true;
  if (baseline.schemaVersion === "daily69-sheets-pre-cutover-baseline-v2") {
    const [queueRows, reserveRows, syncRows] = await Promise.all([
      semanticRows(gateway, SHEET_NAMES.queue),
      semanticRows(gateway, RESERVE_SHEET_NAME),
      semanticRows(gateway, SYNC_SHEET_NAME),
    ]);
    currentHashes = { queue: semanticRowHashes(queueRows), reserve: semanticRowHashes(reserveRows), sync: semanticRowHashes(syncRows) };
    if (baseline.headerHashes) headersUnchanged = Object.entries({ queue: queueRows, reserve: reserveRows, sync: syncRows }).every(([key, rows]) => hashSemanticRow(rows[0] ?? [], rows[0]?.length ?? 0) === baseline.headerHashes![key as keyof typeof baseline.headerHashes]);
  } else {
    const [queueRows, reserveRows, syncRows] = await Promise.all([
      formattedRows(gateway, SHEET_NAMES.queue),
      formattedRows(gateway, RESERVE_SHEET_NAME),
      formattedRows(gateway, SYNC_SHEET_NAME),
    ]);
    currentHashes = { queue: formattedRowHashes(queueRows), reserve: formattedRowHashes(reserveRows), sync: formattedRowHashes(syncRows) };
  }
  const queue = compareRowHashes(currentHashes.queue, baseline.queue);
  const reserve = compareRowHashes(currentHashes.reserve, baseline.reserve);
  const sync = compareRowHashes(currentHashes.sync, baseline.sync);
  return {
    fingerprintMode,
    headersUnchanged,
    queue,
    reserve,
    sync,
    existingRowsChanged: queue.changed + reserve.changed + sync.changed,
    existingRowsDeleted: queue.deleted + reserve.deleted + sync.deleted,
    existingRowsReorderedByUs: queue.reordered + reserve.reordered + sync.reordered,
    pass: headersUnchanged && [queue, reserve, sync].every((result) => result.changed === 0 && result.deleted === 0 && result.reordered === 0),
  };
}

export function assertFreshCutoverProjectionPlan(diff: Record<string, ProjectionSheetDiff>) {
  const expected: Record<string, { updates: number; appends: number }> = {
    [SHEET_NAMES.commands]: { updates: 0, appends: 0 },
    [SHEET_NAMES.queue]: { updates: 0, appends: 69 },
    [RESERVE_SHEET_NAME]: { updates: 0, appends: 14 },
    [SYNC_SHEET_NAME]: { updates: 0, appends: 1 },
  };
  for (const [sheetName, counts] of Object.entries(expected)) {
    const plan = diff[sheetName];
    if (!plan
      || plan.rowsToUpdate !== counts.updates
      || plan.rowsToAppend !== counts.appends
      || plan.unrelatedRowsWouldChange !== 0
      || plan.headerWriteRequired) {
      throw new Error(`CUTOVER_WOULD_MUTATE_EXISTING_ROWS:${sheetName}`);
    }
  }
  return diff;
}

export async function verifyFreshNamespaceRows(gateway: SheetsGateway, namespace: string) {
  const [queueRows, reserveRows, syncRows] = await Promise.all([
    formattedRows(gateway, SHEET_NAMES.queue),
    formattedRows(gateway, RESERVE_SHEET_NAME),
    formattedRows(gateway, SYNC_SHEET_NAME),
  ]);
  const queueColumns = assertHeaders(queueRows[0] ?? [], QUEUE_CUTOVER_HEADERS, SHEET_NAMES.queue);
  const reserveColumns = assertHeaders(reserveRows[0] ?? [], RESERVE_HEADERS, RESERVE_SHEET_NAME);
  const syncColumns = assertHeaders(syncRows[0] ?? [], SYNC_HEADERS, SYNC_SHEET_NAME);
  const queue = queueRows.slice(1).filter((row) => rowValue(row, queueColumns, "Namespace") === namespace);
  const reserve = reserveRows.slice(1).filter((row) => rowValue(row, reserveColumns, "Namespace") === namespace);
  const sync = syncRows.slice(1).filter((row) => rowValue(row, syncColumns, "Namespace") === namespace);
  const queueKeys = queue.map((row) => JSON.stringify([namespace, rowValue(row, queueColumns, "Queue ID")]));
  const reserveKeys = reserve.map((row) => JSON.stringify([namespace, rowValue(row, reserveColumns, "Product Key Hash")]));
  const duplicateQueueIdentities = queueKeys.length - new Set(queueKeys).size;
  const duplicateReserveIdentities = reserveKeys.length - new Set(reserveKeys).size;
  const pass = queue.length === 69 && reserve.length === 14 && sync.length === 1 && duplicateQueueIdentities === 0 && duplicateReserveIdentities === 0;
  return { queue: queue.length, reserve: reserve.length, sync: sync.length, duplicateQueueIdentities, duplicateReserveIdentities, pass };
}

function compareRowHashes(currentHashes: string[], baseline: FingerprintedRow[]) {
  let changed = 0;
  let deleted = 0;
  let reordered = 0;
  for (const entry of baseline) {
    const currentIndex = entry.rowNumber - 2;
    if (currentIndex >= currentHashes.length) { deleted += 1; continue; }
    if (currentHashes[currentIndex] === entry.rowHash) continue;
    if (currentHashes.includes(entry.rowHash)) reordered += 1;
    else changed += 1;
  }
  return { baselineRows: baseline.length, changed, deleted, reordered };
}

function formattedRowHashes(rows: SheetRow[]) {
  const width = rows[0]?.length ?? 0;
  return rows.slice(1).map((row) => hashCanonicalRow(row, width));
}
function semanticRowHashes(rows: SheetUserEnteredCell[][]) {
  const width = rows[0]?.length ?? 0;
  return rows.slice(1).map((row) => hashSemanticRow(row, width));
}
function hashCanonicalRow(row: SheetRow, width: number) {
  return hash(JSON.stringify(Array.from({ length: width }, (_, index) => row[index] ?? "")));
}
function hashSemanticRow(row: SheetUserEnteredCell[], width: number) {
  return hash(JSON.stringify(Array.from({ length: width }, (_, index) => semanticFingerprint(row[index] ?? { kind: "blank" }))));
}
function semanticFingerprint(cell: SheetUserEnteredCell): CellSemanticFingerprint {
  if (cell.kind === "blank") return { kind: "blank", valueHash: hash("blank") };
  return { kind: cell.kind, valueHash: hash(`${cell.kind}\0${JSON.stringify(cell.value)}`) };
}
function semanticRowsToValues(rows: SheetUserEnteredCell[][]): SheetRow[] {
  return rows.map((row) => row.map((cell) => cell.kind === "blank" || cell.kind === "formula" ? "" : cell.value));
}
function aggregateFingerprintHashV1(value: Pick<PreCutoverSheetBaselineV1, "queue" | "reserve" | "sync">) {
  return hash(JSON.stringify({ queue: value.queue, reserve: value.reserve, sync: value.sync }));
}
function aggregateFingerprintHashV2(value: Pick<PreCutoverSheetBaselineV2, "queue" | "reserve" | "sync" | "headerHashes">) {
  return hash(JSON.stringify({ fingerprintMode: "USER_ENTERED_VALUE", queue: value.queue, reserve: value.reserve, sync: value.sync, ...(value.headerHashes ? { headerHashes: value.headerHashes } : {}) }));
}
function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
async function semanticRows(gateway: SheetsGateway, sheetName: string) { return (await readCompleteSheetUserEntered(gateway, sheetName)).rows; }
async function formattedRows(gateway: SheetsGateway, sheetName: string) { return (await readCompleteSheetValues(gateway, sheetName)).rows; }

export const CUTOVER_SHEET_RANGES = CUTOVER_RANGES;
export const CUTOVER_COMMAND_HEADERS = COMMAND_HEADERS;
