import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { buildAffiliateReadinessReport, type AffiliateReadinessReport } from "@/lib/affiliate-readiness";
import { atomicWriteJson, readJson } from "@/lib/queue-scheduler/atomicJson";
import { LocalQueueRepository } from "@/lib/queue-scheduler/repository";
import type { LocalQueueItem, QueueSchedulerSettings, ReserveCandidate } from "@/lib/queue-scheduler/types";

export const FIRST_OPERATION_DECISION = "NO_UPLOAD_DAILY69_FIRST_OPERATION_DAY_ARMED" as const;
export const FIRST_OPERATION_MODE = "no_upload_daily69_first_operation" as const;
export const FIRST_OPERATION_SOURCE_DECISION = "COUPANG_IMAGE_SKILL_USAGE_SCENES_V5_PROVEN_DAILY69_CAPACITY" as const;
export const FIRST_OPERATION_ARM_STATUSES = ["prepared", "projection_verified", "tasks_armed", "held", "closed"] as const;
export type FirstOperationArmStatus = typeof FIRST_OPERATION_ARM_STATUSES[number];

const SOURCE_FILES = [
  "queue.json", "reserve-pool.json", "settings.json", "runs.json", "control-state.json",
  "source-proof.json", "selected-registry.json", "final-summary.json"
] as const;

export type FirstOperationManifest = {
  schemaVersion: "daily69-first-operation-v1" | "daily69-first-operation-v2";
  decision: typeof FIRST_OPERATION_DECISION | "NO_UPLOAD_DAILY69_FIRST_OPERATION_DAY_CLOSEOUT_PENDING" | "NO_UPLOAD_DAILY69_FIRST_OPERATION_DAY_PROVEN";
  operationDate: string;
  armedAt: string;
  expectedGitHead: string;
  namespace: string;
  attemptNumber?: number;
  previousAttemptNamespace?: string;
  armStatus?: FirstOperationArmStatus;
  sourceNamespace: string;
  sourceDecision: typeof FIRST_OPERATION_SOURCE_DECISION;
  sourceFileHashes: Record<string, string>;
  sourceAssetHashes: Record<string, string>;
  sourceBundleHash: string;
  sourceHashAfterClone: string;
  originalMutated: false;
  prevalidatedReady: 9;
  scheduledRemaining: 60;
  reserve: 14;
  distinct: 83;
  schedule: Array<{ hourKst: number; slots: [string, string, string] }>;
  affiliateReadiness?: AffiliateReadinessReport;
  safety: { SAFE_TO_UPLOAD: false; SAFE_TO_PUBLIC_UPLOAD: false; PLATFORM_UPLOAD: 0; GOOGLE_DRIVE_WRITE: 0; PRODUCTION_DB_WRITE: 0; R2_WRITE: 0 };
  closeout?: { closedAt: string; firstOperationReady: boolean; continuousDaily69Ready: boolean; reviewPending: number; decision: string };
};

export async function armFirstOperation(input: {
  sourceRoot: string;
  operationBase: string;
  now: Date;
  expectedGitHead: string;
  assetBoundaryRoot?: string;
  operationDate?: string;
  namespace?: string;
  attemptNumber?: number;
  previousAttemptNamespace?: string;
}) {
  const operationDate = input.operationDate ?? nextKstDate(input.now);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(operationDate)) throw new Error("FIRST_OPERATION_DATE_INVALID");
  if (operationDate <= kstDate(input.now)) throw new Error("TARGET_OPERATION_DATE_WINDOW_MISSED");
  const attemptNumber = input.attemptNumber ?? 1;
  if (!Number.isInteger(attemptNumber) || attemptNumber < 1) throw new Error("FIRST_OPERATION_ATTEMPT_INVALID");
  const canonicalNamespace = attemptNumber === 1 ? `operation-${operationDate}` : `operation-${operationDate}-attempt-${attemptNumber}`;
  const namespace = input.namespace ?? canonicalNamespace;
  if (namespace !== canonicalNamespace) throw new Error("FIRST_OPERATION_NAMESPACE_ATTEMPT_MISMATCH");
  const previousAttemptNamespace = input.previousAttemptNamespace?.trim() ?? "";
  if ((attemptNumber === 1 && previousAttemptNamespace) || (attemptNumber > 1 && !previousAttemptNamespace)) throw new Error("FIRST_OPERATION_PREVIOUS_ATTEMPT_INVALID");
  const operationRoot = resolve(input.operationBase, namespace);
  const existing = await readJson<FirstOperationManifest | null>(join(operationRoot, "operation-manifest.json"), null);
  if (existing) {
    if (existing.operationDate !== operationDate || existing.expectedGitHead !== input.expectedGitHead || existing.namespace !== namespace
      || (existing.attemptNumber ?? 1) !== attemptNumber || (existing.previousAttemptNamespace ?? "") !== previousAttemptNamespace) {
      throw new Error("FIRST_OPERATION_EXISTING_MANIFEST_MISMATCH");
    }
    await verifySourceBundle(input.sourceRoot, existing, input.assetBoundaryRoot);
    return { operationRoot, manifest: existing, idempotent: true };
  }

  const sourceRoot = resolve(input.sourceRoot);
  const source = await readSource(sourceRoot);
  const affiliateReadiness = assertSource(source);
  const before = await sourceBundle(sourceRoot, source.queue, input.assetBoundaryRoot);
  const armedAt = input.now.toISOString();
  const schedule = scheduleGroups();
  const queue = source.queue.map((item) => cloneQueueItem(item, operationDate, armedAt, basename(sourceRoot), before.assetHashes));
  const reserve = source.reserve.map((item) => ({ ...item, queueDate: operationDate, claimedBySlot: "", claimedAt: "" }));
  const settings: QueueSchedulerSettings = {
    ...source.settings,
    mode: FIRST_OPERATION_MODE,
    dailyTargetCount: 69,
    pilotMaxDailyItems: 69,
    processingDailyCap: 69,
    batchSize: 3,
    intervalHours: 1,
    startHour: 4,
    endHour: 23,
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
    copyFile(join(sourceRoot, "selected-registry.json"), join(operationRoot, "selected-registry.json"))
  ]);

  const after = await sourceBundle(sourceRoot, source.queue, input.assetBoundaryRoot);
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
    sourceNamespace: basename(sourceRoot),
    sourceDecision: FIRST_OPERATION_SOURCE_DECISION,
    sourceFileHashes: before.fileHashes,
    sourceAssetHashes: before.assetHashes,
    sourceBundleHash: before.bundleHash,
    sourceHashAfterClone: after.bundleHash,
    originalMutated: false,
    prevalidatedReady: 9,
    scheduledRemaining: 60,
    reserve: 14,
    distinct: 83,
    schedule,
    affiliateReadiness,
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
  const allowed: Record<FirstOperationArmStatus, readonly FirstOperationArmStatus[]> = {
    prepared: ["projection_verified", "held"],
    projection_verified: ["tasks_armed", "held"],
    tasks_armed: ["held", "closed"],
    held: [],
    closed: [],
  };
  if (manifest.armStatus === next) return manifest;
  if (!allowed[manifest.armStatus].includes(next)) throw new Error(`FIRST_OPERATION_ARM_STATUS_TRANSITION_INVALID:${manifest.armStatus}:${next}`);
  const updated: FirstOperationManifest = { ...manifest, armStatus: next };
  await atomicWriteJson(manifestPath, updated);
  return updated;
}

export async function promoteFirstOperationActivePointer(operationRoot: string) {
  const root = resolve(operationRoot);
  const manifest = await readJson<FirstOperationManifest | null>(join(root, "operation-manifest.json"), null);
  if (!manifest || manifest.schemaVersion !== "daily69-first-operation-v2" || manifest.armStatus !== "tasks_armed") throw new Error("FIRST_OPERATION_ACTIVE_POINTER_PROMOTION_FORBIDDEN");
  if (basename(root) !== manifest.namespace) throw new Error("FIRST_OPERATION_ROOT_NAMESPACE_MISMATCH");
  const pointer = {
    schemaVersion: "daily69-first-operation-pointer-v2",
    namespace: manifest.namespace,
    operationDate: manifest.operationDate,
    attemptNumber: manifest.attemptNumber,
    expectedGitHead: manifest.expectedGitHead,
    armStatus: manifest.armStatus,
    SAFE_TO_UPLOAD: false,
  } as const;
  await atomicWriteJson(join(dirname(root), "active-operation.json"), pointer);
  return pointer;
}

export async function verifySourceBundle(sourceRoot: string, manifest: FirstOperationManifest, assetBoundaryRoot = sourceRoot) {
  const source = await readSource(resolve(sourceRoot));
  const actual = await sourceBundle(resolve(sourceRoot), source.queue, assetBoundaryRoot);
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
    duplicateRenders,
    codexReviews: items.filter((item) => item.reviewMetadata.codexReview === "pass").length,
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

export async function closeoutFirstOperation(operationRoot: string) {
  const root = resolve(operationRoot);
  await assertNoRunnerLock(root);
  const snapshot = await firstOperationStatus(root);
  const repository = new LocalQueueRepository(root);
  await repository.writeSettings({ ...snapshot.settings, enabled: false, isPaused: true });
  const refreshed = await firstOperationStatus(root);
  const firstOperationReady = refreshed.status.total === 69 && refreshed.status.ready === 69 && refreshed.status.machineOnly === 0 && refreshed.status.reviewPending === 0
    && refreshed.status.scheduled === 0 && refreshed.status.processing === 0 && refreshed.status.retry === 0 && refreshed.status.blocked === 0 && refreshed.status.failed === 0
    && refreshed.status.unresolvedLeases === 0 && refreshed.status.duplicateRenders === 0 && refreshed.status.productBindingMismatches === 0
    && refreshed.status.affiliateReady === 69 && refreshed.status.affiliateMissing === 0 && refreshed.status.affiliateInvalid === 0;
  let continuousDaily69Ready = false;
  if (firstOperationReady) {
    continuousDaily69Ready = refreshed.status.reserve >= 14 && refreshed.status.distinct >= 83;
    await atomicWriteJson(join(root, "shadow-next-day", "proof.json"), {
      schemaVersion: "daily69-next-day-shadow-v1", operationDate: nextKstDate(new Date(`${refreshed.manifest.operationDate}T00:00:00+09:00`)),
      providerCalls: 0, secondScoutApiCalls: 0, active: 69, reserve: refreshed.status.reserve, distinct: refreshed.status.distinct,
      policiesPass: refreshed.status.productBindingMismatches === 0, operationalQueueMutations: 0, readyForContinuousDailyRun: continuousDaily69Ready,
      SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0
    });
  }
  const decision = firstOperationReady ? "NO_UPLOAD_DAILY69_FIRST_OPERATION_DAY_PROVEN" : "NO_UPLOAD_DAILY69_FIRST_OPERATION_DAY_CLOSEOUT_PENDING";
  const closedAt = snapshot.manifest.closeout?.closedAt || new Date().toISOString();
  const manifest: FirstOperationManifest = { ...refreshed.manifest, decision, armStatus: refreshed.manifest.armStatus === "tasks_armed" ? "closed" : refreshed.manifest.armStatus, closeout: { closedAt, firstOperationReady, continuousDaily69Ready, reviewPending: refreshed.status.reviewPending, decision } };
  await atomicWriteJson(join(root, "operation-manifest.json"), manifest);
  await atomicWriteJson(join(root, "closeout", "closeout-report.json"), { decision, firstOperationReady, continuousDaily69Ready, status: refreshed.status, tasksMustBeDisabled: true, uploadCalls: 0, driveCalls: 0, dbWrites: 0, r2Writes: 0, platformCalls: 0 });
  return { decision, firstOperationReady, continuousDaily69Ready, status: refreshed.status };
}

export function nextKstDate(now: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now.getTime() + 24 * 60 * 60_000));
}

function kstDate(now: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function scheduleGroups(): FirstOperationManifest["schedule"] {
  return Array.from({ length: 20 }, (_, index) => {
    const first = 10 + index * 3;
    return { hourKst: 4 + index, slots: [slot(first), slot(first + 1), slot(first + 2)] };
  });
}

function cloneQueueItem(item: LocalQueueItem, operationDate: string, armedAt: string, sourceNamespace: string, assetHashes: Record<string, string>): LocalQueueItem {
  if (item.queueRank <= 9) {
    return {
      ...item,
      queueDate: operationDate,
      localRevision: 1,
      operationCarryover: {
        prevalidatedCanary: true,
        sourceCanaryRunId: sourceNamespace,
        sourceVideoHash: assetHashes[`${item.slotId}:video`] ?? "",
        sourceReviewHash: assetHashes[`${item.slotId}:review`] ?? "",
        carriedIntoOperationDate: operationDate
      }
    };
  }
  const hour = 4 + Math.floor((item.queueRank - 10) / 3);
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
  return {
    queue: await readRequired<LocalQueueItem[]>(join(root, "queue.json")),
    reserve: await readRequired<ReserveCandidate[]>(join(root, "reserve-pool.json")),
    settings: await readRequired<QueueSchedulerSettings>(join(root, "settings.json")),
    proof: await readRequired<{ decision?: string; active?: number; reserve?: number; distinct?: number; sourceMutation?: number }>(join(root, "source-proof.json"))
  };
}

function assertSource(source: Awaited<ReturnType<typeof readSource>>) {
  const ready = source.queue.filter((item) => item.status === "video_ready_autoqa" && item.reviewMetadata.codexReview === "pass");
  const scheduled = source.queue.filter((item) => item.status === "scheduled");
  if (source.proof.decision !== FIRST_OPERATION_SOURCE_DECISION || source.proof.active !== 69 || source.proof.reserve !== 14 || source.proof.distinct !== 83 || source.proof.sourceMutation !== 0) throw new Error("FIRST_OPERATION_SOURCE_PROOF_INVALID");
  if (source.queue.length !== 69 || ready.length !== 9 || scheduled.length !== 60 || source.reserve.length !== 14) throw new Error("FIRST_OPERATION_SOURCE_QUEUE_INVALID");
  if (new Set(source.queue.map((item) => item.id)).size !== 69 || new Set(source.queue.map((item) => item.slotId)).size !== 69 || new Set(source.queue.map((item) => item.queueRank)).size !== 69) throw new Error("FIRST_OPERATION_SOURCE_SLOT_INVALID");
  if (source.queue.some((item) => item.usageEvidenceAllocation?.productKey !== item.productKey)) throw new Error("FIRST_OPERATION_SOURCE_BINDING_INVALID");
  if (source.settings.uploadEnabled !== false || source.settings.enabled !== false || source.settings.isPaused !== true) throw new Error("FIRST_OPERATION_SOURCE_SAFETY_INVALID");
  const affiliateReadiness = buildAffiliateReadinessReport(source.queue);
  if (!affiliateReadiness.readyForArm || affiliateReadiness.affiliateMissing !== 0 || affiliateReadiness.affiliateInvalid !== 0) {
    throw new Error("DAILY69_AFFILIATE_READINESS_INCOMPLETE");
  }
  return affiliateReadiness;
}

async function sourceBundle(root: string, queue: LocalQueueItem[], assetBoundaryRoot = root) {
  const fileHashes: Record<string, string> = {};
  for (const name of SOURCE_FILES) fileHashes[name] = await hashFile(join(root, name));
  const assetHashes: Record<string, string> = {};
  for (const item of queue.filter((entry) => entry.queueRank <= 9)) {
    for (const [kind, path] of [["video", item.videoPath], ["review", item.reviewPath]] as const) {
      if (!path || escapesRoot(assetBoundaryRoot, path)) throw new Error("FIRST_OPERATION_SOURCE_ASSET_INVALID");
      assetHashes[`${item.slotId}:${kind}`] = await hashFile(path);
    }
  }
  const bundleHash = hash(JSON.stringify({ fileHashes, assetHashes }));
  return { fileHashes, assetHashes, bundleHash };
}

async function readRequired<T>(path: string): Promise<T> { return JSON.parse(await readFile(path, "utf8")) as T; }
async function hashFile(path: string) { return hash(await readFile(path)); }
function hash(value: string | Buffer) { return createHash("sha256").update(value).digest("hex"); }
function escapesRoot(root: string, path: string) { const value = relative(resolve(root), resolve(path)); return value.startsWith("..") || value.includes(":"); }
function slot(rank: number) { return `slot-${String(rank).padStart(3, "0")}`; }
function duplicateNonEmpty(values: string[]) { const filtered = values.filter(Boolean); return filtered.length - new Set(filtered).size; }
async function assertNoRunnerLock(root: string) { try { const value = await stat(join(root, "runner.lock")); if (value.isFile()) throw new Error("FIRST_OPERATION_BATCH_LOCK_ACTIVE"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } }
