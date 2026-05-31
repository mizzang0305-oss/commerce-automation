import type {
  CandidateDuplicateStatus,
  CandidatePromotionStatus,
  ProductCandidate,
  ProductQueueItem,
  ProductionHistory
} from "@/types/automation";
import { createCandidateProductKey, normalizeCandidateUrl } from "@/lib/candidates/productKey";
import { getImageUrl } from "@/lib/candidates/candidateScoring";

export type CandidateDedupeContext = {
  candidates: ProductCandidate[];
  queueItems: ProductQueueItem[];
  productionHistory: ProductionHistory[];
};

export type CandidateDedupeResult = {
  duplicate_status: CandidateDuplicateStatus;
  duplicate_reason: string;
  duplicate_queue_id: string;
};

export function analyzeCandidateDedupe(
  candidate: ProductCandidate,
  context: CandidateDedupeContext
): CandidateDedupeResult {
  const productKey = candidate.product_key || createCandidateProductKey(candidate);
  const duplicateCandidate = context.candidates.find((item) => {
    if (item.id === candidate.id) {
      return false;
    }
    const itemKey = item.product_key || createCandidateProductKey(item);
    return Boolean(productKey && itemKey && itemKey === productKey);
  });

  if (duplicateCandidate) {
    return {
      duplicate_status: "duplicate_candidate",
      duplicate_reason: "동일 product_key 후보가 이미 있습니다.",
      duplicate_queue_id: ""
    };
  }

  const rawUrl = normalizeCandidateUrl(candidate.raw_coupang_url);
  const affiliateUrl = normalizeCandidateUrl(candidate.selected_affiliate_url);
  const matchingQueue = context.queueItems.find((item) => {
    return (
      (rawUrl && normalizeCandidateUrl(item.raw_coupang_url) === rawUrl) ||
      (affiliateUrl && normalizeCandidateUrl(item.selected_affiliate_url) === affiliateUrl)
    );
  });

  if (matchingQueue) {
    const produced = isProducedQueueItem(matchingQueue, productKey, context.productionHistory);
    return {
      duplicate_status: produced ? "already_produced" : "already_queued",
      duplicate_reason: produced
        ? "이미 제작 이력이 있는 상품입니다."
        : "이미 상품 큐에 등록된 URL입니다.",
      duplicate_queue_id: matchingQueue.id
    };
  }

  const matchingHistory = context.productionHistory.find((item) => {
    const metadata = item.metadata ?? {};
    return (
      metadata.product_key === productKey ||
      normalizeCandidateUrl(String(metadata.raw_coupang_url ?? "")) === rawUrl ||
      normalizeCandidateUrl(String(metadata.selected_affiliate_url ?? "")) === affiliateUrl
    );
  });

  if (matchingHistory) {
    return {
      duplicate_status: "already_produced",
      duplicate_reason: "이미 제작 이력이 있는 상품입니다.",
      duplicate_queue_id: matchingHistory.product_queue_id
    };
  }

  return {
    duplicate_status: "unique",
    duplicate_reason: "",
    duplicate_queue_id: ""
  };
}

export function resolvePromotionStatus(
  candidate: ProductCandidate,
  duplicateStatus: CandidateDuplicateStatus,
  candidateScore: number
): CandidatePromotionStatus {
  if (!candidate.selected_affiliate_url.trim()) {
    return "blocked_missing_affiliate";
  }
  if (!candidate.product_name.trim()) {
    return "blocked_missing_name";
  }
  if (duplicateStatus !== "unique" && duplicateStatus !== "unknown") {
    return "blocked_duplicate";
  }
  if (!getImageUrl(candidate) || candidateScore < 40) {
    return "needs_review";
  }
  return "ready";
}

function isProducedQueueItem(
  queueItem: ProductQueueItem,
  productKey: string,
  productionHistory: ProductionHistory[]
) {
  return productionHistory.some((item) => {
    const metadata = item.metadata ?? {};
    return (
      item.product_queue_id === queueItem.id ||
      metadata.product_key === productKey ||
      metadata.product_queue_id === queueItem.id
    );
  });
}
