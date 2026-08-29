import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";
import { validateCoupangAffiliateUrl } from "@/lib/affiliate-readiness";
import {
  assertCodexExecutorReceipt,
  assertCodexMachineQaArtifact,
  isCodexReviewEvidenceV2,
} from "./codexReviewEvidence";
import type {
  CodexReviewEvidenceV2,
  ImmutableCodexReviewOperationBindingRefV1,
  ImmutableCodexReviewOperationBindingV1,
  LocalQueueItem,
} from "./types";

export const IMMUTABLE_REVIEW_BINDING_SCHEMA_VERSION = "queue-codex-review-operation-binding-v1" as const;
export const IMMUTABLE_REVIEW_BINDING_REF_SCHEMA_VERSION = "queue-codex-review-operation-binding-ref-v1" as const;
export const IMMUTABLE_REVIEW_BINDING_VALIDATOR_VERSION = "immutable-review-operation-binding-validator-v1" as const;
const APPLICATION_FRESHNESS_MS = 5 * 60_000;
const MAX_PRE_OPERATION_BINDING_WINDOW_MS = 48 * 60 * 60_000;

type OriginRegistry = {
  schemaVersion: "daily69-carry-forward-codex-review-registry-v1";
  decision: "CARRY_FORWARD_CODEX_REVALIDATION_PASS";
  targetNamespace: string;
  requested: number;
  passed: number;
  evidence: CodexReviewEvidenceV2[];
  exactBindings: Array<Record<string, unknown>>;
  results: Array<{ queueId?: unknown; productKey?: unknown; status?: unknown; receiptPath?: unknown }>;
  SAFE_TO_UPLOAD: false;
  SAFE_TO_PUBLIC_UPLOAD: false;
  PLATFORM_UPLOAD: 0;
};

export async function planImmutableReviewOperationBindings(input: {
  items: LocalQueueItem[];
  targetOperationNamespace: string;
  targetOperationDate: string;
  originRegistryPath: string;
  boundToOperationAt: Date;
  requirePreparedItems: boolean;
  now?: Date;
}) {
  assertTarget(input.targetOperationNamespace, input.targetOperationDate);
  if (input.items.length !== 9 || new Set(input.items.map((item) => item.id)).size !== 9
    || new Set(input.items.map((item) => item.productKey)).size !== 9) {
    throw new Error("IMMUTABLE_REVIEW_BINDING_EXACT_NINE_REQUIRED");
  }
  const registry = await loadOriginRegistry(input.originRegistryPath);
  const bindings: ImmutableCodexReviewOperationBindingV1[] = [];
  for (const item of input.items) {
    const matches = registry.value.evidence.filter((entry) => entry.queueId === item.id && entry.productKey === item.productKey);
    if (matches.length !== 1) throw new Error("IMMUTABLE_REVIEW_ORIGIN_EVIDENCE_NOT_EXACT");
    bindings.push(await createBinding({
      item,
      originEvidence: matches[0],
      registry,
      targetOperationNamespace: input.targetOperationNamespace,
      targetOperationDate: input.targetOperationDate,
      boundToOperationAt: input.boundToOperationAt,
      targetItemState: input.requirePreparedItems ? "prepared" : "source",
      now: input.now,
    }));
  }
  if (new Set(bindings.map((binding) => binding.originEvidenceDigest)).size !== 9
    || new Set(bindings.map((binding) => binding.originReceiptDigest)).size !== 9
    || new Set(bindings.map((binding) => binding.boundVideoSha256)).size !== 9) {
    throw new Error("IMMUTABLE_REVIEW_BINDING_ORIGIN_NOT_UNIQUE");
  }
  return {
    bindings,
    summary: {
      candidates: bindings.length,
      validOriginReceipts: bindings.filter((entry) => entry.bindingResult === "pass").length,
      exactVideoShaMatches: bindings.filter((entry) => entry.boundVideoSha256 === entry.originSourceVideoSha256).length,
      exactProductMatches: bindings.filter((entry) => entry.targetProductKey === entry.originProductKey).length,
      reviewPass: bindings.filter((entry) => entry.bindingResult === "pass").length,
      machineQaValid: bindings.filter((entry) => isSha256(entry.machineQaDigest)).length,
      bindingsWouldPass: bindings.filter((entry) => entry.bindingResult === "pass").length,
      originRegistrySha256: registry.sha256,
      fakeReviewedAtMutations: 0,
      aiReviewExecutions: 0,
      SAFE_TO_UPLOAD: false as const,
      PLATFORM_UPLOAD: 0 as const,
    },
  };
}

export async function assertImmutableReviewOperationBinding(input: {
  binding: ImmutableCodexReviewOperationBindingV1;
  item: LocalQueueItem;
  queueRoot: string;
  now?: Date;
  enforceApplicationFreshness?: boolean;
}) {
  if (!isImmutableReviewOperationBinding(input.binding)) throw new Error("IMMUTABLE_REVIEW_BINDING_INVALID");
  assertTarget(input.binding.targetOperationNamespace, input.binding.targetOperationDate);
  if (input.binding.targetOperationNamespace !== basename(resolve(input.queueRoot))) throw new Error("IMMUTABLE_REVIEW_BINDING_NAMESPACE_MISMATCH");
  const registry = await loadOriginRegistry(input.binding.originRegistryPath);
  if (registry.sha256 !== input.binding.originRegistrySha256) throw new Error("IMMUTABLE_REVIEW_ORIGIN_REGISTRY_DIGEST_MISMATCH");
  const matches = registry.value.evidence.filter((entry) => stableDigest(entry) === input.binding.originEvidenceDigest);
  if (matches.length !== 1) throw new Error("IMMUTABLE_REVIEW_ORIGIN_EVIDENCE_DIGEST_MISMATCH");
  const targetItemState = input.item.status === "video_ready_machine_qa" && input.item.reviewMetadata.codexReview === "not_executed"
    && !input.item.reviewMetadata.evidence && !input.item.reviewMetadata.operationBinding
    ? "prepared"
    : input.item.status === "video_ready_autoqa" && input.item.reviewMetadata.codexReview === "pass"
      && !input.item.reviewMetadata.evidence && Boolean(input.item.reviewMetadata.operationBinding)
      ? "applied"
      : null;
  if (!targetItemState) throw new Error("IMMUTABLE_REVIEW_BINDING_QUEUE_STATE_CONFLICT");
  const expected = await createBinding({
    item: input.item,
    originEvidence: matches[0],
    registry,
    targetOperationNamespace: input.binding.targetOperationNamespace,
    targetOperationDate: input.binding.targetOperationDate,
    boundToOperationAt: new Date(input.binding.boundToOperationAt),
    targetItemState,
    now: input.enforceApplicationFreshness ? input.now ?? new Date() : undefined,
  });
  if (stableJson(expected) !== stableJson(input.binding)) throw new Error("IMMUTABLE_REVIEW_BINDING_RECOMPUTE_MISMATCH");
  return expected;
}

export async function loadAndAssertImmutableReviewOperationBinding(input: {
  reference: ImmutableCodexReviewOperationBindingRefV1;
  item: LocalQueueItem;
  queueRoot: string;
  now?: Date;
  enforceApplicationFreshness?: boolean;
}) {
  if (!isImmutableReviewOperationBindingRef(input.reference)) throw new Error("IMMUTABLE_REVIEW_BINDING_REF_INVALID");
  const file = await inspectFile(input.reference.bindingPath, "IMMUTABLE_REVIEW_BINDING_FILE_NOT_FOUND");
  let bindingRoot: string;
  try { bindingRoot = await realpath(resolve(input.queueRoot, "review-bindings")); }
  catch { throw new Error("IMMUTABLE_REVIEW_BINDING_ROOT_NOT_FOUND"); }
  const relativePath = relative(bindingRoot, file.path);
  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) throw new Error("IMMUTABLE_REVIEW_BINDING_PATH_OUTSIDE_OPERATION");
  if (file.sha256 !== input.reference.bindingSha256) throw new Error("IMMUTABLE_REVIEW_BINDING_FILE_DIGEST_MISMATCH");
  let binding: ImmutableCodexReviewOperationBindingV1;
  try { binding = JSON.parse(await readFile(file.path, "utf8")) as ImmutableCodexReviewOperationBindingV1; }
  catch { throw new Error("IMMUTABLE_REVIEW_BINDING_FILE_INVALID"); }
  return assertImmutableReviewOperationBinding({ ...input, binding });
}

export function isImmutableReviewOperationBindingRef(value: unknown): value is ImmutableCodexReviewOperationBindingRefV1 {
  const candidate = value as Partial<ImmutableCodexReviewOperationBindingRefV1> | undefined;
  return candidate?.schemaVersion === IMMUTABLE_REVIEW_BINDING_REF_SCHEMA_VERSION
    && typeof candidate.bindingPath === "string" && candidate.bindingPath.length > 0
    && isSha256(candidate.bindingSha256);
}

export function isImmutableReviewOperationBinding(value: unknown): value is ImmutableCodexReviewOperationBindingV1 {
  const candidate = value as Partial<ImmutableCodexReviewOperationBindingV1> | undefined;
  return candidate?.schemaVersion === IMMUTABLE_REVIEW_BINDING_SCHEMA_VERSION
    && candidate.evidenceMode === "immutable_carry_forward_binding"
    && isOperationNamespace(candidate.targetOperationNamespace)
    && typeof candidate.targetOperationDate === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(candidate.targetOperationDate)
    && typeof candidate.targetQueueId === "string" && candidate.targetQueueId.length > 0
    && typeof candidate.targetSlotId === "string" && /^slot-\d{3}$/u.test(candidate.targetSlotId)
    && typeof candidate.targetProductKey === "string" && candidate.targetProductKey.length > 0
    && typeof candidate.boundVideoPath === "string" && candidate.boundVideoPath.length > 0
    && isSha256(candidate.boundVideoSha256) && Number.isSafeInteger(candidate.boundVideoSize) && Number(candidate.boundVideoSize) > 0
    && typeof candidate.originRegistryPath === "string" && candidate.originRegistryPath.length > 0
    && isSha256(candidate.originRegistrySha256) && isSha256(candidate.originEvidenceDigest)
    && typeof candidate.originReceiptPath === "string" && candidate.originReceiptPath.length > 0 && isSha256(candidate.originReceiptDigest)
    && isOperationNamespace(candidate.originOperationNamespace)
    && typeof candidate.originQueueId === "string" && candidate.originQueueId.length > 0
    && typeof candidate.originProductKey === "string" && candidate.originProductKey.length > 0
    && typeof candidate.originReviewedAt === "string" && Number.isFinite(Date.parse(candidate.originReviewedAt))
    && candidate.originSchemaVersion === "queue-codex-review-evidence-v2"
    && typeof candidate.originSourceOperationNamespace === "string" && candidate.originSourceOperationNamespace.length > 0
    && typeof candidate.originSourceQueueId === "string" && candidate.originSourceQueueId.length > 0
    && isSha256(candidate.originSourceVideoSha256) && Number.isSafeInteger(candidate.originRegenerationCount)
    && typeof candidate.boundToOperationAt === "string" && Number.isFinite(Date.parse(candidate.boundToOperationAt))
    && candidate.bindingReason === "exact_immutable_media_carry_forward"
    && candidate.bindingValidatorVersion === IMMUTABLE_REVIEW_BINDING_VALIDATOR_VERSION
    && candidate.bindingSchemaVersion === IMMUTABLE_REVIEW_BINDING_SCHEMA_VERSION
    && candidate.compatibilityDecision === "COMPATIBLE"
    && [candidate.machineQaDigest, candidate.productReferenceSha256, candidate.visualEvidenceDigest, candidate.usageEvidenceDigest,
      candidate.visualEvidenceBindingSha256, candidate.currentProductBindingDigest, candidate.currentBusinessEligibilityDigest,
      candidate.currentArtifactDigest].every(isSha256)
    && (candidate.bindingResult === "pass" || candidate.bindingResult === "blocked")
    && candidate.SAFE_TO_UPLOAD === false && candidate.SAFE_TO_PUBLIC_UPLOAD === false && candidate.PLATFORM_UPLOAD === 0;
}

export function stableDigest(value: unknown) { return createHash("sha256").update(stableJson(value)).digest("hex"); }

async function createBinding(input: {
  item: LocalQueueItem;
  originEvidence: CodexReviewEvidenceV2;
  registry: Awaited<ReturnType<typeof loadOriginRegistry>>;
  targetOperationNamespace: string;
  targetOperationDate: string;
  boundToOperationAt: Date;
  targetItemState: "source" | "prepared" | "applied";
  now?: Date;
}): Promise<ImmutableCodexReviewOperationBindingV1> {
  const { item, originEvidence } = input;
  if (!isCodexReviewEvidenceV2(originEvidence) || originEvidence.reviewResult !== "pass" || originEvidence.hardBlockers.length !== 0) {
    throw new Error("IMMUTABLE_REVIEW_ORIGIN_NOT_PASS");
  }
  if (input.registry.value.targetNamespace !== originEvidence.operationNamespace) throw new Error("IMMUTABLE_REVIEW_ORIGIN_NAMESPACE_MISMATCH");
  const resultMatches = input.registry.value.results.filter((entry) => entry.queueId === originEvidence.queueId && entry.productKey === originEvidence.productKey);
  if (resultMatches.length !== 1 || resultMatches[0].status !== "pass" || !samePath(String(resultMatches[0].receiptPath ?? ""), originEvidence.reviewReceiptPath)) {
    throw new Error("IMMUTABLE_REVIEW_ORIGIN_RESULT_INVALID");
  }
  const exactMatches = input.registry.value.exactBindings.filter((entry) => entry.queueId === originEvidence.queueId && entry.productKey === originEvidence.productKey);
  if (exactMatches.length !== 1 || exactMatches[0].videoSha256 !== originEvidence.videoSha256
    || exactMatches[0].machineQaSourceSha256 !== originEvidence.machineQaSourceSha256) {
    throw new Error("IMMUTABLE_REVIEW_ORIGIN_EXACT_BINDING_INVALID");
  }
  const boundMs = input.boundToOperationAt.getTime();
  const reviewedMs = Date.parse(originEvidence.reviewedAt);
  if (!Number.isFinite(boundMs) || !Number.isFinite(reviewedMs) || reviewedMs > boundMs + 5_000) throw new Error("IMMUTABLE_REVIEW_TWO_CLOCK_INVALID");
  assertBindingWindow(input.boundToOperationAt, input.targetOperationDate, input.now);
  if (item.id !== originEvidence.queueId || item.productKey !== originEvidence.productKey || item.slotId !== originEvidence.slotId) {
    throw new Error("IMMUTABLE_REVIEW_TARGET_IDENTITY_MISMATCH");
  }
  if (item.candidate.productKey !== item.productKey || item.usageEvidenceAllocation?.productKey !== item.productKey
    || !item.sourceProvider || !item.candidate.sourceProvider) {
    throw new Error("IMMUTABLE_REVIEW_CURRENT_PRODUCT_BINDING_INVALID");
  }
  const affiliate = validateCoupangAffiliateUrl(item.candidate.selectedAffiliateUrl);
  if (!affiliate.affiliateReady) throw new Error("IMMUTABLE_REVIEW_CURRENT_BUSINESS_ELIGIBILITY_INVALID");
  if (input.targetItemState !== "source") {
    const carry = item.operationCarryover;
    const stateMatches = input.targetItemState === "prepared"
      ? item.status === "video_ready_machine_qa" && item.reviewMetadata.codexReview === "not_executed" && !item.reviewMetadata.evidence && !item.reviewMetadata.operationBinding
      : item.status === "video_ready_autoqa" && item.reviewMetadata.codexReview === "pass" && !item.reviewMetadata.evidence && Boolean(item.reviewMetadata.operationBinding);
    if (!carry || item.queueDate !== input.targetOperationDate || !stateMatches
      || carry.originOperationNamespace !== originEvidence.originOperationNamespace || carry.originQueueId !== originEvidence.originQueueId
      || carry.originVideoSha256 !== originEvidence.originVideoSha256 || carry.sourceVideoHash !== originEvidence.videoSha256
      || carry.sourceReviewHash !== originEvidence.machineQaDigest || carry.regenerationCount !== originEvidence.regenerationCount) {
      throw new Error("IMMUTABLE_REVIEW_PREPARED_OPERATION_BINDING_INVALID");
    }
  }
  await assertCodexExecutorReceipt(originEvidence);
  const [video, machineQa, receipt] = await Promise.all([
    inspectFile(item.videoPath, "IMMUTABLE_REVIEW_VIDEO_NOT_FOUND"),
    inspectFile(item.reviewPath, "IMMUTABLE_REVIEW_MACHINE_QA_NOT_FOUND"),
    inspectFile(originEvidence.reviewReceiptPath, "IMMUTABLE_REVIEW_ORIGIN_RECEIPT_NOT_FOUND"),
  ]);
  if (!samePath(video.path, originEvidence.videoPath) || video.sha256 !== originEvidence.videoSha256 || video.size !== originEvidence.videoSize) {
    throw new Error("IMMUTABLE_REVIEW_VIDEO_IDENTITY_MISMATCH");
  }
  if (!samePath(machineQa.path, originEvidence.sourceReviewArtifact) || machineQa.sha256 !== originEvidence.machineQaDigest) {
    throw new Error("IMMUTABLE_REVIEW_MACHINE_QA_DIGEST_MISMATCH");
  }
  if (receipt.sha256 !== originEvidence.reviewReceiptSha256) throw new Error("IMMUTABLE_REVIEW_ORIGIN_RECEIPT_DIGEST_MISMATCH");
  await assertCodexMachineQaArtifact(machineQa.path, item.productKey);
  if (!originEvidence.originOperationNamespace || !originEvidence.originQueueId || !originEvidence.originVideoSha256
    || originEvidence.originVideoSha256 !== originEvidence.videoSha256 || originEvidence.regenerationCount < 0) {
    throw new Error("IMMUTABLE_REVIEW_ORIGIN_LINEAGE_INVALID");
  }
  const currentProductBindingDigest = stableDigest({
    targetOperationNamespace: input.targetOperationNamespace,
    targetOperationDate: input.targetOperationDate,
    queueId: item.id,
    slotId: item.slotId,
    productKey: item.productKey,
    candidate: item.candidate,
    usageEvidenceAllocation: item.usageEvidenceAllocation,
  });
  const currentBusinessEligibilityDigest = stableDigest({
    productKey: item.productKey,
    sourceProvider: item.sourceProvider,
    candidateSourceProvider: item.candidate.sourceProvider,
    sourceKeyword: item.sourceKeyword,
    useCase: item.candidate.useCase,
    category: item.candidate.category,
    affiliateReadinessCode: affiliate.affiliateReadinessCode,
    approvedHost: affiliate.approvedHost,
  });
  const currentArtifactDigest = stableDigest({
    videoPath: video.path,
    videoSha256: video.sha256,
    videoSize: video.size,
    machineQaPath: machineQa.path,
    machineQaDigest: machineQa.sha256,
    productReferenceSha256: originEvidence.productReferenceSha256!,
    visualEvidenceDigest: originEvidence.visualEvidenceDigest!,
    usageEvidenceDigest: originEvidence.usageEvidenceDigest!,
    visualEvidenceBindingSha256: originEvidence.visualEvidenceBindingSha256!,
  });
  if (![originEvidence.productReferenceSha256, originEvidence.visualEvidenceDigest, originEvidence.usageEvidenceDigest,
    originEvidence.visualEvidenceBindingSha256].every(isSha256)) throw new Error("IMMUTABLE_REVIEW_ORIGIN_VISUAL_EVIDENCE_INCOMPLETE");
  return {
    schemaVersion: IMMUTABLE_REVIEW_BINDING_SCHEMA_VERSION,
    evidenceMode: "immutable_carry_forward_binding",
    targetOperationNamespace: input.targetOperationNamespace,
    targetOperationDate: input.targetOperationDate,
    targetQueueId: item.id,
    targetSlotId: item.slotId,
    targetProductKey: item.productKey,
    boundVideoPath: video.path,
    boundVideoSha256: video.sha256,
    boundVideoSize: video.size,
    originRegistryPath: input.registry.path,
    originRegistrySha256: input.registry.sha256,
    originEvidenceDigest: stableDigest(originEvidence),
    originReceiptPath: receipt.path,
    originReceiptDigest: receipt.sha256,
    originOperationNamespace: originEvidence.operationNamespace,
    originQueueId: originEvidence.queueId,
    originProductKey: originEvidence.productKey,
    originReviewedAt: originEvidence.reviewedAt,
    originSchemaVersion: originEvidence.schemaVersion,
    originSourceOperationNamespace: originEvidence.originOperationNamespace,
    originSourceQueueId: originEvidence.originQueueId,
    originSourceVideoSha256: originEvidence.originVideoSha256,
    originRegenerationCount: originEvidence.regenerationCount,
    boundToOperationAt: input.boundToOperationAt.toISOString(),
    bindingReason: "exact_immutable_media_carry_forward",
    bindingValidatorVersion: IMMUTABLE_REVIEW_BINDING_VALIDATOR_VERSION,
    bindingSchemaVersion: IMMUTABLE_REVIEW_BINDING_SCHEMA_VERSION,
    compatibilityDecision: "COMPATIBLE",
    machineQaDigest: machineQa.sha256,
    productReferenceSha256: originEvidence.productReferenceSha256!,
    visualEvidenceDigest: originEvidence.visualEvidenceDigest!,
    usageEvidenceDigest: originEvidence.usageEvidenceDigest!,
    visualEvidenceBindingSha256: originEvidence.visualEvidenceBindingSha256!,
    currentProductBindingDigest,
    currentBusinessEligibilityDigest,
    currentArtifactDigest,
    bindingResult: "pass",
    SAFE_TO_UPLOAD: false,
    SAFE_TO_PUBLIC_UPLOAD: false,
    PLATFORM_UPLOAD: 0,
  };
}

async function loadOriginRegistry(path: string) {
  const file = await inspectFile(path, "IMMUTABLE_REVIEW_ORIGIN_REGISTRY_NOT_FOUND");
  let value: OriginRegistry;
  try { value = JSON.parse(await readFile(file.path, "utf8")) as OriginRegistry; }
  catch { throw new Error("IMMUTABLE_REVIEW_ORIGIN_REGISTRY_INVALID"); }
  if (value.schemaVersion !== "daily69-carry-forward-codex-review-registry-v1"
    || value.decision !== "CARRY_FORWARD_CODEX_REVALIDATION_PASS" || !isOperationNamespace(value.targetNamespace)
    || value.requested !== 9 || value.passed !== 9 || !Array.isArray(value.evidence) || value.evidence.length !== 9
    || !Array.isArray(value.exactBindings) || value.exactBindings.length !== 9 || !Array.isArray(value.results) || value.results.length !== 9
    || value.SAFE_TO_UPLOAD !== false || value.SAFE_TO_PUBLIC_UPLOAD !== false || value.PLATFORM_UPLOAD !== 0) {
    throw new Error("IMMUTABLE_REVIEW_ORIGIN_REGISTRY_INVALID");
  }
  if (value.evidence.some((entry) => !isCodexReviewEvidenceV2(entry))
    || new Set(value.evidence.map((entry) => entry.queueId)).size !== 9
    || new Set(value.evidence.map((entry) => entry.productKey)).size !== 9) {
    throw new Error("IMMUTABLE_REVIEW_ORIGIN_REGISTRY_INVALID");
  }
  return { path: file.path, sha256: file.sha256, value };
}

function assertTarget(namespace: string, date: string) {
  if (!isOperationNamespace(namespace) || namespace !== `operation-${date}` || !/^\d{4}-\d{2}-\d{2}$/u.test(date)) {
    throw new Error("IMMUTABLE_REVIEW_TARGET_NAMESPACE_INVALID");
  }
}

function assertBindingWindow(boundAt: Date, targetDate: string, now?: Date) {
  const boundMs = boundAt.getTime();
  const operationStartMs = Date.parse(`${targetDate}T00:00:00+09:00`);
  if (!Number.isFinite(boundMs) || !Number.isFinite(operationStartMs) || boundMs >= operationStartMs
    || operationStartMs - boundMs > MAX_PRE_OPERATION_BINDING_WINDOW_MS) {
    throw new Error("IMMUTABLE_REVIEW_BINDING_WINDOW_INVALID");
  }
  if (now && (boundMs > now.getTime() + 5_000 || now.getTime() - boundMs > APPLICATION_FRESHNESS_MS)) {
    throw new Error("IMMUTABLE_REVIEW_BINDING_TIMESTAMP_NOT_FRESH");
  }
}

async function inspectFile(path: string, code: string) {
  try {
    const canonical = await realpath(resolve(path));
    const metadata = await stat(canonical);
    if (!metadata.isFile()) throw new Error(code);
    return { path: canonical, size: metadata.size, sha256: createHash("sha256").update(await readFile(canonical)).digest("hex") };
  } catch (error) {
    if (error instanceof Error && /^[A-Z0-9_:-]+$/u.test(error.message)) throw error;
    throw new Error(code);
  }
}

function isOperationNamespace(value: unknown): value is string { return typeof value === "string" && /^operation-\d{4}-\d{2}-\d{2}$/u.test(value); }
function isSha256(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value); }
function samePath(left: string, right: string) { return process.platform === "win32" ? resolve(left).toLowerCase() === resolve(right).toLowerCase() : resolve(left) === resolve(right); }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
  return JSON.stringify(value);
}
