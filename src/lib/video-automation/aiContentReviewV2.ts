/**
 * Evidence aggregation only. This does not inspect media, authenticate a reviewer,
 * establish image rights, sign a receipt, or authorize a platform upload.
 */
export type ReviewInterval = [number, number];
export type ReviewVerdict = "pass" | "fail" | "unverified";
export type EvidenceCheck = { verdict: ReviewVerdict; evidenceIds: string[]; rationale: string; basis: string };
export type ReviewIdentity = { productId: string; videoSha256: string; audioSha256: string };

export type AiContentReviewInput = {
  schema: "ai-content-assessment/v2";
  identity: ReviewIdentity;
  expected: ReviewIdentity;
  reviewer: { kind: "ai" | "human"; id: string; model: string; version: string; runId: string; generatorRunId: string };
  evidenceIds: string[];
  durationSeconds: number;
  decodeComplete: boolean;
  visual: {
    method: "time_sampled_scene_review" | "native_video_review";
    analyzedIntervals: ReviewInterval[];
    unresolvedIntervals: ReviewInterval[];
    frameCount: number;
    maxSampleGapSeconds: number;
    sourceLineageReviewed: boolean;
  };
  audio: {
    method: "native_audio_review" | "targeted_audio_and_full_asr" | "asr_only";
    analyzedIntervals: ReviewInterval[];
    unresolvedIntervals: ReviewInterval[];
    asrFullPass: boolean;
  };
  checks: { product: EvidenceCheck; caption: EvidenceCheck; script: EvidenceCheck; spokenName: EvidenceCheck; crossVideo: EvidenceCheck };
  comparedVideoIds: string[];
  requiredPriorVideoIds: string[];
  findings: Array<{ label: "WRONG_PRODUCT" | "MISLEADING_GENERIC_USE" | "AUDIO_MISMATCH" | "SCRIPT_MISMATCH"; start: number; end: number; evidenceIds: string[]; rationale: string }>;
  rights: { status: "verified" | "unverified" | "denied"; evidenceIds: string[] };
};

export type AiContentReviewAssessment = {
  auditStatus: "complete" | "incomplete" | "invalid";
  contentVerdict: "pass" | "fail" | "indeterminate";
  reviewerKind: "ai" | "human" | "unknown";
  reviewerType: "composite" | "ai_visual" | "ai_audio" | "human" | "unknown";
  visualVerdict: "pass" | "fail" | "indeterminate";
  asrVerdict: "pass" | "indeterminate";
  acousticVerdict: "pass" | "fail" | "not_tested" | "indeterminate";
  rightsVerdict: "verified" | "unverified" | "denied" | "indeterminate";
  crossVideoVerdict: "pass" | "fail" | "indeterminate";
  unreviewedVisualRanges: ReviewInterval[];
  unreviewedAudioRanges: ReviewInterval[];
  publicationEligibility: false;
  humanReviewClaimed: boolean;
  visualCoverageRatio: number | null;
  audioCoverageRatio: number | null;
  visualCoverageClaim: string;
  reasons: string[];
  releaseBlockers: string[];
  platformUploadAllowed: false;
};

const HASH = /^[0-9a-f]{64}$/u;
const PRODUCT = /^coupang:product:\d+:item:\d+:vendor:\d+$/u;
const CHECK_NAMES = ["product", "caption", "script", "spokenName", "crossVideo"] as const;
const FINDINGS = new Set(["WRONG_PRODUCT", "MISLEADING_GENERIC_USE", "AUDIO_MISMATCH", "SCRIPT_MISMATCH"]);
const filled = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const unique = (values: string[]): boolean => new Set(values).size === values.length;

/** Union coverage is a sampling claim, not proof that every decoded frame was understood. */
export function reviewIntervalCoverage(intervals: ReviewInterval[], duration: number): number | null {
  if (!finite(duration) || duration <= 0 || !Array.isArray(intervals)) return null;
  const ranges: ReviewInterval[] = [];
  for (const interval of intervals) {
    if (!Array.isArray(interval) || interval.length !== 2) return null;
    const [start, end] = interval;
    if (!finite(start) || !finite(end) || start < 0 || end <= start || end > duration) return null;
    ranges.push([start, end]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let end = 0;
  for (const [start, nextEnd] of ranges) {
    total += Math.max(0, nextEnd - Math.max(start, end));
    end = Math.max(end, nextEnd);
  }
  return Math.min(1, total / duration);
}

export function evaluateAiContentReview(input: AiContentReviewInput): AiContentReviewAssessment {
  const result: AiContentReviewAssessment = {
    auditStatus: "invalid", contentVerdict: "indeterminate", reviewerKind: "unknown", humanReviewClaimed: false,
    reviewerType: "unknown", visualVerdict: "indeterminate", asrVerdict: "indeterminate",
    acousticVerdict: "indeterminate", rightsVerdict: "indeterminate", crossVideoVerdict: "indeterminate",
    unreviewedVisualRanges: [], unreviewedAudioRanges: [], publicationEligibility: false,
    visualCoverageRatio: null, audioCoverageRatio: null, visualCoverageClaim: "not assessed", reasons: [],
    releaseBlockers: [], platformUploadAllowed: false
  };
  const invalid = (code: string): AiContentReviewAssessment => {
    result.auditStatus = "invalid";
    result.contentVerdict = "indeterminate";
    result.reasons.push(code);
    result.releaseBlockers.push("REVIEW_INVALID");
    return result;
  };
  try {
    if (input.schema !== "ai-content-assessment/v2") return invalid("SCHEMA_INVALID");
    for (const identity of [input.identity, input.expected]) {
      if (!PRODUCT.test(identity.productId) || !HASH.test(identity.videoSha256) || !HASH.test(identity.audioSha256)) return invalid("IDENTITY_INVALID");
    }
    if (input.identity.productId !== input.expected.productId || input.identity.videoSha256 !== input.expected.videoSha256 || input.identity.audioSha256 !== input.expected.audioSha256) return invalid("CURRENT_FILE_OR_PRODUCT_CHANGED");
    const reviewer = input.reviewer;
    if (!["ai", "human"].includes(reviewer.kind) || ![reviewer.id, reviewer.version, reviewer.runId, reviewer.generatorRunId].every(filled) || (reviewer.kind === "ai" && !filled(reviewer.model))) return invalid("REVIEWER_INVALID");
    if (reviewer.runId === reviewer.generatorRunId) return invalid("GENERATOR_SELF_REVIEW");
    result.reviewerKind = reviewer.kind;
    result.reviewerType = reviewer.kind === "human" ? "human" : input.audio.method === "asr_only" ? "ai_visual" : input.visual.frameCount === 0 || input.visual.analyzedIntervals.length === 0 ? "ai_audio" : "composite";
    result.humanReviewClaimed = reviewer.kind === "human";
    if (!Array.isArray(input.evidenceIds) || !input.evidenceIds.length || !input.evidenceIds.every(filled) || !unique(input.evidenceIds)) return invalid("EVIDENCE_INDEX_INVALID");
    const refs = (ids: string[]): boolean => Array.isArray(ids) && ids.length > 0 && unique(ids) && ids.every((id) => input.evidenceIds.includes(id));
    const visual = input.visual;
    const audio = input.audio;
    result.visualCoverageRatio = reviewIntervalCoverage(visual.analyzedIntervals, input.durationSeconds);
    result.audioCoverageRatio = reviewIntervalCoverage(audio.analyzedIntervals, input.durationSeconds);
    if (result.visualCoverageRatio === null || result.audioCoverageRatio === null || reviewIntervalCoverage(visual.unresolvedIntervals, input.durationSeconds) === null || reviewIntervalCoverage(audio.unresolvedIntervals, input.durationSeconds) === null) return invalid("TIMELINE_INVALID");
    if (!["time_sampled_scene_review", "native_video_review"].includes(visual.method) || !["native_audio_review", "targeted_audio_and_full_asr", "asr_only"].includes(audio.method)) return invalid("MODALITY_INVALID");
    if (!Number.isSafeInteger(visual.frameCount) || visual.frameCount < 0 || !finite(visual.maxSampleGapSeconds) || visual.maxSampleGapSeconds < 0) return invalid("VISUAL_MEASUREMENTS_INVALID");
    result.unreviewedVisualRanges = visual.unresolvedIntervals.map(([start, end]) => [start, end]);
    result.unreviewedAudioRanges = audio.unresolvedIntervals.map(([start, end]) => [start, end]);
    result.asrVerdict = audio.asrFullPass ? "pass" : "indeterminate";
    result.visualCoverageClaim = visual.method === "time_sampled_scene_review" ? "time-sampled evidence; not every decoded frame" : "native video review; frame sampling determined by reviewer capability";
    for (const name of CHECK_NAMES) {
      const check = input.checks[name];
      if (!check || !["pass", "fail", "unverified"].includes(check.verdict) || !filled(check.basis) || !filled(check.rationale)) return invalid(`CHECK_INVALID_${name.toUpperCase()}`);
      if (check.verdict !== "unverified" && !refs(check.evidenceIds)) return invalid("CHECK_EVIDENCE_UNRESOLVED");
    }
    if (!Array.isArray(input.comparedVideoIds) || !Array.isArray(input.requiredPriorVideoIds) || !input.comparedVideoIds.every(filled) || !input.requiredPriorVideoIds.every(filled) || !unique(input.comparedVideoIds) || !unique(input.requiredPriorVideoIds)) return invalid("COMPARISON_INDEX_INVALID");
    if (!Array.isArray(input.findings)) return invalid("FINDINGS_INVALID");
    for (const finding of input.findings) {
      if (!FINDINGS.has(finding.label) || !filled(finding.rationale) || !refs(finding.evidenceIds) || reviewIntervalCoverage([[finding.start, finding.end]], input.durationSeconds) === null) return invalid("FINDING_EVIDENCE_INVALID");
    }
    const need = (condition: boolean, code: string): void => { if (condition) result.reasons.push(code); };
    need(input.decodeComplete !== true, "DECODE_NOT_COMPLETE");
    need(result.visualCoverageRatio < 1, "VISUAL_INTERVALS_INCOMPLETE");
    need(result.audioCoverageRatio < 1, "AUDIO_INTERVALS_INCOMPLETE");
    need(visual.unresolvedIntervals.length > 0, "VISUAL_INTERVALS_UNRESOLVED");
    need(audio.unresolvedIntervals.length > 0, "AUDIO_INTERVALS_UNRESOLVED");
    need(visual.sourceLineageReviewed !== true, "SOURCE_LINEAGE_UNREVIEWED");
    need(visual.method === "time_sampled_scene_review" && (visual.frameCount < 2 || visual.maxSampleGapSeconds > 2), "SPARSE_VISUAL_EVIDENCE");
    need(audio.asrFullPass !== true, "FULL_AUDIO_PROCESSING_MISSING");
    need(audio.method === "asr_only", "PRONUNCIATION_NOT_ACOUSTICALLY_REVIEWED");
    need(input.checks.spokenName.verdict === "pass" && input.checks.spokenName.basis !== "audio_evidence", "SPOKEN_NAME_BASIS_INSUFFICIENT");
    need(input.requiredPriorVideoIds.some((id) => !input.comparedVideoIds.includes(id)), "PRIOR_LEDGER_REVIEW_STALE");
    for (const name of CHECK_NAMES) need(input.checks[name].verdict === "unverified", `CHECK_UNVERIFIED_${name.toUpperCase()}`);
    const anyFail = input.findings.length > 0 || CHECK_NAMES.some((name) => input.checks[name].verdict === "fail");
    const priorCoverageComplete = input.requiredPriorVideoIds.every((id) => input.comparedVideoIds.includes(id));
    result.visualVerdict = input.checks.product.verdict === "fail" || input.findings.some((finding) => finding.label === "WRONG_PRODUCT" || finding.label === "MISLEADING_GENERIC_USE")
      ? "fail" : result.visualCoverageRatio === 1 && visual.unresolvedIntervals.length === 0 && visual.sourceLineageReviewed && input.checks.product.verdict === "pass" && (visual.method !== "time_sampled_scene_review" || (visual.frameCount >= 2 && visual.maxSampleGapSeconds <= 2)) ? "pass" : "indeterminate";
    result.acousticVerdict = audio.method === "asr_only" ? "not_tested" : input.checks.spokenName.verdict === "fail" ? "fail" : result.audioCoverageRatio === 1 && audio.unresolvedIntervals.length === 0 && input.checks.spokenName.verdict === "pass" && input.checks.spokenName.basis === "audio_evidence" ? "pass" : "indeterminate";
    result.crossVideoVerdict = input.checks.crossVideo.verdict === "fail" ? "fail" : priorCoverageComplete && input.checks.crossVideo.verdict === "pass" ? "pass" : "indeterminate";
    result.auditStatus = result.reasons.length ? "incomplete" : "complete";
    result.contentVerdict = anyFail ? "fail" : result.auditStatus === "complete" ? "pass" : "indeterminate";
    if (result.contentVerdict !== "pass") result.releaseBlockers.push(`CONTENT_${result.contentVerdict.toUpperCase()}`);
    if (result.auditStatus !== "complete") result.releaseBlockers.push("REVIEW_INCOMPLETE");
    if (!["verified", "unverified", "denied"].includes(input.rights.status)) return invalid("RIGHTS_STATUS_INVALID");
    result.rightsVerdict = input.rights.status;
    if (input.rights.status !== "verified") result.releaseBlockers.push(`RIGHTS_${input.rights.status.toUpperCase()}`);
    else if (!refs(input.rights.evidenceIds)) result.releaseBlockers.push("RIGHTS_EVIDENCE_MISSING");
    return result;
  } catch {
    return invalid("MALFORMED_INPUT");
  }
}
