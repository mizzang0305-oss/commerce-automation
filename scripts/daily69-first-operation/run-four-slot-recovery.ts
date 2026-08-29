import { constants } from "node:fs";
import { copyFile, mkdir, readFile, readdir, readlink, realpath, stat } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { nextKstDate } from "../../src/lib/daily69-first-operation";
import { atomicWriteJson } from "../../src/lib/queue-scheduler/atomicJson";
import { sha256File } from "../../src/lib/queue-scheduler/mediaEvidence";
import { assertCodexReviewEvidence } from "../../src/lib/queue-scheduler/codexReviewEvidence";
import { acquireStrictProcessLock } from "../../src/lib/queue-scheduler/lock";
import { executeQueueVideoBatch, type QueueVideoResult } from "../../src/lib/queue-scheduler/videoExecutor";
import type { LocalQueueItem } from "../../src/lib/queue-scheduler/types";

const SOURCE_FILES = [
  "queue.json", "reserve-pool.json", "settings.json", "runs.json", "control-state.json",
  "source-proof.json", "selected-registry.json", "final-summary.json",
] as const;
const REPAIR_SLOTS = ["slot-001", "slot-002", "slot-003", "slot-007"] as const;

async function main() {
  assertNoUploadEnvironment(process.env);
  const sourceRoot = await realpath(resolve(requiredArg("--source-root")));
  const recoveryRoot = resolve(requiredArg("--recovery-root"));
  const operationBase = await realpath(resolve(requiredArg("--operation-base")));
  const targetNamespace = requiredArg("--target-namespace");
  const targetDate = targetNamespace.replace(/^operation-/u, "");
  if (!/^operation-\d{4}-\d{2}-\d{2}$/u.test(targetNamespace) || targetDate !== nextKstDate(new Date())) throw new Error("FOUR_SLOT_TARGET_NAMESPACE_INVALID");
  if (!samePath(operationBase, resolve(process.cwd(), "data", "daily69-first-operation"))) throw new Error("FOUR_SLOT_OPERATION_BASE_NOT_CANONICAL");
  if (!samePath(dirname(sourceRoot), dirname(recoveryRoot)) || samePath(sourceRoot, recoveryRoot)) throw new Error("FOUR_SLOT_RECOVERY_ROOT_NOT_SIBLING");
  const release = await acquireStrictProcessLock(join(operationBase, ".locks", `${targetNamespace}.lock`), `four-slot-recovery-${process.pid}`);
  try {
    if (await exists(recoveryRoot)) throw new Error("FOUR_SLOT_RECOVERY_ROOT_EXISTS");
    if (await exists(join(operationBase, targetNamespace))) throw new Error("FOUR_SLOT_TARGET_NAMESPACE_COLLISION");

  const sourceHashesBefore = await hashSourceTree(sourceRoot);
  await mkdir(recoveryRoot, { recursive: false });
  for (const name of SOURCE_FILES) await copyFile(join(sourceRoot, name), join(recoveryRoot, name), constants.COPYFILE_EXCL);

  const queue = JSON.parse(await readFile(join(sourceRoot, "queue.json"), "utf8")) as LocalQueueItem[];
  const repairItems = REPAIR_SLOTS.map((slotId) => {
    const matches = queue.filter((item) => item.slotId === slotId);
    if (matches.length !== 1) throw new Error("FOUR_SLOT_QUEUE_BINDING_INVALID");
    return matches[0];
  });
  if (new Set(repairItems.map((item) => item.productKey)).size !== REPAIR_SLOTS.length) throw new Error("FOUR_SLOT_PRODUCT_BINDING_INVALID");
  const historicalVideoShaByQueueId = new Map(await Promise.all(repairItems.map(async (item) => [item.id, await sha256File(item.videoPath)] as const)));

  const batches = [repairItems.slice(0, 3), repairItems.slice(3)];
  const results: QueueVideoResult[] = [];
  for (const [index, items] of batches.entries()) {
    results.push(...await executeQueueVideoBatch({
      items,
      runId: `four-slot-recovery-${index + 1}`,
      root: recoveryRoot,
      selectedRegistryPath: join(recoveryRoot, "selected-registry.json"),
      reviewContext: {
        provenance: "carry_forward_revalidation",
        operationNamespace: targetNamespace,
        originOperationNamespace: basename(recoveryRoot),
        regenerationCount: 1,
      },
    }));
  }

  const evidence = results.flatMap((result) => result.codexReview?.evidence ? [result.codexReview.evidence] : []);
  const registryPath = join(recoveryRoot, "four-slot-codex-registry.json");
  const passed = results.filter((result) => result.passed && result.codexReview?.status === "pass" && result.codexReview.evidence?.reviewResult === "pass").length;
  if (passed !== REPAIR_SLOTS.length || evidence.length !== REPAIR_SLOTS.length) {
    throw new Error("FOUR_SLOT_RECOVERY_NOT_PASS");
  }

  const resultByQueueId = new Map(results.map((result) => [result.queueId, result]));
  const now = new Date().toISOString();
  const updatedQueue = await Promise.all(queue.map(async (item) => {
    if (!REPAIR_SLOTS.includes(item.slotId as typeof REPAIR_SLOTS[number])) return item;
    const result = resultByQueueId.get(item.id);
    const review = result?.codexReview?.evidence;
    if (!result || !review || review.reviewResult !== "pass") throw new Error("FOUR_SLOT_RESULT_BINDING_INVALID");
    const videoSha256 = await sha256File(result.finalVideo);
    const reviewSha256 = await sha256File(review.sourceReviewArtifact);
    if (review.videoSha256 !== videoSha256 || review.originVideoSha256 !== videoSha256) throw new Error("FOUR_SLOT_VIDEO_SHA_BINDING_INVALID");
    if (historicalVideoShaByQueueId.get(item.id) === videoSha256) throw new Error("FOUR_SLOT_NEW_VIDEO_SHA_REQUIRED");
    return {
      ...item,
      status: "video_ready_autoqa" as const,
      attemptCount: 2,
      finishedAt: result.machineQaFinishedAt ?? now,
      creativeScore: result.creativeScore,
      videoQualityScore: result.videoQualityScore,
      videoPath: result.finalVideo,
      reviewPath: review.sourceReviewArtifact,
      errorCode: "",
      safeMessage: "FOUR_SLOT_RERENDERED_SAME_PRODUCT_CODEX_PASS",
      reviewMetadata: { codexReview: "pass" as const, evidence: review },
      operationCarryover: {
        prevalidatedCanary: true as const,
        sourceCanaryRunId: basename(recoveryRoot),
        sourceVideoHash: videoSha256,
        sourceReviewHash: reviewSha256,
        carriedIntoOperationDate: targetNamespace.replace(/^operation-/u, "").replace(/-attempt-\d+$/u, ""),
        originOperationNamespace: basename(recoveryRoot),
        originQueueId: item.id,
        originVideoSha256: videoSha256,
        regenerationCount: 1,
      },
      updatedAt: now,
      localRevision: item.localRevision + 1,
    } satisfies LocalQueueItem;
  }));
  const sourceHashesAfter = await hashSourceTree(sourceRoot);
  if (JSON.stringify(sourceHashesAfter) !== JSON.stringify(sourceHashesBefore)) throw new Error("FOUR_SLOT_HISTORICAL_SOURCE_MUTATED");
  if (await exists(join(operationBase, targetNamespace))) throw new Error("FOUR_SLOT_TARGET_NAMESPACE_COLLISION");
  for (const item of updatedQueue.filter((entry) => REPAIR_SLOTS.includes(entry.slotId as typeof REPAIR_SLOTS[number]))) {
    if (!item.reviewMetadata.evidence) throw new Error("FOUR_SLOT_RESULT_BINDING_INVALID");
    await assertCodexReviewEvidence({ evidence: item.reviewMetadata.evidence, item, queueRoot: join(recoveryRoot, "..", targetNamespace), now: new Date() });
  }
  await atomicWriteJson(join(recoveryRoot, "queue.json"), updatedQueue);
  const videoTransitions = repairItems.map((item) => {
    const result = resultByQueueId.get(item.id);
    return { slotId: item.slotId, queueId: item.id, productKey: item.productKey, historicalVideoSha256: historicalVideoShaByQueueId.get(item.id), recoveredVideoSha256: result?.codexReview?.evidence?.videoSha256 };
  });
  await atomicWriteJson(registryPath, {
    schemaVersion: "daily69-four-slot-codex-review-registry-v1",
    decision: "FOUR_SLOT_RECOVERY_PASS",
    targetNamespace,
    sourceNamespace: basename(sourceRoot),
    recoveryNamespace: basename(recoveryRoot),
    requested: REPAIR_SLOTS.length,
    passed,
    evidence,
    results,
    exactUsageBindings: results.map((result) => ({ queueId: result.queueId, productKey: result.productKey, usageEvidenceProvenance: result.usageEvidenceProvenance })),
    videoTransitions,
    SAFE_TO_UPLOAD: false,
    SAFE_TO_PUBLIC_UPLOAD: false,
    PLATFORM_UPLOAD: 0,
  });
  const recoveryEvidence = {
    schemaVersion: "daily69-four-slot-recovery-evidence-v1",
    decision: "FOUR_SLOT_RECOVERY_PASS",
    targetNamespace,
    historicalSourceRoot: sourceRoot,
    recoveryRoot,
    repairedSlots: [...REPAIR_SLOTS],
    sourceHashesBefore,
    sourceHashesAfter,
    historicalSourceMutations: 0,
    regeneratedSameProduct: 4,
    replacedProducts: 0,
    preservedSlots: 5,
    videoTransitions,
    registryPath,
    registrySha256: await sha256File(registryPath),
    SAFE_TO_UPLOAD: false,
    SAFE_TO_PUBLIC_UPLOAD: false,
    PLATFORM_UPLOAD: 0,
  };
  await atomicWriteJson(join(recoveryRoot, "four-slot-recovery-evidence.json"), recoveryEvidence);
    process.stdout.write(`${JSON.stringify({ event: "daily69_four_slot_recovery_complete", targetNamespace, repaired: 4, passed, registryPath, SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 })}\n`);
  } finally { await release(); }
}

async function hashSourceTree(root: string) {
  const entries: Array<[string, string]> = [];
  async function visit(current: string) {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(current, entry.name);
      const name = relative(root, path).replace(/\\/gu, "/");
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) entries.push([name, await sha256File(path)]);
      else if (entry.isSymbolicLink()) entries.push([name, await sha256Text(`symlink:${await readlink(path)}`)]);
      else throw new Error("FOUR_SLOT_HISTORICAL_SOURCE_ENTRY_INVALID");
    }
  }
  await visit(root);
  return Object.fromEntries(entries);
}
async function exists(path: string) { try { await stat(path); return true; } catch { return false; } }
async function sha256Text(value: string) { const { createHash } = await import("node:crypto"); return createHash("sha256").update(value).digest("hex"); }
function samePath(left: string, right: string) { return process.platform === "win32" ? resolve(left).toLowerCase() === resolve(right).toLowerCase() : resolve(left) === resolve(right); }
function assertNoUploadEnvironment(env: NodeJS.ProcessEnv) { if (["SAFE_TO_UPLOAD", "SAFE_TO_PUBLIC_UPLOAD", "YOUTUBE_AUTO_UPLOAD", "PUBLIC_UPLOAD", "UNLISTED_UPLOAD", "TIKTOK_AUTO_UPLOAD", "THREADS_AUTO_POST", "COMMENT_AUTOMATION", "GOOGLE_DRIVE_VIDEO_UPLOAD"].some((name) => env[name]?.trim().toLowerCase() === "true")) throw new Error("UPLOAD_SAFETY_FLAG_BLOCKED"); }
function requiredArg(name: string) { const index = process.argv.indexOf(name); const value = index >= 0 ? process.argv[index + 1] : ""; if (!value) throw new Error(`MISSING_ARGUMENT_${name.replace(/^-+/u, "").toUpperCase()}`); return value; }
function safeError(error: unknown) { const value = error instanceof Error ? error.message : String(error); return /^[A-Z0-9_:-]+$/u.test(value) ? value : "FOUR_SLOT_RECOVERY_FAILED"; }
void main().catch((error: unknown) => { process.stderr.write(`${JSON.stringify({ event: "daily69_four_slot_recovery_failed", safeError: safeError(error), SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 })}\n`); process.exitCode = 1; });
