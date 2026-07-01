import { buildV051UploadPreflight } from "../../src/uploads/multi-channel/v051ApprovalAliasWrapper";

async function main() {
  const result = await buildV051UploadPreflight({
    cwd: process.cwd(),
    approvalText: process.env.V051_APPROVAL_TEXT
  });

  console.log(JSON.stringify(result, null, 2));
  if (result.FINAL_STATUS !== "SUCCESS_V052_V051_APPROVAL_ALIAS_READY_NO_UPLOAD") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "v051 approval alias preflight failed");
  process.exitCode = 1;
});
