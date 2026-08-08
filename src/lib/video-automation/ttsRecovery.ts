import { createHash } from "node:crypto";
import { join } from "node:path";
import { bestKoreanSubstringSimilarity } from "./localRuntime";
import { normalizeSpokenNarration, segmentSpokenNarration } from "./ttsNormalization";

export type SafeTtsResult = {
  status: "success" | "failed";
  safeCode: string;
  stage: string;
  attempt: number;
  inputHash: string;
  inputCharacters: number;
  segmentIndex: number | null;
  outputCreated: boolean;
  retryable: boolean;
  output?: string;
  duration_seconds?: number;
  validation?: Record<string, unknown>;
};

export type TtsAttemptRecord = SafeTtsResult & { mode: "original" | "normalized" | "segmented" };

export type TtsRecoveryDiagnostic = {
  status: "success" | "failed";
  rootCauseCode: string;
  finalCode: string;
  recoveryType: "none" | "fresh_process_retry" | "spoken_narration_normalization" | "segmented_synthesis" | "failed";
  originalNarrationHash: string;
  spokenNarrationHash: string;
  originalCharacters: number;
  spokenCharacters: number;
  spokenNarration: string;
  segments: string[];
  identity: ReturnType<typeof inspectNarrationIdentity>;
  attempts: TtsAttemptRecord[];
  outputPath: string;
  validation: Record<string, unknown> | null;
};

export class TtsRecoveryError extends Error {
  constructor(message: string, readonly diagnostic: TtsRecoveryDiagnostic) { super(message); }
}

type TtsRecoveryDependencies = {
  synthesize(input: { text: string; target: string; attempt: number; segmentIndex: number | null }): Promise<SafeTtsResult>;
  concatenate(input: { sourcePaths: string[]; target: string; pauseMs: number }): Promise<{ status: string; output?: string; validation?: Record<string, unknown> }>;
};

export async function recoverKoreanTts(input: {
  narration: string;
  canonicalProductName: string;
  anchors: string[];
  voiceRoot: string;
  dependencies: TtsRecoveryDependencies;
}): Promise<TtsRecoveryDiagnostic> {
  const attempts: TtsAttemptRecord[] = [];
  const original = await synthesizeMode("original", input.narration, join(input.voiceRoot, "tts-original.wav"), null, input.dependencies, attempts);
  if (original.status === "success") return success(attempts.length > 1 ? "fresh_process_retry" : "none", input.narration, [], original, input, attempts);
  const rootCauseCode = original.safeCode;
  if (!isProductSpecificVoiceFailureCandidate(rootCauseCode)) throw failure(rootCauseCode, rootCauseCode, input.narration, [], input, attempts);

  const spokenNarration = normalizeSpokenNarration(input.narration);
  const identity = inspectNarrationIdentity(input.canonicalProductName, input.anchors, spokenNarration);
  if (!identity.passed) throw failure(rootCauseCode, "TTS_NORMALIZATION_IDENTITY_GUARD_FAILED", spokenNarration, [], input, attempts);
  const normalized = await synthesizeMode("normalized", spokenNarration, join(input.voiceRoot, "tts-normalized.wav"), null, input.dependencies, attempts);
  if (normalized.status === "success") return success("spoken_narration_normalization", spokenNarration, [], normalized, input, attempts);

  const segments = segmentSpokenNarration(spokenNarration);
  if (segments.length < 2) throw failure(rootCauseCode, "PRODUCT_SPECIFIC_VOICE_HARD_FAILURE", spokenNarration, segments, input, attempts);
  const segmentPaths: string[] = [];
  for (const [index, segment] of segments.entries()) {
    const target = join(input.voiceRoot, `tts-segment-${String(index + 1).padStart(3, "0")}.wav`);
    const result = await synthesizeMode("segmented", segment, target, index, input.dependencies, attempts);
    if (result.status !== "success" || !result.output) throw failure(rootCauseCode, "PRODUCT_SPECIFIC_VOICE_HARD_FAILURE", spokenNarration, segments, input, attempts);
    segmentPaths.push(result.output);
  }
  const concatenated = await input.dependencies.concatenate({ sourcePaths: segmentPaths, target: join(input.voiceRoot, "tts-segmented.wav"), pauseMs: 500 });
  if (concatenated.status !== "success" || !concatenated.output || !concatenated.validation) {
    throw failure(rootCauseCode, "PRODUCT_SPECIFIC_VOICE_HARD_FAILURE", spokenNarration, segments, input, attempts);
  }
  return {
    ...success("segmented_synthesis", spokenNarration, segments, { ...attempts[attempts.length - 1], status: "success", output: concatenated.output, validation: concatenated.validation }, input, attempts),
    outputPath: concatenated.output,
    validation: concatenated.validation,
  };
}

async function synthesizeMode(
  mode: TtsAttemptRecord["mode"], text: string, target: string, segmentIndex: number | null,
  dependencies: TtsRecoveryDependencies, attempts: TtsAttemptRecord[],
): Promise<SafeTtsResult> {
  let result = await dependencies.synthesize({ text, target, attempt: 1, segmentIndex });
  attempts.push({ ...result, mode });
  if (result.status === "failed" && result.retryable) {
    result = await dependencies.synthesize({ text, target: target.replace(/\.wav$/u, "-retry.wav"), attempt: 2, segmentIndex });
    attempts.push({ ...result, mode });
  }
  return result;
}

function success(
  recoveryType: TtsRecoveryDiagnostic["recoveryType"], spokenNarration: string, segments: string[], final: SafeTtsResult,
  input: { narration: string; canonicalProductName: string; anchors: string[] }, attempts: TtsAttemptRecord[],
): TtsRecoveryDiagnostic {
  const rootFailure = attempts.find((attempt) => attempt.status === "failed");
  return {
    status: "success", rootCauseCode: rootFailure?.safeCode ?? "TTS_SUCCESS", finalCode: "TTS_SUCCESS", recoveryType,
    originalNarrationHash: hash(input.narration), spokenNarrationHash: hash(spokenNarration),
    originalCharacters: [...input.narration].length, spokenCharacters: [...spokenNarration].length,
    spokenNarration, segments, identity: inspectNarrationIdentity(input.canonicalProductName, input.anchors, spokenNarration),
    attempts, outputPath: final.output ?? "", validation: final.validation ?? null,
  };
}

function failure(
  rootCauseCode: string, finalCode: string, spokenNarration: string, segments: string[],
  input: { narration: string; canonicalProductName: string; anchors: string[] }, attempts: TtsAttemptRecord[],
): TtsRecoveryError {
  return new TtsRecoveryError(finalCode, {
    status: "failed", rootCauseCode, finalCode, recoveryType: "failed",
    originalNarrationHash: hash(input.narration), spokenNarrationHash: hash(spokenNarration),
    originalCharacters: [...input.narration].length, spokenCharacters: [...spokenNarration].length,
    spokenNarration, segments, identity: inspectNarrationIdentity(input.canonicalProductName, input.anchors, spokenNarration),
    attempts, outputPath: "", validation: null,
  });
}

export function inspectNarrationIdentity(canonicalProductName: string, anchors: string[], spokenNarration: string) {
  const compact = (value: string) => value.toLowerCase().replace(/[^가-힣a-z0-9]/gu, "");
  const source = compact(spokenNarration);
  const recognizedAnchors = anchors.filter((anchor) => source.includes(compact(anchor)));
  const identitySimilarity = bestKoreanSubstringSimilarity(canonicalProductName, spokenNarration);
  const coreAnchorPreserved = Boolean(anchors[0]) && recognizedAnchors.includes(anchors[0]);
  return { passed: identitySimilarity >= 0.65 && coreAnchorPreserved && recognizedAnchors.length >= 2, identitySimilarity, coreAnchorPreserved, recognizedAnchors, contextAnchorMinimum: 2 };
}

export function isProductSpecificVoiceFailureCandidate(code: string): boolean {
  return new Set(["TTS_INPUT_UNSUPPORTED", "TTS_FRONTEND_NORMALIZATION_FAILED", "TTS_PHONEMIZER_FAILED", "TTS_SEGMENT_TOO_LONG", "TTS_MODEL_INFERENCE_FAILED"]).has(code);
}

export function isEnvironmentVoiceFailure(code: string): boolean {
  return /NOT_READY|NOT_CONFIGURED|COMMAND_INVALID|FILESYSTEM|DISK|INVARIANT|PYTHON|FFMPEG|ASR_MODEL/u.test(code);
}

function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
