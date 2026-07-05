import "server-only";

import {
  buildV084PrivateUploadPilotInvocation,
  type V084PrivateUploadPilotInvocationRequest,
  type V084PrivateUploadPilotInvocationResult
} from "./v084PrivateUploadExecutionInvocation";
import {
  createV083RealPrivateUploadExecutionAdapterFactory
} from "./v083RealPrivateUploadExecutionAdapter";

export type V084PrivateUploadPilotServerExecutionWiring = {
  version: "v084-server";
  invocation: V084PrivateUploadPilotInvocationResult;
  v083AdapterMode: "blocked" | "mock" | "real_candidate" | null;
  executionAllowed: false;
  videos_insert_called: false;
  commentThreads_insert_called: false;
  scheduler_executed: false;
  visibility_changed: false;
  raw_urls_printed: false;
  raw_video_ids_printed: false;
  raw_channel_ids_printed: false;
  secrets_printed: false;
  fake_success: false;
};

export async function buildV084PrivateUploadPilotServerExecutionWiring(
  request: V084PrivateUploadPilotInvocationRequest
): Promise<V084PrivateUploadPilotServerExecutionWiring> {
  const invocation = await buildV084PrivateUploadPilotInvocation(request);
  const factory = invocation.status === "ready_for_private_execution"
    ? createV083RealPrivateUploadExecutionAdapterFactory({
      buildApprovalPhrase: "APPROVE_BUILD_V083_REAL_PRIVATE_UPLOAD_EXECUTION_ADAPTER_NO_UPLOAD",
      serverOnlyContext: true,
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
    })
    : null;

  return {
    version: "v084-server",
    invocation,
    v083AdapterMode: factory?.adapter.mode ?? null,
    executionAllowed: false,
    videos_insert_called: false,
    commentThreads_insert_called: false,
    scheduler_executed: false,
    visibility_changed: false,
    raw_urls_printed: false,
    raw_video_ids_printed: false,
    raw_channel_ids_printed: false,
    secrets_printed: false,
    fake_success: false
  };
}
