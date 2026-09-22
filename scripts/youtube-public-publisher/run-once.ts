import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { runConfiguredYouTubePublicPublisherOnce, type ConfiguredPublisherRunResult } from "@/lib/youtube-public-publisher/runtime";

export function publisherRunExitCode(result: Pick<ConfiguredPublisherRunResult, "status">) {
  return result.status === "uploaded" || result.status === "no_ready_job" || result.status === "disabled" ? 0 : 2;
}

export async function main() {
  try {
    const result = await runConfiguredYouTubePublicPublisherOnce();
    process.stdout.write(`${JSON.stringify({
      schema_version: 1,
      publisher: "youtube_public_run_once",
      status: result.status,
      job_id: result.jobId,
      safe_error: result.safeError,
      videos_insert_calls: result.videosInsertCalls,
      canaries_imported: result.canariesImported
    })}\n`);
    process.exitCode = publisherRunExitCode(result);
  } catch {
    process.stdout.write(`${JSON.stringify({
      schema_version: 1,
      publisher: "youtube_public_run_once",
      status: "runtime_error",
      safe_error: "YOUTUBE_PUBLIC_PUBLISHER_RUNTIME_FAILURE",
      videos_insert_calls: 0
    })}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main();
}
