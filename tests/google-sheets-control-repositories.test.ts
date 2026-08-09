import { beforeEach, describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { createCommerceControlRepository } from "@/lib/google-sheets/commerceControlRepository";
import { readGoogleSheetsConfig } from "@/lib/google-sheets/googleSheetsClient";
import { SHEET_NAMES, SheetsControlError, driveVideoLinks, safeJson } from "@/lib/google-sheets/sheetSchemas";
import { MemorySheetsGateway, commandRow, freshQueueLastModified } from "./helpers/googleSheetsControl";

describe("Google Sheets control repositories", () => {
  let gateway: MemorySheetsGateway;
  beforeEach(() => { gateway = new MemorySheetsGateway(); });

  test("reads products by Queue ID and excludes example rows", async () => {
    const repository = createCommerceControlRepository(gateway);
    expect(await repository.queue.list()).toHaveLength(1);
    expect(await repository.queue.find("queue-001")).toMatchObject({ productName: "테스트 상품", asrScore: 0.91 });
  });

  test("updates the exact product and rejects stale last-modified values", async () => {
    const repository = createCommerceControlRepository(gateway);
    const updated = await repository.queue.update("queue-001", { productName: "수정 상품" }, freshQueueLastModified(gateway));
    expect(updated.productName).toBe("수정 상품");
    await expect(repository.queue.update("queue-001", { productName: "충돌" }, "2026-01-01 00:00:00"))
      .rejects.toMatchObject({ code: "ROW_CHANGED_RELOAD_REQUIRED", status: 409 });
  });

  test("appends a queue item with a permanent Queue ID", async () => {
    const repository = createCommerceControlRepository(gateway);
    const source = await repository.queue.find("queue-001");
    expect(source).not.toBeNull();
    await repository.queue.append({ ...source!, queueId: "WEB_MVP_TEST_QUEUE_002", productName: "추가 상품" });
    expect(await repository.queue.find("WEB_MVP_TEST_QUEUE_002")).toMatchObject({ productName: "추가 상품" });
  });

  test("blocks a missing queue header", async () => {
    gateway.sheets.get(SHEET_NAMES.queue)![0][0] = "잘못된 ID";
    await expect(createCommerceControlRepository(gateway).queue.list()).rejects.toMatchObject({ code: "GOOGLE_SHEETS_SCHEMA_MISMATCH" });
  });

  test("appends one command per web request key and claims the oldest pending command", async () => {
    const repository = createCommerceControlRepository(gateway);
    const first = await repository.commands.create({ queueId: "queue-001", command: "보류", webRequestKey: "same-key" });
    const duplicate = await repository.commands.create({ queueId: "queue-001", command: "보류", webRequestKey: "same-key" });
    expect(first.created).toBe(true);
    expect(duplicate).toMatchObject({ created: false });
    expect(await repository.commands.list()).toHaveLength(1);
    expect(await repository.commands.claimOldest("runner-a")).toMatchObject({ status: "처리중", result: "runner:runner-a" });
  });

  test("cancels pending commands and permits only one failed retry", async () => {
    gateway.sheets.get(SHEET_NAMES.commands)!.push(commandRow());
    const repository = createCommerceControlRepository(gateway);
    expect(await repository.commands.cancel("command-001")).toMatchObject({ status: "취소" });
    gateway.sheets.get(SHEET_NAMES.commands)![1][6] = "실패";
    gateway.sheets.get(SHEET_NAMES.commands)![1][10] = 0;
    expect(await repository.commands.retryOnce("command-001")).toMatchObject({ status: "대기", retryCount: 1 });
    gateway.sheets.get(SHEET_NAMES.commands)![1][6] = "실패";
    await expect(repository.commands.retryOnce("command-001")).rejects.toMatchObject({ code: "COMMAND_STATE_CONFLICT" });
  });

  test("appends logs and updates allowlisted settings", async () => {
    const repository = createCommerceControlRepository(gateway);
    await repository.logs.append({ commandId: "c", queueId: "queue-001", command: "보류", status: "완료", safeMessage: "ok", before: "{}", after: "{}", startedAt: "s", completedAt: "e", externalCall: "false", details: "local" });
    expect(await repository.logs.list()).toHaveLength(1);
    const settings = await repository.settings.update({ "하루 상품 수": "4" }, { "하루 상품 수": "6", "임의 필드": "금지" });
    expect(settings.find((setting) => setting.name === "하루 상품 수")?.value).toBe("6");
  });

  test("blocks automatic upload settings and does not partially update earlier values", async () => {
    const repository = createCommerceControlRepository(gateway);
    await expect(repository.settings.update(
      { "하루 상품 수": "4", "공개 자동 업로드": "FALSE" },
      { "하루 상품 수": "8", "공개 자동 업로드": "TRUE" }
    )).rejects.toMatchObject({ code: "UNSAFE_SETTING_FORBIDDEN" });
    expect((await repository.settings.list()).find((setting) => setting.name === "하루 상품 수")?.value).toBe("4");
  });

  test("returns a safe not-configured error without credential values", () => {
    expect(() => readGoogleSheetsConfig({} as NodeJS.ProcessEnv)).toThrowError(SheetsControlError);
    try { readGoogleSheetsConfig({} as NodeJS.ProcessEnv); } catch (error) {
      expect(error).toMatchObject({ code: "GOOGLE_SHEETS_SPREADSHEET_ID_MISSING", status: 503 });
      expect(JSON.stringify(error)).not.toContain("private_key");
    }
  });

  test("accepts only Google Drive video references for embedded preview", () => {
    expect(driveVideoLinks("https://drive.google.com/file/d/WEB_MVP_TEST_VIDEO_FILE_ID/view")?.previewUrl).toContain("/preview");
    expect(driveVideoLinks("javascript:alert(1)")).toBeNull();
    expect(driveVideoLinks("https://example.invalid/video.mp4")).toBeNull();
  });

  test("writes Sheet values as RAW to block formula interpretation", () => {
    const source = readFileSync("src/lib/google-sheets/googleSheetsClient.ts", "utf8");
    expect(source).toContain("valueInputOption=RAW");
    expect(source).not.toContain("valueInputOption=USER_ENTERED");
  });

  test("redacts URLs and credential-shaped fields from execution snapshots", () => {
    const serialized = safeJson({ rawCoupangUrl: "https://example.invalid/raw", affiliateUrl: "https://example.invalid/affiliate", serviceAccountEmail: "secret@example.invalid", productName: "상품" });
    expect(serialized).toContain("[REDACTED_URL]");
    expect(serialized).toContain("[REDACTED]");
    expect(serialized).toContain("상품");
    expect(serialized).not.toContain("example.invalid");
  });
});
