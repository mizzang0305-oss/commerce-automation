import { AUTONOMOUS_VIDEO_QA_CONFIG } from "./config";
import type { AutomatedReviewInput, AutomatedVideoQualityDimensions, AutomatedVideoReview, CodexVisualReview } from "./types";

const EMPTY_VISUAL_REVIEW: CodexVisualReview = Object.freeze({
  visualReviewExecuted: false,
  passed: false,
  reviewer: "codex_local_visual_inspection",
  inspectedPaths: [],
  firstFrameNote: "not_inspected",
  firstThreeSecondsNote: "not_inspected",
  contactSheetNote: "not_inspected"
});

export function evaluateAutomatedVideoQuality(input: AutomatedReviewInput): AutomatedVideoReview {
  const blockers: string[] = [];
  const signals: string[] = [];
  const m = input.measurements;
  if (m.fileSize <= 0) blockers.push("EMPTY_OUTPUT");
  if (!m.videoStream || !m.audioStream || m.videoCodec !== "h264" || m.audioCodec !== "aac" || m.width !== 1080 || m.height !== 1920) blockers.push("INVALID_MEDIA_STREAMS");
  if (!input.asrPassed || input.alignedRatio < 0.95) blockers.push("ASR_QA_FAILED");
  if (input.layoutCollision) blockers.push("LAYOUT_COLLISION");
  if (!input.captionTimelinePassed || input.captionMaxWords > 4) blockers.push("CAPTION_SAFE_TIMELINE_FAILED");
  if (m.freezeRatio > AUTONOMOUS_VIDEO_QA_CONFIG.freezeRatioBlocker) blockers.push("SLIDESHOW_FREEZE_RATIO_HIGH");
  if (m.longestFreezeSeconds > AUTONOMOUS_VIDEO_QA_CONFIG.longestFreezeSecondsBlocker) blockers.push("VISUAL_BEAT_TOO_LONG");
  if (!input.productIdentityBound) blockers.push("PRODUCT_IDENTITY_MISMATCH");
  if (input.genericUsage && input.genericOverclaim) blockers.push("GENERIC_USAGE_OVERCLAIM");
  if (!m.firstFramePath || input.hookVisibleAtSeconds > 2 || input.hookFontPx < 100 || input.selectedHook.includes("...")) blockers.push("FIRST_FRAME_HOOK_UNREADABLE");

  if (input.primaryVisualWidthRatio < AUTONOMOUS_VIDEO_QA_CONFIG.minimumPrimaryVisualWidthRatio) signals.push("PRIMARY_VISUAL_TOO_SMALL");
  if (m.canvasFillRatio < AUTONOMOUS_VIDEO_QA_CONFIG.targetCanvasFillRatio || m.emptyCanvasRatio > 0.22) signals.push("EMPTY_CANVAS_EXCESSIVE");
  if (!input.hookFamilyUniqueInBatch) signals.push("HOOK_TEMPLATE_REPETITION");
  if (input.captionFontPx < 58) signals.push("CAPTION_TOO_SMALL");
  if (input.captionAnimation === "none") signals.push("CAPTION_MOTION_WEAK");
  if (m.visualChangeRatio < 0.2) signals.push("VISUAL_REPETITION_HIGH");
  if (m.longestSilenceMs > AUTONOMOUS_VIDEO_QA_CONFIG.longPauseReviewMs) signals.push("LONG_TTS_SILENCE");
  if (input.productAnchorCount < 2) signals.push("PRODUCT_CLARITY_WEAK");

  const dimensions: AutomatedVideoQualityDimensions = {
    first3: clamp(100 - (input.hookVisibleAtSeconds * 12) - (input.hookFontPx < 104 ? 25 : 0) - (input.hookHighContrast ? 0 : 30)),
    motion: clamp(100 - (m.freezeRatio * 120) - (m.longestFreezeSeconds * 12)),
    occupancy: clamp((input.primaryVisualWidthRatio / 0.9) * 55 + (m.canvasFillRatio / 0.9) * 45 - (m.emptyCanvasRatio * 35)),
    caption: clamp(45 + Math.min(input.captionFontPx, 72) / 72 * 35 + (input.captionAnimation === "none" ? 0 : 20) - (input.captionMaxWords > 4 ? 40 : 0)),
    creativeDiversity: input.hookFamilyUniqueInBatch ? 100 : 45,
    productClarity: clamp(55 + Math.min(input.productAnchorCount, 3) * 12 + (input.productIdentityBound ? 9 : 0) - (input.genericOverclaim ? 50 : 0)),
    audioPacing: clamp(100 - (m.longSilenceCount * 3) - Math.max(0, m.longestSilenceMs - 700) / 25 - Math.max(0, m.meanPauseMs - 500) / 30),
    layoutSafety: input.layoutCollision ? 0 : 100,
    policyClarity: input.genericUsage && input.usageLabelFullOnce && input.usageLabelAbbreviatedAfterIntro && !input.genericOverclaim ? 100 : 55
  };
  const score = weightedScore(dimensions);
  const visualReview = input.codexVisualReview ?? EMPTY_VISUAL_REVIEW;
  if (!visualReview.visualReviewExecuted) blockers.push("CODEX_VISUAL_REVIEW_REQUIRED");
  else if (!visualReview.passed) blockers.push("CODEX_VISUAL_REVIEW_FAILED");
  const uniqueBlockers = [...new Set(blockers)];
  const machineBlockers = uniqueBlockers.filter((blocker) => !blocker.startsWith("CODEX_VISUAL_REVIEW_"));
  const technicalQaPassed = !machineBlockers.some((blocker) => ["EMPTY_OUTPUT", "INVALID_MEDIA_STREAMS", "ASR_QA_FAILED"].includes(blocker));
  const motionQaPassed = !machineBlockers.some((blocker) => ["SLIDESHOW_FREEZE_RATIO_HIGH", "VISUAL_BEAT_TOO_LONG"].includes(blocker));
  const captionQaPassed = !machineBlockers.includes("CAPTION_SAFE_TIMELINE_FAILED") && dimensions.caption >= 70;
  const productEvidenceQaPassed = !machineBlockers.some((blocker) => ["PRODUCT_IDENTITY_MISMATCH", "GENERIC_USAGE_OVERCLAIM"].includes(blocker));
  const audioQaPassed = dimensions.audioPacing >= 70 && m.longestSilenceMs <= AUTONOMOUS_VIDEO_QA_CONFIG.longPauseStrongPenaltyMs;
  const creativeQaPassed = dimensions.creativeDiversity >= 70 && dimensions.productClarity >= 70;
  const automatedVisualQaPassed = visualReview.visualReviewExecuted && visualReview.passed && dimensions.first3 >= AUTONOMOUS_VIDEO_QA_CONFIG.first3Threshold && dimensions.occupancy >= 70;
  const machineVisualQaPassed = dimensions.first3 >= AUTONOMOUS_VIDEO_QA_CONFIG.first3Threshold && dimensions.occupancy >= 70;
  const machineQaPassed = machineBlockers.length === 0 && technicalQaPassed && machineVisualQaPassed && motionQaPassed && captionQaPassed && productEvidenceQaPassed && audioQaPassed && creativeQaPassed && score >= AUTONOMOUS_VIDEO_QA_CONFIG.scoreThreshold;
  const finalAutomatedQaPassed = machineQaPassed && automatedVisualQaPassed && uniqueBlockers.length === 0;
  return {
    version: "autonomous-video-review-v2",
    productKey: input.productKey,
    attempt: input.attempt,
    selectedHook: input.selectedHook,
    hookFamily: input.hookFamily,
    dimensions,
    score,
    threshold: 75,
    first3Threshold: 70,
    blockers: uniqueBlockers,
    signals: [...new Set(signals)],
    measurements: m,
    technicalQaPassed,
    automatedVisualQaPassed,
    audioQaPassed,
    creativeQaPassed,
    motionQaPassed,
    captionQaPassed,
    productEvidenceQaPassed,
    machineQaPassed,
    finalAutomatedQaPassed,
    humanOwnerReviewStatus: "not_requested",
    publishReady: false,
    visualReview,
    action: finalAutomatedQaPassed ? "PASS" : machineQaPassed ? "BLOCK" : machineBlockers.some(isRepairable) ? "REPAIR" : "BLOCK",
    SAFE_TO_UPLOAD: false,
    SAFE_TO_PUBLIC_UPLOAD: false
  };
}

function weightedScore(dimensions: AutomatedVideoQualityDimensions): number {
  const weights = AUTONOMOUS_VIDEO_QA_CONFIG.weights;
  const total = Object.entries(weights).reduce((sum, [key, weight]) => sum + dimensions[key as keyof AutomatedVideoQualityDimensions] * weight, 0) / 100;
  return Math.round(total * 100) / 100;
}

function clamp(value: number): number { return Math.round(Math.max(0, Math.min(100, value)) * 100) / 100; }
function isRepairable(blocker: string): boolean { return ["SLIDESHOW_FREEZE_RATIO_HIGH", "VISUAL_BEAT_TOO_LONG", "FIRST_FRAME_HOOK_UNREADABLE", "CAPTION_SAFE_TIMELINE_FAILED"].includes(blocker); }
