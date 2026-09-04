import type { SheetsGateway } from "./googleSheetsClient";
import { COMMAND_HEADERS, LOG_HEADERS, QUEUE_HEADERS, SHEET_NAMES, isAllowedCommand, type SheetRow } from "./sheetSchemas";
import { COMPLETE_SHEET_COLUMNS, parseBoundedSheetRange } from "./completeSheetRead";

function columnIndex(letter: string) {
  return letter.split("").reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

export class MockCommerceControlGateway implements SheetsGateway {
  private readonly sheets = new Map<string, SheetRow[]>([
    [SHEET_NAMES.queue, [[...QUEUE_HEADERS], [
      "WEB_MVP_TEST_QUEUE_001", "2026-08-01", "07:30", "검토대기", "WEB MVP 모바일 검증 상품", "생활용품", "12900",
      "https://example.invalid/raw", "https://example.invalid/affiliate", "synthetic_usage_scene", "WEB_MVP_TEST_VIDEO_FILE_ID", "완료", "0.91", "확인",
      "미검토", "검토필요", "대기", "", "WEB_MVP_TEST_ONLY", "2026-08-01 09:00:00"
    ]]],
    [SHEET_NAMES.commands, [[...COMMAND_HEADERS]]],
    [SHEET_NAMES.logs, [[...LOG_HEADERS]]],
    [SHEET_NAMES.settings, [["빠른 MVP 설정"], [], [], ["설정명", "값", "설명"], ["하루 상품 수", "4", "시간대별 1개"],
      ["시간대 1", "07:30", "출근"], ["시간대 2", "12:20", "점심"], ["시간대 3", "18:30", "퇴근"], ["시간대 4", "22:30", "취침 전"],
      ["ASR 통과 기준", "0.82", "PASS 후보"], ["사람 검토 필수", "TRUE", "필수"], ["업로드 방식", "수동", "직접"],
      ["비공개 자동 업로드", "FALSE", "OFF"], ["공개 자동 업로드", "FALSE", "금지"]]]
  ]);

  constructor(seedCommand = "") {
    if (isAllowedCommand(seedCommand)) {
      this.sheets.get(SHEET_NAMES.commands)!.push([
        "WEB_MVP_TEST_COMMAND_001", seedCommand === "오늘상품찾기" ? "" : "WEB_MVP_TEST_QUEUE_001", seedCommand,
        "", "WEB_MVP_TEST_OWNER", "2026-08-01 09:00:00", "대기", "", "", "", 0, "5ff4c1af-adab-44fe-9f80-48a8c4e7a8c3"
      ]);
    }
  }

  async getValues(sheetName: string) { return structuredClone(this.sheets.get(sheetName) ?? []); }

  async metadata() {
    return { sheets: [...new Set([...this.sheets.keys(), ...Object.keys(COMPLETE_SHEET_COLUMNS)])].map((title, sheetId) => ({ properties: { title, sheetId, gridProperties: { rowCount: 2000, columnCount: 61 } } })) };
  }

  async getValuesPage(sheetName: string, range: string) {
    const bounds = parseBoundedSheetRange(range);
    return { sheetName, ...bounds, rows: (await this.getValues(sheetName)).slice(bounds.startRow - 1, bounds.endRow).map((row) => row.slice(0, bounds.columnCount)) };
  }

  async updateValues(sheetName: string, range: string, values: SheetRow[]) {
    const match = /^([A-Z]+)(\d+)/.exec(range); if (!match) throw new Error("MOCK_RANGE_INVALID");
    const rows = this.sheets.get(sheetName) ?? [];
    const startColumn = columnIndex(match[1]); const startRow = Number(match[2]) - 1;
    values.forEach((row, rowOffset) => { rows[startRow + rowOffset] ??= []; row.forEach((value, columnOffset) => { rows[startRow + rowOffset][startColumn + columnOffset] = value; }); });
    this.sheets.set(sheetName, rows);
  }

  async appendValues(sheetName: string, _range: string, values: SheetRow[]) {
    const rows = this.sheets.get(sheetName) ?? []; rows.push(...structuredClone(values)); this.sheets.set(sheetName, rows);
  }

  async clearValues(sheetName: string, range: string) { await this.updateValues(sheetName, range, [[]]); }
}
