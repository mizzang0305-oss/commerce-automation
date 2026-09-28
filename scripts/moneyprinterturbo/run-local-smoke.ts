import { MoneyPrinterTurboClient } from "../../src/lib/moneyprinterturbo";

async function main() {
  const baseUrl = process.env.MPT_BASE_URL?.trim() ?? "";
  const topic = process.env.MPT_SMOKE_TOPIC?.trim() || process.argv.slice(2).join(" ").trim();

  if (!baseUrl) throw new Error("MPT_BASE_URL_REQUIRED");
  if (!topic) throw new Error("MPT_SMOKE_TOPIC_REQUIRED");

  const client = new MoneyPrinterTurboClient({
    baseUrl,
    apiKey: process.env.MPT_API_KEY
  });

  const taskId = await client.createVideo({ subject: topic });
  const task = await client.waitForVideo(taskId, {
    pollMs: readPositiveInt(process.env.MPT_POLL_MS, 2_000),
    maxWaitMs: readPositiveInt(process.env.MPT_MAX_WAIT_MS, 10 * 60_000)
  });

  process.stdout.write(JSON.stringify({
    status: "PASS_LOCAL_MPT_GENERATION",
    taskId: task.taskId,
    progress: task.progress,
    videos: task.videos,
    combinedVideos: task.combinedVideos,
    publicUploadAttempted: false,
    coupangApiCallAttempted: false
  }, null, 2) + "\n");
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

main().catch((error) => {
  const raw = error instanceof Error ? error.message : String(error);
  const safeError = /^[A-Z0-9_:-]+$/u.test(raw) ? raw : "MPT_SMOKE_FAILED";
  process.stderr.write(JSON.stringify({
    status: "FAIL_LOCAL_MPT_GENERATION",
    safeError,
    publicUploadAttempted: false,
    coupangApiCallAttempted: false
  }, null, 2) + "\n");
  process.exitCode = 1;
});
