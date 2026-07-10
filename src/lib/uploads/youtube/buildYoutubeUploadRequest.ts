import type {
  YouTubeUploadRequest,
  YouTubeUploadRequestInput,
  YouTubeUploadVisibility
} from "@/lib/uploads/youtube/types";
import { buildPreparedVideoAssetReadiness } from "@/lib/uploads/youtube/uploadAssetContract";
import { evaluateShortsContentQuality } from "@/lib/uploads/youtube/shortsContentQuality";
import { validateYouTubeDisclosureText } from "@/lib/uploads/youtube/youtubeDisclosureTextGuard";
import { buildYouTubeLinkCtaMetadata } from "@/lib/uploads/youtube/youtubeLinkCtaMetadata";

export type OwnerReviewedPrivateUploadEvidence = {
  profile: "v057_corrected_reupload";
  correctedPreviewReady: true;
  hookFirstFrameReviewReady: true;
  channelBindingReady: true;
  noUploadReviewSideEffects: true;
};

type YouTubeUploadRequestBuildResult =
  | { ok: true; request: YouTubeUploadRequest }
  | { ok: false; missing_reasons: string[] };

export function buildYouTubeUploadRequest(input: YouTubeUploadRequestInput):
  YouTubeUploadRequestBuildResult {
  return buildYouTubeUploadRequestInternal(input, false);
}

export function buildOwnerReviewedPrivateYouTubeUploadRequest(
  input: YouTubeUploadRequestInput,
  evidence: OwnerReviewedPrivateUploadEvidence
): YouTubeUploadRequestBuildResult {
  if (
    evidence.profile !== "v057_corrected_reupload" ||
    evidence.correctedPreviewReady !== true ||
    evidence.hookFirstFrameReviewReady !== true ||
    evidence.channelBindingReady !== true ||
    evidence.noUploadReviewSideEffects !== true ||
    input.visibility !== "private" ||
    normalizeExecutionIntent(input.execution_intent ?? input.upload_intent) !== "private_execute"
  ) {
    return { ok: false, missing_reasons: ["owner_review_evidence"] };
  }

  return buildYouTubeUploadRequestInternal(input, true);
}

function buildYouTubeUploadRequestInternal(
  input: YouTubeUploadRequestInput,
  ownerReviewedPrivateQualityAccepted: boolean
): YouTubeUploadRequestBuildResult {
  const candidateId = safeTrim(input.candidate_id);
  const videoPathOrUrl = safeTrim(input.video_path_or_url);
  const assetReadiness = buildPreparedVideoAssetReadiness(input);
  const title = safeTrim(input.title);
  const descriptionInput = safeTrim(input.description);
  const captionInput = safeTrim(input.caption);
  const disclosureText = safeTrim(input.disclosure_text);
  const selectedAffiliateUrl = safeTrim(input.selected_affiliate_url);
  const smokeApproval = safeTrim(input.smoke_approval) || safeTrim(input.smokeApproval);
  const visibility = normalizeVisibility(input.visibility);
  const executionIntent = normalizeExecutionIntent(input.execution_intent ?? input.upload_intent);
  const missingReasons: string[] = [];

  if (!candidateId) {
    missingReasons.push("candidate_id");
  }
  if (!assetReadiness.asset_ready) {
    missingReasons.push(...assetReadiness.blocked_reasons);
  }
  if (!title) {
    missingReasons.push("title");
  }
  if (!descriptionInput && !captionInput) {
    missingReasons.push("description_or_caption");
  }
  if (!disclosureText) {
    missingReasons.push("disclosure_text");
  } else {
    missingReasons.push(...validateYouTubeDisclosureText({
      description: descriptionInput,
      caption: captionInput,
      disclosure_text: disclosureText
    }));
  }
  if (!selectedAffiliateUrl) {
    missingReasons.push("selected_affiliate_url");
  }
  if (!visibility) {
    missingReasons.push(input.visibility === "public" ? "visibility_not_allowed" : "visibility");
  }
  if (!ownerReviewedPrivateQualityAccepted) {
    const quality = evaluateShortsContentQuality({
      shorts_content_quality: input.shorts_content_quality,
      description: descriptionInput || captionInput,
      disclosure_ready: disclosureText
        ? validateYouTubeDisclosureText({
          description: descriptionInput,
          caption: captionInput,
          disclosure_text: disclosureText
        }).length === 0
        : false,
      affiliate_url_present: Boolean(selectedAffiliateUrl)
    });
    missingReasons.push(...quality.blocked_reasons);
  }

  if (missingReasons.length > 0) {
    return { ok: false, missing_reasons: [...new Set(missingReasons)] };
  }
  const safeVisibility: YouTubeUploadVisibility = visibility || "private";

  const linkCtaMetadata = buildYouTubeLinkCtaMetadata({
    selected_affiliate_url: selectedAffiliateUrl,
    description: descriptionInput || captionInput,
    disclosure_text: disclosureText
  });

  return {
    ok: true,
    request: {
      provider: "youtube",
      candidate_id: candidateId,
      prepared_video_asset: assetReadiness.asset_ref!,
      video_path_or_url: videoPathOrUrl,
      title,
      description: linkCtaMetadata.description,
      tags: normalizeTags(input.tags),
      category_id: safeTrim(input.category_id) || undefined,
      visibility: safeVisibility,
      execution_intent: executionIntent,
      disclosure_text: disclosureText,
      selected_affiliate_url: selectedAffiliateUrl,
      pinned_comment_template: linkCtaMetadata.pinned_comment_template,
      on_screen_cta_text: linkCtaMetadata.on_screen_cta_text,
      shorts_content_quality: input.shorts_content_quality,
      smoke_approval: smokeApproval || undefined,
      made_for_kids: false,
      self_declared_made_for_kids: false
    }
  };
}

function normalizeVisibility(input: unknown): YouTubeUploadVisibility | "" {
  if (input === "private" || input === "unlisted") {
    return input;
  }
  return "";
}

function normalizeExecutionIntent(input: unknown) {
  return input === "live_smoke" ? "live_smoke" : "private_execute";
}

function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return [...new Set(input.map((item) => safeTrim(item)).filter(Boolean))].slice(0, 20);
}

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
