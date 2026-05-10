import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createLocalJsonAutomationRepository } from "@/lib/repositories/localJsonAutomationRepository";

let dataDir = "";

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "commerce-json-"));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe("localJsonAutomationRepository", () => {
  test("creates default data when files do not exist", async () => {
    const repository = createLocalJsonAutomationRepository({ dataDir });

    const [settings, queue, runs] = await Promise.all([
      repository.getSettings(),
      repository.getQueue(),
      repository.getRuns()
    ]);

    expect(settings.daily_target_count).toBe(69);
    expect(queue).toHaveLength(69);
    expect(runs.length).toBeGreaterThan(0);
    await expect(readFile(join(dataDir, "settings.json"), "utf8")).resolves.toContain(
      "daily_target_count"
    );
  });

  test("persists settings after a new repository instance reads the same directory", async () => {
    const repository = createLocalJsonAutomationRepository({ dataDir });
    await repository.updateSettings({ interval_hours: 3, batch_size: 2 });

    const reloaded = createLocalJsonAutomationRepository({ dataDir });
    const settings = await reloaded.getSettings();

    expect(settings.interval_hours).toBe(3);
    expect(settings.batch_size).toBe(2);
  });

  test("persists queue item state changes", async () => {
    const repository = createLocalJsonAutomationRepository({ dataDir });
    await repository.holdQueueItem("queue-001");

    const reloaded = createLocalJsonAutomationRepository({ dataDir });
    const item = await reloaded.getQueueItem("queue-001");

    expect(item?.queue_status).toBe("hold");
  });

  test("persists appended runs", async () => {
    const repository = createLocalJsonAutomationRepository({ dataDir });
    await repository.appendRun({
      id: "run-persisted",
      run_type: "webhook_test",
      status: "failed",
      processed_count: 0,
      error_count: 1,
      started_at: "2026-05-11T00:00:00.000Z",
      finished_at: "2026-05-11T00:00:01.000Z",
      log: "n8n Webhook 설정이 없어 실행할 수 없습니다.",
      safe_message: "n8n Webhook 설정이 없어 실행할 수 없습니다."
    });

    const reloaded = createLocalJsonAutomationRepository({ dataDir });
    const runs = await reloaded.getRuns();

    expect(runs.some((run) => run.id === "run-persisted")).toBe(true);
  });
});
