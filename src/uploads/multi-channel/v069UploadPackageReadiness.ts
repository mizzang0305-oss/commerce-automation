import fs from "node:fs/promises";
import path from "node:path";

import { CHANNEL_KEYS, type ChannelKey } from "./channelProfiles";
import { buildV051ApprovalAliasStatus, type V051ApprovalAliasStatus } from "./v051ApprovalAliasWrapper";
import {
  buildV057CorrectedReuploadPackages,
  type V057DisclosureOverride,
  type V057CorrectedReuploadPackageBuildResult
} from "./v057CorrectedReuploadPackageBuilder";
import {
  resolveV066CoupangDeeplinkAffiliateBridge,
  type V066AffiliateBridgeReport
} from "./v066CoupangDeeplinkAffiliateBridge";
import {
  resolveV057CorrectedReuploadProductSources,
  type V057ProductSourceLoaderReport
} from "./v057CorrectedReuploadProductSourceLoader";
import {
  resolveV057ReuploadAssetBindings,
  type V057ReuploadAssetBindingBlocker,
  type V057ReuploadAssetBindingReport
} from "./v057ReuploadAssetBinding";
import { resolveV054RuntimeTargetChannelIds } from "./v054RuntimeYouTubeAdapterFactory";
import {
  buildV050DuplicateUploadGuard,
  type V050DuplicateUploadGuard
} from "./threeChannelYouTubeAdapterInjection";

export type V069UploadPackageBlocker =
  | V057ReuploadAssetBindingBlocker
  | "BLOCKED_V069_UPLOAD_PACKAGE_PRODUCT_SOURCE_MISSING"
  | "BLOCKED_V068_PRODUCT_SOURCE_METADATA_INVALID"
  | "BLOCKED_V068_RUNTIME_SOURCE_NOT_APPROVED"
  | "BLOCKED_V057_RUNTIME_TARGET_CHANNEL_IDS_MISSING"
  | "BLOCKED_V057_RUNTIME_TARGET_CHANNEL_IDS_INVALID"
  | "BLOCKED_V057_RUNTIME_TARGET_CHANNEL_IDS_DUPLICATE"
  | "BLOCKED_V066_COUPANG_API_CREDENTIALS_MISSING"
  | "BLOCKED_V066_COUPANG_DEEPLINK_FAILED"
  | "BLOCKED_V057_AFFILIATE_URLS_MISSING"
  | "BLOCKED_V057_AFFILIATE_URLS_INVALID"
  | "BLOCKED_V069_DISCLOSURE_PREVIEW_MISSING"
  | "DUPLICATE_UPLOAD_RISK"
  | "V057_CORRECTED_REUPLOAD_APPROVAL_MISSING"
  | "BLOCKED_V057_REUPLOAD_ASSET_PROFILE_MISSING"
  | "BLOCKED_V057_APPROVAL_PROFILE_MISMATCH"
  | "V051_PAID_PROMOTION_CONFIRMATION_MISSING"
  | "V049_APPROVAL_PHRASE_NOT_ALLOWED_IN_V051"
  | "V051_UPLOAD_APPROVAL_MISSING";

export type V069UploadPackageReadinessReport = {
  version: "v069";
  FINAL_STATUS:
    | "SUCCESS_V069_V057_UPLOAD_PACKAGE_READY_NO_UPLOAD"
    | "BLOCKED_V069_UPLOAD_PACKAGE_NOT_READY";
  SAFE_TO_UPLOAD: false;
  package_builder_ready: boolean;
  upload_package_ready: boolean;
  blocker: V069UploadPackageBlocker | null;
  selected_profile: "v057_corrected_reupload" | null;
  manual_affiliate_url_input_required: false;
  asset_binding: V057ReuploadAssetBindingReport;
  product_source: {
    raw_coupang_url_source_bound: boolean;
    report: V057ProductSourceLoaderReport;
  };
  affiliate_bridge: V066AffiliateBridgeReport | null;
  target_channel_ids: {
    all_present: boolean;
    all_format_valid: boolean;
    no_duplicates: boolean;
    channels: V057CorrectedReuploadPackageBuildResult["targetChannelEvidence"];
  };
  disclosure: {
    disclosure_preview_pass: boolean;
    channels: V057CorrectedReuploadPackageBuildResult["disclosurePreviews"];
  };
  duplicate_guard: Pick<
    V050DuplicateUploadGuard,
    | "duplicate_upload_guard_injected"
    | "duplicate_upload_risk"
    | "same_asset_previously_uploaded"
    | "blocker"
    | "checked_channel_count"
    | "raw_urls_printed"
  > & {
    checked_video_path_basenames: Array<"corrected-preview-v057.mp4">;
  };
  approval: V051ApprovalAliasStatus & {
    fresh_approval_required: true;
  };
  packages: V057CorrectedReuploadPackageBuildResult["packages"];
  youtube_execute_called: false;
  videos_insert_called: false;
  videos_insert_total_count: 0;
  comment_create_update_delete_called: false;
  visibility_changed: false;
  R2_upload: false;
  DB_write: false;
  product_assets_write: false;
  raw_urls_printed: false;
  secrets_printed: false;
  fake_success: false;
};

export async function buildV069UploadPackageReadiness(input: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  uploadAssetProfile?: string | null;
  approvalText?: string;
  disclosureOverrides?: V057DisclosureOverride;
  duplicateUploadRiskOverride?: boolean;
} = {}): Promise<V069UploadPackageReadinessReport> {
  const cwd = input.cwd ?? process.cwd();
  const env = input.env ?? process.env;
  const assetReport = await resolveV057ReuploadAssetBindings({
    cwd,
    uploadAssetProfile: input.uploadAssetProfile
  });
  const productSource = await resolveV057CorrectedReuploadProductSources({
    cwd,
    uploadAssetProfile: input.uploadAssetProfile
  });
  const targetChannelIds = resolveV054RuntimeTargetChannelIds(env);
  const targetSummary = summarizeTargetChannels(targetChannelIds);
  const duplicateGuard = buildV050DuplicateUploadGuard(CHANNEL_KEYS.map((channelKey) => ({
    channel_key: channelKey,
    video_path: assetReport.bindings[channelKey].video_path
  })));
  const duplicateUploadRisk = input.duplicateUploadRiskOverride === true || duplicateGuard.duplicate_upload_risk;
  const bridgeReadyToRun = !assetReport.asset_binding_blocker &&
    !mapProductSourceBlocker(productSource.report.product_source_blocker) &&
    targetSummary.blocker === null;
  const affiliateBridge = bridgeReadyToRun
    ? await resolveV066CoupangDeeplinkAffiliateBridge({
      cwd,
      env,
      fetchImpl: input.fetchImpl,
      uploadAssetProfile: input.uploadAssetProfile
    })
    : null;
  const packageBuild = buildV057CorrectedReuploadPackages({
    assetReport,
    productSourceReport: productSource.report,
    affiliateBridgeReport: affiliateBridge?.report ?? null,
    targetChannelIds,
    duplicateUploadRisk,
    disclosureOverrides: input.disclosureOverrides
  });
  const approval = {
    ...buildV051ApprovalAliasStatus({
      approvalText: input.approvalText,
      uploadAssetProfile: input.uploadAssetProfile
    }),
    fresh_approval_required: true as const
  };
  const blocker = firstBlocker<V069UploadPackageBlocker>([
    assetReport.asset_binding_blocker,
    mapProductSourceBlocker(productSource.report.product_source_blocker),
    targetSummary.blocker,
    affiliateBridge?.report.bridge_blocker as V069UploadPackageBlocker | null,
    packageBuild.disclosure_blocker,
    duplicateUploadRisk ? "DUPLICATE_UPLOAD_RISK" : null,
    approval.approval_blocker as V069UploadPackageBlocker | null
  ]);
  const packageBuilderReady = blocker === null ||
    blocker === "V057_CORRECTED_REUPLOAD_APPROVAL_MISSING" ||
    blocker === "V051_UPLOAD_APPROVAL_MISSING";

  return {
    version: "v069",
    FINAL_STATUS: blocker === null
      ? "SUCCESS_V069_V057_UPLOAD_PACKAGE_READY_NO_UPLOAD"
      : "BLOCKED_V069_UPLOAD_PACKAGE_NOT_READY",
    SAFE_TO_UPLOAD: false,
    package_builder_ready: packageBuilderReady && packageBuild.packages.every((item) => item.package_ready),
    upload_package_ready: false,
    blocker,
    selected_profile: assetReport.selected_profile,
    manual_affiliate_url_input_required: false,
    asset_binding: assetReport,
    product_source: {
      raw_coupang_url_source_bound: productSource.report.product_source_ready,
      report: productSource.report
    },
    affiliate_bridge: affiliateBridge?.report ?? null,
    target_channel_ids: {
      all_present: targetSummary.all_present,
      all_format_valid: targetSummary.all_format_valid,
      no_duplicates: targetSummary.no_duplicates,
      channels: packageBuild.targetChannelEvidence
    },
    disclosure: {
      disclosure_preview_pass: packageBuild.disclosure_blocker === null,
      channels: packageBuild.disclosurePreviews
    },
    duplicate_guard: {
      duplicate_upload_guard_injected: duplicateGuard.duplicate_upload_guard_injected,
      duplicate_upload_risk: duplicateUploadRisk,
      same_asset_previously_uploaded: duplicateGuard.same_asset_previously_uploaded,
      blocker: duplicateUploadRisk ? "DUPLICATE_VIDEO_ASSET_REUSE" : null,
      checked_channel_count: duplicateGuard.checked_channel_count,
      checked_video_path_basenames: duplicateGuard.checked_video_paths.map(() => "corrected-preview-v057.mp4"),
      raw_urls_printed: false
    },
    approval,
    packages: packageBuild.packages,
    youtube_execute_called: false,
    videos_insert_called: false,
    videos_insert_total_count: 0,
    comment_create_update_delete_called: false,
    visibility_changed: false,
    R2_upload: false,
    DB_write: false,
    product_assets_write: false,
    raw_urls_printed: false,
    secrets_printed: false,
    fake_success: false
  };
}

export async function writeV069UploadPackageReadinessArtifacts(input: {
  cwd?: string;
  report: V069UploadPackageReadinessReport;
}) {
  const cwd = input.cwd ?? process.cwd();
  const outputRoot = path.join(cwd, "commerce-assets", "review", "v069");
  await fs.mkdir(outputRoot, { recursive: true });
  await fs.writeFile(
    path.join(outputRoot, "v057-upload-package-readiness.json"),
    `${JSON.stringify(input.report, null, 2)}\n`,
    "utf8"
  );
  await fs.writeFile(
    path.join(outputRoot, "v057-upload-package-readiness.html"),
    buildV069HtmlReport(input.report),
    "utf8"
  );
}

function summarizeTargetChannels(targetChannelIds: Partial<Record<ChannelKey, string>>) {
  const values = CHANNEL_KEYS.map((channelKey) => targetChannelIds[channelKey]?.trim() ?? "");
  const allPresent = values.every(Boolean);
  const allFormatValid = values.every((value) => /^UC[A-Za-z0-9_-]{3,}$/.test(value));
  const noDuplicates = new Set(values.filter(Boolean)).size === values.filter(Boolean).length;
  const blocker: Extract<
    V069UploadPackageBlocker,
    | "BLOCKED_V057_RUNTIME_TARGET_CHANNEL_IDS_MISSING"
    | "BLOCKED_V057_RUNTIME_TARGET_CHANNEL_IDS_INVALID"
    | "BLOCKED_V057_RUNTIME_TARGET_CHANNEL_IDS_DUPLICATE"
  > | null = !allPresent
    ? "BLOCKED_V057_RUNTIME_TARGET_CHANNEL_IDS_MISSING"
    : !allFormatValid
      ? "BLOCKED_V057_RUNTIME_TARGET_CHANNEL_IDS_INVALID"
      : !noDuplicates
        ? "BLOCKED_V057_RUNTIME_TARGET_CHANNEL_IDS_DUPLICATE"
        : null;

  return {
    all_present: allPresent,
    all_format_valid: allFormatValid,
    no_duplicates: noDuplicates,
    blocker
  };
}

function mapProductSourceBlocker(blocker: V057ProductSourceLoaderReport["product_source_blocker"]):
  | Extract<V069UploadPackageBlocker,
    | "BLOCKED_V069_UPLOAD_PACKAGE_PRODUCT_SOURCE_MISSING"
    | "BLOCKED_V068_PRODUCT_SOURCE_METADATA_INVALID"
    | "BLOCKED_V068_RUNTIME_SOURCE_NOT_APPROVED"
  >
  | null {
  if (!blocker) return null;
  if (blocker === "BLOCKED_V068_PRODUCT_SOURCE_METADATA_INVALID") return blocker;
  if (blocker === "BLOCKED_V068_RUNTIME_SOURCE_NOT_APPROVED") return blocker;
  return "BLOCKED_V069_UPLOAD_PACKAGE_PRODUCT_SOURCE_MISSING";
}

function buildV069HtmlReport(report: V069UploadPackageReadinessReport) {
  return `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8" /><title>v069 v057 upload package readiness</title></head>
<body>
  <h1>v069 v057 upload package readiness</h1>
  <p>FINAL_STATUS=${escapeHtml(report.FINAL_STATUS)}</p>
  <p>blocker=${escapeHtml(report.blocker)}</p>
  <p>package_builder_ready=${escapeHtml(report.package_builder_ready)}</p>
  <p>upload_package_ready=false</p>
  <p>SAFE_TO_UPLOAD=false</p>
  <p>videos_insert_called=false</p>
  <p>comment_create_update_delete_called=false</p>
  <p>raw_urls_printed=false</p>
  <p>secrets_printed=false</p>
</body>
</html>
`;
}

function firstBlocker<T extends string>(values: Array<T | null | undefined>) {
  return values.find((value): value is T => Boolean(value)) ?? null;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
