import { executeV051MutationEnabledUploads } from "../../src/uploads/multi-channel/v051MutationEnabledExecutor";

async function main() {
  const result = await executeV051MutationEnabledUploads({
    cwd: process.cwd(),
    approvalText: process.env.V051_APPROVAL_TEXT,
    executionMode: process.env.V051_EXECUTION_MODE
  });

  console.log(JSON.stringify(result, null, 2));
  if (result.FINAL_STATUS !== "SUCCESS_V053_MUTATION_ENABLED_V051_EXECUTOR_READY_NO_UPLOAD") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "v051 approval alias execute wrapper failed");
  process.exitCode = 1;
});
