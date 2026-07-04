import crypto from "node:crypto";

import { CHANNEL_KEYS, type ChannelKey } from "./channelProfiles";
import { V057_REUPLOAD_ASSET_PROFILE, type V057ReuploadAssetProfile } from "./v057ReuploadAssetBinding";

export const V057_CORRECTED_REUPLOAD_EXPECTED_PRODUCTS: Record<ChannelKey, string> = {
  father_jobs: "\uCC28\uB7C9\uC6A9 \uCEF5\uD640\uB354 \uC815\uB9AC\uD568",
  neoman_moleulgeol: "\uC811\uC774\uC2DD \uBE68\uB798\uAC74\uC870\uB300",
  lets_buy: "\uD2B9\uAC00 \uCF00\uC774\uBE14 \uC815\uB9AC\uD568"
};

export const V057_RUNTIME_PRODUCT_SOURCE_KIND_PRIORITY = [
  "v057_review_package_metadata",
  "product_queue_item",
  "generated_content",
  "previous_import_candidate",
  "generated_upload_metadata",
  "n8n_callback_payload",
  "asset_profile_binding_metadata",
  "code_fixture_promoted"
] as const;

export type V057CorrectedReuploadProductSourceKind =
  typeof V057_RUNTIME_PRODUCT_SOURCE_KIND_PRIORITY[number];

export type V057CorrectedReuploadProductSource = {
  channelKey: ChannelKey;
  assetProfile: V057ReuploadAssetProfile;
  productSourceKind: V057CorrectedReuploadProductSourceKind;
  rawCoupangUrl: string;
  productName?: string;
  sourceProductLabel?: string;
  packageId?: string;
  sourceQueueItemId?: string;
  sourceGeneratedContentId?: string;
  selectedAffiliateUrl?: string;
  sourceEvidenceHash: string;
  createdAt?: string;
  updatedAt?: string;
  boundAt?: string;
  runtimeSourceApproved?: boolean;
  rawUrlsRedactedInReport?: boolean;
};

export type V057ProductSourceValidationBlocker =
  | "BLOCKED_V068_AUTHORITATIVE_RAW_COUPANG_URL_SOURCE_MISSING"
  | "BLOCKED_V068_RAW_COUPANG_URL_SOURCE_INVALID"
  | "BLOCKED_V068_PRODUCT_SOURCE_METADATA_INVALID"
  | "BLOCKED_V068_RUNTIME_SOURCE_NOT_APPROVED";

export type V057ProductSourceSanitizedEvidence = {
  channel_key: ChannelKey;
  source_present: boolean;
  source_kind: V057CorrectedReuploadProductSourceKind | "missing" | "not_authoritative";
  asset_profile: V057ReuploadAssetProfile | null;
  product_label_present: boolean;
  product_label_matches_channel: boolean;
  parse_valid: boolean;
  raw_coupang_url_present: boolean;
  https_url: boolean;
  host_allowed: boolean;
  host_label: "www.coupang.com" | "link.coupang.com" | "coupang.com_family" | "<HOST_NOT_ALLOWED>" | "<URL_MISSING>" | "<URL_INVALID>";
  hash_prefix: string | null;
  length_bucket: "missing" | "1-99" | "100-199" | "200+";
  source_evidence_hash_prefix: string | null;
  bound_at_present: boolean;
  updated_at_present: boolean;
  raw_urls_printed: false;
};

export function normalizeV057ProductSourceCandidate(
  candidate: unknown,
  inferredSourceKind?: V057CorrectedReuploadProductSourceKind
): Partial<V057CorrectedReuploadProductSource> {
  const row = asRecord(candidate) ?? {};
  const nested = asRecord(row.productSource) ?? asRecord(row.product_source) ?? row;
  return {
    channelKey: (safeTrim(nested.channelKey) || safeTrim(nested.channel_key)) as ChannelKey,
    assetProfile: (safeTrim(nested.assetProfile) || safeTrim(nested.asset_profile)) as V057ReuploadAssetProfile,
    productSourceKind: (safeTrim(nested.productSourceKind) ||
      safeTrim(nested.product_source_kind) ||
      inferredSourceKind) as V057CorrectedReuploadProductSourceKind,
    rawCoupangUrl: safeTrim(nested.rawCoupangUrl) || safeTrim(nested.raw_coupang_url),
    productName: safeTrim(nested.productName) || safeTrim(nested.product_name),
    sourceProductLabel: safeTrim(nested.sourceProductLabel) || safeTrim(nested.source_product_label),
    packageId: safeTrim(nested.packageId) || safeTrim(nested.package_id),
    sourceQueueItemId: safeTrim(nested.sourceQueueItemId) || safeTrim(nested.source_queue_item_id),
    sourceGeneratedContentId: safeTrim(nested.sourceGeneratedContentId) || safeTrim(nested.source_generated_content_id),
    selectedAffiliateUrl: safeTrim(nested.selectedAffiliateUrl) || safeTrim(nested.selected_affiliate_url),
    sourceEvidenceHash: safeTrim(nested.sourceEvidenceHash) || safeTrim(nested.source_evidence_hash),
    createdAt: safeTrim(nested.createdAt) || safeTrim(nested.created_at),
    updatedAt: safeTrim(nested.updatedAt) || safeTrim(nested.updated_at),
    boundAt: safeTrim(nested.boundAt) || safeTrim(nested.bound_at),
    runtimeSourceApproved: nested.runtimeSourceApproved === true || nested.runtime_source_approved === true,
    rawUrlsRedactedInReport: nested.rawUrlsRedactedInReport === true || nested.raw_urls_redacted_in_report === true
  };
}

export function validateV057ProductSourceCandidate(input: {
  channelKey: ChannelKey;
  candidate: Partial<V057CorrectedReuploadProductSource>;
}): {
  ok: boolean;
  rawCoupangUrl: string;
  evidence: V057ProductSourceSanitizedEvidence;
  blocker: V057ProductSourceValidationBlocker | null;
} {
  const sourceKind = normalizeSourceKind(input.candidate.productSourceKind);
  const rawCoupangUrl = safeTrim(input.candidate.rawCoupangUrl);
  const parsed = parseHttpsUrl(rawCoupangUrl);
  const hostAllowed = isAllowedCoupangHost(parsed);
  const productLabel = safeTrim(input.candidate.productName) || safeTrim(input.candidate.sourceProductLabel);
  const productLabelMatchesChannel = matchesExpectedProductLabel(input.channelKey, productLabel);
  const sourceEvidenceHash = safeTrim(input.candidate.sourceEvidenceHash);
  const runtimeSourceApproved = input.candidate.runtimeSourceApproved === true;
  const runtimeApprovalRequired = sourceKind === "code_fixture_promoted" ||
    sourceKind === "v057_review_package_metadata";
  const runtimeApprovalMissing = runtimeApprovalRequired && !runtimeSourceApproved;
  const authoritative = sourceKind !== null &&
    (!runtimeApprovalRequired || runtimeSourceApproved);
  const ok = input.candidate.channelKey === input.channelKey &&
    input.candidate.assetProfile === V057_REUPLOAD_ASSET_PROFILE &&
    authoritative &&
    Boolean(rawCoupangUrl) &&
    Boolean(parsed) &&
    hostAllowed &&
    !isPlaceholderUrl(rawCoupangUrl) &&
    productLabelMatchesChannel &&
    Boolean(sourceEvidenceHash) &&
    Boolean(safeTrim(input.candidate.updatedAt) || safeTrim(input.candidate.boundAt));

  return {
    ok,
    rawCoupangUrl: ok ? rawCoupangUrl : "",
    blocker: ok
      ? null
      : runtimeApprovalMissing
        ? "BLOCKED_V068_RUNTIME_SOURCE_NOT_APPROVED"
        : "BLOCKED_V068_AUTHORITATIVE_RAW_COUPANG_URL_SOURCE_MISSING",
    evidence: {
      channel_key: input.channelKey,
      source_present: Boolean(input.candidate.rawCoupangUrl || input.candidate.channelKey || input.candidate.productSourceKind),
      source_kind: sourceKind ?? "not_authoritative",
      asset_profile: input.candidate.assetProfile === V057_REUPLOAD_ASSET_PROFILE ? V057_REUPLOAD_ASSET_PROFILE : null,
      product_label_present: Boolean(productLabel),
      product_label_matches_channel: productLabelMatchesChannel,
      parse_valid: true,
      raw_coupang_url_present: Boolean(rawCoupangUrl),
      https_url: Boolean(parsed),
      host_allowed: hostAllowed,
      host_label: sanitizedHost(rawCoupangUrl, parsed, hostAllowed),
      hash_prefix: hashPrefix(rawCoupangUrl),
      length_bucket: lengthBucket(rawCoupangUrl),
      source_evidence_hash_prefix: sourceEvidenceHash ? sourceEvidenceHash.slice(0, 10) : null,
      bound_at_present: Boolean(safeTrim(input.candidate.boundAt)),
      updated_at_present: Boolean(safeTrim(input.candidate.updatedAt)),
      raw_urls_printed: false
    }
  };
}

export function emptyV057ProductSourceEvidence(channelKey: ChannelKey): V057ProductSourceSanitizedEvidence {
  return {
    channel_key: channelKey,
    source_present: false,
    source_kind: "missing",
      asset_profile: null,
      product_label_present: false,
      product_label_matches_channel: false,
      parse_valid: true,
      raw_coupang_url_present: false,
    https_url: false,
    host_allowed: false,
    host_label: "<URL_MISSING>",
    hash_prefix: null,
    length_bucket: "missing",
    source_evidence_hash_prefix: null,
    bound_at_present: false,
    updated_at_present: false,
    raw_urls_printed: false
  };
}

export function invalidV057ProductSourceMetadataEvidence(
  channelKey: ChannelKey
): V057ProductSourceSanitizedEvidence {
  return {
    ...emptyV057ProductSourceEvidence(channelKey),
    source_present: true,
    source_kind: "not_authoritative",
    parse_valid: false
  };
}

export function hashV057ProductSourceEvidence(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeSourceKind(value: unknown): V057CorrectedReuploadProductSourceKind | null {
  const normalized = safeTrim(value);
  return V057_RUNTIME_PRODUCT_SOURCE_KIND_PRIORITY.includes(normalized as V057CorrectedReuploadProductSourceKind)
    ? normalized as V057CorrectedReuploadProductSourceKind
    : null;
}

function matchesExpectedProductLabel(channelKey: ChannelKey, value: string) {
  const normalizedValue = normalizeText(value);
  const expected = normalizeText(V057_CORRECTED_REUPLOAD_EXPECTED_PRODUCTS[channelKey]);
  return Boolean(normalizedValue) && normalizedValue.includes(expected);
}

function parseHttpsUrl(value: string) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
}

function isAllowedCoupangHost(parsed: URL | null) {
  if (!parsed) return false;
  return parsed.hostname === "coupang.com" || parsed.hostname.endsWith(".coupang.com");
}

function sanitizedHost(
  value: string,
  parsed: URL | null,
  hostAllowed: boolean
): V057ProductSourceSanitizedEvidence["host_label"] {
  if (!value) return "<URL_MISSING>";
  if (!parsed) return "<URL_INVALID>";
  if (!hostAllowed) return "<HOST_NOT_ALLOWED>";
  if (parsed.hostname === "www.coupang.com" || parsed.hostname === "link.coupang.com") return parsed.hostname;
  return "coupang.com_family";
}

function isPlaceholderUrl(value: string) {
  const lower = value.toLowerCase();
  return [
    "example.com",
    "placeholder",
    "dummy",
    "localhost",
    "127.0.0.1"
  ].some((pattern) => lower.includes(pattern));
}

function lengthBucket(value: string): V057ProductSourceSanitizedEvidence["length_bucket"] {
  if (!value) return "missing";
  if (value.length < 100) return "1-99";
  if (value.length < 200) return "100-199";
  return "200+";
}

function hashPrefix(value: string) {
  return value ? crypto.createHash("sha256").update(value).digest("hex").slice(0, 10) : null;
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, "").trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function buildEmptyV057RawCoupangUrls() {
  return Object.fromEntries(CHANNEL_KEYS.map((channelKey) => [channelKey, ""])) as Record<ChannelKey, string>;
}
