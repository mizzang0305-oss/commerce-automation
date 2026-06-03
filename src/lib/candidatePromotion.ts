import type {
  CandidateDuplicateStatus,
  CandidatePromotionStatus,
  GeneratedContent,
  ProductCandidate,
  ProductQueueItem,
  ProductionHistory
} from "@/types/automation";
import { getKstDateKey } from "@/lib/workerDailyLimit";
import { analyzeCandidateDedupe, resolvePromotionStatus } from "@/lib/candidates/candidateDedupe";
import { enrichProductCandidate } from "@/lib/candidates/candidateNormalizer";
import { buildImageReadiness, pickBestCandidateImage } from "@/lib/coupang/coupangImage";

export const AFFILIATE_DISCLOSURE_TEXT =
  "이 콘텐츠는 제휴마케팅 활동을 포함하며, 링크를 통한 구매가 발생하면 작성자에게 수수료가 지급됩니다.";

export class CandidatePromotionError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
    this.name = "CandidatePromotionError";
  }
}

export type ProductCandidateFilters = {
  query?: string;
  has_affiliate_url?: "all" | "yes" | "no";
  source?: string;
  category?: string;
  duplicate_status?: "all" | CandidateDuplicateStatus;
  promotion_status?: "all" | CandidatePromotionStatus;
  min_score?: number;
  limit?: number;
};

export type PromoteCandidateOptions = {
  now?: string;
  scheduled_at?: string;
};

export type PromoteCandidateResult = {
  candidate: ProductCandidate;
  queue_item: ProductQueueItem;
  content: GeneratedContent;
  warnings: string[];
};

export type CandidateReadiness = {
  can_promote: boolean;
  status: CandidatePromotionStatus;
  label: string;
  reasons: string[];
  product_key: string;
  candidate_score: number;
  score_reason: string;
  duplicate_status: CandidateDuplicateStatus;
  duplicate_reason: string;
  duplicate_queue_id: string;
  duplicate_source: "queue" | "production_history" | "";
};

type BuildPromotionInput = {
  candidate: ProductCandidate | null;
  queueItems: ProductQueueItem[];
  productionHistory: ProductionHistory[];
  now?: string;
  scheduled_at?: string;
};

export function filterProductCandidates(candidates: ProductCandidate[], filters: ProductCandidateFilters = {}) {
  const query = filters.query?.trim().toLowerCase() ?? "";
  const source = filters.source?.trim().toLowerCase() ?? "";
  const category = filters.category?.trim().toLowerCase() ?? "";

  let rows = candidates
    .filter((candidate) => {
      if (!query) {
        return true;
      }
      return [
        candidate.id,
        candidate.product_name,
        candidate.raw_coupang_url,
        candidate.selected_affiliate_url,
        candidate.product_key ?? "",
        candidate.platform ?? "",
        candidate.source_type ?? "",
        candidate.category ?? ""
      ].some((value) => value.toLowerCase().includes(query));
    })
    .filter((candidate) => {
      if (!filters.has_affiliate_url || filters.has_affiliate_url === "all") {
        return true;
      }
      const hasAffiliate = Boolean(candidate.selected_affiliate_url.trim());
      return filters.has_affiliate_url === "yes" ? hasAffiliate : !hasAffiliate;
    })
    .filter((candidate) => {
      if (!source) {
        return true;
      }
      return [candidate.platform, candidate.source_name, getPayloadString(candidate, "source")]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase() === source);
    })
    .filter((candidate) => {
      if (!category) {
        return true;
      }
      return (candidate.category || getPayloadString(candidate, "category_path")).toLowerCase().includes(category);
    })
    .filter((candidate) => {
      if (!filters.duplicate_status || filters.duplicate_status === "all") {
        return true;
      }
      return candidate.duplicate_status === filters.duplicate_status;
    })
    .filter((candidate) => {
      if (!filters.promotion_status || filters.promotion_status === "all") {
        return true;
      }
      return candidate.promotion_status === filters.promotion_status;
    })
    .filter((candidate) => {
      if (filters.min_score === undefined) {
        return true;
      }
      return (candidate.candidate_score ?? 0) >= filters.min_score;
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  if (filters.limit && filters.limit > 0) {
    rows = rows.slice(0, filters.limit);
  }

  return rows;
}

export function getCandidateReadiness(
  candidate: ProductCandidate,
  queueItems: ProductQueueItem[],
  productionHistory: ProductionHistory[]
): CandidateReadiness {
  const enriched = enrichProductCandidate(candidate, { candidates: [], queueItems, productionHistory });
  const dedupe = analyzeCandidateDedupe(enriched, {
    candidates: [],
    queueItems,
    productionHistory
  });
  const persistedDuplicate = candidate.duplicate_status && candidate.duplicate_status !== "unique"
    ? candidate.duplicate_status
    : dedupe.duplicate_status;
  const duplicateReason = candidate.duplicate_reason || dedupe.duplicate_reason;
  const promotionStatus =
    candidate.promotion_status && candidate.promotion_status !== "ready"
      ? candidate.promotion_status
      : resolvePromotionStatus(enriched, persistedDuplicate, enriched.candidate_score ?? 0);
  const reasons: string[] = [];
  if (!candidate.product_name.trim()) {
    reasons.push("상품명이 없어 승격할 수 없습니다.");
  }
  if (!candidate.selected_affiliate_url.trim()) {
    reasons.push("제휴 링크가 없어 승격할 수 없습니다.");
  }

  if (persistedDuplicate !== "unique" && persistedDuplicate !== "unknown") {
    reasons.push(duplicateReason || "이미 상품 큐 또는 제작 이력에 같은 상품이 있습니다.");
  }
  if (promotionStatus === "needs_review") {
    reasons.push("이미지 또는 점수가 부족해 검수 후 승격해야 합니다.");
  }
  const imageReadiness = buildImageReadiness(candidate);
  if (!imageReadiness.ready) {
    reasons.push(...imageReadiness.reasons);
  }
  if (promotionStatus === "ready") {
    reasons.push("다음 배치 실행 전까지 작업은 생성되지 않습니다.");
  }

  return {
    can_promote: promotionStatus === "ready",
    status: promotionStatus,
    label: getPromotionStatusLabel(promotionStatus),
    reasons,
    product_key: enriched.product_key ?? "",
    candidate_score: enriched.candidate_score ?? 0,
    score_reason: enriched.score_reason ?? "",
    duplicate_status: persistedDuplicate,
    duplicate_reason: duplicateReason,
    duplicate_queue_id: dedupe.duplicate_queue_id,
    duplicate_source: persistedDuplicate === "already_produced" ? "production_history" : persistedDuplicate === "already_queued" ? "queue" : ""
  };
}

export function buildCandidatePromotion(input: BuildPromotionInput): PromoteCandidateResult {
  const candidate = input.candidate;
  assertCandidatePromotable(candidate, input.queueItems, input.productionHistory);
  const enrichedCandidate = enrichProductCandidate(candidate, {
    candidates: [],
    queueItems: input.queueItems,
    productionHistory: input.productionHistory
  });

  const now = input.now ?? new Date().toISOString();
  const queueRank = Math.max(0, ...input.queueItems.map((item) => item.queue_rank || 0)) + 1;
  const uploadSlot = Math.max(1, Math.ceil(queueRank / 3));
  const queueItem: ProductQueueItem = {
    id: `queue-${candidate.id}`,
    queue_date: getKstDateKey(now),
    queue_rank: queueRank,
    upload_slot: uploadSlot,
    scheduled_at: input.scheduled_at || now,
    keyword: getPayloadString(enrichedCandidate, "keyword") || enrichedCandidate.product_name.trim(),
    theme: enrichedCandidate.source_name || getPayloadString(enrichedCandidate, "source") || "candidate_review",
    product_name: enrichedCandidate.product_name.trim(),
    category_path: enrichedCandidate.category || getPayloadString(enrichedCandidate, "category_path"),
    price_now_text: getPayloadString(enrichedCandidate, "price_now_text"),
    thumbnail_url: pickBestCandidateImage(enrichedCandidate),
    raw_coupang_url: enrichedCandidate.raw_coupang_url.trim(),
    selected_affiliate_url: enrichedCandidate.selected_affiliate_url.trim(),
    product_score:
      enrichedCandidate.candidate_score ??
      (getPayloadNumber(enrichedCandidate, "score") || getPayloadNumber(enrichedCandidate, "product_score")),
    score_reason: enrichedCandidate.score_reason ?? getPayloadString(enrichedCandidate, "score_reason"),
    video_angle: getPayloadString(candidate, "video_angle"),
    queue_status: "scheduled",
    video_url: "",
    video_snapshot_url: "",
    blog_draft_url: "",
    youtube_upload_status: "not_ready",
    tiktok_upload_status: "not_ready",
    threads_post_status: "not_ready",
    manual_review_status: "not_ready",
    error_message: "",
    created_at: now,
    updated_at: now
  };

  return {
    candidate: enrichedCandidate,
    queue_item: queueItem,
    content: buildGeneratedContentScaffold(candidate, queueItem, now),
    warnings: ["승격 후 바로 영상 생성되지 않습니다. 다음 배치 실행 시 조건을 통과한 항목만 worker job으로 생성됩니다."]
  };
}

export function assertCandidatePromotable(
  candidate: ProductCandidate | null,
  queueItems: ProductQueueItem[],
  productionHistory: ProductionHistory[]
): asserts candidate is ProductCandidate {
  if (!candidate) {
    throw new CandidatePromotionError("후보를 찾을 수 없습니다.", 404);
  }
  if (!candidate.product_name.trim()) {
    throw new CandidatePromotionError("상품명이 없어 후보를 상품 큐로 승격할 수 없습니다.");
  }
  if (!candidate.selected_affiliate_url.trim()) {
    throw new CandidatePromotionError("제휴 링크가 없어 후보를 상품 큐로 승격할 수 없습니다.");
  }
  if (findCandidateDuplicate(candidate, queueItems, productionHistory)) {
    throw new CandidatePromotionError("이미 상품 큐에 있는 후보입니다.", 409);
  }
  if (
    candidate.promotion_status === "blocked_duplicate" ||
    (candidate.duplicate_status && candidate.duplicate_status !== "unique" && candidate.duplicate_status !== "unknown")
  ) {
    throw new CandidatePromotionError("중복 후보는 상품 큐로 승격할 수 없습니다.", 409);
  }
  if (!buildImageReadiness(candidate).ready) {
    throw new CandidatePromotionError("상품 이미지 URL이 없어 후보를 상품 큐로 승격할 수 없습니다.");
  }
}

function buildGeneratedContentScaffold(candidate: ProductCandidate, queueItem: ProductQueueItem, now: string): GeneratedContent {
  return {
    id: `content-${queueItem.id}`,
    product_queue_id: queueItem.id,
    raw_coupang_url: queueItem.raw_coupang_url,
    product_name: queueItem.product_name,
    selected_affiliate_url: queueItem.selected_affiliate_url,
    video_title: "",
    video_script: "",
    caption_1: "",
    caption_2: "",
    caption_3: "",
    threads_text: "",
    blog_title: "",
    blog_body: "",
    hashtags: "",
    youtube_description: "",
    tiktok_caption: "",
    disclosure_text: AFFILIATE_DISCLOSURE_TEXT,
    content_source: "fallback",
    creatomate_render_id: "",
    video_url: "",
    video_snapshot_url: "",
    video_status: "not_started",
    blog_draft_url: "",
    blog_draft_status: "not_started",
    created_at: candidate.created_at || now,
    updated_at: now
  };
}

function getPromotionStatusLabel(status: CandidatePromotionStatus) {
  const labels: Record<CandidatePromotionStatus, string> = {
    ready: "승격 가능",
    blocked_missing_affiliate: "제휴 링크 누락",
    blocked_missing_name: "상품명 누락",
    blocked_duplicate: "중복 차단",
    needs_review: "검수 필요",
    promoted: "승격 완료"
  };
  return labels[status];
}

function findCandidateDuplicate(
  candidate: ProductCandidate,
  queueItems: ProductQueueItem[],
  productionHistory: ProductionHistory[]
) {
  const rawUrl = normalizeUrl(candidate.raw_coupang_url);
  const affiliateUrl = normalizeUrl(candidate.selected_affiliate_url);
  const matchingQueueItem = queueItems.find((item) => {
    return (
      (rawUrl && normalizeUrl(item.raw_coupang_url) === rawUrl) ||
      (affiliateUrl && normalizeUrl(item.selected_affiliate_url) === affiliateUrl)
    );
  });

  if (!matchingQueueItem) {
    return null;
  }

  const producedQueueIds = new Set(productionHistory.map((item) => item.product_queue_id));
  return {
    queue_item: matchingQueueItem,
    source: producedQueueIds.has(matchingQueueItem.id) ? "production_history" as const : "queue" as const
  };
}

function normalizeUrl(value: string) {
  return value.trim().replace(/\/+$/, "").toLowerCase();
}

function getPayloadString(candidate: ProductCandidate, key: string) {
  const value = candidate.payload[key];
  return typeof value === "string" ? value.trim() : "";
}

function getPayloadNumber(candidate: ProductCandidate, key: string) {
  const value = candidate.payload[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
