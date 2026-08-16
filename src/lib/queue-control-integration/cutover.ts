import { createHash } from "node:crypto";
import type { SheetsGateway } from "@/lib/google-sheets/googleSheetsClient";
import { COMMAND_HEADERS, QUEUE_HEADERS, SHEET_NAMES, assertHeaders, rowValue, type SheetRow } from "@/lib/google-sheets/sheetSchemas";
import {
  QUEUE_PROJECTION_EXTRA_HEADERS,
  RESERVE_HEADERS,
  RESERVE_SHEET_NAME,
  SYNC_HEADERS,
  SYNC_SHEET_NAME,
} from "./contracts";
import type { ProjectionSheetDiff } from "./projection";

const QUEUE_CUTOVER_HEADERS = [...QUEUE_HEADERS, ...QUEUE_PROJECTION_EXTRA_HEADERS] as const;
const CUTOVER_RANGES = {
  [SHEET_NAMES.commands]: "A1:O1000",
  [SHEET_NAMES.queue]: "A1:AH1000",
  [RESERVE_SHEET_NAME]: "A1:L1000",
  [SYNC_SHEET_NAME]: "A1:L100",
} as const;

type FingerprintedRow = { rowNumber: number; rowHash: string };
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

export type PreCutoverSheetBaseline = {
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

export async function capturePreCutoverSheetBaseline(gateway: SheetsGateway, now = new Date()): Promise<PreCutoverSheetBaseline> {
  const [queueRows, reserveRows, syncRows] = await Promise.all([
    gateway.getValues(SHEET_NAMES.queue, CUTOVER_RANGES[SHEET_NAMES.queue]),
    gateway.getValues(RESERVE_SHEET_NAME, CUTOVER_RANGES[RESERVE_SHEET_NAME]),
    gateway.getValues(SYNC_SHEET_NAME, CUTOVER_RANGES[SYNC_SHEET_NAME]),
  ]);
  const queueColumns = assertHeaders(queueRows[0] ?? [], QUEUE_CUTOVER_HEADERS, SHEET_NAMES.queue);
  const reserveColumns = assertHeaders(reserveRows[0] ?? [], RESERVE_HEADERS, RESERVE_SHEET_NAME);
  const syncColumns = assertHeaders(syncRows[0] ?? [], SYNC_HEADERS, SYNC_SHEET_NAME);
  const queue = queueRows.slice(1).map((row, index) => ({
    rowNumber: index + 2,
    namespace: rowValue(row, queueColumns, "Namespace"),
    queueIdHash: hash(rowValue(row, queueColumns, "Queue ID")),
    slotId: rowValue(row, queueColumns, "Slot ID"),
    queueDate: rowValue(row, queueColumns, "Queue Date"),
    queueRank: Number(rowValue(row, queueColumns, "Queue Rank") || 0),
    status: rowValue(row, queueColumns, "진행상태"),
    rowHash: hashCanonicalRow(row, queueRows[0]?.length ?? 0),
  }));
  const reserve = reserveRows.slice(1).map((row, index) => ({
    rowNumber: index + 2,
    namespace: rowValue(row, reserveColumns, "Namespace"),
    productKeyHash: rowValue(row, reserveColumns, "Product Key Hash"),
    rowHash: hashCanonicalRow(row, reserveRows[0]?.length ?? 0),
  }));
  const sync = syncRows.slice(1).map((row, index) => ({
    rowNumber: index + 2,
    namespace: rowValue(row, syncColumns, "Namespace"),
    revision: Number(rowValue(row, syncColumns, "Projection Revision") || 0),
    snapshotHash: rowValue(row, syncColumns, "Snapshot Hash"),
    rowHash: hashCanonicalRow(row, syncRows[0]?.length ?? 0),
  }));
  return {
    schemaVersion: "daily69-sheets-pre-cutover-baseline-v1",
    capturedAt: now.toISOString(),
    queue,
    reserve,
    sync,
    aggregateHash: aggregateFingerprintHash({ queue, reserve, sync }),
    rawValuesStored: false,
    credentialIdentifiersStored: false,
    SAFE_TO_UPLOAD: false,
  };
}

export async function verifyPreexistingRowsUnchanged(gateway: SheetsGateway, baseline: PreCutoverSheetBaseline) {
  if (baseline.schemaVersion !== "daily69-sheets-pre-cutover-baseline-v1") throw new Error("CUTOVER_BASELINE_SCHEMA_INVALID");
  if (aggregateFingerprintHash(baseline) !== baseline.aggregateHash) throw new Error("CUTOVER_BASELINE_HASH_INVALID");
  const [queueRows, reserveRows, syncRows] = await Promise.all([
    gateway.getValues(SHEET_NAMES.queue, CUTOVER_RANGES[SHEET_NAMES.queue]),
    gateway.getValues(RESERVE_SHEET_NAME, CUTOVER_RANGES[RESERVE_SHEET_NAME]),
    gateway.getValues(SYNC_SHEET_NAME, CUTOVER_RANGES[SYNC_SHEET_NAME]),
  ]);
  const queue = compareRows(queueRows, baseline.queue);
  const reserve = compareRows(reserveRows, baseline.reserve);
  const sync = compareRows(syncRows, baseline.sync);
  return {
    queue,
    reserve,
    sync,
    existingRowsChanged: queue.changed + reserve.changed + sync.changed,
    existingRowsDeleted: queue.deleted + reserve.deleted + sync.deleted,
    existingRowsReorderedByUs: queue.reordered + reserve.reordered + sync.reordered,
    pass: [queue, reserve, sync].every((result) => result.changed === 0 && result.deleted === 0 && result.reordered === 0),
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
    gateway.getValues(SHEET_NAMES.queue, CUTOVER_RANGES[SHEET_NAMES.queue]),
    gateway.getValues(RESERVE_SHEET_NAME, CUTOVER_RANGES[RESERVE_SHEET_NAME]),
    gateway.getValues(SYNC_SHEET_NAME, CUTOVER_RANGES[SYNC_SHEET_NAME]),
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

function compareRows(rows: SheetRow[], baseline: FingerprintedRow[]) {
  const width = rows[0]?.length ?? 0;
  const currentHashes = rows.slice(1).map((row) => hashCanonicalRow(row, width));
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

function hashCanonicalRow(row: SheetRow, width: number) {
  return hash(JSON.stringify(Array.from({ length: width }, (_, index) => row[index] ?? "")));
}
function aggregateFingerprintHash(value: Pick<PreCutoverSheetBaseline, "queue" | "reserve" | "sync">) {
  return hash(JSON.stringify({ queue: value.queue, reserve: value.reserve, sync: value.sync }));
}
function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }

export const CUTOVER_SHEET_RANGES = CUTOVER_RANGES;
export const CUTOVER_COMMAND_HEADERS = COMMAND_HEADERS;
