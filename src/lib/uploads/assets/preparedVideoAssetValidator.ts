import type { PreparedVideoAssetProvider, PreparedVideoAssetRef } from "@/lib/uploads/youtube/uploadAssetContract";
import {
  PREPARED_VIDEO_ASSET_SIDE_EFFECTS,
  type PreparedVideoAssetSideEffects
} from "@/lib/uploads/assets/preparedVideoAssetProvider";

export type PreparedVideoAssetBlockedReason =
  | "asset_ref_missing"
  | "asset_id_missing"
  | "provider_missing"
  | "server_accessible_false"
  | "local_path_only"
  | "windows_local_path"
  | "var_task_runtime_path"
  | "relative_mp4_path"
  | "signed_url_missing"
  | "signed_url_expired"
  | "mime_type_invalid"
  | "size_bytes_missing"
  | "size_bytes_zero"
  | "all_server_refs_missing";

export type PreparedVideoAssetSafeDisplay = {
  asset_id: string;
  provider: PreparedVideoAssetProvider | "";
  server_accessible: boolean;
  mime_type: string;
  size_bytes: number | null;
  checksum_sha256_present: boolean;
  expires_at: string | null;
  storage_key: string | null;
  signed_url: string | null;
  prepared_video_asset_url: string | null;
  signed_url_present: boolean;
  prepared_video_asset_url_present: boolean;
  storage_key_present: boolean;
};

export type PreparedVideoAssetValidationResult =
  | {
      ok: true;
      error_code: null;
      asset_ref: PreparedVideoAssetRef;
      safe_display: PreparedVideoAssetSafeDisplay;
      blocked_reasons: [];
      side_effects: PreparedVideoAssetSideEffects;
    }
  | {
      ok: false;
      error_code: "PREPARED_VIDEO_ASSET_NOT_READY";
      asset_ref: PreparedVideoAssetRef | null;
      safe_display: PreparedVideoAssetSafeDisplay;
      blocked_reasons: PreparedVideoAssetBlockedReason[];
      side_effects: PreparedVideoAssetSideEffects;
    };

type PreparedVideoAssetSource = {
  asset_id: string;
  storage_key: string | null;
  signed_url: string | null;
  prepared_video_asset_url: string | null;
  mime_type: string;
  size_bytes: number | null;
  checksum_sha256: string | null;
  expires_at: string | null;
  provider: PreparedVideoAssetProvider | "";
  server_accessible: boolean;
  video_path_or_url: string | null;
};

export function validatePreparedVideoAssetRef(input: unknown): PreparedVideoAssetValidationResult {
  const source = normalizePreparedVideoAssetInput(input);
  const reasons: PreparedVideoAssetBlockedReason[] = [];

  if (!pickAssetSource(input)) {
    reasons.push("asset_ref_missing");
  }
  if (!source.asset_id) {
    reasons.push("asset_id_missing");
  }
  if (!source.provider) {
    reasons.push("provider_missing");
  }
  if (source.server_accessible !== true) {
    reasons.push("server_accessible_false");
  }
  if (source.mime_type !== "video/mp4") {
    reasons.push("mime_type_invalid");
  }
  if (source.size_bytes === null) {
    reasons.push("size_bytes_missing");
  } else if (source.size_bytes <= 0) {
    reasons.push("size_bytes_zero");
  }

  const pathReasons = detectLocalPathReasons(source);
  reasons.push(...pathReasons);

  if (!source.storage_key && !source.signed_url && !source.prepared_video_asset_url) {
    reasons.push("all_server_refs_missing");
    if (source.video_path_or_url) {
      reasons.push("local_path_only");
    }
  }

  if (source.provider === "signed_url" && !isHttpsUrl(source.signed_url)) {
    reasons.push("signed_url_missing");
  }
  if (source.signed_url && (!source.expires_at || isExpired(source.expires_at))) {
    reasons.push("signed_url_expired");
  }
  if (source.prepared_video_asset_url && !isHttpsUrl(source.prepared_video_asset_url)) {
    reasons.push(...detectLocalPathReasons({ ...source, signed_url: null, video_path_or_url: source.prepared_video_asset_url }));
  }

  const blockedReasons = unique(reasons);
  const assetRef = buildAssetRef(source);
  const safeDisplay = maskPreparedVideoAssetDisplay(source);

  if (blockedReasons.length > 0 || !assetRef) {
    return {
      ok: false,
      error_code: "PREPARED_VIDEO_ASSET_NOT_READY",
      asset_ref: assetRef,
      safe_display: safeDisplay,
      blocked_reasons: blockedReasons.length ? blockedReasons : ["asset_ref_missing"],
      side_effects: PREPARED_VIDEO_ASSET_SIDE_EFFECTS
    };
  }

  return {
    ok: true,
    error_code: null,
    asset_ref: assetRef,
    safe_display: safeDisplay,
    blocked_reasons: [],
    side_effects: PREPARED_VIDEO_ASSET_SIDE_EFFECTS
  };
}

export function buildPreparedVideoAssetInputFromManualRegistration(input: unknown): PreparedVideoAssetSource {
  return normalizePreparedVideoAssetInput(input);
}

export function maskPreparedVideoAssetDisplay(input: unknown): PreparedVideoAssetSafeDisplay {
  const source = normalizePreparedVideoAssetInput(input);
  return {
    asset_id: source.asset_id,
    provider: source.provider,
    server_accessible: source.server_accessible,
    mime_type: source.mime_type,
    size_bytes: source.size_bytes,
    checksum_sha256_present: Boolean(source.checksum_sha256),
    expires_at: source.expires_at,
    storage_key: source.storage_key,
    signed_url: maskUrl(source.signed_url),
    prepared_video_asset_url: maskUrl(source.prepared_video_asset_url),
    signed_url_present: Boolean(source.signed_url),
    prepared_video_asset_url_present: Boolean(source.prepared_video_asset_url),
    storage_key_present: Boolean(source.storage_key)
  };
}

export function toPreparedVideoAssetApiSummary(assetRef: PreparedVideoAssetRef, safeDisplay: PreparedVideoAssetSafeDisplay) {
  return {
    asset_id: assetRef.asset_id,
    provider: assetRef.provider,
    server_accessible: assetRef.server_accessible,
    mime_type: assetRef.mime_type,
    size_bytes: assetRef.size_bytes ?? null,
    checksum_sha256_present: Boolean(assetRef.checksum_sha256),
    expires_at: assetRef.expires_at ?? null,
    signed_url_present: Boolean(assetRef.signed_url),
    prepared_video_asset_url_present: Boolean(assetRef.prepared_video_asset_url),
    storage_key_present: Boolean(assetRef.storage_key),
    safe_display: safeDisplay
  };
}

function normalizePreparedVideoAssetInput(input: unknown): PreparedVideoAssetSource {
  const raw = pickAssetSource(input) ?? {};
  return {
    asset_id: safeTrim(raw.asset_id),
    storage_key: nullableTrim(raw.storage_key),
    signed_url: nullableTrim(raw.signed_url),
    prepared_video_asset_url: nullableTrim(raw.prepared_video_asset_url),
    mime_type: safeTrim(raw.mime_type),
    size_bytes: normalizeNumber(raw.size_bytes),
    checksum_sha256: nullableTrim(raw.checksum_sha256 ?? raw.sha256),
    expires_at: nullableTrim(raw.expires_at),
    provider: normalizeProvider(raw.provider ?? raw.source ?? raw.asset_provider),
    server_accessible: raw.server_accessible === true || raw.server_accessible === "true",
    video_path_or_url: nullableTrim(raw.video_path_or_url)
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
    "storage_key" in input ||
    "signed_url" in input ||
    "prepared_video_asset_url" in input ||
    "video_path_or_url" in input
  ) {
    return input;
  }
  return null;
}

function normalizeProvider(input: unknown): PreparedVideoAssetProvider | "" {
  if (input === "manual_signed_url") {
    return "signed_url";
  }
  if (input === "mock_signed_url" || input === "mock_server_accessible_asset") {
    return "local_dev";
  }
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

function buildAssetRef(source: PreparedVideoAssetSource): PreparedVideoAssetRef | null {
  if (!source.asset_id || !source.provider || source.mime_type !== "video/mp4") {
    return null;
  }
  return {
    asset_id: source.asset_id,
    storage_key: source.storage_key,
    signed_url: source.signed_url,
    prepared_video_asset_url: source.prepared_video_asset_url,
    mime_type: "video/mp4",
    size_bytes: source.size_bytes,
    checksum_sha256: source.checksum_sha256,
    expires_at: source.expires_at,
    provider: source.provider,
    server_accessible: source.server_accessible
  };
}

function detectLocalPathReasons(source: Pick<PreparedVideoAssetSource, "signed_url" | "prepared_video_asset_url" | "video_path_or_url">) {
  const reasons: PreparedVideoAssetBlockedReason[] = [];
  for (const value of [source.signed_url, source.prepared_video_asset_url, source.video_path_or_url]) {
    if (!value || isHttpsUrl(value)) {
      continue;
    }
    if (/^[a-z]:\\/i.test(value) || value.startsWith("\\\\")) {
      reasons.push("windows_local_path");
    } else if (value.startsWith("/var/task/")) {
      reasons.push("var_task_runtime_path");
    } else if (/\.mp4(\?.*)?$/i.test(value)) {
      reasons.push("relative_mp4_path");
    }
  }
  return unique(reasons);
}

function maskUrl(value: string | null) {
  if (!value) {
    return null;
  }
  if (!isHttpsUrl(value)) {
    return "[local-or-non-https-url-blocked]";
  }
  try {
    const url = new URL(value);
    const suffix = url.search || url.hash ? "?[redacted]" : "";
    return `${url.origin}${url.pathname}${suffix}`;
  } catch {
    return "[invalid-url-blocked]";
  }
}

function normalizeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.floor(parsed) : null;
  }
  return null;
}

function isExpired(value: string) {
  const timestamp = Date.parse(value);
  return !Number.isFinite(timestamp) || timestamp <= Date.now();
}

function isHttpsUrl(value: unknown) {
  return /^https:\/\//i.test(safeTrim(value));
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

function unique<T>(items: T[]) {
  return [...new Set(items)];
}
