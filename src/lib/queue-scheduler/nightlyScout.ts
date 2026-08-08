import { performance } from "node:perf_hooks";
import { buildDaily69KeywordContexts, buildLiveProductKeywordContexts, normalizeLiveProduct, rankLiveProducts, searchLiveCoupangProducts, supportsUsageEvidence, type LiveCoupangProviderResult } from "@/lib/live-product-video";
import { readCoupangPartnersEnv } from "@/lib/coupang/partnersAuthConfig";
import { LocalQueueRepository, kstDate } from "./repository";
import { QUEUE_SCHEDULER_FLAGS, type LocalRun } from "./types";

export async function runNightlyScout(input: { repository?: LocalQueueRepository; now?: Date; dueNow?: boolean; search?: typeof searchLiveCoupangProducts; providerReady?: boolean } = {}) {
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
  if (existing.length >= settings.dailyTargetCount) return recordNoop(repository, runId, startedAt, "DAILY_QUEUE_ALREADY_FILLED", { queued: existing.length, apiCallCount: 0, reserveCount: (await repository.reserveCandidates()).length });
  const readiness = readCoupangPartnersEnv(process.env).readiness;
  const providerReady = input.providerReady ?? (readiness.provider_enabled && readiness.access_key_present && readiness.secret_key_present && readiness.customer_id_or_partner_id_present);
  if (!providerReady) throw new Error("COUPANG_PROVIDER_NOT_CONFIGURED");
  const { contexts } = settings.mode === "no_upload_daily_69" ? buildDaily69KeywordContexts(now) : buildLiveProductKeywordContexts(now);
  const providerResults: LiveCoupangProviderResult[] = [];
  const search = input.search ?? searchLiveCoupangProducts;
  const targetWithReserve = settings.dailyTargetCount + Math.max(settings.minimumReserveCount, Math.ceil(settings.dailyTargetCount * settings.reserveRatio));
  let apiCallCount = 0;
  let raw = [] as LiveCoupangProviderResult["products"];
  let candidates = raw.map(normalizeLiveProduct);
  let ranked = rankLiveProducts({ candidates, keywordContexts: contexts, usageEvidenceAvailable: supportsUsageEvidence });
  for (const context of contexts) {
    if (apiCallCount >= settings.maxProviderCalls || raw.length >= settings.maxRawDiscoveries) break;
    const result = await search({ context, limit: Math.min(10, settings.maxRawDiscoveries - raw.length), allowDeeplink: settings.maxProviderCalls - apiCallCount >= 2 });
    providerResults.push(result);
    apiCallCount += result.apiCallCount;
    raw = providerResults.flatMap((entry) => entry.products).slice(0, settings.maxRawDiscoveries);
    candidates = raw.map(normalizeLiveProduct);
    ranked = rankLiveProducts({ candidates, keywordContexts: contexts, usageEvidenceAvailable: supportsUsageEvidence });
    const eligible = ranked.filter((entry) => entry.score.eligible);
    const eligibleUnique = new Set(eligible.map((entry) => entry.candidate.productKey)).size;
    const useCaseFloor = Math.floor(settings.dailyTargetCount / 3);
    const diversityFloorReady = settings.mode !== "no_upload_daily_69" || ["vehicle_organization", "desk_organization", "laundry_drying"].every((useCase) => eligible.filter((entry) => entry.candidate.useCase === useCase).length >= useCaseFloor);
    if (eligibleUnique >= targetWithReserve && diversityFloorReady) break;
  }
  const insertion = await repository.insertRanked({ ranked, queueDate, now, dueNow: input.dueNow });
  const capacityReady = insertion.queued.length + existing.length === settings.dailyTargetCount && insertion.reserveCount >= settings.minimumReserveCount;
  const run: LocalRun = { runId, type: "nightly_discovery", status: capacityReady ? "success" : "partial", startedAt, finishedAt: new Date().toISOString(), claimed: 0, completed: insertion.queued.length, failed: 0, retried: 0, safeMessage: capacityReady ? "NIGHTLY_QUEUE_CREATED" : insertion.queued.length ? "DAILY_QUEUE_CAPACITY_INSUFFICIENT" : "NIGHTLY_NO_NEW_ITEMS", metrics: { queueDate, apiCallCount, providerQueryCount: providerResults.length, discovered: raw.length, normalized: candidates.length, eligible: ranked.filter((entry) => entry.score.eligible).length, selected: insertion.queued.length, reserveAdded: insertion.reserveAdded, reserveCount: insertion.reserveCount, requiredReserveCount: settings.minimumReserveCount, duplicateSkipped: insertion.duplicateSkipped, durationSeconds: Math.round((performance.now() - started) / 10) / 100, ...QUEUE_SCHEDULER_FLAGS } };
  await repository.addRun(run);
  return { run, queued: insertion.queued, ranked, providerResults };
}

async function recordNoop(repository: LocalQueueRepository, runId: string, startedAt: string, safeMessage: string, metrics: Record<string, number> = {}) { const run: LocalRun = { runId, type: "nightly_discovery", status: "noop", startedAt, finishedAt: new Date().toISOString(), claimed: 0, completed: 0, failed: 0, retried: 0, safeMessage, metrics: { ...metrics, ...QUEUE_SCHEDULER_FLAGS } }; await repository.addRun(run); return { run, queued: [], ranked: [], providerResults: [] }; }
