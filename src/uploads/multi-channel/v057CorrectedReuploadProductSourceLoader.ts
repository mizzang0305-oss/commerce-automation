import fs from "node:fs/promises";
import path from "node:path";

import { CHANNEL_KEYS, type ChannelKey } from "./channelProfiles";
import {
  buildEmptyV057RawCoupangUrls,
  emptyV057ProductSourceEvidence,
  invalidV057ProductSourceMetadataEvidence,
  normalizeV057ProductSourceCandidate,
  validateV057ProductSourceCandidate,
  V057_RUNTIME_PRODUCT_SOURCE_KIND_PRIORITY,
  type V057CorrectedReuploadProductSourceKind,
  type V057ProductSourceSanitizedEvidence,
  type V057ProductSourceValidationBlocker
} from "./v057CorrectedReuploadProductSource";
import { V057_REUPLOAD_ASSET_PROFILE, type V057ReuploadAssetProfile } from "./v057ReuploadAssetBinding";

export type V057ProductSourceLoaderReport = {
  version: "v068";
  product_source_contract_added: true;
  selected_profile: V057ReuploadAssetProfile | null;
  product_source_ready: boolean;
  product_source_blocker: V057ProductSourceValidationBlocker | null;
  source_discovery_priority: readonly V057CorrectedReuploadProductSourceKind[];
  runtime_default_source: "v057_product_source_metadata";
  explicit_affiliate_env_is_emergency_override_only: true;
  explicit_raw_coupang_url_env_is_emergency_override_only: true;
  raw_coupang_url_source: "runtime_bound_v057_product_source" | "missing";
  channels: V057ProductSourceSanitizedEvidence[];
  raw_coupang_urls_printed: false;
  raw_urls_printed: false;
  secrets_printed: false;
  videos_insert_called: false;
  comment_create_update_delete_called: false;
  visibility_changed: false;
  R2_upload: false;
  DB_write: false;
  product_assets_write: false;
  fake_success: false;
};

export type V057ProductSourceLoaderResult = {
  rawCoupangUrls: Record<ChannelKey, string>;
  report: V057ProductSourceLoaderReport;
};

type CandidatePath = {
  kind: V057CorrectedReuploadProductSourceKind;
  relativePath: string[];
};

const CANDIDATE_FILES: CandidatePath[] = [
  { kind: "product_queue_item", relativePath: ["product-queue-item-v057.json"] },
  { kind: "generated_content", relativePath: ["generated-content-v057.json"] },
  { kind: "previous_import_candidate", relativePath: ["previous-import-candidate-v057.json"] },
  { kind: "v057_review_package_metadata", relativePath: ["product-source-v057.json"] },
  { kind: "generated_upload_metadata", relativePath: ["generated-upload-metadata-v057.json"] },
  { kind: "n8n_callback_payload", relativePath: ["n8n-callback-payload-v057.json"] },
  { kind: "asset_profile_binding_metadata", relativePath: ["asset-profile-binding-metadata-v057.json"] },
  { kind: "code_fixture_promoted", relativePath: ["code-fixture-product-source-v057.json"] }
];

export async function resolveV057CorrectedReuploadProductSources(input: {
  cwd?: string;
  uploadAssetProfile?: string | null;
} = {}): Promise<V057ProductSourceLoaderResult> {
  const cwd = input.cwd ?? process.cwd();
  const selectedProfile = input.uploadAssetProfile === V057_REUPLOAD_ASSET_PROFILE
    ? V057_REUPLOAD_ASSET_PROFILE
    : null;
  const rawCoupangUrls = buildEmptyV057RawCoupangUrls();
  const channels: V057ProductSourceSanitizedEvidence[] = [];
  const blockers: V057ProductSourceValidationBlocker[] = [];

  for (const channelKey of CHANNEL_KEYS) {
    if (selectedProfile === null) {
      channels.push(emptyV057ProductSourceEvidence(channelKey));
      continue;
    }

    const resolved = await resolveChannelSource(cwd, channelKey);
    channels.push(resolved.evidence);
    rawCoupangUrls[channelKey] = resolved.rawCoupangUrl;
    if (resolved.blocker) blockers.push(resolved.blocker);
  }

  const blocker: V057ProductSourceValidationBlocker | null = selectedProfile === null
    ? "BLOCKED_V068_AUTHORITATIVE_RAW_COUPANG_URL_SOURCE_MISSING"
    : blockers[0] ?? (
      channels.some((channel) => !channel.raw_coupang_url_present || !rawCoupangUrls[channel.channel_key])
        ? "BLOCKED_V068_AUTHORITATIVE_RAW_COUPANG_URL_SOURCE_MISSING"
        : null
    );

  return {
    rawCoupangUrls,
    report: {
      version: "v068",
      product_source_contract_added: true,
      selected_profile: selectedProfile,
      product_source_ready: blocker === null,
      product_source_blocker: blocker,
      source_discovery_priority: V057_RUNTIME_PRODUCT_SOURCE_KIND_PRIORITY,
      runtime_default_source: "v057_product_source_metadata",
      explicit_affiliate_env_is_emergency_override_only: true,
      explicit_raw_coupang_url_env_is_emergency_override_only: true,
      raw_coupang_url_source: blocker === null ? "runtime_bound_v057_product_source" : "missing",
      channels,
      raw_coupang_urls_printed: false,
      raw_urls_printed: false,
      secrets_printed: false,
      videos_insert_called: false,
      comment_create_update_delete_called: false,
      visibility_changed: false,
      R2_upload: false,
      DB_write: false,
      product_assets_write: false,
      fake_success: false
    }
  };
}

async function resolveChannelSource(cwd: string, channelKey: ChannelKey) {
  for (const candidatePath of CANDIDATE_FILES) {
    const filePath = path.join(cwd, "commerce-assets", "review", "v057", channelKey, ...candidatePath.relativePath);
    const payload = await readJsonIfExists(filePath);
    if (payload === null) continue;
    if (payload === INVALID_JSON) {
      return {
        rawCoupangUrl: "",
        evidence: invalidV057ProductSourceMetadataEvidence(channelKey),
        blocker: "BLOCKED_V068_PRODUCT_SOURCE_METADATA_INVALID" as const
      };
    }

    const candidate = normalizeV057ProductSourceCandidate(payload, candidatePath.kind);
    const validation = validateV057ProductSourceCandidate({ channelKey, candidate });
    if (validation.ok) {
      return {
        rawCoupangUrl: validation.rawCoupangUrl,
        evidence: validation.evidence,
        blocker: null
      };
    }

    return {
      rawCoupangUrl: "",
      evidence: validation.evidence,
      blocker: validation.blocker
    };
  }

  return {
    rawCoupangUrl: "",
    evidence: emptyV057ProductSourceEvidence(channelKey),
    blocker: "BLOCKED_V068_AUTHORITATIVE_RAW_COUPANG_URL_SOURCE_MISSING" as const
  };
}

const INVALID_JSON = Symbol("invalid-v057-product-source-json");

async function readJsonIfExists(filePath: string) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    if (error instanceof SyntaxError) return INVALID_JSON;
    throw error;
  }
}
