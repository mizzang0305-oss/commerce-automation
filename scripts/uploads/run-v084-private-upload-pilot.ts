import {
  buildV084PrivateUploadPilotInvocation,
  buildV084PrivateUploadPilotInvocationRequestFromEnv
} from "../../src/uploads/youtube/v084PrivateUploadExecutionInvocation";
import {
  runV084PrivateUploadPilotExecution
} from "../../src/uploads/youtube/v084PrivateUploadExecutionInvocationRuntime";

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = !args.has("--execute");
  const request = await buildV084PrivateUploadPilotInvocationRequestFromEnv({
    env: process.env,
    dryRun
  });
  const result = dryRun
    ? await buildV084PrivateUploadPilotInvocation(request)
    : await runV084PrivateUploadPilotExecution(request);

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
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
