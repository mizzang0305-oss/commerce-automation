import { describe, expect, test } from "vitest";
import { processOneCommand, type AllowlistedAutomationExecutor } from "@/lib/commerce-control/commandRunner";
import { createCommerceControlRepository } from "@/lib/google-sheets/commerceControlRepository";
import { SHEET_NAMES } from "@/lib/google-sheets/sheetSchemas";
import { MemorySheetsGateway, commandRow } from "./helpers/googleSheetsControl";

describe("Google Sheets local command runner", () => {
  test("claims one pending command, applies hold, updates command and appends a log", async () => {
    const gateway = new MemorySheetsGateway();
    gateway.sheets.get(SHEET_NAMES.commands)!.push(commandRow());
    const repository = createCommerceControlRepository(gateway);
    expect(await processOneCommand({ repository, runnerId: "runner-a" })).toMatchObject({ processed: true, status: "완료" });
    expect(await repository.queue.find("queue-001")).toMatchObject({ progressStatus: "보류" });
    expect(await repository.commands.list()).toEqual([expect.objectContaining({ status: "완료" })]);
    expect(await repository.logs.list()).toEqual([expect.objectContaining({ externalCall: "false" })]);
  });

  test("skips already-processing commands", async () => {
    const gateway = new MemorySheetsGateway();
    gateway.sheets.get(SHEET_NAMES.commands)!.push(commandRow({ 6: "처리중" }));
    expect(await processOneCommand({ repository: createCommerceControlRepository(gateway), runnerId: "runner-a" })).toEqual({ processed: false });
  });

  test("does not fake generation success when local execution is not approved", async () => {
    const gateway = new MemorySheetsGateway();
    gateway.sheets.get(SHEET_NAMES.commands)!.push(commandRow({ 2: "영상재생성" }));
    const repository = createCommerceControlRepository(gateway);
    expect(await processOneCommand({ repository, runnerId: "runner-a" })).toMatchObject({ status: "사람확인필요" });
    expect(await repository.queue.find("queue-001")).toMatchObject({ videoUrl: expect.stringContaining("synthetic") });
  });

  test("accepts an injected allowlisted mock executor without external calls", async () => {
    const gateway = new MemorySheetsGateway();
    gateway.sheets.get(SHEET_NAMES.commands)!.push(commandRow({ 2: "음성재생성" }));
    const repository = createCommerceControlRepository(gateway);
    const executor: AllowlistedAutomationExecutor = { execute: async () => ({ status: "완료", safeMessage: "MOCK_TTS_COMPLETE", queuePatch: { voiceStatus: "완료" }, externalCall: false }) };
    expect(await processOneCommand({ repository, runnerId: "runner-a", executor })).toMatchObject({ status: "완료" });
    expect(await repository.queue.find("queue-001")).toMatchObject({ voiceStatus: "완료" });
  });

  test("does not mark unsupported metadata instructions complete", async () => {
    const gateway = new MemorySheetsGateway();
    gateway.sheets.get(SHEET_NAMES.commands)!.push(commandRow({ 2: "메타데이터수정", 3: JSON.stringify({ hookText: "새 후킹" }) }));
    const repository = createCommerceControlRepository(gateway);
    expect(await processOneCommand({ repository, runnerId: "runner-a" })).toMatchObject({ status: "사람확인필요" });
    expect(await repository.commands.list()).toEqual([expect.objectContaining({ status: "사람확인필요" })]);
  });
});
