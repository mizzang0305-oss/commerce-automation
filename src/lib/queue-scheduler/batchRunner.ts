import { performance } from "node:perf_hooks";
import { join } from "node:path";
import { statfs } from "node:fs/promises";
import { acquireProcessLock } from "./lock";
import { atomicWriteJson } from "./atomicJson";
import { LocalQueueRepository, kstDate } from "./repository";
import { inspectQueueVideoRuntime, type QueueVideoRuntimeReadiness } from "./runtimePreflight";
import { executeQueueVideoBatch, type QueueVideoResult } from "./videoExecutor";
import { executeAuthenticatedCodexReview } from "./codexCliReviewExecutor";
import { QUEUE_SCHEDULER_FLAGS, type LocalRun } from "./types";

export async function runNextBatch(input: { repository?: LocalQueueRepository; now?: Date; executor?: typeof executeQueueVideoBatch; reviewExecutor?: typeof executeAuthenticatedCodexReview; preflight?: () => Promise<QueueVideoRuntimeReadiness>; env?: NodeJS.ProcessEnv } = {}) {
  const repository = input.repository ?? new LocalQueueRepository(); const now = input.now ?? new Date(); const started = performance.now();
  const runId = `batch-${now.toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14)}`;
  let release: (() => Promise<void>) | null = null;
  try { release = await acquireProcessLock(join(repository.root, "runner.lock"), runId, 4 * 60 * 60_000); }
  catch (error) { if ((error as Error).message === "SCHEDULER_ALREADY_RUNNING") return recordNoop(repository, runId, now, "SCHEDULER_ALREADY_RUNNING"); throw error; }
  try {
    const settings = await repository.settings();
    if (!settings.enabled) return recordNoop(repository, runId, now, "QUEUE_SCHEDULER_DISABLED");
    if (settings.isPaused) return recordNoop(repository, runId, now, "QUEUE_SCHEDULER_PAUSED");
    if (unsafeUploadFlagPresent(input.env ?? process.env)) return recordNoop(repository, runId, now, "UPLOAD_SAFETY_FLAG_BLOCKED", {}, "blocked_preflight");
    await repository.recoverStale(now);
    const capItems = (await repository.items()).filter((item) => item.queueDate === kstDate(now) && item.queueRank <= settings.processingDailyCap);
    const capActionable = capItems.some((item) => item.status === "scheduled" || item.status === "retry_wait");
    if (capItems.length >= settings.processingDailyCap && !capActionable) return recordNoop(repository, runId, now, "DAILY_PROCESSING_CAP_REACHED", { processingDailyCap: settings.processingDailyCap });
    const freeGb = await diskFreeGb(repository.root);
    if (freeGb < settings.minimumFreeGb) return recordNoop(repository, runId, now, "DISK_SPACE_GUARD_BLOCKED", { freeGb });
    const readiness = await (input.preflight ?? (() => inspectQueueVideoRuntime({ diskSpace: true })))();
    await atomicWriteJson(join(repository.root, "runtime-ready.json"), readiness);
    if (!readiness.ready) return recordNoop(repository, runId, now, "RUNTIME_PREFLIGHT_BLOCKED", { freeGb, preflightDurationMs: readiness.durationMs, preflightFailures: readiness.blockers.length }, "blocked_preflight");
    const claimed = await repository.claimDue({ now, runId, limit: settings.batchSize, leaseMinutes: settings.leaseMinutes, pilotMax: settings.pilotMaxDailyItems });
    if (claimed.length === 0) return recordNoop(repository, runId, now, "NO_DUE_ITEMS", { freeGb });
    if (claimed.length !== settings.batchSize) { for (const item of claimed) await repository.fail({ id: item.id, code: "INCOMPLETE_BATCH_CLAIM", retryable: true, now, settings }); return recordNoop(repository, runId, now, "INCOMPLETE_BATCH_CLAIM", { claimed: claimed.length }); }
    await repository.markProcessing(claimed.map((item) => item.id), now);
    const immediatelyAppliedCodexPasses = new Set<string>();
    const applyFreshCodexPass = async (result: QueueVideoResult) => {
      if (!result.passed || result.codexReview?.status !== "pass" || !result.codexReview.evidence) return;
      const machineQaFinishedAt = result.machineQaFinishedAt && Number.isFinite(Date.parse(result.machineQaFinishedAt)) ? new Date(result.machineQaFinishedAt) : new Date();
      await repository.complete({ id: result.queueId, videoPath: result.finalVideo, reviewPath: result.reviewPath, creativeScore: result.creativeScore, videoQualityScore: result.videoQualityScore, now: machineQaFinishedAt });
      await repository.recordCodexVisualReviews({ reviews: [result.codexReview.evidence], now: new Date() });
      immediatelyAppliedCodexPasses.add(result.queueId);
    };
    const executor: typeof executeQueueVideoBatch = input.executor ?? ((request) => executeQueueVideoBatch({ ...request, reviewExecutor: input.reviewExecutor, onCodexPassReady: applyFreshCodexPass }));
    const results = await executeSafely(executor, claimed, runId, repository.root, applyFreshCodexPass);
    const allResults: QueueVideoResult[] = [...results];
    let completed = 0; let blocked = 0; let failed = 0; let retried = 0;
    let fallbacks = 0; let fallbackSuccess = 0;
    for (const initialResult of results) {
      let result = normalizeCodexBlockedResultForFallback(initialResult);
      while (!result.passed && isProductFallbackCode(result.errorCode)) {
        const replacement = await repository.replaceWithReserve({ id: result.queueId, reason: result.errorCode, now: new Date() });
        if (!replacement) break;
        fallbacks += 1;
        await repository.markProcessing([replacement.id], new Date());
        const [replacementResult] = await executeSafely(executor, [replacement], `${runId}-fallback-${fallbacks}`, repository.root, applyFreshCodexPass);
        result = normalizeCodexBlockedResultForFallback(replacementResult);
        allResults.push(replacementResult);
        if (result.passed) fallbackSuccess += 1;
      }
      if (result.passed) {
        if (immediatelyAppliedCodexPasses.has(result.queueId)) {
          completed += 1;
          continue;
        }
        const machineQaFinishedAt = result.machineQaFinishedAt && Number.isFinite(Date.parse(result.machineQaFinishedAt)) ? new Date(result.machineQaFinishedAt) : new Date();
        await repository.complete({ id: result.queueId, videoPath: result.finalVideo, reviewPath: result.reviewPath, creativeScore: result.creativeScore, videoQualityScore: result.videoQualityScore, now: machineQaFinishedAt });
        if (result.codexReview?.evidence) {
          await repository.recordCodexVisualReviews({ reviews: [result.codexReview.evidence], now: new Date() });
          if (result.codexReview.status === "pass") completed += 1; else blocked += 1;
        } else if (result.codexReview?.status === "error") {
          await repository.markCodexReviewExecutorFailed({ id: result.queueId, code: result.codexReview.errorCode, now: new Date() });
          blocked += 1;
        } else {
          completed += 1;
        }
      }
      else { const status = await repository.fail({ id: result.queueId, code: result.errorCode, retryable: result.retryable && !isProductFallbackCode(result.errorCode), now: new Date(), settings }); if (status === "retry_wait") retried += 1; else if (status === "blocked") blocked += 1; else failed += 1; }
    }
    const status = completed === claimed.length ? "success" : completed > 0 ? "partial" : "failed";
    const codexReviewed = allResults.filter((entry) => entry.codexReview?.evidence).length;
    const run: LocalRun = { runId, type: "scheduled_batch", status, startedAt: now.toISOString(), finishedAt: new Date().toISOString(), claimed: claimed.length, completed, blocked, failed, retried, safeMessage: status === "success" && codexReviewed === claimed.length ? "BATCH_CODEX_REVIEW_COMPLETE" : status === "success" ? "BATCH_MACHINE_QA_COMPLETE" : "BATCH_PARTIAL_OR_FAILED", metrics: { freeGb, preflightDurationMs: readiness.durationMs, preflightFailures: 0, blocked, codexReviewed, fallbacks, fallbackSuccess, productAttempts: allResults.length, durationSeconds: Math.round((performance.now() - started) / 10) / 100, ...QUEUE_SCHEDULER_FLAGS } };
    await repository.addRun(run); return { run, results: allResults };
  } finally { await release(); }
}

function unsafeUploadFlagPresent(env: NodeJS.ProcessEnv) {
  return ["SAFE_TO_UPLOAD", "SAFE_TO_PUBLIC_UPLOAD", "YOUTUBE_AUTO_UPLOAD", "PUBLIC_UPLOAD", "UNLISTED_UPLOAD", "TIKTOK_AUTO_UPLOAD", "THREADS_AUTO_POST", "COMMENT_AUTOMATION"]
    .some((name) => env[name]?.trim().toLowerCase() === "true");
}

async function recordNoop(repository: LocalQueueRepository, runId: string, now: Date, message: string, metrics: Record<string, number> = {}, status: LocalRun["status"] = "noop") { const run: LocalRun = { runId, type: "scheduled_batch", status, startedAt: now.toISOString(), finishedAt: new Date().toISOString(), claimed: Number(metrics.claimed ?? 0), completed: 0, blocked: 0, failed: 0, retried: 0, safeMessage: message, metrics: { ...metrics, ...QUEUE_SCHEDULER_FLAGS } }; await repository.addRun(run); return { run, results: [] }; }
async function diskFreeGb(path: string) { const value = await statfs(path); return Math.round(Number(value.bavail * value.bsize) / 1024 / 1024 / 1024 * 100) / 100; }
function safeCode(error: unknown) { const value = error instanceof Error ? error.message : String(error); return /^[A-Z0-9_:-]+$/u.test(value) ? value : "VIDEO_BATCH_SUBPROCESS_FAILED"; }
function isRetryable(code: string) { return /TEMPORARY|TIMEOUT|SUBPROCESS|FILESYSTEM|EACCES|EBUSY|LOCAL_RUNTIME_NOT_CONFIGURED/u.test(code); }
export function isProductFallbackCode(code: string) {
  if (/NOT_READY|NOT_CONFIGURED|PYTHON|TTS_COMMAND|ASR_MODEL|FFMPEG|DISK|FILESYSTEM|SYSTEM_INVARIANT|RUNTIME_INVARIANT/u.test(code)) return false;
  return /ASR_FAILED|PRODUCT_IDENTITY|VIDEO_AUTO_QA_FAILED|USAGE_EVIDENCE|PRODUCT_REFERENCE|POLICY|CODEX_VISUAL_REVIEW_BLOCKED|LONG_TTS_SILENCE|CREATIVE_SELECTION|HOOK_TEMPLATE_REPETITION|PRODUCT_SPECIFIC_VOICE_HARD_FAILURE|TTS_NORMALIZATION_IDENTITY_GUARD_FAILED|TTS_FRONTEND_INPUT_UNSUPPORTED_AFTER_NORMALIZATION|TTS_SEGMENT_SYNTHESIS_FAILED|TTS_MODEL_INFERENCE_FAILED_FOR_PRODUCT/u.test(code);
}
export function normalizeCodexBlockedResultForFallback(result: QueueVideoResult): QueueVideoResult {
  return result.passed && result.codexReview?.status === "block"
    ? { ...result, passed: false, errorCode: "CODEX_VISUAL_REVIEW_BLOCKED", retryable: false }
    : result;
}
async function executeSafely(executor: typeof executeQueueVideoBatch, items: Parameters<typeof executeQueueVideoBatch>[0]["items"], runId: string, root: string, onCodexPassReady: NonNullable<Parameters<typeof executeQueueVideoBatch>[0]["onCodexPassReady"]>): Promise<QueueVideoResult[]> {
  try { return await executor({ items, runId, root, onCodexPassReady }); }
  catch (error) { const code = safeCode(error); const retryable = isRetryable(code); return items.map((item) => ({ queueId: item.id, productKey: item.productKey, passed: false, errorCode: code, finalVideo: "", reviewPath: "", creativeScore: 0, videoQualityScore: 0, retryable })); }
}
