import { randomUUID } from "node:crypto";
import {
  COMMAND_HEADERS, SHEET_NAMES, SheetsControlError, assertHeaders, isAllowedCommand, isCommandStatus, rowValue,
  isQueueControlCommand, toKstTimestamp, type AllowedCommand, type SheetCommand, type SheetRow
} from "./sheetSchemas";
import type { SheetsGateway } from "./googleSheetsClient";

function parseCommand(row: SheetRow, columns: Map<string, number>): SheetCommand | null {
  const command = rowValue(row, columns, "명령");
  const status = rowValue(row, columns, "상태");
  if (!isAllowedCommand(command) || !isCommandStatus(status)) return null;
  return {
    commandId: rowValue(row, columns, "명령 ID"), queueId: rowValue(row, columns, "Queue ID"), command,
    requestValue: rowValue(row, columns, "요청값"), requester: rowValue(row, columns, "요청자"),
    requestedAt: rowValue(row, columns, "요청시각"), status, result: rowValue(row, columns, "실행결과"),
    errorMemo: rowValue(row, columns, "오류/메모"), completedAt: rowValue(row, columns, "완료시각"),
    retryCount: Number(rowValue(row, columns, "재시도 횟수") || 0), webRequestKey: rowValue(row, columns, "웹 요청 키"),
    expectedRevision: nullableNumber(rowValue(row, columns, "Expected Revision")), localRevision: nullableNumber(rowValue(row, columns, "Local Revision")),
    namespace: rowValue(row, columns, "Namespace")
  };
}

function nullableNumber(value: string) { const number = Number(value); return value !== "" && Number.isInteger(number) && number >= 0 ? number : null; }

export class SheetsCommandRepository {
  constructor(private readonly gateway: SheetsGateway) {}

  private async readRows() {
    const rows = await this.gateway.getValues(SHEET_NAMES.commands, "A1:O1000");
    const columns = assertHeaders(rows[0] ?? [], COMMAND_HEADERS, SHEET_NAMES.commands);
    return { rows, columns };
  }

  async list(namespace?: string) {
    const { rows, columns } = await this.readRows();
    return rows.slice(1).map((row) => parseCommand(row, columns)).filter((item): item is SheetCommand => Boolean(item?.commandId))
      .filter((item) => !namespace || item.namespace === namespace);
  }

  async create(input: { queueId?: string; command: AllowedCommand; requestValue?: string; requester?: string; webRequestKey: string; expectedRevision?: number | null; namespace?: string }) {
    if (!isAllowedCommand(input.command)) throw new SheetsControlError("COMMAND_NOT_ALLOWED", "허용되지 않은 명령입니다.", 400);
    const existing = (await this.list()).find((item) => item.webRequestKey === input.webRequestKey);
    if (existing) return { command: existing, created: false };
    const command: SheetCommand = {
      commandId: randomUUID(), queueId: input.queueId ?? "", command: input.command, requestValue: input.requestValue ?? "",
      requester: input.requester ?? "web-owner", requestedAt: toKstTimestamp(), status: isQueueControlCommand(input.command) ? "pending" : "대기", result: "", errorMemo: "",
      completedAt: "", retryCount: 0, webRequestKey: input.webRequestKey, expectedRevision: input.expectedRevision ?? null,
      localRevision: null, namespace: input.namespace ?? ""
    };
    await this.gateway.appendValues(SHEET_NAMES.commands, "A:O", [[
      command.commandId, command.queueId, command.command, command.requestValue, command.requester, command.requestedAt,
      command.status, command.result, command.errorMemo, command.completedAt, command.retryCount, command.webRequestKey,
      command.expectedRevision ?? "", command.localRevision ?? "", command.namespace
    ]]);
    return { command, created: true };
  }

  async update(commandId: string, patch: Partial<Pick<SheetCommand, "status" | "result" | "errorMemo" | "completedAt" | "retryCount" | "localRevision">>) {
    const { rows, columns } = await this.readRows();
    const rowOffset = rows.slice(1).findIndex((row) => rowValue(row, columns, "명령 ID") === commandId);
    if (rowOffset < 0) throw new SheetsControlError("GOOGLE_SHEETS_ROW_NOT_FOUND", "명령을 찾을 수 없습니다.", 404);
    const row = [...rows[rowOffset + 1]];
    const mapping: Array<[keyof typeof patch, string]> = [
      ["status", "상태"], ["result", "실행결과"], ["errorMemo", "오류/메모"], ["completedAt", "완료시각"], ["retryCount", "재시도 횟수"], ["localRevision", "Local Revision"]
    ];
    for (const [field, header] of mapping) {
      if (patch[field] !== undefined) row[columns.get(header)!] = patch[field] as string | number;
    }
    await this.gateway.updateValues(SHEET_NAMES.commands, `A${rowOffset + 2}:O${rowOffset + 2}`, [row]);
    return parseCommand(row, columns)!;
  }

  async claimOldest(runnerId: string, namespace?: string) {
    const commands = (await this.list(namespace)).filter((item) => item.status === "대기")
      .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
    const selected = commands[0];
    if (!selected) return null;
    const marker = `runner:${runnerId}`;
    await this.update(selected.commandId, { status: "처리중", result: marker, errorMemo: "" });
    const verified = (await this.list(namespace)).find((item) => item.commandId === selected.commandId);
    return verified?.status === "처리중" && verified.result === marker ? verified : null;
  }

  async cancel(commandId: string, namespace?: string) {
    const command = (await this.list()).find((item) => item.commandId === commandId);
    if (!command) throw new SheetsControlError("GOOGLE_SHEETS_ROW_NOT_FOUND", "명령을 찾을 수 없습니다.", 404);
    if (namespace && command.namespace !== namespace) throw new SheetsControlError("COMMAND_NAMESPACE_MISMATCH", "현재 operation의 명령만 취소할 수 있습니다.", 409);
    if (command.status !== "대기" && command.status !== "pending") throw new SheetsControlError("COMMAND_STATE_CONFLICT", "대기 명령만 취소할 수 있습니다.", 409);
    return this.update(commandId, { status: command.status === "pending" ? "cancelled" : "취소", completedAt: toKstTimestamp(), result: "owner_cancelled" });
  }

  async retryOnce(commandId: string, namespace?: string) {
    const command = (await this.list()).find((item) => item.commandId === commandId);
    if (!command) throw new SheetsControlError("GOOGLE_SHEETS_ROW_NOT_FOUND", "명령을 찾을 수 없습니다.", 404);
    if (namespace && command.namespace !== namespace) throw new SheetsControlError("COMMAND_NAMESPACE_MISMATCH", "현재 operation의 명령만 재시도할 수 있습니다.", 409);
    if ((command.status !== "실패" && command.status !== "failed") || command.retryCount >= 1) {
      throw new SheetsControlError("COMMAND_STATE_CONFLICT", "실패한 명령은 한 번만 재시도할 수 있습니다.", 409);
    }
    return this.update(commandId, { status: command.status === "failed" ? "pending" : "대기", retryCount: command.retryCount + 1, completedAt: "", result: "", errorMemo: "" });
  }
}
