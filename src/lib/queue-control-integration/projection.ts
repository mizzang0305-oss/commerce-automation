import { createHash } from "node:crypto";
import { basename } from "node:path";
import type { SheetsGateway } from "@/lib/google-sheets/googleSheetsClient";
import { COMMAND_HEADERS, QUEUE_HEADERS, SHEET_NAMES, assertHeaders, rowValue, type SheetRow } from "@/lib/google-sheets/sheetSchemas";
import { LocalQueueRepository } from "@/lib/queue-scheduler";
import { QUEUE_PROJECTION_EXTRA_HEADERS, RESERVE_HEADERS, RESERVE_SHEET_NAME, SYNC_HEADERS, SYNC_SHEET_NAME, type QueueProjectionSnapshot } from "./contracts";

const QUEUE_PROJECTION_HEADERS = [...QUEUE_HEADERS, ...QUEUE_PROJECTION_EXTRA_HEADERS] as const;

export class QueueProjectionService {
  constructor(private readonly gateway: SheetsGateway, private readonly repository: LocalQueueRepository, private readonly namespace: string) {}

  async snapshot(): Promise<QueueProjectionSnapshot> {
    const [settings, items, reserve, state] = await Promise.all([
      this.repository.settings(), this.repository.items(), this.repository.reserveCandidates(), this.repository.controlState()
    ]);
    return { namespace: this.namespace, settings, items, reserve, state };
  }

  async project() {
    const snapshot = await this.snapshot();
    const localRevision = snapshot.state.localRevision;
    const queueRows = snapshot.items.map((item) => queueRow(item, localRevision, this.namespace));
    const reserveRows = snapshot.reserve.map((item, index) => reserveRow(item, index + 1, localRevision, this.namespace));
    const snapshotHash = hashRows([queueRows, reserveRows, [[snapshot.settings.enabled, snapshot.settings.isPaused, snapshot.settings.uploadEnabled]]]);
    await this.upsertRows(SHEET_NAMES.commands, "A1:O1000", COMMAND_HEADERS, [], "명령 ID", (row) => String(row[0] ?? ""));
    await this.upsertRows(SHEET_NAMES.queue, "A1:AH1000", QUEUE_PROJECTION_HEADERS, queueRows, "Queue ID", (row) => String(row[0] ?? ""));
    await this.upsertRows(RESERVE_SHEET_NAME, "A1:L1000", RESERVE_HEADERS, reserveRows, "Product Key Hash", (row) => String(row[6] ?? ""));
    const projectedAt = new Date().toISOString();
    const syncRow: SheetRow = [this.namespace, "local_queue_scheduler", localRevision, localRevision, snapshotHash, projectedAt, snapshot.items.length, snapshot.reserve.length, snapshot.settings.isPaused, snapshot.settings.enabled, false, "completed"];
    await this.upsertRows(SYNC_SHEET_NAME, "A1:L100", SYNC_HEADERS, [syncRow], "Namespace", (row) => String(row[0] ?? ""));
    const state = await this.repository.recordProjection({ localRevision, snapshotHash, projectedAt });
    return { state, queueCount: queueRows.length, reserveCount: reserveRows.length, snapshotHash, projectedAt };
  }

  private async upsertRows(sheetName: string, range: string, headers: readonly string[], incoming: SheetRow[], keyHeader: string, incomingKey: (row: SheetRow) => string) {
    const rows = await this.gateway.getValues(sheetName, range);
    if (rows.length === 0) {
      await this.gateway.updateValues(sheetName, `A1:${columnName(headers.length)}1`, [[...headers]]);
    } else {
      const current = rows[0] ?? [];
      const missing = headers.filter((header) => !current.map(String).includes(header));
      if (missing.length > 0) {
        const next = [...current];
        for (const header of missing) next.push(header);
        await this.gateway.updateValues(sheetName, `A1:${columnName(next.length)}1`, [next]);
      }
    }
    const refreshed = await this.gateway.getValues(sheetName, range);
    const columns = assertHeaders(refreshed[0] ?? [], headers, sheetName);
    const existing = new Map(refreshed.slice(1).map((row, index) => [rowValue(row, columns, keyHeader), index + 2] as const).filter(([key]) => Boolean(key)));
    const updates: Array<{ rowNumber: number; row: SheetRow }> = [];
    const additions: SheetRow[] = [];
    for (const row of incoming) {
      const key = incomingKey(row);
      const rowNumber = existing.get(key);
      if (rowNumber) updates.push({ rowNumber, row });
      else additions.push(row);
    }
    const orderedUpdates = updates.sort((left, right) => left.rowNumber - right.rowNumber);
    for (let index = 0; index < orderedUpdates.length;) {
      const group = [orderedUpdates[index]];
      index += 1;
      while (index < orderedUpdates.length && orderedUpdates[index].rowNumber === group[group.length - 1].rowNumber + 1) {
        group.push(orderedUpdates[index]);
        index += 1;
      }
      await this.gateway.updateValues(
        sheetName,
        `A${group[0].rowNumber}:${columnName(headers.length)}${group[group.length - 1].rowNumber}`,
        group.map((entry) => entry.row)
      );
    }
    if (additions.length > 0) {
      const startRow = refreshed.length + 1;
      const endRow = startRow + additions.length - 1;
      await this.gateway.updateValues(sheetName, `A${startRow}:${columnName(headers.length)}${endRow}`, additions);
    }
  }
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
