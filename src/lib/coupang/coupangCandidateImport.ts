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
  affiliate_url?: unknown;
  landing_url?: unknown;
  product_url?: unknown;
  productUrl?: unknown;
  deeplink_url?: unknown;
  shorten_url?: unknown;
  thumbnail_url?: unknown;
  image_url?: unknown;
  product_image_url?: unknown;
  productImage?: unknown;
  productImageUrl?: unknown;
  imagePath?: unknown;
  image_path?: unknown;
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
  import_error_code: CoupangImportReadinessErrorCode | null;
  import_blocked_reasons: string[];
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

export type CoupangImportReadinessErrorCode =
  | "COUPANG_IMPORT_AFFILIATE_URL_FIELD_MISSING"
  | "COUPANG_IMPORT_AFFILIATE_URL_INVALID"
  | "COUPANG_IMPORT_IMAGE_URL_FIELD_MISSING"
  | "COUPANG_IMPORT_IMAGE_URL_INVALID"
  | "COUPANG_IMPORT_RESPONSE_SHAPE_UNSUPPORTED";

export type CoupangImportReadinessClassification = {
  ok: boolean;
  error_code: CoupangImportReadinessErrorCode | null;
  blocked_reasons: string[];
  next_auto_action: "FIX_COUPANG_PARTNERS_IMPORT_MAPPING" | null;
  safe_summary: {
    selected_affiliate_url_present: boolean;
    affiliate_url_present: boolean;
    product_url_present: boolean;
    landing_url_present: boolean;
    deeplink_url_present: boolean;
    shorten_url_present: boolean;
    image_url_present: boolean;
    product_image_present: boolean;
    image_path_present: boolean;
    affiliate_validation_status: AffiliateValidationStatus | "unknown";
    image_readiness_status: ImageReadinessStatus | "unknown";
  };
  side_effects: typeof COUPANG_IMPORT_SIDE_EFFECTS;
};

export const COUPANG_IMPORT_SIDE_EFFECTS = {
  youtube_execute_called: false,
  youtube_upload_executed: false,
  videos_insert_called: false,
  db_written: false,
  r2_uploaded: false,
  queue_created: false,
  worker_job_created: false,
  upload_package_created: false
} as const;

const AFFILIATE_URL_FIELDS = [
  "selected_affiliate_url",
  "affiliate_url",
  "landing_url",
  "product_url",
  "productUrl",
  "deeplink_url",
  "shorten_url"
] as const;

const IMAGE_URL_FIELDS = [
  "thumbnail_url",
  "image_url",
  "product_image_url",
  "productImage",
  "productImageUrl",
  "imagePath",
  "image_path"
] as const;

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
  const affiliateInput = pickFirstText(input, AFFILIATE_URL_FIELDS);
  const affiliate = validateAffiliateUrl(affiliateInput);
  const productKey = buildCoupangProductKey({
    raw_coupang_url: normalizedRawUrl,
    product_id: extractCoupangProductId(normalizedRawUrl),
    item_id: itemId,
    vendor_item_id: vendorItemId
  });
  const now = new Date().toISOString();
  const categoryPath = text(input.category_path);
  const sourceType = text(input.source_type) || "manual_url";
  const thumbnailUrl = normalizeImageUrl(pickFirstText(input, IMAGE_URL_FIELDS));
  const priceNowText = text(input.price_now_text);

  let candidate = enrichProductCandidate(
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
        image_url: thumbnailUrl,
        source_image_url: thumbnailUrl,
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
  const duplicateInContext = (context.candidates ?? []).some((item) => {
    const contextKey = item.product_key || "";
    return item !== candidate && Boolean(contextKey && contextKey === (candidate.product_key ?? productKey));
  });
  if (duplicateInContext && candidate.duplicate_status === "unique") {
    candidate = {
      ...candidate,
      duplicate_status: "duplicate_candidate",
      duplicate_reason: "동일 product_key 후보가 이미 있습니다.",
      promotion_status: "blocked_duplicate"
    };
  }
  const riskFlags = buildRiskFlags(candidate, {
    affiliateOk: affiliate.ok,
    imageReady: imageReadiness.status === "ready",
    categoryPath,
    priceNowText
  });
  const finalScore = candidate.candidate_score ?? 0;
  const duplicatePenalty = candidate.duplicate_status && candidate.duplicate_status !== "unique" ? 25 : 0;
  const riskPenalty = Math.min(30, riskFlags.filter((flag) => flag !== "duplicate_candidate").length * 5);
  candidate = {
    ...candidate,
    payload: {
      ...candidate.payload,
      duplicate_key: candidate.product_key ?? productKey,
      score_breakdown: {
        demand_score: estimateDemandScore(sourceType, candidate.score_reason ?? ""),
        price_score: priceNowText ? 10 : 0,
        content_angle_score: estimateContentAngleScore(productName, categoryPath, imageReadiness.status === "ready"),
        risk_penalty: riskPenalty,
        duplicate_penalty: duplicatePenalty,
        final_score: finalScore,
        score_reason: candidate.score_reason ?? "",
        affiliate_validation_status: affiliate.status,
        image_readiness_status: imageReadiness.status,
        duplicate_status: candidate.duplicate_status ?? "unknown"
      },
      source_trace: {
        source_platform: "coupang",
        source_keyword: "",
        collected_mode: sourceType,
        collected_at: now,
        collector_version: "coupang-candidate-v1",
        source_name: text(input.source) || "coupang_manual",
        normalized_raw_url: normalizedRawUrl,
        product_id: extractCoupangProductId(normalizedRawUrl),
        item_id: itemId,
        vendor_item_id: vendorItemId
      },
      risk_flags: riskFlags
    }
  };
  const importReadiness = classifyCoupangImportReadiness(candidate);
  candidate = {
    ...candidate,
    payload: {
      ...candidate.payload,
      score_breakdown: {
        ...(isRecord(candidate.payload.score_breakdown) ? candidate.payload.score_breakdown : {}),
        import_error_code: importReadiness.error_code,
        import_blocked_reasons: importReadiness.blocked_reasons
      }
    }
  };

  return {
    candidate,
    readiness: {
      product_key: candidate.product_key ?? productKey,
      affiliate_validation_status: affiliate.status,
      affiliate_validation_reason: affiliate.reason,
      image_readiness_status: imageReadiness.status,
      image_url: imageReadiness.image_url,
      import_error_code: importReadiness.error_code,
      import_blocked_reasons: importReadiness.blocked_reasons,
      duplicate_status: candidate.duplicate_status,
      promotion_status: candidate.promotion_status,
      candidate_score: candidate.candidate_score ?? 0
    }
  };
}

export function classifyCoupangImportReadiness(candidate: ProductCandidate): CoupangImportReadinessClassification {
  const payload = isRecord(candidate.payload) ? candidate.payload : {};
  const scoreBreakdown = isRecord(payload.score_breakdown) ? payload.score_breakdown : {};
  const affiliateValidationStatus = readAffiliateStatus(
    readString(payload, "affiliate_validation_status") ||
    readString(scoreBreakdown, "affiliate_validation_status")
  );
  const imageReadinessStatus = readImageStatus(
    readString(payload, "image_readiness_status") ||
    readString(scoreBreakdown, "image_readiness_status")
  );
  const safeSummary = {
    selected_affiliate_url_present: Boolean(text(candidate.selected_affiliate_url)),
    affiliate_url_present: Boolean(readString(payload, "affiliate_url")),
    product_url_present: Boolean(readString(payload, "product_url") || readString(payload, "productUrl")),
    landing_url_present: Boolean(readString(payload, "landing_url")),
    deeplink_url_present: Boolean(readString(payload, "deeplink_url")),
    shorten_url_present: Boolean(readString(payload, "shorten_url")),
    image_url_present: Boolean(readString(payload, "image_url") || readString(payload, "thumbnail_url")),
    product_image_present: Boolean(readString(payload, "product_image_url") || readString(payload, "productImage") || readString(payload, "productImageUrl")),
    image_path_present: Boolean(readString(payload, "imagePath") || readString(payload, "image_path")),
    affiliate_validation_status: affiliateValidationStatus,
    image_readiness_status: imageReadinessStatus
  };

  if (affiliateValidationStatus === "missing") {
    return importBlocked("COUPANG_IMPORT_AFFILIATE_URL_FIELD_MISSING", ["imported_candidate_affiliate_url_missing"], safeSummary);
  }
  if (affiliateValidationStatus === "invalid") {
    return importBlocked("COUPANG_IMPORT_AFFILIATE_URL_INVALID", ["imported_candidate_affiliate_url_invalid"], safeSummary);
  }
  if (imageReadinessStatus === "missing_image") {
    return importBlocked("COUPANG_IMPORT_IMAGE_URL_FIELD_MISSING", ["imported_candidate_image_url_missing"], safeSummary);
  }
  if (imageReadinessStatus === "invalid_image_url") {
    return importBlocked("COUPANG_IMPORT_IMAGE_URL_INVALID", ["imported_candidate_image_url_invalid"], safeSummary);
  }
  if (affiliateValidationStatus === "unknown" || imageReadinessStatus === "unknown") {
    return {
      ok: true,
      error_code: null,
      blocked_reasons: [],
      next_auto_action: null,
      safe_summary: safeSummary,
      side_effects: COUPANG_IMPORT_SIDE_EFFECTS
    };
  }

  return {
    ok: true,
    error_code: null,
    blocked_reasons: [],
    next_auto_action: null,
    safe_summary: safeSummary,
    side_effects: COUPANG_IMPORT_SIDE_EFFECTS
  };
}

function buildRiskFlags(
  candidate: ProductCandidate,
  input: { affiliateOk: boolean; imageReady: boolean; categoryPath: string; priceNowText: string }
) {
  const flags = new Set<string>();
  const searchable = `${candidate.product_name} ${input.categoryPath}`.toLowerCase();
  if (!input.imageReady) {
    flags.add("missing_thumbnail");
  }
  if (!input.affiliateOk) {
    flags.add("missing_affiliate_url");
  }
  if (candidate.duplicate_status && candidate.duplicate_status !== "unique") {
    flags.add("duplicate_candidate");
  }
  if (/건강|의료|영양|다이어트|보충제|health|medical|diet/.test(searchable)) {
    flags.add("food_or_health_claim_risk");
  }
  if (/화장품|스킨|로션|cosmetic|beauty/.test(searchable)) {
    flags.add("cosmetic_claim_risk");
  }
  if (/노트북|모니터|카메라|전자|electronics/.test(searchable)) {
    flags.add("expensive_electronics_risk");
  }
  if (/가구|침대|소파|furniture/.test(searchable)) {
    flags.add("oversized_furniture_risk");
  }
  if (/유리|도자기|fragile/.test(searchable)) {
    flags.add("fragile_item_risk");
  }
  if ((candidate.candidate_score ?? 0) < 45) {
    flags.add("low_content_angle");
  }
  return [...flags];
}

function importBlocked(
  errorCode: CoupangImportReadinessErrorCode,
  blockedReasons: string[],
  safeSummary: CoupangImportReadinessClassification["safe_summary"]
): CoupangImportReadinessClassification {
  return {
    ok: false,
    error_code: errorCode,
    blocked_reasons: blockedReasons,
    next_auto_action: "FIX_COUPANG_PARTNERS_IMPORT_MAPPING",
    safe_summary: safeSummary,
    side_effects: COUPANG_IMPORT_SIDE_EFFECTS
  };
}

function estimateDemandScore(sourceType: string, scoreReason: string) {
  if (sourceType === "event") {
    return 25;
  }
  if (sourceType === "ranking" || sourceType === "popular" || scoreReason.includes("인기")) {
    return 20;
  }
  return 15;
}

function estimateContentAngleScore(productName: string, categoryPath: string, imageReady: boolean) {
  let score = 0;
  if (productName.trim()) {
    score += 10;
  }
  if (categoryPath.trim()) {
    score += 5;
  }
  if (imageReady) {
    score += 10;
  }
  return score;
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

function pickFirstText<T extends readonly string[]>(input: CoupangCandidateInput, fields: T): string {
  const record = input as Record<string, unknown>;
  for (const field of fields) {
    const value = text(record[field]);
    if (value) {
      return value;
    }
  }
  return "";
}

function readString(record: Record<string, unknown>, key: string): string {
  return text(record[key]);
}

function readAffiliateStatus(value: string): AffiliateValidationStatus | "unknown" {
  return value === "valid" || value === "missing" || value === "invalid" ? value : "unknown";
}

function readImageStatus(value: string): ImageReadinessStatus | "unknown" {
  return value === "ready" || value === "missing_image" || value === "invalid_image_url" ? value : "unknown";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
