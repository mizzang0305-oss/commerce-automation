import { createHash } from "node:crypto";
import { basename } from "node:path";
import type { SheetsGateway } from "@/lib/google-sheets/googleSheetsClient";
import { COMMAND_HEADERS, QUEUE_HEADERS, SHEET_NAMES, assertHeaders, rowValue, type SheetRow } from "@/lib/google-sheets/sheetSchemas";
import { LocalQueueRepository } from "@/lib/queue-scheduler";
import { QUEUE_PROJECTION_EXTRA_HEADERS, RESERVE_HEADERS, RESERVE_SHEET_NAME, SYNC_HEADERS, SYNC_SHEET_NAME, type QueueProjectionSnapshot } from "./contracts";
import { projectionIdentity } from "./projectionIdentity";
import { COMPLETE_SHEET_COLUMNS, assertCompleteSheetAppendCapacity, completeSheetSemanticHash, readCompleteSheetUserEntered } from "@/lib/google-sheets/completeSheetRead";

const QUEUE_PROJECTION_HEADERS = [...QUEUE_HEADERS, ...QUEUE_PROJECTION_EXTRA_HEADERS] as const;

export class QueueProjectionService {
  constructor(private readonly gateway: SheetsGateway, private readonly repository: LocalQueueRepository, readonly namespace: string) {
    projectionIdentity(namespace, "namespace-validation");
  }

  async snapshot(): Promise<QueueProjectionSnapshot> {
    const [settings, items, reserve, state] = await Promise.all([
      this.repository.settings(), this.repository.items(), this.repository.reserveCandidates(), this.repository.controlState()
    ]);
    return { namespace: this.namespace, settings, items, reserve, state };
  }

  async project() {
    const prepared = await this.buildProjectionPlan();
    const unsafe = prepared.plans.find((plan) => plan.diff.unrelatedRowsWouldChange !== 0);
    if (unsafe) throw new Error(`SHEETS_PROJECTION_UNRELATED_ROWS_WOULD_CHANGE:${unsafe.sheetName}`);
    await this.revalidateAllPlans(prepared.plans);
    for (const plan of prepared.plans) await this.applyPlan(plan);
    const state = await this.repository.recordProjection({ localRevision: prepared.localRevision, snapshotHash: prepared.snapshotHash, projectedAt: prepared.projectedAt });
    return {
      state,
      queueCount: prepared.queueCount,
      reserveCount: prepared.reserveCount,
      snapshotHash: prepared.snapshotHash,
      projectedAt: prepared.projectedAt,
      diff: projectionDiff(prepared.plans),
    };
  }

  async projectAppendOnly() {
    const prepared = await this.buildProjectionPlan();
    const unsafe = prepared.plans.find((plan) => plan.diff.unrelatedRowsWouldChange !== 0);
    if (unsafe) throw new Error(`SHEETS_PROJECTION_UNRELATED_ROWS_WOULD_CHANGE:${unsafe.sheetName}`);
    const existingMutation = prepared.plans.find((plan) => plan.headerWriteRequired || plan.updates.length > 0);
    if (existingMutation) throw new Error(`CUTOVER_WOULD_MUTATE_EXISTING_ROWS:${existingMutation.sheetName}`);
    await this.revalidateAllPlans(prepared.plans);
    for (const plan of prepared.plans) await this.applyPlan(plan);
    const state = await this.repository.recordProjection({ localRevision: prepared.localRevision, snapshotHash: prepared.snapshotHash, projectedAt: prepared.projectedAt });
    return {
      state,
      queueCount: prepared.queueCount,
      reserveCount: prepared.reserveCount,
      snapshotHash: prepared.snapshotHash,
      projectedAt: prepared.projectedAt,
      diff: projectionDiff(prepared.plans),
    };
  }

  async planProjectionDiff() {
    const prepared = await this.buildProjectionPlan();
    return projectionDiff(prepared.plans);
  }

  private async buildProjectionPlan() {
    const snapshot = await this.snapshot();
    const localRevision = snapshot.state.localRevision;
    const queueRows = snapshot.items.map((item) => queueRow(item, localRevision, this.namespace));
    const reserveRows = snapshot.reserve.map((item, index) => reserveRow(item, index + 1, localRevision, this.namespace));
    const snapshotHash = hashRows([queueRows, reserveRows, [[snapshot.settings.enabled, snapshot.settings.isPaused, snapshot.settings.uploadEnabled]]]);
    const projectedAt = new Date().toISOString();
    const syncRow: SheetRow = [this.namespace, "local_queue_scheduler", localRevision, localRevision, snapshotHash, projectedAt, snapshot.items.length, snapshot.reserve.length, snapshot.settings.isPaused, snapshot.settings.enabled, false, "completed"];
    const plans = await Promise.all([
      this.planRows(SHEET_NAMES.commands, "A1:O1000", COMMAND_HEADERS, [], (row, columns) => rowValue(row, columns, "명령 ID")),
      this.planRows(SHEET_NAMES.queue, "", QUEUE_PROJECTION_HEADERS, queueRows, (row, columns) => projectionIdentity(rowValue(row, columns, "Namespace"), rowValue(row, columns, "Queue ID"))),
      this.planRows(RESERVE_SHEET_NAME, "", RESERVE_HEADERS, reserveRows, (row, columns) => projectionIdentity(rowValue(row, columns, "Namespace"), rowValue(row, columns, "Product Key Hash"))),
      this.planRows(SYNC_SHEET_NAME, "", SYNC_HEADERS, [syncRow], (row, columns) => rowValue(row, columns, "Namespace")),
    ]);
    return { plans, localRevision, snapshotHash, projectedAt, queueCount: queueRows.length, reserveCount: reserveRows.length };
  }

  private async planRows(
    sheetName: string,
    range: string,
    headers: readonly string[],
    incoming: SheetRow[],
    identity: (row: SheetRow, columns: Map<string, number>) => string,
  ): Promise<InternalProjectionPlan> {
    const complete = COMPLETE_SHEET_COLUMNS[sheetName] ? await readCompleteSheetUserEntered(this.gateway, sheetName) : null;
    // Plan from the same user-entered snapshot that is fingerprinted, not a second
    // formatted view whose volatile formula results can drift independently.
    const rows: SheetRow[] = complete ? complete.rows.map((row) => row.map((cell) => cell.kind === "blank" ? "" : cell.value)) : await this.gateway.getValues(sheetName, range);
    const currentHeaders = rows[0] ?? [];
    const missing = headers.filter((header) => !currentHeaders.map(String).includes(header));
    const plannedHeaders = rows.length === 0 ? [...headers] : [...currentHeaders, ...missing];
    if (complete && plannedHeaders.length > complete.columnCount) throw new Error("SHEETS_COMPLETE_COLUMN_SCHEMA_INVALID");
    const columns = assertHeaders(plannedHeaders, headers, sheetName);
    const canonicalHeaders = new Set<string>(headers);
    const existing = new Map<string, number[]>();
    for (const [index, row] of rows.slice(1).entries()) {
      let key = "";
      try { key = identity(row, columns); } catch { key = ""; }
      if (key) existing.set(key, [...(existing.get(key) ?? []), index + 2]);
    }
    const incomingKeys = new Set<string>();
    const updates: Array<{ rowNumber: number; row: SheetRow }> = [];
    const additions: SheetRow[] = [];
    for (const incomingRow of incoming) {
      const aligned = plannedHeaders.map((header) => incomingRow[headers.indexOf(String(header))] ?? "");
      const key = identity(aligned, columns);
      if (incomingKeys.has(key)) throw new Error(`SHEETS_PROJECTION_INCOMING_IDENTITY_DUPLICATE:${sheetName}`);
      incomingKeys.add(key);
      const rowNumbers = existing.get(key) ?? [];
      if (rowNumbers.length > 1) throw new Error(`SHEETS_PROJECTION_EXISTING_IDENTITY_DUPLICATE:${sheetName}`);
      if (rowNumbers[0]) {
        const current = rows[rowNumbers[0] - 1] ?? [];
        const row = plannedHeaders.map((header, index) => canonicalHeaders.has(String(header)) ? aligned[index] : current[index] ?? "");
        updates.push({ rowNumber: rowNumbers[0], row });
      } else additions.push(aligned);
    }
    const unrelatedRows = rows.slice(1).filter((row) => {
      try { return !incomingKeys.has(identity(row, columns)); } catch { return true; }
    }).length;
    if (complete) assertCompleteSheetAppendCapacity({ ...complete, rows }, additions.length);
    return {
      sheetName,
      range,
      headers: plannedHeaders,
      sourceRowsHash: hashRows(rows),
      sourceSemanticHash: complete ? completeSheetSemanticHash(complete) : null,
      headerWriteRequired: rows.length === 0 || missing.length > 0,
      sourceRowCount: rows.length,
      updates,
      additions,
      diff: { rowsToUpdate: updates.length, rowsToAppend: additions.length, rowsUnrelated: unrelatedRows, unrelatedRowsWouldChange: 0, headerWriteRequired: rows.length === 0 || missing.length > 0 },
    };
  }

  private async revalidatePlan(plan: InternalProjectionPlan) {
    if (plan.sourceSemanticHash) {
      const current = await readCompleteSheetUserEntered(this.gateway, plan.sheetName);
      if (completeSheetSemanticHash(current) !== plan.sourceSemanticHash) throw new Error(`SHEETS_PROJECTION_PLAN_STALE:${plan.sheetName}`);
      assertCompleteSheetAppendCapacity(current, plan.additions.length);
    } else if (hashRows(await this.gateway.getValues(plan.sheetName, plan.range)) !== plan.sourceRowsHash) throw new Error(`SHEETS_PROJECTION_PLAN_STALE:${plan.sheetName}`);
  }

  private async revalidateAllPlans(plans: InternalProjectionPlan[]) {
    // A stale later sheet must reject before the first external write, not after Queue.
    for (const plan of plans) await this.revalidatePlan(plan);
  }

  private async applyPlan(plan: InternalProjectionPlan) {
    await this.revalidatePlan(plan);
    if (plan.headerWriteRequired) {
      await this.gateway.updateValues(plan.sheetName, `A1:${columnName(plan.headers.length)}1`, [plan.headers]);
    }
    const orderedUpdates = plan.updates.sort((left, right) => left.rowNumber - right.rowNumber);
    for (let index = 0; index < orderedUpdates.length;) {
      const group = [orderedUpdates[index]];
      index += 1;
      while (index < orderedUpdates.length && orderedUpdates[index].rowNumber === group[group.length - 1].rowNumber + 1) {
        group.push(orderedUpdates[index]);
        index += 1;
      }
      await this.gateway.updateValues(
        plan.sheetName,
        `A${group[0].rowNumber}:${columnName(plan.headers.length)}${group[group.length - 1].rowNumber}`,
        group.map((entry) => entry.row)
      );
    }
    if (plan.additions.length > 0) {
      const startRow = Math.max(plan.sourceRowCount, 1) + 1;
      const endRow = startRow + plan.additions.length - 1;
      await this.gateway.updateValues(plan.sheetName, `A${startRow}:${columnName(plan.headers.length)}${endRow}`, plan.additions);
    }
  }
}

type InternalProjectionPlan = {
  sheetName: string;
  range: string;
  headers: SheetRow;
  sourceRowsHash: string;
  sourceSemanticHash: string | null;
  headerWriteRequired: boolean;
  sourceRowCount: number;
  updates: Array<{ rowNumber: number; row: SheetRow }>;
  additions: SheetRow[];
  diff: ProjectionSheetDiff;
};

export type ProjectionSheetDiff = {
  rowsToUpdate: number;
  rowsToAppend: number;
  rowsUnrelated: number;
  unrelatedRowsWouldChange: 0;
  headerWriteRequired: boolean;
};

function projectionDiff(plans: readonly InternalProjectionPlan[]) {
  return Object.fromEntries(plans.map((plan) => [plan.sheetName, plan.diff])) as Record<string, ProjectionSheetDiff>;
}

function queueRow(item: Awaited<ReturnType<LocalQueueRepository["items"]>>[number], projectionRevision: number, namespace: string): SheetRow {
  const artifactReferenceId = item.videoPath ? `artifact-${hash(`${basename(item.videoPath)}:${item.productKey}`).slice(0, 16)}` : "";
  const safeMediaMetadata = JSON.stringify({ productImageCount: item.candidate.productImageUrls.length, videoReady: Boolean(item.videoPath), reviewReady: Boolean(item.reviewPath) });
  const fallbackCount = Math.max(0, (item.candidateHistory?.length ?? 1) - 1);
  return [
    item.id, item.queueDate, item.scheduledAt, item.status, item.canonicalProductName, item.candidate.categoryPath || item.candidate.category,
    item.candidate.priceText, "", "", `image_count:${item.candidate.productImageUrls.length}`, "", item.status === "video_ready_autoqa" ? "ready_autoqa" : item.status === "video_ready_machine_qa" ? "ready_machine_qa" : "pending",
    item.videoQualityScore ?? "", item.candidate.useCase, item.reviewMetadata.codexReview, item.videoQualityScore === null ? "pending" : item.videoQualityScore >= 80 ? "machine_pass" : "machine_block",
    "NO_UPLOAD", "", item.errorCode || item.safeMessage, item.updatedAt,
    item.slotId, item.localRevision, item.queueDate, item.queueRank, "local_queue_scheduler", projectionRevision,
    artifactReferenceId, safeMediaMetadata, hash(item.productKey), item.leaseOwner ? "leased" : "unleased", Math.max(0, item.attemptCount - 1), fallbackCount, item.updatedAt, namespace
  ];
}

function reserveRow(item: Awaited<ReturnType<LocalQueueRepository["reserveCandidates"]>>[number], rank: number, projectionRevision: number, namespace: string): SheetRow {
  return [item.queueDate ?? "", rank, item.candidate.canonicalProductName, item.candidate.useCase, item.candidate.categoryPath || item.candidate.category,
    item.score.finalProductScore, hash(item.candidate.productKey), item.claimedBySlot, item.claimedAt, item.insertedAt, projectionRevision, namespace];
}
function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function hashRows(value: unknown) { return hash(JSON.stringify(value)); }
function columnName(count: number) { let value = count; let name = ""; while (value > 0) { value -= 1; name = String.fromCharCode(65 + value % 26) + name; value = Math.floor(value / 26); } return name; }
