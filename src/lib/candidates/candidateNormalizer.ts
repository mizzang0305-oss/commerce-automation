import type { ProductCandidate, ProductionHistory, ProductQueueItem } from "@/types/automation";
import { analyzeCandidateDedupe } from "@/lib/candidates/candidateDedupe";
import { scoreProductCandidate } from "@/lib/candidates/candidateScoring";
import { createCandidateProductKey, detectCandidatePlatform } from "@/lib/candidates/productKey";
import { resolvePromotionStatus } from "@/lib/candidates/candidateDedupe";

export type CandidateQualityContext = {
  candidates?: ProductCandidate[];
  queueItems?: ProductQueueItem[];
  productionHistory?: ProductionHistory[];
};

export function enrichProductCandidate(
  candidate: ProductCandidate,
  context: CandidateQualityContext = {}
): ProductCandidate {
  const productKey = candidate.product_key || createCandidateProductKey(candidate);
  const platform = candidate.platform || detectCandidatePlatform(candidate);
  const sourceType = candidate.source_type || payloadString(candidate, ["source_type", "sourceType", "type"]);
  const sourceName = candidate.source_name || payloadString(candidate, ["source_name", "source"]);
  const category = candidate.category || payloadString(candidate, ["category_path", "category"]);
  const base: ProductCandidate = {
    ...candidate,
    product_key: productKey,
    platform,
    source_type: sourceType,
    source_name: sourceName,
    category
  };
  const score = scoreProductCandidate(base);
  const dedupe = analyzeCandidateDedupe(base, {
    candidates: context.candidates ?? [],
    queueItems: context.queueItems ?? [],
    productionHistory: context.productionHistory ?? []
  });
  const promotionStatus =
    candidate.promotion_status === "promoted"
      ? "promoted"
      : resolvePromotionStatus(base, dedupe.duplicate_status, score.candidate_score);

  return {
    ...base,
    candidate_score: score.candidate_score,
    score_reason: score.score_reason.join(", "),
    duplicate_status: dedupe.duplicate_status,
    duplicate_reason: dedupe.duplicate_reason,
    promotion_status: promotionStatus
  };
}

export function enrichProductCandidates(
  candidates: ProductCandidate[],
  context: Omit<CandidateQualityContext, "candidates"> = {}
): ProductCandidate[] {
  return candidates.map((candidate) =>
    enrichProductCandidate(candidate, {
      ...context,
      candidates
    })
  );
}

function payloadString(candidate: ProductCandidate, keys: string[]) {
  for (const key of keys) {
    const value = candidate.payload[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}
