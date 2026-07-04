import crypto from "node:crypto";
import path from "node:path";

import { CHANNEL_KEYS, type ChannelKey } from "./channelProfiles";
import type { V066AffiliateBridgeChannelEvidence } from "./v066CoupangDeeplinkAffiliateBridge";
import type { V057ProductSourceSanitizedEvidence } from "./v057CorrectedReuploadProductSource";
import type { V057ReuploadAssetBindingReport } from "./v057ReuploadAssetBinding";

export type V057CorrectedReuploadDisclosurePreview = {
  containsSyntheticMedia: boolean;
  paidProductPlacement: boolean;
  descriptionDisclosurePresent: boolean;
  commentDisclosurePresent: boolean;
};

export type V057CorrectedReuploadTargetChannelEvidence = {
  expectedChannelIdPresent: boolean;
  expectedChannelIdFormatValid: boolean;
  expectedChannelIdDuplicate: boolean;
  channelIdHashPrefix: string | null;
};

export type V057CorrectedReuploadPackage = {
  version: "v069";
  channelKey: ChannelKey;
  package_ready: boolean;
  asset: {
    selected_profile: "v057_corrected_reupload" | null;
    video_path_basename: "corrected-preview-v057.mp4";
    first_frame_path_basename: "first-frame-v057.jpg";
    v057_mp4_exists: boolean;
    first_frame_present: boolean;
    no_v048_fallback: boolean;
  };
  productSource: Pick<
    V057ProductSourceSanitizedEvidence,
    | "source_present"
    | "source_kind"
    | "parse_valid"
    | "product_label_matches_channel"
    | "raw_coupang_url_present"
    | "host_label"
    | "hash_prefix"
    | "source_evidence_hash_prefix"
    | "raw_urls_printed"
  > & {
    present: boolean;
  };
  affiliateResolution: Pick<
    V066AffiliateBridgeChannelEvidence,
    | "affiliate_source"
    | "affiliate_present"
    | "affiliate_host"
    | "affiliate_hash_prefix"
    | "affiliate_length_bucket"
    | "raw_coupang_url_source"
    | "raw_coupang_url_present"
    | "raw_coupang_host"
    | "raw_coupang_hash_prefix"
    | "raw_coupang_length_bucket"
  > & {
    resolved: boolean;
  };
  youtubeTarget: V057CorrectedReuploadTargetChannelEvidence;
  disclosure: V057CorrectedReuploadDisclosurePreview;
  duplicateGuard: {
    checked_video_path_basename: "corrected-preview-v057.mp4";
    duplicate_upload_risk: boolean;
  };
  sideEffects: {
    videos_insert_called: false;
    comment_create_update_delete_called: false;
    visibility_changed: false;
    R2_upload: false;
    DB_write: false;
    product_assets_write: false;
    raw_urls_printed: false;
    secrets_printed: false;
    fake_success: false;
  };
};

export function buildV057CorrectedReuploadPackage(input: {
  channelKey: ChannelKey;
  assetReport: V057ReuploadAssetBindingReport;
  productEvidence: V057ProductSourceSanitizedEvidence | undefined;
  affiliateEvidence: V066AffiliateBridgeChannelEvidence | undefined;
  targetEvidence: V057CorrectedReuploadTargetChannelEvidence;
  disclosure: V057CorrectedReuploadDisclosurePreview;
  duplicateUploadRisk: boolean;
}): V057CorrectedReuploadPackage {
  const asset = input.assetReport.bindings[input.channelKey];
  const productEvidence = input.productEvidence;
  const affiliateEvidence = input.affiliateEvidence;
  const packageReady = Boolean(
    input.assetReport.asset_binding_blocker === null &&
    productEvidence?.source_present &&
    productEvidence.parse_valid &&
    productEvidence.raw_coupang_url_present &&
    productEvidence.product_label_matches_channel &&
    affiliateEvidence?.affiliate_present &&
    affiliateEvidence.affiliate_host === "link.coupang.com" &&
    input.targetEvidence.expectedChannelIdPresent &&
    input.targetEvidence.expectedChannelIdFormatValid &&
    !input.targetEvidence.expectedChannelIdDuplicate &&
    input.disclosure.containsSyntheticMedia &&
    input.disclosure.paidProductPlacement &&
    input.disclosure.descriptionDisclosurePresent &&
    input.disclosure.commentDisclosurePresent &&
    !input.duplicateUploadRisk
  );

  return {
    version: "v069",
    channelKey: input.channelKey,
    package_ready: packageReady,
    asset: {
      selected_profile: input.assetReport.selected_profile,
      video_path_basename: "corrected-preview-v057.mp4",
      first_frame_path_basename: "first-frame-v057.jpg",
      v057_mp4_exists: asset.v057_mp4_exists,
      first_frame_present: asset.first_frame_v057_exists,
      no_v048_fallback: input.assetReport.no_v048_fallback
    },
    productSource: {
      present: Boolean(productEvidence?.source_present),
      source_present: Boolean(productEvidence?.source_present),
      source_kind: productEvidence?.source_kind ?? "missing",
      parse_valid: productEvidence?.parse_valid ?? false,
      product_label_matches_channel: productEvidence?.product_label_matches_channel ?? false,
      raw_coupang_url_present: productEvidence?.raw_coupang_url_present ?? false,
      host_label: productEvidence?.host_label ?? "<URL_MISSING>",
      hash_prefix: productEvidence?.hash_prefix ?? null,
      source_evidence_hash_prefix: productEvidence?.source_evidence_hash_prefix ?? null,
      raw_urls_printed: false
    },
    affiliateResolution: {
      resolved: Boolean(affiliateEvidence?.affiliate_present && affiliateEvidence.affiliate_host === "link.coupang.com"),
      affiliate_source: affiliateEvidence?.affiliate_source ?? "missing",
      affiliate_present: affiliateEvidence?.affiliate_present ?? false,
      affiliate_host: affiliateEvidence?.affiliate_host ?? "<URL_MISSING>",
      affiliate_hash_prefix: affiliateEvidence?.affiliate_hash_prefix ?? null,
      affiliate_length_bucket: affiliateEvidence?.affiliate_length_bucket ?? "missing",
      raw_coupang_url_source: affiliateEvidence?.raw_coupang_url_source ?? "missing",
      raw_coupang_url_present: affiliateEvidence?.raw_coupang_url_present ?? false,
      raw_coupang_host: affiliateEvidence?.raw_coupang_host ?? "<URL_MISSING>",
      raw_coupang_hash_prefix: affiliateEvidence?.raw_coupang_hash_prefix ?? null,
      raw_coupang_length_bucket: affiliateEvidence?.raw_coupang_length_bucket ?? "missing"
    },
    youtubeTarget: input.targetEvidence,
    disclosure: input.disclosure,
    duplicateGuard: {
      checked_video_path_basename: path.basename(asset.video_path) as "corrected-preview-v057.mp4",
      duplicate_upload_risk: input.duplicateUploadRisk
    },
    sideEffects: {
      videos_insert_called: false,
      comment_create_update_delete_called: false,
      visibility_changed: false,
      R2_upload: false,
      DB_write: false,
      product_assets_write: false,
      raw_urls_printed: false,
      secrets_printed: false,
      fake_success: false
    }
  };
}

export function buildSanitizedTargetChannelEvidence(input: {
  channelKey: ChannelKey;
  targetChannelIds: Partial<Record<ChannelKey, string>>;
}): V057CorrectedReuploadTargetChannelEvidence {
  const value = input.targetChannelIds[input.channelKey]?.trim() ?? "";
  const allValues = CHANNEL_KEYS
    .map((channelKey) => input.targetChannelIds[channelKey]?.trim() ?? "")
    .filter(Boolean);
  return {
    expectedChannelIdPresent: Boolean(value),
    expectedChannelIdFormatValid: /^UC[A-Za-z0-9_-]{3,}$/.test(value),
    expectedChannelIdDuplicate: Boolean(value) && allValues.filter((item) => item === value).length > 1,
    channelIdHashPrefix: value ? crypto.createHash("sha256").update(value).digest("hex").slice(0, 10) : null
  };
}
