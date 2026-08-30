import { createHash } from "node:crypto";
import { mkdir, open, readdir, readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { atomicWriteJson, readJson } from "@/lib/queue-scheduler/atomicJson";
import { assertCodexExecutorReceipt, isCodexReviewEvidenceV2 } from "@/lib/queue-scheduler/codexReviewEvidence";
import { loadAndAssertImmutableReviewOperationBinding } from "@/lib/queue-scheduler/immutableReviewBinding";
import { inspectQueueMediaEvidence, sha256File, type QueueMediaEvidence } from "@/lib/queue-scheduler/mediaEvidence";
import type { CodexReviewEvidenceV2, LocalQueueItem } from "@/lib/queue-scheduler/types";
import {
  capturePreCutoverSheetBaseline,
  verifyFreshNamespaceRows,
  verifyPreexistingRowsUnchanged,
  type PreCutoverSheetBaseline,
} from "@/lib/queue-control-integration/cutover";
import { firstOperationStatus, verifyFirstOperationMaterializationEligibility, type FirstOperationManifest } from "./index";
import { TASK_PROVENANCE_EVENT_IDS, classifyTaskInvocationProvenance, type SanitizedTaskSchedulerEvent } from "./taskProvenance";
import {
  normalizeFirstOperationLifecycleStatus,
  validateLevel3Completion,
  type Level3CompletionInput,
  type Level3CompletionMatrix,
  type Level3Gate,
  type Level3PointerObservation,
  type Level3RetainedEvidence,
  type RetainedExecutionRoleSummary,
  type RetainedExecutionSummary,
} from "./level3";

export const RETAINED_EXECUTION_RECEIPT_SCHEMA = "daily69-retained-execution-v1" as const;

export type RetainedExecutionReceipt = {
  schemaVersion: typeof RETAINED_EXECUTION_RECEIPT_SCHEMA;
  role: "control" | "batch" | "closeout";
  invocationId: string;
  namespace: string;
  operationDate: string;
  expectedGitHead: string;
  taskName: string;
  processId?: number;
  origin?: "NATURAL_SCHEDULED" | "UNKNOWN" | "MANUAL" | "DIAGNOSTIC" | "RETRY";
  startedAt: string;
  completedAt: string;
  exitCode: number;
  taskEvent: {
    correlated: boolean;
    startedEventId: number;
    completedEventId: number;
  };
};

export type RetainedTaskEventBinding = {
  schemaVersion: "daily69-task-event-binding-v1";
  role: RetainedExecutionReceipt["role"];
  invocationId: string;
  taskName: string;
  taskInstanceId: string;
  actionProcessId: number;
  origin: "NATURAL_SCHEDULED";
  eventRecordIds: number[];
  requiredEventIds: number[];
  observedEventIds: number[];
  resultCodesPass: true;
};

export type Level3SheetsAuditGateway = {
  audit(input: {
    operationRoot: string;
    namespace: string;
    expectedQueueRows: number;
    expectedReserveRows: number;
    expectedSnapshotHash: string;
    expectedProjectionRevision: number;
  }): Promise<Level3RetainedEvidence["sheets"]>;
};

export async function bindRetainedTaskEvents(operationRoot: string, events: SanitizedTaskSchedulerEvent[]) {
  const root = resolve(operationRoot);
  const snapshot = await firstOperationStatus(root);
  const receipts = await readRetainedExecutionReceipts(root);
  const existingBindings = await readRetainedTaskEventBindings(root);
  if (existingBindings.malformed > 0) throw new Error("DAILY69_TASK_EVENT_BINDING_STORE_INVALID");
  const outputRoot = join(root, "retained-execution", "task-events");
  await mkdir(outputRoot, { recursive: true });
  const usedInstances = new Set(existingBindings.records.map((binding) => binding.taskInstanceId));
  let bound = 0;
  let alreadyBound = 0;
  let unproven = 0;
  for (const receipt of receipts.records) {
    if (receipt.namespace !== snapshot.manifest.namespace || receipt.operationDate !== snapshot.manifest.operationDate
      || receipt.expectedGitHead !== snapshot.manifest.expectedGitHead || receipt.exitCode !== 0
      || !Number.isSafeInteger(receipt.processId) || Number(receipt.processId) < 1) {
      unproven += 1;
      continue;
    }
    const bindingKey = `${receipt.role}:${receipt.invocationId}`;
    const existing = existingBindings.byKey.get(bindingKey);
    if (existing) {
      if (normalizeTaskName(existing.taskName) !== normalizeTaskName(receipt.taskName) || existing.actionProcessId !== receipt.processId) {
        throw new Error("DAILY69_TASK_EVENT_BINDING_CONFLICT");
      }
      alreadyBound += 1;
      continue;
    }
    const started = Date.parse(receipt.startedAt);
    const completed = Date.parse(receipt.completedAt);
    const relevant = events.filter((event) => normalizeTaskName(event.taskName) === normalizeTaskName(receipt.taskName)
      && Date.parse(event.timeCreatedUtc) >= started - 120_000 && Date.parse(event.timeCreatedUtc) <= completed + 120_000);
    const instanceIds = [...new Set(relevant.map((event) => event.taskInstanceId).filter(Boolean))];
    const candidates = instanceIds.map((taskInstanceId) => {
      const chain = relevant.filter((event) => event.taskInstanceId === taskInstanceId
        || (event.eventId === 129 && event.taskInstanceId === "" && event.processId === receipt.processId));
      return { taskInstanceId, chain, provenance: classifyTaskInvocationProvenance({ taskName: receipt.taskName, events: chain }) };
    }).filter((candidate) => candidate.provenance.classification === "natural_scheduled"
      && Number.isSafeInteger(receipt.processId) && Number(receipt.processId) > 0
      && [129, 200, 201].every((eventId) => candidate.chain.some((event) => event.eventId === eventId && event.processId === receipt.processId))
      && !usedInstances.has(candidate.taskInstanceId));
    if (candidates.length !== 1) { unproven += 1; continue; }
    const candidate = candidates[0];
    const binding: RetainedTaskEventBinding = {
      schemaVersion: "daily69-task-event-binding-v1",
      role: receipt.role,
      invocationId: receipt.invocationId,
      taskName: receipt.taskName,
      taskInstanceId: candidate.taskInstanceId,
      actionProcessId: receipt.processId!,
      origin: "NATURAL_SCHEDULED",
      eventRecordIds: TASK_PROVENANCE_EVENT_IDS.map((eventId) => candidate.chain.find((event) => event.eventId === eventId)!.eventRecordId),
      requiredEventIds: [...TASK_PROVENANCE_EVENT_IDS],
      observedEventIds: candidate.provenance.observedEventIds,
      resultCodesPass: true,
    };
    await createNewJson(join(outputRoot, `${receipt.role}-${receipt.invocationId}.json`), binding);
    usedInstances.add(candidate.taskInstanceId);
    bound += 1;
  }
  return { receipts: receipts.records.length, malformedReceipts: receipts.malformed, bound, alreadyBound, unproven, SAFE_TO_UPLOAD: false as const, PLATFORM_UPLOAD: 0 as const };
}

export async function retainedExecutionTimeBounds(operationRoot: string) {
  const receipts = await readRetainedExecutionReceipts(resolve(operationRoot));
  const starts = receipts.records.map((receipt) => Date.parse(receipt.startedAt)).filter(Number.isFinite);
  const ends = receipts.records.map((receipt) => Date.parse(receipt.completedAt)).filter(Number.isFinite);
  if (starts.length === 0 || ends.length === 0) throw new Error("DAILY69_RETAINED_EXECUTION_RECEIPTS_UNAVAILABLE");
  return {
    startUtc: new Date(Math.min(...starts) - 300_000).toISOString(),
    endUtc: new Date(Math.max(...ends) + 300_000).toISOString(),
    receipts: receipts.records.length,
    malformedReceipts: receipts.malformed,
  };
}

export async function captureLevel3RetainedEvidence(operationRoot: string, sheetsGateway?: Level3SheetsAuditGateway) {
  const root = resolve(operationRoot);
  const snapshot = await firstOperationStatus(root);
  const gateway = sheetsGateway ?? await defaultSheetsAuditGateway();
  const sheets = await gateway.audit({
    operationRoot: root,
    namespace: snapshot.manifest.namespace,
    expectedQueueRows: Number(snapshot.manifest.prevalidatedReady) + Number(snapshot.manifest.scheduledRemaining),
    expectedReserveRows: snapshot.manifest.reserve,
    expectedSnapshotHash: snapshot.state.snapshotHash,
    expectedProjectionRevision: snapshot.state.projectionRevision,
  });
  const reconciled = await reconcileRunsAndBatchResults(root, snapshot.runs);
  const { rawValues, ...runs } = reconciled;
  const evidence: Level3RetainedEvidence = {
    schemaVersion: "daily69-level3-retained-evidence-v1",
    namespace: snapshot.manifest.namespace,
    operationDate: snapshot.manifest.operationDate,
    expectedGitHead: snapshot.manifest.expectedGitHead,
    media: { validVideoArtifacts: 0, missingVideoArtifacts: Number(snapshot.manifest.prevalidatedReady) + Number(snapshot.manifest.scheduledRemaining), invalidVideoArtifacts: 0, machineQaPassed: 0, finalQaPassed: 0, codexReviewBindings: 0, exactVideoHashBindings: 0, directReviewBindings: 0, immutableCarryForwardBindings: 0, invalidQaArtifacts: 0, invalidCodexReviewBindings: 0, duplicateVideoHashes: 0 },
    sheets,
    runs,
    safety: safetyCounters(snapshot.runs, rawValues),
  };
  await atomicWriteJson(join(root, "closeout", "level3-retained-evidence.json"), evidence);
  return evidence;
}

export async function recomputePostCloseout(operationRoot: string, nowOrDependencies: Date | {
  now?: Date;
  sheetsGateway?: Level3SheetsAuditGateway;
  inspectMedia?: typeof inspectQueueMediaEvidence;
} = new Date()) {
  const root = resolve(operationRoot);
  const dependencies = nowOrDependencies instanceof Date ? { now: nowOrDependencies } : nowOrDependencies;
  const snapshot = await firstOperationStatus(root);
  let captured: Level3RetainedEvidence | null = null;
  try { captured = await captureLevel3RetainedEvidence(root, dependencies.sheetsGateway); } catch { captured = null; }
  const input = await collectLevel3CompletionInput(root, snapshot, { retainedEvidenceOverride: captured, inspectMedia: dependencies.inspectMedia });
  let matrix = validateLevel3Completion(input);
  const closeoutPath = join(root, "closeout", "closeout-report.json");
  const closeout = await readJson<Record<string, unknown> | null>(closeoutPath, null);
  matrix = appendGate(matrix, closeoutReportGate(closeout, snapshot.manifest, matrix));
  const report = {
    schemaVersion: "daily69-post-closeout-audit-v1",
    auditedAt: (dependencies.now ?? new Date()).toISOString(),
    namespace: snapshot.manifest.namespace,
    operationDate: snapshot.manifest.operationDate,
    expectedGitHead: snapshot.manifest.expectedGitHead,
    lifecycleStatus: normalizeFirstOperationLifecycleStatus(snapshot.manifest.armStatus, snapshot.manifest.decision),
    closeoutReportHash: closeout ? hash(await readFile(closeoutPath)) : "",
    completion: matrix.completion,
    matrix,
    SAFE_TO_UPLOAD: false,
    PLATFORM_UPLOAD: 0,
  } as const;
  await atomicWriteJson(join(root, "closeout", "post-closeout-report.json"), report);
  return report;
}

export async function collectLevel3CompletionInput(
  operationRoot: string,
  snapshot: Awaited<ReturnType<typeof firstOperationStatus>>,
  dependencies: { inspectMedia?: typeof inspectQueueMediaEvidence; retainedEvidenceOverride?: Level3RetainedEvidence | null } = {},
): Promise<Level3CompletionInput> {
  const root = resolve(operationRoot);
  const expected = expectedCounts(snapshot.manifest, snapshot.settings.batchSize);
  const [retainedFile, naturalExecution, pointer, media, materializationCapacity] = await Promise.all([
    readJson<Level3RetainedEvidence | null>(join(root, "closeout", "level3-retained-evidence.json"), null),
    scanRetainedExecution(root, snapshot.manifest),
    observeActivePointer(root, snapshot.manifest),
    inspectReadyEvidence(root, snapshot.items, expected.total, dependencies.inspectMedia ?? inspectQueueMediaEvidence),
    observeMaterializationCapacity(root, snapshot).catch(() => null),
  ]);
  const retainedAggregate = Object.prototype.hasOwnProperty.call(dependencies, "retainedEvidenceOverride") ? dependencies.retainedEvidenceOverride ?? null : retainedFile;
  const retainedEvidence = retainedAggregate ? { ...retainedAggregate, media } : null;
  return {
    expected,
    binding: {
      namespace: snapshot.manifest.namespace,
      operationDate: snapshot.manifest.operationDate,
      expectedGitHead: snapshot.manifest.expectedGitHead,
    },
    materializationCapacityRequired: snapshot.manifest.schemaVersion === "daily69-first-operation-v2",
    materializationCapacity,
    lifecycleStatus: normalizeFirstOperationLifecycleStatus(snapshot.manifest.armStatus, snapshot.manifest.decision),
    pointer,
    queue: snapshot.status,
    settings: {
      enabled: snapshot.settings.enabled,
      isPaused: snapshot.settings.isPaused,
      uploadEnabled: snapshot.settings.uploadEnabled,
    },
    retainedEvidence,
    naturalExecution,
  };
}

async function observeMaterializationCapacity(
  operationRoot: string,
  snapshot: Awaited<ReturnType<typeof firstOperationStatus>>,
): Promise<NonNullable<Level3CompletionInput["materializationCapacity"]>> {
  const preflight = await verifyFirstOperationMaterializationEligibility(operationRoot);
  const productKeys = new Set<string>();
  for (const item of snapshot.items) {
    productKeys.add(item.productKey);
    for (const candidate of item.candidateHistory ?? []) productKeys.add(candidate.productKey);
  }
  for (const reserve of snapshot.reserve) productKeys.add(reserve.candidate.productKey);
  const claimed = snapshot.reserve.filter((reserve) => Boolean(reserve.claimedBySlot));
  const reconciled = claimed.filter((reserve) => {
    const item = snapshot.items.find((candidate) => candidate.slotId === reserve.claimedBySlot);
    if (!item || item.productKey !== reserve.candidate.productKey) return false;
    return (item.candidateHistory ?? []).some((candidate) => candidate.productKey === reserve.candidate.productKey
      && candidate.outcome === "passed" && candidate.reason === "RESERVE_FALLBACK" && Boolean(candidate.replacementOfProductKey));
  });
  const uniqueClaimedProducts = new Set(claimed.map((reserve) => reserve.candidate.productKey));
  const uniqueClaimedSlots = new Set(claimed.map((reserve) => reserve.claimedBySlot));
  return {
    ...preflight,
    observedDistinct: productKeys.size,
    reserveConsumed: claimed.length,
    reserveConsumptionReconciled: uniqueClaimedProducts.size === claimed.length && uniqueClaimedSlots.size === claimed.length
      ? reconciled.length
      : -1,
  };
}

async function defaultSheetsAuditGateway(): Promise<Level3SheetsAuditGateway> {
  const { NoUploadGoogleSheetsClient } = await import("@/lib/queue-control-integration/sheetsOnlyClient");
  const gateway = new NoUploadGoogleSheetsClient();
  return {
    async audit(input) {
      const baseline = await readJson<PreCutoverSheetBaseline | null>(join(input.operationRoot, "pre-cutover-sheet-baseline.json"), null);
      if (!baseline || baseline.schemaVersion !== "daily69-sheets-pre-cutover-baseline-v2") throw new Error("DAILY69_SHEETS_BASELINE_UNAVAILABLE");
      const [unchanged, namespaceRows, current] = await Promise.all([
        verifyPreexistingRowsUnchanged(gateway, baseline),
        verifyFreshNamespaceRows(gateway, input.namespace),
        capturePreCutoverSheetBaseline(gateway),
      ]);
      const sync = current.sync.filter((entry) => entry.namespace === input.namespace);
      const snapshotHash = sync.length === 1 ? sync[0].snapshotHash : "";
      const revision = sync.length === 1 ? sync[0].revision : -1;
      return {
        exact: unchanged.pass && namespaceRows.queue === input.expectedQueueRows && namespaceRows.reserve === input.expectedReserveRows
          && namespaceRows.sync === 1 && namespaceRows.duplicateQueueIdentities === 0 && namespaceRows.duplicateReserveIdentities === 0
          && snapshotHash === input.expectedSnapshotHash && revision === input.expectedProjectionRevision,
        queueRows: namespaceRows.queue,
        reserveRows: namespaceRows.reserve,
        syncRows: namespaceRows.sync,
        duplicateIdentities: namespaceRows.duplicateQueueIdentities + namespaceRows.duplicateReserveIdentities,
        preexistingChanged: unchanged.existingRowsChanged,
        preexistingDeleted: unchanged.existingRowsDeleted,
        preexistingReordered: unchanged.existingRowsReorderedByUs,
        snapshotHash,
      };
    },
  };
}

async function reconcileRunsAndBatchResults(operationRoot: string, allRuns: Awaited<ReturnType<typeof firstOperationStatus>>["runs"]) {
  const runs = allRuns.filter((run) => run.type === "scheduled_batch");
  const files = await listEvidenceFiles(join(operationRoot, "batch-results"));
  const envelopes: Array<Record<string, unknown>> = [];
  for (const path of files) {
    const values = await parseEvidenceFile(path);
    for (const value of values ?? []) {
      if (value && typeof value === "object" && (value as Record<string, unknown>).event === "queue_batch_complete") envelopes.push(value as Record<string, unknown>);
    }
  }
  const claimedIds: string[] = [];
  const resultIds: string[] = [];
  const envelopeRunIds: string[] = [];
  let batchClaimResultCardinalityMatched = true;
  for (const envelope of envelopes) {
    const run = envelope.run && typeof envelope.run === "object" ? envelope.run as Record<string, unknown> : {};
    const results = Array.isArray(envelope.results) ? envelope.results.filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object") : [];
    const claimedValue = Number(run.claimed ?? 0);
    const claimed = Number.isInteger(claimedValue) && claimedValue >= 0 ? claimedValue : -1;
    const ids = results.map((result) => String(result.queueId ?? "")).filter(Boolean);
    const envelopeClaimedIds = claimed >= 0 ? ids.slice(0, claimed) : [];
    const terminalIds = [...new Set(ids)];
    const claimedSet = new Set(envelopeClaimedIds);
    if (claimed < 0 || envelopeClaimedIds.length !== claimed || claimedSet.size !== claimed
      || terminalIds.length !== claimed || terminalIds.some((id) => !claimedSet.has(id))) {
      batchClaimResultCardinalityMatched = false;
    }
    claimedIds.push(...envelopeClaimedIds);
    resultIds.push(...terminalIds);
    if (typeof run.runId === "string") envelopeRunIds.push(run.runId);
  }
  const runIds = runs.map((run) => run.runId).sort();
  const observedRunIds = [...envelopeRunIds].sort();
  return {
    scheduledBatchRuns: runs.length,
    batchResults: envelopes.length,
    claimed: runs.reduce((sum, run) => sum + run.claimed, 0),
    completed: runs.reduce((sum, run) => sum + run.completed, 0),
    failed: runs.reduce((sum, run) => sum + run.failed + run.blocked + run.retried, 0),
    runIdsMatched: JSON.stringify(runIds) === JSON.stringify(observedRunIds),
    batchClaimResultCardinalityMatched,
    claimedIdsObserved: claimedIds.length,
    resultIdsObserved: resultIds.length,
    duplicateClaimIds: claimedIds.length - new Set(claimedIds).size,
    duplicateResultIds: resultIds.length - new Set(resultIds).size,
    rawValues: envelopes,
  };
}

function safetyCounters(runs: Awaited<ReturnType<typeof firstOperationStatus>>["runs"], batchValues: Array<Record<string, unknown>>): Level3RetainedEvidence["safety"] {
  const sources: unknown[] = [...runs.map((run) => run.metrics), ...batchValues];
  return {
    uploadCalls: numericCounter(sources, /^(?:UPLOAD_CALLS|YOUTUBE_UPLOAD_CALLS)$/u),
    platformCalls: numericCounter(sources, /^(?:PLATFORM_UPLOAD|PLATFORM_CALLS)$/u),
    driveCalls: numericCounter(sources, /^(?:GOOGLE_DRIVE_WRITE|DRIVE_WRITE|DRIVE_CALLS)$/u),
    dbWrites: numericCounter(sources, /^(?:PRODUCTION_DB_WRITE|SUPABASE_WRITE|DB_WRITES)$/u),
    r2Writes: numericCounter(sources, /^(?:R2_WRITE|R2_WRITES)$/u),
  };
}

function numericCounter(values: unknown[], pattern: RegExp) {
  let total = 0;
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (pattern.test(key) && typeof entry === "number" && Number.isFinite(entry)) total += entry;
      else if (entry && typeof entry === "object") visit(entry);
    }
  };
  values.forEach(visit);
  return total;
}

async function inspectReadyEvidence(
  operationRoot: string,
  items: LocalQueueItem[],
  expectedTotal: number,
  inspectMedia: typeof inspectQueueMediaEvidence,
): Promise<Level3RetainedEvidence["media"]> {
  const ready = items.filter((item) => item.status === "video_ready_autoqa");
  const results = await Promise.all(ready.map(async (item) => {
    let media: QueueMediaEvidence;
    try {
      media = await inspectMedia(item.videoPath);
    } catch (error) {
      return { mediaStatus: isMissingFileError(error) ? "MISSING" as const : "INVALID" as const, review: null, binding: null };
    }
    if (!media.passed) return { mediaStatus: "INVALID" as const, media, review: null, binding: null };
    const review = await inspectReviewArtifact(item, media);
    const binding = await inspectCodexBinding(operationRoot, item, media);
    return { mediaStatus: "PASS" as const, media, review, binding };
  }));
  const valid = results.filter((entry) => entry.mediaStatus === "PASS");
  const videoHashes = results.flatMap((entry) => "media" in entry && entry.media ? [entry.media.videoSha256] : []).filter(Boolean);
  return {
    validVideoArtifacts: valid.length,
    missingVideoArtifacts: Math.max(0, expectedTotal - ready.length) + results.filter((entry) => entry.mediaStatus === "MISSING").length,
    invalidVideoArtifacts: results.filter((entry) => entry.mediaStatus === "INVALID").length,
    machineQaPassed: valid.filter((entry) => entry.review?.status === "PASS" && entry.review.machineQaPassed).length,
    finalQaPassed: valid.filter((entry) => entry.review?.status === "PASS" && entry.review.finalAutomatedQaPassed).length,
    codexReviewBindings: valid.filter((entry) => entry.binding?.status === "PASS" && entry.binding.codexBound).length,
    exactVideoHashBindings: valid.filter((entry) => entry.binding?.status === "PASS" && entry.binding.hashBound).length,
    directReviewBindings: valid.filter((entry) => entry.binding?.status === "PASS" && entry.binding.mode === "DIRECT_REVIEW").length,
    immutableCarryForwardBindings: valid.filter((entry) => entry.binding?.status === "PASS" && entry.binding.mode === "IMMUTABLE_CARRY_FORWARD_BINDING").length,
    invalidQaArtifacts: valid.filter((entry) => entry.review?.status === "INVALID").length,
    invalidCodexReviewBindings: valid.filter((entry) => entry.binding?.status === "INVALID").length,
    duplicateVideoHashes: videoHashes.length - new Set(videoHashes).size,
  };
}

async function inspectReviewArtifact(item: LocalQueueItem, media: QueueMediaEvidence): Promise<{ status: "PASS" | "MISSING" | "INVALID"; machineQaPassed: boolean; finalAutomatedQaPassed: boolean }> {
  let value: Record<string, unknown> & { items?: Array<Record<string, unknown>> };
  try { value = JSON.parse(await readFile(item.reviewPath, "utf8")) as typeof value; }
  catch (error) { return { status: isMissingFileError(error) ? "MISSING" : "INVALID", machineQaPassed: false, finalAutomatedQaPassed: false }; }
  const matches = Array.isArray(value.items) ? value.items.filter((entry) => entry.productKey === item.productKey) : [value];
  if (matches.length !== 1) return { status: "INVALID", machineQaPassed: false, finalAutomatedQaPassed: false };
  const product = matches[0];
  const blockers = Array.isArray(product.blockers) ? product.blockers : null;
  const artifactVersion = String(product.version ?? value.version ?? "");
  const semanticPass = artifactVersion === "autonomous-video-review-v2" && product.productKey === item.productKey
    && product.status === "AUTO_QA_PASS" && product.machineQaPassed === true && product.finalAutomatedQaPassed === true
    && product.visualReviewExecuted === true && blockers?.length === 0
    && product.publishReady === false && product.SAFE_TO_UPLOAD === false && product.SAFE_TO_PUBLIC_UPLOAD === false
    && value.visualReviewExecuted === true && Number(value.finalAutomatedQaPassed) >= 1
    && media.passed === true;
  return { status: semanticPass ? "PASS" : "INVALID", machineQaPassed: semanticPass, finalAutomatedQaPassed: semanticPass };
}

async function inspectCodexBinding(operationRoot: string, item: LocalQueueItem, media: QueueMediaEvidence) {
  const evidence = item.reviewMetadata.evidence as CodexReviewEvidenceV2 | undefined;
  const operationBinding = item.reviewMetadata.operationBinding;
  if (evidence && operationBinding) return { status: "INVALID" as const, codexBound: false, hashBound: false, mode: "CONFLICT" as const };
  if (operationBinding) {
    try {
      const binding = await loadAndAssertImmutableReviewOperationBinding({ reference: operationBinding, item, queueRoot: operationRoot });
      const samePath = (left: string, right: string) => process.platform === "win32" ? resolve(left).toLowerCase() === resolve(right).toLowerCase() : resolve(left) === resolve(right);
      const hashBound = binding.boundVideoSha256 === media.videoSha256 && binding.boundVideoSize === media.videoSize && samePath(binding.boundVideoPath, item.videoPath);
      const codexBound = binding.bindingResult === "pass" && binding.targetQueueId === item.id && binding.targetProductKey === item.productKey
        && binding.targetSlotId === item.slotId && item.reviewMetadata.codexReview === "pass" && hashBound;
      return { status: codexBound ? "PASS" as const : "INVALID" as const, codexBound, hashBound, mode: "IMMUTABLE_CARRY_FORWARD_BINDING" as const };
    } catch {
      return { status: "INVALID" as const, codexBound: false, hashBound: false, mode: "IMMUTABLE_CARRY_FORWARD_BINDING" as const };
    }
  }
  if (!evidence || !isCodexReviewEvidenceV2(evidence)) return { status: "MISSING" as const, codexBound: false, hashBound: false, mode: "MISSING" as const };
  let artifactHash = "";
  try {
    artifactHash = await sha256File(evidence.sourceReviewArtifact);
    await assertCodexExecutorReceipt(evidence);
  } catch { return { status: "INVALID" as const, codexBound: false, hashBound: false, mode: "DIRECT_REVIEW" as const }; }
  const samePath = (left: string, right: string) => process.platform === "win32" ? resolve(left).toLowerCase() === resolve(right).toLowerCase() : resolve(left) === resolve(right);
  const reviewedAt = Date.parse(evidence.reviewedAt);
  const finishedAt = Date.parse(item.finishedAt);
  const hashBound = evidence.videoSha256 === media.videoSha256 && evidence.videoSize === media.videoSize && samePath(evidence.videoPath, item.videoPath);
  const carryoverBound = !item.operationCarryover || (evidence.originOperationNamespace === item.operationCarryover.originOperationNamespace
    && evidence.originQueueId === item.operationCarryover.originQueueId
    && evidence.originVideoSha256 === item.operationCarryover.originVideoSha256
    && evidence.originVideoSha256 === item.operationCarryover.sourceVideoHash
    && evidence.regenerationCount === item.operationCarryover.regenerationCount);
  const codexBound = evidence.schemaVersion === "queue-codex-review-evidence-v2"
    && evidence.operationNamespace === basename(resolve(operationRoot))
    && evidence.queueId === item.id && evidence.productKey === item.productKey
    && evidence.reviewerType === "codex" && evidence.executorType === "authenticated_codex_cli"
    && (evidence.reviewProvenance === "natural" || evidence.reviewProvenance === "carry_forward_revalidation")
    && evidence.reviewResult === "pass" && evidence.hardBlockers.length === 0 && evidence.safeSummary === evidence.notes
    && item.reviewMetadata.codexReview === "pass" && hashBound
    && /^[a-f0-9]{64}$/u.test(evidence.machineQaDigest) && evidence.machineQaDigest === artifactHash
    && samePath(evidence.sourceReviewArtifact, item.reviewPath)
    && Number.isFinite(reviewedAt) && (!Number.isFinite(finishedAt) || reviewedAt >= finishedAt)
    && carryoverBound;
  return { status: codexBound ? "PASS" as const : "INVALID" as const, codexBound, hashBound, mode: "DIRECT_REVIEW" as const };
}

export async function observeActivePointer(operationRoot: string, manifest: FirstOperationManifest): Promise<Level3PointerObservation> {
  const root = resolve(operationRoot);
  const path = join(dirname(root), "active-operation.json");
  const pointer = await readJson<Record<string, unknown> | null>(path, null);
  if (!pointer) return { state: "MISSING", reason: "DAILY69_ACTIVE_POINTER_MISSING" };
  const lifecycle = normalizeFirstOperationLifecycleStatus(manifest.armStatus, manifest.decision);
  const pointerLifecycle = normalizeFirstOperationLifecycleStatus(pointer.armStatus as FirstOperationManifest["armStatus"], String(pointer.decision ?? ""));
  const matches = pointer.schemaVersion === "daily69-first-operation-pointer-v2"
    && pointer.namespace === manifest.namespace
    && pointer.operationDate === manifest.operationDate
    && Number(pointer.attemptNumber ?? 1) === Number(manifest.attemptNumber ?? 1)
    && pointer.expectedGitHead === manifest.expectedGitHead
    && pointerLifecycle === lifecycle
    && basename(root) === manifest.namespace
    && pointer.SAFE_TO_UPLOAD === false;
  return matches
    ? { state: "MATCH", reason: "" }
    : { state: "MISMATCH", reason: "DAILY69_ACTIVE_POINTER_MISMATCH" };
}

export async function scanRetainedExecution(operationRoot: string, manifest: FirstOperationManifest): Promise<RetainedExecutionSummary | null> {
  const root = join(resolve(operationRoot), "retained-execution");
  const roles = ["control", "batch", "closeout"] as const;
  const records: RetainedExecutionReceipt[] = [];
  const taskBindings: RetainedTaskEventBinding[] = [];
  let malformedRecords = 0;
  let anyFile = false;
  for (const role of roles) {
    const files = await listEvidenceFiles(join(root, role));
    anyFile ||= files.length > 0;
    for (const path of files) {
      const values = await parseEvidenceFile(path);
      if (!values) { malformedRecords += 1; continue; }
      for (const value of values) {
        if (!isReceipt(value, role)) { malformedRecords += 1; continue; }
        records.push(value);
      }
    }
  }
  const taskEventFiles = await listEvidenceFiles(join(root, "task-events"));
  anyFile ||= taskEventFiles.length > 0;
  for (const path of taskEventFiles) {
    const values = await parseEvidenceFile(path);
    if (!values) { malformedRecords += 1; continue; }
    for (const value of values) {
      if (!isTaskEventBinding(value)) { malformedRecords += 1; continue; }
      taskBindings.push(value);
    }
  }
  if (!anyFile) return null;
  const duplicateInvocationIds = records.length - new Set(records.map((receipt) => `${receipt.role}:${receipt.invocationId}`)).size;
  const duplicateTaskBindings = taskBindings.length - new Set(taskBindings.map((binding) => `${binding.role}:${binding.invocationId}`)).size;
  malformedRecords += duplicateInvocationIds + duplicateTaskBindings;
  const receiptsByKey = new Map(records.map((receipt) => [`${receipt.role}:${receipt.invocationId}`, receipt]));
  const bindingsByKey = new Map(taskBindings.map((binding) => [`${binding.role}:${binding.invocationId}`, binding]));
  malformedRecords += taskBindings.filter((binding) => {
    const receipt = receiptsByKey.get(`${binding.role}:${binding.invocationId}`);
    return !receipt || normalizeTaskName(receipt.taskName) !== normalizeTaskName(binding.taskName) || receipt.processId !== binding.actionProcessId;
  }).length;
  const correlated = new Set(records.filter((receipt) => {
    const binding = bindingsByKey.get(`${receipt.role}:${receipt.invocationId}`);
    return Boolean(binding && normalizeTaskName(binding.taskName) === normalizeTaskName(receipt.taskName) && binding.actionProcessId === receipt.processId);
  }).map((receipt) => `${receipt.role}:${receipt.invocationId}`));
  const bindingMatches = records.every((receipt) => receipt.namespace === manifest.namespace
    && receipt.operationDate === manifest.operationDate && receipt.expectedGitHead === manifest.expectedGitHead);
  const summaries = Object.fromEntries(roles.map((role) => [role, summarizeRole(records.filter((receipt) => receipt.role === role), correlated)])) as Record<typeof roles[number], RetainedExecutionRoleSummary>;
  return {
    bindingMatches,
    taskEventCorrelation: records.length > 0 && correlated.size === records.length,
    malformedRecords,
    control: summaries.control,
    batch: summaries.batch,
    closeout: summaries.closeout,
  };
}

function expectedCounts(manifest: FirstOperationManifest, batchSize: number): Level3CompletionInput["expected"] {
  const declaredBatchSize = manifest.batchSize ?? batchSize;
  const prevalidatedReady = Number(manifest.prevalidatedReady);
  const scheduledRemaining = Number(manifest.scheduledRemaining);
  const total = prevalidatedReady + scheduledRemaining;
  const scheduledBatchRuns = Math.ceil(scheduledRemaining / declaredBatchSize);
  if (![prevalidatedReady, scheduledRemaining, total, manifest.reserve, manifest.distinct, declaredBatchSize].every((value) => Number.isInteger(value) && value >= 0)
    || declaredBatchSize < 1 || (manifest.batchSize !== undefined && manifest.batchSize !== batchSize) || total < 1 || manifest.schedule.length !== scheduledBatchRuns) {
    throw new Error("DAILY69_MANIFEST_EXPECTED_COUNTS_INVALID");
  }
  return { total, prevalidatedReady, scheduledRemaining, reserve: manifest.reserve, distinct: manifest.distinct, batchSize: declaredBatchSize, scheduledBatchRuns };
}

function summarizeRole(receipts: RetainedExecutionReceipt[], correlated: Set<string>): RetainedExecutionRoleSummary {
  return {
    started: receipts.filter((receipt) => validTimestamp(receipt.startedAt)).length,
    completed: receipts.filter((receipt) => validTimestamp(receipt.completedAt) && Date.parse(receipt.completedAt) >= Date.parse(receipt.startedAt)).length,
    correlated: receipts.filter((receipt) => correlated.has(`${receipt.role}:${receipt.invocationId}`)).length,
    succeeded: receipts.filter((receipt) => receipt.exitCode === 0).length,
  };
}

function isTaskEventBinding(value: unknown): value is RetainedTaskEventBinding {
  if (!value || typeof value !== "object") return false;
  const binding = value as Partial<RetainedTaskEventBinding>;
  const required = [...TASK_PROVENANCE_EVENT_IDS].sort((left, right) => left - right);
  const observed = Array.isArray(binding.observedEventIds) ? [...binding.observedEventIds].sort((left, right) => left - right) : [];
  return binding.schemaVersion === "daily69-task-event-binding-v1"
    && ["control", "batch", "closeout"].includes(String(binding.role))
    && typeof binding.invocationId === "string" && /^[A-Za-z0-9_-]{8,128}$/u.test(binding.invocationId)
    && typeof binding.taskName === "string" && binding.taskName.length > 0
    && typeof binding.taskInstanceId === "string" && binding.taskInstanceId.length > 0
    && Number.isSafeInteger(binding.actionProcessId) && Number(binding.actionProcessId) > 0
    && binding.origin === "NATURAL_SCHEDULED" && binding.resultCodesPass === true
    && Array.isArray(binding.eventRecordIds) && binding.eventRecordIds.length === required.length
    && binding.eventRecordIds.every((id) => Number.isSafeInteger(id) && id > 0)
    && new Set(binding.eventRecordIds).size === binding.eventRecordIds.length
    && Array.isArray(binding.requiredEventIds) && JSON.stringify([...binding.requiredEventIds].sort((left, right) => left - right)) === JSON.stringify(required)
    && JSON.stringify(observed) === JSON.stringify(required);
}

function isReceipt(value: unknown, role: RetainedExecutionReceipt["role"]): value is RetainedExecutionReceipt {
  if (!value || typeof value !== "object") return false;
  const receipt = value as Partial<RetainedExecutionReceipt>;
  return receipt.schemaVersion === RETAINED_EXECUTION_RECEIPT_SCHEMA && receipt.role === role
    && typeof receipt.invocationId === "string" && /^[A-Za-z0-9_-]{8,128}$/u.test(receipt.invocationId)
    && typeof receipt.namespace === "string" && typeof receipt.operationDate === "string"
    && typeof receipt.expectedGitHead === "string" && /^[a-f0-9]{40}$/u.test(receipt.expectedGitHead)
    && typeof receipt.taskName === "string" && receipt.taskName.length > 0
    && (receipt.processId === undefined || (Number.isSafeInteger(receipt.processId) && Number(receipt.processId) > 0))
    && typeof receipt.startedAt === "string" && validTimestamp(receipt.startedAt)
    && typeof receipt.completedAt === "string" && validTimestamp(receipt.completedAt)
    && typeof receipt.exitCode === "number" && Number.isInteger(receipt.exitCode)
    && Boolean(receipt.taskEvent) && typeof receipt.taskEvent?.correlated === "boolean"
    && Number.isInteger(receipt.taskEvent?.startedEventId) && Number.isInteger(receipt.taskEvent?.completedEventId);
}

async function readRetainedExecutionReceipts(operationRoot: string) {
  const root = join(operationRoot, "retained-execution");
  const roles = ["control", "batch", "closeout"] as const;
  const records: RetainedExecutionReceipt[] = [];
  let malformed = 0;
  const seen = new Set<string>();
  for (const role of roles) {
    for (const path of await listEvidenceFiles(join(root, role))) {
      const values = await parseEvidenceFile(path);
      if (!values) { malformed += 1; continue; }
      for (const value of values) {
        if (!isReceipt(value, role)) { malformed += 1; continue; }
        const key = `${value.role}:${value.invocationId}`;
        if (seen.has(key)) { malformed += 1; continue; }
        seen.add(key);
        records.push(value);
      }
    }
  }
  return { records, malformed };
}

async function readRetainedTaskEventBindings(operationRoot: string) {
  const records: RetainedTaskEventBinding[] = [];
  const byKey = new Map<string, RetainedTaskEventBinding>();
  let malformed = 0;
  for (const path of await listEvidenceFiles(join(operationRoot, "retained-execution", "task-events"))) {
    const values = await parseEvidenceFile(path);
    if (!values) { malformed += 1; continue; }
    for (const value of values) {
      if (!isTaskEventBinding(value)) { malformed += 1; continue; }
      const key = `${value.role}:${value.invocationId}`;
      if (byKey.has(key)) { malformed += 1; continue; }
      byKey.set(key, value);
      records.push(value);
    }
  }
  return { records, byKey, malformed };
}

async function createNewJson(path: string, value: unknown) {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(path, "wx");
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const existing = await readJson<unknown>(path, null);
    if (JSON.stringify(existing) !== JSON.stringify(value)) throw new Error("DAILY69_TASK_EVENT_BINDING_CONFLICT");
  } finally {
    await handle?.close();
  }
}

async function listEvidenceFiles(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && /\.(?:json|jsonl)$/u.test(entry.name)).map((entry) => join(root, entry.name)).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function parseEvidenceFile(path: string): Promise<unknown[] | null> {
  try {
    const content = await readFile(path, "utf8");
    if (path.endsWith(".jsonl")) return content.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line) as unknown);
    const value = JSON.parse(content) as unknown;
    return Array.isArray(value) ? value : [value];
  } catch {
    return null;
  }
}

function closeoutReportGate(closeout: Record<string, unknown> | null, manifest: FirstOperationManifest, recomputed: Level3CompletionMatrix): Level3Gate {
  if (!closeout) return { id: "closeout_report", state: "UNPROVEN", expected: "retained closeout report", actual: "missing", reason: "DAILY69_CLOSEOUT_REPORT_MISSING", severity: "completion" };
  const matrix = closeout.matrix as { completion?: unknown } | undefined;
  const matches = closeout.namespace === manifest.namespace && closeout.operationDate === manifest.operationDate
    && closeout.expectedGitHead === manifest.expectedGitHead && matrix?.completion === recomputed.completion;
  return matches
    ? { id: "closeout_report", state: "PASS", expected: recomputed.completion, actual: String(matrix?.completion), reason: "", severity: "integrity" }
    : { id: "closeout_report", state: "FAIL", expected: `${manifest.namespace}:${manifest.operationDate}:${manifest.expectedGitHead}:${recomputed.completion}`, actual: "mismatch", reason: "DAILY69_CLOSEOUT_REPORT_MISMATCH", severity: "integrity" };
}

function appendGate(matrix: Level3CompletionMatrix, extra: Level3Gate): Level3CompletionMatrix {
  const gates = [...matrix.gates, extra];
  const failed = gates.filter((gate) => gate.state === "FAIL").length;
  const unproven = gates.filter((gate) => gate.state === "UNPROVEN").length;
  return {
    ...matrix,
    completion: failed > 0 ? "FAILED" : unproven > 0 ? "PENDING" : "PASS",
    pass: gates.length - failed - unproven,
    failed,
    unproven,
    gates,
    blockers: gates.filter((gate) => gate.state !== "PASS").map((gate) => gate.reason),
  };
}

function validTimestamp(value: string) { return Number.isFinite(Date.parse(value)); }
function hash(value: string | Buffer) { return createHash("sha256").update(value).digest("hex"); }
function normalizeTaskName(value: string) { const trimmed = value.trim(); return (trimmed.startsWith("\\") ? trimmed : `\\${trimmed}`).toLowerCase(); }
function isMissingFileError(error: unknown) { return (error as NodeJS.ErrnoException | undefined)?.code === "ENOENT"; }
