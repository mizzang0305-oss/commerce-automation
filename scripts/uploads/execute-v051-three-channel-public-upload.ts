import { executeV051MutationEnabledUploads } from "../../src/uploads/multi-channel/v051MutationEnabledExecutor";
import { createV054RuntimeYouTubeAdapters } from "../../src/uploads/multi-channel/v054RuntimeYouTubeAdapterFactory";

async function main() {
  const executionMode = process.env.V051_EXECUTION_MODE;
  const uploadAssetProfile = executionMode === "mutation_enabled"
    ? process.env.V051_UPLOAD_ASSET_PROFILE ?? null
    : process.env.V051_UPLOAD_ASSET_PROFILE;
  const runtimeFactory = executionMode === "mutation_enabled"
    ? await createV054RuntimeYouTubeAdapters({ cwd: process.cwd() })
    : null;
  const result = await executeV051MutationEnabledUploads({
    cwd: process.cwd(),
    approvalText: process.env.V051_APPROVAL_TEXT,
    executionMode,
    uploadAssetProfile,
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "v051 approval alias execute wrapper failed");
  process.exitCode = 1;
});
