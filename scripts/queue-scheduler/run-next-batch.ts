import { runNextBatch, QUEUE_SCHEDULER_FLAGS } from "../../src/lib/queue-scheduler";

void runNextBatch().then((result) => { console.log(JSON.stringify({ event: "queue_batch_complete", ...result, ...QUEUE_SCHEDULER_FLAGS })); if (result.run.status === "failed") process.exitCode = 2; }).catch((error: unknown) => { const value = error instanceof Error ? error.message : String(error); console.error(JSON.stringify({ event: "queue_batch_failed", safeError: /^[A-Z0-9_:-]+$/u.test(value) ? value : "QUEUE_BATCH_FAILED", ...QUEUE_SCHEDULER_FLAGS })); process.exitCode = 1; });
