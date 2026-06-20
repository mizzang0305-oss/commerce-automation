import type { YouTubeUploadVisibility } from "@/lib/uploads/youtube/types";
import {
  APPROVE_YOUTUBE_PRIVATE_UPLOAD
} from "@/lib/uploads/youtube/youtubeUploadGuards";
import {
  looksLikeGarbledKorean,
  validateYouTubeDisclosureText
} from "@/lib/uploads/youtube/youtubeDisclosureTextGuard";
import type { PreparedVideoAssetRef } from "@/lib/uploads/youtube/uploadAssetContract";
import { buildPreparedVideoAssetReadiness } from "@/lib/uploads/youtube/uploadAssetContract";
import {
  evaluateShortsContentQuality,
  type ShortsContentQualityResult
} from "@/lib/uploads/youtube/shortsContentQuality";

export type YouTubeProductVideoSource = "coupang" | "manual" | "mock";

export type YouTubeProductVideoUploadPackageInput = {
  candidate_id?: unknown;
  product_name?: unknown;
  product_source?: unknown;
  selected_affiliate_url?: unknown;
  prepared_video_asset?: unknown;
  video_path_or_url?: unknown;
  visibility?: unknown;
  title?: unknown;
  description?: unknown;
  disclosure_text?: unknown;
  tags?: unknown;
  made_for_kids?: unknown;
  shorts_content_quality?: unknown;
};

export type YouTubeProductVideoUploadPackageSideEffects = {
  external_api_called: false;
  youtube_upload_executed: false;
  uploaded: false;
  db_written: false;
  r2_uploaded: false;
  queue_created: false;
  worker_job_created: false;
  upload_package_created: false;
  copy_only_package_created: true;
};

export type YouTubeProductVideoUploadPackageReadiness = {
  candidate_ready: boolean;
  product_ready: boolean;
  video_ready: boolean;
  affiliate_url_ready: boolean;
  disclosure_ready: boolean;
  visibility_ready: boolean;
  title_ready: boolean;
  description_ready: boolean;
  public_upload_blocked: boolean;
  server_accessible_asset_ready: boolean;
  domain_ready: boolean;
  local_dev_path_only: boolean;
  content_quality_ready: boolean;
  story_script_ready: boolean;
  voiceover_audio_ready: boolean;
  description_not_dev_placeholder: boolean;
};

export type YouTubeProductVideoUploadPackage = {
  package_id: string;
  candidate_id: string;
  product_name: string;
  product_source: YouTubeProductVideoSource;
  selected_affiliate_url: string;
  prepared_video_asset: PreparedVideoAssetRef;
  video_path_or_url: string;
  visibility: YouTubeUploadVisibility;
  title: string;
  description: string;
  disclosure_text: string;
  tags: string[];
  made_for_kids: boolean;
  shorts_content_quality: unknown;
  content_quality: ShortsContentQualityResult;
  upload_confirmation_phrase_required: typeof APPROVE_YOUTUBE_PRIVATE_UPLOAD;
  private_execute_approval_required: typeof APPROVE_YOUTUBE_PRIVATE_UPLOAD;
  readiness: YouTubeProductVideoUploadPackageReadiness;
  blocked_reasons: string[];
  side_effects: YouTubeProductVideoUploadPackageSideEffects;
  created_at: string;
};

export type YouTubeProductVideoUploadPackageVerification = {
  final_verified: boolean;
  blocked_reasons: string[];
  side_effects: YouTubeProductVideoUploadPackageSideEffects;
};

export const YOUTUBE_PRODUCT_VIDEO_PACKAGE_SIDE_EFFECTS: YouTubeProductVideoUploadPackageSideEffects = {
  external_api_called: false,
  youtube_upload_executed: false,
  uploaded: false,
  db_written: false,
  r2_uploaded: false,
  queue_created: false,
  worker_job_created: false,
  upload_package_created: false,
  copy_only_package_created: true
};

export const DEFAULT_YOUTUBE_PRODUCT_DISCLOSURE_TEXT =
  "※ 이 콘텐츠는 쿠팡파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.";

export function buildYouTubeProductVideoUploadPackage(input: YouTubeProductVideoUploadPackageInput):
  | { ok: true; package: YouTubeProductVideoUploadPackage }
  | { ok: false; blocked_reasons: string[]; readiness: YouTubeProductVideoUploadPackageReadiness; side_effects: YouTubeProductVideoUploadPackageSideEffects } {
  const candidateId = safeTrim(input.candidate_id);
  const productName = safeTrim(input.product_name);
  const selectedAffiliateUrl = safeTrim(input.selected_affiliate_url);
  const videoPathOrUrl = safeTrim(input.video_path_or_url);
  const assetReadiness = buildPreparedVideoAssetReadiness(input);
  const visibility = normalizeVisibility(input.visibility);
  const rawDisclosureText = safeTrim(input.disclosure_text);
  const disclosureText = repairProductVideoDisclosureText(rawDisclosureText);
  const title = safeTrim(input.title);
  const rawDescriptionInput = safeTrim(input.description);
  const descriptionInput = repairProductVideoDescriptionInput(rawDescriptionInput);
  const descriptionWasRepaired = Boolean(rawDescriptionInput) && !descriptionInput;
  const description = buildProductVideoDescription({
    product_name: repairProductVideoDescriptionFragment(productName),
    selected_affiliate_url: selectedAffiliateUrl,
    description: descriptionInput,
    disclosure_text: disclosureText
  });
  const disclosureReasons = rawDisclosureText
    ? validateYouTubeDisclosureText({ description, disclosure_text: disclosureText })
    : ["disclosure_text"];
  const disclosureReady = disclosureReasons.length === 0;
  const quality = evaluateShortsContentQuality({
    shorts_content_quality: input.shorts_content_quality,
    description,
    disclosure_ready: disclosureReady,
    affiliate_url_present: Boolean(selectedAffiliateUrl)
  });

  const readiness: YouTubeProductVideoUploadPackageReadiness = {
    candidate_ready: Boolean(candidateId),
    product_ready: Boolean(productName),
    video_ready: assetReadiness.asset_ready,
    affiliate_url_ready: Boolean(selectedAffiliateUrl),
    disclosure_ready: disclosureReady,
    visibility_ready: Boolean(visibility),
    title_ready: Boolean(title),
    description_ready: Boolean(descriptionInput) || descriptionWasRepaired,
    public_upload_blocked: input.visibility !== "public",
    server_accessible_asset_ready: assetReadiness.server_accessible && assetReadiness.asset_ready,
    domain_ready: assetReadiness.domain_ready,
    local_dev_path_only: assetReadiness.local_dev_path_only,
    content_quality_ready: quality.passed,
    story_script_ready: quality.hook_text_present &&
      quality.problem_text_present &&
      quality.why_buy_reason_present &&
      quality.target_customer_present &&
      quality.product_benefit_present &&
      quality.caution_or_check_before_buy_present &&
      quality.cta_present &&
      quality.korean_voiceover_script_present,
    voiceover_audio_ready: quality.voiceover_audio_ready,
    description_not_dev_placeholder: quality.description_not_dev_placeholder &&
      quality.description_contains_no_manual_review_placeholder
  };
  const blockedReasons = buildBlockedReasons(
    readiness,
    disclosureReasons,
    input.visibility,
    assetReadiness.blocked_reasons,
    quality.blocked_reasons
  );

  if (blockedReasons.length > 0) {
    return {
      ok: false,
      blocked_reasons: blockedReasons,
      readiness,
      side_effects: YOUTUBE_PRODUCT_VIDEO_PACKAGE_SIDE_EFFECTS
    };
  }

  return {
    ok: true,
    package: {
      package_id: `youtube-product-private-${slug(candidateId)}-${slug(productName)}`.slice(0, 120),
      candidate_id: candidateId,
      product_name: productName,
      product_source: normalizeProductSource(input.product_source),
      selected_affiliate_url: selectedAffiliateUrl,
      prepared_video_asset: assetReadiness.asset_ref as PreparedVideoAssetRef,
      video_path_or_url: videoPathOrUrl,
      visibility: visibility || "private",
      title,
      description,
      disclosure_text: disclosureText,
      tags: normalizeTags(input.tags),
      made_for_kids: input.made_for_kids === true,
      shorts_content_quality: input.shorts_content_quality,
      content_quality: quality,
      upload_confirmation_phrase_required: APPROVE_YOUTUBE_PRIVATE_UPLOAD,
      private_execute_approval_required: APPROVE_YOUTUBE_PRIVATE_UPLOAD,
      readiness,
      blocked_reasons: [],
      side_effects: YOUTUBE_PRODUCT_VIDEO_PACKAGE_SIDE_EFFECTS,
      created_at: new Date().toISOString()
    }
  };
}

export function buildProductVideoDescription(input: {
  product_name: string;
  selected_affiliate_url: string;
  description?: string;
  disclosure_text?: string;
}) {
  const base = input.description?.trim() || [
    input.product_name ? `Product: ${input.product_name}` : "Product selected for private review.",
    "Affiliate link is present in the source package.",
    input.disclosure_text || DEFAULT_YOUTUBE_PRODUCT_DISCLOSURE_TEXT
  ].join("\n");
  const parts = [base];
  const disclosure = input.disclosure_text || DEFAULT_YOUTUBE_PRODUCT_DISCLOSURE_TEXT;
  if (!base.includes(disclosure)) {
    parts.push(disclosure);
  }
  if (input.selected_affiliate_url && !base.includes(input.selected_affiliate_url)) {
    parts.push(`Affiliate link: ${input.selected_affiliate_url}`);
  }
  return parts.filter(Boolean).join("\n\n");
}

export function buildDefaultProductVideoTitle(productName: string) {
  return productName ? `[${productName}] 실제 구매 전 확인 포인트` : "";
}

export function verifyYouTubeProductVideoUploadPackage(input: {
  youtube_video_id?: unknown;
  studio_visibility_private?: unknown;
  studio_title_correct?: unknown;
  studio_disclosure_korean_correct?: unknown;
  studio_affiliate_link_present?: unknown;
  no_public_or_scheduled_state?: unknown;
}): YouTubeProductVideoUploadPackageVerification {
  const blockedReasons: string[] = [];
  if (!safeTrim(input.youtube_video_id)) {
    blockedReasons.push("youtube_video_id");
  }
  if (input.studio_visibility_private !== true) {
    blockedReasons.push("studio_visibility_private");
  }
  if (input.studio_title_correct !== true) {
    blockedReasons.push("studio_title_correct");
  }
  if (input.studio_disclosure_korean_correct !== true) {
    blockedReasons.push("studio_disclosure_korean_correct");
  }
  if (input.studio_affiliate_link_present !== true) {
    blockedReasons.push("studio_affiliate_link_present");
  }
  if (input.no_public_or_scheduled_state !== true) {
    blockedReasons.push("no_public_or_scheduled_state");
  }
  return {
    final_verified: blockedReasons.length === 0,
    blocked_reasons: blockedReasons,
    side_effects: YOUTUBE_PRODUCT_VIDEO_PACKAGE_SIDE_EFFECTS
  };
}

function buildBlockedReasons(
  readiness: YouTubeProductVideoUploadPackageReadiness,
  disclosureReasons: string[],
  rawVisibility: unknown,
  assetBlockedReasons: string[],
  contentQualityReasons: string[]
) {
  const reasons: string[] = [];
  if (!readiness.candidate_ready) reasons.push("candidate_id");
  if (!readiness.product_ready) reasons.push("product_name");
  if (!readiness.video_ready) reasons.push(...assetBlockedReasons);
  if (!readiness.affiliate_url_ready) reasons.push("selected_affiliate_url");
  if (!readiness.visibility_ready) {
    reasons.push(
      rawVisibility === "public"
        ? "visibility_public_blocked"
        : rawVisibility === "unlisted"
          ? "visibility_unlisted_blocked"
          : "visibility"
    );
  }
  if (!readiness.title_ready) reasons.push("title");
  if (!readiness.description_ready) reasons.push("description");
  reasons.push(...disclosureReasons);
  reasons.push(...contentQualityReasons);
  return [...new Set(reasons)];
}

function normalizeVisibility(input: unknown): YouTubeUploadVisibility | "" {
  if (input === "private") {
    return input;
  }
  return "";
}

function normalizeProductSource(input: unknown): YouTubeProductVideoSource {
  if (input === "coupang" || input === "manual" || input === "mock") {
    return input;
  }
  return "manual";
}

function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return ["coupang", "private upload", "commerce automation"];
  }
  return [...new Set(input.map((item) => safeTrim(item)).filter(Boolean))].slice(0, 20);
}

function repairProductVideoDisclosureText(value: string) {
  if (!value) {
    return "";
  }
  return looksLikeGarbledKorean(value) ? DEFAULT_YOUTUBE_PRODUCT_DISCLOSURE_TEXT : value;
}

function repairProductVideoDescriptionInput(value: string) {
  if (!value) {
    return "";
  }
  return looksLikeGarbledKorean(value) ? "" : value;
}

function repairProductVideoDescriptionFragment(value: string) {
  if (!value) {
    return "";
  }
  return looksLikeGarbledKorean(value) ? "" : value;
}

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "package";
}
