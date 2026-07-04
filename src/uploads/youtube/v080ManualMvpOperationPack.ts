import type { V079NoUploadDryRunReport } from "./v079NoUploadDryRun";

export type V080ManualMvpMode = "manual_mvp_operation_pack";
export type V080PublicUploadApproval = "missing";
export type V080RequiredOperatorCheck =
  | "coupang_partners_disclosure_check"
  | "affiliate_url_presence_check"
  | "video_or_video_output_presence_check"
  | "blog_draft_presence_check"
  | "product_name_price_thumbnail_integrity_check"
  | "prohibited_product_check"
  | "duplicate_upload_check"
  | "youtube_title_description_pinned_comment_manual_review"
  | "operator_manual_upload_only"
  | "post_upload_state_requires_separate_approval";

export type V080ManualStepId =
  | "review_today_generation_readiness"
  | "review_queue_item_readiness"
  | "review_content_outputs"
  | "confirm_automation_blocked"
  | "review_manual_upload_candidates"
  | "confirm_disclosure_and_affiliate_evidence"
  | "operator_performs_manual_upload"
  | "keep_post_upload_state_blocked_until_fresh_approval";

export type V080ReleaseGateBlocker =
  | "BLOCKED_V080_SAFE_TO_UPLOAD_FALSE"
  | "BLOCKED_V080_PUBLIC_UPLOAD_APPROVAL_MISSING"
  | "BLOCKED_V080_COMMENT_AUTOMATION_APPROVAL_MISSING"
  | "BLOCKED_V080_SCHEDULER_EXECUTION_APPROVAL_MISSING"
  | "BLOCKED_V080_REAL_ADAPTER_DISABLED"
  | "BLOCKED_V080_MUTATION_ATTEMPT_BLOCKED"
  | "BLOCKED_V080_N8N_LIVE_EXECUTION_NOT_APPROVED"
  | "BLOCKED_V080_SECRETS_NOT_EXPOSED_BY_DESIGN"
  | "BLOCKED_V080_NO_UPLOAD_DRY_RUN_NOT_PASSED";

export type V080ManualStep = {
  stepId: V080ManualStepId;
  label: string;
  required: true;
  automationActionAllowed: false;
};

export type V080ManualMvpOperationInput = {
  reportId: string;
  generatedAt: string;
  noUploadDryRunReport: V079NoUploadDryRunReport;
};

export type V080ManualMvpOperationReport = {
  version: "v080";
  FINAL_STATUS: "V080_MANUAL_MVP_OPERATION_PACK_READY_NO_UPLOAD";
  reportId: string;
  generatedAt: string;
  mode: V080ManualMvpMode;
  safeToUpload: false;
  publicUploadApproval: V080PublicUploadApproval;
  automationExecutionAllowed: false;
  manualOperationAllowed: true;
  noUploadDryRunPassed: boolean;
  dashboardControlReady: boolean;
  schedulerScaffoldReady: boolean;
  uploadResultStoreReady: boolean;
  commentWriterScaffoldReady: boolean;
  requiredOperatorChecks: V080RequiredOperatorCheck[];
  blockers: V080ReleaseGateBlocker[];
  manualSteps: V080ManualStep[];
  releaseGate: {
    noUploadMvpReady: boolean;
    publicUploadBlocked: true;
    commentAutomationBlocked: true;
    schedulerExecutionBlocked: true;
  };
  redactionProof: {
    rawUrlsPrinted: false;
    rawVideoIdsPrinted: false;
    rawChannelIdsPrinted: false;
    secretsPrinted: false;
    fakeSuccess: false;
  };
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

export function buildV080ManualMvpOperationReport(
  input: V080ManualMvpOperationInput
): V080ManualMvpOperationReport {
  const noUploadDryRunPassed = isNoUploadDryRunPassed(input.noUploadDryRunReport);
  const dashboardControlReady = hasStage(input.noUploadDryRunReport, "dashboard_control_scaffold");
  const schedulerScaffoldReady = hasStage(input.noUploadDryRunReport, "autopilot_scheduler_scaffold");
  const uploadResultStoreReady = hasStage(input.noUploadDryRunReport, "upload_result_store_scaffold");
  const commentWriterScaffoldReady = hasStage(input.noUploadDryRunReport, "comment_writer_evidence_gate") &&
    hasStage(input.noUploadDryRunReport, "comment_package_scaffold");
  const noUploadMvpReady = Boolean(
    noUploadDryRunPassed &&
    dashboardControlReady &&
    schedulerScaffoldReady &&
    uploadResultStoreReady &&
    commentWriterScaffoldReady
  );

  return {
    version: "v080",
    FINAL_STATUS: "V080_MANUAL_MVP_OPERATION_PACK_READY_NO_UPLOAD",
    reportId: input.reportId,
    generatedAt: input.generatedAt,
    mode: "manual_mvp_operation_pack",
    safeToUpload: false,
    publicUploadApproval: "missing",
    automationExecutionAllowed: false,
    manualOperationAllowed: true,
    noUploadDryRunPassed,
    dashboardControlReady,
    schedulerScaffoldReady,
    uploadResultStoreReady,
    commentWriterScaffoldReady,
    requiredOperatorChecks: buildRequiredOperatorChecks(),
    blockers: buildBlockers(noUploadDryRunPassed),
    manualSteps: buildManualSteps(),
    releaseGate: {
      noUploadMvpReady,
      publicUploadBlocked: true,
      commentAutomationBlocked: true,
      schedulerExecutionBlocked: true
    },
    redactionProof: {
      rawUrlsPrinted: false,
      rawVideoIdsPrinted: false,
      rawChannelIdsPrinted: false,
      secretsPrinted: false,
      fakeSuccess: false
    },
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

function isNoUploadDryRunPassed(report: V079NoUploadDryRunReport) {
  return Boolean(
    report.FINAL_STATUS === "NO_UPLOAD_DRY_RUN_COMPLETED" &&
    report.mode === "no_upload_dry_run" &&
    report.fixtureOnly &&
    report.safeToUpload === false &&
    report.safeToComment === false &&
    report.externalCallsAttempted === false &&
    report.uploadMutationAttempted === false &&
    report.commentMutationAttempted === false &&
    report.schedulerExecutionAttempted === false &&
    report.dashboardActionMutationAttempted === false &&
    report.redactionProof.rawUrlsPrinted === false &&
    report.redactionProof.rawVideoIdsPrinted === false &&
    report.redactionProof.rawChannelIdsPrinted === false &&
    report.redactionProof.secretsPrinted === false &&
    report.redactionProof.fakeSuccess === false &&
    Object.values(report.connections).every(Boolean)
  );
}

function hasStage(
  report: V079NoUploadDryRunReport,
  stageName: V079NoUploadDryRunReport["pipelineStages"][number]["stageName"]
) {
  return report.pipelineStages.some((stage) => stage.stageName === stageName);
}

function buildRequiredOperatorChecks(): V080RequiredOperatorCheck[] {
  return [
    "coupang_partners_disclosure_check",
    "affiliate_url_presence_check",
    "video_or_video_output_presence_check",
    "blog_draft_presence_check",
    "product_name_price_thumbnail_integrity_check",
    "prohibited_product_check",
    "duplicate_upload_check",
    "youtube_title_description_pinned_comment_manual_review",
    "operator_manual_upload_only",
    "post_upload_state_requires_separate_approval"
  ];
}

function buildBlockers(noUploadDryRunPassed: boolean): V080ReleaseGateBlocker[] {
  return [
    "BLOCKED_V080_SAFE_TO_UPLOAD_FALSE",
    "BLOCKED_V080_PUBLIC_UPLOAD_APPROVAL_MISSING",
    "BLOCKED_V080_COMMENT_AUTOMATION_APPROVAL_MISSING",
    "BLOCKED_V080_SCHEDULER_EXECUTION_APPROVAL_MISSING",
    "BLOCKED_V080_REAL_ADAPTER_DISABLED",
    "BLOCKED_V080_MUTATION_ATTEMPT_BLOCKED",
    "BLOCKED_V080_N8N_LIVE_EXECUTION_NOT_APPROVED",
    "BLOCKED_V080_SECRETS_NOT_EXPOSED_BY_DESIGN",
    ...(noUploadDryRunPassed ? [] : ["BLOCKED_V080_NO_UPLOAD_DRY_RUN_NOT_PASSED" as const])
  ];
}

function buildManualSteps(): V080ManualStep[] {
  return [
    {
      stepId: "review_today_generation_readiness",
      label: "Review today's generation readiness",
      required: true,
      automationActionAllowed: false
    },
    {
      stepId: "review_queue_item_readiness",
      label: "Review queue item readiness",
      required: true,
      automationActionAllowed: false
    },
    {
      stepId: "review_content_outputs",
      label: "Review video output and blog draft evidence",
      required: true,
      automationActionAllowed: false
    },
    {
      stepId: "confirm_automation_blocked",
      label: "Confirm upload, comment, scheduler, and webhook automation remains blocked",
      required: true,
      automationActionAllowed: false
    },
    {
      stepId: "review_manual_upload_candidates",
      label: "Review only candidates that an operator could manually upload",
      required: true,
      automationActionAllowed: false
    },
    {
      stepId: "confirm_disclosure_and_affiliate_evidence",
      label: "Confirm disclosure and affiliate evidence exists without exposing raw links",
      required: true,
      automationActionAllowed: false
    },
    {
      stepId: "operator_performs_manual_upload",
      label: "Operator performs any upload manually outside automation",
      required: true,
      automationActionAllowed: false
    },
    {
      stepId: "keep_post_upload_state_blocked_until_fresh_approval",
      label: "Keep post-upload state changes blocked until separate fresh approval",
      required: true,
      automationActionAllowed: false
    }
  ];
}
