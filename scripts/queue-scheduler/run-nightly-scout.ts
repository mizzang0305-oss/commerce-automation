import { runNightlyScout, QUEUE_SCHEDULER_FLAGS } from "../../src/lib/queue-scheduler";

const dueNow = process.argv.includes("--due-now");
void runNightlyScout({ dueNow }).then(({ run, queued }) => {
  console.log(JSON.stringify({ event: "queue_nightly_complete", run, queued: queued.map((item) => ({ rank: item.queueRank, name: item.canonicalProductName, score: item.productScore, keyword: item.sourceKeyword, scheduledAt: item.scheduledAt })), ...QUEUE_SCHEDULER_FLAGS }));
  if (run.status === "partial" || run.status === "failed") process.exitCode = 2;
}).catch((error: unknown) => { const value = error instanceof Error ? error.message : String(error); console.error(JSON.stringify({ event: "queue_nightly_failed", safeError: /^[A-Z0-9_:-]+$/u.test(value) ? value : "QUEUE_NIGHTLY_FAILED", ...QUEUE_SCHEDULER_FLAGS })); process.exitCode = 1; });
