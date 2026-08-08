import { getQueueSchedulerStatus } from "../../src/lib/queue-scheduler";

void getQueueSchedulerStatus().then((status) => console.log(JSON.stringify(status, null, 2))).catch((error: unknown) => { console.error(JSON.stringify({ safeError: error instanceof Error ? error.message : "QUEUE_STATUS_FAILED", SAFE_TO_UPLOAD: false })); process.exitCode = 1; });
