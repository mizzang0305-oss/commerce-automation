import { atomicWriteJson } from "../../src/lib/queue-scheduler/atomicJson";
import { inspectQueueVideoRuntime, LocalQueueRepository, QUEUE_SCHEDULER_FLAGS } from "../../src/lib/queue-scheduler";

void (async () => {
  const repository = new LocalQueueRepository();
  const result = await inspectQueueVideoRuntime();
  await atomicWriteJson(`${repository.root}/runtime-ready.json`, result);
  console.log(JSON.stringify({ event: "queue_runtime_preflight", ...result, ...QUEUE_SCHEDULER_FLAGS }));
  if (!result.ready) process.exitCode = 3;
})().catch(() => { console.error(JSON.stringify({ event: "queue_runtime_preflight_failed", safeError: "RUNTIME_PREFLIGHT_FAILED", ...QUEUE_SCHEDULER_FLAGS })); process.exitCode = 3; });
