import path from "node:path";

export type RenderRealityCheckBlocker =
  | "FOREGROUND_PRODUCT_STATIC_TOO_LONG"
  | "BACKGROUND_ONLY_CHANGED"
  | "TRUE_SCENE_CHANGE_FALSE_POSITIVE"
  | "VISUAL_MOTION_SCORE_UNTRUSTED"
  | "ACTUAL_FRAME_HASH_DELTA_TOO_LOW"
  | "ACTUAL_CONTACT_SHEET_TOO_SIMILAR"
  | "CAPTION_OUT_OF_ACTUAL_FRAME"
  | "CAPTION_OVERLAPS_SHORTS_UI"
  | "CAPTION_CLIPPED_IN_RENDERED_FRAME"
  | "CAPTION_TOO_LONG_FOR_TWO_LINES"
  | "HOOK_TITLE_LOW_VISIBILITY_ACTUAL"
  | "VOICEOVER_SEGMENT_GAPS_TOO_LONG"
  | "VOICEOVER_HARD_CUTS_DETECTED"
  | "VOICEOVER_UNINTELLIGIBLE"
  | "VOICEOVER_LOUDNESS_UNNORMALIZED"
  | "VOICEOVER_TOO_ROBOTIC";

export type ActualFrameProbeInput = {
  actual_frame_sample_count?: unknown;
  actual_frame_hash_unique_ratio?: unknown;
  foreground_product_position_change_count?: unknown;
  foreground_product_scale_change_count?: unknown;
  layout_structure_change_count?: unknown;
  background_only_change_ratio?: unknown;
  same_composition_ratio?: unknown;
};

export type CaptionBboxProbeInput = {
  actual_caption_safe_area_pass?: unknown;
  actual_no_text_clipped?: unknown;
  actual_no_caption_overlaps_right_ui?: unknown;
  max_caption_lines?: unknown;
  hook_title_visible_actual?: unknown;
  hook_title_contrast_actual_pass?: unknown;
};

export type AudioContinuityProbeInput = {
  audio_stream_present?: unknown;
  max_silence_between_segments_ms?: unknown;
  hard_cut_count?: unknown;
  audio_loudness_normalized?: unknown;
  audio_peak_not_clipped?: unknown;
  speech_continuity_score?: unknown;
  voiceover_naturalness_score?: unknown;
};

export type RenderRealityCheckInput = {
  candidate_id?: unknown;
  version?: unknown;
  rendered_frame_contact_sheet_generated?: unknown;
  actual_frame_probe?: unknown;
  caption_bbox_probe?: unknown;
  audio_continuity_probe?: unknown;
};

export type RenderRealityCheckResult = {
  passed: boolean;
  blocked_reasons: RenderRealityCheckBlocker[];
  rendered_frame_contact_sheet_generated: boolean;
  actual_frame_sample_count: number;
  actual_frame_hash_unique_ratio: number | null;
  foreground_product_position_change_count: number;
  foreground_product_scale_change_count: number;
  layout_structure_change_count: number;
  background_only_change_ratio: number | null;
  same_composition_ratio: number | null;
  actual_true_scene_change_pass: boolean;
  actual_caption_safe_area_pass: boolean;
  actual_no_text_clipped: boolean;
  actual_no_caption_overlaps_right_ui: boolean;
  max_caption_lines: number | null;
  hook_title_visible_actual: boolean;
  hook_title_contrast_actual_pass: boolean;
  audio_stream_present: boolean;
  max_silence_between_segments_ms: number | null;
  hard_cut_count: number;
  audio_loudness_normalized: boolean;
  audio_peak_not_clipped: boolean;
  speech_continuity_score: number | null;
  voiceover_naturalness_score: number | null;
  audio_continuity_pass: boolean;
};

export type RenderRealityReviewArtifactPaths = {
  reviewRoot: string;
  actualFrameContactSheetPath: string;
  actualFrameProbePath: string;
  captionBboxProbePath: string;
  audioContinuityProbePath: string;
  humanReviewSummaryPath: string;
};

const MIN_ACTUAL_FRAME_SAMPLE_COUNT = 10;
const MIN_ACTUAL_FRAME_HASH_UNIQUE_RATIO = 0.65;
const MIN_FOREGROUND_POSITION_CHANGE_COUNT = 5;
const MIN_FOREGROUND_SCALE_CHANGE_COUNT = 5;
const MIN_LAYOUT_STRUCTURE_CHANGE_COUNT = 6;
const MAX_BACKGROUND_ONLY_CHANGE_RATIO = 0.3;
const MAX_SAME_COMPOSITION_RATIO = 0.35;
const MAX_CAPTION_LINES = 2;
const MAX_SILENCE_BETWEEN_SEGMENTS_MS = 250;
const MAX_HARD_CUT_COUNT = 1;
const MIN_SPEECH_CONTINUITY_SCORE = 80;
const MIN_VOICEOVER_NATURALNESS_SCORE = 82;

export function evaluateRenderRealityCheck(input: RenderRealityCheckInput): RenderRealityCheckResult {
  const frameProbe = isRecord(input.actual_frame_probe) ? input.actual_frame_probe : {};
  const captionProbe = isRecord(input.caption_bbox_probe) ? input.caption_bbox_probe : {};
  const audioProbe = isRecord(input.audio_continuity_probe) ? input.audio_continuity_probe : {};
  const renderedFrameContactSheetGenerated = input.rendered_frame_contact_sheet_generated === true;
  const actualFrameSampleCount = normalizeNonNegativeNumber(frameProbe.actual_frame_sample_count) ?? 0;
  const actualFrameHashUniqueRatio = normalizeRatio(frameProbe.actual_frame_hash_unique_ratio);
  const foregroundProductPositionChangeCount =
    normalizeNonNegativeNumber(frameProbe.foreground_product_position_change_count) ?? 0;
  const foregroundProductScaleChangeCount =
    normalizeNonNegativeNumber(frameProbe.foreground_product_scale_change_count) ?? 0;
  const layoutStructureChangeCount = normalizeNonNegativeNumber(frameProbe.layout_structure_change_count) ?? 0;
  const backgroundOnlyChangeRatio = normalizeRatio(frameProbe.background_only_change_ratio);
  const sameCompositionRatio = normalizeRatio(frameProbe.same_composition_ratio);
  const actualCaptionSafeAreaPass = captionProbe.actual_caption_safe_area_pass === true;
  const actualNoTextClipped = captionProbe.actual_no_text_clipped === true;
  const actualNoCaptionOverlapsRightUi = captionProbe.actual_no_caption_overlaps_right_ui === true;
  const maxCaptionLines = normalizePositiveNumber(captionProbe.max_caption_lines);
  const hookTitleVisibleActual = captionProbe.hook_title_visible_actual === true;
  const hookTitleContrastActualPass = captionProbe.hook_title_contrast_actual_pass === true;
  const audioStreamPresent = audioProbe.audio_stream_present === true;
  const maxSilenceBetweenSegmentsMs =
    normalizeNonNegativeNumber(audioProbe.max_silence_between_segments_ms);
  const hardCutCount = normalizeNonNegativeNumber(audioProbe.hard_cut_count) ?? 0;
  const audioLoudnessNormalized = audioProbe.audio_loudness_normalized === true;
  const audioPeakNotClipped = audioProbe.audio_peak_not_clipped === true;
  const speechContinuityScore = normalizeNonNegativeNumber(audioProbe.speech_continuity_score);
  const voiceoverNaturalnessScore = normalizeNonNegativeNumber(audioProbe.voiceover_naturalness_score);
  const blockedReasons: RenderRealityCheckBlocker[] = [];

  if (!renderedFrameContactSheetGenerated) {
    blockedReasons.push("ACTUAL_CONTACT_SHEET_TOO_SIMILAR");
  }
  if (actualFrameSampleCount < MIN_ACTUAL_FRAME_SAMPLE_COUNT ||
    actualFrameHashUniqueRatio === null ||
    actualFrameHashUniqueRatio < MIN_ACTUAL_FRAME_HASH_UNIQUE_RATIO) {
    blockedReasons.push("ACTUAL_FRAME_HASH_DELTA_TOO_LOW");
  }
  if (foregroundProductPositionChangeCount < MIN_FOREGROUND_POSITION_CHANGE_COUNT ||
    foregroundProductScaleChangeCount < MIN_FOREGROUND_SCALE_CHANGE_COUNT) {
    blockedReasons.push("FOREGROUND_PRODUCT_STATIC_TOO_LONG");
  }
  if (layoutStructureChangeCount < MIN_LAYOUT_STRUCTURE_CHANGE_COUNT) {
    blockedReasons.push("VISUAL_MOTION_SCORE_UNTRUSTED");
  }
  if (backgroundOnlyChangeRatio === null ||
    backgroundOnlyChangeRatio > MAX_BACKGROUND_ONLY_CHANGE_RATIO) {
    blockedReasons.push("BACKGROUND_ONLY_CHANGED");
  }
  if (sameCompositionRatio === null || sameCompositionRatio > MAX_SAME_COMPOSITION_RATIO) {
    blockedReasons.push("ACTUAL_CONTACT_SHEET_TOO_SIMILAR");
  }

  const actualTrueSceneChangePass =
    actualFrameSampleCount >= MIN_ACTUAL_FRAME_SAMPLE_COUNT &&
    actualFrameHashUniqueRatio !== null &&
    actualFrameHashUniqueRatio >= MIN_ACTUAL_FRAME_HASH_UNIQUE_RATIO &&
    foregroundProductPositionChangeCount >= MIN_FOREGROUND_POSITION_CHANGE_COUNT &&
    foregroundProductScaleChangeCount >= MIN_FOREGROUND_SCALE_CHANGE_COUNT &&
    layoutStructureChangeCount >= MIN_LAYOUT_STRUCTURE_CHANGE_COUNT &&
    backgroundOnlyChangeRatio !== null &&
    backgroundOnlyChangeRatio <= MAX_BACKGROUND_ONLY_CHANGE_RATIO &&
    sameCompositionRatio !== null &&
    sameCompositionRatio <= MAX_SAME_COMPOSITION_RATIO &&
    renderedFrameContactSheetGenerated;

  if (!actualTrueSceneChangePass) {
    blockedReasons.push("TRUE_SCENE_CHANGE_FALSE_POSITIVE");
  }
  if (!actualCaptionSafeAreaPass) {
    blockedReasons.push("CAPTION_OUT_OF_ACTUAL_FRAME");
  }
  if (!actualNoCaptionOverlapsRightUi) {
    blockedReasons.push("CAPTION_OVERLAPS_SHORTS_UI");
  }
  if (!actualNoTextClipped) {
    blockedReasons.push("CAPTION_CLIPPED_IN_RENDERED_FRAME");
  }
  if (maxCaptionLines === null || maxCaptionLines > MAX_CAPTION_LINES) {
    blockedReasons.push("CAPTION_TOO_LONG_FOR_TWO_LINES");
  }
  if (!hookTitleVisibleActual || !hookTitleContrastActualPass) {
    blockedReasons.push("HOOK_TITLE_LOW_VISIBILITY_ACTUAL");
  }
  if (!audioStreamPresent || maxSilenceBetweenSegmentsMs === null ||
    maxSilenceBetweenSegmentsMs > MAX_SILENCE_BETWEEN_SEGMENTS_MS) {
    blockedReasons.push("VOICEOVER_SEGMENT_GAPS_TOO_LONG");
  }
  if (hardCutCount > MAX_HARD_CUT_COUNT) {
    blockedReasons.push("VOICEOVER_HARD_CUTS_DETECTED");
  }
  if (speechContinuityScore === null || speechContinuityScore < MIN_SPEECH_CONTINUITY_SCORE) {
    blockedReasons.push("VOICEOVER_UNINTELLIGIBLE");
  }
  if (!audioLoudnessNormalized || !audioPeakNotClipped) {
    blockedReasons.push("VOICEOVER_LOUDNESS_UNNORMALIZED");
  }
  if (voiceoverNaturalnessScore === null || voiceoverNaturalnessScore < MIN_VOICEOVER_NATURALNESS_SCORE) {
    blockedReasons.push("VOICEOVER_TOO_ROBOTIC");
  }

  const uniqueBlockedReasons = [...new Set(blockedReasons)];
  const audioContinuityPass =
    audioStreamPresent &&
    maxSilenceBetweenSegmentsMs !== null &&
    maxSilenceBetweenSegmentsMs <= MAX_SILENCE_BETWEEN_SEGMENTS_MS &&
    hardCutCount <= MAX_HARD_CUT_COUNT &&
    audioLoudnessNormalized &&
    audioPeakNotClipped &&
    speechContinuityScore !== null &&
    speechContinuityScore >= MIN_SPEECH_CONTINUITY_SCORE &&
    voiceoverNaturalnessScore !== null &&
    voiceoverNaturalnessScore >= MIN_VOICEOVER_NATURALNESS_SCORE;

  return {
    passed: uniqueBlockedReasons.length === 0,
    blocked_reasons: uniqueBlockedReasons,
    rendered_frame_contact_sheet_generated: renderedFrameContactSheetGenerated,
    actual_frame_sample_count: actualFrameSampleCount,
    actual_frame_hash_unique_ratio: actualFrameHashUniqueRatio,
    foreground_product_position_change_count: foregroundProductPositionChangeCount,
    foreground_product_scale_change_count: foregroundProductScaleChangeCount,
    layout_structure_change_count: layoutStructureChangeCount,
    background_only_change_ratio: backgroundOnlyChangeRatio,
    same_composition_ratio: sameCompositionRatio,
    actual_true_scene_change_pass: actualTrueSceneChangePass,
    actual_caption_safe_area_pass: actualCaptionSafeAreaPass,
    actual_no_text_clipped: actualNoTextClipped,
    actual_no_caption_overlaps_right_ui: actualNoCaptionOverlapsRightUi,
    max_caption_lines: maxCaptionLines,
    hook_title_visible_actual: hookTitleVisibleActual,
    hook_title_contrast_actual_pass: hookTitleContrastActualPass,
    audio_stream_present: audioStreamPresent,
    max_silence_between_segments_ms: maxSilenceBetweenSegmentsMs,
    hard_cut_count: hardCutCount,
    audio_loudness_normalized: audioLoudnessNormalized,
    audio_peak_not_clipped: audioPeakNotClipped,
    speech_continuity_score: speechContinuityScore,
    voiceover_naturalness_score: voiceoverNaturalnessScore,
    audio_continuity_pass: audioContinuityPass
  };
}

export function buildRenderRealityReviewArtifactPaths(input: {
  cwd: string;
  candidateId: string;
  version: string;
}): RenderRealityReviewArtifactPaths {
  const safeCandidateId = toSafeSlug(input.candidateId);
  const safeVersion = toSafeSlug(input.version);
  const reviewRoot = path.join(input.cwd, "commerce-assets", "review", safeCandidateId, safeVersion);
  return {
    reviewRoot,
    actualFrameContactSheetPath: path.join(reviewRoot, "actual-frame-contact-sheet.jpg"),
    actualFrameProbePath: path.join(reviewRoot, "actual-frame-probe.json"),
    captionBboxProbePath: path.join(reviewRoot, "caption-bbox-probe.json"),
    audioContinuityProbePath: path.join(reviewRoot, "audio-continuity-probe.json"),
    humanReviewSummaryPath: path.join(reviewRoot, "human-review-summary.json")
  };
}

function normalizePositiveNumber(value: unknown) {
  const normalized = normalizeNonNegativeNumber(value);
  return normalized !== null && normalized > 0 ? normalized : null;
}

function normalizeNonNegativeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
}

function normalizeRatio(value: unknown) {
  const normalized = normalizeNonNegativeNumber(value);
  if (normalized === null || normalized > 1) {
    return null;
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toSafeSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "unknown";
}
