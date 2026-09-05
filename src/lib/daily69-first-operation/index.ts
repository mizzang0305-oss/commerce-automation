import { createHash } from "node:crypto";
import { mkdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { buildAffiliateReadinessReport, type AffiliateReadinessReport } from "@/lib/affiliate-readiness";
import { atomicWriteJson, readJson } from "@/lib/queue-scheduler/atomicJson";
import { inspectQueueMediaEvidence } from "@/lib/queue-scheduler/mediaEvidence";
import { LocalQueueRepository } from "@/lib/queue-scheduler/repository";
import type { LocalQueueItem, QueueSchedulerSettings, ReserveCandidate } from "@/lib/queue-scheduler/types";
import {
  preflightDaily69MaterializationEligibility,
  validateUsageEvidenceRegistry,
  type Daily69MaterializationPreflight,
  type UsageEvidenceRegistry,
} from "@/lib/usage-evidence";
import { normalizeFirstOperationLifecycleStatus, validateLevel3Completion, type FirstOperationLifecycleStatus, type LegacyFirstOperationLifecycleStatus, type Level3RetainedEvidence } from "./level3";
import type { Level3SheetsAuditGateway } from "./postCloseout";
import { assertFirstOperationIdentity, firstOperationNamespace, isFirstOperationDate } from "./operationIdentity";
import { assertCodexRuntimeBinding, type CodexRuntimeBinding } from "@/lib/queue-scheduler/codexRuntimeBinding";

export const FIRST_OPERATION_DECISION = "NO_UPLOAD_DAILY69_FIRST_OPERATION_DAY_ARMED" as const;
export const FIRST_OPERATION_MODE = "no_upload_daily69_first_operation" as const;
export const FIRST_OPERATION_SOURCE_DECISION = "COUPANG_IMAGE_SKILL_USAGE_SCENES_V5_PROVEN_DAILY69_CAPACITY" as const;
export const FIRST_OPERATION_ARM_STATUSES = ["prepared", "projection_verified", "tasks_armed", "running", "closing", "closed_success", "closed_failed", "held"] as const;
export type FirstOperationArmStatus = FirstOperationLifecycleStatus;

const SOURCE_FILES = [
  "queue.json", "reserve-pool.json", "settings.json", "runs.json", "control-state.json",
  "source-proof.json", "selected-registry.json", "final-summary.json"
] as const;
const SOURCE_ADMISSION_FILES = ["queue.json", "reserve-pool.json", "settings.json", "source-proof.json", "selected-registry.json"] as const;

export type FirstOperationManifest = {
  schemaVersion: "daily69-first-operation-v1" | "daily69-first-operation-v2";
  decision: typeof FIRST_OPERATION_DECISION | "NO_UPLOAD_DAILY69_FIRST_OPERATION_DAY_CLOSEOUT_PENDING" | "NO_UPLOAD_DAILY69_FIRST_OPERATION_DAY_CLOSEOUT_FAILED" | "NO_UPLOAD_DAILY69_FIRST_OPERATION_DAY_PROVEN";
  operationDate: string;
  armedAt: string;
  expectedGitHead: string;
  namespace: string;
  attemptNumber?: number;
  previousAttemptNamespace?: string;
  armStatus?: FirstOperationArmStatus | LegacyFirstOperationLifecycleStatus;
  sourceNamespace: string;
  sourceAssetBoundaryRoot?: string;
  usageMaterializationAssetRoot?: string;
  sourceDecision: typeof FIRST_OPERATION_SOURCE_DECISION;
  sourceFileHashes: Record<string, string>;
  sourceAssetHashes: Record<string, string>;
  sourceBundleHash: string;
  sourceHashAfterClone: string;
  originalMutated: false;
  prevalidatedReady: number;
  carryForwardCandidateCount?: number;
  verifiedReady?: number;
  scheduledRemaining: number;
  batchSize?: number;
  reserve: number;
  distinct: number;
  schedule: Array<{ hourKst: number; slots: string[] }>;
  affiliateReadiness?: AffiliateReadinessReport;
  reviewBindingContract?: {
    schemaVersion: "daily69-immutable-review-operation-binding-registry-v1";
    originRegistrySha256: string;
    bindingsPassed: number;
    fakeReviewedAtMutations: 0;
    aiReviewExecutions: 0;
  };
  materializationEligibility?: Daily69MaterializationPreflight;
  codexReviewRuntime?: CodexRuntimeBinding;
  safety: { SAFE_TO_UPLOAD: false; SAFE_TO_PUBLIC_UPLOAD: false; PLATFORM_UPLOAD: 0; GOOGLE_DRIVE_WRITE: 0; PRODUCTION_DB_WRITE: 0; R2_WRITE: 0 };
  closeout?: { closedAt: string; completion?: "PASS" | "PENDING" | "FAILED"; firstOperationReady: boolean; continuousDaily69Ready: boolean; reviewPending: number; decision: string };
};

export async function armFirstOperation(input: {
  sourceRoot: string;
  operationBase: string;
  now: Date;
  expectedGitHead: string;
  assetBoundaryRoot?: string;
  usageMaterializationAssetRoot: string;
  operationDate?: string;
  namespace?: string;
  attemptNumber?: number;
  previousAttemptNamespace?: string;
  codexReviewRuntime?: CodexRuntimeBinding;
}) {
  if (input.codexReviewRuntime) assertCodexRuntimeBinding(input.codexReviewRuntime);
  const operationDate = input.operationDate ?? nextKstDate(input.now);
  if (!isFirstOperationDate(operationDate)) throw new Error("FIRST_OPERATION_DATE_INVALID");
  if (operationDate <= kstDate(input.now)) throw new Error("TARGET_OPERATION_DATE_WINDOW_MISSED");
  const attemptNumber = input.attemptNumber ?? 1;
  const canonicalNamespace = firstOperationNamespace(operationDate, attemptNumber);
  const namespace = input.namespace ?? canonicalNamespace;
  if (namespace !== canonicalNamespace) throw new Error("FIRST_OPERATION_NAMESPACE_ATTEMPT_MISMATCH");
  const previousAttemptNamespace = input.previousAttemptNamespace?.trim() ?? "";
  assertFirstOperationIdentity({ namespace, operationDate, attemptNumber, previousAttemptNamespace });
  const operationRoot = resolve(input.operationBase, namespace);
  const sourceRoot = resolve(input.sourceRoot);
  const sourceAssetBoundaryRoot = resolve(input.assetBoundaryRoot ?? sourceRoot);
  if (escapesRoot(sourceAssetBoundaryRoot, sourceRoot)) throw new Error("FIRST_OPERATION_SOURCE_BOUNDARY_INVALID");
  const usageMaterializationAssetRoot = resolve(input.usageMaterializationAssetRoot);
  const source = await readSource(sourceRoot);
  const sourceReadiness = assertSource(source);
  const materializationEligibility = await preflightDaily69MaterializationEligibility({
    active: source.queue,
    reserve: source.reserve,
    registry: source.registry,
    assetRoot: usageMaterializationAssetRoot,
    requiredActive: 69,
    requiredReserve: 14,
  });
  if (!materializationEligibility.pass) throw new Error(materializationEligibility.safeCode);
  const existing = await readJson<FirstOperationManifest | null>(join(operationRoot, "operation-manifest.json"), null);
  if (existing) {
    if (existing.operationDate !== operationDate || existing.expectedGitHead !== input.expectedGitHead || existing.namespace !== namespace
      || (existing.attemptNumber ?? 1) !== attemptNumber || (existing.previousAttemptNamespace ?? "") !== previousAttemptNamespace
      || resolve(existing.usageMaterializationAssetRoot ?? "") !== usageMaterializationAssetRoot
      || JSON.stringify(existing.codexReviewRuntime) !== JSON.stringify(input.codexReviewRuntime)) {
      throw new Error("FIRST_OPERATION_EXISTING_MANIFEST_MISMATCH");
    }
    await verifySourceBundle(input.sourceRoot, existing, input.assetBoundaryRoot);
    await verifyFirstOperationMaterializationEligibility(operationRoot);
    return { operationRoot, manifest: existing, idempotent: true };
  }

  const affiliateReadiness = sourceReadiness.affiliateReadiness;
  const before = await sourceBundle(sourceRoot, source.queue, sourceAssetBoundaryRoot);
  assertLoadedSourceFileHashes(source.loadedFileHashes, before.fileHashes);
  const armedAt = input.now.toISOString();
  const batchSize = 3;
  const schedule = scheduleGroups(sourceReadiness.scheduled, batchSize, 4);
  const scheduledHourBySlot = new Map(schedule.flatMap((group) => group.slots.map((slotId) => [slotId, group.hourKst] as const)));
  const sourceNamespace = basename(sourceRoot);
  const carryForwardOriginNamespace = source.proof.parentSourceNamespace?.trim() || sourceNamespace;
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(carryForwardOriginNamespace)) throw new Error("FIRST_OPERATION_SOURCE_PARENT_NAMESPACE_INVALID");
  const queue = source.queue.map((item) => cloneQueueItem(item, operationDate, armedAt, carryForwardOriginNamespace, before.assetHashes, sourceReadiness.readyIds, scheduledHourBySlot));
  const reserve = source.reserve.map((item) => ({ ...item, queueDate: operationDate, claimedBySlot: "", claimedAt: "" }));
  const settings: QueueSchedulerSettings = {
    ...source.settings,
    mode: FIRST_OPERATION_MODE,
    dailyTargetCount: 69,
    pilotMaxDailyItems: 69,
    processingDailyCap: 69,
    batchSize,
    intervalHours: 1,
    startHour: 4,
    endHour: schedule.length > 0 ? schedule[schedule.length - 1].hourKst : 4,
    minimumFreeGb: 20,
    maxAttempts: 2,
    maxProductCandidates: 3,
    uploadEnabled: false,
    enabled: true,
    isPaused: false,
    observationMode: true,
    autoPauseAfterObservation: true
  };

  await mkdir(resolve(input.operationBase), { recursive: true });
  await mkdir(operationRoot, { recursive: false });
  await Promise.all(["batch-results", "review-spool", "artifacts", "closeout", "shadow-next-day", "task-definitions"].map((name) => mkdir(join(operationRoot, name))));
  await Promise.all([
    atomicWriteJson(join(operationRoot, "queue.json"), queue),
    atomicWriteJson(join(operationRoot, "reserve-pool.json"), reserve),
    atomicWriteJson(join(operationRoot, "settings.json"), settings),
    atomicWriteJson(join(operationRoot, "runs.json"), []),
    atomicWriteJson(join(operationRoot, "control-state.json"), { localRevision: 1, projectionRevision: 0, snapshotHash: "", projectedAt: "", source: "local_queue_scheduler" }),
    atomicWriteJson(join(operationRoot, "control-state-initial.json"), { enabled: true, isPaused: false, observationMode: true, uploadEnabled: false, SAFE_TO_UPLOAD: false }),
    atomicWriteJson(join(operationRoot, "selected-registry.json"), source.registry)
  ]);

  const after = await sourceBundle(sourceRoot, source.queue, sourceAssetBoundaryRoot);
  if (after.bundleHash !== before.bundleHash) throw new Error("SOURCE_PROOF_MUTATED_DURING_CLONE");
  const manifest: FirstOperationManifest = {
    schemaVersion: "daily69-first-operation-v2",
    decision: FIRST_OPERATION_DECISION,
    operationDate,
    armedAt,
    expectedGitHead: input.expectedGitHead,
    namespace,
    attemptNumber,
    previousAttemptNamespace,
    armStatus: "prepared",
    sourceNamespace,
    sourceAssetBoundaryRoot,
    usageMaterializationAssetRoot,
    sourceDecision: FIRST_OPERATION_SOURCE_DECISION,
    sourceFileHashes: before.fileHashes,
    sourceAssetHashes: before.assetHashes,
    sourceBundleHash: before.bundleHash,
    sourceHashAfterClone: after.bundleHash,
    originalMutated: false,
    prevalidatedReady: sourceReadiness.ready.length,
    carryForwardCandidateCount: sourceReadiness.ready.length,
    verifiedReady: 0,
    scheduledRemaining: sourceReadiness.scheduled.length,
    batchSize,
    reserve: source.reserve.length,
    distinct: source.proof.distinct ?? new Set([...source.queue.map((item) => item.productKey), ...source.reserve.map((item) => item.candidate.productKey)]).size,
    schedule,
    affiliateReadiness,
    materializationEligibility,
    ...(input.codexReviewRuntime ? { codexReviewRuntime: input.codexReviewRuntime } : {}),
    safety: { SAFE_TO_UPLOAD: false, SAFE_TO_PUBLIC_UPLOAD: false, PLATFORM_UPLOAD: 0, GOOGLE_DRIVE_WRITE: 0, PRODUCTION_DB_WRITE: 0, R2_WRITE: 0 }
  };
  await atomicWriteJson(join(operationRoot, "operation-manifest.json"), manifest);
  return { operationRoot, manifest, idempotent: false };
}

export async function transitionFirstOperationArmStatus(operationRoot: string, next: FirstOperationArmStatus) {
  const root = resolve(operationRoot);
  const manifestPath = join(root, "operation-manifest.json");
  const manifest = await readJson<FirstOperationManifest | null>(manifestPath, null);
  if (!manifest || manifest.schemaVersion !== "daily69-first-operation-v2" || !manifest.armStatus) throw new Error("FIRST_OPERATION_ARM_CONTRACT_NOT_FOUND");
  const current = normalizeFirstOperationLifecycleStatus(manifest.armStatus, manifest.decision);
  const allowed: Record<FirstOperationArmStatus, readonly FirstOperationArmStatus[]> = {
    prepared: ["projection_verified", "closing", "held"],
    projection_verified: ["tasks_armed", "closing", "held"],
    tasks_armed: ["running", "closing", "held"],
    running: ["closing", "held"],
    closing: ["closed_success", "closed_failed", "held"],
    closed_success: [],
    closed_failed: [],
    held: [],
  };
  if (current === next) return manifest;
  if (!allowed[current].includes(next)) throw new Error(`FIRST_OPERATION_ARM_STATUS_TRANSITION_INVALID:${current}:${next}`);
  if (["tasks_armed", "running", "closing"].includes(current)) await assertActivePointerConsistency(root, manifest, current);
  const updated: FirstOperationManifest = { ...manifest, armStatus: next };
  await atomicWriteJson(manifestPath, updated);
  if (["tasks_armed", "running", "closing"].includes(current)) await writeActivePointer(root, updated);
  return updated;
}

export async function promoteFirstOperationActivePointer(operationRoot: string) {
  const root = resolve(operationRoot);
  const manifest = await readJson<FirstOperationManifest | null>(join(root, "operation-manifest.json"), null);
  if (!manifest || manifest.schemaVersion !== "daily69-first-operation-v2" || manifest.armStatus !== "tasks_armed") throw new Error("FIRST_OPERATION_ACTIVE_POINTER_PROMOTION_FORBIDDEN");
  if (basename(root) !== manifest.namespace) throw new Error("FIRST_OPERATION_ROOT_NAMESPACE_MISMATCH");
  const existing = await readJson<Record<string, unknown> | null>(join(dirname(root), "active-operation.json"), null);
  if (existing && !pointerMatchesManifest(existing, manifest, "tasks_armed")) await assertExistingPointerTerminalInactive(root, existing);
  return writeActivePointer(root, manifest);
}

export async function verifySourceBundle(sourceRoot: string, manifest: FirstOperationManifest, assetBoundaryRoot?: string) {
  const recordedBoundary = resolve(manifest.sourceAssetBoundaryRoot ?? sourceRoot);
  if (assetBoundaryRoot && resolve(assetBoundaryRoot) !== recordedBoundary) throw new Error("FIRST_OPERATION_SOURCE_BOUNDARY_MISMATCH");
  if (escapesRoot(recordedBoundary, sourceRoot)) throw new Error("FIRST_OPERATION_SOURCE_BOUNDARY_INVALID");
  const source = await readSource(resolve(sourceRoot));
  const actual = await sourceBundle(resolve(sourceRoot), source.queue, recordedBoundary);
  if (actual.bundleHash !== manifest.sourceBundleHash) throw new Error("SOURCE_PROOF_HASH_MISMATCH");
  return actual;
}

export async function firstOperationStatus(operationRoot: string) {
  const root = resolve(operationRoot);
  const repository = new LocalQueueRepository(root);
  const [items, reserve, settings, state, runs, manifest] = await Promise.all([
    repository.items(), repository.reserveCandidates(), repository.settings(), repository.controlState(), repository.runs(),
    readJson<FirstOperationManifest | null>(join(root, "operation-manifest.json"), null)
  ]);
  if (!manifest) throw new Error("FIRST_OPERATION_MANIFEST_NOT_FOUND");
  const count = (status: LocalQueueItem["status"]) => items.filter((item) => item.status === status).length;
  const unresolvedLeases = items.filter((item) => Boolean(item.leaseOwner || item.leaseExpiresAt)).length;
  const duplicateRenders = duplicateNonEmpty(items.map((item) => item.videoPath));
  const staleLocks = (await Promise.all(["runner.lock", "queue.mutation.lock", "runs.mutation.lock", "command-runner.lock"].map(async (name) => {
    try { return (await stat(join(root, name))).isFile(); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
  }))).filter(Boolean).length;
  const unionProducts = new Set([...items.map((item) => item.productKey), ...reserve.map((item) => item.candidate.productKey)]);
  const affiliateReadiness = buildAffiliateReadinessReport(items);
  const status = {
    namespace: manifest.namespace,
    operationDate: manifest.operationDate,
    total: items.length,
    ready: count("video_ready_autoqa"),
    machineOnly: count("video_ready_machine_qa"),
    reviewPending: items.filter((item) => item.status === "video_ready_machine_qa" && item.reviewMetadata.codexReview === "not_executed").length,
    scheduled: count("scheduled"),
    processing: count("claimed") + count("processing"),
    retry: count("retry_wait"),
    blocked: count("blocked"),
    failed: count("failed"),
    skipped: count("skipped"),
    reserve: reserve.filter((item) => !item.claimedBySlot).length,
    distinct: unionProducts.size,
    unresolvedLeases,
    staleLocks,
    duplicateRenders,
    codexReviews: items.filter((item) => item.reviewMetadata.codexReview === "pass").length,
    directReviewBindings: items.filter((item) => item.reviewMetadata.codexReview === "pass" && Boolean(item.reviewMetadata.evidence) && !item.reviewMetadata.operationBinding).length,
    immutableCarryForwardBindings: items.filter((item) => item.reviewMetadata.codexReview === "pass" && Boolean(item.reviewMetadata.operationBinding) && !item.reviewMetadata.evidence).length,
    reviewEvidenceModeConflicts: items.filter((item) => item.reviewMetadata.codexReview === "pass"
      && Boolean(item.reviewMetadata.evidence) === Boolean(item.reviewMetadata.operationBinding)).length,
    productBindingMismatches: items.filter((item) => item.usageEvidenceAllocation?.productKey !== item.productKey).length,
    affiliateReady: affiliateReadiness.affiliateReady,
    affiliateMissing: affiliateReadiness.affiliateMissing,
    affiliateInvalid: affiliateReadiness.affiliateInvalid,
    affiliateReadyForArm: affiliateReadiness.readyForArm,
    localRevision: state.localRevision,
    projectionRevision: state.projectionRevision,
    hashPresent: Boolean(state.snapshotHash),
    runCount: runs.length,
    settings: { enabled: settings.enabled, isPaused: settings.isPaused, uploadEnabled: settings.uploadEnabled, observationMode: settings.observationMode, autoPauseAfterObservation: settings.autoPauseAfterObservation },
    SAFE_TO_UPLOAD: false as const,
    PLATFORM_UPLOAD: 0 as const
  };
  return { manifest, items, reserve, settings, state, runs, status };
}

export async function verifyFirstOperationMaterializationEligibility(operationRoot: string) {
  const snapshot = await firstOperationStatus(operationRoot);
  if (!snapshot.manifest.usageMaterializationAssetRoot) throw new Error("USAGE_MATERIALIZATION_ASSET_ROOT_REQUIRED");
  const registry = validateUsageEvidenceRegistry(await readRequired<UsageEvidenceRegistry>(join(resolve(operationRoot), "selected-registry.json")));
  const preflight = await preflightDaily69MaterializationEligibility({
    active: snapshot.items,
    reserve: snapshot.reserve,
    registry,
    assetRoot: resolve(snapshot.manifest.usageMaterializationAssetRoot),
    requiredActive: 69,
    requiredReserve: snapshot.settings.minimumReserveCount,
  });
  if (!preflight.pass) throw new Error(preflight.safeCode);
  return preflight;
}

export async function closeoutFirstOperation(operationRoot: string, dependencies: {
  now?: () => Date;
  inspectMedia?: typeof inspectQueueMediaEvidence;
  sheetsGateway?: Level3SheetsAuditGateway;
} = {}) {
  const root = resolve(operationRoot);
  await assertNoRunnerLock(root);
  const snapshot = await firstOperationStatus(root);
  const repository = new LocalQueueRepository(root);
  await repository.writeSettings({ ...snapshot.settings, enabled: false, isPaused: true });
  let refreshed = await firstOperationStatus(root);
  const lifecycle = normalizeFirstOperationLifecycleStatus(refreshed.manifest.armStatus, refreshed.manifest.decision);
  if (!["closing", "closed_success", "closed_failed", "held"].includes(lifecycle)) {
    await transitionFirstOperationArmStatus(root, "closing");
    refreshed = await firstOperationStatus(root);
  }
  const { captureLevel3RetainedEvidence, collectLevel3CompletionInput } = await import("./postCloseout");
  let retainedEvidence: Level3RetainedEvidence | null = null;
  try { retainedEvidence = await captureLevel3RetainedEvidence(root, dependencies.sheetsGateway); } catch { retainedEvidence = null; }
  const input = await collectLevel3CompletionInput(root, refreshed, { inspectMedia: dependencies.inspectMedia ?? inspectQueueMediaEvidence, retainedEvidenceOverride: retainedEvidence });
  const matrix = validateLevel3Completion(input);
  const firstOperationReady = matrix.completion === "PASS";
  const continuousDaily69Ready = firstOperationReady;
  if (firstOperationReady) {
    await atomicWriteJson(join(root, "shadow-next-day", "proof.json"), {
      schemaVersion: "daily69-next-day-shadow-v1", operationDate: nextKstDate(new Date(`${refreshed.manifest.operationDate}T00:00:00+09:00`)),
      providerCalls: 0, secondScoutApiCalls: 0, active: input.expected.total, reserve: refreshed.status.reserve, distinct: refreshed.status.distinct,
      policiesPass: refreshed.status.productBindingMismatches === 0, operationalQueueMutations: 0, readyForContinuousDailyRun: continuousDaily69Ready,
      SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0
    });
  }
  const decision = matrix.completion === "PASS"
    ? "NO_UPLOAD_DAILY69_FIRST_OPERATION_DAY_PROVEN"
    : matrix.completion === "FAILED"
      ? "NO_UPLOAD_DAILY69_FIRST_OPERATION_DAY_CLOSEOUT_FAILED"
      : "NO_UPLOAD_DAILY69_FIRST_OPERATION_DAY_CLOSEOUT_PENDING";
  const closedAt = snapshot.manifest.closeout?.closedAt || (dependencies.now?.() ?? new Date()).toISOString();
  const armStatus: FirstOperationArmStatus = matrix.completion === "PASS" ? "closed_success" : matrix.completion === "FAILED" ? "closed_failed" : "closing";
  const manifest: FirstOperationManifest = { ...refreshed.manifest, decision, armStatus, closeout: { closedAt, completion: matrix.completion, firstOperationReady, continuousDaily69Ready, reviewPending: refreshed.status.reviewPending, decision } };
  await atomicWriteJson(join(root, "operation-manifest.json"), manifest);
  await synchronizeActivePointerIfPresent(root, refreshed.manifest, manifest);
  await atomicWriteJson(join(root, "closeout", "closeout-report.json"), {
    schemaVersion: "daily69-first-operation-closeout-v2",
    namespace: manifest.namespace,
    operationDate: manifest.operationDate,
    expectedGitHead: manifest.expectedGitHead,
    decision,
    completion: matrix.completion,
    firstOperationReady,
    continuousDaily69Ready,
    status: refreshed.status,
    matrix,
    tasksMustBeDisabled: true,
    uploadCalls: 0,
    driveCalls: 0,
    dbWrites: 0,
    r2Writes: 0,
    platformCalls: 0,
  });
  return { decision, completion: matrix.completion, firstOperationReady, continuousDaily69Ready, status: refreshed.status, matrix };
}

export function nextKstDate(now: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now.getTime() + 24 * 60 * 60_000));
}

function kstDate(now: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function scheduleGroups(items: LocalQueueItem[], batchSize: number, startHour: number): FirstOperationManifest["schedule"] {
  if (!Number.isInteger(batchSize) || batchSize < 1 || !Number.isInteger(startHour) || startHour < 0) throw new Error("FIRST_OPERATION_SOURCE_SCHEDULE_INVALID");
  const ordered = [...items].sort((left, right) => left.queueRank - right.queueRank || left.slotId.localeCompare(right.slotId));
  const groups = Array.from({ length: Math.ceil(ordered.length / batchSize) }, (_, index) => ({
    hourKst: startHour + index,
    slots: ordered.slice(index * batchSize, (index + 1) * batchSize).map((item) => item.slotId),
  }));
  if (groups.some((group) => group.hourKst > 23)) throw new Error("FIRST_OPERATION_SOURCE_SCHEDULE_WINDOW_EXCEEDED");
  return groups;
}

function cloneQueueItem(
  item: LocalQueueItem,
  operationDate: string,
  armedAt: string,
  carryForwardOriginNamespace: string,
  assetHashes: Record<string, string>,
  readyIds: Set<string>,
  scheduledHourBySlot: Map<string, number>,
): LocalQueueItem {
  if (readyIds.has(item.id)) {
    const priorCarryover = item.operationCarryover;
    const originOperationNamespace = priorCarryover?.originOperationNamespace || carryForwardOriginNamespace;
    const originQueueId = priorCarryover?.originQueueId || item.id;
    const originVideoSha256 = priorCarryover?.originVideoSha256 || assetHashes[`${item.slotId}:video`] || "";
    return {
      ...item,
      queueDate: operationDate,
      status: "video_ready_machine_qa",
      safeMessage: "CARRY_FORWARD_REQUIRES_FRESH_CODEX_BINDING",
      reviewMetadata: { codexReview: "not_executed" },
      updatedAt: armedAt,
      localRevision: 1,
      operationCarryover: {
        prevalidatedCanary: true,
        sourceCanaryRunId: priorCarryover?.sourceCanaryRunId || carryForwardOriginNamespace,
        originOperationNamespace,
        originQueueId,
        sourceVideoHash: assetHashes[`${item.slotId}:video`] ?? "",
        originVideoSha256,
        sourceReviewHash: assetHashes[`${item.slotId}:review`] ?? "",
        carriedIntoOperationDate: operationDate,
        regenerationCount: priorCarryover?.regenerationCount ?? 0,
      } as LocalQueueItem["operationCarryover"]
    };
  }
  const hour = scheduledHourBySlot.get(item.slotId);
  if (!Number.isInteger(hour)) throw new Error("FIRST_OPERATION_SOURCE_SCHEDULE_INVALID");
  return {
    ...item,
    queueDate: operationDate,
    scheduledAt: new Date(`${operationDate}T${String(hour).padStart(2, "0")}:00:00+09:00`).toISOString(),
    status: "scheduled",
    attemptCount: 0,
    productCandidateAttempt: 1,
    leaseOwner: "",
    leaseAcquiredAt: "",
    leaseExpiresAt: "",
    nextAttemptAt: "",
    claimedAt: "",
    startedAt: "",
    finishedAt: "",
    creativeScore: null,
    videoQualityScore: null,
    videoPath: "",
    reviewPath: "",
    errorCode: "",
    safeMessage: "FIRST_OPERATION_SCHEDULED",
    reviewMetadata: { codexReview: "not_executed" },
    updatedAt: armedAt,
    localRevision: 1,
    operationCarryover: undefined
  };
}

async function readSource(root: string) {
  const loadedFiles = new Map(await Promise.all(SOURCE_ADMISSION_FILES.map(async (name) => [name, await readFile(join(root, name))] as const)));
  const loadedFileHashes = Object.fromEntries([...loadedFiles].map(([name, bytes]) => [name, hash(bytes)]));
  return {
    queue: parseJson<LocalQueueItem[]>(loadedFiles.get("queue.json")!),
    reserve: parseJson<ReserveCandidate[]>(loadedFiles.get("reserve-pool.json")!),
    settings: parseJson<QueueSchedulerSettings>(loadedFiles.get("settings.json")!),
    proof: parseJson<{ decision?: string; active?: number; reserve?: number; distinct?: number; sourceMutation?: number; parentSourceNamespace?: string }>(loadedFiles.get("source-proof.json")!),
    registry: validateUsageEvidenceRegistry(parseJson<UsageEvidenceRegistry>(loadedFiles.get("selected-registry.json")!)),
    loadedFileHashes,
  };
}

function assertLoadedSourceFileHashes(loaded: Record<string, string>, bundled: Record<string, string>) {
  if (SOURCE_ADMISSION_FILES.some((name) => loaded[name] !== bundled[name])) {
    throw new Error("SOURCE_PROOF_MUTATED_BEFORE_CLONE");
  }
}

function assertSource(source: Awaited<ReturnType<typeof readSource>>) {
  const ready = source.queue.filter((item) => item.status === "video_ready_autoqa" && item.reviewMetadata.codexReview === "pass");
  const scheduled = source.queue.filter((item) => item.status === "scheduled");
  if (source.proof.decision !== FIRST_OPERATION_SOURCE_DECISION || source.proof.active !== 69 || source.proof.reserve !== 14 || source.proof.distinct !== 83 || source.proof.sourceMutation !== 0) throw new Error("FIRST_OPERATION_SOURCE_PROOF_INVALID");
  if (source.queue.length !== 69 || ready.length + scheduled.length !== source.queue.length || source.reserve.length !== 14) throw new Error("FIRST_OPERATION_SOURCE_QUEUE_INVALID");
  if (new Set(source.queue.map((item) => item.id)).size !== 69 || new Set(source.queue.map((item) => item.slotId)).size !== 69 || new Set(source.queue.map((item) => item.queueRank)).size !== 69) throw new Error("FIRST_OPERATION_SOURCE_SLOT_INVALID");
  if (source.queue.some((item) => item.usageEvidenceAllocation?.productKey !== item.productKey)) throw new Error("FIRST_OPERATION_SOURCE_BINDING_INVALID");
  if (source.settings.uploadEnabled !== false || source.settings.enabled !== false || source.settings.isPaused !== true) throw new Error("FIRST_OPERATION_SOURCE_SAFETY_INVALID");
  const affiliateReadiness = buildAffiliateReadinessReport(source.queue);
  if (!affiliateReadiness.readyForArm || affiliateReadiness.affiliateMissing !== 0 || affiliateReadiness.affiliateInvalid !== 0) {
    throw new Error("DAILY69_AFFILIATE_READINESS_INCOMPLETE");
  }
  return { affiliateReadiness, ready, scheduled, readyIds: new Set(ready.map((item) => item.id)) };
}

async function sourceBundle(root: string, queue: LocalQueueItem[], assetBoundaryRoot = root) {
  const fileHashes: Record<string, string> = {};
  for (const name of SOURCE_FILES) fileHashes[name] = await hashFile(join(root, name));
  const assetHashes: Record<string, string> = {};
  for (const item of queue.filter((entry) => entry.status === "video_ready_autoqa" && entry.reviewMetadata.codexReview === "pass")) {
    for (const [kind, path] of [["video", item.videoPath], ["review", item.reviewPath]] as const) {
      if (!path || escapesRoot(assetBoundaryRoot, path)) throw new Error("FIRST_OPERATION_SOURCE_ASSET_INVALID");
      assetHashes[`${item.slotId}:${kind}`] = await hashFile(path);
    }
  }
  const bundleHash = hash(JSON.stringify({ fileHashes, assetHashes }));
  return { fileHashes, assetHashes, bundleHash };
}

async function readRequired<T>(path: string): Promise<T> { return JSON.parse(await readFile(path, "utf8")) as T; }
function parseJson<T>(bytes: Buffer): T { return JSON.parse(bytes.toString("utf8")) as T; }
async function hashFile(path: string) { return hash(await readFile(path)); }
function hash(value: string | Buffer) { return createHash("sha256").update(value).digest("hex"); }
function escapesRoot(root: string, path: string) { const value = relative(resolve(root), resolve(path)); return value.startsWith("..") || value.includes(":"); }
function duplicateNonEmpty(values: string[]) { const filtered = values.filter(Boolean); return filtered.length - new Set(filtered).size; }
async function assertNoRunnerLock(root: string) { try { const value = await stat(join(root, "runner.lock")); if (value.isFile()) throw new Error("FIRST_OPERATION_BATCH_LOCK_ACTIVE"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } }

async function assertActivePointerConsistency(root: string, manifest: FirstOperationManifest, expectedStatus: FirstOperationArmStatus) {
  const pointer = await readJson<Record<string, unknown> | null>(join(dirname(root), "active-operation.json"), null);
  if (!pointer) throw new Error("FIRST_OPERATION_ACTIVE_POINTER_MISSING");
  if (!pointerMatchesManifest(pointer, manifest, expectedStatus)) throw new Error("FIRST_OPERATION_ACTIVE_POINTER_MISMATCH");
}

function pointerMatchesManifest(pointer: Record<string, unknown>, manifest: FirstOperationManifest, expectedStatus: FirstOperationArmStatus) {
  return pointer.schemaVersion === "daily69-first-operation-pointer-v2"
    && pointer.namespace === manifest.namespace
    && pointer.operationDate === manifest.operationDate
    && Number(pointer.attemptNumber ?? 1) === Number(manifest.attemptNumber ?? 1)
    && pointer.expectedGitHead === manifest.expectedGitHead
    && normalizeFirstOperationLifecycleStatus(pointer.armStatus as FirstOperationManifest["armStatus"], String(pointer.decision ?? "")) === expectedStatus
    && pointer.SAFE_TO_UPLOAD === false;
}

async function writeActivePointer(root: string, manifest: FirstOperationManifest) {
  const pointer = {
    schemaVersion: "daily69-first-operation-pointer-v2",
    namespace: manifest.namespace,
    operationDate: manifest.operationDate,
    attemptNumber: manifest.attemptNumber,
    expectedGitHead: manifest.expectedGitHead,
    armStatus: normalizeFirstOperationLifecycleStatus(manifest.armStatus, manifest.decision),
    decision: manifest.decision,
    SAFE_TO_UPLOAD: false,
  } as const;
  await atomicWriteJson(join(dirname(root), "active-operation.json"), pointer);
  return pointer;
}

async function synchronizeActivePointerIfPresent(root: string, before: FirstOperationManifest, after: FirstOperationManifest) {
  const pointerPath = join(dirname(root), "active-operation.json");
  const pointer = await readJson<Record<string, unknown> | null>(pointerPath, null);
  if (!pointer) return;
  const expectedBefore = normalizeFirstOperationLifecycleStatus(before.armStatus, before.decision);
  if (!pointerMatchesManifest(pointer, before, expectedBefore)) return;
  await writeActivePointer(root, after);
}

async function assertExistingPointerTerminalInactive(targetRoot: string, pointer: Record<string, unknown>) {
  const namespace = typeof pointer.namespace === "string" ? pointer.namespace : "";
  if (!/^[A-Za-z0-9_-]{1,96}$/u.test(namespace) || namespace === basename(targetRoot)) throw new Error("FIRST_OPERATION_ACTIVE_POINTER_CONFLICT");
  const historicalRoot = join(dirname(targetRoot), namespace);
  const historical = await readJson<FirstOperationManifest | null>(join(historicalRoot, "operation-manifest.json"), null);
  if (!historical || historical.namespace !== namespace) throw new Error("FIRST_OPERATION_ACTIVE_POINTER_CONFLICT");
  const lifecycle = normalizeFirstOperationLifecycleStatus(historical.armStatus, historical.decision);
  if (!new Set<FirstOperationArmStatus>(["closed_success", "closed_failed", "held"]).has(lifecycle)) {
    throw new Error("FIRST_OPERATION_ACTIVE_POINTER_CONFLICT");
  }
}
