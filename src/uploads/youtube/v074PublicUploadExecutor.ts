import type {
  V073UploadPackage,
  V073UploadPackageBlocker,
  V073UploadPackageReport,
  V073UploadPackageReportItem
} from "../multi-channel/v073UploadPackage";
import {
  buildV074PublicUploadSafetyGate,
  type V074PublicUploadBlocker,
  type V074PublicUploadSafetyGate,
  type V074PublicUploadSafetyGateInput
} from "./v074PublicUploadSafetyGate";
import {
  buildV074YouTubeUploadRequest,
  buildV074YouTubeUploadRequestSanitizedReport,
  isAdvancedSettingsReady,
  isV074RequestFirstFrameReady,
  isV074RequestVideoAssetReady,
  type V074YouTubeUploadRequest
} from "./v074YouTubeUploadRequestBuilder";
import {
  createDefaultV074YouTubeUploadAdapter,
  type V074YouTubeUploadAdapter
} from "./v074YouTubeUploadAdapter";

export type V074PublicUploadExecutorFinalStatus =
  | "BLOCKED_V074_PUBLIC_UPLOAD_EXECUTOR_NOT_READY"
  | "BLOCKED_V074_PUBLIC_UPLOAD_EXECUTOR_SCAFFOLD_ONLY";

export type V074PublicUploadPreflightReport = {
  version: "v074";
  FINAL_STATUS: V074PublicUploadExecutorFinalStatus;
  SAFE_TO_UPLOAD: false;
  safeToUpload: false;
  packageId: string;
  channelKey: V074YouTubeUploadRequest["channelKey"];
  videoAssetHashPrefix: string | null;
  metadataReady: boolean;
  disclosureReady: boolean;
  targetChannelHashPrefix: string | null;
  advancedSettingsReady: boolean;
  upstreamPackageReady: boolean;
  upstreamPackageBlocker: V074UpstreamPackageBlocker;
  safetyGateReady: boolean;
  blocker: V074PublicUploadBlocker;
  blockers: V074PublicUploadBlocker[];
  adapterMode: V074YouTubeUploadAdapter["mode"];
  uploadExecutionCalled: false;
  youtube_execute_called: false;
  videos_insert_called: false;
  videos_insert_total_count: 0;
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

export type V074UpstreamPackageBlocker =
  | V073UploadPackageBlocker
  | "BLOCKED_V073_UPLOAD_PACKAGE_READINESS_MISSING"
  | null;

export type V074UpstreamPackageReadiness = {
  sourceVersion: "v073";
  packageReportPresent: boolean;
  uploadPackageReady: boolean;
  blocker: V074UpstreamPackageBlocker;
  productSourceReady: boolean;
  videoAssetReady: boolean;
  firstFrameReady: boolean;
  disclosureReady: boolean;
  targetChannelReady: boolean;
  duplicateUploadRisk: boolean;
};

export type V074PublicUploadPreflightResult = {
  version: "v074";
  request: V074YouTubeUploadRequest;
  safetyGate: V074PublicUploadSafetyGate;
  report: V074PublicUploadPreflightReport;
};

export async function executeV074PublicUploadPreflight(input: {
  uploadPackage: V073UploadPackage;
  upstreamPackageReadiness?: V074UpstreamPackageReadiness;
  adapter?: V074YouTubeUploadAdapter;
  safetyOverrides?: Partial<V074PublicUploadSafetyGateInput>;
}): Promise<V074PublicUploadPreflightResult> {
  const request = buildV074YouTubeUploadRequest(input.uploadPackage);
  const adapter = input.adapter ?? createDefaultV074YouTubeUploadAdapter();
  const upstreamPackageReadiness = input.upstreamPackageReadiness ?? buildMissingUpstreamPackageReadiness();
  const safetyGate = buildV074PublicUploadSafetyGate({
    ...enforceUpstreamPackageReadiness({
      ...buildSafetyGateInputFromRequest(request, upstreamPackageReadiness),
      ...input.safetyOverrides
    }, upstreamPackageReadiness)
  });
  const report = buildV074PublicUploadPreflightReport({
    request,
    upstreamPackageReadiness,
    safetyGate,
    adapter
  });

  return {
    version: "v074",
    request,
    safetyGate,
    report
  };
}

export function buildV074PublicUploadPreflightReport(input: {
  request: V074YouTubeUploadRequest;
  upstreamPackageReadiness: V074UpstreamPackageReadiness;
  safetyGate: V074PublicUploadSafetyGate;
  adapter: V074YouTubeUploadAdapter;
}): V074PublicUploadPreflightReport {
  const requestReport = buildV074YouTubeUploadRequestSanitizedReport(input.request);
  const blocker = input.safetyGate.blocker ?? "BLOCKED_V074_REAL_ADAPTER_DISABLED";

  return {
    version: "v074",
    FINAL_STATUS: input.safetyGate.ready
      ? "BLOCKED_V074_PUBLIC_UPLOAD_EXECUTOR_SCAFFOLD_ONLY"
      : "BLOCKED_V074_PUBLIC_UPLOAD_EXECUTOR_NOT_READY",
    SAFE_TO_UPLOAD: false,
    safeToUpload: false,
    packageId: requestReport.packageId,
    channelKey: requestReport.channelKey,
    videoAssetHashPrefix: requestReport.videoAssetHashPrefix,
    metadataReady: requestReport.metadataReady,
    disclosureReady: requestReport.disclosureReady,
    targetChannelHashPrefix: requestReport.targetChannelHashPrefix,
    advancedSettingsReady: requestReport.advancedSettingsReady,
    upstreamPackageReady: input.upstreamPackageReadiness.uploadPackageReady,
    upstreamPackageBlocker: input.upstreamPackageReadiness.blocker,
    safetyGateReady: input.safetyGate.ready,
    blocker,
    blockers: input.safetyGate.ready ? [blocker] : input.safetyGate.blockers,
    adapterMode: input.adapter.mode,
    uploadExecutionCalled: false,
    youtube_execute_called: false,
    videos_insert_called: false,
    videos_insert_total_count: 0,
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

export function buildSafetyGateInputFromRequest(
  request: V074YouTubeUploadRequest,
  upstreamPackageReadiness: V074UpstreamPackageReadiness = buildMissingUpstreamPackageReadiness()
): V074PublicUploadSafetyGateInput {
  return {
    uploadPackageReady: upstreamPackageReadiness.uploadPackageReady,
    productSourceReady: request.productSourceReady && upstreamPackageReadiness.productSourceReady,
    deeplinkReady: request.deeplinkReady,
    affiliateUrlReady: request.affiliateUrlReady,
    videoAssetReady: isV074RequestVideoAssetReady(request) && upstreamPackageReadiness.videoAssetReady,
    firstFrameReady: isV074RequestFirstFrameReady(request) && upstreamPackageReadiness.firstFrameReady,
    metadataReady: request.metadataReady,
    descriptionDisclosureReady: request.descriptionDisclosurePresent && upstreamPackageReadiness.disclosureReady,
    commentDisclosureReady: request.commentDisclosurePresent && upstreamPackageReadiness.disclosureReady,
    targetChannelVerified: request.targetChannelVerified && upstreamPackageReadiness.targetChannelReady,
    duplicateUploadRisk: request.duplicateUploadRisk || upstreamPackageReadiness.duplicateUploadRisk,
    quotaReady: request.quotaGuardReady,
    oauthReady: false,
    publicUploadFeatureEnabled: false,
    freshApprovalPresent: request.approvalStatus.approvalPresent,
    realAdapterRequested: false,
    realYouTubeMutationAttempted: false
  };
}

export function isV074RequestAdvancedSettingsReady(request: V074YouTubeUploadRequest) {
  return isAdvancedSettingsReady(request.advancedSettings);
}

export function buildV074UpstreamPackageReadinessFromV073Report(input: {
  uploadPackage: V073UploadPackage;
  report: V073UploadPackageReport;
}): V074UpstreamPackageReadiness {
  const item = findPackageReportItem(input.report, input.uploadPackage);
  if (!item) return buildMissingUpstreamPackageReadiness();

  const productSourceReady = Boolean(
    item.productSourcePresent &&
    item.rawCoupangUrlPresent &&
    input.uploadPackage.productSource.runtimeSourceApproved
  );
  const videoAssetReady = Boolean(item.videoAssetPresent && input.uploadPackage.videoAsset.path);
  const firstFrameReady = Boolean(item.firstFramePresent && input.uploadPackage.videoAsset.firstFramePath);
  const disclosureReady = Boolean(item.disclosureReady);
  const targetChannelReady = Boolean(
    item.targetChannelReady &&
    item.targetChannelPresent &&
    item.targetChannelFormatValid &&
    !item.targetChannelDuplicateDetected
  );
  const duplicateUploadRisk = Boolean(
    !item.duplicateGuardReady ||
    input.uploadPackage.duplicateGuard.duplicateUploadRisk
  );
  const blocker = input.report.blocker ??
    (productSourceReady &&
      videoAssetReady &&
      firstFrameReady &&
      disclosureReady &&
      targetChannelReady &&
      !duplicateUploadRisk
      ? null
      : "BLOCKED_V073_UPLOAD_PACKAGE_NOT_READY");
  const uploadPackageReady = Boolean(
    input.report.upload_package_generator_ready &&
    blocker === null &&
    productSourceReady &&
    videoAssetReady &&
    firstFrameReady &&
    disclosureReady &&
    targetChannelReady &&
    !duplicateUploadRisk
  );

  return {
    sourceVersion: "v073",
    packageReportPresent: true,
    uploadPackageReady,
    blocker,
    productSourceReady,
    videoAssetReady,
    firstFrameReady,
    disclosureReady,
    targetChannelReady,
    duplicateUploadRisk
  };
}

function buildMissingUpstreamPackageReadiness(): V074UpstreamPackageReadiness {
  return {
    sourceVersion: "v073",
    packageReportPresent: false,
    uploadPackageReady: false,
    blocker: "BLOCKED_V073_UPLOAD_PACKAGE_READINESS_MISSING",
    productSourceReady: false,
    videoAssetReady: false,
    firstFrameReady: false,
    disclosureReady: false,
    targetChannelReady: false,
    duplicateUploadRisk: false
  };
}

function enforceUpstreamPackageReadiness(
  input: V074PublicUploadSafetyGateInput,
  upstreamPackageReadiness: V074UpstreamPackageReadiness
): V074PublicUploadSafetyGateInput {
  if (upstreamPackageReadiness.uploadPackageReady) return input;
  return {
    ...input,
    uploadPackageReady: false,
    productSourceReady: false,
    videoAssetReady: false,
    firstFrameReady: false,
    descriptionDisclosureReady: false,
    commentDisclosureReady: false,
    targetChannelVerified: false,
    duplicateUploadRisk: input.duplicateUploadRisk || upstreamPackageReadiness.duplicateUploadRisk
  };
}

function findPackageReportItem(
  report: V073UploadPackageReport,
  uploadPackage: V073UploadPackage
): V073UploadPackageReportItem | null {
  return report.packages.find((item) => item.packageId === uploadPackage.packageId) ??
    report.packages.find((item) => item.channelKey === uploadPackage.channelKey) ??
    null;
}
