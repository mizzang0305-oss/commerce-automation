import path from "node:path";
import { fileURLToPath } from "node:url";

import { executeV051MutationEnabledUploads } from "../../src/uploads/multi-channel/v051MutationEnabledExecutor";
import { createV054RuntimeYouTubeAdapters } from "../../src/uploads/multi-channel/v054RuntimeYouTubeAdapterFactory";
import type { V057AffiliateUrlLoadResult } from "../../src/uploads/multi-channel/v057AffiliateUrlInjectionGate";
import {
  resolveV066CoupangDeeplinkAffiliateBridge,
  type V066AffiliateBridgeResult
} from "../../src/uploads/multi-channel/v066CoupangDeeplinkAffiliateBridge";

export async function buildV051ExecutionInputFromEnv(input: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
} = {}): Promise<{
  cwd: string;
  executionMode: string | undefined;
  uploadAssetProfile: string | null | undefined;
  approvalText: string | undefined;
  affiliateUrls: V057AffiliateUrlLoadResult["affiliateUrls"];
  affiliateUrlGate: V057AffiliateUrlLoadResult;
  affiliateUrlBridge: V066AffiliateBridgeResult;
}> {
  const cwd = input.cwd ?? process.cwd();
  const env = input.env ?? process.env;
  const executionMode = env.V051_EXECUTION_MODE;
  const uploadAssetProfile = executionMode === "mutation_enabled"
    ? env.V051_UPLOAD_ASSET_PROFILE ?? null
    : env.V051_UPLOAD_ASSET_PROFILE;
  const affiliateUrlBridge = await resolveV066CoupangDeeplinkAffiliateBridge({
    cwd,
    env,
    fetchImpl: input.fetchImpl
  });
  const affiliateUrlGate = {
    affiliateUrls: affiliateUrlBridge.affiliateUrls,
    report: affiliateUrlBridge.report.v063_affiliate_url_gate
  };

  return {
    cwd,
    executionMode,
    uploadAssetProfile,
    approvalText: env.V051_APPROVAL_TEXT,
    affiliateUrls: affiliateUrlBridge.affiliateUrls,
    affiliateUrlGate,
    affiliateUrlBridge
  };
}

async function main() {
  const executionInput = await buildV051ExecutionInputFromEnv();
  if (!executionInput.affiliateUrlBridge.report.affiliate_url_bridge_ready) {
    console.log(JSON.stringify({
      FINAL_STATUS: "BLOCKED_V066_COUPANG_DEEPLINK_AFFILIATE_BRIDGE",
      SAFE_TO_UPLOAD: false,
      affiliate_url_bridge: executionInput.affiliateUrlBridge.report,
      youtube_execute_called: false,
      videos_insert_called: false,
      videos_insert_total_count: 0,
      comment_create_update_delete_called: false,
      comment_create_total_count: 0,
      visibility_changed: false,
      R2_upload: false,
      product_assets_write: false,
      DB_write: false,
      raw_urls_printed: false,
      secrets_printed: false,
      fake_success: false
    }, null, 2));
    process.exitCode = 1;
    return;
  }
  const runtimeFactory = executionInput.executionMode === "mutation_enabled"
    ? await createV054RuntimeYouTubeAdapters({
      cwd: executionInput.cwd,
      affiliateUrls: executionInput.affiliateUrls
    })
    : null;
  const result = await executeV051MutationEnabledUploads({
    cwd: executionInput.cwd,
    approvalText: executionInput.approvalText,
    executionMode: executionInput.executionMode,
    uploadAssetProfile: executionInput.uploadAssetProfile,
    affiliateUrls: executionInput.affiliateUrls,
    adapters: runtimeFactory?.adapters,
    safetyOverrides: runtimeFactory?.safetyOverrides
  });

  console.log(JSON.stringify(result, null, 2));
  if (
    result.FINAL_STATUS !== "SUCCESS_V053_MUTATION_ENABLED_V051_EXECUTOR_READY_NO_UPLOAD" &&
    result.FINAL_STATUS !== "SUCCESS_V051_THREE_CHANNEL_PUBLIC_UPLOADS_DONE"
  ) {
    process.exitCode = 1;
  }
}

if (isDirectExecution()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "v051 approval alias execute wrapper failed");
    process.exitCode = 1;
  });
}

function isDirectExecution() {
  const currentFile = fileURLToPath(import.meta.url);
  return process.argv.slice(1).some((arg) => path.resolve(arg) === currentFile);
}
