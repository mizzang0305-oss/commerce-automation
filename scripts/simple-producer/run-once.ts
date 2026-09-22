import { runConfiguredSimpleProducerOnce } from "../../src/lib/simple-producer/runtime";

async function main() {
  const result = await runConfiguredSimpleProducerOnce({ cwd: process.cwd() });
  console.log(JSON.stringify({ event: "simple_producer_run_once", ...result, SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 }));
  if (result.status === "configuration_error" || result.status === "failed") process.exitCode = 2;
}

void main().catch(() => {
  console.log(JSON.stringify({ event: "simple_producer_run_once", status: "configuration_error", safeError: "SIMPLE_PRODUCER_UNEXPECTED_FAILURE", videosInsertCalls: 0, SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 }));
  process.exitCode = 2;
});
