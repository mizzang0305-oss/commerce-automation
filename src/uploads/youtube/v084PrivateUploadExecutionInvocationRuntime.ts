import {
  APPROVE_YOUTUBE_PRIVATE_UPLOAD_PILOT_1_ITEM_NO_COMMENT,
  BlockedV081PrivateUploadPilotAdapter,
  executeV081PrivateUploadPilot,
  type V081PrivateUploadPilotAdapter,
  type V081PrivateUploadPilotBlocker,
  type V081PrivateUploadPilotRequest
} from "./v081PrivateUploadPilot";
import {
  APPROVE_BUILD_V083_REAL_PRIVATE_UPLOAD_EXECUTION_ADAPTER_NO_UPLOAD,
  buildV083PrivateUploadExecutionReadiness,
  type V083PrivateUploadExecutionBlocker
} from "./v083PrivateUploadExecutionReadiness";
import {
  createV083RealPrivateUploadExecutionAdapterFactory
} from "./v083RealPrivateUploadExecutionAdapterCore";
import {
  buildV084PrivateUploadPilotInvocation,
  type V084PrivateUploadPilotInvocationRequest,
  type V084PrivateUploadPilotInvocationResult
} from "./v084PrivateUploadExecutionInvocation";

type RuntimeResolverBinderEvidence = {
  v088ResolverStatus: NonNullable<V084PrivateUploadPilotInvocationRequest["v088ResolverStatus"]>;
  v087BinderStatus: NonNullable<V084PrivateUploadPilotInvocationRequest["v087BinderStatus"]>;
  v085BinderStatus: NonNullable<V084PrivateUploadPilotInvocationRequest["v085BinderStatus"]>;
};

export type V084PrivateUploadPilotExecutionRuntimeOptions = {
  adapter?: V081PrivateUploadPilotAdapter;
};

export async function runV084PrivateUploadPilotExecution(
  request: V084PrivateUploadPilotInvocationRequest,
  options: V084PrivateUploadPilotExecutionRuntimeOptions = {}
): Promise<V084PrivateUploadPilotInvocationResult> {
  const resolverBinderEvidence = normalizeRuntimeResolverBinderEvidence(request);
  const plan = await buildV084PrivateUploadPilotInvocation({
    ...request,
    ...resolverBinderEvidence,
    dryRun: true
  });

  if (request.dryRun || plan.status !== "ready_for_private_execution") {
    return {
      ...plan,
      dryRun: request.dryRun
    };
  }

  const runtimeReadinessBlockers = buildRuntimeResolverBinderBlockers(resolverBinderEvidence);
  if (runtimeReadinessBlockers.length > 0) {
    return {
      ...plan,
      dryRun: false,
      status: "blocked",
      blockers: [...new Set([...plan.blockers, ...runtimeReadinessBlockers])],
      v083AdapterInvoked: false
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

function normalizeRuntimeResolverBinderEvidence(
  request: V084PrivateUploadPilotInvocationRequest
): RuntimeResolverBinderEvidence {
  return {
    v088ResolverStatus: request.v088ResolverStatus ?? "missing",
    v087BinderStatus: request.v087BinderStatus ?? "missing",
    v085BinderStatus: request.v085BinderStatus ?? "missing"
  };
}

function buildRuntimeResolverBinderBlockers(
  evidence: RuntimeResolverBinderEvidence
): V084PrivateUploadPilotInvocationResult["blockers"] {
  const blockers: V084PrivateUploadPilotInvocationResult["blockers"] = [];
  if (evidence.v088ResolverStatus !== "bound") {
    blockers.push("BLOCKED_V084_V088_RESOLVER_NOT_BOUND");
  }
  if (evidence.v087BinderStatus !== "ready_for_fresh_approval") {
    blockers.push("BLOCKED_V084_V087_BINDER_NOT_READY");
  }
  if (evidence.v085BinderStatus !== "ready_for_fresh_approval") {
    blockers.push("BLOCKED_V084_V085_BINDER_NOT_READY");
  }
  return blockers;
}

function createDefaultV083Adapter(request: V084PrivateUploadPilotInvocationRequest) {
  const readinessInput = {
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
  } as const;
  const readiness = buildV083PrivateUploadExecutionReadiness(readinessInput);

  return readiness.ready
    ? createV083RealPrivateUploadExecutionAdapterFactory(readinessInput).adapter
    : new BlockedV081PrivateUploadPilotAdapter();
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
