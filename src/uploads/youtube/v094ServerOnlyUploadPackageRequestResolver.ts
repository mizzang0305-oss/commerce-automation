import "server-only";

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
import type {
  V081PrivateUploadPilotAdapterRequest
} from "./v081PrivateUploadPilot";
import type {
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

export function createV094ServerOnlyUploadPackageRequestResolver(
  options: V094ServerOnlyUploadPackageRequestResolverOptions = {}
): V092PrivateUploadRequestResolver {
  return async (request) => resolveV094UploadPackageRequest(request, options);
}

async function resolveV094UploadPackageRequest(
  request: V081PrivateUploadPilotAdapterRequest,
  options: V094ServerOnlyUploadPackageRequestResolverOptions
): Promise<V092ResolvedPrivateUploadRequest | null> {
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

  return {
    uploadRequest: buildPrivateUploadRequest(uploadPackage),
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

function buildPrivateUploadRequest(uploadPackage: V073UploadPackage): YouTubeUploadRequest {
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
    made_for_kids: false,
    self_declared_made_for_kids: false
  } as const;
  const built = buildYouTubeUploadRequest(input);

  return built.ok
    ? built.request
    : {
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
      disclosure_text: input.disclosure_text,
      selected_affiliate_url: input.selected_affiliate_url,
      pinned_comment_template: input.pinned_comment_template,
      on_screen_cta_text: input.on_screen_cta_text,
      made_for_kids: false,
      self_declared_made_for_kids: false
    };
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
    ? "Coupang Partners disclosure present."
    : "";
}

function isHttpsUrl(value: string) {
  return /^https:\/\//i.test(value.trim());
}

function trimOrNull(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized : null;
}
