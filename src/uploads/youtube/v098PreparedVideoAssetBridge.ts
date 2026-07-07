import type {
  PreparedVideoAssetRef
} from "@/lib/uploads/youtube/uploadAssetContract";
import {
  buildPreparedVideoAssetReadiness,
  normalizePreparedVideoAssetRef
} from "@/lib/uploads/youtube/uploadAssetContract";
import type { V073UploadPackage } from "../multi-channel/v073UploadPackage";

export type V098PreparedVideoAssetBridgeBlocker = "BLOCKED_V081_VIDEO_ASSET_MISSING";

export type V098PreparedVideoAssetBridgeResult = {
  preparedAsset: PreparedVideoAssetRef | null;
  blocker: V098PreparedVideoAssetBridgeBlocker | null;
  videoAssetEvidencePresent: boolean;
  preparedAssetEvidencePresent: boolean;
  preparedAssetServerAccessible: boolean;
  preparedAssetUploadableUrlPresent: boolean;
};

export function resolveV098PreparedVideoAssetBridge(input: {
  uploadPackage: V073UploadPackage;
  preparedVideoAssetRef?: PreparedVideoAssetRef | null;
}): V098PreparedVideoAssetBridgeResult {
  const videoAssetEvidencePresent = Boolean(
    trimOrNull(input.uploadPackage.videoAsset.path) &&
    trimOrNull(input.uploadPackage.videoAsset.hashEvidence)
  );
  const candidate = input.preparedVideoAssetRef ??
    buildHttpsPreparedAssetRefFromPackage(input.uploadPackage);
  const normalized = normalizePreparedVideoAssetRef(candidate);
  const preparedAssetEvidencePresent = Boolean(normalized);
  const preparedAssetUploadableUrlPresent = hasUploadableHttpsUrl(normalized);
  const readiness = buildPreparedVideoAssetReadiness({
    prepared_video_asset: normalized,
    video_path_or_url: input.uploadPackage.videoAsset.path
  });

  if (
    !videoAssetEvidencePresent ||
    !normalized ||
    !readiness.asset_ready ||
    !preparedAssetUploadableUrlPresent
  ) {
    return {
      preparedAsset: null,
      blocker: "BLOCKED_V081_VIDEO_ASSET_MISSING",
      videoAssetEvidencePresent,
      preparedAssetEvidencePresent,
      preparedAssetServerAccessible: Boolean(normalized?.server_accessible),
      preparedAssetUploadableUrlPresent
    };
  }

  return {
    preparedAsset: normalized,
    blocker: null,
    videoAssetEvidencePresent,
    preparedAssetEvidencePresent,
    preparedAssetServerAccessible: readiness.server_accessible,
    preparedAssetUploadableUrlPresent
  };
}

function buildHttpsPreparedAssetRefFromPackage(
  uploadPackage: V073UploadPackage
): PreparedVideoAssetRef | null {
  const assetUrl = trimOrNull(uploadPackage.videoAsset.path);
  if (!assetUrl || !isHttpsUrl(assetUrl)) {
    return null;
  }

  return {
    asset_id: uploadPackage.videoAsset.hashEvidence || uploadPackage.packageId,
    signed_url: assetUrl,
    prepared_video_asset_url: assetUrl,
    mime_type: "video/mp4",
    checksum_sha256: uploadPackage.videoAsset.hashEvidence || null,
    provider: "external_https",
    server_accessible: true
  };
}

function isHttpsUrl(value: string) {
  return /^https:\/\//i.test(value.trim());
}

function hasUploadableHttpsUrl(value: PreparedVideoAssetRef | null) {
  return Boolean(
    value &&
    (isHttpsUrl(value.prepared_video_asset_url ?? "") || isHttpsUrl(value.signed_url ?? ""))
  );
}

function trimOrNull(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized : null;
}
