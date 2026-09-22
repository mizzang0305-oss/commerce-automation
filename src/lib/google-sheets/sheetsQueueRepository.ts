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
    errorMemo: rowValue(row, columns, "오류/메모"), lastModified: rowValue(row, columns, "최종수정")
  };
}

export class SheetsQueueRepository {
  constructor(private readonly gateway: SheetsGateway) {}

  private async readRows() {
    const rows = await this.gateway.getValues(SHEET_NAMES.queue, "A1:T1000");
    const columns = assertHeaders(rows[0] ?? [], QUEUE_HEADERS, SHEET_NAMES.queue);
    return { rows, columns };
  }

  async list() {
    const { rows, columns } = await this.readRows();
    return rows.slice(1)
      .map((row) => parseQueueRow(row, columns))
      .filter((item) => item.queueId && !isExampleQueueId(item.queueId));
  }

  async find(queueId: string) {
    return (await this.list()).find((item) => item.queueId === queueId) ?? null;
  }

  async update(queueId: string, patch: QueuePatch, expectedLastModified: string) {
    const { rows, columns } = await this.readRows();
    const rowOffset = rows.slice(1).findIndex((row) => rowValue(row, columns, "Queue ID") === queueId);
    if (rowOffset < 0) throw new SheetsControlError("GOOGLE_SHEETS_ROW_NOT_FOUND", "상품을 찾을 수 없습니다.", 404);
    const rowNumber = rowOffset + 2;
    const row = [...rows[rowOffset + 1]];
    const current = parseQueueRow(row, columns);
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
    const row: SheetRow = [
      item.queueId, item.registeredDate, item.slot, item.progressStatus, item.productName, item.category, item.price,
      item.rawCoupangUrl, item.affiliateUrl, item.imageOrUsageScene, item.videoUrl, item.voiceStatus,
      item.asrScore ?? "", item.usageSceneConfirmed, item.humanReview, item.qualityDecision, item.uploadStatus,
      item.youtubeUrl, item.errorMemo, item.lastModified || toKstTimestamp()
    ];
    await this.gateway.appendValues(SHEET_NAMES.queue, "A:T", [row]);
    return item;
  }
}
