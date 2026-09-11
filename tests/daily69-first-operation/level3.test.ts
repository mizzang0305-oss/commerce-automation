import { describe, expect, it } from "vitest";
import {
  normalizeFirstOperationLifecycleStatus,
  validateLevel3Completion,
  type Level3CompletionInput,
} from "../../src/lib/daily69-first-operation/level3";

describe("Daily69 Level3 completion matrix", () => {
  it("passes only when dynamic expected counts and retained natural evidence are exact", () => {
    const matrix = validateLevel3Completion(completeInput());
    expect(matrix.completion).toBe("PASS");
    expect(matrix.failed).toBe(0);
    expect(matrix.unproven).toBe(0);
    expect(matrix).toMatchObject({ terminalState: "CLEAN_COMPLETE", perfectDay: true });
  });

  it("accepts an honest terminal day with blocked items without treating it as a perfect day", () => {
    const input = completeInput();
    input.queue.ready = 10;
    input.queue.blocked = 2;
    input.queue.codexReviews = 10;
    input.queue.directReviewBindings = 7;
    input.retainedEvidence!.media = {
      ...input.retainedEvidence!.media,
      validVideoArtifacts: 10,
      missingVideoArtifacts: 2,
      machineQaPassed: 10,
      finalQaPassed: 10,
      codexReviewBindings: 10,
      exactVideoHashBindings: 10,
      directReviewBindings: 7,
    };
    input.retainedEvidence!.runs.completed = 7;
    input.retainedEvidence!.runs.blocked = 2;
    const matrix = validateLevel3Completion(input);
    expect(matrix).toMatchObject({ completion: "PASS", terminalState: "COMPLETE_WITH_BLOCKED_ITEMS", perfectDay: false, failed: 0, unproven: 0 });
  });

  it("accepts explicit functional-shadow provenance without claiming natural task events", () => {
    const input = completeInput();
    input.executionMode = "functional_shadow";
    input.naturalExecution = null;
    const matrix = validateLevel3Completion(input);
    expect(matrix).toMatchObject({ completion: "PASS", terminalState: "CLEAN_COMPLETE" });
    expect(matrix.gates.find((gate) => gate.id === "functional_execution")).toMatchObject({ state: "PASS" });
    expect(matrix.gates.some((gate) => gate.id === "natural_execution")).toBe(false);
  });

  it("keeps absent Sheets and natural task-event evidence pending and unproven", () => {
    const input = completeInput();
    input.retainedEvidence = null;
    input.naturalExecution = null;
    input.pointer = { state: "MISSING", reason: "DAILY69_ACTIVE_POINTER_MISSING" };
    const matrix = validateLevel3Completion(input);
    expect(matrix.completion).toBe("PENDING");
    expect(matrix.gates.find((gate) => gate.id === "sheets_exact")?.state).toBe("UNPROVEN");
    expect(matrix.gates.find((gate) => gate.id === "natural_execution")?.state).toBe("UNPROVEN");
  });

  it("uses exact prearm materialization capacity after valid reserve fallbacks are consumed", () => {
    const input = completeInput();
    input.materializationCapacityRequired = true;
    input.materializationCapacity = {
      activeTotal: input.expected.total,
      activeMaterializable: input.expected.total,
      activeBlocked: 0,
      reserveTotal: input.expected.reserve,
      reserveMaterializable: input.expected.reserve,
      reserveBlocked: 0,
      requiredActive: input.expected.total,
      requiredReserve: input.expected.reserve,
      blockedQueueIds: [],
      blockedProductKeys: [],
      blockedEvidenceTypes: [],
      safeReasonCodes: [],
      pass: true,
      safeCode: "",
      SAFE_TO_UPLOAD: false,
      PLATFORM_UPLOAD: 0,
      observedDistinct: input.expected.distinct,
      reserveConsumed: input.expected.reserve - 1,
      reserveConsumptionReconciled: input.expected.reserve - 1,
    };
    input.queue.reserve = 1;
    input.queue.distinct = input.expected.total + 1;
    const matrix = validateLevel3Completion(input);
    expect(matrix.gates.find((gate) => gate.id === "capacity")).toMatchObject({ state: "PASS" });
    expect(matrix.completion).toBe("PASS");
  });

  it("retains a blocked materialization allocation as closeout telemetry", () => {
    const input = completeInput();
    input.materializationCapacityRequired = true;
    input.materializationCapacity = {
      activeTotal: input.expected.total,
      activeMaterializable: input.expected.total - 1,
      activeBlocked: 1,
      reserveTotal: input.expected.reserve,
      reserveMaterializable: input.expected.reserve,
      reserveBlocked: 0,
      requiredActive: input.expected.total,
      requiredReserve: input.expected.reserve,
      blockedQueueIds: ["queue-blocked"],
      blockedProductKeys: ["product-blocked"],
      blockedEvidenceTypes: ["unsupported"],
      safeReasonCodes: ["ALLOCATED_USAGE_ASSET_NOT_ELIGIBLE"],
      pass: false,
      safeCode: "MATERIALIZABLE_CAPACITY_SHORTFALL",
      SAFE_TO_UPLOAD: false,
      PLATFORM_UPLOAD: 0,
      observedDistinct: input.expected.distinct,
      reserveConsumed: 0,
      reserveConsumptionReconciled: 0,
    };
    const matrix = validateLevel3Completion(input);
    expect(matrix.gates.find((gate) => gate.id === "capacity")).toMatchObject({ state: "PASS", severity: "telemetry" });
    expect(matrix.completion).toBe("PASS");
  });

  it("does not turn missing closeout capacity telemetry into a terminal blocker", () => {
    const input = completeInput();
    input.materializationCapacityRequired = true;
    input.materializationCapacity = null;
    const matrix = validateLevel3Completion(input);
    expect(matrix.gates.find((gate) => gate.id === "capacity")).toMatchObject({ state: "PASS", severity: "telemetry", actual: "closeout_recomputation_missing" });
    expect(matrix.completion).toBe("PASS");
  });

  it("classifies explicit pointer, safety, and binding contradictions as failed", () => {
    const input = completeInput();
    input.pointer = { state: "MISMATCH", reason: "DAILY69_ACTIVE_POINTER_MISMATCH" };
    input.queue.duplicateRenders = 1;
    input.retainedEvidence!.safety.platformCalls = 1;
    const matrix = validateLevel3Completion(input);
    expect(matrix.completion).toBe("FAILED");
    expect(matrix.gates.filter((gate) => gate.state === "FAIL").map((gate) => gate.id)).toEqual(expect.arrayContaining(["active_pointer", "duplicate_renders", "safety_counters"]));
  });

  it("distinguishes incomplete retained evidence from explicit QA, Sheets, and run contradictions", () => {
    const pendingInput = completeInput();
    pendingInput.retainedEvidence!.media.codexReviewBindings -= 1;
    expect(validateLevel3Completion(pendingInput)).toMatchObject({ completion: "PENDING", failed: 0 });

    const invalidInput = completeInput();
    invalidInput.retainedEvidence!.media.invalidQaArtifacts = 1;
    invalidInput.retainedEvidence!.media.duplicateVideoHashes = 1;
    invalidInput.queue.staleLocks = 1;
    invalidInput.retainedEvidence!.sheets.duplicateIdentities = 1;
    invalidInput.retainedEvidence!.runs.duplicateResultIds = 1;
    invalidInput.retainedEvidence!.runs.batchClaimResultCardinalityMatched = false;
    const matrix = validateLevel3Completion(invalidInput);
    expect(matrix.completion).toBe("FAILED");
    expect(matrix.gates.filter((gate) => gate.state === "FAIL").map((gate) => gate.id)).toEqual(expect.arrayContaining(["stale_locks", "media_qa_integrity", "sheets_integrity", "run_integrity"]));
  });

  it("reads legacy closed manifests without treating pending history as successful", () => {
    expect(normalizeFirstOperationLifecycleStatus("closed", "NO_UPLOAD_DAILY69_FIRST_OPERATION_DAY_PROVEN")).toBe("closed_success");
    expect(normalizeFirstOperationLifecycleStatus("closed", "NO_UPLOAD_DAILY69_FIRST_OPERATION_DAY_CLOSEOUT_PENDING")).toBe("closed_failed");
  });
});

function completeInput(): Level3CompletionInput {
  const total = 12;
  const scheduledRemaining = 9;
  const scheduledBatchRuns = 3;
  return {
    expected: { total, prevalidatedReady: 3, scheduledRemaining, reserve: 4, distinct: 16, batchSize: 3, scheduledBatchRuns },
    binding: { namespace: "operation-2099-01-01", operationDate: "2099-01-01", expectedGitHead: "a".repeat(40) },
    lifecycleStatus: "closing",
    pointer: { state: "MATCH", reason: "" },
    queue: {
      total, ready: total, machineOnly: 0, reviewPending: 0, scheduled: 0, processing: 0, retry: 0, blocked: 0, failed: 0, skipped: 0, staleLocks: 0,
      reserve: 4, distinct: 16, unresolvedLeases: 0, duplicateRenders: 0, codexReviews: total, productBindingMismatches: 0,
      directReviewBindings: scheduledRemaining, immutableCarryForwardBindings: total - scheduledRemaining, reviewEvidenceModeConflicts: 0,
      affiliateReady: total, affiliateMissing: 0, affiliateInvalid: 0,
    },
    settings: { enabled: false, isPaused: true, uploadEnabled: false },
    retainedEvidence: {
      schemaVersion: "daily69-level3-retained-evidence-v1",
      namespace: "operation-2099-01-01",
      operationDate: "2099-01-01",
      expectedGitHead: "a".repeat(40),
      media: { validVideoArtifacts: total, missingVideoArtifacts: 0, invalidVideoArtifacts: 0, machineQaPassed: total, finalQaPassed: total, codexReviewBindings: total, exactVideoHashBindings: total, directReviewBindings: scheduledRemaining, immutableCarryForwardBindings: total - scheduledRemaining },
      sheets: { exact: true, queueRows: total, reserveRows: 4, syncRows: 1, duplicateIdentities: 0, preexistingChanged: 0, preexistingDeleted: 0, preexistingReordered: 0, snapshotHash: "b".repeat(64) },
      runs: { scheduledBatchRuns, batchResults: scheduledBatchRuns, claimed: scheduledRemaining, completed: scheduledRemaining, blocked: 0, retried: 0, failed: 0, runIdsMatched: true, batchClaimResultCardinalityMatched: true, claimedIdsObserved: scheduledRemaining, resultIdsObserved: scheduledRemaining, duplicateClaimIds: 0, duplicateResultIds: 0 },
      safety: { uploadCalls: 0, platformCalls: 0, driveCalls: 0, dbWrites: 0, r2Writes: 0 },
    },
    naturalExecution: {
      bindingMatches: true,
      taskEventCorrelation: true,
      malformedRecords: 0,
      control: { started: 2, completed: 2, correlated: 2, succeeded: 2 },
      batch: { started: scheduledBatchRuns, completed: scheduledBatchRuns, correlated: scheduledBatchRuns, succeeded: scheduledBatchRuns },
      closeout: { started: 1, completed: 1, correlated: 1, succeeded: 1 },
    },
  };
}
