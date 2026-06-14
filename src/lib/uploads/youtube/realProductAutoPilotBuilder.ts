import type { ProductAsset, ProductCandidate, ProductQueueItem } from "@/types/automation";
import type {
  CoupangScoutClassification,
  CoupangScoutDiagnostic
} from "@/lib/coupang/scoutCompatibility";
import {
  validatePreparedVideoAssetRef,
  toPreparedVideoAssetApiSummary
} from "@/lib/uploads/assets/preparedVideoAssetValidator";
import type { PreparedVideoAssetRef } from "@/lib/uploads/youtube/uploadAssetContract";
import {
  DEFAULT_YOUTUBE_PRODUCT_DISCLOSURE_TEXT,
  buildDefaultProductVideoTitle,
  buildYouTubeProductVideoUploadPackage
} from "@/lib/uploads/youtube/productVideoUploadPackage";

export type RealProductAutoPilotMode = "dry_run" | "prepare_only";

export type RealProductAutoPilotSideEffects = {
  youtube_execute_called: false;
  youtube_upload_executed: false;
  videos_insert_called: false;
  db_written: false;
  r2_uploaded: false;
  queue_created: false;
  worker_job_created: false;
  upload_package_created: false;
};

export type RealProductAutoPilotInput = {
  mode?: RealProductAutoPilotMode;
  requested_visibility?: "private" | "unlisted" | "public";
  candidates: ProductCandidate[];
  queueItems: ProductQueueItem[];
  productAssets: ProductAsset[];
  scout_diagnostic?: CoupangScoutDiagnostic | null;
};

export type RealProductAutoPilotSelectedProduct = {
  candidate_id: string;
  product_name: string;
  product_score: number;
  queue_id: string | null;
  affiliate_url_present: boolean;
  product_url_present: boolean;
  thumbnail_url_present: boolean;
  score: number;
  reasons: string[];
};

export type RealProductAutoPilotResult = {
  ok: boolean;
  error_code:
    | null
    | "AUTO_REAL_PRODUCT_REQUIRED"
    | "AUTO_VIDEO_ASSET_REQUIRED"
    | "PUBLIC_UPLOAD_BLOCKED"
    | "AUTO_PACKAGE_PREPARE_BLOCKED"
    | Exclude<CoupangScoutClassification, "COUPANG_SCOUT_READY">;
  message: string;
  mode: RealProductAutoPilotMode;
  selected_product: RealProductAutoPilotSelectedProduct | null;
  prepared_video_asset_ref: SanitizedPreparedVideoAssetRef | null;
  prepared_video_asset_summary: PreparedVideoAssetSummary | null;
  package_prepare: {
    ready: boolean;
    package_id: string | null;
    visibility: "private" | "unlisted";
    domain_ready: boolean;
    prepared_video_asset_ref_used: boolean;
    title_ready: boolean;
    disclosure_ready: boolean;
    affiliate_url_ready: boolean;
    blocked_reasons: string[];
  } | null;
  blocked_reasons: string[];
  next_auto_action: string | null;
  side_effects: RealProductAutoPilotSideEffects;
};

type SanitizedPreparedVideoAssetRef = Omit<PreparedVideoAssetRef, "signed_url" | "prepared_video_asset_url"> & {
  signed_url_present: boolean;
  prepared_video_asset_url_present: boolean;
};

type PreparedVideoAssetSummary = ReturnType<typeof toPreparedVideoAssetApiSummary> & {
  url_host: string | null;
};

type CandidateEvaluation = {
  candidate: ProductCandidate;
  queue: ProductQueueItem | null;
  score: number;
  hard_blocked: boolean;
  blocked_reasons: string[];
  reasons: string[];
};

export const REAL_PRODUCT_AUTO_PILOT_SIDE_EFFECTS: RealProductAutoPilotSideEffects = {
  youtube_execute_called: false,
  youtube_upload_executed: false,
  videos_insert_called: false,
  db_written: false,
  r2_uploaded: false,
  queue_created: false,
  worker_job_created: false,
  upload_package_created: false
};

export function buildRealProductAutoPilot(input: RealProductAutoPilotInput): RealProductAutoPilotResult {
  const mode = input.mode ?? "dry_run";
  const requestedVisibility = input.requested_visibility ?? "private";

  if (requestedVisibility === "public") {
    return blockedResult({
      mode,
      error_code: "PUBLIC_UPLOAD_BLOCKED",
      message: "Public YouTube upload is blocked for real product auto pilot.",
      blocked_reasons: ["public_upload_blocked"],
      next_auto_action: "USE_PRIVATE_OR_UNLISTED_VISIBILITY"
    });
  }

  const selected = selectBestCandidate(input.candidates, input.queueItems);
  if (!selected) {
    if (input.scout_diagnostic && !input.scout_diagnostic.ok) {
      return blockedResult({
        mode,
        error_code: input.scout_diagnostic.classification as Exclude<CoupangScoutClassification, "COUPANG_SCOUT_READY">,
        message: input.scout_diagnostic.safe_error ?? "Coupang scout request failed with a safe classified error.",
        blocked_reasons: input.scout_diagnostic.blocked_reasons,
        next_auto_action: input.scout_diagnostic.next_auto_action ?? "FIX_COUPANG_SCOUT_REQUEST_CONTRACT"
      });
    }
    return blockedResult({
      mode,
      error_code: "AUTO_REAL_PRODUCT_REQUIRED",
      message: "A valid real Coupang product candidate is required.",
      blocked_reasons: ["no_valid_real_product_candidate"],
      next_auto_action: "COLLECT_REAL_PRODUCT_CANDIDATE"
    });
  }

  const asset = findBestPreparedVideoAsset(selected.queue?.id, input.productAssets);
  const selectedProduct = toSelectedProduct(selected);
  if (!asset) {
    return {
      ...blockedResult({
        mode,
        error_code: "AUTO_VIDEO_ASSET_REQUIRED",
        message: "A server-accessible video/mp4 asset is required for the selected real product.",
        blocked_reasons: ["selected_real_product_has_no_server_accessible_video_asset"],
        next_auto_action: "GENERATE_SERVER_ACCESSIBLE_VIDEO_ASSET_FOR_SELECTED_PRODUCT"
      }),
      selected_product: selectedProduct
    };
  }

  const packageInput = buildPackageInput({
    selected,
    assetRef: asset.asset_ref,
    visibility: requestedVisibility
  });
  const packageResult = buildYouTubeProductVideoUploadPackage(packageInput);

  if (!packageResult.ok) {
    return {
      ok: false,
      error_code: "AUTO_PACKAGE_PREPARE_BLOCKED",
      message: "The selected real product package is not ready.",
      mode,
      selected_product: selectedProduct,
      prepared_video_asset_ref: sanitizeAssetRef(asset.asset_ref),
      prepared_video_asset_summary: asset.summary,
      package_prepare: {
        ready: false,
        package_id: null,
        visibility: requestedVisibility,
        domain_ready: packageResult.readiness.domain_ready,
        prepared_video_asset_ref_used: false,
        title_ready: packageResult.readiness.title_ready,
        disclosure_ready: packageResult.readiness.disclosure_ready,
        affiliate_url_ready: packageResult.readiness.affiliate_url_ready,
        blocked_reasons: packageResult.blocked_reasons
      },
      blocked_reasons: packageResult.blocked_reasons,
      next_auto_action: "FIX_SELECTED_PRODUCT_PACKAGE_BLOCKERS",
      side_effects: REAL_PRODUCT_AUTO_PILOT_SIDE_EFFECTS
    };
  }

  return {
    ok: true,
    error_code: null,
    message: mode === "prepare_only"
      ? "Real product private package is prepared without executing upload."
      : "Real product candidate and video asset are ready for prepare-only package creation.",
    mode,
    selected_product: selectedProduct,
    prepared_video_asset_ref: sanitizeAssetRef(asset.asset_ref),
    prepared_video_asset_summary: asset.summary,
    package_prepare: {
      ready: true,
      package_id: mode === "prepare_only" ? packageResult.package.package_id : null,
      visibility: packageResult.package.visibility,
      domain_ready: packageResult.package.readiness.domain_ready,
      prepared_video_asset_ref_used: true,
      title_ready: packageResult.package.readiness.title_ready,
      disclosure_ready: packageResult.package.readiness.disclosure_ready,
      affiliate_url_ready: packageResult.package.readiness.affiliate_url_ready,
      blocked_reasons: []
    },
    blocked_reasons: [],
    next_auto_action: mode === "prepare_only" ? "MANUAL_REVIEW_BEFORE_PRIVATE_EXECUTE" : "RUN_PREPARE_ONLY",
    side_effects: REAL_PRODUCT_AUTO_PILOT_SIDE_EFFECTS
  };
}

function selectBestCandidate(candidates: ProductCandidate[], queueItems: ProductQueueItem[]) {
  const evaluations = candidates.map((item) => evaluateCandidate(item, queueItems));
  return evaluations
    .filter((item) => !item.hard_blocked)
    .sort((left, right) => right.score - left.score)[0] ?? null;
}

function evaluateCandidate(candidate: ProductCandidate, queueItems: ProductQueueItem[]): CandidateEvaluation {
  const productName = safeTrim(candidate.product_name);
  const affiliateUrl = safeTrim(candidate.selected_affiliate_url);
  const queue = findQueueForCandidate(candidate, queueItems);
  const blockedReasons: string[] = [];
  const reasons: string[] = [];
  let score = 0;

  if (!productName || productName.length < 4) {
    blockedReasons.push("product_name_missing_or_short");
  } else {
    score += 15;
    reasons.push("product_name_ready");
  }

  if (looksLikeSmokeOrTest(candidate) || looksGarbled(productName)) {
    blockedReasons.push("not_real_product_candidate");
  }

  if (!isSafeAffiliateUrl(affiliateUrl)) {
    blockedReasons.push("selected_affiliate_url_required");
  } else {
    score += 40;
    reasons.push("affiliate_url_present");
  }

  if (queue?.id) {
    score += 20;
    reasons.push("linked_queue_found");
  }

  if (hasCandidateImage(candidate) || safeTrim(queue?.thumbnail_url)) {
    score += 10;
    reasons.push("thumbnail_present");
  }

  const candidateScore = normalizeNumber(candidate.candidate_score ?? (candidate as unknown as { product_score?: unknown }).product_score);
  score += Math.min(25, Math.max(0, Math.round(candidateScore / 4)));

  return {
    candidate,
    queue,
    score,
    hard_blocked: blockedReasons.length > 0,
    blocked_reasons: blockedReasons,
    reasons
  };
}

function findQueueForCandidate(candidate: ProductCandidate, queueItems: ProductQueueItem[]) {
  const promotedQueueId = safeTrim(candidate.promoted_queue_id);
  if (promotedQueueId) {
    const queue = queueItems.find((item) => item.id === promotedQueueId);
    if (queue) {
      return queue;
    }
  }

  const rawUrl = safeTrim(candidate.raw_coupang_url);
  const affiliateUrl = safeTrim(candidate.selected_affiliate_url);
  const productName = normalizeComparable(candidate.product_name);
  return queueItems.find((item) =>
    (rawUrl && safeTrim(item.raw_coupang_url) === rawUrl) ||
    (affiliateUrl && safeTrim(item.selected_affiliate_url) === affiliateUrl) ||
    (productName && normalizeComparable(item.product_name) === productName)
  ) ?? null;
}

function findBestPreparedVideoAsset(queueId: string | null | undefined, productAssets: ProductAsset[]) {
  if (!queueId) {
    return null;
  }

  for (const asset of productAssets) {
    if (asset.product_queue_id !== queueId || asset.asset_type !== "video") {
      continue;
    }
    const candidate = normalizeProductAssetToPreparedVideoAsset(asset);
    const validation = validatePreparedVideoAssetRef(candidate);
    if (validation.ok) {
      return {
        asset_ref: validation.asset_ref,
        summary: {
          ...toPreparedVideoAssetApiSummary(validation.asset_ref, validation.safe_display),
          url_host: pickUrlHost(candidate.prepared_video_asset_url ?? candidate.signed_url)
        } as PreparedVideoAssetSummary,
        safe_display: validation.safe_display
      };
    }
  }

  return null;
}

function normalizeProductAssetToPreparedVideoAsset(asset: ProductAsset) {
  const metadata = isRecord(asset.render_qa_metadata) ? asset.render_qa_metadata : {};
  const assetUrl = safeTrim(asset.url);
  const storageKey = safeTrim(metadata.storage_key) || null;
  const signedUrl = safeTrim(metadata.signed_url) || null;
  const preparedVideoAssetUrl = safeTrim(metadata.prepared_video_asset_url) || (isHttpsUrl(assetUrl) ? assetUrl : null);
  const provider = inferAssetProvider(asset, assetUrl);
  return {
    asset_id: asset.id,
    provider,
    storage_key: storageKey,
    prepared_video_asset_url: preparedVideoAssetUrl,
    signed_url: signedUrl,
    video_path_or_url: isHttpsUrl(assetUrl) || signedUrl || preparedVideoAssetUrl || storageKey ? null : assetUrl,
    mime_type: safeTrim(metadata.mime_type) || inferMimeType(assetUrl),
    size_bytes: normalizeOptionalPositiveNumber(metadata.size_bytes ?? (asset as unknown as { size_bytes?: unknown }).size_bytes),
    checksum_sha256: safeTrim(metadata.checksum_sha256 ?? metadata.sha256) || null,
    expires_at: safeTrim(metadata.expires_at) || null,
    server_accessible: isServerAccessibleProvider(provider) && Boolean(storageKey || isHttpsUrl(signedUrl) || isHttpsUrl(preparedVideoAssetUrl))
  };
}

function inferAssetProvider(asset: ProductAsset, url: string) {
  const bucket = safeTrim(asset.bucket).toLowerCase();
  if (bucket.includes("r2") || url.includes(".r2.") || url.includes("r2.dev")) {
    return "r2";
  }
  if (bucket.includes("supabase")) {
    return "supabase_storage";
  }
  if (isHttpsUrl(url)) {
    return "external_https";
  }
  return "local_dev";
}

function buildPackageInput(input: {
  selected: CandidateEvaluation;
  assetRef: PreparedVideoAssetRef;
  visibility: "private" | "unlisted";
}) {
  const productName = safeTrim(input.selected.candidate.product_name);
  const affiliateUrl = safeTrim(input.selected.candidate.selected_affiliate_url);
  const title = buildDefaultProductVideoTitle(productName);
  const description = [
    productName,
    "Private product upload package prepared for manual review.",
    DEFAULT_YOUTUBE_PRODUCT_DISCLOSURE_TEXT,
    "Affiliate link is present in the source package."
  ].join("\n\n");

  return {
    candidate_id: input.selected.candidate.id,
    product_name: productName,
    product_source: "coupang",
    selected_affiliate_url: affiliateUrl,
    prepared_video_asset: input.assetRef,
    video_path_or_url: input.assetRef.prepared_video_asset_url ?? input.assetRef.signed_url ?? input.assetRef.storage_key ?? "",
    visibility: input.visibility,
    title,
    description,
    disclosure_text: DEFAULT_YOUTUBE_PRODUCT_DISCLOSURE_TEXT,
    tags: ["coupang", "private upload", "commerce automation"],
    made_for_kids: false
  };
}

function toSelectedProduct(evaluation: CandidateEvaluation): RealProductAutoPilotSelectedProduct {
  return {
    candidate_id: evaluation.candidate.id,
    product_name: safeTrim(evaluation.candidate.product_name),
    product_score: normalizeNumber(evaluation.candidate.candidate_score ?? (evaluation.candidate as unknown as { product_score?: unknown }).product_score),
    queue_id: evaluation.queue?.id ?? null,
    affiliate_url_present: Boolean(safeTrim(evaluation.candidate.selected_affiliate_url)),
    product_url_present: Boolean(safeTrim(evaluation.candidate.raw_coupang_url)),
    thumbnail_url_present: hasCandidateImage(evaluation.candidate) || Boolean(safeTrim(evaluation.queue?.thumbnail_url)),
    score: evaluation.score,
    reasons: evaluation.reasons
  };
}

function sanitizeAssetRef(assetRef: PreparedVideoAssetRef): SanitizedPreparedVideoAssetRef {
  return {
    asset_id: assetRef.asset_id,
    storage_key: assetRef.storage_key ?? null,
    mime_type: assetRef.mime_type,
    size_bytes: assetRef.size_bytes ?? null,
    checksum_sha256: assetRef.checksum_sha256 ?? null,
    expires_at: assetRef.expires_at ?? null,
    provider: assetRef.provider,
    server_accessible: assetRef.server_accessible,
    signed_url_present: Boolean(assetRef.signed_url),
    prepared_video_asset_url_present: Boolean(assetRef.prepared_video_asset_url)
  };
}

function blockedResult(input: {
  mode: RealProductAutoPilotMode;
  error_code: Exclude<RealProductAutoPilotResult["error_code"], null>;
  message: string;
  blocked_reasons: string[];
  next_auto_action: string;
}): RealProductAutoPilotResult {
  return {
    ok: false,
    error_code: input.error_code,
    message: input.message,
    mode: input.mode,
    selected_product: null,
    prepared_video_asset_ref: null,
    prepared_video_asset_summary: null,
    package_prepare: null,
    blocked_reasons: input.blocked_reasons,
    next_auto_action: input.next_auto_action,
    side_effects: REAL_PRODUCT_AUTO_PILOT_SIDE_EFFECTS
  };
}

function looksLikeSmokeOrTest(candidate: ProductCandidate) {
  const text = [
    candidate.id,
    candidate.product_name,
    candidate.raw_coupang_url,
    candidate.source_name,
    candidate.source_type,
    JSON.stringify(candidate.payload ?? {})
  ].join(" ").toLowerCase();

  return [
    "smoke",
    "test",
    "dummy",
    "placeholder",
    "candidate-video-smoke",
    "youtube-private-smoke",
    "korean-smoke",
    "render quality",
    "스모크",
    "테스트"
  ].some((needle) => text.includes(needle.toLowerCase()));
}

function looksGarbled(value: string) {
  const text = safeTrim(value);
  if (!text) {
    return true;
  }
  const consecutiveQuestionMarkPattern = new RegExp(`[${String.fromCharCode(63)}]{3,}`);
  const cjkPlaceholder = String.fromCharCode(0x5360);
  const replacementCharacter = String.fromCharCode(0xfffd);
  if (consecutiveQuestionMarkPattern.test(text) || text.includes(cjkPlaceholder) || text.includes(replacementCharacter)) {
    return true;
  }
  const questionMarks = [...text].filter((char) => char === "?").length;
  return questionMarks >= 2 && questionMarks / Math.max(text.length, 1) > 0.2;
}

function isSafeAffiliateUrl(value: string) {
  if (!isHttpsUrl(value)) {
    return false;
  }
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "link.coupang.com" || host.endsWith(".coupang.com") || host === "www.coupang.com";
  } catch {
    return false;
  }
}

function hasCandidateImage(candidate: ProductCandidate) {
  const payload = isRecord(candidate.payload) ? candidate.payload : {};
  return Boolean(safeTrim(payload.thumbnail_url) || safeTrim(payload.image_url) || safeTrim(payload.product_image_url));
}

function inferMimeType(value: string) {
  return /\.mp4(\?|#|$)/i.test(value) ? "video/mp4" : "";
}

function pickUrlHost(value: unknown) {
  const text = safeTrim(value);
  if (!isHttpsUrl(text)) {
    return null;
  }
  try {
    return new URL(text).hostname;
  } catch {
    return null;
  }
}

function isServerAccessibleProvider(provider: string) {
  return provider === "r2" || provider === "supabase_storage" || provider === "signed_url" || provider === "external_https";
}

function isHttpsUrl(value: unknown) {
  return /^https:\/\//i.test(safeTrim(value));
}

function normalizeComparable(value: unknown) {
  return safeTrim(value).toLowerCase().replace(/\s+/g, " ");
}

function normalizeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeOptionalPositiveNumber(value: unknown) {
  const normalized = normalizeNumber(value);
  return normalized > 0 ? Math.floor(normalized) : null;
}

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
