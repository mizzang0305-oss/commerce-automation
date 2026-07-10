import { DEFAULT_YOUTUBE_PRODUCT_DISCLOSURE_TEXT } from "@/lib/uploads/youtube/productVideoUploadPackage";
import {
  buildOwnerReviewedPrivateYouTubeUploadRequest,
  buildYouTubeUploadRequest,
  type OwnerReviewedPrivateUploadEvidence
} from "@/lib/uploads/youtube/buildYoutubeUploadRequest";
import type {
  YouTubeUploadRequest
} from "@/lib/uploads/youtube/types";
import type {
  PreparedVideoAssetRef
} from "@/lib/uploads/youtube/uploadAssetContract";
import type {
  ChannelKey
} from "../multi-channel/channelProfiles";
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
import {
  resolveV098PreparedVideoAssetBridge
} from "./v098PreparedVideoAssetBridge";

export type V094UploadPackageLoader = () => Promise<V073UploadPackage[]>;

export type V094UploadPackageRequestResolverOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  uploadAssetProfile?: string | null;
  loadUploadPackages?: V094UploadPackageLoader;
  preparedVideoAssetRefs?: Partial<Record<ChannelKey, PreparedVideoAssetRef | null>>;
  ownerReviewedPrivatePilotEvidence?: (OwnerReviewedPrivateUploadEvidence & {
    channelKey: ChannelKey;
  }) | null;
};

export type V094UploadPackageResolutionDiagnostics = {
  packageCount: number;
  packageIdPresent: boolean;
  queueItemIdPresent: boolean;
  channelKeyPresent: boolean;
  packageIdMatch: boolean;
  queueItemIdMatch: boolean;
  channelKeyMatch: boolean;
  resolverPackageFound: boolean;
  videoAssetEvidencePresent: boolean;
  preparedAssetEvidencePresent: boolean;
  preparedAssetServerAccessible: boolean;
  preparedAssetUploadableUrlPresent: boolean;
  resolverUploadRequestBuilt: boolean;
  resolverBlocker: V094Blocker | null;
  uploadAssetProfileLabel: string | null;
};

type V094UploadPackageWithRuntimeQuality = V073UploadPackage & {
  shortsContentQuality?: unknown;
  shorts_content_quality?: unknown;
};

type V094Blocker = NonNullable<V081PrivateUploadPilotAdapterResult["blocker"]>;

export function createV094UploadPackageRequestResolver(
  options: V094UploadPackageRequestResolverOptions = {}
): V092PrivateUploadRequestResolver {
  return async (request) => resolveV094UploadPackageRequest(request, options);
}

export async function diagnoseV094UploadPackageResolution(
  request: V081PrivateUploadPilotAdapterRequest,
  options: V094UploadPackageRequestResolverOptions = {}
): Promise<V094UploadPackageResolutionDiagnostics> {
  const env = options.env ?? process.env;
  const packages = options.loadUploadPackages
    ? await options.loadUploadPackages()
    : await loadRuntimePackages({
      cwd: options.cwd,
      env,
      uploadAssetProfile: options.uploadAssetProfile
    });
  const uploadPackage = findMatchingPackage(packages, request);
  const preparedAssetDiagnostics = uploadPackage
    ? resolveV098PreparedVideoAssetBridge({
      uploadPackage,
      preparedVideoAssetRef: options.preparedVideoAssetRefs?.[uploadPackage.channelKey] ?? null
    })
    : null;
  const resolved = uploadPackage
    ? await resolveV094UploadPackageRequest(request, {
      ...options,
      env,
      loadUploadPackages: async () => packages
    })
    : null;
  const resolverBlocker = resolved && "blocker" in resolved
    ? resolved.blocker
    : uploadPackage
      ? null
      : "BLOCKED_V081_UPLOAD_PACKAGE_MISSING";

  return {
    packageCount: packages.length,
    packageIdPresent: Boolean(trimOrNull(request.uploadPackageId)),
    queueItemIdPresent: Boolean(trimOrNull(request.queueItemId)),
    channelKeyPresent: Boolean(request.channelKey),
    packageIdMatch: packages.some((item) => item.packageId === request.uploadPackageId),
    queueItemIdMatch: packages.some((item) => item.queueItemId === request.queueItemId),
    channelKeyMatch: packages.some((item) => item.channelKey === request.channelKey),
    resolverPackageFound: Boolean(uploadPackage),
    videoAssetEvidencePresent: preparedAssetDiagnostics?.videoAssetEvidencePresent ?? false,
    preparedAssetEvidencePresent: preparedAssetDiagnostics?.preparedAssetEvidencePresent ?? false,
    preparedAssetServerAccessible: preparedAssetDiagnostics?.preparedAssetServerAccessible ?? false,
    preparedAssetUploadableUrlPresent: preparedAssetDiagnostics?.preparedAssetUploadableUrlPresent ?? false,
    resolverUploadRequestBuilt: Boolean(resolved && !("blocker" in resolved)),
    resolverBlocker,
    uploadAssetProfileLabel: options.uploadAssetProfile ?? env.V051_UPLOAD_ASSET_PROFILE ?? V057_REUPLOAD_ASSET_PROFILE
  };
}

async function resolveV094UploadPackageRequest(
  request: V081PrivateUploadPilotAdapterRequest,
  options: V094UploadPackageRequestResolverOptions
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
  const uploadPackage = findMatchingPackage(packages, request);

  if (!uploadPackage) {
    return null;
  }

  const targetChannelId = resolveRuntimeTargetChannelId(env, request.channelKey);
  const targetChannelBlocker = validateTargetChannelEvidence(uploadPackage, targetChannelId, request.channelKey);
  if (targetChannelBlocker) {
    return blocked(targetChannelBlocker);
  }

  const uploadRequest = buildPrivateUploadRequest(uploadPackage, {
    preparedVideoAssetRef: options.preparedVideoAssetRefs?.[uploadPackage.channelKey] ?? null,
    ownerReviewedPrivatePilotEvidence: options.ownerReviewedPrivatePilotEvidence ?? null
  });
  if ("blocker" in uploadRequest) {
    return uploadRequest;
  }

  return {
    uploadRequest,
    targetChannelId
  };
}

function findMatchingPackage(
  packages: V073UploadPackage[],
  request: V081PrivateUploadPilotAdapterRequest
) {
  return packages.find((item) =>
    item.packageId === request.uploadPackageId &&
    item.channelKey === request.channelKey &&
    item.queueItemId === request.queueItemId
  ) ?? null;
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
  uploadPackage: V073UploadPackage,
  options: {
    preparedVideoAssetRef?: PreparedVideoAssetRef | null;
    ownerReviewedPrivatePilotEvidence?: (OwnerReviewedPrivateUploadEvidence & {
      channelKey: ChannelKey;
    }) | null;
  } = {}
): YouTubeUploadRequest | V092BlockedPrivateUploadRequestResolution {
  const preparedAssetResult = resolveV098PreparedVideoAssetBridge({
    uploadPackage,
    preparedVideoAssetRef: options.preparedVideoAssetRef ?? null
  });
  if (!preparedAssetResult.preparedAsset) {
    return blocked(preparedAssetResult.blocker ?? "BLOCKED_V081_VIDEO_ASSET_MISSING");
  }

  const shortsContentQuality = readShortsContentQuality(uploadPackage);
  const input = {
    provider: "youtube",
    candidate_id: uploadPackage.packageId,
    prepared_video_asset: preparedAssetResult.preparedAsset,
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
    shorts_content_quality: shortsContentQuality,
    made_for_kids: false,
    self_declared_made_for_kids: false
  } as const;
  const ownerReviewEvidence = options.ownerReviewedPrivatePilotEvidence;
  const canUseOwnerReviewedPrivatePath = Boolean(
    !shortsContentQuality &&
    uploadPackage.assetProfile === V057_REUPLOAD_ASSET_PROFILE &&
    ownerReviewEvidence?.channelKey === uploadPackage.channelKey
  );
  const built = canUseOwnerReviewedPrivatePath && ownerReviewEvidence
    ? buildOwnerReviewedPrivateYouTubeUploadRequest(input, ownerReviewEvidence)
    : buildYouTubeUploadRequest(input);

  return built.ok
    ? built.request
    : blocked(mapBuildFailureToBlocker(built.missing_reasons));
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

function resolveRuntimeTargetChannelId(
  env: NodeJS.ProcessEnv,
  channelKey: V081PrivateUploadPilotAdapterRequest["channelKey"]
) {
  const envKey = {
    father_jobs: "YOUTUBE_FATHER_JOBS_CHANNEL_ID",
    neoman_moleulgeol: "YOUTUBE_NEOMAN_MOLEULGEOL_CHANNEL_ID",
    lets_buy: "YOUTUBE_LETS_BUY_CHANNEL_ID"
  }[channelKey];
  return trimOrNull(env[envKey]);
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
    reasons.has("owner_review_evidence") ||
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

function trimOrNull(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized : null;
}
