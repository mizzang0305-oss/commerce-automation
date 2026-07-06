import {
  buildV084PrivateUploadPilotInvocationFromEnv
} from "../../src/uploads/youtube/v084PrivateUploadExecutionInvocation";
import {
  runV084PrivateUploadPilotExecution
} from "../../src/uploads/youtube/v084PrivateUploadExecutionInvocationRuntime";

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = !args.has("--execute");
  const plan = await buildV084PrivateUploadPilotInvocationFromEnv({
    env: process.env,
    dryRun: true
  });
  const result = dryRun
    ? plan
    : await runV084PrivateUploadPilotExecution({
      mode: "private_upload_pilot_invocation",
      dryRun: false,
      serverOnlyContext: plan.v083AdapterAvailable,
      v083AdapterAvailable: plan.v083AdapterAvailable,
      v088ResolverStatus: readV088ResolverStatus(process.env.V084_V088_RESOLVER_STATUS),
      v087BinderStatus: readBinderStatus(process.env.V084_V087_BINDER_STATUS),
      v085BinderStatus: readBinderStatus(process.env.V084_V085_BINDER_STATUS),
      queueItemId: plan.queueItemIdPresent ? process.env.V084_QUEUE_ITEM_ID ?? "" : "",
      uploadPackageId: plan.uploadPackageIdPresent ? process.env.V084_UPLOAD_PACKAGE_ID ?? "" : "",
      channelKey: plan.channelKey,
      visibility: plan.requestedVisibility,
      maxItems: plan.requestedMaxItems,
      approvalPhrase: process.env.V084_PRIVATE_UPLOAD_APPROVAL_PHRASE ?? null,
      commentAutomationAllowed: process.env.V084_COMMENT_AUTOMATION_ALLOWED === "true",
      schedulerExecutionAllowed: process.env.V084_SCHEDULER_EXECUTION_ALLOWED === "true",
      generatedAt: process.env.V084_GENERATED_AT,
      videoAssetHashPrefix: process.env.V084_VIDEO_ASSET_HASH_PREFIX ?? null,
      readiness: {
        v081PilotReady: plan.status === "ready_for_private_execution",
        v082RuntimeAdapterReady: plan.status === "ready_for_private_execution",
        tokenProviderReady: plan.status === "ready_for_private_execution",
        uploadScopeReady: plan.status === "ready_for_private_execution",
        videoAssetReady: plan.status === "ready_for_private_execution",
        uploadPackageReady: plan.status === "ready_for_private_execution",
        duplicateGuardReady: plan.status === "ready_for_private_execution",
        disclosureGuardReady: plan.status === "ready_for_private_execution",
        affiliateEvidenceReady: plan.status === "ready_for_private_execution",
        targetChannelEvidenceReady: plan.status === "ready_for_private_execution",
        metadataReady: plan.status === "ready_for_private_execution",
        quotaReady: plan.status === "ready_for_private_execution"
      }
    });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function readV088ResolverStatus(value: string | undefined) {
  return value === "bound" || value === "blocked" ? value : "missing";
}

function readBinderStatus(value: string | undefined) {
  return value === "ready_for_fresh_approval" || value === "blocked" || value === "not_run"
    ? value
    : "missing";
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown_error";
  process.stdout.write(`${JSON.stringify({
    version: "v084",
    status: "blocked",
    mode: "private_upload_pilot_invocation",
    dryRun: true,
    executionAllowed: false,
    blockers: ["BLOCKED_V084_UNSAFE_REPORT_REQUESTED"],
    safeMessage: message ? "V084 invocation failed before upload." : "V084 invocation failed.",
    videosInsertCalled: false,
    commentThreadsInsertCalled: false,
    raw_urls_printed: false,
    raw_video_ids_printed: false,
    raw_channel_ids_printed: false,
    secrets_printed: false,
    fake_success: false
  }, null, 2)}\n`);
  process.exitCode = 1;
});
