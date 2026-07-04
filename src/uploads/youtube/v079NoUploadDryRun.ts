import crypto from "node:crypto";

import type { ChannelKey } from "../multi-channel/channelProfiles";
import { V057_REUPLOAD_ASSET_PROFILE } from "../multi-channel/v057ReuploadAssetBinding";
import type { V073UploadPackage } from "../multi-channel/v073UploadPackage";
import {
  buildV075CommentPackage,
  buildV075CommentPackageSanitizedReport
} from "./v075CommentPackage";
import { buildV075CommentSafetyGate } from "./v075CommentSafetyGate";
import {
  buildV076CommentWriterEvidenceGate,
  buildV076UploadResultStoreItem,
  buildV076UploadResultStoreSanitizedReport
} from "./v076UploadResultStore";
import {
  buildV077AutopilotSchedulerPlan,
  buildV077AutopilotSchedulerReport,
  type V077AutopilotSchedulerBlocker
} from "./v077AutopilotScheduler";
import {
  buildV078DashboardControlPanel,
  buildV078DashboardControlReport,
  type V078DashboardBlocker
} from "./v078DashboardControl";

export type V079NoUploadDryRunMode = "no_upload_dry_run";
export type V079FixtureMode = "blocked_default" | "fully_ready";
export type V079PipelineStageName =
  | "fixture_queue_item"
  | "upload_package_scaffold"
  | "upload_result_store_scaffold"
  | "comment_package_scaffold"
  | "comment_writer_evidence_gate"
  | "autopilot_scheduler_scaffold"
  | "dashboard_control_scaffold"
  | "final_sanitized_report";
export type V079PipelineStageStatus = "plan_only" | "scaffold_only" | "blocked";
export type V079FinalDecision = "SCAFFOLD_ONLY_BLOCKED";
export type V079RequiredBlocker =
  | "BLOCKED_V079_SAFE_TO_UPLOAD_FALSE"
  | "BLOCKED_V079_UPLOAD_DISABLED"
  | "BLOCKED_V079_COMMENT_DISABLED"
  | "BLOCKED_V079_SCHEDULER_DISABLED"
  | "BLOCKED_V079_FRESH_APPROVAL_MISSING"
  | "BLOCKED_V079_REAL_ADAPTER_DISABLED"
  | "BLOCKED_V079_MUTATION_ATTEMPT_BLOCKED"
  | "BLOCKED_V079_PUBLIC_VISIBILITY_NOT_APPROVED"
  | "BLOCKED_V079_DUPLICATE_GUARD_NOT_SATISFIED";

export type V079FixtureInput = {
  queueItemId: string;
  generatedContentId: string;
  uploadPackageId: string;
  channelKey: ChannelKey;
  productName: string;
  rawCoupangUrl: string;
  selectedAffiliateUrl: string;
  youtubeVideoId: string;
  targetChannelId: string;
  duplicateGuardSatisfied: boolean;
  nextEligibleAt: string | null;
};

export type V079NoUploadDryRunInput = {
  dryRunId: string;
  generatedAt: string;
  fixtureMode?: V079FixtureMode;
  fixture: V079FixtureInput;
};

export type V079PipelineStage = {
  stageName: V079PipelineStageName;
  status: V079PipelineStageStatus;
  blockers: Array<V079RequiredBlocker | V077AutopilotSchedulerBlocker | V078DashboardBlocker | string>;
  evidencePresent: Record<string, boolean>;
  hashPrefixes: Record<string, string | null>;
  sanitizedStatus: string;
};

export type V079NoUploadDryRunReport = {
  version: "v079";
  FINAL_STATUS: "NO_UPLOAD_DRY_RUN_COMPLETED";
  dryRunId: string;
  generatedAt: string;
  mode: V079NoUploadDryRunMode;
  fixtureMode: V079FixtureMode;
  safeToUpload: false;
  safeToComment: false;
  externalCallsAttempted: false;
  uploadMutationAttempted: false;
  commentMutationAttempted: false;
  schedulerExecutionAttempted: false;
  dashboardActionMutationAttempted: false;
  fixtureOnly: true;
  pipelineStages: V079PipelineStage[];
  requiredBlockers: V079RequiredBlocker[];
  connections: {
    uploadPackageToCommentPackage: boolean;
    uploadResultStoreToCommentEvidenceGate: boolean;
    uploadResultStoreToScheduler: boolean;
    schedulerToDashboard: boolean;
  };
  redactionProof: {
    rawUrlsPrinted: false;
    rawVideoIdsPrinted: false;
    rawChannelIdsPrinted: false;
    secretsPrinted: false;
    fakeSuccess: false;
  };
  finalDecision: V079FinalDecision;
  uploadExecutionCalled: false;
  youtube_execute_called: false;
  videos_insert_called: false;
  videos_insert_total_count: 0;
  commentThreads_insert_called: false;
  comment_create_update_delete_called: false;
  visibility_changed: false;
  scheduler_auto_execution_called: false;
  n8n_webhook_called: false;
  R2_upload: false;
  DB_write: false;
  product_assets_write: false;
  raw_urls_printed: false;
  raw_video_ids_printed: false;
  raw_channel_ids_printed: false;
  secrets_printed: false;
  fake_success: false;
};

const COUPANG_DISCLOSURE =
  "이 콘텐츠는 쿠팡파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.";

export function buildV079NoUploadDryRunReport(
  input: V079NoUploadDryRunInput
): V079NoUploadDryRunReport {
  const fixtureMode = input.fixtureMode ?? "blocked_default";
  const duplicateGuardSatisfied = fixtureMode === "fully_ready"
    ? true
    : input.fixture.duplicateGuardSatisfied;
  const uploadPackage = buildFixtureUploadPackage(input.fixture, duplicateGuardSatisfied);
  const uploadResultStoreItem = buildV076UploadResultStoreItem({
    uploadResultId: `upload-result-${input.fixture.uploadPackageId}`,
    uploadPackageId: uploadPackage.packageId,
    queueItemId: uploadPackage.queueItemId,
    channelKey: uploadPackage.channelKey,
    platform: "youtube",
    visibility: "public",
    uploadedAt: input.generatedAt,
    youtubeVideoId: input.fixture.youtubeVideoId,
    channelId: input.fixture.targetChannelId,
    targetChannelVerified: true,
    duplicateGuardPassed: duplicateGuardSatisfied,
    publicUploadPackageReady: true,
    createdAt: input.generatedAt,
    updatedAt: input.generatedAt
  });
  const uploadResultStoreReport = buildV076UploadResultStoreSanitizedReport(uploadResultStoreItem);
  const commentPackage = buildV075CommentPackage({
    uploadPackage,
    uploadResult: {
      uploadPackageId: uploadPackage.packageId,
      channelKey: uploadPackage.channelKey,
      youtubeVideoId: input.fixture.youtubeVideoId,
      youtubeVideoIdHash: hashEvidence(input.fixture.youtubeVideoId),
      uploadResultStatus: "uploaded_public",
      uploadVisibility: "public",
      targetChannelVerified: true,
      duplicateGuardPassed: duplicateGuardSatisfied,
      publicUploadPackageReady: true
    }
  });
  const commentPackageReport = buildV075CommentPackageSanitizedReport(commentPackage);
  const commentEvidenceGate = buildV076CommentWriterEvidenceGate({
    uploadPackageId: uploadPackage.packageId,
    channelKey: uploadPackage.channelKey,
    storeItem: uploadResultStoreItem
  });
  const commentSafetyGate = buildV075CommentSafetyGate({
    uploadResultPresent: commentEvidenceGate.uploadResultStoreEvidencePresent,
    uploadResultStatus: commentEvidenceGate.v075UploadResultStatus,
    youtubeVideoIdPresent: commentEvidenceGate.youtubeVideoIdHashPrefixPresent,
    uploadVisibility: commentEvidenceGate.v075UploadVisibility,
    affiliateUrlReady: commentPackageReport.affiliateUrlPresent,
    coupangDisclosurePresent: commentPackageReport.disclosurePresent,
    commentTextReady: commentPackageReport.commentTextReady,
    targetChannelVerified: commentEvidenceGate.targetChannelVerified,
    duplicateGuardPassed: commentEvidenceGate.duplicateGuardPassed,
    publicUploadPackageReady: commentEvidenceGate.publicUploadPackageReady,
    commentFeatureEnabled: false,
    freshCommentApprovalPresent: false
  });
  const schedulerPlan = buildV077AutopilotSchedulerPlan({
    schedulerPlanId: `scheduler-${input.dryRunId}`,
    generatedAt: input.generatedAt,
    enabled: false,
    uploadFeatureEnabled: false,
    commentFeatureEnabled: false,
    approvalPresent: false,
    publicVisibilityApproved: false,
    realAdapterEnabled: false,
    candidates: [
      buildSchedulerCandidate(uploadPackage, uploadResultStoreItem, "upload_prepare", input.fixture.nextEligibleAt),
      buildSchedulerCandidate(uploadPackage, uploadResultStoreItem, "comment_prepare", input.fixture.nextEligibleAt)
    ]
  });
  const schedulerReport = buildV077AutopilotSchedulerReport(schedulerPlan);
  const dashboardPanel = buildV078DashboardControlPanel({
    generatedAt: input.generatedAt,
    schedulerPlan
  });
  const dashboardReport = buildV078DashboardControlReport(dashboardPanel);
  const requiredBlockers = buildRequiredBlockers(duplicateGuardSatisfied);

  return {
    version: "v079",
    FINAL_STATUS: "NO_UPLOAD_DRY_RUN_COMPLETED",
    dryRunId: input.dryRunId,
    generatedAt: input.generatedAt,
    mode: "no_upload_dry_run",
    fixtureMode,
    safeToUpload: false,
    safeToComment: false,
    externalCallsAttempted: false,
    uploadMutationAttempted: false,
    commentMutationAttempted: false,
    schedulerExecutionAttempted: false,
    dashboardActionMutationAttempted: false,
    fixtureOnly: true,
    pipelineStages: buildPipelineStages({
      uploadPackage,
      uploadResultStoreReport,
      commentPackageReport,
      commentSafetyGate,
      commentEvidenceGateBlocker: commentEvidenceGate.blocker,
      schedulerReport,
      dashboardReport,
      requiredBlockers
    }),
    requiredBlockers,
    connections: {
      uploadPackageToCommentPackage: commentPackage.uploadPackageId === uploadPackage.packageId &&
        commentPackage.channelKey === uploadPackage.channelKey,
      uploadResultStoreToCommentEvidenceGate: commentEvidenceGate.uploadPackageId === uploadResultStoreItem.uploadPackageId &&
        commentEvidenceGate.channelKey === uploadResultStoreItem.channelKey,
      uploadResultStoreToScheduler: schedulerPlan.candidates.every((candidate) =>
        candidate.uploadPackageId === uploadResultStoreItem.uploadPackageId),
      schedulerToDashboard: dashboardPanel.summary.candidateCount === schedulerPlan.candidateCount &&
        dashboardPanel.summary.blockedCount === schedulerPlan.blockedCount
    },
    redactionProof: {
      rawUrlsPrinted: false,
      rawVideoIdsPrinted: false,
      rawChannelIdsPrinted: false,
      secretsPrinted: false,
      fakeSuccess: false
    },
    finalDecision: "SCAFFOLD_ONLY_BLOCKED",
    uploadExecutionCalled: false,
    youtube_execute_called: false,
    videos_insert_called: false,
    videos_insert_total_count: 0,
    commentThreads_insert_called: false,
    comment_create_update_delete_called: false,
    visibility_changed: false,
    scheduler_auto_execution_called: false,
    n8n_webhook_called: false,
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

function buildFixtureUploadPackage(
  fixture: V079FixtureInput,
  duplicateGuardSatisfied: boolean
): V073UploadPackage {
  const affiliateUrlHashPrefix = hashPrefix(fixture.selectedAffiliateUrl);
  const rawCoupangUrlHashPrefix = hashPrefix(fixture.rawCoupangUrl);
  const targetChannelHashPrefix = hashPrefix(fixture.targetChannelId);

  return {
    packageId: fixture.uploadPackageId,
    queueItemId: fixture.queueItemId,
    generatedContentId: fixture.generatedContentId,
    channelKey: fixture.channelKey,
    assetProfile: V057_REUPLOAD_ASSET_PROFILE,
    productSource: {
      rawCoupangUrl: fixture.rawCoupangUrl,
      productName: fixture.productName,
      sourceKind: "trusted_upstream_manifest",
      sourceEvidenceHash: hashEvidence(`${fixture.channelKey}:${fixture.productName}:${rawCoupangUrlHashPrefix}`),
      runtimeSourceApproved: true
    },
    deeplink: {
      selectedAffiliateUrl: fixture.selectedAffiliateUrl,
      source: "deeplink",
      status: "ready",
      sanitizedEvidence: {
        affiliateUrlPresent: true,
        affiliateUrlPrinted: false,
        affiliateHashPrefix: affiliateUrlHashPrefix
      }
    },
    videoAsset: {
      path: "fixture-only/v079/corrected-preview-v057.mp4",
      basename: "corrected-preview-v057.mp4",
      hashEvidence: hashEvidence(`${fixture.uploadPackageId}:video`).slice(0, 10),
      firstFramePath: "fixture-only/v079/first-frame-v057.jpg",
      firstFrameBasename: "first-frame-v057.jpg",
      firstFrameHashEvidence: hashEvidence(`${fixture.uploadPackageId}:first-frame`).slice(0, 10),
      duration: null,
      resolution: null
    },
    youtubeMetadata: {
      title: "V079 fixture title #shorts",
      description: COUPANG_DISCLOSURE,
      tags: [fixture.channelKey, "coupang", "shorts"],
      categoryId: "26",
      defaultLanguage: "ko",
      defaultAudioLanguage: "ko"
    },
    youtubeAdvancedSettings: {
      privacyStatus: "public",
      selfDeclaredMadeForKids: false,
      containsSyntheticMedia: true,
      paidProductPlacementDetails: {
        hasPaidProductPlacement: true
      },
      license: "youtube",
      embeddable: true,
      publicStatsViewable: true,
      defaultLanguage: "ko",
      defaultAudioLanguage: "ko"
    },
    commentPackage: {
      commentText: `제품 링크는 댓글에서 확인하세요.\n${COUPANG_DISCLOSURE}`,
      affiliateUrlRequiredBeforeExecution: true,
      coupangPartnersDisclosurePresent: true
    },
    targetChannel: {
      channelKey: fixture.channelKey,
      channelIdHashPrefix: targetChannelHashPrefix,
      formatValid: true,
      rawChannelIdPrinted: false
    },
    duplicateGuard: {
      ready: duplicateGuardSatisfied,
      duplicateUploadRisk: !duplicateGuardSatisfied,
      signature: hashEvidence(`${fixture.uploadPackageId}:duplicate-guard`).slice(0, 10)
    },
    quotaGuard: {
      ready: true,
      publicUploadExecutionDisabled: true
    },
    approvalGate: {
      freshApprovalRequired: true,
      approvalPresent: false,
      publicUploadExecutionDisabled: true
    },
    resultStore: {
      status: "placeholder",
      rawUrlsStored: false,
      secretsStored: false
    }
  };
}

function buildSchedulerCandidate(
  uploadPackage: V073UploadPackage,
  uploadResultStoreItem: ReturnType<typeof buildV076UploadResultStoreItem>,
  intendedAction: "upload_prepare" | "comment_prepare",
  nextEligibleAt: string | null
) {
  return {
    queueItemId: uploadPackage.queueItemId ?? `${uploadPackage.packageId}-queue`,
    uploadPackageId: uploadPackage.packageId,
    channelKey: uploadPackage.channelKey,
    platform: "youtube" as const,
    intendedAction,
    nextEligibleAt,
    affiliateUrlPresent: uploadPackage.deeplink.sanitizedEvidence.affiliateUrlPresent,
    affiliateUrlHashPrefix: uploadPackage.deeplink.sanitizedEvidence.affiliateHashPrefix,
    coupangDisclosurePresent: uploadPackage.commentPackage.coupangPartnersDisclosurePresent,
    targetChannelEvidencePresent: Boolean(uploadPackage.targetChannel.channelIdHashPrefix),
    targetChannelHashPrefix: uploadPackage.targetChannel.channelIdHashPrefix,
    duplicateGuardSatisfied: uploadPackage.duplicateGuard.ready,
    uploadPackageReady: true,
    commentPackageReady: true,
    uploadResultStoreItem
  };
}

function buildPipelineStages(input: {
  uploadPackage: V073UploadPackage;
  uploadResultStoreReport: ReturnType<typeof buildV076UploadResultStoreSanitizedReport>;
  commentPackageReport: ReturnType<typeof buildV075CommentPackageSanitizedReport>;
  commentSafetyGate: ReturnType<typeof buildV075CommentSafetyGate>;
  commentEvidenceGateBlocker: string | null;
  schedulerReport: ReturnType<typeof buildV077AutopilotSchedulerReport>;
  dashboardReport: ReturnType<typeof buildV078DashboardControlReport>;
  requiredBlockers: V079RequiredBlocker[];
}): V079PipelineStage[] {
  return [
    {
      stageName: "fixture_queue_item",
      status: "plan_only",
      blockers: ["BLOCKED_V079_SAFE_TO_UPLOAD_FALSE"],
      evidencePresent: {
        queueItem: Boolean(input.uploadPackage.queueItemId),
        generatedContent: Boolean(input.uploadPackage.generatedContentId),
        productSource: true
      },
      hashPrefixes: {
        productSourceHashPrefix: input.uploadPackage.productSource.sourceEvidenceHash.slice(0, 10)
      },
      sanitizedStatus: "fixture-only"
    },
    {
      stageName: "upload_package_scaffold",
      status: "blocked",
      blockers: input.requiredBlockers,
      evidencePresent: {
        uploadPackage: true,
        rawCoupangUrl: true,
        affiliateUrl: input.uploadPackage.deeplink.sanitizedEvidence.affiliateUrlPresent,
        videoAsset: true,
        firstFrame: true,
        targetChannel: Boolean(input.uploadPackage.targetChannel.channelIdHashPrefix),
        duplicateGuard: input.uploadPackage.duplicateGuard.ready
      },
      hashPrefixes: {
        affiliateUrlHashPrefix: input.uploadPackage.deeplink.sanitizedEvidence.affiliateHashPrefix,
        targetChannelHashPrefix: input.uploadPackage.targetChannel.channelIdHashPrefix,
        videoAssetHashPrefix: input.uploadPackage.videoAsset.hashEvidence
      },
      sanitizedStatus: "public-upload-disabled"
    },
    {
      stageName: "upload_result_store_scaffold",
      status: input.uploadResultStoreReport.uploadResultStoreReady ? "scaffold_only" : "blocked",
      blockers: input.uploadResultStoreReport.uploadResultStoreReady
        ? ["BLOCKED_V079_SAFE_TO_UPLOAD_FALSE"]
        : ["BLOCKED_V079_DUPLICATE_GUARD_NOT_SATISFIED", "BLOCKED_V079_SAFE_TO_UPLOAD_FALSE"],
      evidencePresent: input.uploadResultStoreReport.evidencePresent,
      hashPrefixes: {
        youtubeVideoIdHashPrefix: input.uploadResultStoreReport.youtubeVideoIdHashPrefix,
        channelIdHashPrefix: input.uploadResultStoreReport.channelIdHashPrefix
      },
      sanitizedStatus: input.uploadResultStoreReport.sanitizedStatus
    },
    {
      stageName: "comment_package_scaffold",
      status: "blocked",
      blockers: input.commentSafetyGate.blockers,
      evidencePresent: {
        uploadPackage: true,
        uploadResult: input.commentPackageReport.videoIdPresent,
        affiliateUrl: input.commentPackageReport.affiliateUrlPresent,
        coupangDisclosure: input.commentPackageReport.disclosurePresent,
        commentText: input.commentPackageReport.commentTextReady
      },
      hashPrefixes: {
        videoIdHashPrefix: input.commentPackageReport.videoIdHashPrefix,
        affiliateUrlHashPrefix: input.commentPackageReport.affiliateUrlHashPrefix
      },
      sanitizedStatus: input.commentPackageReport.commentWriteAllowed ? "unexpected-ready" : "blocked"
    },
    {
      stageName: "comment_writer_evidence_gate",
      status: "blocked",
      blockers: [
        ...(input.commentEvidenceGateBlocker ? [input.commentEvidenceGateBlocker] : []),
        ...input.commentSafetyGate.blockers
      ],
      evidencePresent: {
        uploadResultStoreEvidence: input.commentPackageReport.uploadResultStatus === "uploaded_public",
        youtubeVideoIdHashPrefix: Boolean(input.commentPackageReport.videoIdHashPrefix),
        affiliateUrl: input.commentPackageReport.affiliateUrlPresent,
        coupangDisclosure: input.commentPackageReport.disclosurePresent
      },
      hashPrefixes: {
        videoIdHashPrefix: input.commentPackageReport.videoIdHashPrefix,
        affiliateUrlHashPrefix: input.commentPackageReport.affiliateUrlHashPrefix
      },
      sanitizedStatus: "comment-writer-disabled"
    },
    {
      stageName: "autopilot_scheduler_scaffold",
      status: "blocked",
      blockers: input.schedulerReport.blockers,
      evidencePresent: {
        schedulerPlan: true,
        candidates: input.schedulerReport.candidateCount > 0,
        blockedCandidates: input.schedulerReport.blockedCount > 0,
        safeToUpload: input.schedulerReport.safeToUpload
      },
      hashPrefixes: {},
      sanitizedStatus: input.schedulerReport.FINAL_STATUS
    },
    {
      stageName: "dashboard_control_scaffold",
      status: "blocked",
      blockers: input.dashboardReport.blockers,
      evidencePresent: {
        dashboardPanel: true,
        cards: input.dashboardReport.cards.length > 0,
        actionsDisabled: input.dashboardReport.actions.every((action) => action.enabled === false),
        safeToUpload: input.dashboardReport.safeToUpload
      },
      hashPrefixes: {},
      sanitizedStatus: input.dashboardReport.FINAL_STATUS
    },
    {
      stageName: "final_sanitized_report",
      status: "scaffold_only",
      blockers: input.requiredBlockers,
      evidencePresent: {
        report: true,
        fixtureOnly: true,
        externalCallsAttempted: false,
        mutationAttempted: false
      },
      hashPrefixes: {},
      sanitizedStatus: "no-upload-dry-run-completed"
    }
  ];
}

function buildRequiredBlockers(duplicateGuardSatisfied: boolean): V079RequiredBlocker[] {
  const blockers: V079RequiredBlocker[] = [
    "BLOCKED_V079_SAFE_TO_UPLOAD_FALSE",
    "BLOCKED_V079_UPLOAD_DISABLED",
    "BLOCKED_V079_COMMENT_DISABLED",
    "BLOCKED_V079_SCHEDULER_DISABLED",
    "BLOCKED_V079_FRESH_APPROVAL_MISSING",
    "BLOCKED_V079_REAL_ADAPTER_DISABLED",
    "BLOCKED_V079_MUTATION_ATTEMPT_BLOCKED",
    "BLOCKED_V079_PUBLIC_VISIBILITY_NOT_APPROVED"
  ];
  if (!duplicateGuardSatisfied) {
    blockers.push("BLOCKED_V079_DUPLICATE_GUARD_NOT_SATISFIED");
  }
  return blockers;
}

function hashEvidence(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hashPrefix(value: string) {
  return hashEvidence(value).slice(0, 10);
}
