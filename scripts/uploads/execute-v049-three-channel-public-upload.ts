import { executeV049ThreeChannelPublicUploads } from "../../src/uploads/multi-channel/threeChannelUploadExecutor";

async function main() {
  const result = await executeV049ThreeChannelPublicUploads({
    cwd: process.cwd(),
    approvalText: process.env.V049_APPROVAL_TEXT
  });

  console.log(JSON.stringify(result, null, 2));
  if (result.FINAL_STATUS !== "V049_UPLOAD_PREFLIGHT_READY_NO_UPLOAD") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "v049 execute gate failed");
  process.exitCode = 1;
});
