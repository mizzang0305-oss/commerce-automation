import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { CHANNEL_KEYS, type ChannelKey } from "./channelProfiles";
import {
  hashV057ProductSourceEvidence,
  normalizeV057ProductSourceCandidate,
  validateV057ProductSourceCandidate,
  V057_CORRECTED_REUPLOAD_EXPECTED_PRODUCTS,
  V057_RUNTIME_PRODUCT_SOURCE_KIND_PRIORITY,
  type V057CorrectedReuploadProductSource,
  type V057CorrectedReuploadProductSourceKind,
  type V057ProductSourceSanitizedEvidence
} from "./v057CorrectedReuploadProductSource";
import { V057_REUPLOAD_ASSET_PROFILE, type V057ReuploadAssetProfile } from "./v057ReuploadAssetBinding";

export type V070ProductSourceMaterializerBlocker =
  | "BLOCKED_REUPLOAD_ASSET_PROFILE_NOT_SELECTED"
  | "BLOCKED_V070_AUTHORITATIVE_PRODUCT_SOURCE_NOT_FOUND";

export type V070MaterializedChannelEvidence = Pick<
  V057ProductSourceSanitizedEvidence,
  | "channel_key"
  | "source_present"
  | "source_kind"
  | "asset_profile"
  | "product_label_present"
  | "product_label_matches_channel"
  | "raw_coupang_url_present"
  | "https_url"
  | "host_allowed"
  | "host_label"
  | "hash_prefix"
  | "length_bucket"
  | "source_evidence_hash_prefix"
  | "raw_urls_printed"
> & {
  materialized: boolean;
  metadata_file_basename: "product-source-v057.json" | null;
  source_path_basename: string | null;
  runtime_source_approved: boolean;
};

export type V070ProductSourceMaterializerReport = {
  version: "v070";
  FINAL_STATUS:
    | "SUCCESS_V070_V057_PRODUCT_SOURCE_MATERIALIZED_NO_UPLOAD"
    | "BLOCKED_V070_AUTHORITATIVE_PRODUCT_SOURCE_NOT_FOUND"
    | "BLOCKED_REUPLOAD_ASSET_PROFILE_NOT_SELECTED";
  SAFE_TO_UPLOAD: false;
  selected_profile: V057ReuploadAssetProfile | null;
  product_source_materialized: boolean;
  product_source_ready: boolean;
  blocker: V070ProductSourceMaterializerBlocker | null;
  source_discovery_priority: readonly V057CorrectedReuploadProductSourceKind[];
  metadata_root_basename: "v057";
  manual_affiliate_url_input_required: false;
  manual_raw_coupang_url_input_required: false;
  channels: V070MaterializedChannelEvidence[];
  youtube_execute_called: false;
  videos_insert_called: false;
  comment_create_update_delete_called: false;
  visibility_changed: false;
  R2_upload: false;
  DB_write: false;
  product_assets_write: false;
  raw_urls_printed: false;
  raw_channel_ids_printed: false;
  secrets_printed: false;
  fake_success: false;
};

type CandidateSource = {
  kind: V057CorrectedReuploadProductSourceKind;
  basename: string;
  payloads: unknown[];
};

type ChannelCandidate = {
  source: CandidateSource;
  metadata: V057CorrectedReuploadProductSource;
  evidence: V057ProductSourceSanitizedEvidence;
  valid: boolean;
};

export async function materializeV057ProductSourceMetadata(input: {
  cwd?: string;
  uploadAssetProfile?: string | null;
  now?: string;
} = {}): Promise<V070ProductSourceMaterializerReport> {
  const cwd = input.cwd ?? process.cwd();
  const selectedProfile = input.uploadAssetProfile === V057_REUPLOAD_ASSET_PROFILE
    ? V057_REUPLOAD_ASSET_PROFILE
    : null;
  const now = input.now ?? new Date().toISOString();

  if (selectedProfile === null) {
    return buildReport({
      selectedProfile,
      blocker: "BLOCKED_REUPLOAD_ASSET_PROFILE_NOT_SELECTED",
      channels: CHANNEL_KEYS.map((channelKey) => buildMissingEvidence(channelKey))
    });
  }

  const channels = await Promise.all(CHANNEL_KEYS.map(async (channelKey) => {
    const candidate = await resolveChannelCandidate({ cwd, channelKey, now });
    if (!candidate?.valid) {
      return candidate ? buildChannelEvidence(candidate, false) : buildMissingEvidence(channelKey);
    }
    return buildChannelEvidence(candidate, true);
  }));

  const allReady = channels.every((channel) => channel.materialized);
  if (allReady) {
    await Promise.all(CHANNEL_KEYS.map(async (channelKey) => {
      const candidate = await resolveChannelCandidate({ cwd, channelKey, now });
      if (!candidate?.valid) return;
      await writeProductSourceMetadata(cwd, channelKey, candidate.metadata);
    }));
  }

  return buildReport({
    selectedProfile,
    blocker: allReady ? null : "BLOCKED_V070_AUTHORITATIVE_PRODUCT_SOURCE_NOT_FOUND",
    channels
  });
}

export async function writeV070ProductSourceMaterializerArtifacts(input: {
  cwd?: string;
  report: V070ProductSourceMaterializerReport;
}) {
  const cwd = input.cwd ?? process.cwd();
  const outputRoot = path.join(cwd, "commerce-assets", "review", "v070");
  await fs.mkdir(outputRoot, { recursive: true });
  await fs.writeFile(
    path.join(outputRoot, "v057-product-source-materializer-report.json"),
    `${JSON.stringify(input.report, null, 2)}\n`,
    "utf8"
  );
  await fs.writeFile(
    path.join(outputRoot, "v057-product-source-materializer-report.html"),
    buildHtmlReport(input.report),
    "utf8"
  );
}

export function buildV070ProductSourceMaterializerCliInput(input: {
  cwd: string;
  env: NodeJS.ProcessEnv;
}) {
  return {
    cwd: input.cwd,
    uploadAssetProfile: input.env.V051_UPLOAD_ASSET_PROFILE ?? null
  };
}

async function resolveChannelCandidate(input: {
  cwd: string;
  channelKey: ChannelKey;
  now: string;
}): Promise<ChannelCandidate | null> {
  const sources = await readCandidateSources(input.cwd, input.channelKey);
  for (const source of sources) {
    let firstInvalid: ChannelCandidate | null = null;
    for (const payload of source.payloads) {
      const candidate = buildCandidate({
        channelKey: input.channelKey,
        kind: source.kind,
        payload,
        now: input.now
      });
      const validation = validateV057ProductSourceCandidate({
        channelKey: input.channelKey,
        candidate
      });
      if (validation.ok) {
        return {
          source,
          metadata: candidate,
          evidence: validation.evidence,
          valid: true
        };
      }
      if (validation.evidence.source_present && firstInvalid === null) {
        firstInvalid = {
          source,
          metadata: candidate,
          evidence: validation.evidence,
          valid: false
        };
      }
    }
    if (firstInvalid) return firstInvalid;
  }
  return null;
}

async function readCandidateSources(cwd: string, channelKey: ChannelKey): Promise<CandidateSource[]> {
  const dataSources: Array<{
    kind: V057CorrectedReuploadProductSourceKind;
    filePath: string;
  }> = [
    { kind: "product_queue_item", filePath: path.join(cwd, "data", "queue.json") },
    { kind: "generated_content", filePath: path.join(cwd, "data", "generated_contents.json") },
    { kind: "previous_import_candidate", filePath: path.join(cwd, "data", "product_candidates.json") }
  ];
  const channelRoot = path.join(cwd, "commerce-assets", "review", "v057", channelKey);
  const channelSources: Array<{
    kind: V057CorrectedReuploadProductSourceKind;
    filePath: string;
  }> = [
    { kind: "v057_review_package_metadata", filePath: path.join(channelRoot, "product-source-v057.json") },
    { kind: "generated_upload_metadata", filePath: path.join(channelRoot, "generated-upload-metadata-v057.json") },
    { kind: "n8n_callback_payload", filePath: path.join(channelRoot, "n8n-callback-payload-v057.json") },
    { kind: "asset_profile_binding_metadata", filePath: path.join(channelRoot, "asset-profile-binding-metadata-v057.json") },
    { kind: "code_fixture_promoted", filePath: path.join(channelRoot, "code-fixture-product-source-v057.json") }
  ];
  const orderedSources = [...dataSources, ...channelSources];
  const sources = await Promise.all(orderedSources.map(async (source) => ({
    kind: source.kind,
    basename: path.basename(source.filePath),
    payloads: filterPayloadsForChannel(
      flattenCandidatePayloads(await readJsonIfExists(source.filePath)),
      channelKey
    )
  })));
  return sources.filter((source) => source.payloads.length > 0);
}

function buildCandidate(input: {
  channelKey: ChannelKey;
  kind: V057CorrectedReuploadProductSourceKind;
  payload: unknown;
  now: string;
}): V057CorrectedReuploadProductSource {
  const normalized = normalizeV057ProductSourceCandidate(input.payload, input.kind);
  const rawCoupangUrl = normalized.rawCoupangUrl || pickString(input.payload, [
    "raw_coupang_url",
    "rawCoupangUrl",
    "product_url",
    "productUrl",
    "url"
  ]);
  const productLabel = normalized.productName ||
    normalized.sourceProductLabel ||
    pickString(input.payload, [
      "product_name",
      "productName",
      "source_product_label",
      "sourceProductLabel",
      "title",
      "keyword"
    ]);
  const runtimeSourceApproved = input.kind === "code_fixture_promoted"
    ? readRuntimeSourceApproved(input.payload)
    : true;

  return {
    channelKey: normalized.channelKey || input.channelKey,
    assetProfile: normalized.assetProfile || V057_REUPLOAD_ASSET_PROFILE,
    productSourceKind: input.kind,
    rawCoupangUrl,
    productName: productLabel,
    sourceEvidenceHash: normalized.sourceEvidenceHash || hashV057ProductSourceEvidence(`${input.channelKey}:${rawCoupangUrl}`),
    boundAt: normalized.boundAt || normalized.updatedAt || input.now,
    updatedAt: normalized.updatedAt,
    runtimeSourceApproved
  };
}

async function writeProductSourceMetadata(
  cwd: string,
  channelKey: ChannelKey,
  metadata: V057CorrectedReuploadProductSource
) {
  const channelRoot = path.join(cwd, "commerce-assets", "review", "v057", channelKey);
  await fs.mkdir(channelRoot, { recursive: true });
  await fs.writeFile(
    path.join(channelRoot, "product-source-v057.json"),
    `${JSON.stringify(metadata, null, 2)}\n`,
    "utf8"
  );
}

function buildReport(input: {
  selectedProfile: V057ReuploadAssetProfile | null;
  blocker: V070ProductSourceMaterializerBlocker | null;
  channels: V070MaterializedChannelEvidence[];
}): V070ProductSourceMaterializerReport {
  const materialized = input.blocker === null;
  return {
    version: "v070",
    FINAL_STATUS: input.blocker === null
      ? "SUCCESS_V070_V057_PRODUCT_SOURCE_MATERIALIZED_NO_UPLOAD"
      : input.blocker,
    SAFE_TO_UPLOAD: false,
    selected_profile: input.selectedProfile,
    product_source_materialized: materialized,
    product_source_ready: materialized,
    blocker: input.blocker,
    source_discovery_priority: V057_RUNTIME_PRODUCT_SOURCE_KIND_PRIORITY,
    metadata_root_basename: "v057",
    manual_affiliate_url_input_required: false,
    manual_raw_coupang_url_input_required: false,
    channels: input.channels,
    youtube_execute_called: false,
    videos_insert_called: false,
    comment_create_update_delete_called: false,
    visibility_changed: false,
    R2_upload: false,
    DB_write: false,
    product_assets_write: false,
    raw_urls_printed: false,
    raw_channel_ids_printed: false,
    secrets_printed: false,
    fake_success: false
  };
}

function buildChannelEvidence(
  candidate: ChannelCandidate,
  materialized: boolean
): V070MaterializedChannelEvidence {
  return {
    ...candidate.evidence,
    materialized,
    metadata_file_basename: materialized ? "product-source-v057.json" : null,
    source_path_basename: candidate.source.basename,
    runtime_source_approved: candidate.metadata.runtimeSourceApproved === true
  };
}

function buildMissingEvidence(channelKey: ChannelKey): V070MaterializedChannelEvidence {
  return {
    channel_key: channelKey,
    source_present: false,
    source_kind: "missing",
    asset_profile: null,
    product_label_present: false,
    product_label_matches_channel: false,
    raw_coupang_url_present: false,
    https_url: false,
    host_allowed: false,
    host_label: "<URL_MISSING>",
    hash_prefix: null,
    length_bucket: "missing",
    source_evidence_hash_prefix: null,
    materialized: false,
    metadata_file_basename: null,
    source_path_basename: null,
    runtime_source_approved: false,
    raw_urls_printed: false
  };
}

function filterPayloadsForChannel(payloads: unknown[], channelKey: ChannelKey) {
  return payloads.filter((payload) => {
    const normalized = normalizeV057ProductSourceCandidate(payload);
    const channelMatches = !normalized.channelKey || normalized.channelKey === channelKey;
    const label = normalized.productName ||
      normalized.sourceProductLabel ||
      pickString(payload, ["product_name", "productName", "source_product_label", "sourceProductLabel", "title", "keyword"]);
    return channelMatches && productLabelMatches(channelKey, label);
  });
}

function flattenCandidatePayloads(value: unknown): unknown[] {
  if (value === null) return [];
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const nested = ["items", "rows", "candidates", "queue_items", "generated_contents"]
    .flatMap((key) => Array.isArray(record[key]) ? record[key] as unknown[] : []);
  return [value, ...nested];
}

async function readJsonIfExists(filePath: string) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function pickString(payload: unknown, keys: string[]) {
  const record = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  const nested = record.productSource && typeof record.productSource === "object" && !Array.isArray(record.productSource)
    ? record.productSource as Record<string, unknown>
    : {};
  for (const key of keys) {
    const value = safeTrim(record[key]) || safeTrim(nested[key]);
    if (value) return value;
  }
  return "";
}

function readRuntimeSourceApproved(payload: unknown) {
  const record = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  const nested = record.productSource && typeof record.productSource === "object" && !Array.isArray(record.productSource)
    ? record.productSource as Record<string, unknown>
    : {};
  return record.runtimeSourceApproved === true ||
    record.runtime_source_approved === true ||
    nested.runtimeSourceApproved === true ||
    nested.runtime_source_approved === true;
}

function productLabelMatches(channelKey: ChannelKey, value: string) {
  const expected = normalizeText(V057_CORRECTED_REUPLOAD_EXPECTED_PRODUCTS[channelKey]);
  const actual = normalizeText(value);
  return Boolean(expected && actual.includes(expected));
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, "").trim();
}

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildHtmlReport(report: V070ProductSourceMaterializerReport) {
  return `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8" /><title>v070 v057 product source materializer</title></head>
<body>
  <h1>v070 v057 product source materializer</h1>
  <p>FINAL_STATUS=${escapeHtml(report.FINAL_STATUS)}</p>
  <p>blocker=${escapeHtml(report.blocker)}</p>
  <p>product_source_materialized=${report.product_source_materialized}</p>
  <p>SAFE_TO_UPLOAD=false</p>
  <p>videos_insert_called=false</p>
  <p>comment_create_update_delete_called=false</p>
  <p>raw_urls_printed=false</p>
  <p>secrets_printed=false</p>
</body>
</html>
`;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function hashV070Evidence(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 10);
}
