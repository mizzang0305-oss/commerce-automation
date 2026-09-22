import { SHEET_NAMES, SheetsControlError, stringValue, type SheetSetting } from "./sheetSchemas";
import type { SheetsGateway } from "./googleSheetsClient";

export class SheetsSettingsRepository {
  constructor(private readonly gateway: SheetsGateway) {}

  async list() {
    const rows = await this.gateway.getValues(SHEET_NAMES.settings, "A1:C100");
    const headerIndex = rows.findIndex((row) => stringValue(row[0]) === "설정명" && stringValue(row[1]) === "값");
    if (headerIndex < 0) throw new SheetsControlError("GOOGLE_SHEETS_SCHEMA_MISMATCH", "설정 시트 header를 찾을 수 없습니다.", 503);
    return rows.slice(headerIndex + 1)
      .filter((row) => stringValue(row[0]) && !/^\d+$/.test(stringValue(row[0])))
      .map((row): SheetSetting => ({ name: stringValue(row[0]), value: stringValue(row[1]), description: stringValue(row[2]) }));
  }

  async update(expected: Record<string, string>, updates: Record<string, string>) {
    const rows = await this.gateway.getValues(SHEET_NAMES.settings, "A1:C100");
    const headerIndex = rows.findIndex((row) => stringValue(row[0]) === "설정명" && stringValue(row[1]) === "값");
    if (headerIndex < 0) throw new SheetsControlError("GOOGLE_SHEETS_SCHEMA_MISMATCH", "설정 시트 header를 찾을 수 없습니다.", 503);
    const allowed = new Set(["하루 상품 수", "시간대 1", "시간대 2", "시간대 3", "시간대 4", "ASR 통과 기준", "사람 검토 필수", "업로드 방식", "비공개 자동 업로드", "공개 자동 업로드"]);
    const requested = Object.entries(updates).filter(([name]) => allowed.has(name));
    for (const [name, value] of requested) {
      if ((name === "비공개 자동 업로드" || name === "공개 자동 업로드") && value.trim().toUpperCase() !== "FALSE") {
        throw new SheetsControlError("UNSAFE_SETTING_FORBIDDEN", "자동 업로드 설정은 이 MVP에서 활성화할 수 없습니다.", 400);
      }
      if (name === "업로드 방식" && value.trim() !== "수동") {
        throw new SheetsControlError("UNSAFE_SETTING_FORBIDDEN", "업로드 방식은 수동만 허용됩니다.", 400);
      }
      if (!allowed.has(name)) continue;
      const rowOffset = rows.findIndex((row, index) => index > headerIndex && stringValue(row[0]) === name);
      if (rowOffset < 0) throw new SheetsControlError("GOOGLE_SHEETS_ROW_NOT_FOUND", `설정 항목을 찾을 수 없습니다: ${name}`, 404);
      if (stringValue(rows[rowOffset][1]) !== expected[name]) {
        throw new SheetsControlError("ROW_CHANGED_RELOAD_REQUIRED", "설정이 변경되었습니다. 새로고침 후 다시 시도하세요.", 409);
      }
    }
    for (const [name, value] of requested) {
      const rowOffset = rows.findIndex((row, index) => index > headerIndex && stringValue(row[0]) === name);
      await this.gateway.updateValues(SHEET_NAMES.settings, `B${rowOffset + 1}`, [[value]]);
    }
    return this.list();
  }
}
