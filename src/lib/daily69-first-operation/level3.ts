export const DAILY69_LEVEL3_RETAINED_EVIDENCE_SCHEMA = "daily69-level3-retained-evidence-v1" as const;

export type Level3Completion = "PASS" | "PENDING" | "FAILED";
export type Level3GateState = "PASS" | "UNPROVEN" | "FAIL";

export type FirstOperationLifecycleStatus =
  | "prepared"
  | "projection_verified"
  | "tasks_armed"
  | "running"
  | "closing"
  | "closed_success"
  | "closed_failed"
  | "held";

export type LegacyFirstOperationLifecycleStatus = "closed";

export type Level3RetainedEvidence = {
  schemaVersion: typeof DAILY69_LEVEL3_RETAINED_EVIDENCE_SCHEMA;
  namespace: string;
  operationDate: string;
  expectedGitHead: string;
  media: {
    validVideoArtifacts: number;
    missingVideoArtifacts: number;
    invalidVideoArtifacts: number;
    machineQaPassed: number;
    finalQaPassed: number;
    codexReviewBindings: number;
    exactVideoHashBindings: number;
    directReviewBindings: number;
    immutableCarryForwardBindings: number;
    invalidQaArtifacts?: number;
    invalidCodexReviewBindings?: number;
    duplicateVideoHashes?: number;
  };
  sheets: {
    exact: boolean;
    queueRows: number;
    reserveRows: number;
    syncRows: number;
    duplicateIdentities: number;
    preexistingChanged: number;
    preexistingDeleted: number;
    preexistingReordered: number;
    snapshotHash: string;
  };
  runs: {
    scheduledBatchRuns: number;
    batchResults: number;
    claimed: number;
    completed: number;
    failed: number;
    runIdsMatched: boolean;
    claimedIdsObserved: number;
    resultIdsObserved: number;
    duplicateClaimIds: number;
    duplicateResultIds: number;
  };
  safety: {
    uploadCalls: number;
    platformCalls: number;
    driveCalls: number;
    dbWrites: number;
    r2Writes: number;
  };
};

export type RetainedExecutionRoleSummary = {
  started: number;
  completed: number;
  correlated: number;
  succeeded: number;
};

export type RetainedExecutionSummary = {
  bindingMatches: boolean;
  taskEventCorrelation: boolean;
  malformedRecords: number;
  control: RetainedExecutionRoleSummary;
  batch: RetainedExecutionRoleSummary;
  closeout: RetainedExecutionRoleSummary;
};

export type Level3PointerObservation = {
  state: "MATCH" | "MISSING" | "MISMATCH";
  reason: string;
};

export type Level3CompletionInput = {
  expected: {
    total: number;
    prevalidatedReady: number;
    scheduledRemaining: number;
    reserve: number;
    distinct: number;
    batchSize: number;
    scheduledBatchRuns: number;
  };
  binding: {
    namespace: string;
    operationDate: string;
    expectedGitHead: string;
  };
  lifecycleStatus: FirstOperationLifecycleStatus;
  pointer: Level3PointerObservation;
  queue: {
    total: number;
    ready: number;
    machineOnly: number;
    reviewPending: number;
    scheduled: number;
    processing: number;
    retry: number;
    blocked: number;
    failed: number;
    skipped: number;
    reserve: number;
    distinct: number;
    unresolvedLeases: number;
    staleLocks: number;
    duplicateRenders: number;
    codexReviews: number;
    directReviewBindings: number;
    immutableCarryForwardBindings: number;
    reviewEvidenceModeConflicts: number;
    productBindingMismatches: number;
    affiliateReady: number;
    affiliateMissing: number;
    affiliateInvalid: number;
  };
  settings: {
    enabled: boolean;
    isPaused: boolean;
    uploadEnabled: boolean;
  };
  retainedEvidence: Level3RetainedEvidence | null;
  naturalExecution: RetainedExecutionSummary | null;
};

export type Level3Gate = {
  id: string;
  state: Level3GateState;
  expected: string;
  actual: string;
  reason: string;
  severity: "completion" | "integrity";
};

export type Level3CompletionMatrix = {
  schemaVersion: "daily69-level3-completion-matrix-v1";
  completion: Level3Completion;
  pass: number;
  unproven: number;
  failed: number;
  gates: Level3Gate[];
  blockers: string[];
  SAFE_TO_UPLOAD: false;
  PLATFORM_UPLOAD: 0;
};

export function normalizeFirstOperationLifecycleStatus(
  status: FirstOperationLifecycleStatus | LegacyFirstOperationLifecycleStatus | undefined,
  decision?: string,
): FirstOperationLifecycleStatus {
  if (status === "closed") {
    return decision === "NO_UPLOAD_DAILY69_FIRST_OPERATION_DAY_PROVEN" ? "closed_success" : "closed_failed";
  }
  return status ?? "prepared";
}

export function validateLevel3Completion(input: Level3CompletionInput): Level3CompletionMatrix {
  const gates: Level3Gate[] = [];
  const completion = (id: string, passed: boolean, expected: string, actual: unknown, reason: string) => {
    gates.push(gate(id, passed ? "PASS" : "UNPROVEN", expected, actual, reason, "completion"));
  };
  const integrity = (id: string, passed: boolean, expected: string, actual: unknown, reason: string) => {
    gates.push(gate(id, passed ? "PASS" : "FAIL", expected, actual, reason, "integrity"));
  };

  const expected = input.expected;
  completion("lifecycle", ["closing", "closed_success"].includes(input.lifecycleStatus), "closing|closed_success", input.lifecycleStatus, "DAILY69_LIFECYCLE_NOT_READY_FOR_LEVEL3");
  completion("queue_total", input.queue.total === expected.total, String(expected.total), input.queue.total, "DAILY69_QUEUE_TOTAL_INCOMPLETE");
  completion("queue_ready", input.queue.ready === expected.total, String(expected.total), input.queue.ready, "DAILY69_QUEUE_READY_INCOMPLETE");
  completion("queue_terminal", input.queue.machineOnly === 0 && input.queue.reviewPending === 0 && input.queue.scheduled === 0
    && input.queue.processing === 0 && input.queue.retry === 0 && input.queue.skipped === 0,
  "machineOnly/reviewPending/scheduled/processing/retry/skipped=0",
  `${input.queue.machineOnly}/${input.queue.reviewPending}/${input.queue.scheduled}/${input.queue.processing}/${input.queue.retry}/${input.queue.skipped}`,
  "DAILY69_QUEUE_NOT_TERMINAL");
  integrity("queue_failures", input.queue.blocked === 0 && input.queue.failed === 0, "blocked/failed=0", `${input.queue.blocked}/${input.queue.failed}`, "DAILY69_QUEUE_FAILURE_PRESENT");
  completion("capacity", input.queue.reserve >= expected.reserve && input.queue.distinct >= expected.distinct, `reserve>=${expected.reserve} distinct>=${expected.distinct}`, `${input.queue.reserve}/${input.queue.distinct}`, "DAILY69_CAPACITY_INCOMPLETE");
  integrity("leases", input.queue.unresolvedLeases === 0, "0", input.queue.unresolvedLeases, "DAILY69_UNRESOLVED_LEASES");
  integrity("stale_locks", input.queue.staleLocks === 0, "0", input.queue.staleLocks, "DAILY69_STALE_LOCK_PRESENT");
  integrity("duplicate_renders", input.queue.duplicateRenders === 0, "0", input.queue.duplicateRenders, "DAILY69_DUPLICATE_RENDERS");
  integrity("product_bindings", input.queue.productBindingMismatches === 0, "0", input.queue.productBindingMismatches, "DAILY69_PRODUCT_BINDING_MISMATCH");
  completion("codex_queue_reviews", input.queue.codexReviews === expected.total, String(expected.total), input.queue.codexReviews, "DAILY69_CODEX_REVIEW_INCOMPLETE");
  integrity("review_evidence_mode_integrity", input.queue.reviewEvidenceModeConflicts === 0,
    "direct/carry conflict=0", input.queue.reviewEvidenceModeConflicts, "DAILY69_REVIEW_EVIDENCE_MODE_CONFLICT");
  completion("review_evidence_modes", input.queue.directReviewBindings === expected.scheduledRemaining
    && input.queue.immutableCarryForwardBindings === expected.prevalidatedReady,
  `direct/carry=${expected.scheduledRemaining}/${expected.prevalidatedReady}`,
  `${input.queue.directReviewBindings}/${input.queue.immutableCarryForwardBindings}`,
  "DAILY69_REVIEW_EVIDENCE_MODE_INCOMPLETE");
  const affiliateExact = input.queue.affiliateReady === expected.total && input.queue.affiliateMissing === 0 && input.queue.affiliateInvalid === 0;
  if (input.queue.total !== expected.total) {
    completion("affiliate_bindings", false, `ready/missing/invalid=${expected.total}/0/0`, `${input.queue.affiliateReady}/${input.queue.affiliateMissing}/${input.queue.affiliateInvalid}`, "DAILY69_AFFILIATE_BINDING_UNPROVEN");
  } else {
    integrity("affiliate_bindings", affiliateExact, `ready/missing/invalid=${expected.total}/0/0`, `${input.queue.affiliateReady}/${input.queue.affiliateMissing}/${input.queue.affiliateInvalid}`, "DAILY69_AFFILIATE_BINDING_INVALID");
  }
  integrity("settings_safe", input.settings.enabled === false && input.settings.isPaused === true && input.settings.uploadEnabled === false,
    "enabled=false isPaused=true uploadEnabled=false", `${input.settings.enabled}/${input.settings.isPaused}/${input.settings.uploadEnabled}`, "DAILY69_CLOSEOUT_SETTINGS_UNSAFE");

  if (input.pointer.state === "MISMATCH") {
    gates.push(gate("active_pointer", "FAIL", "MATCH", input.pointer.state, input.pointer.reason || "DAILY69_ACTIVE_POINTER_MISMATCH", "integrity"));
  } else {
    gates.push(gate("active_pointer", input.pointer.state === "MATCH" ? "PASS" : "UNPROVEN", "MATCH", input.pointer.state,
      input.pointer.reason || "DAILY69_ACTIVE_POINTER_UNPROVEN", "completion"));
  }

  const retained = input.retainedEvidence;
  if (!retained) {
    for (const id of ["retained_binding", "media_qa_review", "sheets_exact", "run_reconciliation", "safety_counters"]) {
      gates.push(gate(id, "UNPROVEN", "retained exact evidence", "missing", "DAILY69_LEVEL3_RETAINED_EVIDENCE_MISSING", "completion"));
    }
  } else {
    integrity("retained_binding", retained.schemaVersion === DAILY69_LEVEL3_RETAINED_EVIDENCE_SCHEMA
      && retained.namespace === input.binding.namespace && retained.operationDate === input.binding.operationDate
      && retained.expectedGitHead === input.binding.expectedGitHead,
    `${DAILY69_LEVEL3_RETAINED_EVIDENCE_SCHEMA}:${input.binding.namespace}:${input.binding.operationDate}:${input.binding.expectedGitHead}`,
    `${retained.schemaVersion}:${retained.namespace}:${retained.operationDate}:${retained.expectedGitHead}`, "DAILY69_LEVEL3_RETAINED_BINDING_MISMATCH");
    integrity("media_qa_integrity", retained.media.invalidVideoArtifacts === 0 && (retained.media.invalidQaArtifacts ?? 0) === 0
      && (retained.media.invalidCodexReviewBindings ?? 0) === 0 && (retained.media.duplicateVideoHashes ?? 0) === 0,
    "invalidVideo/invalidQa/invalidCodex/duplicateHash=0/0/0/0",
    `${retained.media.invalidVideoArtifacts}/${retained.media.invalidQaArtifacts ?? 0}/${retained.media.invalidCodexReviewBindings ?? 0}/${retained.media.duplicateVideoHashes ?? 0}`,
    "DAILY69_MEDIA_QA_REVIEW_INVALID");
    completion("media_qa_review", retained.media.validVideoArtifacts === expected.total && retained.media.missingVideoArtifacts === 0
      && retained.media.machineQaPassed === expected.total && retained.media.finalQaPassed === expected.total
      && retained.media.codexReviewBindings === expected.total && retained.media.exactVideoHashBindings === expected.total
      && retained.media.directReviewBindings === expected.scheduledRemaining
      && retained.media.immutableCarryForwardBindings === expected.prevalidatedReady,
    `valid/missing/invalid/machine/final/codex/hash/direct/carry=${expected.total}/0/0/${expected.total}/${expected.total}/${expected.total}/${expected.total}/${expected.scheduledRemaining}/${expected.prevalidatedReady}`,
    `${retained.media.validVideoArtifacts}/${retained.media.missingVideoArtifacts}/${retained.media.invalidVideoArtifacts}/${retained.media.machineQaPassed}/${retained.media.finalQaPassed}/${retained.media.codexReviewBindings}/${retained.media.exactVideoHashBindings}/${retained.media.directReviewBindings}/${retained.media.immutableCarryForwardBindings}`,
    "DAILY69_MEDIA_QA_REVIEW_INCOMPLETE");
    integrity("sheets_integrity", retained.sheets.duplicateIdentities === 0 && retained.sheets.preexistingChanged === 0
      && retained.sheets.preexistingDeleted === 0 && retained.sheets.preexistingReordered === 0,
    "duplicates/drift/deleted/reordered=0/0/0/0",
    `${retained.sheets.duplicateIdentities}/${retained.sheets.preexistingChanged}/${retained.sheets.preexistingDeleted}/${retained.sheets.preexistingReordered}`,
    "DAILY69_SHEETS_INTEGRITY_INVALID");
    completion("sheets_exact", retained.sheets.exact === true && retained.sheets.queueRows === expected.total && retained.sheets.reserveRows === expected.reserve
      && retained.sheets.syncRows === 1 && /^[a-f0-9]{64}$/u.test(retained.sheets.snapshotHash),
    `exact=true rows=${expected.total}/${expected.reserve}/1 drift=0/0/0 duplicates=0 hash=sha256`,
    `${retained.sheets.exact}:${retained.sheets.queueRows}/${retained.sheets.reserveRows}/${retained.sheets.syncRows}:${retained.sheets.duplicateIdentities}/${retained.sheets.preexistingChanged}/${retained.sheets.preexistingDeleted}/${retained.sheets.preexistingReordered}:${retained.sheets.snapshotHash ? "hash" : "no-hash"}`,
    "DAILY69_SHEETS_EXACT_UNPROVEN");
    integrity("run_integrity", retained.runs.failed === 0 && retained.runs.runIdsMatched === true
      && retained.runs.duplicateClaimIds === 0 && retained.runs.duplicateResultIds === 0,
    "failed=0 runIdsMatched=true duplicateClaim/duplicateResult=0/0",
    `${retained.runs.failed}/${retained.runs.runIdsMatched}/${retained.runs.duplicateClaimIds}/${retained.runs.duplicateResultIds}`,
    "DAILY69_RUN_RECONCILIATION_INVALID");
    completion("run_reconciliation", retained.runs.scheduledBatchRuns === expected.scheduledBatchRuns && retained.runs.batchResults === expected.scheduledBatchRuns && retained.runs.claimed === expected.scheduledRemaining
      && retained.runs.completed === expected.scheduledRemaining
      && retained.runs.claimedIdsObserved === expected.scheduledRemaining && retained.runs.resultIdsObserved === expected.scheduledRemaining,
    `runs/results/claimed/completed/failed/runIdsMatched/claimedIds/resultIds/duplicateClaim/duplicateResult=${expected.scheduledBatchRuns}/${expected.scheduledBatchRuns}/${expected.scheduledRemaining}/${expected.scheduledRemaining}/0/true/${expected.scheduledRemaining}/${expected.scheduledRemaining}/0/0`,
    `${retained.runs.scheduledBatchRuns}/${retained.runs.batchResults}/${retained.runs.claimed}/${retained.runs.completed}/${retained.runs.failed}/${retained.runs.runIdsMatched}/${retained.runs.claimedIdsObserved}/${retained.runs.resultIdsObserved}/${retained.runs.duplicateClaimIds}/${retained.runs.duplicateResultIds}`,
    "DAILY69_RUN_RECONCILIATION_INCOMPLETE");
    integrity("safety_counters", Object.values(retained.safety).every((value) => value === 0), "all=0", Object.values(retained.safety).join("/"), "DAILY69_SAFETY_COUNTER_NONZERO");
  }

  const natural = input.naturalExecution;
  if (!natural) {
    gates.push(gate("natural_execution", "UNPROVEN", "retained task-event correlation", "missing", "DAILY69_NATURAL_EXECUTION_UNPROVEN", "completion"));
  } else {
    const roleExact = natural.control.started >= 1 && natural.control.started === natural.control.completed
      && natural.control.completed === natural.control.correlated && natural.control.correlated === natural.control.succeeded
      && natural.batch.started === expected.scheduledBatchRuns && natural.batch.completed === expected.scheduledBatchRuns
      && natural.batch.correlated === expected.scheduledBatchRuns && natural.batch.succeeded === expected.scheduledBatchRuns
      && natural.closeout.started === 1 && natural.closeout.completed === 1 && natural.closeout.correlated === 1 && natural.closeout.succeeded === 1;
    if (!natural.bindingMatches || natural.malformedRecords > 0) {
      integrity("natural_execution", false, "binding=true malformed=0", `${natural.bindingMatches}/${natural.malformedRecords}`, "DAILY69_NATURAL_EXECUTION_INVALID");
    } else {
      completion("natural_execution", natural.taskEventCorrelation && roleExact,
        `correlation=true control>=1(all) batch=${expected.scheduledBatchRuns} closeout=1`,
        `${natural.taskEventCorrelation}:${role(natural.control)}:${role(natural.batch)}:${role(natural.closeout)}`,
        "DAILY69_NATURAL_EXECUTION_UNPROVEN");
    }
  }

  const failed = gates.filter((entry) => entry.state === "FAIL").length;
  const unproven = gates.filter((entry) => entry.state === "UNPROVEN").length;
  const result: Level3Completion = failed > 0 ? "FAILED" : unproven > 0 ? "PENDING" : "PASS";
  return {
    schemaVersion: "daily69-level3-completion-matrix-v1",
    completion: result,
    pass: gates.length - failed - unproven,
    unproven,
    failed,
    gates,
    blockers: gates.filter((entry) => entry.state !== "PASS").map((entry) => entry.reason),
    SAFE_TO_UPLOAD: false,
    PLATFORM_UPLOAD: 0,
  };
}

function gate(id: string, state: Level3GateState, expected: string, actual: unknown, reason: string, severity: Level3Gate["severity"]): Level3Gate {
  return { id, state, expected, actual: String(actual), reason, severity };
}

function role(value: RetainedExecutionRoleSummary) {
  return `${value.started}/${value.completed}/${value.correlated}/${value.succeeded}`;
}
