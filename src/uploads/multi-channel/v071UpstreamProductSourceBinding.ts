import fs from "node:fs/promises";
import path from "node:path";

import { CHANNEL_KEYS, type ChannelKey } from "./channelProfiles";
import {
  hashV057ProductSourceEvidence,
  normalizeV057ProductSourceCandidate,
  validateV057ProductSourceCandidate,
  type V057CorrectedReuploadProductSource,
  type V057ProductSourceSanitizedEvidence
} from "./v057CorrectedReuploadProductSource";
import {
  resolveV057CorrectedReuploadProductSources
} from "./v057CorrectedReuploadProductSourceLoader";
import { V057_REUPLOAD_ASSET_PROFILE, type V057ReuploadAssetProfile } from "./v057ReuploadAssetBinding";
import { resolveV057ReuploadAssetBindings } from "./v057ReuploadAssetBinding";

export type ReviewPackageProductSourceManifest = V057CorrectedReuploadProductSource & {
  packageId: string;
  productName: string;
  createdAt: string;
  productSourceKind: "v057_review_package_metadata";
  runtimeSourceApproved: true;
  rawUrlsRedactedInReport: true;
};

export type V071OrphanPackageRecoveryChannelEvidence = Pick<
  V057ProductSourceSanitizedEvidence,
  | "channel_key"
  | "source_present"
  | "source_kind"
  | "asset_profile"
  | "product_label_present"
  | "product_label_matches_channel"
  | "raw_coupang_url_present"
  | "host_label"
  | "hash_prefix"
  | "source_evidence_hash_prefix"
  | "raw_urls_printed"
> & {
  video_asset_present: boolean;
  first_frame_present: boolean;
  product_source_present: boolean;
};

export type V071OrphanPackageRecoveryReport = {
  version: "v071";
  FINAL_STATUS:
    | "SUCCESS_V071_PRODUCT_SOURCE_MANIFEST_BOUND_NO_UPLOAD"
    | "BLOCKED_V071_V057_ORPHAN_PACKAGE_SOURCE_UNRECOVERABLE"
    | "BLOCKED_REUPLOAD_ASSET_PROFILE_NOT_SELECTED";
  SAFE_TO_UPLOAD: false;
  selected_profile: V057ReuploadAssetProfile | null;
  review_package_manifest_contract_added: true;
  product_source_recovered: boolean;
  orphan_package_detected: boolean;
  manual_affiliate_url_input_required: false;
  manual_raw_coupang_url_input_required: false;
  channels: V071OrphanPackageRecoveryChannelEvidence[];
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

export function buildReviewPackageProductSourceManifest(input: {
  packageId: string;
  sourceQueueItemId?: string;
  sourceGeneratedContentId?: string;
  channelKey: ChannelKey;
  assetProfile: V057ReuploadAssetProfile;
  rawCoupangUrl: string;
  productName: string;
  selectedAffiliateUrl?: string;
  sourceEvidenceHash?: string;
  createdAt: string;
  runtimeSourceApproved?: true;
  rawUrlsRedactedInReport?: true;
}): ReviewPackageProductSourceManifest {
  assertNonEmpty("packageId", input.packageId);
  assertNonEmpty("rawCoupangUrl", input.rawCoupangUrl);
  assertNonEmpty("productName", input.productName);
  assertNonEmpty("createdAt", input.createdAt);
  if (input.assetProfile !== V057_REUPLOAD_ASSET_PROFILE) {
    throw new Error("assetProfile must be v057_corrected_reupload");
  }
  if (input.runtimeSourceApproved !== undefined && input.runtimeSourceApproved !== true) {
    throw new Error("runtimeSourceApproved must be boolean true when provided");
  }
  if (input.rawUrlsRedactedInReport !== undefined && input.rawUrlsRedactedInReport !== true) {
    throw new Error("rawUrlsRedactedInReport must be boolean true when provided");
  }

  const manifest: ReviewPackageProductSourceManifest = {
    packageId: input.packageId.trim(),
    sourceQueueItemId: trimOptional(input.sourceQueueItemId),
    sourceGeneratedContentId: trimOptional(input.sourceGeneratedContentId),
    channelKey: input.channelKey,
    assetProfile: input.assetProfile,
    productSourceKind: "v057_review_package_metadata",
    rawCoupangUrl: input.rawCoupangUrl.trim(),
    productName: input.productName.trim(),
    selectedAffiliateUrl: trimOptional(input.selectedAffiliateUrl),
    sourceEvidenceHash: input.sourceEvidenceHash?.trim() ||
      hashV057ProductSourceEvidence(`${input.channelKey}:${input.rawCoupangUrl.trim()}`),
    createdAt: input.createdAt.trim(),
    boundAt: input.createdAt.trim(),
    runtimeSourceApproved: true,
    rawUrlsRedactedInReport: true
  };
  const validation = validateV057ProductSourceCandidate({
    channelKey: input.channelKey,
    candidate: normalizeV057ProductSourceCandidate(manifest, "v057_review_package_metadata")
  });
  if (!validation.ok) {
    throw new Error(`review package product source manifest invalid: ${validation.blocker}`);
  }
  return manifest;
}

export async function writeReviewPackageProductSourceManifest(input: {
  cwd?: string;
  manifest: ReviewPackageProductSourceManifest;
}) {
  const cwd = input.cwd ?? process.cwd();
  const channelRoot = path.join(
    cwd,
    "commerce-assets",
    "review",
    "v057",
    input.manifest.channelKey
  );
  await fs.mkdir(channelRoot, { recursive: true });
  await fs.writeFile(
    path.join(channelRoot, "product-source-v057.json"),
    `${JSON.stringify(input.manifest, null, 2)}\n`,
    "utf8"
  );
}

export async function scanV071V057OrphanPackageRecovery(input: {
  cwd?: string;
  uploadAssetProfile?: string | null;
} = {}): Promise<V071OrphanPackageRecoveryReport> {
  const cwd = input.cwd ?? process.cwd();
  const selectedProfile = input.uploadAssetProfile === V057_REUPLOAD_ASSET_PROFILE
    ? V057_REUPLOAD_ASSET_PROFILE
    : null;
  if (selectedProfile === null) {
    return buildReport({
      selectedProfile,
      channels: CHANNEL_KEYS.map((channelKey) => buildEmptyChannelEvidence(channelKey)),
      productSourceRecovered: false,
      orphanPackageDetected: false
    });
  }

  const assetBinding = await resolveV057ReuploadAssetBindings({
    cwd,
    uploadAssetProfile: input.uploadAssetProfile
  });
  const productSources = await resolveV057CorrectedReuploadProductSources({
    cwd,
    uploadAssetProfile: input.uploadAssetProfile
  });
  const channels = CHANNEL_KEYS.map((channelKey) => {
    const productEvidence = productSources.report.channels.find((channel) => channel.channel_key === channelKey);
    const asset = assetBinding.bindings[channelKey];
    return {
      ...(productEvidence ?? buildEmptyProductEvidence(channelKey)),
      video_asset_present: asset.v057_mp4_exists,
      first_frame_present: asset.first_frame_v057_exists,
      product_source_present: Boolean(productEvidence?.source_present && productEvidence.raw_coupang_url_present)
    };
  });
  const assetsReady = assetBinding.asset_binding_blocker === null;
  const productSourceRecovered = productSources.report.product_source_ready;
  const orphanPackageDetected = assetsReady && !productSourceRecovered;

  return buildReport({
    selectedProfile,
    channels,
    productSourceRecovered,
    orphanPackageDetected
  });
}

function buildReport(input: {
  selectedProfile: V057ReuploadAssetProfile | null;
  channels: V071OrphanPackageRecoveryChannelEvidence[];
  productSourceRecovered: boolean;
  orphanPackageDetected: boolean;
}): V071OrphanPackageRecoveryReport {
  return {
    version: "v071",
    FINAL_STATUS: input.selectedProfile === null
      ? "BLOCKED_REUPLOAD_ASSET_PROFILE_NOT_SELECTED"
      : input.productSourceRecovered
        ? "SUCCESS_V071_PRODUCT_SOURCE_MANIFEST_BOUND_NO_UPLOAD"
        : "BLOCKED_V071_V057_ORPHAN_PACKAGE_SOURCE_UNRECOVERABLE",
    SAFE_TO_UPLOAD: false,
    selected_profile: input.selectedProfile,
    review_package_manifest_contract_added: true,
    product_source_recovered: input.productSourceRecovered,
    orphan_package_detected: input.orphanPackageDetected,
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

function buildEmptyChannelEvidence(channelKey: ChannelKey): V071OrphanPackageRecoveryChannelEvidence {
  return {
    ...buildEmptyProductEvidence(channelKey),
    video_asset_present: false,
    first_frame_present: false,
    product_source_present: false
  };
}

function buildEmptyProductEvidence(channelKey: ChannelKey): V057ProductSourceSanitizedEvidence {
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

function assertNonEmpty(name: string, value: string) {
  if (!value.trim()) {
    throw new Error(`${name} is required`);
  }
}

function trimOptional(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}
