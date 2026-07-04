import type { V073UploadPackage } from "../multi-channel/v073UploadPackage";
import {
  buildV075CommentPackage,
  buildV075CommentPackageSanitizedReport,
  isV075CommentTextReady,
  type V075CommentPackage,
  type V075UploadResultEvidence
} from "./v075CommentPackage";
import {
  buildV075CommentSafetyGate,
  type V075CommentSafetyGate,
  type V075CommentSafetyGateInput,
  type V075CommentWriterBlocker
} from "./v075CommentSafetyGate";
import {
  createDefaultV075CommentWriterAdapter,
  type V075CommentWriterAdapter
} from "./v075CommentWriterAdapter";
import {
  buildV075YouTubeCommentRequest,
  buildV075YouTubeCommentRequestSanitizedReport,
  type V075YouTubeCommentRequest
} from "./v075CommentRequestBuilder";

export type V075CommentWriterFinalStatus =
  | "BLOCKED_V075_COMMENT_WRITER_NOT_READY"
  | "BLOCKED_V075_COMMENT_WRITER_SCAFFOLD_ONLY";

export type V075CommentWriterPreflightReport = {
  version: "v075";
  FINAL_STATUS: V075CommentWriterFinalStatus;
  SAFE_TO_UPLOAD: false;
  safeToUpload: false;
  uploadPackageId: string;
  channelKey: V075CommentPackage["channelKey"];
  videoIdPresent: boolean;
  videoIdHashPrefix: string | null;
  affiliateUrlPresent: boolean;
  affiliateUrlHashPrefix: string | null;
  disclosurePresent: boolean;
  commentTextReady: boolean;
  uploadVisibility: V075CommentPackage["uploadVisibility"];
  uploadResultStatus: V075CommentPackage["uploadResultStatus"];
  targetChannelVerified: boolean;
  duplicateGuardPassed: boolean;
  publicUploadPackageReady: boolean;
  safetyGateReady: boolean;
  commentWriteAllowed: false;
  blocker: V075CommentWriterBlocker;
  blockers: V075CommentWriterBlocker[];
  adapterMode: V075CommentWriterAdapter["mode"];
  commentCreateCalled: false;
  commentThreads_insert_called: false;
  comment_create_update_delete_called: false;
  youtube_execute_called: false;
  videos_insert_called: false;
  videos_insert_total_count: 0;
  visibility_changed: false;
  R2_upload: false;
  DB_write: false;
  product_assets_write: false;
  raw_urls_printed: false;
  raw_video_ids_printed: false;
  raw_channel_ids_printed: false;
  secrets_printed: false;
  fake_success: false;
};

export type V075CommentWriterPreflightResult = {
  version: "v075";
  commentPackage: V075CommentPackage;
  request: V075YouTubeCommentRequest;
  safetyGate: V075CommentSafetyGate;
  report: V075CommentWriterPreflightReport;
};

export async function executeV075CommentWriterPreflight(input: {
  uploadPackage: V073UploadPackage;
  uploadResult: V075UploadResultEvidence | null;
  adapter?: V075CommentWriterAdapter;
  safetyOverrides?: Partial<V075CommentSafetyGateInput>;
}): Promise<V075CommentWriterPreflightResult> {
  const commentPackage = buildV075CommentPackage({
    uploadPackage: input.uploadPackage,
    uploadResult: input.uploadResult
  });
  const request = buildV075YouTubeCommentRequest(commentPackage);
  const adapter = input.adapter ?? createDefaultV075CommentWriterAdapter();
  const safetyGate = buildV075CommentSafetyGate({
    ...buildV075CommentSafetyGateInputFromPackage(commentPackage),
    ...input.safetyOverrides
  });
  const report = buildV075CommentWriterPreflightReport({
    commentPackage,
    request,
    safetyGate,
    adapter
  });

  return {
    version: "v075",
    commentPackage,
    request,
    safetyGate,
    report
  };
}

export function buildV075CommentWriterPreflightReport(input: {
  commentPackage: V075CommentPackage;
  request: V075YouTubeCommentRequest;
  safetyGate: V075CommentSafetyGate;
  adapter: V075CommentWriterAdapter;
}): V075CommentWriterPreflightReport {
  const packageReport = buildV075CommentPackageSanitizedReport(input.commentPackage);
  const requestReport = buildV075YouTubeCommentRequestSanitizedReport(input.request);
  const blocker = input.safetyGate.ready
    ? "BLOCKED_V075_REAL_ADAPTER_DISABLED"
    : input.safetyGate.blocker ?? "BLOCKED_V075_COMMENT_WRITER_DISABLED";

  return {
    version: "v075",
    FINAL_STATUS: input.safetyGate.ready
      ? "BLOCKED_V075_COMMENT_WRITER_SCAFFOLD_ONLY"
      : "BLOCKED_V075_COMMENT_WRITER_NOT_READY",
    SAFE_TO_UPLOAD: false,
    safeToUpload: false,
    uploadPackageId: packageReport.uploadPackageId,
    channelKey: packageReport.channelKey,
    videoIdPresent: requestReport.videoIdPresent,
    videoIdHashPrefix: requestReport.videoIdHashPrefix,
    affiliateUrlPresent: requestReport.affiliateUrlPresent,
    affiliateUrlHashPrefix: requestReport.affiliateUrlHashPrefix,
    disclosurePresent: requestReport.disclosurePresent,
    commentTextReady: requestReport.commentTextReady,
    uploadVisibility: packageReport.uploadVisibility,
    uploadResultStatus: packageReport.uploadResultStatus,
    targetChannelVerified: packageReport.targetChannelVerified,
    duplicateGuardPassed: packageReport.duplicateGuardPassed,
    publicUploadPackageReady: packageReport.publicUploadPackageReady,
    safetyGateReady: input.safetyGate.ready,
    commentWriteAllowed: false,
    blocker,
    blockers: input.safetyGate.ready ? [blocker] : input.safetyGate.blockers,
    adapterMode: input.adapter.mode,
    commentCreateCalled: false,
    commentThreads_insert_called: false,
    comment_create_update_delete_called: false,
    youtube_execute_called: false,
    videos_insert_called: false,
    videos_insert_total_count: 0,
    visibility_changed: false,
    R2_upload: false,
    DB_write: false,
    product_assets_write: false,
    raw_urls_printed: false,
    raw_video_ids_printed: false,
    raw_channel_ids_printed: false,
    secrets_printed: false,
    fake_success: false
  };
}

export function buildV075CommentSafetyGateInputFromPackage(
  commentPackage: V075CommentPackage
): V075CommentSafetyGateInput {
  return {
    uploadResultPresent: commentPackage.uploadResultStatus !== "missing",
    uploadResultStatus: commentPackage.uploadResultStatus,
    youtubeVideoIdPresent: Boolean(commentPackage.youtubeVideoId),
    uploadVisibility: commentPackage.uploadVisibility,
    affiliateUrlReady: commentPackage.affiliateUrlPresent,
    coupangDisclosurePresent: commentPackage.coupangDisclosurePresent,
    commentTextReady: isV075CommentTextReady(commentPackage),
    targetChannelVerified: commentPackage.targetChannelVerified,
    duplicateGuardPassed: commentPackage.duplicateGuardPassed,
    publicUploadPackageReady: commentPackage.publicUploadPackageReady,
    commentFeatureEnabled: false,
    freshCommentApprovalPresent: false,
    realAdapterRequested: false,
    realCommentMutationAttempted: false
  };
}
