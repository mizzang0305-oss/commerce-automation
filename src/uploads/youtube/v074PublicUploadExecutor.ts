import type { V073UploadPackage } from "../multi-channel/v073UploadPackage";
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

export type V074PublicUploadPreflightResult = {
  version: "v074";
  request: V074YouTubeUploadRequest;
  safetyGate: V074PublicUploadSafetyGate;
  report: V074PublicUploadPreflightReport;
};

export async function executeV074PublicUploadPreflight(input: {
  uploadPackage: V073UploadPackage;
  adapter?: V074YouTubeUploadAdapter;
  safetyOverrides?: Partial<V074PublicUploadSafetyGateInput>;
}): Promise<V074PublicUploadPreflightResult> {
  const request = buildV074YouTubeUploadRequest(input.uploadPackage);
  const adapter = input.adapter ?? createDefaultV074YouTubeUploadAdapter();
  const safetyGate = buildV074PublicUploadSafetyGate({
    ...buildSafetyGateInputFromRequest(request),
    ...input.safetyOverrides
  });
  const report = buildV074PublicUploadPreflightReport({
    request,
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
  request: V074YouTubeUploadRequest
): V074PublicUploadSafetyGateInput {
  return {
    uploadPackageReady: true,
    productSourceReady: request.productSourceReady,
    deeplinkReady: request.deeplinkReady,
    affiliateUrlReady: request.affiliateUrlReady,
    videoAssetReady: isV074RequestVideoAssetReady(request),
    firstFrameReady: isV074RequestFirstFrameReady(request),
    metadataReady: request.metadataReady,
    descriptionDisclosureReady: request.descriptionDisclosurePresent,
    commentDisclosureReady: request.commentDisclosurePresent,
    targetChannelVerified: request.targetChannelVerified,
    duplicateUploadRisk: request.duplicateUploadRisk,
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
