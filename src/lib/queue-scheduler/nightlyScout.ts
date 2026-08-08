import { performance } from "node:perf_hooks";
import { buildLiveProductKeywordContexts, normalizeLiveProduct, rankLiveProducts, searchLiveCoupangProducts, supportsUsageEvidence } from "@/lib/live-product-video";
import { readCoupangPartnersEnv } from "@/lib/coupang/partnersAuthConfig";
import { LocalQueueRepository, kstDate } from "./repository";
import { QUEUE_SCHEDULER_FLAGS, type LocalRun } from "./types";

export async function runNightlyScout(input: { repository?: LocalQueueRepository; now?: Date; dueNow?: boolean } = {}) {
  const repository = input.repository ?? new LocalQueueRepository();
  const now = input.now ?? new Date();
  const started = performance.now();
  const startedAt = now.toISOString();
  const runId = `scout-${startedAt.replace(/[-:.TZ]/gu, "").slice(0, 14)}`;
  const settings = await repository.settings();
  if (!settings.enabled) return recordNoop(repository, runId, startedAt, "QUEUE_SCHEDULER_DISABLED");
  if (settings.isPaused) return recordNoop(repository, runId, startedAt, "QUEUE_SCHEDULER_PAUSED");
  const queueDate = kstDate(now);
  const existing = (await repository.items()).filter((item) => item.queueDate === queueDate);
  if (existing.length >= settings.dailyTargetCount) return recordNoop(repository, runId, startedAt, "DAILY_QUEUE_ALREADY_FILLED", { queued: existing.length, apiCallCount: 0 });
  const readiness = readCoupangPartnersEnv(process.env).readiness;
  if (!(readiness.provider_enabled && readiness.access_key_present && readiness.secret_key_present && readiness.customer_id_or_partner_id_present)) throw new Error("COUPANG_PROVIDER_NOT_CONFIGURED");
  const { contexts } = buildLiveProductKeywordContexts(now);
  const providerResults = [];
  for (const context of contexts) providerResults.push(await searchLiveCoupangProducts({ context, limit: 6 }));
  const raw = providerResults.flatMap((result) => result.products);
  const candidates = raw.map(normalizeLiveProduct);
  const ranked = rankLiveProducts({ candidates, keywordContexts: contexts, usageEvidenceAvailable: supportsUsageEvidence });
  const insertion = await repository.insertRanked({ ranked, queueDate, now, dueNow: input.dueNow });
  const apiCallCount = providerResults.reduce((sum, value) => sum + value.apiCallCount, 0);
  const run: LocalRun = { runId, type: "nightly_discovery", status: insertion.queued.length + existing.length === settings.dailyTargetCount ? "success" : "partial", startedAt, finishedAt: new Date().toISOString(), claimed: 0, completed: insertion.queued.length, failed: 0, retried: 0, safeMessage: insertion.queued.length ? "NIGHTLY_QUEUE_CREATED" : "NIGHTLY_NO_NEW_ITEMS", metrics: { queueDate, apiCallCount, discovered: raw.length, normalized: candidates.length, eligible: ranked.filter((entry) => entry.score.eligible).length, selected: insertion.queued.length, duplicateSkipped: insertion.duplicateSkipped, durationSeconds: Math.round((performance.now() - started) / 10) / 100, ...QUEUE_SCHEDULER_FLAGS } };
  await repository.addRun(run);
  return { run, queued: insertion.queued, ranked, providerResults };
}

async function recordNoop(repository: LocalQueueRepository, runId: string, startedAt: string, safeMessage: string, metrics: Record<string, number> = {}) { const run: LocalRun = { runId, type: "nightly_discovery", status: "noop", startedAt, finishedAt: new Date().toISOString(), claimed: 0, completed: 0, failed: 0, retried: 0, safeMessage, metrics: { ...metrics, ...QUEUE_SCHEDULER_FLAGS } }; await repository.addRun(run); return { run, queued: [], ranked: [], providerResults: [] }; }
