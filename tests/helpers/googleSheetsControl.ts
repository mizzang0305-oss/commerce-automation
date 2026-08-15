import type { SheetsGateway } from "@/lib/google-sheets/googleSheetsClient";
import { COMMAND_HEADERS, LOG_HEADERS, QUEUE_HEADERS, SHEET_NAMES, toKstTimestamp, type SheetRow } from "@/lib/google-sheets/sheetSchemas";

function columnIndex(letter: string) {
  return letter.split("").reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

export class MemorySheetsGateway implements SheetsGateway {
  readonly sheets = new Map<string, SheetRow[]>();

  constructor() {
    this.sheets.set(SHEET_NAMES.queue, [
      [...QUEUE_HEADERS, "Namespace"],
      ["예시-001", "2026-08-01", "07:30", "신규", "예시 상품", "생활", "", "", "", "", "", "대기", "0", "미확인", "미검토", "검토필요", "대기", "", "example", "2026-08-01 09:13:00", "legacy-example"],
      ["queue-001", "2026-08-01", "12:20", "검토대기", "테스트 상품", "생활", "12900", "https://example.invalid/raw", "https://example.invalid/affiliate", "usage", "https://drive.google.com/file/d/synthetic/preview", "완료", "0.91", "확인", "미검토", "검토필요", "대기", "", "", "2026-08-01 10:00:00", "test-active"]
    ]);
    this.sheets.set(SHEET_NAMES.commands, [[...COMMAND_HEADERS]]);
    this.sheets.set(SHEET_NAMES.logs, [[...LOG_HEADERS]]);
    this.sheets.set(SHEET_NAMES.settings, [
      ["빠른 MVP 설정"], [], [], ["설정명", "값", "설명"], ["하루 상품 수", "4", "시간대별 1개"],
      ["시간대 1", "07:30", "출근"], ["ASR 통과 기준", "0.82", "기준"], ["사람 검토 필수", "TRUE", "필수"],
      ["업로드 방식", "수동", "직접"], ["비공개 자동 업로드", "FALSE", "OFF"], ["공개 자동 업로드", "FALSE", "금지"]
    ]);
  }

  async getValues(sheetName: string) {
    return structuredClone(this.sheets.get(sheetName) ?? []);
  }

  async updateValues(sheetName: string, range: string, values: SheetRow[]) {
    const rows = this.sheets.get(sheetName) ?? [];
    const match = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(range);
    if (!match) throw new Error(`unsupported range ${range}`);
    const startColumn = columnIndex(match[1]);
    const startRow = Number(match[2]) - 1;
    values.forEach((valueRow, rowOffset) => {
      rows[startRow + rowOffset] ??= [];
      valueRow.forEach((value, columnOffset) => { rows[startRow + rowOffset][startColumn + columnOffset] = value; });
    });
    this.sheets.set(sheetName, rows);
  }

  async appendValues(sheetName: string, _range: string, values: SheetRow[]) {
    const rows = this.sheets.get(sheetName) ?? [];
    rows.push(...structuredClone(values));
    this.sheets.set(sheetName, rows);
  }

  async clearValues(sheetName: string, range: string) {
    await this.updateValues(sheetName, range, [[]]);
  }
}

export function freshQueueLastModified(gateway: MemorySheetsGateway) {
  return String(gateway.sheets.get(SHEET_NAMES.queue)![2][19]);
}

export function commandRow(input: Partial<Record<number, string | number>> = {}): SheetRow {
  const row: SheetRow = ["command-001", "queue-001", "보류", "", "web-owner", toKstTimestamp(), "대기", "", "", "", 0, "request-001", "", "", "test-active"];
  for (const [key, value] of Object.entries(input)) row[Number(key)] = value;
  return row;
}
