import { describe, expect, it } from "vitest";
import {
  assertFreshAttemptCutover,
  assertFreshCutoverProjectionPlan,
  capturePreCutoverSheetBaseline,
  projectionNamespaceRegistryEntry,
  QUEUE_PROJECTION_EXTRA_HEADERS,
  RESERVE_HEADERS,
  RESERVE_SHEET_NAME,
  SYNC_HEADERS,
  SYNC_SHEET_NAME,
  verifyFreshNamespaceRows,
  verifyPreexistingRowsUnchanged,
  type ProjectionSheetDiff,
} from "../../src/lib/queue-control-integration";
import { COMMAND_HEADERS, QUEUE_HEADERS, SHEET_NAMES, type SheetRow } from "../../src/lib/google-sheets/sheetSchemas";
import { MemorySheetsGateway } from "../helpers/googleSheetsControl";

describe("Daily69 Sheets quarantine cutover", () => {
  it("classifies the held attempt without classifying canonical local history as corrupt", () => {
    expect(projectionNamespaceRegistryEntry("operation-2026-08-17")).toMatchObject({
      localOperationDisposition: "held_attempt",
      sheetProjectionDisposition: "quarantined_legacy_projection",
    });
    expect(projectionNamespaceRegistryEntry("operation-2026-08-11")).toBeNull();
    expect(assertFreshAttemptCutover({
      namespace: "operation-2026-08-17-attempt-2",
      operationDate: "2026-08-17",
      attemptNumber: 2,
      previousAttemptNamespace: "operation-2026-08-17",
    })).toMatchObject({ namespace: "operation-2026-08-17" });
  });

  it("stores sanitized fingerprints and proves preexisting rows remain unchanged after appends", async () => {
    const gateway = cutoverGateway();
    const baseline = await capturePreCutoverSheetBaseline(gateway, new Date("2026-08-16T00:00:00.000Z"));
    expect(baseline).toMatchObject({ rawValuesStored: false, credentialIdentifiersStored: false, SAFE_TO_UPLOAD: false });
    expect(JSON.stringify(baseline)).not.toContain("queue-secret-id");
    expect(baseline.queue[0].queueIdHash).toMatch(/^[a-f0-9]{64}$/u);

    gateway.sheets.get(SHEET_NAMES.queue)!.push(queueRow("new-queue", "slot-010", "operation-2026-08-17-attempt-2", 10));
    gateway.sheets.get(RESERVE_SHEET_NAME)!.push(reserveRow("new-product-hash", "operation-2026-08-17-attempt-2"));
    gateway.sheets.get(SYNC_SHEET_NAME)!.push(syncRow("operation-2026-08-17-attempt-2"));
    await expect(verifyPreexistingRowsUnchanged(gateway, baseline)).resolves.toMatchObject({
      pass: true,
      existingRowsChanged: 0,
      existingRowsDeleted: 0,
      existingRowsReorderedByUs: 0,
    });

    gateway.sheets.get(SHEET_NAMES.queue)![1][3] = "failed";
    await expect(verifyPreexistingRowsUnchanged(gateway, baseline)).resolves.toMatchObject({ pass: false, existingRowsChanged: 1 });
  });

  it("requires an exact append-only projection plan", () => {
    const plan = exactPlan();
    expect(assertFreshCutoverProjectionPlan(plan)).toBe(plan);
    expect(() => assertFreshCutoverProjectionPlan({
      ...plan,
      [SHEET_NAMES.queue]: { ...plan[SHEET_NAMES.queue], rowsToUpdate: 1, rowsToAppend: 68 },
    })).toThrow(`CUTOVER_WOULD_MUTATE_EXISTING_ROWS:${SHEET_NAMES.queue}`);
  });

  it("requires exactly 69 Queue, 14 Reserve, one Sync, and unique tuple identities", async () => {
    const gateway = cutoverGateway();
    const namespace = "operation-2026-08-17-attempt-2";
    for (let index = 1; index <= 69; index += 1) gateway.sheets.get(SHEET_NAMES.queue)!.push(queueRow(`queue-${index}`, `slot-${String(index).padStart(3, "0")}`, namespace, index));
    for (let index = 1; index <= 14; index += 1) gateway.sheets.get(RESERVE_SHEET_NAME)!.push(reserveRow(`product-${index}`, namespace));
    gateway.sheets.get(SYNC_SHEET_NAME)!.push(syncRow(namespace));
    await expect(verifyFreshNamespaceRows(gateway, namespace)).resolves.toEqual({
      queue: 69,
      reserve: 14,
      sync: 1,
      duplicateQueueIdentities: 0,
      duplicateReserveIdentities: 0,
      pass: true,
    });
  });
});

function cutoverGateway() {
  const gateway = new MemorySheetsGateway();
  gateway.sheets.set(SHEET_NAMES.commands, [[...COMMAND_HEADERS]]);
  gateway.sheets.set(SHEET_NAMES.queue, [[...QUEUE_HEADERS, ...QUEUE_PROJECTION_EXTRA_HEADERS], queueRow("queue-secret-id", "slot-001", "operation-2026-08-11", 1)]);
  gateway.sheets.set(RESERVE_SHEET_NAME, [[...RESERVE_HEADERS], reserveRow("legacy-product-hash", "operation-2026-08-17")]);
  gateway.sheets.set(SYNC_SHEET_NAME, [[...SYNC_HEADERS], syncRow("operation-2026-08-17")]);
  return gateway;
}
function queueRow(queueId: string, slotId: string, namespace: string, rank: number): SheetRow {
  const row = Array.from({ length: QUEUE_HEADERS.length + QUEUE_PROJECTION_EXTRA_HEADERS.length }, () => "") as SheetRow;
  row[0] = queueId;
  row[1] = "2026-08-17";
  row[3] = "scheduled";
  row[20] = slotId;
  row[22] = "2026-08-17";
  row[23] = rank;
  row[row.length - 1] = namespace;
  return row;
}
function reserveRow(productKeyHash: string, namespace: string): SheetRow {
  return ["2026-08-17", 1, "product", "use", "category", 90, productKeyHash, "", "", "2026-08-16", 1, namespace];
}
function syncRow(namespace: string): SheetRow {
  return [namespace, "local_queue_scheduler", 1, 1, "snapshot-hash", "2026-08-16T00:00:00.000Z", 69, 14, false, true, false, "completed"];
}
function exactPlan(): Record<string, ProjectionSheetDiff> {
  const value = (rowsToAppend: number): ProjectionSheetDiff => ({ rowsToUpdate: 0, rowsToAppend, rowsUnrelated: 1, unrelatedRowsWouldChange: 0, headerWriteRequired: false });
  return {
    [SHEET_NAMES.commands]: value(0),
    [SHEET_NAMES.queue]: value(69),
    [RESERVE_SHEET_NAME]: value(14),
    [SYNC_SHEET_NAME]: value(1),
  };
}
