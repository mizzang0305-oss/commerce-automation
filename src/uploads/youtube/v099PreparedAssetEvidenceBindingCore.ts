import type { PreparedVideoAssetRef, PreparedVideoAssetProvider } from "@/lib/uploads/youtube/uploadAssetContract";
import {
  buildPreparedVideoAssetReadiness,
  normalizePreparedVideoAssetRef
} from "@/lib/uploads/youtube/uploadAssetContract";

export type V099PreparedAssetEvidenceBlocker = "BLOCKED_V081_VIDEO_ASSET_MISSING";

export type V099PreparedAssetEvidenceBindingResult = {
  ready: boolean;
  preparedAsset: PreparedVideoAssetRef | null;
  blocker: V099PreparedAssetEvidenceBlocker | null;
  preparedAssetEvidencePresent: boolean;
  preparedAssetServerAccessible: boolean;
  preparedAssetUploadableUrlPresent: boolean;
  preparedAssetExpired: boolean | null;
  preparedAssetProviderLabel: string | null;
  preparedAssetHashPrefix: string | null;
  raw_urls_printed: false;
  raw_file_paths_printed: false;
};

const ALLOWED_UPLOADABLE_PROVIDERS = new Set<PreparedVideoAssetProvider>([
  "external_https",
  "signed_url",
  "signed_https",
  "r2_signed_url",
  "supabase_signed_url"
]);

export function bindV099PreparedVideoAssetEvidence(input: {
  preparedVideoAssetRef?: PreparedVideoAssetRef | null;
  videoAssetHashPrefix?: string | null;
}): V099PreparedAssetEvidenceBindingResult {
  const preparedAsset = normalizePreparedVideoAssetRef(input.preparedVideoAssetRef);
  const preparedAssetEvidencePresent = Boolean(preparedAsset);
  const preparedAssetUploadableUrlPresent = hasUploadableHttpsUrl(preparedAsset);
  const preparedAssetExpired = preparedAsset?.expires_at ? isExpired(preparedAsset.expires_at) : null;
  const preparedAssetHashPrefix = safeHashPrefix(preparedAsset?.checksum_sha256) ?? safeHashPrefix(input.videoAssetHashPrefix);
  const readiness = buildPreparedVideoAssetReadiness({
    prepared_video_asset: preparedAsset
  });

  const ready = Boolean(
    preparedAsset &&
    readiness.asset_ready &&
    preparedAsset.server_accessible &&
    preparedAssetUploadableUrlPresent &&
    ALLOWED_UPLOADABLE_PROVIDERS.has(preparedAsset.provider) &&
    preparedAsset.mime_type === "video/mp4" &&
    safeTrim(preparedAsset.asset_id) &&
    preparedAssetHashPrefix &&
    preparedAssetExpired !== true
  );

  return {
    ready,
    preparedAsset: ready ? preparedAsset : null,
    blocker: ready ? null : "BLOCKED_V081_VIDEO_ASSET_MISSING",
    preparedAssetEvidencePresent,
    preparedAssetServerAccessible: Boolean(preparedAsset?.server_accessible),
    preparedAssetUploadableUrlPresent,
    preparedAssetExpired,
    preparedAssetProviderLabel: preparedAsset?.provider ?? null,
    preparedAssetHashPrefix,
    raw_urls_printed: false,
    raw_file_paths_printed: false
  };
}

function hasUploadableHttpsUrl(value: PreparedVideoAssetRef | null) {
  return Boolean(
    value &&
    (isHttpsUrl(value.prepared_video_asset_url ?? "") || isHttpsUrl(value.signed_url ?? ""))
  );
}

function isHttpsUrl(value: string) {
  return /^https:\/\//i.test(value.trim());
}

function isExpired(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

function safeHashPrefix(value: string | null | undefined) {
  const text = safeTrim(value);
  return text ? text.slice(0, 10) : null;
}

function safeTrim(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}
