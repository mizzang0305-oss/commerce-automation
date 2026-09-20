import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { bindRetainedTaskEvents, captureLevel3RetainedEvidence, recomputePostCloseout, scanRetainedExecution, type Level3SheetsAuditGateway, type RetainedExecutionReceipt, type RetainedTaskEventBinding } from "../../src/lib/daily69-first-operation/postCloseout";
import { TASK_PROVENANCE_EVENT_IDS, type SanitizedTaskSchedulerEvent } from "../../src/lib/daily69-first-operation/taskProvenance";
import { finalizeNaturalCloseout } from "../../scripts/daily69-first-operation/finalize-natural-closeout";
import type { FirstOperationManifest } from "../../src/lib/daily69-first-operation";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("Daily69 independent post-closeout audit", () => {
  it("recomputes from operation files and remains pending when aggregate and natural evidence are absent", async () => {
    const { operationRoot } = await operationFixture();
    const report = await recomputePostCloseout(operationRoot, new Date("2099-01-02T00:00:00.000Z"));
    expect(report.completion).toBe("PENDING");
    expect(report.matrix.gates.find((gate) => gate.id === "natural_execution")?.state).toBe("UNPROVEN");
    expect(report.matrix.gates.find((gate) => gate.id === "sheets_exact")?.state).toBe("UNPROVEN");
    expect(JSON.parse(await readFile(join(operationRoot, "closeout", "post-closeout-report.json"), "utf8"))).toMatchObject({ schemaVersion: "daily69-post-closeout-audit-v1", completion: "PENDING", SAFE_TO_UPLOAD: false });
  });

  it("independently correlates retained control, batch, and closeout receipts", async () => {
    const { operationRoot, manifest } = await operationFixture();
    for (const [index, role] of (["control", "batch", "closeout"] as const).entries()) {
      const roleRoot = join(operationRoot, "retained-execution", role);
      const taskEventRoot = join(operationRoot, "retained-execution", "task-events");
      await mkdir(roleRoot, { recursive: true });
      await mkdir(taskEventRoot, { recursive: true });
      const receipt: RetainedExecutionReceipt = {
        schemaVersion: "daily69-retained-execution-v1",
        role,
        invocationId: `invocation-${role}-0001`,
        namespace: manifest.namespace,
        operationDate: manifest.operationDate,
        expectedGitHead: manifest.expectedGitHead,
        taskName: `Minz-Commerce-${role}`,
        processId: 5000 + index,
        origin: "UNKNOWN",
        startedAt: `2099-01-01T0${index}:00:00.000Z`,
        completedAt: `2099-01-01T0${index}:01:00.000Z`,
        exitCode: 0,
        taskEvent: { correlated: false, startedEventId: 0, completedEventId: 0 },
      };
      await writeFile(join(roleRoot, `${receipt.invocationId}.json`), `${JSON.stringify(receipt)}\n`);
      const binding: RetainedTaskEventBinding = {
        schemaVersion: "daily69-task-event-binding-v1",
        role,
        invocationId: receipt.invocationId,
        taskName: receipt.taskName,
        taskInstanceId: `task-instance-${index}`,
        actionProcessId: receipt.processId!,
        origin: "NATURAL_SCHEDULED",
        eventRecordIds: TASK_PROVENANCE_EVENT_IDS.map((_, eventIndex) => 1000 + index * 10 + eventIndex),
        requiredEventIds: [...TASK_PROVENANCE_EVENT_IDS],
        observedEventIds: [...TASK_PROVENANCE_EVENT_IDS],
        resultCodesPass: true,
      };
      await writeFile(join(taskEventRoot, `${receipt.invocationId}.json`), `${JSON.stringify(binding)}\n`);
    }
    const summary = await scanRetainedExecution(operationRoot, manifest);
    expect(summary).toMatchObject({ bindingMatches: true, taskEventCorrelation: true, malformedRecords: 0 });
    expect(summary?.control).toEqual({ started: 1, completed: 1, correlated: 1, succeeded: 1 });
    expect(summary?.batch).toEqual({ started: 1, completed: 1, correlated: 1, succeeded: 1 });
    expect(summary?.closeout).toEqual({ started: 1, completed: 1, correlated: 1, succeeded: 1 });
  });

  it("binds only the exact action PID when overlapping natural task instances share the time window", async () => {
    const { operationRoot, manifest } = await operationFixture();
    const roleRoot = join(operationRoot, "retained-execution", "control");
    await mkdir(roleRoot, { recursive: true });
    const receipt: RetainedExecutionReceipt = {
      schemaVersion: "daily69-retained-execution-v1", role: "control", invocationId: "invocation-control-pid-0001",
      namespace: manifest.namespace, operationDate: manifest.operationDate, expectedGitHead: manifest.expectedGitHead,
      taskName: "Minz-Commerce-Control", processId: 4242, origin: "UNKNOWN",
      startedAt: "2099-01-01T00:00:00.000Z", completedAt: "2099-01-01T00:01:00.000Z", exitCode: 0,
      taskEvent: { correlated: false, startedEventId: 0, completedEventId: 0 },
    };
    await writeFile(join(roleRoot, "receipt.json"), `${JSON.stringify(receipt)}\n`);
    const matching = taskEventChain(receipt.taskName, "matching-instance", 4242, 1000, "2099-01-01T00:00:30.000Z");
    const overlapping = taskEventChain(receipt.taskName, "overlapping-instance", 9898, 2000, "2099-01-01T00:00:40.000Z");
    const result = await bindRetainedTaskEvents(operationRoot, [...matching, ...overlapping]);
    expect(result).toMatchObject({ receipts: 1, bound: 1, alreadyBound: 0, unproven: 0 });
    const binding = JSON.parse(await readFile(join(operationRoot, "retained-execution", "task-events", "control-invocation-control-pid-0001.json"), "utf8")) as RetainedTaskEventBinding;
    expect(binding).toMatchObject({ taskInstanceId: "matching-instance", actionProcessId: 4242, origin: "NATURAL_SCHEDULED" });
    expect(binding.eventRecordIds).toEqual(matching.map((event) => event.eventRecordId));
  });

  it("binds a verified launch event whose Windows schema omits TaskInstanceId", async () => {
    const { operationRoot, manifest } = await operationFixture();
    const roleRoot = join(operationRoot, "retained-execution", "control");
    await mkdir(roleRoot, { recursive: true });
    const receipt = retainedReceipt(manifest, { processId: 5151 });
    await writeFile(join(roleRoot, "receipt.json"), `${JSON.stringify(receipt)}\n`);
    const chain = taskEventChain(receipt.taskName, "actual-instance", 5151, 4000, "2099-01-01T00:00:30.000Z")
      .map((event) => event.eventId === 129 ? { ...event, taskInstanceId: "" } : event);
    await expect(bindRetainedTaskEvents(operationRoot, chain)).resolves.toMatchObject({ receipts: 1, bound: 1, unproven: 0 });
  });

  it.each([
    { name: "wrong PID", receipt: {}, eventTaskName: "Minz-Commerce-Control", eventPid: 9191 },
    { name: "wrong task", receipt: {}, eventTaskName: "Other-Task", eventPid: 5151 },
  ])("does not bind $name evidence", async ({ receipt: receiptOverride, eventTaskName, eventPid }) => {
    const { operationRoot, manifest } = await operationFixture();
    const roleRoot = join(operationRoot, "retained-execution", "control");
    await mkdir(roleRoot, { recursive: true });
    const receipt = retainedReceipt(manifest, receiptOverride);
    await writeFile(join(roleRoot, "receipt.json"), `${JSON.stringify(receipt)}\n`);
    const chain = taskEventChain(eventTaskName, "rejected-instance", eventPid, 5000, "2099-01-01T00:00:30.000Z");
    await expect(bindRetainedTaskEvents(operationRoot, chain)).resolves.toMatchObject({ receipts: 1, bound: 0, unproven: 1 });
  });

  it.each([
    { namespace: "operation-other" },
    { expectedGitHead: "f".repeat(40) },
  ])("fails a mismatched retained receipt identity instead of polling it", async (receiptOverride) => {
    const { operationRoot, manifest } = await operationFixture();
    const roleRoot = join(operationRoot, "retained-execution", "control");
    await mkdir(roleRoot, { recursive: true });
    const receipt = retainedReceipt(manifest, receiptOverride);
    await writeFile(join(roleRoot, "receipt.json"), `${JSON.stringify(receipt)}\n`);
    await expect(bindRetainedTaskEvents(operationRoot, taskEventChain(receipt.taskName, "rejected-instance", 5151, 5000, "2099-01-01T00:00:30.000Z")))
      .rejects.toThrow("DAILY69_TASK_RECEIPT_IDENTITY_MISMATCH");
  });

  it("binds a natural terminal receipt and finalizes as failed with its exact safe code", async () => {
    const { operationRoot, manifest } = await operationFixture();
    const roleRoot = join(operationRoot, "retained-execution", "control");
    await mkdir(roleRoot, { recursive: true });
    const receipt = retainedReceipt(manifest, { exitCode: 5, outcome: "unexpected_exception", safeError: "UNEXPECTED_EXCEPTION" });
    await writeFile(join(roleRoot, "receipt.json"), `${JSON.stringify(receipt)}\n`);
    const chain = [
      ...taskEventChain(receipt.taskName, "terminal-instance", 5151, 6000, "2099-01-01T00:00:30.000Z", 5),
      { eventRecordId: 6999, eventId: 322, timeCreatedUtc: "2099-01-01T00:00:31.000Z", taskName: receipt.taskName, taskInstanceId: "terminal-instance" },
    ];
    const binding = await bindRetainedTaskEvents(operationRoot, chain);
    expect(binding).toMatchObject({ receipts: 1, bound: 1, unproven: 0,
      terminalFailures: [{ role: "control", invocationId: receipt.invocationId, safeError: "UNEXPECTED_EXCEPTION" }] });
    const storedBinding = JSON.parse(await readFile(join(operationRoot, "retained-execution", "task-events", `control-${receipt.invocationId}.json`), "utf8")) as RetainedTaskEventBinding;
    expect(storedBinding.observedEventIds).toEqual([...TASK_PROVENANCE_EVENT_IDS].sort((left, right) => left - right));
    let closeoutCalls = 0;
    await expect(finalizeNaturalCloseout(operationRoot, {
      collectEvents: async () => chain, attempts: 5, intervalMs: 0, wait: async () => undefined,
      closeout: async () => { closeoutCalls += 1; return { completion: "PASS" }; },
    })).rejects.toThrow("UNEXPECTED_EXCEPTION");
    expect(closeoutCalls).toBe(0);
  });

  it("treats a retained slot-local partial with wrapper exit zero as a successful natural invocation", async () => {
    const { operationRoot, manifest } = await operationFixture();
    const roleRoot = join(operationRoot, "retained-execution", "batch");
    await mkdir(roleRoot, { recursive: true });
    const receipt = retainedReceipt(manifest, { role: "batch", taskName: "Minz-Commerce-VideoBatch-NoUpload-V1", exitCode: 0, outcome: "partial", safeError: "BATCH_PARTIAL" });
    await writeFile(join(roleRoot, "partial.json"), `${JSON.stringify(receipt)}\n`);
    const chain = taskEventChain(receipt.taskName, "partial-instance", receipt.processId!, 6250, "2099-01-01T00:00:30.000Z", 0);
    let closeoutCalls = 0;
    const result = await finalizeNaturalCloseout(operationRoot, {
      collectEvents: async () => chain,
      attempts: 1,
      closeout: async () => { closeoutCalls += 1; return { completion: "PASS" }; },
    });
    expect(result.binding).toMatchObject({ receipts: 1, bound: 1, unproven: 0, terminalFailures: [] });
    expect(result.completion).toBe("PASS");
    expect(closeoutCalls).toBe(1);
  });

  it("keeps a nonzero receipt pending while its natural terminal event is not visible yet", async () => {
    const { operationRoot, manifest } = await operationFixture();
    const roleRoot = join(operationRoot, "retained-execution", "control");
    await mkdir(roleRoot, { recursive: true });
    const receipt = retainedReceipt(manifest, { exitCode: 5, outcome: "unexpected_exception", safeError: "UNEXPECTED_EXCEPTION" });
    await writeFile(join(roleRoot, "receipt.json"), `${JSON.stringify(receipt)}\n`);
    const incomplete = taskEventChain(receipt.taskName, "lagging-instance", 5151, 6500, "2099-01-01T00:00:30.000Z", 5).slice(0, -2);
    let closeoutCalls = 0;
    await expect(finalizeNaturalCloseout(operationRoot, {
      collectEvents: async () => incomplete, attempts: 1, intervalMs: 0, wait: async () => undefined,
      closeout: async () => { closeoutCalls += 1; return { completion: "PASS" }; },
    })).rejects.toThrow("DAILY69_TASK_EVENTS_PENDING");
    expect(closeoutCalls).toBe(0);
  });

  it("finalizes only after the prior closeout receipt has a completed natural event chain", async () => {
    const { operationRoot, manifest } = await operationFixture();
    const roleRoot = join(operationRoot, "retained-execution", "closeout");
    await mkdir(roleRoot, { recursive: true });
    const receipt: RetainedExecutionReceipt = {
      schemaVersion: "daily69-retained-execution-v1", role: "closeout", invocationId: "invocation-closeout-final-0001",
      namespace: manifest.namespace, operationDate: manifest.operationDate, expectedGitHead: manifest.expectedGitHead,
      taskName: "Minz-Commerce-Closeout", processId: 7007, origin: "UNKNOWN",
      startedAt: "2099-01-01T03:00:00.000Z", completedAt: "2099-01-01T03:01:00.000Z", exitCode: 0,
      taskEvent: { correlated: false, startedEventId: 0, completedEventId: 0 },
    };
    await writeFile(join(roleRoot, "receipt.json"), `${JSON.stringify(receipt)}\n`);
    const incomplete = taskEventChain(receipt.taskName, "closeout-instance", 7007, 3000, "2099-01-01T03:00:30.000Z").slice(0, -1);
    const complete = taskEventChain(receipt.taskName, "closeout-instance", 7007, 3000, "2099-01-01T03:00:30.000Z");
    let polls = 0;
    let closeoutCalls = 0;
    const result = await finalizeNaturalCloseout(operationRoot, {
      collectEvents: async () => (++polls === 1 ? incomplete : complete), attempts: 2, intervalMs: 0, wait: async () => undefined,
      closeout: async () => { closeoutCalls += 1; return { completion: "PASS" }; },
    });
    expect(result.completion).toBe("PASS");
    expect(polls).toBe(2);
    expect(closeoutCalls).toBe(1);
  });

  it("captures a fresh aggregate from an injected Sheets audit and local run/batch reconciliation", async () => {
    const { operationRoot } = await operationFixture();
    await mkdir(join(operationRoot, "batch-results"), { recursive: true });
    const run = { runId: "batch-20990101040000", type: "scheduled_batch", status: "success", startedAt: "2099-01-01T04:00:00.000Z", finishedAt: "2099-01-01T04:01:00.000Z", claimed: 1, completed: 1, blocked: 0, failed: 0, retried: 0, safeMessage: "BATCH_MACHINE_QA_COMPLETE", metrics: { PLATFORM_UPLOAD: 0, GOOGLE_DRIVE_WRITE: 0, PRODUCTION_DB_WRITE: 0, R2_WRITE: 0 } };
    await writeFile(join(operationRoot, "runs.json"), `${JSON.stringify([run])}\n`);
    await writeFile(join(operationRoot, "batch-results", "batch-001.jsonl"), `${JSON.stringify({
      event: "queue_batch_complete",
      run: { runId: run.runId, claimed: run.claimed },
      results: [
        { queueId: "queue-001", productKey: "initial-product", passed: false },
        { queueId: "queue-001", productKey: "reserve-product", passed: true },
      ],
    })}\n`);
    const gateway: Level3SheetsAuditGateway = { audit: async () => ({ exact: true, queueRows: 1, reserveRows: 0, syncRows: 1, duplicateIdentities: 0, preexistingChanged: 0, preexistingDeleted: 0, preexistingReordered: 0, snapshotHash: "c".repeat(64) }) };
    const evidence = await captureLevel3RetainedEvidence(operationRoot, gateway);
    expect(evidence.sheets).toMatchObject({ exact: true, queueRows: 1, reserveRows: 0, syncRows: 1 });
    expect(evidence.runs).toMatchObject({ scheduledBatchRuns: 1, batchResults: 1, claimed: 1, completed: 1, runIdsMatched: true, batchClaimResultCardinalityMatched: true, claimedIdsObserved: 1, resultIdsObserved: 1, duplicateClaimIds: 0, duplicateResultIds: 0 });
    expect(evidence.safety).toEqual({ uploadCalls: 0, platformCalls: 0, driveCalls: 0, dbWrites: 0, r2Writes: 0 });
    expect(JSON.parse(await readFile(join(operationRoot, "closeout", "level3-retained-evidence.json"), "utf8"))).toMatchObject({ schemaVersion: "daily69-level3-retained-evidence-v1" });
  });

  it("fails batch claim/result cardinality closed when an envelope introduces another logical queue id", async () => {
    const { operationRoot } = await operationFixture();
    await mkdir(join(operationRoot, "batch-results"), { recursive: true });
    const run = { runId: "batch-20990101040000", type: "scheduled_batch", status: "success", startedAt: "2099-01-01T04:00:00.000Z", finishedAt: "2099-01-01T04:01:00.000Z", claimed: 1, completed: 1, blocked: 0, failed: 0, retried: 0, safeMessage: "BATCH_MACHINE_QA_COMPLETE", metrics: { PLATFORM_UPLOAD: 0 } };
    await writeFile(join(operationRoot, "runs.json"), `${JSON.stringify([run])}\n`);
    await writeFile(join(operationRoot, "batch-results", "batch-001.jsonl"), `${JSON.stringify({
      event: "queue_batch_complete",
      run: { runId: run.runId, claimed: run.claimed },
      results: [{ queueId: "queue-001" }, { queueId: "queue-injected" }],
    })}\n`);
    const gateway: Level3SheetsAuditGateway = { audit: async () => ({ exact: true, queueRows: 1, reserveRows: 0, syncRows: 1, duplicateIdentities: 0, preexistingChanged: 0, preexistingDeleted: 0, preexistingReordered: 0, snapshotHash: "d".repeat(64) }) };
    const evidence = await captureLevel3RetainedEvidence(operationRoot, gateway);
    expect(evidence.runs).toMatchObject({ batchClaimResultCardinalityMatched: false, claimedIdsObserved: 1, resultIdsObserved: 2 });
  });

  it("does not manufacture an aggregate when the Sheets audit is unavailable", async () => {
    const { operationRoot } = await operationFixture();
    const gateway: Level3SheetsAuditGateway = { audit: async () => { throw new Error("GOOGLE_SHEETS_READ_FAILED"); } };
    await expect(captureLevel3RetainedEvidence(operationRoot, gateway)).rejects.toThrow("GOOGLE_SHEETS_READ_FAILED");
    await expect(readFile(join(operationRoot, "closeout", "level3-retained-evidence.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});

function taskEventChain(taskName: string, taskInstanceId: string, processId: number, recordBase: number, timeCreatedUtc: string, resultCode = 0): SanitizedTaskSchedulerEvent[] {
  return TASK_PROVENANCE_EVENT_IDS.map((eventId, index) => ({
    eventRecordId: recordBase + index,
    eventId,
    timeCreatedUtc,
    taskName,
    taskInstanceId,
    ...([129, 200, 201].includes(eventId) ? { processId } : {}),
    ...(eventId === 201 ? { resultCode } : {}),
  }));
}

function retainedReceipt(manifest: FirstOperationManifest, overrides: Partial<RetainedExecutionReceipt> = {}): RetainedExecutionReceipt {
  return {
    schemaVersion: "daily69-retained-execution-v1",
    role: "control",
    invocationId: "invocation-control-contract-0001",
    namespace: manifest.namespace,
    operationDate: manifest.operationDate,
    expectedGitHead: manifest.expectedGitHead,
    taskName: "Minz-Commerce-Control",
    processId: 5151,
    origin: "UNKNOWN",
    startedAt: "2099-01-01T00:00:00.000Z",
    completedAt: "2099-01-01T00:01:00.000Z",
    exitCode: 0,
    taskEvent: { correlated: false, startedEventId: 0, completedEventId: 0 },
    ...overrides,
  };
}

async function operationFixture() {
  const base = await mkdtemp(join(tmpdir(), "daily69-post-closeout-")); roots.push(base);
  const operationRoot = join(base, "operation-2099-01-01");
  await mkdir(join(operationRoot, "closeout"), { recursive: true });
  const manifest: FirstOperationManifest = {
    schemaVersion: "daily69-first-operation-v2",
    decision: "NO_UPLOAD_DAILY69_FIRST_OPERATION_DAY_CLOSEOUT_PENDING",
    operationDate: "2099-01-01",
    armedAt: "2098-12-31T00:00:00.000Z",
    expectedGitHead: "a".repeat(40),
    namespace: "operation-2099-01-01",
    attemptNumber: 1,
    previousAttemptNamespace: "",
    armStatus: "closed_failed",
    sourceNamespace: "source",
    sourceDecision: "COUPANG_IMAGE_SKILL_USAGE_SCENES_V5_PROVEN_DAILY69_CAPACITY",
    sourceFileHashes: {}, sourceAssetHashes: {}, sourceBundleHash: "b".repeat(64), sourceHashAfterClone: "b".repeat(64), originalMutated: false,
    prevalidatedReady: 0, carryForwardCandidateCount: 0, verifiedReady: 0, scheduledRemaining: 1, reserve: 0, distinct: 1,
    schedule: [{ hourKst: 4, slots: ["slot-001"] }],
    safety: { SAFE_TO_UPLOAD: false, SAFE_TO_PUBLIC_UPLOAD: false, PLATFORM_UPLOAD: 0, GOOGLE_DRIVE_WRITE: 0, PRODUCTION_DB_WRITE: 0, R2_WRITE: 0 },
  };
  await Promise.all([
    writeFile(join(operationRoot, "operation-manifest.json"), `${JSON.stringify(manifest)}\n`),
    writeFile(join(operationRoot, "queue.json"), "[]\n"),
    writeFile(join(operationRoot, "reserve-pool.json"), "[]\n"),
    writeFile(join(operationRoot, "runs.json"), "[]\n"),
    writeFile(join(operationRoot, "settings.json"), `${JSON.stringify({ mode: "no_upload_daily69_first_operation", dailyTargetCount: 1, batchSize: 3, intervalHours: 1, startHour: 4, endHour: 4, pilotMaxDailyItems: 1, uploadEnabled: false, isPaused: true, enabled: false, minimumFreeGb: 20, leaseMinutes: 10, retryBackoffMinutes: 10, maxAttempts: 2, maxProductCandidates: 3, reserveRatio: 0.2, minimumReserveCount: 0, maxRawDiscoveries: 1, maxProviderCalls: 1, processingDailyCap: 1, maxCategoryRatio: 1, maxProductFamilyRatio: 1, maxExactAssetReuse: 5, observationMode: true, autoPauseAfterObservation: true })}\n`),
    writeFile(join(operationRoot, "control-state.json"), `${JSON.stringify({ localRevision: 1, projectionRevision: 0, snapshotHash: "", projectedAt: "", source: "local_queue_scheduler" })}\n`),
    writeFile(join(base, "active-operation.json"), `${JSON.stringify({ schemaVersion: "daily69-first-operation-pointer-v2", namespace: manifest.namespace, operationDate: manifest.operationDate, attemptNumber: 1, expectedGitHead: manifest.expectedGitHead, armStatus: "closed_failed", decision: manifest.decision, SAFE_TO_UPLOAD: false })}\n`),
    writeFile(join(operationRoot, "closeout", "closeout-report.json"), `${JSON.stringify({ namespace: manifest.namespace, operationDate: manifest.operationDate, expectedGitHead: manifest.expectedGitHead, matrix: { completion: "PENDING" } })}\n`),
  ]);
  return { operationRoot, manifest };
}
