import { randomUUID } from "node:crypto";
import { LOG_HEADERS, SHEET_NAMES, assertHeaders, rowValue, type SheetExecutionLog, type SheetRow } from "./sheetSchemas";
import type { SheetsGateway } from "./googleSheetsClient";

export class SheetsLogRepository {
  constructor(private readonly gateway: SheetsGateway) {}

  async list() {
    const rows = await this.gateway.getValues(SHEET_NAMES.logs, "A1:L2000");
    const columns = assertHeaders(rows[0] ?? [], LOG_HEADERS, SHEET_NAMES.logs);
    return rows.slice(1).filter((row) => rowValue(row, columns, "로그 ID")).map((row): SheetExecutionLog => ({
      logId: rowValue(row, columns, "로그 ID"), commandId: rowValue(row, columns, "명령 ID"),
      queueId: rowValue(row, columns, "Queue ID"), command: rowValue(row, columns, "명령"), status: rowValue(row, columns, "상태"),
      safeMessage: rowValue(row, columns, "안전 메시지"), before: rowValue(row, columns, "변경 전"), after: rowValue(row, columns, "변경 후"),
      startedAt: rowValue(row, columns, "시작시각"), completedAt: rowValue(row, columns, "종료시각"),
      externalCall: rowValue(row, columns, "외부호출"), details: rowValue(row, columns, "세부결과")
    }));
  }

  async append(input: Omit<SheetExecutionLog, "logId">) {
    const log = { ...input, logId: randomUUID() };
    const row: SheetRow = [log.logId, log.commandId, log.queueId, log.command, log.status, log.safeMessage, log.before,
      log.after, log.startedAt, log.completedAt, log.externalCall, log.details];
    await this.gateway.appendValues(SHEET_NAMES.logs, "A:L", [row]);
    return log;
  }
}
