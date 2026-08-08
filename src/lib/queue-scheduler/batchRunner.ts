import { performance } from "node:perf_hooks";
import { join } from "node:path";
import { statfs } from "node:fs/promises";
import { acquireProcessLock } from "./lock";
import { LocalQueueRepository } from "./repository";
import { executeQueueVideoBatch, type QueueVideoResult } from "./videoExecutor";
import { QUEUE_SCHEDULER_FLAGS, type LocalRun } from "./types";

export async function runNextBatch(input: { repository?: LocalQueueRepository; now?: Date; executor?: typeof executeQueueVideoBatch } = {}) {
  const repository = input.repository ?? new LocalQueueRepository(); const now = input.now ?? new Date(); const started = performance.now();
  const runId = `batch-${now.toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14)}`;
  let release: (() => Promise<void>) | null = null;
  try { release = await acquireProcessLock(join(repository.root, "runner.lock"), runId, 4 * 60 * 60_000); }
  catch (error) { if ((error as Error).message === "SCHEDULER_ALREADY_RUNNING") return recordNoop(repository, runId, now, "SCHEDULER_ALREADY_RUNNING"); throw error; }
  try {
    const settings = await repository.settings();
    if (!settings.enabled) return recordNoop(repository, runId, now, "QUEUE_SCHEDULER_DISABLED");
    if (settings.isPaused) return recordNoop(repository, runId, now, "QUEUE_SCHEDULER_PAUSED");
    await repository.recoverStale(now);
    const freeGb = await diskFreeGb(repository.root);
    if (freeGb < settings.minimumFreeGb) return recordNoop(repository, runId, now, "DISK_SPACE_GUARD_BLOCKED", { freeGb });
    const claimed = await repository.claimDue({ now, runId, limit: settings.batchSize, leaseMinutes: settings.leaseMinutes, pilotMax: settings.pilotMaxDailyItems });
    if (claimed.length === 0) return recordNoop(repository, runId, now, "NO_DUE_ITEMS", { freeGb });
    if (claimed.length !== settings.batchSize) { for (const item of claimed) await repository.fail({ id: item.id, code: "INCOMPLETE_BATCH_CLAIM", retryable: true, now, settings }); return recordNoop(repository, runId, now, "INCOMPLETE_BATCH_CLAIM", { claimed: claimed.length }); }
    await repository.markProcessing(claimed.map((item) => item.id), now);
    let results: QueueVideoResult[];
    try { results = await (input.executor ?? executeQueueVideoBatch)({ items: claimed, runId, root: repository.root }); }
    catch (error) { const code = safeCode(error); const retryable = isRetryable(code); results = claimed.map((item) => ({ queueId: item.id, productKey: item.productKey, passed: false, errorCode: code, finalVideo: "", reviewPath: "", creativeScore: 0, videoQualityScore: 0, retryable })); }
    let completed = 0; let failed = 0; let retried = 0;
    for (const result of results) { if (result.passed) { await repository.complete({ id: result.queueId, videoPath: result.finalVideo, reviewPath: result.reviewPath, creativeScore: result.creativeScore, videoQualityScore: result.videoQualityScore, now: new Date() }); completed += 1; } else { const status = await repository.fail({ id: result.queueId, code: result.errorCode, retryable: result.retryable, now: new Date(), settings }); if (status === "retry_wait") retried += 1; else failed += 1; } }
    const status = completed === claimed.length ? "success" : completed > 0 ? "partial" : "failed";
    const run: LocalRun = { runId, type: "scheduled_batch", status, startedAt: now.toISOString(), finishedAt: new Date().toISOString(), claimed: claimed.length, completed, failed, retried, safeMessage: status === "success" ? "BATCH_MACHINE_QA_COMPLETE" : "BATCH_PARTIAL_OR_FAILED", metrics: { freeGb, durationSeconds: Math.round((performance.now() - started) / 10) / 100, ...QUEUE_SCHEDULER_FLAGS } };
    await repository.addRun(run); return { run, results };
  } finally { await release(); }
}

async function recordNoop(repository: LocalQueueRepository, runId: string, now: Date, message: string, metrics: Record<string, number> = {}) { const run: LocalRun = { runId, type: "scheduled_batch", status: "noop", startedAt: now.toISOString(), finishedAt: new Date().toISOString(), claimed: Number(metrics.claimed ?? 0), completed: 0, failed: 0, retried: 0, safeMessage: message, metrics: { ...metrics, ...QUEUE_SCHEDULER_FLAGS } }; await repository.addRun(run); return { run, results: [] }; }
async function diskFreeGb(path: string) { const value = await statfs(path); return Math.round(Number(value.bavail * value.bsize) / 1024 / 1024 / 1024 * 100) / 100; }
function safeCode(error: unknown) { const value = error instanceof Error ? error.message : String(error); return /^[A-Z0-9_:-]+$/u.test(value) ? value : "VIDEO_BATCH_SUBPROCESS_FAILED"; }
function isRetryable(code: string) { return /TEMPORARY|TIMEOUT|SUBPROCESS|FILESYSTEM|EACCES|EBUSY|LOCAL_RUNTIME_NOT_CONFIGURED/u.test(code); }
