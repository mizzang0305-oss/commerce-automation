import "server-only";

import { DEFAULT_YOUTUBE_PRODUCT_DISCLOSURE_TEXT } from "@/lib/uploads/youtube";
import {
  buildYouTubeUploadRequest
} from "@/lib/uploads/youtube/buildYoutubeUploadRequest";
import type {
  YouTubeUploadRequest
} from "@/lib/uploads/youtube/types";
import type {
  PreparedVideoAssetRef
} from "@/lib/uploads/youtube/uploadAssetContract";
import type {
  V073UploadPackage
} from "../multi-channel/v073UploadPackage";
import {
  generateV073UploadPackages
} from "../multi-channel/v073UploadPackageGenerator";
import {
  V057_REUPLOAD_ASSET_PROFILE
} from "../multi-channel/v057ReuploadAssetBinding";
import {
  resolveV054RuntimeTargetChannelIds
} from "../multi-channel/v054RuntimeYouTubeAdapterFactory";
import {
  validateYouTubeChannelId
} from "../multi-channel/youtubeChannelIdValidator";
import type {
  V081PrivateUploadPilotAdapterResult,
  V081PrivateUploadPilotAdapterRequest
} from "./v081PrivateUploadPilot";
import type {
  V092BlockedPrivateUploadRequestResolution,
  V092PrivateUploadRequestResolver,
  V092ResolvedPrivateUploadRequest
} from "./v092PrivateUploadExecutorBoundary";

export type V094UploadPackageLoader = () => Promise<V073UploadPackage[]>;

export type V094ServerOnlyUploadPackageRequestResolverOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  uploadAssetProfile?: string | null;
  loadUploadPackages?: V094UploadPackageLoader;
};

type V094UploadPackageWithRuntimeQuality = V073UploadPackage & {
  shortsContentQuality?: unknown;
  shorts_content_quality?: unknown;
};

type V094Blocker = NonNullable<V081PrivateUploadPilotAdapterResult["blocker"]>;

export function createV094ServerOnlyUploadPackageRequestResolver(
  options: V094ServerOnlyUploadPackageRequestResolverOptions = {}
): V092PrivateUploadRequestResolver {
  return async (request) => resolveV094UploadPackageRequest(request, options);
}

async function resolveV094UploadPackageRequest(
  request: V081PrivateUploadPilotAdapterRequest,
  options: V094ServerOnlyUploadPackageRequestResolverOptions
): Promise<V092ResolvedPrivateUploadRequest | V092BlockedPrivateUploadRequestResolution | null> {
  if (!trimOrNull(request.uploadPackageId) || !trimOrNull(request.queueItemId)) {
    return null;
  }

  const env = options.env ?? process.env;
  const packages = options.loadUploadPackages
    ? await options.loadUploadPackages()
    : await loadRuntimePackages({
      cwd: options.cwd,
      env,
      uploadAssetProfile: options.uploadAssetProfile
    });
  const uploadPackage = packages.find((item) =>
    item.packageId === request.uploadPackageId &&
    item.channelKey === request.channelKey &&
    item.queueItemId === request.queueItemId
  ) ?? null;

  if (!uploadPackage) {
    return null;
  }

  const targetChannelId = resolveV054RuntimeTargetChannelIds(env)[request.channelKey] ?? null;
  const targetChannelBlocker = validateTargetChannelEvidence(uploadPackage, targetChannelId, request.channelKey);
  if (targetChannelBlocker) {
    return blocked(targetChannelBlocker);
  }

  const uploadRequest = buildPrivateUploadRequest(uploadPackage);
  if ("blocker" in uploadRequest) {
    return uploadRequest;
  }

  return {
    uploadRequest,
    targetChannelId
  };
}

async function loadRuntimePackages(input: {
  cwd?: string;
  env: NodeJS.ProcessEnv;
  uploadAssetProfile?: string | null;
}) {
  const result = await generateV073UploadPackages({
    cwd: input.cwd,
    env: input.env,
    uploadAssetProfile: input.uploadAssetProfile ?? input.env.V051_UPLOAD_ASSET_PROFILE ?? V057_REUPLOAD_ASSET_PROFILE
  });
  return result.packages;
}

function buildPrivateUploadRequest(
  uploadPackage: V073UploadPackage
): YouTubeUploadRequest | V092BlockedPrivateUploadRequestResolution {
  const preparedAsset = buildPreparedVideoAsset(uploadPackage);
  const input = {
    provider: "youtube",
    candidate_id: uploadPackage.packageId,
    prepared_video_asset: preparedAsset,
    video_path_or_url: uploadPackage.videoAsset.path,
    title: uploadPackage.youtubeMetadata.title,
    description: uploadPackage.youtubeMetadata.description,
    tags: uploadPackage.youtubeMetadata.tags,
    category_id: uploadPackage.youtubeMetadata.categoryId,
    visibility: "private",
    execution_intent: "private_execute",
    disclosure_text: buildDisclosureText(uploadPackage),
    selected_affiliate_url: uploadPackage.deeplink.selectedAffiliateUrl ?? "",
    pinned_comment_template: uploadPackage.commentPackage.commentText,
    on_screen_cta_text: "comment link",
    shorts_content_quality: readShortsContentQuality(uploadPackage),
    made_for_kids: false,
    self_declared_made_for_kids: false
  } as const;
  const built = buildYouTubeUploadRequest(input);

  return built.ok
    ? built.request
    : blocked(mapBuildFailureToBlocker(built.missing_reasons));
}

function buildPreparedVideoAsset(uploadPackage: V073UploadPackage): PreparedVideoAssetRef {
  const assetUrl = isHttpsUrl(uploadPackage.videoAsset.path)
    ? uploadPackage.videoAsset.path
    : null;

  return {
    asset_id: uploadPackage.videoAsset.hashEvidence || uploadPackage.packageId,
    signed_url: assetUrl,
    prepared_video_asset_url: assetUrl,
    mime_type: "video/mp4",
    checksum_sha256: uploadPackage.videoAsset.hashEvidence || null,
    provider: assetUrl ? "external_https" : "local_dev",
    server_accessible: Boolean(assetUrl)
  };
}

function buildDisclosureText(uploadPackage: V073UploadPackage) {
  return uploadPackage.commentPackage.coupangPartnersDisclosurePresent
    ? DEFAULT_YOUTUBE_PRODUCT_DISCLOSURE_TEXT
    : "";
}

function readShortsContentQuality(uploadPackage: V073UploadPackage) {
  const withQuality = uploadPackage as V094UploadPackageWithRuntimeQuality;
  return withQuality.shortsContentQuality ?? withQuality.shorts_content_quality;
}

function validateTargetChannelEvidence(
  uploadPackage: V073UploadPackage,
  targetChannelId: string | null,
  channelKey: V081PrivateUploadPilotAdapterRequest["channelKey"]
): V094Blocker | null {
  const target = uploadPackage.targetChannel;
  const runtimeEvidence = validateYouTubeChannelId(targetChannelId);
  if (
    target.channelKey !== channelKey ||
    target.formatValid !== true ||
    !trimOrNull(target.channelIdHashPrefix) ||
    !runtimeEvidence.present ||
    !runtimeEvidence.format_valid ||
    !runtimeEvidence.hash_prefix ||
    runtimeEvidence.hash_prefix !== target.channelIdHashPrefix
  ) {
    return "BLOCKED_V081_TARGET_CHANNEL_EVIDENCE_MISSING";
  }
  return null;
}

function mapBuildFailureToBlocker(missingReasons: string[]): V094Blocker {
  const reasons = new Set(missingReasons);
  if (
    reasons.has("server_accessible_asset_required") ||
    reasons.has("prepared_video_asset_ref") ||
    reasons.has("upload_asset_reference") ||
    reasons.has("upload_asset_expired")
  ) {
    return "BLOCKED_V081_VIDEO_ASSET_MISSING";
  }
  if (reasons.has("selected_affiliate_url")) {
    return "BLOCKED_V081_AFFILIATE_URL_EVIDENCE_MISSING";
  }
  if (
    reasons.has("disclosure_text") ||
    reasons.has("disclosure_text_missing_required_korean") ||
    reasons.has("disclosure_text_garbled")
  ) {
    return "BLOCKED_V081_COUPANG_DISCLOSURE_EVIDENCE_MISSING";
  }
  if (
    reasons.has("title") ||
    reasons.has("description_or_caption") ||
    reasons.has("visibility") ||
    reasons.has("visibility_not_allowed")
  ) {
    return "BLOCKED_V081_METADATA_NOT_READY";
  }
  if (
    missingReasons.some((reason) =>
      reason === "CONTENT_QUALITY_FAILED" ||
      reason.includes("QUALITY") ||
      reason.includes("VOICEOVER") ||
      reason.includes("CAPTION") ||
      reason.includes("SCENE") ||
      reason.includes("HOOK") ||
      reason.includes("MOTION") ||
      reason.includes("VISUAL")
    )
  ) {
    return "BLOCKED_V081_METADATA_NOT_READY";
  }
  return "BLOCKED_V081_UPLOAD_PACKAGE_MISSING";
}

function blocked(blocker: V094Blocker): V092BlockedPrivateUploadRequestResolution {
  return { blocker };
}

function isHttpsUrl(value: string) {
  return /^https:\/\//i.test(value.trim());
}

function trimOrNull(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized : null;
}
