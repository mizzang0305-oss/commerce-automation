import { createReadStream } from "node:fs";
import { access, mkdir, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { atomicWriteJson } from "./atomicJson";
import { captureCodexReviewEvidence } from "./codexReviewEvidence";
import { assertCodexUsageEvidenceBinding, type CodexUsageEvidenceProvenance } from "./codexUsageEvidence";
import { acquireProcessLock } from "./lock";
import type { CodexReviewEvidenceV2 } from "./types";
import { assertCodexVisualEvidenceBinding, CODEX_VISUAL_EVIDENCE_ROLES, readCodexVisualEvidenceBinding, type CodexVisualEvidenceRole } from "./visualEvidenceBinding";
import { inspectCodexRuntimeBinding, readOperationCodexRuntime, verifyCodexRuntimeBeforeInvocation, type CodexRuntimeBinding } from "./codexRuntimeBinding";
import { captureCliProcess, cliInvocationError, CodexCliInvocationError, receiptCliDiagnostic, type CapturedCliProcess, type CodexCliFailureDiagnostic } from "./codexCliDiagnostics";
import { assertDiagnosticIsolation, assertDiagnosticPath } from "./codexReviewDiagnosticPaths";

export const CODEX_REVIEW_OUTPUT_SCHEMA_VERSION = "queue-codex-review-output-v1" as const;
export const CODEX_REVIEW_RECEIPT_SCHEMA_VERSION = "queue-codex-review-executor-receipt-v2" as const;
export const CODEX_REVIEW_EXECUTOR_TYPE = "authenticated_codex_cli" as const;

export type CodexReviewProvenance = "natural" | "carry_forward_revalidation" | "diagnostic";

export { CODEX_VISUAL_EVIDENCE_ROLES } from "./visualEvidenceBinding";
export type { CodexVisualEvidenceRole } from "./visualEvidenceBinding";
export type { CodexUsageEvidenceProvenance } from "./codexUsageEvidence";

export type CodexReviewRequest = {
  operationNamespace: string;
  slotId: string;
  queueId: string;
  productKey: string;
  productName: string;
  videoPath: string;
  machineQaSourceArtifact: string;
  finalReviewArtifact: string;
  productReferencePath: string;
  visualEvidencePaths: string[];
  visualEvidenceRoles: readonly CodexVisualEvidenceRole[];
  visualEvidenceBindingPath: string;
  usageEvidenceProvenance: CodexUsageEvidenceProvenance;
  receiptRoot: string;
  provenance: CodexReviewProvenance;
  diagnosticRoot?: string;
  diagnosticRuntimeBinding?: CodexRuntimeBinding;
  regenerationCount?: number;
  originOperationNamespace?: string;
  originQueueId?: string;
  originVideoSha256?: string;
};

export type CodexReviewExecution = {
  status: "pass" | "block" | "error";
  errorCode: string;
  retryable: boolean;
  attempts: number;
  deduplicated: boolean;
  receiptPath: string;
  evidence?: CodexReviewEvidenceV2;
};

type ModelReviewOutput = {
  schemaVersion: typeof CODEX_REVIEW_OUTPUT_SCHEMA_VERSION;
  queueId: string;
  productKey: string;
  videoSha256: string;
  reviewResult: "pass" | "block";
  hardBlockers: string[];
  safeSummary: string;
  reviewedAt: string;
  reviewerType: "codex";
  executorType: typeof CODEX_REVIEW_EXECUTOR_TYPE;
  firstFrameNote: string;
  firstThreeSecondsNote: string;
  contactSheetNote: string;
};

type InvocationResult = {
  exitCode: number;
  output: unknown;
  usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number };
  processDiagnostic?: CodexCliProcessDiagnostic;
};

// Minimal process-to-receipt linkage for Level3 success proof. Never retain
// stdout/stderr text, arguments, environment, or authentication state here.
type CodexCliProcessDiagnostic = Pick<CapturedCliProcess,
  "processId" | "exitCode" | "signal" | "startedAt" | "completedAt" | "terminationConfirmed"
  | "stdoutByteLength" | "stderrByteLength" | "stdoutSha256" | "stderrSha256"
  | "stdoutWasTruncated" | "stderrWasTruncated"> & {
    schemaVersion: "codex-cli-process-diagnostic-v1";
    phase: "exit";
    durationMs: number;
    codexCliVersion: string;
    resolvedExecutableFingerprint: string;
  };

type ReviewDependencies = {
  invoke?: (input: {
    prompt: string;
    imagePaths: string[];
    schemaPath: string;
    outputPath: string;
    cwd: string;
    timeoutMs: number;
    env: NodeJS.ProcessEnv;
    runtimeBinding?: CodexRuntimeBinding;
  }) => Promise<InvocationResult>;
  now?: () => Date;
  env?: NodeJS.ProcessEnv;
  delay?: (milliseconds: number) => Promise<void>;
};

type ExecutorReceipt = {
  schemaVersion: typeof CODEX_REVIEW_RECEIPT_SCHEMA_VERSION;
  status: "started" | "completed" | "error";
  invoked: boolean;
  provenance: CodexReviewProvenance;
  operationNamespace: string;
  slotId: string;
  queueId: string;
  productKey: string;
  productName: string;
  videoPath: string;
  videoSha256: string;
  videoSize: number;
  machineQaSourceArtifact: string;
  machineQaSourceSha256: string;
  finalReviewArtifact: string;
  finalReviewArtifactSha256: string;
  productReference: { path: string; sha256: string; size: number; identityType: "product_reference" };
  visualEvidence: Array<{ path: string; sha256: string; size: number; role: CodexVisualEvidenceRole }>;
  usageEvidenceProvenance: CodexUsageEvidenceProvenance;
  visualEvidenceBindingPath: string;
  visualEvidenceBindingSha256: string;
  reviewResult?: "pass" | "block";
  hardBlockers?: string[];
  safeSummary?: string;
  reviewedAt?: string;
  modelReviewedAt?: string;
  firstFrameNote?: string;
  firstThreeSecondsNote?: string;
  contactSheetNote?: string;
  reviewerType: "codex";
  executorType: typeof CODEX_REVIEW_EXECUTOR_TYPE;
  attempt: number;
  regenerationCount: number;
  originOperationNamespace?: string;
  originQueueId?: string;
  originVideoSha256?: string;
  exitCode?: number | null;
  errorCode?: string;
  startedAt?: string;
  completedAt?: string;
  diagnostic?: CodexCliFailureDiagnostic;
  processDiagnostic?: CodexCliProcessDiagnostic;
  usage?: InvocationResult["usage"];
  runtimeBinding?: CodexRuntimeBinding;
  SAFE_TO_UPLOAD: false;
  SAFE_TO_PUBLIC_UPLOAD: false;
  PLATFORM_UPLOAD: 0;
};

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion", "queueId", "productKey", "videoSha256", "reviewResult", "hardBlockers",
    "safeSummary", "reviewedAt", "reviewerType", "executorType", "firstFrameNote",
    "firstThreeSecondsNote", "contactSheetNote"
  ],
  properties: {
    schemaVersion: { type: "string", const: CODEX_REVIEW_OUTPUT_SCHEMA_VERSION },
    queueId: { type: "string", minLength: 1, maxLength: 256 },
    productKey: { type: "string", minLength: 1, maxLength: 512 },
    videoSha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
    reviewResult: { type: "string", enum: ["pass", "block"] },
    hardBlockers: { type: "array", maxItems: 8, items: { type: "string", pattern: "^[A-Z0-9_:-]{1,96}$" } },
    safeSummary: { type: "string", minLength: 20, maxLength: 800 },
    reviewedAt: { type: "string", minLength: 20, maxLength: 40 },
    reviewerType: { type: "string", const: "codex" },
    executorType: { type: "string", const: CODEX_REVIEW_EXECUTOR_TYPE },
    firstFrameNote: { type: "string", minLength: 20, maxLength: 800 },
    firstThreeSecondsNote: { type: "string", minLength: 20, maxLength: 800 },
    contactSheetNote: { type: "string", minLength: 20, maxLength: 800 }
  }
} as const;

const DAILY_INVOCATION_CAP = 69;
const PER_VIDEO_ATTEMPT_CAP = 2;
const INVOCATION_TIMEOUT_MS = 10 * 60_000;

export function buildCodexReviewOutputSchema(requestedAt: Date) {
  return { ...OUTPUT_SCHEMA, properties: { ...OUTPUT_SCHEMA.properties, reviewedAt: { type: "string", const: requestedAt.toISOString() } } };
}

export async function executeAuthenticatedCodexReview(
  input: CodexReviewRequest,
  dependencies: ReviewDependencies = {},
): Promise<CodexReviewExecution> {
  const now = dependencies.now ?? (() => new Date());
  const env = dependencies.env ?? process.env;
  const invoke = dependencies.invoke ?? invokeCodexCli;
  // This gate must run before directory/lock/receipt creation or ledger recovery.
  const diagnosticRoot = input.provenance === "diagnostic" ? await assertDiagnosticIsolation(input) : undefined;
  if (input.provenance !== "diagnostic" && input.diagnosticRuntimeBinding) throw new Error("CODEX_REVIEW_DIAGNOSTIC_RUNTIME_FORBIDDEN");
  const receiptRoot = resolve(input.receiptRoot);
  const receiptsRoot = join(receiptRoot, "receipts");
  const attemptsRoot = join(receiptRoot, "attempts");
  let runtimeBinding: CodexRuntimeBinding | undefined;
  // Infrastructure admission must fail before any executor directory, lock,
  // receipt, or attempt counter is created. Historical operations are read only.
  try {
    runtimeBinding = diagnosticRoot
      ? input.diagnosticRuntimeBinding ? await inspectCodexRuntimeBinding(input.diagnosticRuntimeBinding) : undefined
      : await readOperationCodexRuntime(dirname(receiptRoot), input.operationNamespace, Boolean(env.FIRST_OPERATION_SOURCE_ROOT));
  } catch (error) {
    return failed(safeError(error), false, 0, "");
  }
  await Promise.all([mkdir(receiptsRoot, { recursive: true }), mkdir(attemptsRoot, { recursive: true })]);
  let release: (() => Promise<void>) | null = null;
  try {
    release = await acquireProcessLock(join(receiptRoot, "executor.lock"), `codex-review-${process.pid}`, 15 * 60_000);
  } catch {
    return failed("CODEX_REVIEW_CONCURRENCY_LOCKED", true, 0, "");
  }
  try {
    const validated = await validateRequest(input);
    const receipts = await readReceipts(receiptsRoot);
    const sameSha = receipts.filter((receipt) => receipt.videoSha256 === validated.video.sha256);
    const completed = sameSha.find((receipt) => receipt.status === "completed");
    if (completed) {
      if (!receiptBindingMatches(completed, input, validated)) return failed("CODEX_REVIEW_DUPLICATE_SHA_BINDING_CONFLICT", false, sameSha.length, "");
      const receiptPath = receiptFile(receiptsRoot, validated.video.sha256, completed.attempt);
      const evidence = input.provenance === "diagnostic" ? undefined : await evidenceFromReceipt(completed, receiptPath);
      return { status: completed.reviewResult ?? "block", errorCode: "", retryable: false, attempts: sameSha.length, deduplicated: true, receiptPath, ...(evidence ? { evidence } : {}) };
    }
    const invokedCount = receipts.filter((receipt) => receipt.invoked).length;
    const lastAttempt = sameSha.filter(receipt => receipt.invoked).sort((a, b) => b.attempt - a.attempt)[0];
    if (lastAttempt?.status === "error" && lastAttempt.errorCode && codexCliRetryDelayMs(lastAttempt.errorCode, lastAttempt.attempt) === null) {
      return failed(lastAttempt.errorCode, false, sameSha.length, receiptFile(receiptsRoot, validated.video.sha256, lastAttempt.attempt));
    }
    if (invokedCount >= DAILY_INVOCATION_CAP) return failed("CODEX_REVIEW_DAILY_CAP_REACHED", false, sameSha.length, "");
    if (sameSha.filter((receipt) => receipt.invoked).length >= PER_VIDEO_ATTEMPT_CAP) {
      const latestAttempt = Math.max(...sameSha.map((receipt) => receipt.attempt));
      return failed("CODEX_REVIEW_PER_VIDEO_ATTEMPT_CAP_REACHED", false, sameSha.length, receiptFile(receiptsRoot, validated.video.sha256, latestAttempt));
    }

    let lastFailure: CodexReviewExecution | null = null;
    for (let attempt = sameSha.length + 1; attempt <= PER_VIDEO_ATTEMPT_CAP; attempt += 1) {
      if (runtimeBinding) {
        try { await verifyCodexRuntimeBeforeInvocation(runtimeBinding); }
        catch (error) { return failed(safeError(error), false, attempt - 1, lastFailure?.receiptPath ?? ""); }
      }
      const currentReceipts = await readReceipts(receiptsRoot);
      if (currentReceipts.filter((receipt) => receipt.invoked).length >= DAILY_INVOCATION_CAP) {
        return failed("CODEX_REVIEW_DAILY_CAP_REACHED", false, attempt - 1, lastFailure?.receiptPath ?? "");
      }
      const attemptRoot = join(attemptsRoot, `${validated.video.sha256}-attempt-${attempt}`);
      await mkdir(attemptRoot, { recursive: false });
      const schemaPath = join(attemptRoot, "output-schema.json");
      const outputPath = join(attemptRoot, "structured-output.json");
      const requestedAt = now();
      if (diagnosticRoot) {
        await assertDiagnosticPath(diagnosticRoot, schemaPath);
        await assertDiagnosticPath(diagnosticRoot, outputPath);
      }
      await writeFile(schemaPath, `${JSON.stringify(buildCodexReviewOutputSchema(requestedAt), null, 2)}\n`, "utf8");
      const receiptPath = receiptFile(receiptsRoot, validated.video.sha256, attempt);
      const started: ExecutorReceipt = {
        schemaVersion: CODEX_REVIEW_RECEIPT_SCHEMA_VERSION,
        status: "started",
        startedAt: requestedAt.toISOString(),
        invoked: true,
        provenance: input.provenance,
        operationNamespace: input.operationNamespace,
        slotId: input.slotId,
        queueId: input.queueId,
        productKey: input.productKey,
        productName: input.productName,
        videoPath: validated.video.path,
        videoSha256: validated.video.sha256,
        videoSize: validated.video.size,
        machineQaSourceArtifact: validated.machineQa.path,
        machineQaSourceSha256: validated.machineQa.sha256,
        finalReviewArtifact: resolve(input.finalReviewArtifact),
        finalReviewArtifactSha256: "",
        productReference: validated.productReference,
        visualEvidence: validated.visualEvidence,
        usageEvidenceProvenance: input.usageEvidenceProvenance,
        visualEvidenceBindingPath: validated.visualBinding.path,
        visualEvidenceBindingSha256: validated.visualBinding.sha256,
        reviewerType: "codex",
        executorType: CODEX_REVIEW_EXECUTOR_TYPE,
        attempt,
        regenerationCount: input.regenerationCount ?? 0,
        ...(input.originOperationNamespace ? { originOperationNamespace: input.originOperationNamespace } : {}),
        ...(input.originQueueId ? { originQueueId: input.originQueueId } : {}),
        ...(input.originVideoSha256 ? { originVideoSha256: input.originVideoSha256 } : {}),
        SAFE_TO_UPLOAD: false,
        SAFE_TO_PUBLIC_UPLOAD: false,
        PLATFORM_UPLOAD: 0,
        ...(runtimeBinding ? { runtimeBinding } : {}),
      };
      await atomicWriteJson(receiptPath, started);
      let invocationUsage: InvocationResult["usage"] | undefined;
      let observedExitCode: number | undefined;
      let processDiagnostic: CodexCliProcessDiagnostic | undefined;
      try {
        const result = await invoke({
          prompt: buildPrompt(input, validated.video.sha256, validated.machineSummary, requestedAt),
          imagePaths: [validated.productReference.path, ...validated.visualEvidence.map((entry) => entry.path)],
          schemaPath,
          outputPath,
          cwd: attemptRoot,
          timeoutMs: INVOCATION_TIMEOUT_MS,
          env,
          runtimeBinding,
        });
        invocationUsage = result.usage;
        observedExitCode = result.exitCode;
        processDiagnostic = result.processDiagnostic ? receiptProcessDiagnostic(result.processDiagnostic) : undefined;
        if (result.exitCode !== 0) throw new Error("CODEX_REVIEW_CLI_EXIT_NONZERO");
        const model = validateModelOutput(result.output, input, validated.video.sha256, requestedAt.toISOString());
        const reviewedAt = now().toISOString();
        const finalReviewArtifact = await materializeFinalReviewArtifact({ input, model, validated, reviewedAt });
        const completedReceipt: ExecutorReceipt = {
          ...started,
          status: "completed",
          completedAt: now().toISOString(),
          finalReviewArtifact: finalReviewArtifact.path,
          finalReviewArtifactSha256: finalReviewArtifact.sha256,
          reviewResult: model.reviewResult,
          hardBlockers: model.hardBlockers,
          safeSummary: model.safeSummary,
          reviewedAt,
          modelReviewedAt: model.reviewedAt,
          firstFrameNote: model.firstFrameNote,
          firstThreeSecondsNote: model.firstThreeSecondsNote,
          contactSheetNote: model.contactSheetNote,
          exitCode: result.exitCode,
          usage: result.usage,
          ...(processDiagnostic ? { processDiagnostic } : {}),
        };
        await atomicWriteJson(receiptPath, completedReceipt);
        const evidence = input.provenance === "diagnostic" ? undefined : await evidenceFromReceipt(completedReceipt, receiptPath);
        return { status: model.reviewResult, errorCode: "", retryable: false, attempts: attempt, deduplicated: false, receiptPath, ...(evidence ? { evidence } : {}) };
      } catch (error) {
        const errorCode = safeError(error);
        const delayMs = codexCliRetryDelayMs(errorCode, attempt);
        const retryable = delayMs !== null;
        const diagnostic = error instanceof CodexCliInvocationError ? receiptCliDiagnostic(error, Boolean(diagnosticRoot)) : undefined;
        const admissionRejected = errorCode.startsWith("CODEX_CAPSULE_");
        await atomicWriteJson(receiptPath, { ...started, ...(admissionRejected ? { invoked: false } : {}), status: "error", completedAt: now().toISOString(), errorCode,
          exitCode: diagnostic ? diagnostic.cliExitCode : observedExitCode,
          ...(diagnostic ? { diagnostic } : {}), ...(processDiagnostic ? { processDiagnostic } : {}), ...(invocationUsage ? { usage: invocationUsage } : {}) });
        lastFailure = failed(errorCode, retryable, admissionRejected ? attempt - 1 : attempt, receiptPath);
        if (!retryable) return lastFailure;
        await (dependencies.delay ?? (ms => new Promise(resolve => setTimeout(resolve, ms))))(delayMs!);
      }
    }
    return lastFailure ?? failed("CODEX_REVIEW_EXECUTOR_FAILED", false, PER_VIDEO_ATTEMPT_CAP, "");
  } catch (error) {
    const code = safeError(error);
    const failurePath = join(receiptsRoot, `input-failure-${Date.now()}.json`);
    await atomicWriteJson(failurePath, {
      schemaVersion: CODEX_REVIEW_RECEIPT_SCHEMA_VERSION,
      status: "error",
      invoked: false,
      provenance: input.provenance,
      operationNamespace: safeIdentity(input.operationNamespace),
      queueId: safeIdentity(input.queueId),
      productKey: safeIdentity(input.productKey),
      errorCode: code,
      reviewerType: "codex",
      executorType: CODEX_REVIEW_EXECUTOR_TYPE,
      SAFE_TO_UPLOAD: false,
      SAFE_TO_PUBLIC_UPLOAD: false,
      PLATFORM_UPLOAD: 0,
    });
    return failed(code, false, 0, failurePath);
  } finally {
    await release();
  }
}

async function validateRequest(input: CodexReviewRequest) {
  if (!["natural", "carry_forward_revalidation", "diagnostic"].includes(input.provenance)) throw new Error("CODEX_REVIEW_PROVENANCE_INVALID");
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(input.operationNamespace)) throw new Error("CODEX_REVIEW_NAMESPACE_INVALID");
  if (!/^slot-\d{3}$/u.test(input.slotId) || !input.queueId.trim() || !input.productKey.trim() || input.productName.trim().length < 2) throw new Error("CODEX_REVIEW_BINDING_INVALID");
  if (input.visualEvidencePaths.length !== CODEX_VISUAL_EVIDENCE_ROLES.length
    || input.visualEvidenceRoles.length !== CODEX_VISUAL_EVIDENCE_ROLES.length
    || input.visualEvidenceRoles.some((role, index) => role !== CODEX_VISUAL_EVIDENCE_ROLES[index])) {
    throw new Error("CODEX_REVIEW_VISUAL_EVIDENCE_ROLES_INVALID");
  }
  const video = await inspectFile(input.videoPath, "CODEX_REVIEW_VIDEO_NOT_FOUND");
  if (input.originVideoSha256 && input.originVideoSha256 !== video.sha256) throw new Error("CODEX_REVIEW_ORIGIN_VIDEO_SHA_MISMATCH");
  const machineQa = await inspectFile(input.machineQaSourceArtifact, "CODEX_REVIEW_MACHINE_QA_SOURCE_NOT_FOUND");
  await assertCodexUsageEvidenceBinding(input.usageEvidenceProvenance, input.productKey, video, machineQa);
  const productReference = {
    ...await inspectFile(input.productReferencePath, "CODEX_REVIEW_PRODUCT_REFERENCE_NOT_FOUND"),
    identityType: "product_reference" as const,
  };
  const visualEvidence = await Promise.all(input.visualEvidencePaths.map(async (path, index) => ({
    ...await inspectFile(path, "CODEX_REVIEW_INPUT_VISUAL_EVIDENCE_NOT_FOUND"),
    role: input.visualEvidenceRoles[index],
  })));
  const visualBinding = await readCodexVisualEvidenceBinding(input.visualEvidenceBindingPath);
  await assertCodexVisualEvidenceBinding({ binding: visualBinding.binding, productKey: input.productKey, video, productReference, visualEvidence });
  const machineSummary = await readMachineSummary(machineQa.path, input.productKey);
  if (machineSummary.machineQaPassed !== true) throw new Error("CODEX_REVIEW_MACHINE_QA_NOT_PASSED");
  return { video, machineQa, productReference, visualEvidence, visualBinding, machineSummary };
}

async function readMachineSummary(path: string, productKey: string) {
  let value: Record<string, unknown>;
  try { value = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>; }
  catch { throw new Error("CODEX_REVIEW_MACHINE_QA_SOURCE_INVALID"); }
  const entries = Array.isArray(value.items) ? value.items.filter(isRecord) : [value];
  const matches = entries.filter((entry) => entry.productKey === productKey);
  if (matches.length !== 1) throw new Error("CODEX_REVIEW_MACHINE_QA_PRODUCT_BINDING_INVALID");
  const item = matches[0];
  return {
    machineQaPassed: item.machineQaPassed,
    status: String(item.status ?? ""),
    creativeScore: Number(item.creativeScore ?? 0),
    videoQualityScore: Number(item.score ?? 0),
    blockers: Array.isArray(item.blockers) ? item.blockers.filter((entry): entry is string => typeof entry === "string").slice(0, 8) : [],
  };
}

function buildPrompt(input: CodexReviewRequest, videoSha256: string, machineSummary: Record<string, unknown>, requestedAt: Date) {
  return [
    "You are the bounded visual QA reviewer for a local no-upload commerce video pipeline.",
    "Inspect only the attached local visual evidence. Do not use shell, web, network tools, or external services.",
    "Return only the strict JSON object required by the supplied schema.",
    "Block on obvious blank/corrupt frames, product identity inconsistency, unreadable or badly overlapping text, unsafe imagery, severe crop, or visible render defects.",
    "The first attached image is the authoritative exact-product reference. The remaining images are labeled video evidence roles in the order supplied below.",
    "Generic usage scenes are contextual examples only. They are not exact-product evidence and must not be treated as the selected product.",
    "Do not block merely because a clearly labeled generic context scene differs from the exact product. Do block if the video presents that generic scene as the exact product, mixes another authoritative product, obscures the selected product identity, or makes product-specific claims unsupported by the exact reference.",
    "Do not claim to inspect audio or the MP4 directly; the attached frames/contact sheets plus machine QA are the evidence.",
    "If only one contact sheet is attached, use it to assess first frame, first three seconds, and full-video continuity separately.",
    "A pass requires hardBlockers to be empty. A block requires at least one uppercase safe blocker code.",
    `schemaVersion=${CODEX_REVIEW_OUTPUT_SCHEMA_VERSION}`,
    `operationNamespace=${input.operationNamespace}`,
    `slotId=${input.slotId}`,
    `queueId=${input.queueId}`,
    `productKey=${input.productKey}`,
    `productName=${JSON.stringify(input.productName)}`,
    `videoSha256=${videoSha256}`,
    `productReference=${JSON.stringify({ path: resolve(input.productReferencePath), identityType: "product_reference" })}`,
    `visualEvidence=${JSON.stringify(input.visualEvidencePaths.map((path, index) => ({ path: resolve(path), role: input.visualEvidenceRoles[index] })))}`,
    `usageEvidenceProvenance=${JSON.stringify(input.usageEvidenceProvenance)}`,
    "reviewerType=codex",
    `executorType=${CODEX_REVIEW_EXECUTOR_TYPE}`,
    `requestedAt=${requestedAt.toISOString()}`,
    "Echo requestedAt exactly as reviewedAt. This is a host-supplied immutable timestamp; do not infer, translate, or invent a timestamp.",
    `machineQa=${JSON.stringify(machineSummary)}`,
    "Never change the supplied queueId, productKey, or videoSha256 bindings.",
  ].join("\n");
}

function validateModelOutput(value: unknown, input: CodexReviewRequest, videoSha256: string, requestedAt: string): ModelReviewOutput {
  if (!isRecord(value)) throw new Error("CODEX_REVIEW_STRUCTURED_OUTPUT_INVALID");
  const candidate = value as Partial<ModelReviewOutput>;
  if (candidate.schemaVersion !== CODEX_REVIEW_OUTPUT_SCHEMA_VERSION || candidate.queueId !== input.queueId
    || candidate.productKey !== input.productKey || candidate.videoSha256 !== videoSha256
    || candidate.reviewerType !== "codex" || candidate.executorType !== CODEX_REVIEW_EXECUTOR_TYPE) {
    throw new Error("CODEX_REVIEW_STRUCTURED_BINDING_MISMATCH");
  }
  if (candidate.reviewResult !== "pass" && candidate.reviewResult !== "block") throw new Error("CODEX_REVIEW_STRUCTURED_RESULT_INVALID");
  if (!Array.isArray(candidate.hardBlockers) || candidate.hardBlockers.some((entry) => typeof entry !== "string" || !/^[A-Z0-9_:-]{1,96}$/u.test(entry))) {
    throw new Error("CODEX_REVIEW_STRUCTURED_BLOCKERS_INVALID");
  }
  if ((candidate.reviewResult === "pass" && candidate.hardBlockers.length !== 0) || (candidate.reviewResult === "block" && candidate.hardBlockers.length === 0)) {
    throw new Error("CODEX_REVIEW_RESULT_BLOCKER_CONFLICT");
  }
  for (const key of ["safeSummary", "firstFrameNote", "firstThreeSecondsNote", "contactSheetNote"] as const) {
    if (typeof candidate[key] !== "string" || candidate[key].trim().length < 20 || candidate[key].trim().toLowerCase() === "looks good") {
      throw new Error("CODEX_REVIEW_STRUCTURED_NOTES_INVALID");
    }
  }
  const modelReviewedAt = Date.parse(String(candidate.reviewedAt ?? ""));
  if (!Number.isFinite(modelReviewedAt)) throw new Error("CODEX_REVIEW_STRUCTURED_TIMESTAMP_INVALID");
  if (candidate.reviewedAt !== requestedAt) throw new Error("CODEX_REVIEW_STRUCTURED_TIMESTAMP_MISMATCH");
  return candidate as ModelReviewOutput;
}

async function materializeFinalReviewArtifact(input: {
  input: CodexReviewRequest;
  model: ModelReviewOutput;
  validated: Awaited<ReturnType<typeof validateRequest>>;
  reviewedAt: string;
}) {
  const target = resolve(input.input.finalReviewArtifact);
  const source = input.validated.machineQa.path;
  if (samePath(target, source)) return inspectFile(target, "CODEX_REVIEW_FINAL_ARTIFACT_NOT_FOUND");
  await mkdir(dirname(target), { recursive: true });
  try { await access(target); throw new Error("CODEX_REVIEW_FINAL_ARTIFACT_ALREADY_EXISTS"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const passed = input.model.reviewResult === "pass";
  const artifact = {
    version: "autonomous-video-review-v2",
    reviewProvenance: input.input.provenance,
    promotionEligible: input.input.provenance !== "diagnostic",
    visualReviewExecuted: true,
    finalAutomatedQaPassed: passed ? 1 : 0,
    reviewedAt: input.reviewedAt,
    items: [{
      productKey: input.input.productKey,
      productName: input.input.productName,
      status: passed ? "AUTO_QA_PASS" : "AUTO_QA_BLOCKED",
      machineQaPassed: true,
      finalAutomatedQaPassed: passed,
      visualReviewExecuted: true,
      blockers: input.model.hardBlockers,
      safeSummary: input.model.safeSummary,
      firstFrameNote: input.model.firstFrameNote,
      firstThreeSecondsNote: input.model.firstThreeSecondsNote,
      contactSheetNote: input.model.contactSheetNote,
      productReference: input.validated.productReference,
      visualEvidence: input.validated.visualEvidence,
      usageEvidenceProvenance: input.input.usageEvidenceProvenance,
      publishReady: false,
      SAFE_TO_UPLOAD: false,
      SAFE_TO_PUBLIC_UPLOAD: false,
    }],
    publishReady: false,
    SAFE_TO_UPLOAD: false,
    SAFE_TO_PUBLIC_UPLOAD: false,
    PLATFORM_UPLOAD: 0,
  };
  await writeFile(target, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return inspectFile(target, "CODEX_REVIEW_FINAL_ARTIFACT_NOT_FOUND");
}

async function evidenceFromReceipt(receipt: ExecutorReceipt, receiptPath: string) {
  if (receipt.status !== "completed" || !receipt.reviewResult || !receipt.reviewedAt || !receipt.hardBlockers || !receipt.safeSummary) {
    throw new Error("CODEX_REVIEW_RECEIPT_INCOMPLETE");
  }
  return captureCodexReviewEvidence({
    operationNamespace: receipt.operationNamespace,
    slotId: receipt.slotId,
    queueId: receipt.queueId,
    productKey: receipt.productKey,
    videoPath: receipt.videoPath,
    reviewedAt: new Date(receipt.reviewedAt),
    reviewResult: receipt.reviewResult,
    sourceReviewArtifact: receipt.finalReviewArtifact,
    notes: receipt.safeSummary,
    hardBlockers: receipt.hardBlockers,
    safeSummary: receipt.safeSummary,
    executorType: CODEX_REVIEW_EXECUTOR_TYPE,
    reviewProvenance: receipt.provenance,
    reviewReceiptPath: receiptPath,
    regenerationCount: receipt.regenerationCount,
    productName: receipt.productName,
    productReferenceSha256: receipt.productReference.sha256,
    visualEvidenceDigest: sha256Text(stableJson(receipt.visualEvidence)),
    usageEvidenceDigest: sha256Text(stableJson(receipt.usageEvidenceProvenance)),
    machineQaSourceArtifact: receipt.machineQaSourceArtifact,
    machineQaSourceSha256: receipt.machineQaSourceSha256,
    visualEvidenceBindingSha256: receipt.visualEvidenceBindingSha256,
    ...(receipt.originOperationNamespace ? { originOperationNamespace: receipt.originOperationNamespace } : {}),
    ...(receipt.originQueueId ? { originQueueId: receipt.originQueueId } : {}),
    ...(receipt.originVideoSha256 ? { originVideoSha256: receipt.originVideoSha256 } : {}),
  });
}

export async function loadCompletedCodexEvidenceFromReceipt(receiptPath: string): Promise<CodexReviewEvidenceV2> {
  const inspected = await inspectFile(receiptPath, "CODEX_REVIEW_RECEIPT_NOT_FOUND");
  let receipt: ExecutorReceipt;
  try { receipt = JSON.parse(await readFile(inspected.path, "utf8")) as ExecutorReceipt; }
  catch { throw new Error("CODEX_REVIEW_RECEIPT_INVALID"); }
  if (receipt.schemaVersion !== CODEX_REVIEW_RECEIPT_SCHEMA_VERSION || receipt.status !== "completed" || receipt.invoked !== true) {
    throw new Error("CODEX_REVIEW_RECEIPT_INVALID");
  }
  if (receipt.provenance === "diagnostic") throw new Error("CODEX_REVIEW_DIAGNOSTIC_PROMOTION_FORBIDDEN");
  return evidenceFromReceipt(receipt, inspected.path);
}

async function invokeCodexCli(input: {
  prompt: string;
  imagePaths: string[];
  schemaPath: string;
  outputPath: string;
  cwd: string;
  timeoutMs: number;
  env: NodeJS.ProcessEnv;
  runtimeBinding?: CodexRuntimeBinding;
}): Promise<InvocationResult> {
  const launch = input.runtimeBinding ? { executable: input.runtimeBinding.command, argsPrefix: [] } : resolveCodexLaunch(input.env);
  const codexArgs = buildCodexCliArguments(input);
  let cliVersion = input.runtimeBinding?.cliVersion ?? "unavailable";
  if (!input.runtimeBinding) {
    const probe = await captureCliProcess({ command: launch.executable, args: [...launch.argsPrefix, "--version"], env: input.env, cwd: input.cwd, timeoutMs: 15_000, stdin: "" });
    cliVersion = probe.stdout.trim().match(/^codex-cli (\d+\.\d+\.\d+)$/u)?.[1] ?? "unavailable";
  }
  const executableFingerprint = input.runtimeBinding?.commandSha256 ?? sha256Text(stableJson({
    commandHash: await sha256File(launch.executable).catch(() => "unavailable"),
    prefixHashes: await Promise.all(launch.argsPrefix.map(p => sha256File(p).catch(() => "unavailable"))), cliVersion,
  }));
  if (input.runtimeBinding) await verifyCodexRuntimeBeforeInvocation(input.runtimeBinding);
  const processResult = await captureCliProcess({ command: launch.executable, args: [...launch.argsPrefix, ...codexArgs], env: input.env, cwd: input.cwd, timeoutMs: input.timeoutMs, stdin: input.prompt });
  if (processResult.exitCode !== 0 || processResult.failurePhase !== "exit") {
    const classifiedErrorCode = processResult.failurePhase === "timeout" ? "CODEX_REVIEW_CLI_TIMEOUT"
      : processResult.failurePhase === "spawn" ? "CODEX_REVIEW_CLI_LAUNCH_FAILED"
      : processResult.failurePhase === "stdin" ? "CODEX_REVIEW_CLI_STDIN_FAILED"
      : classifyCliFailure(`${processResult.stderr}\n${processResult.stdout}`);
    throw cliInvocationError({ process: processResult, classifiedErrorCode, cliVersion, executableFingerprint });
  }
  let output: unknown = null;
  try { output = JSON.parse(await readFile(input.outputPath, "utf8")); }
  catch { throw cliInvocationError({ process: processResult, classifiedErrorCode: "CODEX_REVIEW_STRUCTURED_OUTPUT_INVALID", cliVersion, executableFingerprint, phase: "structured_output" }); }
  return { exitCode: processResult.exitCode, output, usage: parseUsage(processResult.stdout), processDiagnostic: receiptProcessDiagnostic({
    ...processResult, schemaVersion: "codex-cli-process-diagnostic-v1", phase: "exit",
    durationMs: Date.parse(processResult.completedAt) - Date.parse(processResult.startedAt),
    codexCliVersion: cliVersion, resolvedExecutableFingerprint: executableFingerprint,
  }) };
}

function receiptProcessDiagnostic(value: CodexCliProcessDiagnostic): CodexCliProcessDiagnostic {
  // Explicit selection is intentional: an invocation result is not permission
  // to serialize its arbitrary fields or raw process output.
  return {
    schemaVersion: value.schemaVersion, phase: value.phase,
    processId: value.processId, exitCode: value.exitCode, signal: value.signal,
    startedAt: value.startedAt, completedAt: value.completedAt, durationMs: value.durationMs,
    terminationConfirmed: value.terminationConfirmed,
    stdoutByteLength: value.stdoutByteLength, stderrByteLength: value.stderrByteLength,
    stdoutSha256: value.stdoutSha256, stderrSha256: value.stderrSha256,
    stdoutWasTruncated: value.stdoutWasTruncated, stderrWasTruncated: value.stderrWasTruncated,
    codexCliVersion: value.codexCliVersion, resolvedExecutableFingerprint: value.resolvedExecutableFingerprint,
  };
}

export function buildCodexCliArguments(input: {
  imagePaths: readonly string[];
  schemaPath: string;
  outputPath: string;
  cwd: string;
  runtimeBinding?: CodexRuntimeBinding;
}): string[] {
  return [
    "exec", "-", "--ephemeral", "--json", "--skip-git-repo-check", "--sandbox", "read-only",
    "--output-schema", input.schemaPath, "--output-last-message", input.outputPath,
    "--cd", input.cwd,
    ...(input.runtimeBinding ? ["--ignore-user-config", "--model", input.runtimeBinding.model, "-c", `model_reasoning_effort="${input.runtimeBinding.reasoningEffort}"`] : []),
    ...input.imagePaths.flatMap((path) => ["--image", path]),
  ];
}

export function classifyCliFailure(stderr: string) {
  if (/model.{0,100}requires a newer version of Codex/iu.test(stderr)) return "CODEX_REVIEW_CLI_UPGRADE_REQUIRED";
  if (/rate.?limit|usage.?limit|quota|credit/iu.test(stderr)) return "CODEX_REVIEW_CLI_USAGE_LIMIT";
  if (/not logged in|authentication|unauthorized|forbidden/iu.test(stderr)) return "CODEX_REVIEW_CLI_AUTH_UNAVAILABLE";
  if (/schema/iu.test(stderr)) return "CODEX_REVIEW_CLI_SCHEMA_REJECTED";
  if (/image|file.*not found|no such file/iu.test(stderr)) return "CODEX_REVIEW_CLI_IMAGE_INPUT_INVALID";
  return "CODEX_REVIEW_CLI_EXIT_NONZERO";
}

export function resolveCodexLaunch(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
  nodeExecutable: string = process.execPath,
): { executable: string; argsPrefix: string[] } {
  const explicit = env.CODEX_REVIEW_CODEX_COMMAND?.trim();
  if (platform !== "win32") return { executable: explicit ? resolve(explicit) : "codex", argsPrefix: [] };
  const appData = env.APPDATA?.trim();
  if (!appData) throw new Error("CODEX_REVIEW_CURRENT_USER_APPDATA_NOT_FOUND");
  const configured = explicit ? resolve(explicit) : join(appData, "npm", "codex.ps1");
  if (/\.exe$/iu.test(configured)) return { executable: configured, argsPrefix: [] };
  const codexJs = /\.m?js$/iu.test(configured)
    ? configured
    : join(dirname(configured), "node_modules", "@openai", "codex", "bin", "codex.js");
  return { executable: nodeExecutable, argsPrefix: [codexJs] };
}

function parseUsage(stdout: string) {
  const usage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
  for (const line of stdout.split(/\r?\n/u)) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line) as Record<string, unknown>;
      const candidate = isRecord(value.usage) ? value.usage : isRecord(value.item) && isRecord(value.item.usage) ? value.item.usage : null;
      if (!candidate) continue;
      usage.inputTokens = Math.max(usage.inputTokens, number(candidate.input_tokens ?? candidate.inputTokens));
      usage.cachedInputTokens = Math.max(usage.cachedInputTokens, number(candidate.cached_input_tokens ?? candidate.cachedInputTokens));
      usage.outputTokens = Math.max(usage.outputTokens, number(candidate.output_tokens ?? candidate.outputTokens));
    } catch { /* JSONL lines outside the event contract are ignored. */ }
  }
  return usage;
}

async function readReceipts(root: string): Promise<ExecutorReceipt[]> {
  const names = await readdir(root).catch(() => [] as string[]);
  const receipts: ExecutorReceipt[] = [];
  for (const name of names.filter((entry) => entry.endsWith(".json")).sort()) {
    try {
      const value = JSON.parse(await readFile(join(root, name), "utf8")) as ExecutorReceipt;
      if (value.schemaVersion !== CODEX_REVIEW_RECEIPT_SCHEMA_VERSION) throw new Error("CODEX_REVIEW_RECEIPT_LEDGER_INVALID");
      receipts.push(value);
    } catch (error) {
      if (error instanceof Error && error.message === "CODEX_REVIEW_RECEIPT_LEDGER_INVALID") throw error;
      throw new Error("CODEX_REVIEW_RECEIPT_LEDGER_INVALID");
    }
  }
  return receipts;
}

function receiptBindingMatches(receipt: ExecutorReceipt, input: CodexReviewRequest, validated: Awaited<ReturnType<typeof validateRequest>>) {
  return receipt.operationNamespace === input.operationNamespace && receipt.slotId === input.slotId && receipt.queueId === input.queueId
    && receipt.productKey === input.productKey && receipt.productName === input.productName
    && receipt.provenance === input.provenance
    && stableJson(receipt.usageEvidenceProvenance) === stableJson(input.usageEvidenceProvenance)
    && receipt.productReference.sha256 === validated.productReference.sha256
    && stableJson(receipt.visualEvidence) === stableJson(validated.visualEvidence)
    && receipt.visualEvidenceBindingPath === validated.visualBinding.path
    && receipt.visualEvidenceBindingSha256 === validated.visualBinding.sha256
    && receipt.videoPath === validated.video.path && receipt.videoSha256 === validated.video.sha256 && receipt.videoSize === validated.video.size
    && receipt.machineQaSourceArtifact === validated.machineQa.path && receipt.machineQaSourceSha256 === validated.machineQa.sha256
    && samePath(receipt.finalReviewArtifact, input.finalReviewArtifact)
    && receipt.regenerationCount === (input.regenerationCount ?? 0)
    && (receipt.originOperationNamespace ?? "") === (input.originOperationNamespace ?? "")
    && (receipt.originQueueId ?? "") === (input.originQueueId ?? "")
    && (receipt.originVideoSha256 ?? "") === (input.originVideoSha256 ?? "");
}

function receiptFile(root: string, sha256: string, attempt: number) { return join(root, `${sha256}-attempt-${attempt}.json`); }
function failed(errorCode: string, retryable: boolean, attempts: number, receiptPath: string): CodexReviewExecution { return { status: "error", errorCode, retryable, attempts, deduplicated: false, receiptPath }; }
function safeError(error: unknown) { const value = error instanceof Error ? error.message : String(error); return /^[A-Z0-9_:-]+$/u.test(value) ? value : "CODEX_REVIEW_EXECUTOR_FAILED"; }
// No speculative stderr classifiers: only explicit transient categories may
// enter this policy. Unknown/auth/usage/schema/input/upgrade/timeout fail closed.
export function codexCliRetryDelayMs(code: string, attempt: number): number | null {
  if (!Number.isInteger(attempt) || attempt < 1 || attempt >= PER_VIDEO_ATTEMPT_CAP) return null;
  return ["CODEX_REVIEW_CLI_TEMPORARY_SERVICE", "CODEX_REVIEW_CLI_NETWORK"].includes(code) ? 2_000 : null;
}
function safeIdentity(value: string) { return value.replace(/[^A-Za-z0-9_:.@/-]/gu, "_").slice(0, 256); }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function number(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0; }
function samePath(left: string, right: string) { return process.platform === "win32" ? resolve(left).toLowerCase() === resolve(right).toLowerCase() : resolve(left) === resolve(right); }
function sha256Text(value: string) { return createHash("sha256").update(value).digest("hex"); }
function stableJson(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`; if (isRecord(value)) return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`; return JSON.stringify(value); }

async function inspectFile(path: string, missingCode: string): Promise<{ path: string; size: number; sha256: string }> {
  try {
    const canonical = await realpath(resolve(path));
    const metadata = await stat(canonical);
    if (!metadata.isFile() || metadata.size < 1) throw new Error(missingCode);
    return { path: canonical, size: metadata.size, sha256: await sha256File(canonical) };
  } catch (error) {
    if (error instanceof Error && /^[A-Z0-9_:-]+$/u.test(error.message)) throw error;
    throw new Error(missingCode);
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
