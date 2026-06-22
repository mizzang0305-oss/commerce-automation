import type { EventProductKeywordPlan } from "@/lib/coupang/eventProductKeywordPlanner";
import type { ProductCandidate } from "@/types/automation";

export interface EventAwareCandidateScore {
  candidateId: string;
  eventRelevanceScore: number;
  motionSuitabilityScore: number;
  policySafetyScore: number;
  imageReadinessScore: number;
  affiliateReadinessScore: number;
  duplicatePenalty: number;
  finalScore: number;
}

export type EventAwareRankedCandidate = {
  candidate: ProductCandidate;
  score: EventAwareCandidateScore;
};

const MOTION_FRIENDLY_TERMS = [
  "생활",
  "주방",
  "정리",
  "수납",
  "캠핑",
  "방수",
  "제습",
  "빨래",
  "선풍기",
  "보냉",
  "우산",
  "문구",
  "포장",
  "장식",
  "차량",
  "침구",
  "보관",
  "커버"
];

const GLOBAL_BLOCKED_KEYWORDS = [
  "성인",
  "19금",
  "의약",
  "처방",
  "건강기능",
  "영양제",
  "보조제",
  "다이어트",
  "주류",
  "맥주",
  "와인",
  "담배",
  "전자담배",
  "도검",
  "무기",
  "도박",
  "카지노",
  "가품",
  "명품",
  "정품보장",
  "최저가",
  "효능",
  "치료"
];

export function rankEventAwareCandidates(
  candidates: ProductCandidate[],
  plan: EventProductKeywordPlan,
  input: {
    baselineCandidateId?: string;
    baselineProductKeys?: string[];
    baselineProductNames?: string[];
    minEventRelevanceScore?: number;
  } = {}
): EventAwareRankedCandidate[] {
  const minEventRelevanceScore = input.minEventRelevanceScore ?? 60;
  return candidates
    .map((candidate) => ({
      candidate,
      score: scoreEventAwareCandidate(candidate, plan, input)
    }))
    .filter(({ score }) =>
      score.eventRelevanceScore >= minEventRelevanceScore &&
      score.policySafetyScore === 100 &&
      score.imageReadinessScore === 100 &&
      score.affiliateReadinessScore === 100 &&
      score.duplicatePenalty < 100
    )
    .sort((a, b) => b.score.finalScore - a.score.finalScore || a.candidate.id.localeCompare(b.candidate.id));
}

export function scoreEventAwareCandidate(
  candidate: ProductCandidate,
  plan: EventProductKeywordPlan,
  input: {
    baselineCandidateId?: string;
    baselineProductKeys?: string[];
    baselineProductNames?: string[];
  } = {}
): EventAwareCandidateScore {
  const policy = isPolicySafeEventCandidate(candidate, plan);
  const eventRelevanceScore = scoreEventRelevance(candidate, plan);
  const motionSuitabilityScore = scoreMotionSuitability(candidate, plan);
  const imageReadinessScore = hasImage(candidate) ? 100 : 0;
  const affiliateReadinessScore = hasAffiliate(candidate) ? 100 : 0;
  const duplicatePenalty = scoreDuplicatePenalty(candidate, input);
  const policySafetyScore = policy.ok ? 100 : 0;
  const weighted =
    eventRelevanceScore * 0.35 +
    motionSuitabilityScore * 0.25 +
    policySafetyScore * 0.2 +
    imageReadinessScore * 0.1 +
    affiliateReadinessScore * 0.1 -
    duplicatePenalty;

  return {
    candidateId: candidate.id,
    eventRelevanceScore,
    motionSuitabilityScore,
    policySafetyScore,
    imageReadinessScore,
    affiliateReadinessScore,
    duplicatePenalty,
    finalScore: Math.max(0, Math.min(100, Math.round(weighted)))
  };
}

export function isPolicySafeEventCandidate(candidate: ProductCandidate, plan: EventProductKeywordPlan) {
  const searchable = normalize(`${candidate.product_name} ${candidate.category ?? ""} ${payloadString(candidate, "category_path")}`);
  const blockedReasons = new Set<string>();
  const blockedKeywords = [...GLOBAL_BLOCKED_KEYWORDS, ...plan.excludedKeywords].map(normalize).filter(Boolean);
  const blockedCategories = plan.blockedCategories.map(normalize).filter(Boolean);

  if (blockedKeywords.some((keyword) => searchable.includes(keyword))) {
    blockedReasons.add("policy_risky_keyword");
  }
  if (blockedCategories.some((category) => searchable.includes(category))) {
    blockedReasons.add("policy_risky_category");
  }

  return {
    ok: blockedReasons.size === 0,
    blocked_reasons: [...blockedReasons]
  };
}

export function hasAffiliate(candidate: ProductCandidate) {
  return Boolean(candidate.selected_affiliate_url?.trim());
}

export function hasImage(candidate: ProductCandidate) {
  return Boolean(
    payloadString(candidate, "thumbnail_url") ||
    payloadString(candidate, "image_url") ||
    payloadString(candidate, "product_image_url") ||
    payloadString(candidate, "productImage") ||
    payloadString(candidate, "productImageUrl")
  );
}

function scoreEventRelevance(candidate: ProductCandidate, plan: EventProductKeywordPlan) {
  const searchable = normalize(`${candidate.product_name} ${candidate.category ?? ""} ${payloadString(candidate, "category_path")}`);
  let score = 0;
  if (plan.primaryKeywords.some((keyword) => searchable.includes(normalize(keyword)))) {
    score += 70;
  }
  if (plan.secondaryKeywords.some((keyword) => searchable.includes(normalize(keyword)))) {
    score += 30;
  }
  if (plan.preferredCategories.some((category) => searchable.includes(normalize(category)))) {
    score += 15;
  }
  return Math.min(100, score);
}

function scoreMotionSuitability(candidate: ProductCandidate, plan: EventProductKeywordPlan) {
  const searchable = normalize(`${candidate.product_name} ${candidate.category ?? ""} ${payloadString(candidate, "category_path")}`);
  let score = 35;
  score += MOTION_FRIENDLY_TERMS.filter((term) => searchable.includes(normalize(term))).length * 12;
  score += plan.preferredCategories.filter((category) => searchable.includes(normalize(category))).length * 10;
  if (searchable.includes("세트") || searchable.includes("정리") || searchable.includes("보관")) {
    score += 10;
  }
  return Math.min(100, score);
}

function scoreDuplicatePenalty(
  candidate: ProductCandidate,
  input: {
    baselineCandidateId?: string;
    baselineProductKeys?: string[];
    baselineProductNames?: string[];
  }
) {
  if (candidate.id === input.baselineCandidateId) {
    return 100;
  }
  const productKey = candidate.product_key ?? "";
  if (productKey && input.baselineProductKeys?.includes(productKey)) {
    return 100;
  }
  const productName = normalize(candidate.product_name);
  if (productName && input.baselineProductNames?.map(normalize).includes(productName)) {
    return 100;
  }
  if (candidate.duplicate_status && candidate.duplicate_status !== "unique") {
    return 40;
  }
  return 0;
}

function payloadString(candidate: ProductCandidate, key: string) {
  const value = candidate.payload?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, "");
}
