import { createReadStream } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { createHash } from "node:crypto";
import type { CodexReviewEvidenceV2, LocalQueueItem } from "./types";

export const CODEX_REVIEW_EVIDENCE_SCHEMA_VERSION = "queue-codex-review-evidence-v2" as const;

export type LegacyCodexReview = { productKey: string; passed: boolean };
export type CodexReviewSubmission = LegacyCodexReview | CodexReviewEvidenceV2;

export async function captureCodexReviewEvidence(input: {
  operationNamespace: string;
  queueId: string;
  productKey: string;
  videoPath: string;
  reviewedAt: Date;
  reviewResult: "pass" | "block";
  sourceReviewArtifact: string;
  notes: string;
  hardBlockers: string[];
  safeSummary: string;
  executorType: "authenticated_codex_cli";
  reviewProvenance: "natural" | "carry_forward_revalidation" | "diagnostic";
  reviewReceiptPath: string;
  regenerationCount?: number;
  originOperationNamespace?: string;
  originQueueId?: string;
  originVideoSha256?: string;
}): Promise<CodexReviewEvidenceV2> {
  if (input.reviewProvenance === "diagnostic") throw new Error("CODEX_VISUAL_REVIEW_DIAGNOSTIC_PROMOTION_FORBIDDEN");
  const video = await inspectFile(input.videoPath, "CODEX_VISUAL_REVIEW_VIDEO_NOT_FOUND");
  const machineQa = await inspectFile(input.sourceReviewArtifact, "CODEX_VISUAL_REVIEW_SOURCE_ARTIFACT_NOT_FOUND");
  const receipt = await inspectFile(input.reviewReceiptPath, "CODEX_VISUAL_REVIEW_RECEIPT_NOT_FOUND");
  return {
    schemaVersion: CODEX_REVIEW_EVIDENCE_SCHEMA_VERSION,
    operationNamespace: input.operationNamespace,
    queueId: input.queueId,
    productKey: input.productKey,
    videoPath: video.path,
    videoSha256: video.sha256,
    videoSize: video.size,
    reviewedAt: input.reviewedAt.toISOString(),
    reviewerType: "codex",
    executorType: input.executorType,
    reviewProvenance: input.reviewProvenance,
    reviewResult: input.reviewResult,
    hardBlockers: [...input.hardBlockers],
    safeSummary: input.safeSummary,
    machineQaDigest: machineQa.sha256,
    sourceReviewArtifact: machineQa.path,
    reviewReceiptPath: receipt.path,
    reviewReceiptSha256: receipt.sha256,
    notes: input.notes,
    regenerationCount: input.regenerationCount ?? 0,
    ...(input.originOperationNamespace ? { originOperationNamespace: input.originOperationNamespace } : {}),
    ...(input.originQueueId ? { originQueueId: input.originQueueId } : {}),
    ...(input.originVideoSha256 ? { originVideoSha256: input.originVideoSha256 } : {})
  };
}

export async function assertCodexReviewEvidence(input: {
  evidence: CodexReviewEvidenceV2;
  item: LocalQueueItem;
  queueRoot: string;
  now: Date;
}): Promise<void> {
  const { evidence, item } = input;
  if (!isCodexReviewEvidenceV2(evidence)) throw new Error("CODEX_VISUAL_REVIEW_EXACT_EVIDENCE_REQUIRED");
  if (evidence.operationNamespace !== basename(resolve(input.queueRoot))) throw new Error("CODEX_VISUAL_REVIEW_NAMESPACE_MISMATCH");
  if (evidence.queueId !== item.id) throw new Error("CODEX_VISUAL_REVIEW_QUEUE_ID_MISMATCH");
  if (evidence.productKey !== item.productKey) throw new Error("CODEX_VISUAL_REVIEW_PRODUCT_MISMATCH");
  if (evidence.executorType !== "authenticated_codex_cli") throw new Error("CODEX_VISUAL_REVIEW_EXECUTOR_INVALID");
  if (evidence.reviewProvenance !== "natural" && evidence.reviewProvenance !== "carry_forward_revalidation") throw new Error("CODEX_VISUAL_REVIEW_PROVENANCE_INVALID");
  if ((evidence.reviewResult === "pass" && evidence.hardBlockers.length !== 0) || (evidence.reviewResult === "block" && evidence.hardBlockers.length === 0)) throw new Error("CODEX_VISUAL_REVIEW_BLOCKER_CONFLICT");
  if (evidence.safeSummary.trim().length < 20 || evidence.safeSummary !== evidence.notes) throw new Error("CODEX_VISUAL_REVIEW_SUMMARY_INVALID");
  if (!Number.isSafeInteger(evidence.regenerationCount) || evidence.regenerationCount !== Math.max(0, item.attemptCount - 1)) throw new Error("CODEX_VISUAL_REVIEW_REGENERATION_COUNT_INVALID");
  if (evidence.notes.trim().length < 20) throw new Error("CODEX_VISUAL_REVIEW_NOTES_INVALID");
  assertFreshTimestamp(evidence.reviewedAt, item.finishedAt, input.now, evidence.reviewProvenance === "carry_forward_revalidation" ? 60 * 60_000 : 5 * 60_000);
  assertCarryForwardProvenance(evidence, item);

  const video = await inspectFile(item.videoPath, "CODEX_VISUAL_REVIEW_VIDEO_NOT_FOUND");
  const evidenceVideo = await canonicalPath(evidence.videoPath, "CODEX_VISUAL_REVIEW_VIDEO_NOT_FOUND");
  if (!samePath(video.path, evidenceVideo)) throw new Error("CODEX_VISUAL_REVIEW_VIDEO_PATH_MISMATCH");
  if (video.sha256 !== evidence.videoSha256) throw new Error("CODEX_VISUAL_REVIEW_VIDEO_SHA256_MISMATCH");
  if (video.size !== evidence.videoSize) throw new Error("CODEX_VISUAL_REVIEW_VIDEO_SIZE_MISMATCH");

  const itemReviewArtifact = await canonicalPath(item.reviewPath, "CODEX_VISUAL_REVIEW_SOURCE_ARTIFACT_NOT_FOUND");
  const evidenceReviewArtifact = await inspectFile(evidence.sourceReviewArtifact, "CODEX_VISUAL_REVIEW_SOURCE_ARTIFACT_NOT_FOUND");
  if (!samePath(itemReviewArtifact, evidenceReviewArtifact.path)) throw new Error("CODEX_VISUAL_REVIEW_SOURCE_ARTIFACT_MISMATCH");
  if (evidenceReviewArtifact.sha256 !== evidence.machineQaDigest) throw new Error("CODEX_VISUAL_REVIEW_MACHINE_QA_DIGEST_MISMATCH");
  await assertCodexExecutorReceipt(evidence);
  if (evidence.reviewResult === "pass") await assertMachineQaArtifact(evidenceReviewArtifact.path, item.productKey);
}

export function isCodexReviewEvidenceV2(value: CodexReviewSubmission): value is CodexReviewEvidenceV2 {
  const candidate = value as Partial<CodexReviewEvidenceV2>;
  return candidate.schemaVersion === CODEX_REVIEW_EVIDENCE_SCHEMA_VERSION
    && candidate.reviewerType === "codex"
    && candidate.executorType === "authenticated_codex_cli"
    && (candidate.reviewProvenance === "natural" || candidate.reviewProvenance === "carry_forward_revalidation")
    && (candidate.reviewResult === "pass" || candidate.reviewResult === "block")
    && Array.isArray(candidate.hardBlockers) && candidate.hardBlockers.every((entry) => typeof entry === "string" && /^[A-Z0-9_:-]{1,96}$/u.test(entry))
    && typeof candidate.safeSummary === "string" && candidate.safeSummary.length >= 20
    && typeof candidate.operationNamespace === "string" && candidate.operationNamespace.length > 0
    && typeof candidate.queueId === "string" && candidate.queueId.length > 0
    && typeof candidate.productKey === "string" && candidate.productKey.length > 0
    && typeof candidate.videoPath === "string" && candidate.videoPath.length > 0
    && isSha256(candidate.videoSha256)
    && Number.isSafeInteger(candidate.videoSize) && Number(candidate.videoSize) > 0
    && typeof candidate.reviewedAt === "string" && candidate.reviewedAt.length > 0
    && isSha256(candidate.machineQaDigest)
    && typeof candidate.sourceReviewArtifact === "string" && candidate.sourceReviewArtifact.length > 0
    && typeof candidate.reviewReceiptPath === "string" && candidate.reviewReceiptPath.length > 0
    && isSha256(candidate.reviewReceiptSha256)
    && typeof candidate.notes === "string"
    && typeof candidate.regenerationCount === "number";
}

export async function assertCodexExecutorReceipt(evidence: CodexReviewEvidenceV2): Promise<void> {
  const receipt = await inspectFile(evidence.reviewReceiptPath, "CODEX_VISUAL_REVIEW_RECEIPT_NOT_FOUND");
  if (receipt.sha256 !== evidence.reviewReceiptSha256) throw new Error("CODEX_VISUAL_REVIEW_RECEIPT_DIGEST_MISMATCH");
  let value: Record<string, unknown>;
  try { value = JSON.parse(await readFile(receipt.path, "utf8")) as Record<string, unknown>; }
  catch { throw new Error("CODEX_VISUAL_REVIEW_RECEIPT_INVALID"); }
  if (value.schemaVersion !== "queue-codex-review-executor-receipt-v1" || value.status !== "completed" || value.invoked !== true
    || value.operationNamespace !== evidence.operationNamespace || value.queueId !== evidence.queueId || value.productKey !== evidence.productKey
    || value.videoSha256 !== evidence.videoSha256 || value.reviewResult !== evidence.reviewResult || value.reviewedAt !== evidence.reviewedAt
    || value.reviewerType !== "codex" || value.executorType !== evidence.executorType || value.provenance !== evidence.reviewProvenance
    || value.finalReviewArtifactSha256 !== evidence.machineQaDigest || !samePath(String(value.finalReviewArtifact ?? ""), evidence.sourceReviewArtifact)
    || JSON.stringify(value.hardBlockers) !== JSON.stringify(evidence.hardBlockers) || value.safeSummary !== evidence.safeSummary
    || value.SAFE_TO_UPLOAD !== false || value.SAFE_TO_PUBLIC_UPLOAD !== false || value.PLATFORM_UPLOAD !== 0) {
    throw new Error("CODEX_VISUAL_REVIEW_RECEIPT_BINDING_INVALID");
  }
}

async function inspectFile(path: string, missingCode: string): Promise<{ path: string; size: number; sha256: string }> {
  try {
    const canonical = await realpath(resolve(path));
    const metadata = await stat(canonical);
    if (!metadata.isFile()) throw new Error(missingCode);
    return { path: canonical, size: metadata.size, sha256: await sha256File(canonical) };
  } catch (error) {
    if (error instanceof Error && /^[A-Z0-9_:-]+$/u.test(error.message)) throw error;
    throw new Error(missingCode);
  }
}

async function canonicalPath(path: string, missingCode: string): Promise<string> {
  try { return await realpath(resolve(path)); }
  catch { throw new Error(missingCode); }
}

async function assertMachineQaArtifact(path: string, productKey: string): Promise<void> {
  let value: Record<string, unknown>;
  try { value = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>; }
  catch { throw new Error("CODEX_VISUAL_REVIEW_MACHINE_QA_ARTIFACT_INVALID"); }
  const entries = Array.isArray(value.items)
    ? value.items.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    : [value];
  const matches = entries.filter((entry) => entry.productKey === productKey);
  if (matches.length !== 1) throw new Error("CODEX_VISUAL_REVIEW_MACHINE_QA_PRODUCT_BINDING_INVALID");
  const item = matches[0];
  const blockers = item.blockers;
  const hardBlockersClear = Array.isArray(blockers) && blockers.length === 0;
  const artifactVersion = String(item.version ?? value.version ?? "");
  if (artifactVersion !== "autonomous-video-review-v2" || value.visualReviewExecuted !== true || Number(value.finalAutomatedQaPassed) < 1
    || item.status !== "AUTO_QA_PASS" || item.machineQaPassed !== true || item.finalAutomatedQaPassed !== true
    || item.visualReviewExecuted !== true || !hardBlockersClear || item.publishReady !== false
    || item.SAFE_TO_UPLOAD !== false || item.SAFE_TO_PUBLIC_UPLOAD !== false) {
    throw new Error("CODEX_VISUAL_REVIEW_MACHINE_QA_NOT_PASSED");
  }
}

async function sha256File(path: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolvePromise(hash.digest("hex")));
  });
}

function assertFreshTimestamp(reviewedAt: string, machineFinishedAt: string, now: Date, maxAgeMs: number): void {
  const reviewedMs = Date.parse(reviewedAt);
  if (!Number.isFinite(reviewedMs)) throw new Error("CODEX_VISUAL_REVIEW_TIMESTAMP_INVALID");
  const nowMs = now.getTime();
  if (reviewedMs > nowMs + 5_000 || nowMs - reviewedMs > maxAgeMs) throw new Error("CODEX_VISUAL_REVIEW_TIMESTAMP_NOT_FRESH");
  const machineFinishedMs = Date.parse(machineFinishedAt);
  if (Number.isFinite(machineFinishedMs) && reviewedMs < machineFinishedMs) throw new Error("CODEX_VISUAL_REVIEW_PREDATES_MACHINE_QA");
}

function assertCarryForwardProvenance(evidence: CodexReviewEvidenceV2, item: LocalQueueItem): void {
  const origins = [evidence.originOperationNamespace, evidence.originQueueId, evidence.originVideoSha256];
  const originCount = origins.filter((value) => typeof value === "string" && value.length > 0).length;
  if (originCount !== 0 && originCount !== origins.length) throw new Error("CODEX_VISUAL_REVIEW_ORIGIN_BINDING_INCOMPLETE");
  if (originCount === origins.length && (!isSafeIdentity(evidence.originOperationNamespace) || !isSafeIdentity(evidence.originQueueId) || !isSha256(evidence.originVideoSha256))) {
    throw new Error("CODEX_VISUAL_REVIEW_ORIGIN_BINDING_INVALID");
  }
  if (!item.operationCarryover) return;
  if (originCount !== origins.length) throw new Error("CODEX_VISUAL_REVIEW_CARRY_FORWARD_ORIGIN_REQUIRED");
  const expectedNamespace = item.operationCarryover.originOperationNamespace ?? item.operationCarryover.sourceCanaryRunId;
  const expectedQueueId = item.operationCarryover.originQueueId ?? item.id;
  const expectedVideoSha256 = item.operationCarryover.originVideoSha256 ?? item.operationCarryover.sourceVideoHash;
  const expectedRegenerationCount = item.operationCarryover.regenerationCount ?? 0;
  if (evidence.originOperationNamespace !== expectedNamespace || evidence.originQueueId !== expectedQueueId) {
    throw new Error("CODEX_VISUAL_REVIEW_CARRY_FORWARD_ORIGIN_MISMATCH");
  }
  if (evidence.regenerationCount !== expectedRegenerationCount) throw new Error("CODEX_VISUAL_REVIEW_REGENERATION_COUNT_MISMATCH");
  if (evidence.originVideoSha256 !== expectedVideoSha256 || evidence.originVideoSha256 !== evidence.videoSha256) {
    throw new Error("CODEX_VISUAL_REVIEW_CARRY_FORWARD_VIDEO_MISMATCH");
  }
}

function isSha256(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value); }
function isSafeIdentity(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/u.test(value); }
function samePath(left: string, right: string): boolean { return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right; }
