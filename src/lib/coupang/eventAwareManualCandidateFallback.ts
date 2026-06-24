import { createHash } from "node:crypto";

import type { ProductCandidate } from "@/types/automation";

export const COUPANG_PARTNERS_401_EXTERNAL_VERIFICATION_BLOCKER =
  "COUPANG_PARTNERS_API_HTTP_401_PERSISTED_AFTER_EXTERNAL_VERIFICATION";
export const MANUAL_EVENT_CANDIDATE_SOURCE = "manual_event_candidate";

export type ManualEventCandidateFallbackBlocker =
  | "MANUAL_EVENT_CANDIDATE_FALLBACK_REQUIRES_PERSISTENT_401"
  | "MANUAL_EVENT_CANDIDATE_PRODUCT_NAME_MISSING"
  | "MANUAL_EVENT_CANDIDATE_AFFILIATE_URL_MISSING"
  | "MANUAL_EVENT_CANDIDATE_AFFILIATE_URL_INVALID"
  | "MANUAL_EVENT_CANDIDATE_IMAGE_URL_MISSING"
  | "MANUAL_EVENT_CANDIDATE_IMAGE_URL_INVALID"
  | "MANUAL_EVENT_CANDIDATE_BASELINE_BLOCKED"
  | "MANUAL_EVENT_CANDIDATE_EVENT_RELEVANCE_TOO_LOW"
  | "MANUAL_EVENT_CANDIDATE_POLICY_RISK"
  | "MANUAL_EVENT_CANDIDATE_LOW_COST_MOTION_UNSUITABLE";

export type ManualEventCandidateFallbackEvent = {
  event_id: string;
  event_name: string;
  event_type: string;
};

export type ManualEventCandidateFallbackInput = {
  current_blocker: string;
  event: ManualEventCandidateFallbackEvent;
  selected_keyword: string;
  product_name: string;
  category: string;
  affiliate_url: string;
  product_image_url: string;
  baseline_candidate_id: string;
  baseline_product_names?: string[];
  baseline_product_keys?: string[];
  candidate_id?: string;
  now?: string;
};

export type ManualEventCandidateFallbackSafeSummary = {
  source: typeof MANUAL_EVENT_CANDIDATE_SOURCE;
  event_id: string;
  event_name: string;
  event_type: string;
  selected_keyword: string;
  product_name_present: boolean;
  category_present: boolean;
  affiliate_url_present: boolean;
  product_image_present: boolean;
  baseline_candidate_excluded: boolean;
  event_relevance_score: number;
  motion_suitability_score: number;
  policy_risk_clear: boolean;
  low_cost_motion_suitable: boolean;
  ready_for_low_cost_motion_v1_1_render: boolean;
  raw_affiliate_url_printed: false;
  raw_image_url_printed: false;
  raw_urls_masked: true;
};

export type ManualEventCandidateFallbackSideEffects = {
  partners_api_called: false;
  external_scout_called: false;
  candidate_insert_update: false;
  render_attempted: false;
  mp4_created: false;
  r2_upload_write: false;
  product_assets_write: false;
  db_write: false;
  youtube_execute: false;
  videos_insert: false;
  public_upload: false;
  unlisted_upload: false;
};

export type ManualEventCandidateFallbackResult =
  | {
      ok: true;
      blocked_reasons: [];
      candidate: ProductCandidate;
      safe_candidate: {
        id: string;
        product_name: string;
        category: string;
      };
      safe_summary: ManualEventCandidateFallbackSafeSummary;
      side_effects: ManualEventCandidateFallbackSideEffects;
    }
  | {
      ok: false;
      blocked_reasons: ManualEventCandidateFallbackBlocker[];
      candidate: null;
      safe_candidate: null;
      safe_summary: ManualEventCandidateFallbackSafeSummary;
      side_effects: ManualEventCandidateFallbackSideEffects;
    };

const POLICY_RISK_KEYWORDS = [
  "adult",
  "alcohol",
  "weapon",
  "medical",
  "medicine",
  "diet",
  "health claim",
  "guaranteed",
  "fake",
  "성인",
  "주류",
  "무기",
  "의약",
  "의료",
  "건강기능",
  "다이어트",
  "최저가",
  "가품",
  "치료"
];

const MOTION_SUITABLE_TERMS = [
  "drying",
  "rack",
  "stand",
  "organizer",
  "storage",
  "home",
  "laundry",
  "living",
  "빨래",
  "건조",
  "건조대",
  "정리",
  "수납",
  "생활",
  "실내"
];

export function buildCoupangPartners401FinalLock() {
  return {
    current_blocker: COUPANG_PARTNERS_401_EXTERNAL_VERIFICATION_BLOCKER,
    live_scout_retry_allowed_now: false,
    external_verification_done: true,
    final_live_retry_status: "HTTP_401",
    retry_loop_blocked: true,
    manual_fallback_source: MANUAL_EVENT_CANDIDATE_SOURCE,
    side_effects: noSideEffects()
  };
}

export function buildEventAwareManualCandidateFallback(
  input: ManualEventCandidateFallbackInput
): ManualEventCandidateFallbackResult {
  const productName = text(input.product_name);
  const category = text(input.category);
  const affiliateUrl = text(input.affiliate_url);
  const productImageUrl = text(input.product_image_url);
  const selectedKeyword = text(input.selected_keyword);
  const event = normalizeEvent(input.event);
  const candidateId = text(input.candidate_id) || buildManualCandidateId({
    productName,
    category,
    selectedKeyword,
    eventId: event.event_id
  });
  const productKey = buildManualProductKey({
    productName,
    category,
    selectedKeyword,
    eventId: event.event_id
  });
  const eventRelevanceScore = scoreEventRelevance({ productName, category, selectedKeyword, event });
  const motionSuitabilityScore = scoreMotionSuitability({ productName, category, selectedKeyword });
  const policyRiskClear = isPolicyRiskClear({ productName, category });
  const baselineExcluded = isBaselineExcluded({
    candidateId,
    productKey,
    productName,
    baselineCandidateId: input.baseline_candidate_id,
    baselineProductKeys: input.baseline_product_keys ?? [],
    baselineProductNames: input.baseline_product_names ?? []
  });
  const lowCostMotionSuitable = motionSuitabilityScore >= 60;
  const safeSummary = safeSummaryFor({
    event,
    selectedKeyword,
    productName,
    category,
    affiliateUrl,
    productImageUrl,
    baselineExcluded,
    eventRelevanceScore,
    motionSuitabilityScore,
    policyRiskClear,
    lowCostMotionSuitable,
    ready: false
  });
  const blockedReasons: ManualEventCandidateFallbackBlocker[] = [];

  if (input.current_blocker !== COUPANG_PARTNERS_401_EXTERNAL_VERIFICATION_BLOCKER) {
    blockedReasons.push("MANUAL_EVENT_CANDIDATE_FALLBACK_REQUIRES_PERSISTENT_401");
  }
  if (!productName) {
    blockedReasons.push("MANUAL_EVENT_CANDIDATE_PRODUCT_NAME_MISSING");
  }
  if (!affiliateUrl) {
    blockedReasons.push("MANUAL_EVENT_CANDIDATE_AFFILIATE_URL_MISSING");
  } else if (!isSafeAffiliateUrl(affiliateUrl)) {
    blockedReasons.push("MANUAL_EVENT_CANDIDATE_AFFILIATE_URL_INVALID");
  }
  if (!productImageUrl) {
    blockedReasons.push("MANUAL_EVENT_CANDIDATE_IMAGE_URL_MISSING");
  } else if (!isSafeHttpUrl(productImageUrl)) {
    blockedReasons.push("MANUAL_EVENT_CANDIDATE_IMAGE_URL_INVALID");
  }
  if (!baselineExcluded) {
    blockedReasons.push("MANUAL_EVENT_CANDIDATE_BASELINE_BLOCKED");
  }
  if (eventRelevanceScore < 60) {
    blockedReasons.push("MANUAL_EVENT_CANDIDATE_EVENT_RELEVANCE_TOO_LOW");
  }
  if (!policyRiskClear) {
    blockedReasons.push("MANUAL_EVENT_CANDIDATE_POLICY_RISK");
  }
  if (!lowCostMotionSuitable) {
    blockedReasons.push("MANUAL_EVENT_CANDIDATE_LOW_COST_MOTION_UNSUITABLE");
  }

  const ready = blockedReasons.length === 0;
  const finalSafeSummary = {
    ...safeSummary,
    ready_for_low_cost_motion_v1_1_render: ready
  };

  if (!ready) {
    return {
      ok: false,
      blocked_reasons: unique(blockedReasons),
      candidate: null,
      safe_candidate: null,
      safe_summary: finalSafeSummary,
      side_effects: noSideEffects()
    };
  }

  const now = text(input.now) || new Date().toISOString();
  const candidate: ProductCandidate = {
    id: candidateId,
    product_name: productName,
    raw_coupang_url: "",
    selected_affiliate_url: affiliateUrl,
    product_key: productKey,
    platform: "coupang",
    source_type: MANUAL_EVENT_CANDIDATE_SOURCE,
    source_name: MANUAL_EVENT_CANDIDATE_SOURCE,
    category,
    candidate_score: Math.round((eventRelevanceScore + motionSuitabilityScore) / 2),
    score_reason: "manual event candidate fallback after persistent Coupang Partners HTTP 401",
    duplicate_status: "unique",
    promotion_status: "ready",
    payload: {
      source: MANUAL_EVENT_CANDIDATE_SOURCE,
      event_id: event.event_id,
      event_name: event.event_name,
      event_type: event.event_type,
      selected_keyword: selectedKeyword,
      thumbnail_url: productImageUrl,
      image_url: productImageUrl,
      product_image_url: productImageUrl,
      affiliate_validation_status: "valid",
      image_readiness_status: "ready",
      event_relevance_score: eventRelevanceScore,
      motion_suitability_score: motionSuitabilityScore,
      policy_risk_clear: policyRiskClear,
      low_cost_motion_suitable: lowCostMotionSuitable,
      raw_urls_masked_in_safe_summary: true
    },
    created_at: now,
    updated_at: now
  };

  return {
    ok: true,
    blocked_reasons: [],
    candidate,
    safe_candidate: {
      id: candidate.id,
      product_name: candidate.product_name,
      category: candidate.category ?? ""
    },
    safe_summary: finalSafeSummary,
    side_effects: noSideEffects()
  };
}

function normalizeEvent(event: ManualEventCandidateFallbackEvent): ManualEventCandidateFallbackEvent {
  return {
    event_id: text(event.event_id),
    event_name: text(event.event_name),
    event_type: text(event.event_type)
  };
}

function safeSummaryFor(input: {
  event: ManualEventCandidateFallbackEvent;
  selectedKeyword: string;
  productName: string;
  category: string;
  affiliateUrl: string;
  productImageUrl: string;
  baselineExcluded: boolean;
  eventRelevanceScore: number;
  motionSuitabilityScore: number;
  policyRiskClear: boolean;
  lowCostMotionSuitable: boolean;
  ready: boolean;
}): ManualEventCandidateFallbackSafeSummary {
  return {
    source: MANUAL_EVENT_CANDIDATE_SOURCE,
    event_id: input.event.event_id,
    event_name: input.event.event_name,
    event_type: input.event.event_type,
    selected_keyword: input.selectedKeyword,
    product_name_present: Boolean(input.productName),
    category_present: Boolean(input.category),
    affiliate_url_present: Boolean(input.affiliateUrl),
    product_image_present: Boolean(input.productImageUrl),
    baseline_candidate_excluded: input.baselineExcluded,
    event_relevance_score: input.eventRelevanceScore,
    motion_suitability_score: input.motionSuitabilityScore,
    policy_risk_clear: input.policyRiskClear,
    low_cost_motion_suitable: input.lowCostMotionSuitable,
    ready_for_low_cost_motion_v1_1_render: input.ready,
    raw_affiliate_url_printed: false,
    raw_image_url_printed: false,
    raw_urls_masked: true
  };
}

function isBaselineExcluded(input: {
  candidateId: string;
  productKey: string;
  productName: string;
  baselineCandidateId: string;
  baselineProductKeys: string[];
  baselineProductNames: string[];
}) {
  if (!text(input.baselineCandidateId)) {
    return false;
  }
  if (input.candidateId === input.baselineCandidateId) {
    return false;
  }
  if (input.productKey && input.baselineProductKeys.includes(input.productKey)) {
    return false;
  }
  const candidateName = comparable(input.productName);
  return !input.baselineProductNames.map(comparable).includes(candidateName);
}

function scoreEventRelevance(input: {
  productName: string;
  category: string;
  selectedKeyword: string;
  event: ManualEventCandidateFallbackEvent;
}) {
  const searchable = comparable(`${input.productName} ${input.category}`);
  const keyword = comparable(input.selectedKeyword);
  let score = 0;
  if (keyword && searchable.includes(keyword)) {
    score += 75;
  }
  const eventTokens = tokenize(`${input.event.event_name} ${input.event.event_type}`);
  score += Math.min(25, eventTokens.filter((token) => token.length >= 4 && searchable.includes(token)).length * 10);
  return Math.min(100, score);
}

function scoreMotionSuitability(input: { productName: string; category: string; selectedKeyword: string }) {
  const searchable = comparable(`${input.productName} ${input.category} ${input.selectedKeyword}`);
  let score = 35;
  for (const term of MOTION_SUITABLE_TERMS) {
    if (searchable.includes(comparable(term))) {
      score += 12;
    }
  }
  if (input.category.trim()) {
    score += 8;
  }
  return Math.min(100, score);
}

function isPolicyRiskClear(input: { productName: string; category: string }) {
  const searchable = comparable(`${input.productName} ${input.category}`);
  return !POLICY_RISK_KEYWORDS.some((keyword) => searchable.includes(comparable(keyword)));
}

function isSafeAffiliateUrl(value: string) {
  const parsed = parseUrl(value);
  if (!parsed) {
    return false;
  }
  return parsed.protocol === "https:" && parsed.hostname === "link.coupang.com";
}

function isSafeHttpUrl(value: string) {
  const parsed = parseUrl(value);
  return Boolean(parsed && ["http:", "https:"].includes(parsed.protocol));
}

function parseUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function buildManualCandidateId(input: {
  productName: string;
  category: string;
  selectedKeyword: string;
  eventId: string;
}) {
  return `candidate-manual-event-${digest(input).slice(0, 16)}`;
}

function buildManualProductKey(input: {
  productName: string;
  category: string;
  selectedKeyword: string;
  eventId: string;
}) {
  return `manual_event:${input.eventId}:${digest(input).slice(0, 24)}`;
}

function digest(input: Record<string, string>) {
  return createHash("sha256")
    .update(Object.values(input).map(comparable).join("|"))
    .digest("hex");
}

function noSideEffects(): ManualEventCandidateFallbackSideEffects {
  return {
    partners_api_called: false,
    external_scout_called: false,
    candidate_insert_update: false,
    render_attempted: false,
    mp4_created: false,
    r2_upload_write: false,
    product_assets_write: false,
    db_write: false,
    youtube_execute: false,
    videos_insert: false,
    public_upload: false,
    unlisted_upload: false
  };
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9가-힣]+/u)
    .map((token) => token.trim())
    .filter(Boolean);
}

function comparable(value: string) {
  return value.toLowerCase().replace(/\s+/g, "");
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}
