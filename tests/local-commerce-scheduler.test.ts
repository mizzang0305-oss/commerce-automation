import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  LOCAL_FAILED_SCHEDULE_RETRY_APPROVAL,
  LocalCommerceSchedulerStore,
  runLocalCommerceSchedule,
  type LocalCommerceExecutionResult
} from "@/lib/orchestration/localCommerceScheduler";
import type { CommerceContentDraft } from "@/lib/orchestration/commercePocSchemas";

const temporaryDirectories: string[] = [];
const NOW = "2026-07-21T10:00:00.000Z";
const LATER = "2026-07-21T10:01:00.000Z";

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("local commerce scheduler", () => {
  test("keeps a future schedule pending without executing the pipeline", async () => {
    const { store } = await schedulerStore();
    const execute = vi.fn<() => Promise<LocalCommerceExecutionResult>>();

    const result = await runLocalCommerceSchedule({
      scheduleId: "schedule-future",
      batchId: "batch-future",
      target: "activepieces",
      scheduledAt: LATER,
      now: () => NOW,
      execute,
      store
    });

    expect(result).toMatchObject({
      ok: true,
      status: "scheduled",
      attempts: 0,
      drafts_queued: 0,
      SAFE_TO_UPLOAD: false,
      SAFE_TO_PUBLIC_UPLOAD: false
    });
    expect(execute).not.toHaveBeenCalled();
    expect(await store.readEvents("schedule-future")).toHaveLength(1);
  });

  test("logs a failure, retries once, and enqueues a draft for human review", async () => {
    const { dataDir, store } = await schedulerStore();
    const execute = vi.fn<() => Promise<LocalCommerceExecutionResult>>()
      .mockRejectedValueOnce(new Error("fixture failure containing untrusted detail"))
      .mockResolvedValueOnce(executionResult());

    const result = await runLocalCommerceSchedule({
      scheduleId: "schedule-retry",
      batchId: "batch-retry",
      target: "windmill",
      scheduledAt: NOW,
      maxAttempts: 3,
      retryDelayMs: 0,
      now: () => NOW,
      execute,
      store
    });

    expect(result).toMatchObject({
      ok: true,
      status: "completed",
      attempts: 2,
      drafts_queued: 1,
      external_call_attempted: false,
      webhook_called: false,
      notification_sent: false,
      publish_attempted: false,
      database_written: false,
      product_queue_created: false,
      worker_jobs_created: false,
      SAFE_TO_UPLOAD: false,
      SAFE_TO_PUBLIC_UPLOAD: false
    });
    expect(execute).toHaveBeenCalledTimes(2);
    expect((await store.readEvents("schedule-retry")).map((event) => event.status)).toEqual([
      "scheduled",
      "running",
      "retry_wait",
      "running",
      "completed"
    ]);
    const statusLog = await readFile(join(dataDir, "scheduler-status.jsonl"), "utf8");
    expect(statusLog).toContain("LOCAL_EXECUTION_FAILED");
    expect(statusLog).not.toContain("untrusted detail");
    expect(await jsonlCount(join(dataDir, "draft-queue.jsonl"))).toBe(1);
    expect(JSON.parse((await readFile(join(dataDir, "draft-queue.jsonl"), "utf8")).trim())).toMatchObject({
      state: "draft_pending_review",
      approval_required: true,
      publish_allowed: false
    });
  });

  test("reports a delayed failed attempt as non-success while it waits for retry", async () => {
    const { store } = await schedulerStore();
    const result = await runLocalCommerceSchedule({
      scheduleId: "schedule-delayed-retry",
      batchId: "batch-delayed-retry",
      target: "activepieces",
      scheduledAt: NOW,
      retryDelayMs: 60_000,
      now: () => NOW,
      execute: async () => {
        throw new Error("fixture failure");
      },
      store
    });

    expect(result).toMatchObject({
      ok: false,
      status: "retry_wait",
      attempts: 1,
      error_code: "LOCAL_EXECUTION_FAILED"
    });
  });

  test("fails closed when an executor returns an explicit non-success result", async () => {
    const { store } = await schedulerStore();
    const result = await runLocalCommerceSchedule({
      scheduleId: "schedule-executor-non-success",
      batchId: "batch-executor-non-success",
      target: "activepieces",
      scheduledAt: NOW,
      maxAttempts: 1,
      now: () => NOW,
      execute: async () => ({
        ...executionResult(),
        ok: false
      }) as unknown as LocalCommerceExecutionResult,
      store
    });

    expect(result).toMatchObject({
      ok: false,
      status: "failed",
      error_code: "LOCAL_EXECUTION_FAILED",
      drafts_queued: 0
    });
  });

  test("stops after the bounded attempt count and creates no draft queue", async () => {
    const { dataDir, store } = await schedulerStore();
    const execute = vi.fn<() => Promise<LocalCommerceExecutionResult>>()
      .mockRejectedValue(new Error("always fails"));

    const result = await runLocalCommerceSchedule({
      scheduleId: "schedule-failed",
      batchId: "batch-failed",
      target: "activepieces",
      scheduledAt: NOW,
      maxAttempts: 2,
      retryDelayMs: 0,
      now: () => NOW,
      execute,
      store
    });

    expect(result).toMatchObject({
      ok: false,
      status: "failed",
      attempts: 2,
      error_code: "LOCAL_EXECUTION_FAILED",
      drafts_queued: 0
    });
    expect(execute).toHaveBeenCalledTimes(2);
    await expect(readFile(join(dataDir, "draft-queue.jsonl"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("requires an exact approval and records a new retry generation after terminal failure", async () => {
    const { store } = await schedulerStore();
    await runLocalCommerceSchedule({
      scheduleId: "schedule-terminal-retry",
      batchId: "batch-terminal-retry",
      target: "activepieces",
      scheduledAt: NOW,
      maxAttempts: 1,
      now: () => NOW,
      execute: async () => {
        throw new Error("fixture failure");
      },
      store
    });
    const execute = vi.fn<() => Promise<LocalCommerceExecutionResult>>().mockResolvedValue(executionResult());

    await expect(runLocalCommerceSchedule({
      scheduleId: "schedule-terminal-retry",
      batchId: "batch-terminal-retry",
      target: "activepieces",
      scheduledAt: NOW,
      maxAttempts: 1,
      retryFailedApproval: "wrong-approval",
      now: () => NOW,
      execute,
      store
    })).rejects.toThrow("LOCAL_FAILED_SCHEDULE_RETRY_APPROVAL_INVALID");

    const retried = await runLocalCommerceSchedule({
      scheduleId: "schedule-terminal-retry",
      batchId: "batch-terminal-retry",
      target: "activepieces",
      scheduledAt: NOW,
      maxAttempts: 1,
      retryFailedApproval: LOCAL_FAILED_SCHEDULE_RETRY_APPROVAL,
      now: () => NOW,
      execute,
      store
    });

    expect(retried).toMatchObject({
      ok: true,
      status: "completed",
      attempts: 1,
      retry_generation: 1,
      drafts_queued: 1
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect((await store.readEvents("schedule-terminal-retry")).map((event) => [
      event.status,
      event.attempt,
      event.retry_generation,
      event.operator_action
    ])).toEqual([
      ["scheduled", 0, 0, "none"],
      ["running", 1, 0, "none"],
      ["failed", 1, 0, "none"],
      ["scheduled", 0, 1, "retry_failed"],
      ["running", 1, 1, "none"],
      ["completed", 1, 1, "none"]
    ]);
  });

  test("allows only one concurrent scheduler writer and one draft enqueue", async () => {
    const { dataDir, store } = await schedulerStore();
    const execute = vi.fn<() => Promise<LocalCommerceExecutionResult>>().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return executionResult();
    });
    const input = {
      scheduleId: "schedule-concurrent",
      batchId: "batch-concurrent",
      target: "activepieces" as const,
      scheduledAt: NOW,
      now: () => NOW,
      execute,
      store
    };

    const results = await Promise.allSettled([
      runLocalCommerceSchedule(input),
      runLocalCommerceSchedule(input)
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: expect.objectContaining({ message: "LOCAL_SCHEDULER_ALREADY_RUNNING" })
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(await jsonlCount(join(dataDir, "scheduler-status.jsonl"))).toBe(3);
    expect(await jsonlCount(join(dataDir, "draft-queue.jsonl"))).toBe(1);
  });

  test("reclaims a lock owned by a process that no longer exists", async () => {
    const { dataDir, store } = await schedulerStore();
    await writeFile(join(dataDir, "scheduler.lock"), JSON.stringify({
      schema_version: "1",
      pid: 2_147_483_647,
      acquired_at: NOW
    }), "utf8");

    const result = await runLocalCommerceSchedule({
      scheduleId: "schedule-stale-lock",
      batchId: "batch-stale-lock",
      target: "activepieces",
      scheduledAt: NOW,
      now: () => NOW,
      execute: async () => executionResult(),
      store
    });

    expect(result.status).toBe("completed");
    await expect(readFile(join(dataDir, "scheduler.lock"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("recovers an interrupted local attempt as a bounded retry", async () => {
    const { store } = await schedulerStore();
    await store.appendEvent(statusEvent({ status: "scheduled", attempt: 0, nextRunAt: NOW }));
    await store.appendEvent(statusEvent({ status: "running", attempt: 1 }));
    const execute = vi.fn<() => Promise<LocalCommerceExecutionResult>>().mockResolvedValue(executionResult());

    const result = await runLocalCommerceSchedule({
      scheduleId: "schedule-interrupted",
      batchId: "batch-interrupted",
      target: "activepieces",
      scheduledAt: NOW,
      maxAttempts: 2,
      retryDelayMs: 0,
      now: () => NOW,
      execute,
      store
    });

    expect(result).toMatchObject({ status: "completed", attempts: 2, drafts_queued: 1 });
    expect((await store.readEvents("schedule-interrupted")).map((event) => [event.status, event.error_code])).toEqual([
      ["scheduled", null],
      ["running", null],
      ["retry_wait", "LOCAL_EXECUTION_INTERRUPTED"],
      ["running", null],
      ["completed", null]
    ]);
  });

  test("returns a completed schedule without rerunning or duplicating its draft", async () => {
    const { dataDir, store } = await schedulerStore();
    const execute = vi.fn<() => Promise<LocalCommerceExecutionResult>>().mockResolvedValue(executionResult());
    const input = {
      scheduleId: "schedule-idempotent",
      batchId: "batch-idempotent",
      target: "activepieces" as const,
      scheduledAt: NOW,
      now: () => NOW,
      execute,
      store
    };

    const first = await runLocalCommerceSchedule(input);
    const second = await runLocalCommerceSchedule(input);

    expect(first.status).toBe("completed");
    expect(second).toEqual(first);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(await jsonlCount(join(dataDir, "draft-queue.jsonl"))).toBe(1);
  });
});

async function schedulerStore() {
  const dataDir = await mkdtemp(join(tmpdir(), "commerce-local-scheduler-"));
  temporaryDirectories.push(dataDir);
  return { dataDir, store: new LocalCommerceSchedulerStore(dataDir) };
}

function executionResult(): LocalCommerceExecutionResult {
  return {
    ok: true,
    drafts: [draftFixture()],
    webhook_called: false,
    notification_sent: false,
    publish_attempted: false,
    SAFE_TO_UPLOAD: false,
    SAFE_TO_PUBLIC_UPLOAD: false
  };
}

function draftFixture(): CommerceContentDraft {
  return {
    schema_version: "1",
    id: "draft-001",
    product_raw_hash: "a".repeat(64),
    state: "draft",
    title: "Local draft",
    short_caption: "Local-only draft",
    description: "Human review required",
    image_url: "https://shop.example/images/product.jpg",
    source_url: "https://shop.example/products/1",
    channels: ["youtube_shorts"],
    approval_required: true,
    publish_allowed: false,
    created_at: NOW
  };
}

function statusEvent(input: {
  status: "scheduled" | "running";
  attempt: number;
  nextRunAt?: string | null;
}) {
  return {
    schema_version: "1" as const,
    schedule_id: "schedule-interrupted",
    batch_id: "batch-interrupted",
    target: "activepieces" as const,
    status: input.status,
    attempt: input.attempt,
    retry_generation: 0,
    operator_action: "none" as const,
    recorded_at: NOW,
    next_run_at: input.nextRunAt ?? null,
    error_code: null,
    draft_ids: [],
    side_effects: {
      external_call_attempted: false as const,
      webhook_called: false as const,
      notification_sent: false as const,
      platform_upload_attempted: false as const,
      database_written: false as const,
      product_queue_created: false as const,
      worker_jobs_created: false as const
    }
  };
}

async function jsonlCount(path: string) {
  return (await readFile(path, "utf8")).trim().split(/\r?\n/).filter(Boolean).length;
}
