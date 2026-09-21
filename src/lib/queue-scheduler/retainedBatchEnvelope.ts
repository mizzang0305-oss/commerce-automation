import { QUEUE_SCHEDULER_FLAGS, type LocalRun } from "./types";

type RetainedBatchInput = {
  run: Pick<LocalRun, "runId" | "status" | "claimed" | "completed" | "blocked" | "failed" | "retried">;
  terminalResults: Array<{ queueId: string }>;
};

export const RETAINED_BATCH_RESULT_SCHEMA = "daily69-retained-batch-result-v1" as const;
const RETAINED_BATCH_STATUSES = new Set<LocalRun["status"]>(["success", "partial", "failed", "blocked_preflight", "noop"]);

export function createRetainedBatchEnvelope(input: RetainedBatchInput) {
  const run = input.run;
  if (!/^batch-[0-9]{14}$/u.test(run.runId)) throw new Error("RETAINED_BATCH_RUN_ID_INVALID");
  if (!RETAINED_BATCH_STATUSES.has(run.status)) throw new Error("RETAINED_BATCH_STATUS_INVALID");
  for (const value of [run.claimed, run.completed, run.blocked, run.failed, run.retried]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("RETAINED_BATCH_COUNTER_INVALID");
  }
  const queueIds = input.terminalResults.map((result) => result.queueId);
  if (queueIds.some((queueId) => !/^[A-Za-z0-9:_-]{1,160}$/u.test(queueId))) throw new Error("RETAINED_BATCH_QUEUE_ID_INVALID");
  if (queueIds.length !== run.claimed || new Set(queueIds).size !== queueIds.length) {
    throw new Error("RETAINED_BATCH_RESULT_CARDINALITY_INVALID");
  }
  if (run.completed + run.blocked + run.failed + run.retried !== run.claimed) {
    throw new Error("RETAINED_BATCH_COUNTER_CARDINALITY_INVALID");
  }
  return {
    schemaVersion: RETAINED_BATCH_RESULT_SCHEMA,
    event: "queue_batch_complete" as const,
    status: run.status,
    claimed: run.claimed,
    completed: run.completed,
    blocked: run.blocked,
    failed: run.failed,
    retried: run.retried,
    run: {
      runId: run.runId,
      status: run.status,
      claimed: run.claimed,
      completed: run.completed,
      blocked: run.blocked,
      failed: run.failed,
      retried: run.retried,
    },
    results: queueIds.map((queueId) => ({ queueId })),
    ...QUEUE_SCHEDULER_FLAGS,
  };
}
