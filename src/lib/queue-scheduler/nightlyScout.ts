import { performance } from "node:perf_hooks";
import { buildDaily69KeywordContexts, buildLiveProductKeywordContexts, normalizeLiveProduct, rankLiveProducts, searchLiveCoupangProducts, supportsUsageEvidence, type LiveCoupangProviderResult } from "@/lib/live-product-video";
import { readCoupangPartnersEnv } from "@/lib/coupang/partnersAuthConfig";
import { eligiblePacksForUseCase, loadUsageEvidenceRegistry, planUsageEvidenceCapacity, type SupportedUsageEvidenceUseCase, type UsageCapacityPlan, type UsageEvidenceRegistry } from "@/lib/usage-evidence";
import { LocalQueueRepository, kstDate } from "./repository";
import { QUEUE_SCHEDULER_FLAGS, type LocalRun } from "./types";

export async function runNightlyScout(input: { repository?: LocalQueueRepository; now?: Date; dueNow?: boolean; search?: typeof searchLiveCoupangProducts; providerReady?: boolean; usageEvidenceRegistry?: UsageEvidenceRegistry; shadowMode?: boolean } = {}) {
  const repository = input.repository ?? new LocalQueueRepository();
  const now = input.now ?? new Date();
  const started = performance.now();
  const startedAt = now.toISOString();
  const runId = `scout-${startedAt.replace(/[-:.TZ]/gu, "").slice(0, 14)}`;
  const settings = await repository.settings();
  if (input.shadowMode && settings.mode !== "no_upload_daily_69") throw new Error("DAILY_69_SHADOW_MODE_REQUIRED");
  if (!settings.enabled && !input.shadowMode) return recordNoop(repository, runId, startedAt, "QUEUE_SCHEDULER_DISABLED");
  if (settings.isPaused && !input.shadowMode) return recordNoop(repository, runId, startedAt, "QUEUE_SCHEDULER_PAUSED");
  const queueDate = kstDate(now);
  const existing = (await repository.items()).filter((item) => item.queueDate === queueDate);
  if (existing.length >= settings.dailyTargetCount) return recordNoop(repository, runId, startedAt, "DAILY_QUEUE_ALREADY_FILLED", { queued: existing.length, apiCallCount: 0, reserveCount: (await repository.reserveCandidates()).length });
  const registry = settings.mode === "no_upload_daily_69" ? (input.usageEvidenceRegistry ?? await loadUsageEvidenceRegistry()) : null;
  const readiness = readCoupangPartnersEnv(process.env).readiness;
  const sharedEnvReady = readiness.provider_enabled && readiness.access_key_present && readiness.secret_key_present && readiness.customer_id_or_partner_id_present;
  // A readiness override is test-only and requires an injected search adapter.
  // The real provider path must always use the authoritative process.env reader.
  const providerReady = input.search ? (input.providerReady ?? sharedEnvReady) : sharedEnvReady;
  if (!providerReady) throw new Error("COUPANG_PROVIDER_NOT_CONFIGURED");
  const supportedUseCases = registry ? [...new Set(registry.packs.map((pack) => pack.useCase))].filter((useCase): useCase is SupportedUsageEvidenceUseCase => eligiblePacksForUseCase(registry, useCase).length >= 2) : [];
  const { contexts } = settings.mode === "no_upload_daily_69" ? buildDaily69KeywordContexts(now, settings.maxProviderCalls, supportedUseCases) : buildLiveProductKeywordContexts(now);
  const providerResults: LiveCoupangProviderResult[] = [];
  const search = input.search ?? searchLiveCoupangProducts;
  let apiCallCount = 0;
  let raw = [] as LiveCoupangProviderResult["products"];
  let candidates = raw.map(normalizeLiveProduct);
  const usageEvidenceAvailable = registry ? (candidate: Parameters<typeof supportsUsageEvidence>[0]) => candidate.useCase !== "unsupported" && eligiblePacksForUseCase(registry, candidate.useCase).length >= 2 : supportsUsageEvidence;
  let ranked = rankLiveProducts({ candidates, keywordContexts: contexts, usageEvidenceAvailable });
  let capacityPlan: UsageCapacityPlan | null = null;
  for (const context of contexts) {
    if (apiCallCount >= settings.maxProviderCalls || raw.length >= settings.maxRawDiscoveries) break;
    const result = await search({ context, limit: Math.min(10, settings.maxRawDiscoveries - raw.length), allowDeeplink: settings.maxProviderCalls - apiCallCount >= 2 });
    providerResults.push(result);
    apiCallCount += result.apiCallCount;
    raw = providerResults.flatMap((entry) => entry.products).slice(0, settings.maxRawDiscoveries);
    candidates = raw.map(normalizeLiveProduct);
    ranked = rankLiveProducts({ candidates, keywordContexts: contexts, usageEvidenceAvailable });
    if (isTerminalProviderFailure(result)) break;
    if (registry) {
      capacityPlan = planUsageEvidenceCapacity({ ranked, registry, settings, existing, rawCount: raw.length, normalizedCount: candidates.length });
      if (capacityPlan.diagnostics.activeShortfall === 0 && capacityPlan.diagnostics.reserveShortfall === 0) break;
    }
  }
  if (registry) capacityPlan = planUsageEvidenceCapacity({ ranked, registry, settings, existing, rawCount: raw.length, normalizedCount: candidates.length });
  const insertion = await repository.insertRanked({ ranked, queueDate, now, dueNow: input.dueNow, capacityPlan: capacityPlan ?? undefined });
  const capacityReady = insertion.queued.length + existing.length === settings.dailyTargetCount && insertion.reserveCount >= settings.minimumReserveCount;
  const run: LocalRun = { runId, type: "nightly_discovery", status: capacityReady ? "success" : "partial", startedAt, finishedAt: new Date().toISOString(), claimed: 0, completed: insertion.queued.length, failed: 0, retried: 0, safeMessage: capacityReady ? "NIGHTLY_QUEUE_CREATED" : insertion.queued.length ? "DAILY_69_DIVERSITY_CAPACITY_INSUFFICIENT" : "NIGHTLY_NO_NEW_ITEMS", metrics: { queueDate, apiCallCount, providerQueryCount: providerResults.length, discovered: raw.length, normalized: candidates.length, eligible: ranked.filter((entry) => entry.score.eligible).length, selected: insertion.queued.length, reserveAdded: insertion.reserveAdded, reserveCount: insertion.reserveCount, requiredReserveCount: settings.minimumReserveCount, duplicateSkipped: insertion.duplicateSkipped, durationSeconds: Math.round((performance.now() - started) / 10) / 100, ...(capacityPlan?.diagnostics ?? {}), ...QUEUE_SCHEDULER_FLAGS } };
  await repository.addRun(run);
  return { run, queued: insertion.queued, ranked, providerResults, rawCandidates: raw, normalizedCandidates: candidates };
}

async function recordNoop(repository: LocalQueueRepository, runId: string, startedAt: string, safeMessage: string, metrics: Record<string, number> = {}) { const run: LocalRun = { runId, type: "nightly_discovery", status: "noop", startedAt, finishedAt: new Date().toISOString(), claimed: 0, completed: 0, failed: 0, retried: 0, safeMessage, metrics: { ...metrics, ...QUEUE_SCHEDULER_FLAGS } }; await repository.addRun(run); return { run, queued: [], ranked: [], providerResults: [], rawCandidates: [], normalizedCandidates: [] }; }

function isTerminalProviderFailure(result: LiveCoupangProviderResult) {
  return Boolean(result.blocker && /(HTTP_401|HTTP_403|HTTP_429|NETWORK_FAILED|RESPONSE_INVALID)$/u.test(result.blocker));
}
