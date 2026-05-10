import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildN8nPayload, callN8nWebhook, getN8nConfigStatus } from "@/lib/server/n8nClient";
import { createDefaultSettings } from "@/lib/repositories/mockAutomationRepository";
import { createQueueItemFixture } from "@/test/fixtures";

let oldEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  oldEnv = { ...process.env };
  delete process.env.N8N_NIGHTLY_SCOUT_WEBHOOK_URL;
  delete process.env.N8N_NEXT_BATCH_WEBHOOK_URL;
  delete process.env.N8N_RETRY_ITEM_WEBHOOK_URL;
  delete process.env.N8N_WEBHOOK_SECRET;
});

afterEach(() => {
  process.env = oldEnv;
});

describe("n8nClient", () => {
  test("returns safe error when env is missing", async () => {
    const result = await callN8nWebhook("nightly_scout", { type: "nightly_scout" });

    expect(result.ok).toBe(false);
    expect(result.message).toBe("n8n Webhook 설정이 없어 실행할 수 없습니다.");
  });

  test("returns configured booleans without URL or secret values", () => {
    process.env.N8N_NIGHTLY_SCOUT_WEBHOOK_URL = "https://example.test/webhook/secret-path";
    process.env.N8N_WEBHOOK_SECRET = "super-secret";

    const status = getN8nConfigStatus();
    const serialized = JSON.stringify(status);

    expect(status.nightlyScoutConfigured).toBe(true);
    expect(status.secretConfigured).toBe(true);
    expect(serialized).not.toContain("example.test");
    expect(serialized).not.toContain("super-secret");
  });

  test("builds explicit nightly scout payload", () => {
    const settings = createDefaultSettings();

    expect(buildN8nPayload("nightly_scout", { settings })).toMatchObject({
      type: "nightly_scout",
      settings,
      requested_count: 69,
      date_range_days: 30,
      run_mode: "generate_only"
    });
  });

  test("builds explicit next batch payload", () => {
    const settings = createDefaultSettings({ interval_hours: 3 });

    expect(buildN8nPayload("next_batch", { settings })).toMatchObject({
      type: "next_batch",
      settings,
      batch_size: 3,
      interval_hours: 3,
      run_mode: "generate_only"
    });
  });

  test("builds explicit retry item payload", () => {
    const settings = createDefaultSettings();
    const item = createQueueItemFixture();

    expect(buildN8nPayload("retry_item", { settings, item })).toMatchObject({
      type: "retry_item",
      item,
      settings
    });
  });
});
