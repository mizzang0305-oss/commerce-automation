import { createHash } from "node:crypto";
import type { SimpleProducerConfig, SimpleProducerState } from "@/lib/simple-producer/types";
import type { YouTubePublicPublisherState } from "@/lib/youtube-public-publisher/publisher";
import { buildLiveProductKeywordContexts } from "@/lib/live-product-video/keywordPlan";
import { searchLiveCoupangProducts } from "@/lib/live-product-video/liveCoupangProvider";
import { normalizeLiveProduct } from "@/lib/live-product-video/normalizer";
import { rankLiveProducts } from "@/lib/live-product-video/ranking";
import { resolveOwnerReviewedUsageEvidence } from "@/lib/live-product-video/usageEvidence";
import type { LiveProductCandidate } from "@/lib/live-product-video/types";
import type { StudioCandidate } from "@/lib/commerce-studio/bridge/contracts";
import { STUDIO_CANDIDATE_MAX_AGE_MS } from "@/lib/commerce-studio/candidates/policy";

const MAX_SEARCHES = 5;
const MAX_CANDIDATES_PER_SLOT = 10;
const EXACT_ID = /^coupang:product:\d+:item:\d+:vendor:\d+$/u;

export type StudioScoutResult = { ok: boolean; safeError: string | null; candidates: StudioCandidate[];
  searchCalls: number; rawProductsFound: number; eligibleProductsFound: number; cacheHit: boolean };

export async function scoutStudioCandidates(input: {
  now: Date;
  config: SimpleProducerConfig;
  state: SimpleProducerState;
  publisher: Pick<YouTubePublicPublisherState, "jobs" | "ledger">;
  assetRoot: string;
  search?: typeof searchLiveCoupangProducts;
  resolveUsage?: typeof resolveOwnerReviewedUsageEvidence;
}): Promise<StudioScoutResult> {
  const previousTime = Date.parse(input.state.studioCandidatesScoutedAt ?? "");
  if (Array.isArray(input.state.studioCandidates) && Number.isFinite(previousTime) &&
      input.now.getTime() >= previousTime && input.now.getTime() - previousTime < STUDIO_CANDIDATE_MAX_AGE_MS)
    return { ok: true, safeError: null, candidates: input.state.studioCandidates,
      searchCalls: 0, rawProductsFound: 0, eligibleProductsFound: input.state.studioCandidates.filter((c) => c.eligible).length,
      cacheHit: true };

  const slots = upcomingSlots(input.now, input.config.generationSlots);
  if (!slots.length) return { ok: true, safeError: null, candidates: [], searchCalls: 0,
    rawProductsFound: 0, eligibleProductsFound: 0, cacheHit: false };
  const contexts = buildLiveProductKeywordContexts(input.now).contexts.slice(0, MAX_SEARCHES);
  if (!contexts.length) return failure("STUDIO_SCOUT_NO_KEYWORD_CONTEXT");
  const provider = input.search ?? searchLiveCoupangProducts;
  const raw = [] as Awaited<ReturnType<typeof provider>>["products"];
  let searchCalls = 0;
  for (const context of contexts) {
    const result = await provider({ context, limit: MAX_CANDIDATES_PER_SLOT, now: input.now });
    searchCalls += result.searchApiCalled ? 1 : 0;
    if (!result.configured) return failure("STUDIO_SCOUT_PROVIDER_NOT_CONFIGURED", searchCalls);
    if (!result.ok && result.blocker !== "COUPANG_PARTNERS_SEARCH_EMPTY" &&
        result.blocker !== "COUPANG_PARTNERS_PRODUCTS_INVALID")
      return failure("STUDIO_SCOUT_PROVIDER_FAILED", searchCalls);
    raw.push(...result.products);
  }
  const normalized: LiveProductCandidate[] = [];
  for (const product of raw) {
    try {
      const candidate = normalizeLiveProduct(product);
      if (EXACT_ID.test(candidate.productKey)) normalized.push(candidate);
    } catch { /* A malformed product is a bounded candidate rejection. */ }
  }
  const usageReady = new Set<string>();
  const usageResolver = input.resolveUsage ?? resolveOwnerReviewedUsageEvidence;
  for (const candidate of normalized) {
    if (candidate.useCase !== "vehicle_organization" && candidate.useCase !== "laundry_drying") continue;
    if (usageReady.has(candidate.productKey)) continue;
    if (await usageResolver({ candidate, assetRoot: input.assetRoot })) usageReady.add(candidate.productKey);
  }
  const ranked = rankLiveProducts({ candidates: normalized, keywordContexts: contexts,
    usageEvidenceAvailable: (candidate) => usageReady.has(candidate.productKey) });
  const used = new Set([
    ...input.publisher.jobs.map((job) => job.productId), ...input.publisher.ledger.map((entry) => entry.productId),
    ...input.state.slots.map((record) => record.productId)
  ].filter(Boolean));
  const reserved = new Set((input.state.studioPlans ?? [])
    .filter((plan) => ["selected", "claimed", "completed"].includes(plan.status))
    .map((plan) => plan.exactProductId).filter((id): id is string => Boolean(id)));
  const revision = createHash("sha256").update(JSON.stringify({
    at: input.now.toISOString(), products: ranked.map((entry) => [entry.candidate.productKey, entry.score.finalProductScore])
  })).digest("hex");
  const candidates = slots.flatMap((slotId) => ranked
    .filter((entry) => entry.candidate.useCase === "vehicle_organization" || entry.candidate.useCase === "laundry_drying")
    .slice(0, MAX_CANDIDATES_PER_SLOT)
    .map((entry): StudioCandidate => {
      const product = entry.candidate;
      const channelKey = product.useCase === "vehicle_organization" ? "father_jobs" : "neoman_moleulgeol";
      const safeBlockers = [...entry.score.blockers];
      if (used.has(product.productKey)) safeBlockers.push("STUDIO_PRODUCT_ALREADY_USED");
      if (reserved.has(product.productKey)) safeBlockers.push("STUDIO_PRODUCT_ALREADY_RESERVED");
      return {
        snapshotId: createHash("sha256").update(`${revision}|${slotId}|${product.productKey}`).digest("hex"),
        slotId, sourceRevision: revision, productId: product.productKey,
        productName: product.canonicalProductName, channelKey,
        eligible: safeBlockers.length === 0, eligibilityCheckedAt: input.now.toISOString(), safeBlockers,
        imageUrl: product.productImageUrls[0] ?? null, priceText: product.priceText || null,
        useCase: product.useCase as "vehicle_organization" | "laundry_drying", selectionRank: entry.score.selectionRank
      };
    }));
  return { ok: true, safeError: null, candidates, searchCalls,
    rawProductsFound: raw.length, eligibleProductsFound: candidates.filter((candidate) => candidate.eligible).length,
    cacheHit: false };
}

export function upcomingSlots(now: Date, generationSlots: readonly string[]): string[] {
  const currentKst = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const start = Date.parse(`${currentKst}T00:00:00.000Z`);
  return [0, 1].flatMap((offset) => {
    const date = new Date(start + offset * 86_400_000).toISOString().slice(0, 10);
    return generationSlots.filter((slot) => {
      const time = Date.parse(`${date}T${slot}:00+09:00`);
      return Number.isFinite(time) && time > now.getTime();
    }).map((slot) => `${date}|${slot}`);
  }).slice(0, 6);
}

function failure(safeError: string, searchCalls = 0): StudioScoutResult {
  return { ok: false, safeError, candidates: [], searchCalls, rawProductsFound: 0,
    eligibleProductsFound: 0, cacheHit: false };
}
