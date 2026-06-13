export type PreparedVideoAssetProvider =
  | "local_dev"
  | "r2"
  | "supabase_storage"
  | "signed_url"
  | "external_https";

export type PreparedVideoAssetRef = {
  asset_id: string;
  storage_key?: string | null;
  signed_url?: string | null;
  prepared_video_asset_url?: string | null;
  mime_type: "video/mp4";
  size_bytes?: number | null;
  checksum_sha256?: string | null;
  expires_at?: string | null;
  provider: PreparedVideoAssetProvider;
  server_accessible: boolean;
};

export type PreparedVideoAssetReadiness = {
  asset_ready: boolean;
  server_accessible: boolean;
  domain_ready: boolean;
  local_dev_path_only: boolean;
  asset_ref: PreparedVideoAssetRef | null;
  blocked_reasons: string[];
};

export function normalizePreparedVideoAssetRef(input: unknown): PreparedVideoAssetRef | null {
  const source = pickAssetSource(input);
  if (!source) {
    return null;
  }

  const provider = normalizeProvider(source.provider ?? source.source ?? source.asset_provider);
  const mimeType = safeTrim(source.mime_type);
  const assetId = safeTrim(source.asset_id);

  if (!provider || !assetId || mimeType !== "video/mp4") {
    return null;
  }

  return {
    asset_id: assetId,
    storage_key: nullableTrim(source.storage_key),
    signed_url: nullableTrim(source.signed_url),
    prepared_video_asset_url: nullableTrim(source.prepared_video_asset_url),
    mime_type: "video/mp4",
    size_bytes: normalizePositiveNumber(source.size_bytes),
    checksum_sha256: nullableTrim(source.checksum_sha256 ?? source.sha256),
    expires_at: nullableTrim(source.expires_at),
    provider,
    server_accessible: source.server_accessible === true
  };
}

export function buildPreparedVideoAssetReadiness(input: unknown): PreparedVideoAssetReadiness {
  const source = isRecord(input) ? input : {};
  const localPathOnly = isLocalDevVideoPath(source.video_path_or_url);
  const assetRef = normalizePreparedVideoAssetRef(input);
  const blockedReasons: string[] = [];

  if (!assetRef) {
    blockedReasons.push(localPathOnly ? "server_accessible_asset_required" : "prepared_video_asset_ref");
    return {
      asset_ready: false,
      server_accessible: false,
      domain_ready: false,
      local_dev_path_only: localPathOnly,
      asset_ref: null,
      blocked_reasons: blockedReasons
    };
  }

  if (assetRef.provider === "local_dev" || !assetRef.server_accessible) {
    blockedReasons.push("server_accessible_asset_required");
  }

  if (!hasServerReference(assetRef)) {
    blockedReasons.push("upload_asset_reference");
  }

  if (isExpired(assetRef.expires_at)) {
    blockedReasons.push("upload_asset_expired");
  }

  return {
    asset_ready: blockedReasons.length === 0,
    server_accessible: assetRef.server_accessible,
    domain_ready: blockedReasons.length === 0,
    local_dev_path_only: localPathOnly && !assetRef.server_accessible,
    asset_ref: assetRef,
    blocked_reasons: [...new Set(blockedReasons)]
  };
}

function pickAssetSource(input: unknown): Record<string, unknown> | null {
  if (!isRecord(input)) {
    return null;
  }
  if (isRecord(input.prepared_video_asset)) {
    return input.prepared_video_asset;
  }
  if (
    "asset_id" in input ||
    "prepared_video_asset_url" in input ||
    "signed_url" in input ||
    "storage_key" in input
  ) {
    return input;
  }
  return null;
}

function normalizeProvider(input: unknown): PreparedVideoAssetProvider | "" {
  if (
    input === "local_dev" ||
    input === "r2" ||
    input === "supabase_storage" ||
    input === "signed_url" ||
    input === "external_https"
  ) {
    return input;
  }
  return "";
}

function hasServerReference(assetRef: PreparedVideoAssetRef) {
  if (assetRef.provider === "r2" || assetRef.provider === "supabase_storage") {
    return Boolean(assetRef.storage_key || assetRef.signed_url || assetRef.prepared_video_asset_url);
  }
  if (assetRef.provider === "signed_url") {
    return isHttpsUrl(assetRef.signed_url) || isHttpsUrl(assetRef.prepared_video_asset_url);
  }
  if (assetRef.provider === "external_https") {
    return isHttpsUrl(assetRef.prepared_video_asset_url) || isHttpsUrl(assetRef.signed_url);
  }
  return false;
}

function isLocalDevVideoPath(value: unknown) {
  const text = safeTrim(value);
  if (!text || isHttpsUrl(text)) {
    return false;
  }
  return /^[a-z]:\\/i.test(text) ||
    text.startsWith("\\\\") ||
    text.startsWith("/") ||
    text.includes("\\") ||
    /\.mp4(\?.*)?$/i.test(text);
}

function isHttpsUrl(value: unknown) {
  return /^https:\/\//i.test(safeTrim(value));
}

function isExpired(value?: string | null) {
  if (!value) {
    return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

function normalizePositiveNumber(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.floor(value);
}

function nullableTrim(value: unknown) {
  const text = safeTrim(value);
  return text || null;
}

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
