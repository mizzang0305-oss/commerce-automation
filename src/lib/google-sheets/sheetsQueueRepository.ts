import {
  QUEUE_HEADERS, SHEET_NAMES, SheetsControlError, assertHeaders, isExampleQueueId, numberValue, rowValue,
  stringValue, toKstTimestamp, type QueuePatch, type SheetQueueItem, type SheetRow
} from "./sheetSchemas";
import type { SheetsGateway } from "./googleSheetsClient";

const HEADER_TO_FIELD: Record<string, keyof QueuePatch> = {
  "상품명": "productName", "카테고리": "category", "가격": "price", "쿠팡 제휴 URL": "affiliateUrl",
  "오류/메모": "errorMemo", "진행상태": "progressStatus", "사람검토": "humanReview", "영상 파일/URL": "videoUrl",
  "음성상태": "voiceStatus", "ASR 점수": "asrScore", "실사용 장면 확인": "usageSceneConfirmed", "품질판정": "qualityDecision",
  "업로드상태": "uploadStatus", "YouTube URL": "youtubeUrl"
};

function parseQueueRow(row: SheetRow, columns: Map<string, number>): SheetQueueItem {
  return {
    queueId: rowValue(row, columns, "Queue ID"), registeredDate: rowValue(row, columns, "등록일"),
    slot: rowValue(row, columns, "시간대"), progressStatus: rowValue(row, columns, "진행상태"),
    productName: rowValue(row, columns, "상품명"), category: rowValue(row, columns, "카테고리"),
    price: rowValue(row, columns, "가격"), rawCoupangUrl: rowValue(row, columns, "쿠팡 원본 URL"),
    affiliateUrl: rowValue(row, columns, "쿠팡 제휴 URL"), imageOrUsageScene: rowValue(row, columns, "이미지/실사용 장면"),
    videoUrl: rowValue(row, columns, "영상 파일/URL"), voiceStatus: rowValue(row, columns, "음성상태"),
    asrScore: numberValue(rowValue(row, columns, "ASR 점수")), usageSceneConfirmed: rowValue(row, columns, "실사용 장면 확인"),
    humanReview: rowValue(row, columns, "사람검토"), qualityDecision: rowValue(row, columns, "품질판정"),
    uploadStatus: rowValue(row, columns, "업로드상태"), youtubeUrl: rowValue(row, columns, "YouTube URL"),
    errorMemo: rowValue(row, columns, "오류/메모"), lastModified: rowValue(row, columns, "최종수정"),
    slotId: rowValue(row, columns, "Slot ID"), localRevision: numberValue(rowValue(row, columns, "Local Revision")),
    queueDate: rowValue(row, columns, "Queue Date"), queueRank: numberValue(rowValue(row, columns, "Queue Rank")),
    projectionSource: rowValue(row, columns, "Projection Source"), projectionRevision: numberValue(rowValue(row, columns, "Projection Revision")),
    artifactReferenceId: rowValue(row, columns, "Artifact Reference ID"), safeMediaMetadata: rowValue(row, columns, "Safe Media Metadata"),
    namespace: rowValue(row, columns, "Namespace")
  };
}

export class SheetsQueueRepository {
  constructor(private readonly gateway: SheetsGateway) {}

  private async readRows() {
    const rows = await this.gateway.getValues(SHEET_NAMES.queue, "A1:AH1000");
    const columns = assertHeaders(rows[0] ?? [], QUEUE_HEADERS, SHEET_NAMES.queue);
    return { rows, columns };
  }

  async list(namespace?: string) {
    const { rows, columns } = await this.readRows();
    return rows.slice(1)
      .map((row) => parseQueueRow(row, columns))
      .filter((item) => item.queueId && !isExampleQueueId(item.queueId))
      .filter((item) => !namespace || item.namespace === namespace);
  }

  async find(queueId: string, namespace?: string) {
    return (await this.list(namespace)).find((item) => item.queueId === queueId) ?? null;
  }

  async update(queueId: string, patch: QueuePatch, expectedLastModified: string, namespace?: string) {
    const { rows, columns } = await this.readRows();
    const rowOffset = rows.slice(1).findIndex((row) => rowValue(row, columns, "Queue ID") === queueId && (!namespace || rowValue(row, columns, "Namespace") === namespace));
    if (rowOffset < 0) throw new SheetsControlError("GOOGLE_SHEETS_ROW_NOT_FOUND", "상품을 찾을 수 없습니다.", 404);
    const rowNumber = rowOffset + 2;
    const row = [...rows[rowOffset + 1]];
    const current = parseQueueRow(row, columns);
    if (current.projectionSource === "local_queue_scheduler") throw new SheetsControlError("SHEETS_PROJECTION_READ_ONLY", "Local Queue 투영 행은 Sheets에서 직접 수정할 수 없습니다.", 409);
    if (current.lastModified !== expectedLastModified) {
      throw new SheetsControlError("ROW_CHANGED_RELOAD_REQUIRED", "다른 변경이 감지되었습니다. 새로고침 후 다시 시도하세요.", 409);
    }
    for (const [header, field] of Object.entries(HEADER_TO_FIELD)) {
      if (!(field in patch)) continue;
      const index = columns.get(header);
      if (index !== undefined) row[index] = patch[field] === null ? "" : stringValue(patch[field]);
    }
    row[columns.get("최종수정")!] = toKstTimestamp();
    await this.gateway.updateValues(SHEET_NAMES.queue, `A${rowNumber}:T${rowNumber}`, [row]);
    return parseQueueRow(row, columns);
  }

  async append(item: SheetQueueItem) {
    if (!item.namespace) throw new SheetsControlError("QUEUE_NAMESPACE_REQUIRED", "현재 operation Namespace가 필요합니다.", 400);
    const { rows, columns } = await this.readRows();
    const namespaceColumn = columns.get("Namespace");
    if (namespaceColumn === undefined) throw new SheetsControlError("SHEETS_QUEUE_NAMESPACE_HEADER_REQUIRED", "상품큐 Namespace 열이 필요합니다.", 503);
    const base: SheetRow = [
      item.queueId, item.registeredDate, item.slot, item.progressStatus, item.productName, item.category, item.price,
      item.rawCoupangUrl, item.affiliateUrl, item.imageOrUsageScene, item.videoUrl, item.voiceStatus,
      item.asrScore ?? "", item.usageSceneConfirmed, item.humanReview, item.qualityDecision, item.uploadStatus,
      item.youtubeUrl, item.errorMemo, item.lastModified || toKstTimestamp()
    ];
    const row: SheetRow = Array.from({ length: Math.max(rows[0]?.length ?? 0, namespaceColumn + 1) }, () => "");
    QUEUE_HEADERS.forEach((header, index) => { row[columns.get(header)!] = base[index]; });
    row[namespaceColumn] = item.namespace;
    await this.gateway.appendValues(SHEET_NAMES.queue, "A:AH", [row]);
    return item;
  }
}
