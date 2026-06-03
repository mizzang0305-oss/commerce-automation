import { createHash } from "node:crypto";
import { enrichProductCandidate, type CandidateQualityContext } from "@/lib/candidates/candidateNormalizer";
import type { ProductCandidate } from "@/types/automation";
import {
  buildCoupangProductKey,
  extractCoupangProductId,
  extractCoupangUrlIds,
  isLikelyCoupangProductUrl,
  normalizeCoupangUrl,
  validateAffiliateUrl,
  type AffiliateValidationStatus
} from "@/lib/coupang/coupangUrl";
import { buildImageReadiness, normalizeImageUrl, type ImageReadinessStatus } from "@/lib/coupang/coupangImage";

export type CoupangCandidateInput = {
  product_name?: unknown;
  raw_coupang_url?: unknown;
  selected_affiliate_url?: unknown;
  thumbnail_url?: unknown;
  price_now_text?: unknown;
  category_path?: unknown;
  source_type?: unknown;
  item_id?: unknown;
  itemId?: unknown;
  vendor_item_id?: unknown;
  vendorItemId?: unknown;
  source?: unknown;
};

export type CoupangCandidateReadiness = {
  product_key: string;
  affiliate_validation_status: AffiliateValidationStatus;
  affiliate_validation_reason: string;
  image_readiness_status: ImageReadinessStatus;
  image_url: string;
  duplicate_status: ProductCandidate["duplicate_status"];
  promotion_status: ProductCandidate["promotion_status"];
  candidate_score: number;
};

export type BuildCoupangCandidateResult = {
  candidate: ProductCandidate;
  readiness: CoupangCandidateReadiness;
};

export class CoupangCandidateImportError extends Error {
  constructor(
    public error_code: "MISSING_PRODUCT_NAME" | "MISSING_COUPANG_PRODUCT_URL" | "INVALID_COUPANG_PRODUCT_URL",
    message: string,
    public status = 400
  ) {
    super(message);
    this.name = "CoupangCandidateImportError";
  }
}

export function buildCoupangCandidate(
  input: CoupangCandidateInput,
  context: CandidateQualityContext = {}
): BuildCoupangCandidateResult {
  const productName = text(input.product_name);
  const rawUrl = text(input.raw_coupang_url);
  if (!productName) {
    throw new CoupangCandidateImportError("MISSING_PRODUCT_NAME", "상품명이 필요합니다.");
  }
  if (!rawUrl) {
    throw new CoupangCandidateImportError("MISSING_COUPANG_PRODUCT_URL", "쿠팡 원본 상품 URL이 필요합니다.");
  }
  if (!isLikelyCoupangProductUrl(rawUrl)) {
    throw new CoupangCandidateImportError(
      "INVALID_COUPANG_PRODUCT_URL",
      "쿠팡 원본 URL은 coupang.com 상품 상세 URL이어야 합니다."
    );
  }

  const urlIds = extractCoupangUrlIds(rawUrl);
  const itemId = text(input.item_id) || text(input.itemId) || urlIds.item_id;
  const vendorItemId = text(input.vendor_item_id) || text(input.vendorItemId) || urlIds.vendor_item_id;
  const normalizedRawUrl = normalizeCoupangUrl(withCoupangIds(rawUrl, itemId, vendorItemId));
  const affiliate = validateAffiliateUrl(text(input.selected_affiliate_url));
  const productKey = buildCoupangProductKey({
    raw_coupang_url: normalizedRawUrl,
    product_id: extractCoupangProductId(normalizedRawUrl),
    item_id: itemId,
    vendor_item_id: vendorItemId
  });
  const now = new Date().toISOString();
  const categoryPath = text(input.category_path);
  const sourceType = text(input.source_type) || "manual_url";
  const thumbnailUrl = normalizeImageUrl(text(input.thumbnail_url));
  const priceNowText = text(input.price_now_text);

  const candidate = enrichProductCandidate(
    {
      id: createCandidateId(productKey),
      product_name: productName,
      raw_coupang_url: normalizedRawUrl,
      selected_affiliate_url: affiliate.ok ? affiliate.normalized_url : "",
      product_key: productKey,
      platform: "coupang",
      source_type: sourceType,
      source_name: text(input.source) || "coupang_manual",
      category: categoryPath,
      payload: {
        source: text(input.source) || "coupang_manual",
        source_platform: "coupang",
        source_type: sourceType,
        source_url: normalizedRawUrl,
        product_id: extractCoupangProductId(normalizedRawUrl),
        itemId,
        vendorItemId,
        category_path: categoryPath,
        thumbnail_url: thumbnailUrl,
        price_now_text: priceNowText,
        affiliate_validation_status: affiliate.status,
        affiliate_validation_reason: affiliate.reason
      },
      created_at: now,
      updated_at: now
    },
    context
  );
  const imageReadiness = buildImageReadiness(candidate);

  return {
    candidate,
    readiness: {
      product_key: candidate.product_key ?? productKey,
      affiliate_validation_status: affiliate.status,
      affiliate_validation_reason: affiliate.reason,
      image_readiness_status: imageReadiness.status,
      image_url: imageReadiness.image_url,
      duplicate_status: candidate.duplicate_status,
      promotion_status: candidate.promotion_status,
      candidate_score: candidate.candidate_score ?? 0
    }
  };
}

function withCoupangIds(value: string, itemId: string, vendorItemId: string): string {
  try {
    const url = new URL(value.trim());
    if (itemId) {
      url.searchParams.set("itemId", itemId);
    }
    if (vendorItemId) {
      url.searchParams.set("vendorItemId", vendorItemId);
    }
    return url.toString();
  } catch {
    return value;
  }
}

function createCandidateId(productKey: string) {
  const digest = createHash("sha256").update(productKey).digest("hex").slice(0, 16);
  return `candidate-${digest}`;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
