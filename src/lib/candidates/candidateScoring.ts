import type { ProductCandidate } from "@/types/automation";
import { detectCandidatePlatform } from "@/lib/candidates/productKey";
import { pickBestCandidateImage } from "@/lib/coupang/coupangImage";

export type CandidateScoreResult = {
  candidate_score: number;
  score_reason: string[];
};

export function scoreProductCandidate(candidate: ProductCandidate): CandidateScoreResult {
  const reasons: string[] = [];
  let score = 0;

  if (candidate.selected_affiliate_url.trim()) {
    score += 25;
    reasons.push("제휴 링크 있음");
  } else {
    reasons.push("제휴 링크 누락");
  }

  if (candidate.product_name.trim()) {
    score += 15;
    reasons.push("상품명 있음");
  } else {
    reasons.push("상품명 누락");
  }

  if (candidate.raw_coupang_url.trim() || getPayloadString(candidate, ["source_url", "url", "product_url"])) {
    reasons.push("URL 있음");
  } else {
    reasons.push("URL 누락");
  }

  if (getImageUrl(candidate)) {
    score += 10;
    reasons.push("이미지 있음");
  } else {
    reasons.push("이미지 누락");
  }

  if (getPayloadString(candidate, ["price_now_text", "price", "sale_price"])) {
    score += 5;
    reasons.push("가격 정보 있음");
  }

  if (getPayloadNumber(candidate, ["discount_rate", "discountRate"]) > 0) {
    score += 10;
    reasons.push("할인 정보 있음");
  }

  if (getPayloadNumber(candidate, ["review_count", "reviewCount", "reviews"]) >= 100) {
    score += 10;
    reasons.push("리뷰 수 충분");
  }

  if (getPayloadNumber(candidate, ["rating", "review_rating", "reviewRating"]) >= 4) {
    score += 10;
    reasons.push("평점 4.0 이상");
  }

  const sourceType = getPayloadString(candidate, ["source_type", "sourceType", "type"]).toLowerCase();
  if (sourceType === "event") {
    score += 15;
    reasons.push("이벤트 상품");
  } else if (sourceType === "ranking" || sourceType === "popular") {
    score += 10;
    reasons.push("인기/랭킹 상품");
  }

  if (["coupang", "musinsa", "toss"].includes(detectCandidatePlatform(candidate))) {
    score += 5;
    reasons.push("알려진 플랫폼");
  }

  return {
    candidate_score: Math.max(0, Math.min(100, score)),
    score_reason: reasons
  };
}

export function getImageUrl(candidate: ProductCandidate): string {
  return pickBestCandidateImage(candidate);
}

function getPayloadString(candidate: ProductCandidate, keys: string[]) {
  for (const key of keys) {
    const value = candidate.payload[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function getPayloadNumber(candidate: ProductCandidate, keys: string[]) {
  for (const key of keys) {
    const value = candidate.payload[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value.replace(/[,%]/g, ""));
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return 0;
}
