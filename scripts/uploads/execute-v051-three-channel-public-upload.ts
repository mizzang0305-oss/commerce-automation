import { executeV051ThreeChannelPublicUploads } from "../../src/uploads/multi-channel/v051ApprovalAliasWrapper";

async function main() {
  const result = await executeV051ThreeChannelPublicUploads({
    cwd: process.cwd(),
    approvalText: process.env.V051_APPROVAL_TEXT
  });

  console.log(JSON.stringify(result, null, 2));
  if (result.FINAL_STATUS !== "SUCCESS_V052_V051_APPROVAL_ALIAS_READY_NO_UPLOAD") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "v051 approval alias execute wrapper failed");
  process.exitCode = 1;
});
