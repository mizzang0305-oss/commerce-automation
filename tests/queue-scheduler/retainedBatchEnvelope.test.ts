import { describe, expect, it } from "vitest";
import { createRetainedBatchEnvelope, RETAINED_BATCH_RESULT_SCHEMA } from "../../src/lib/queue-scheduler";

describe("retained batch result envelope", () => {
  it("emits one bounded versioned reconciliation record without product or path data", () => {
    const input = {
      run: { runId: "batch-20260903040004", status: "success" as const, claimed: 3, completed: 3, blocked: 0, failed: 0, retried: 0 },
      terminalResults: [
        { queueId: "queue-001", productName: "한글 상품", finalVideo: "C:\\private\\상품.mp4", password: "do-not-retain" },
        { queueId: "queue-002", Authorization: "Bearer do-not-retain" },
        { queueId: "queue-003", token: "do-not-retain" },
      ],
    };
    const envelope = createRetainedBatchEnvelope(input);
    const serialized = JSON.stringify(envelope);
    expect(JSON.parse(serialized)).toEqual(envelope);
    expect(envelope).toMatchObject({
      schemaVersion: RETAINED_BATCH_RESULT_SCHEMA,
      event: "queue_batch_complete",
      status: "success",
      claimed: 3,
      completed: 3,
      results: [{ queueId: "queue-001" }, { queueId: "queue-002" }, { queueId: "queue-003" }],
      SAFE_TO_UPLOAD: false,
      PLATFORM_UPLOAD: 0,
    });
    expect(serialized).not.toMatch(/한글 상품|private|password|Authorization|token|do-not-retain/u);
    expect(Buffer.byteLength(serialized, "utf8")).toBeLessThan(2_000);
  });

  it("uses only terminal logical results after a reserve fallback", () => {
    const envelope = createRetainedBatchEnvelope({
      run: { runId: "batch-20260903050003", status: "success", claimed: 3, completed: 3, blocked: 0, failed: 0, retried: 0 },
      terminalResults: [{ queueId: "replacement-001" }, { queueId: "queue-002" }, { queueId: "queue-003" }],
    });
    expect(envelope.results).toEqual([{ queueId: "replacement-001" }, { queueId: "queue-002" }, { queueId: "queue-003" }]);
    expect(new Set(envelope.results.map((result) => result.queueId)).size).toBe(envelope.run.claimed);
  });

  it.each([
    { terminalResults: [{ queueId: "queue-001" }], error: "RETAINED_BATCH_RESULT_CARDINALITY_INVALID" },
    { terminalResults: [{ queueId: "queue-001" }, { queueId: "queue-001" }, { queueId: "queue-003" }], error: "RETAINED_BATCH_RESULT_CARDINALITY_INVALID" },
    { terminalResults: [{ queueId: "queue-001" }, { queueId: "../unsafe" }, { queueId: "queue-003" }], error: "RETAINED_BATCH_QUEUE_ID_INVALID" },
  ])("fails closed for invalid reconciliation identities", ({ terminalResults, error }) => {
    expect(() => createRetainedBatchEnvelope({
      run: { runId: "batch-20260903060003", status: "success", claimed: 3, completed: 3, blocked: 0, failed: 0, retried: 0 },
      terminalResults,
    })).toThrow(error);
  });

  it("rejects counters that do not reconcile to the claimed logical results", () => {
    expect(() => createRetainedBatchEnvelope({
      run: { runId: "batch-20260903060003", status: "success", claimed: 3, completed: 2, blocked: 0, failed: 0, retried: 0 },
      terminalResults: [{ queueId: "queue-001" }, { queueId: "queue-002" }, { queueId: "queue-003" }],
    })).toThrow("RETAINED_BATCH_COUNTER_CARDINALITY_INVALID");
  });
});
