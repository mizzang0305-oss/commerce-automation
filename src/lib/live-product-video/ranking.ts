import { buildCoupangCandidate } from "@/lib/coupang/coupangCandidateImport";
import { scoreEventAwareCandidate } from "@/lib/coupang/eventCandidateRanking";
import { SUPPORTED_USAGE_EVIDENCE_USE_CASES, type SupportedUsageEvidenceUseCase } from "@/lib/usage-evidence";
import type { LiveProductCandidate, LiveProductKeywordContext, LiveProductScore, RankedLiveProduct } from "./types";

export function rankLiveProducts(input: {
  candidates: LiveProductCandidate[];
  keywordContexts: LiveProductKeywordContext[];
  usageEvidenceAvailable: (candidate: LiveProductCandidate) => boolean;
}): RankedLiveProduct[] {
  const seenKeys = new Set<string>();
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const ranked = input.candidates.map((candidate) => {
    const context = input.keywordContexts.find((entry) => entry.keyword === candidate.sourceKeyword);
    const blockers: string[] = [];
    let duplicatePenalty = 0;
    const comparableName = normalize(candidate.canonicalProductName);
    if (seenKeys.has(candidate.productKey) || (candidate.rawProductId && seenIds.has(candidate.rawProductId)) || seenNames.has(comparableName)) {
      duplicatePenalty = 100;
      blockers.push("DUPLICATE_PRODUCT");
    } else {
      seenKeys.add(candidate.productKey);
      if (candidate.rawProductId) seenIds.add(candidate.rawProductId);
      seenNames.add(comparableName);
    }
    if (!context) blockers.push("EVENT_CONTEXT_MISSING");
    if (candidate.useCase === "unsupported" || !input.usageEvidenceAvailable(candidate)) blockers.push("USAGE_EVIDENCE_NOT_AVAILABLE");
    const imported = buildCoupangCandidate({
      product_name: candidate.rawProductName,
      raw_coupang_url: candidate.rawProductUrl,
      selected_affiliate_url: candidate.selectedAffiliateUrl,
      productImage: candidate.productImageUrls[0] ?? "",
      price_now_text: candidate.priceText,
      category_path: candidate.categoryPath,
      source_type: "live_product_video_v1",
      source: candidate.sourceProvider
    }).candidate;
    const base = context
      ? scoreEventAwareCandidate(imported, {
          ...context.plan,
          primaryKeywords: [...new Set([
            candidate.sourceKeyword,
            ...candidate.sourceKeyword.split(/\s+/u).filter((keyword) => keyword.length >= 2),
            ...context.plan.primaryKeywords
          ])],
          preferredCategories: [...new Set([
            ...preferredCategoriesFor(candidate.useCase),
            ...context.plan.preferredCategories
          ])]
        })
      : zeroScore(candidate.candidateId);
    if (base.policySafetyScore !== 100) blockers.push("POLICY_BLOCKED");
    if (base.eventRelevanceScore < 60) blockers.push("EVENT_RELEVANCE_LOW");
    if (base.motionSuitabilityScore < 60) blockers.push("MOTION_SUITABILITY_LOW");
    if (base.imageReadinessScore !== 100) blockers.push("PRODUCT_IMAGE_NOT_READY");
    if (base.affiliateReadinessScore !== 100) blockers.push("AFFILIATE_NOT_READY");
    const usageEvidenceScore = blockers.includes("USAGE_EVIDENCE_NOT_AVAILABLE") ? 0 : 100;
    const finalProductScore = Math.max(0, Math.min(100, Math.round(base.finalScore * 0.9 + usageEvidenceScore * 0.1 - duplicatePenalty)));
    const score: LiveProductScore = {
      productKey: candidate.productKey,
      eventRelevanceScore: base.eventRelevanceScore,
      motionSuitabilityScore: base.motionSuitabilityScore,
      policySafetyScore: base.policySafetyScore,
      imageReadinessScore: base.imageReadinessScore,
      affiliateReadinessScore: base.affiliateReadinessScore,
      duplicatePenalty,
      usageEvidenceScore,
      finalProductScore,
      selectionRank: 0,
      eligible: blockers.length === 0,
      blockers: [...new Set(blockers)]
    };
    return { candidate, score };
  }).sort((left, right) => right.score.finalProductScore - left.score.finalProductScore || left.candidate.productKey.localeCompare(right.candidate.productKey));
  return ranked.map((entry, index) => ({ ...entry, score: { ...entry.score, selectionRank: index + 1 } }));
}

export function selectDistinctLiveProductSlots(input: {
  ranked: RankedLiveProduct[];
  maxAttemptsPerSlot?: number;
}): { selected: RankedLiveProduct[]; attempts: Record<string, number>; rejected: Array<{ productKey: string; reasons: string[] }> } {
  const maxAttempts = input.maxAttemptsPerSlot ?? 3;
  const selected: RankedLiveProduct[] = [];
  const attempts: Record<string, number> = {};
  const rejected = input.ranked.filter((entry) => !entry.score.eligible).map((entry) => ({ productKey: entry.candidate.productKey, reasons: entry.score.blockers }));
  for (const useCase of Object.keys(SUPPORTED_USAGE_EVIDENCE_USE_CASES) as SupportedUsageEvidenceUseCase[]) {
    const pool = input.ranked.filter((entry) => entry.candidate.useCase === useCase);
    attempts[useCase] = Math.min(pool.length, maxAttempts);
    const chosen = pool.slice(0, maxAttempts).find((entry) => entry.score.eligible);
    if (chosen) selected.push(chosen);
  }
  return { selected, attempts, rejected };
}

function zeroScore(candidateId: string) {
  return { candidateId, eventRelevanceScore: 0, motionSuitabilityScore: 0, policySafetyScore: 0, imageReadinessScore: 0, affiliateReadinessScore: 0, duplicatePenalty: 0, finalScore: 0 };
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^가-힣a-z0-9]/gu, "");
}

function preferredCategoriesFor(useCase: LiveProductCandidate["useCase"]): string[] {
  if (useCase.startsWith("vehicle")) return ["자동차용품", "차량", "수납"];
  if (useCase === "desk_organization" || useCase === "cable_organization") return ["수납", "정리", "문구", "디지털"];
  if (useCase === "laundry_drying" || useCase === "laundry_space_organization") return ["세탁", "건조", "캠핑", "가구"];
  return [];
}
