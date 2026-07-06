import {
  APPROVE_YOUTUBE_PRIVATE_UPLOAD_PILOT_1_ITEM_NO_COMMENT,
  BlockedV081PrivateUploadPilotAdapter,
  executeV081PrivateUploadPilot,
  type V081PrivateUploadPilotAdapter,
  type V081PrivateUploadPilotAdapterResult,
  type V081PrivateUploadPilotBlocker,
  type V081PrivateUploadPilotRequest
} from "./v081PrivateUploadPilot";
import {
  APPROVE_BUILD_V083_REAL_PRIVATE_UPLOAD_EXECUTION_ADAPTER_NO_UPLOAD,
  buildV083PrivateUploadExecutionReadiness,
  type V083PrivateUploadExecutionBlocker
} from "./v083PrivateUploadExecutionReadiness";
import {
  buildV084PrivateUploadPilotInvocation,
  type V084PrivateUploadPilotInvocationRequest,
  type V084PrivateUploadPilotInvocationResult
} from "./v084PrivateUploadExecutionInvocation";

export type V084PrivateUploadPilotExecutionRuntimeOptions = {
  adapter?: V081PrivateUploadPilotAdapter;
};

export async function runV084PrivateUploadPilotExecution(
  request: V084PrivateUploadPilotInvocationRequest,
  options: V084PrivateUploadPilotExecutionRuntimeOptions = {}
): Promise<V084PrivateUploadPilotInvocationResult> {
  const plan = await buildV084PrivateUploadPilotInvocation({
    ...request,
    dryRun: true
  });

  if (request.dryRun || plan.status !== "ready_for_private_execution") {
    return {
      ...plan,
      dryRun: request.dryRun
    };
  }

  const adapter = options.adapter ?? createDefaultV083Adapter(request);
  const v081Result = await executeV081PrivateUploadPilot(toV081Request(request), {
    adapter
  });
  const v083Blockers = v081Result.blockers.filter(isV083Blocker);
  const completed = v081Result.status === "private_upload_completed";

  return {
    ...plan,
    dryRun: false,
    status: completed ? "private_upload_completed" : "blocked",
    blockers: completed ? [] : ["BLOCKED_V084_V081_EXECUTION_BLOCKED"],
    v083AdapterInvoked: true,
    v083AdapterMode: adapter.mode,
    v083Blockers,
    v081ResultStatus: v081Result.status,
    v081Blockers: v081Result.blockers,
    videosInsertCalled: v081Result.videosInsertCalled,
    videosInsertTotalCount: v081Result.videosInsertTotalCount,
    commentThreadsInsertCalled: v081Result.commentThreadsInsertCalled,
    comment_create_update_delete_called: v081Result.comment_create_update_delete_called,
    scheduler_auto_execution_called: v081Result.scheduler_auto_execution_called,
    visibility_changed: v081Result.visibility_changed,
    R2_upload: v081Result.R2_upload,
    DB_write: v081Result.DB_write,
    product_assets_write: v081Result.product_assets_write,
    n8n_webhook_called: v081Result.n8n_webhook_called,
    uploadResultEvidence: v081Result.uploadResultEvidence,
    uploadResultStoreItem: v081Result.uploadResultStoreItem,
    uploadResultStoreReport: v081Result.uploadResultStoreReport,
    raw_urls_printed: v081Result.raw_urls_printed,
    raw_video_ids_printed: v081Result.raw_video_ids_printed,
    raw_channel_ids_printed: v081Result.raw_channel_ids_printed,
    secrets_printed: v081Result.secrets_printed,
    fake_success: v081Result.fake_success
  };
}

function createDefaultV083Adapter(request: V084PrivateUploadPilotInvocationRequest) {
  const readiness = buildV083PrivateUploadExecutionReadiness({
    buildApprovalPhrase: APPROVE_BUILD_V083_REAL_PRIVATE_UPLOAD_EXECUTION_ADAPTER_NO_UPLOAD,
    serverOnlyContext: request.serverOnlyContext ?? true,
    v081PilotReady: request.readiness.v081PilotReady,
    v082RuntimeAdapterReady: request.readiness.v082RuntimeAdapterReady,
    tokenProviderReady: request.readiness.tokenProviderReady,
    uploadScopeReady: request.readiness.uploadScopeReady,
    videoAssetReady: request.readiness.videoAssetReady,
    uploadPackageReady: request.readiness.uploadPackageReady,
    duplicateGuardReady: request.readiness.duplicateGuardReady,
    disclosureGuardReady: request.readiness.disclosureGuardReady,
    affiliateEvidenceReady: request.readiness.affiliateEvidenceReady,
    targetChannelEvidenceReady: request.readiness.targetChannelEvidenceReady,
    requestedVisibility: "private",
    maxItems: 1,
    commentAutomationRequested: false,
    schedulerExecutionRequested: false
  });

  return readiness.ready
    ? new NoUploadV083RealCandidateAdapter()
    : new BlockedV081PrivateUploadPilotAdapter();
}

class NoUploadV083RealCandidateAdapter implements V081PrivateUploadPilotAdapter {
  readonly mode = "real_candidate" as const;

  async uploadPrivatePilot(): Promise<V081PrivateUploadPilotAdapterResult> {
    return {
      status: "BLOCKED",
      blocker: "BLOCKED_V083_REAL_UPLOAD_EXECUTION_NOT_ALLOWED_IN_THIS_PR",
      youtubeVideoId: null,
      channelId: null,
      uploadedAt: null,
      videosInsertCalled: false,
      videosInsertTotalCount: 0,
      commentThreadsInsertCalled: false,
      fakeSuccess: false,
      rawUrlsPrinted: false,
      rawVideoIdsPrinted: false,
      rawChannelIdsPrinted: false,
      secretsPrinted: false
    };
  }
}

function toV081Request(
  request: V084PrivateUploadPilotInvocationRequest
): V081PrivateUploadPilotRequest {
  return {
    queueItemId: request.queueItemId ?? "",
    uploadPackageId: request.uploadPackageId ?? "",
    channelKey: request.channelKey ?? "father_jobs",
    visibility: request.visibility,
    approvalPhrase: request.approvalPhrase ?? APPROVE_YOUTUBE_PRIVATE_UPLOAD_PILOT_1_ITEM_NO_COMMENT,
    commentAutomationAllowed: request.commentAutomationAllowed,
    schedulerExecutionAllowed: request.schedulerExecutionAllowed,
    maxItems: request.maxItems,
    targetChannelId: null,
    rawCoupangUrl: null,
    selectedAffiliateUrl: null,
    videoAssetHashPrefix: request.videoAssetHashPrefix ?? null,
    generatedAt: request.generatedAt ?? new Date(0).toISOString(),
    readiness: {
      oauthReady: request.readiness.v082RuntimeAdapterReady,
      tokenProviderReady: request.readiness.tokenProviderReady,
      videoAssetReady: request.readiness.videoAssetReady,
      uploadPackageReady: request.readiness.uploadPackageReady,
      affiliateUrlEvidenceReady: request.readiness.affiliateEvidenceReady,
      coupangDisclosureReady: request.readiness.disclosureGuardReady,
      duplicateGuardReady: request.readiness.duplicateGuardReady,
      targetChannelReady: request.readiness.targetChannelEvidenceReady,
      metadataReady: request.readiness.metadataReady,
      quotaReady: request.readiness.quotaReady
    }
  };
}

function isV083Blocker(
  value: V081PrivateUploadPilotBlocker
): value is Extract<V081PrivateUploadPilotBlocker, V083PrivateUploadExecutionBlocker> {
  return value.startsWith("BLOCKED_V083_");
}
