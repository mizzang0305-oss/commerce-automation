import type { GeneratedContent, ProductCandidate, ProductQueueItem, ProductionHistory } from "@/types/automation";
import { getKstDateKey } from "@/lib/workerDailyLimit";

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
  status: "ready" | "missing_affiliate" | "missing_name" | "duplicate";
  label: string;
  reasons: string[];
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
        candidate.selected_affiliate_url
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
      return getPayloadString(candidate, "source").toLowerCase() === source;
    })
    .filter((candidate) => {
      if (!category) {
        return true;
      }
      return getPayloadString(candidate, "category_path").toLowerCase().includes(category);
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
  const reasons: string[] = [];
  if (!candidate.product_name.trim()) {
    reasons.push("상품명이 없어 승격할 수 없습니다.");
  }
  if (!candidate.selected_affiliate_url.trim()) {
    reasons.push("제휴 링크가 없어 승격할 수 없습니다.");
  }

  const duplicate = findCandidateDuplicate(candidate, queueItems, productionHistory);
  if (duplicate) {
    reasons.push("이미 상품 큐 또는 제작 이력에 같은 URL이 있습니다.");
  }

  if (!candidate.product_name.trim()) {
    return {
      can_promote: false,
      status: "missing_name",
      label: "상품명 누락",
      reasons,
      duplicate_queue_id: duplicate?.queue_item.id ?? "",
      duplicate_source: duplicate?.source ?? ""
    };
  }

  if (!candidate.selected_affiliate_url.trim()) {
    return {
      can_promote: false,
      status: "missing_affiliate",
      label: "링크 누락",
      reasons,
      duplicate_queue_id: duplicate?.queue_item.id ?? "",
      duplicate_source: duplicate?.source ?? ""
    };
  }

  if (duplicate) {
    return {
      can_promote: false,
      status: "duplicate",
      label: "중복 의심",
      reasons,
      duplicate_queue_id: duplicate.queue_item.id,
      duplicate_source: duplicate.source
    };
  }

  return {
    can_promote: true,
    status: "ready",
    label: "승격 가능",
    reasons: ["다음 배치 실행 전까지 작업은 생성되지 않습니다."],
    duplicate_queue_id: "",
    duplicate_source: ""
  };
}

export function buildCandidatePromotion(input: BuildPromotionInput): PromoteCandidateResult {
  const candidate = input.candidate;
  assertCandidatePromotable(candidate, input.queueItems, input.productionHistory);

  const now = input.now ?? new Date().toISOString();
  const queueRank = Math.max(0, ...input.queueItems.map((item) => item.queue_rank || 0)) + 1;
  const uploadSlot = Math.max(1, Math.ceil(queueRank / 3));
  const queueItem: ProductQueueItem = {
    id: `queue-${candidate.id}`,
    queue_date: getKstDateKey(now),
    queue_rank: queueRank,
    upload_slot: uploadSlot,
    scheduled_at: input.scheduled_at || now,
    keyword: getPayloadString(candidate, "keyword") || candidate.product_name.trim(),
    theme: getPayloadString(candidate, "source") || "candidate_review",
    product_name: candidate.product_name.trim(),
    category_path: getPayloadString(candidate, "category_path"),
    price_now_text: getPayloadString(candidate, "price_now_text"),
    thumbnail_url: getPayloadString(candidate, "thumbnail_url") || getPayloadString(candidate, "image_url"),
    raw_coupang_url: candidate.raw_coupang_url.trim(),
    selected_affiliate_url: candidate.selected_affiliate_url.trim(),
    product_score: getPayloadNumber(candidate, "score") || getPayloadNumber(candidate, "product_score"),
    score_reason: getPayloadString(candidate, "score_reason"),
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
    candidate,
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
