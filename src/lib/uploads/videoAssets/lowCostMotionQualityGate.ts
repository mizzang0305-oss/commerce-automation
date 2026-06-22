export type LowCostMotionQualityBlocker =
  | "PAID_I2V_SCENE_COUNT_NOT_ZERO"
  | "LOW_COST_MOTION_SCENE_COUNT_TOO_LOW"
  | "STATIC_ONLY_RATIO_TOO_HIGH"
  | "SAME_FRAME_RATIO_TOO_HIGH"
  | "CAPTION_SAFE_AREA_FAILED"
  | "VOICEOVER_AUDIO_REQUIRED"
  | "HOOK_NOT_VISIBLE_FIRST_SECOND"
  | "TEXT_CLIPPED"
  | "TEXT_CLIPPED_OR_TOO_CLOSE_TO_EDGE"
  | "TEXT_TOP_SAFE_AREA_TOO_TIGHT"
  | "MICRO_JITTER_DETECTED"
  | "SUBPIXEL_CROP_JITTER_DETECTED"
  | "CAMERA_SHAKE_TOO_HIGH"
  | "LOW_COST_MOTION_TOO_AGGRESSIVE"
  | "PUBLIC_UPLOAD_NOT_BLOCKED"
  | "LOW_COST_MOTION_RENDERER_NOT_EXECUTED";

export type LowCostMotionQualityInput = {
  paidI2VSceneCount: number;
  lowCostMotionSceneCount: number;
  staticOnlyRatio: number;
  sameFrameRatio: number;
  captionSafeAreaPass: boolean;
  voiceoverAudioPresent: boolean;
  hookVisibleFirstSecond: boolean;
  noTextClipped: boolean;
  publicUploadBlocked: boolean;
  rendererExecuted?: boolean;
  motionSmoothingApplied?: boolean;
  subpixelJitterFixed?: boolean;
  cropCenterDeltaMaxPx?: number;
  cameraShakeScore?: number;
  microJitterScore?: number;
  maxZoomDelta?: number;
  maxPanDeltaRatio?: number;
  topSafeMarginPx?: number;
  bottomSafeMarginPx?: number;
  rightUiMarginPx?: number;
  easingFunction?: string;
};

export type LowCostMotionQualityGateReport = {
  final_upload_allowed: boolean;
  low_cost_motion_ready: boolean;
  paid_i2v_scene_count: number;
  low_cost_motion_scene_count: number;
  static_only_ratio: number;
  same_frame_ratio: number;
  caption_safe_area_pass: boolean;
  voiceover_audio_present: boolean;
  hook_visible_first_second: boolean;
  no_text_clipped: boolean;
  public_upload_blocked: boolean;
  motion_smoothing_applied: boolean;
  subpixel_jitter_fixed: boolean;
  max_zoom_delta: number | null;
  max_pan_delta: number | null;
  easing_function: string;
  micro_jitter_score: number | null;
  caption_top_margin_px: number | null;
  caption_bottom_margin_px: number | null;
  right_ui_margin_px: number | null;
  blockers: LowCostMotionQualityBlocker[];
  safeSummary: string;
};

const MIN_LOW_COST_MOTION_SCENES = 6;
const MAX_STATIC_ONLY_RATIO = 0.3;
const MAX_SAME_FRAME_RATIO = 0.35;
const MAX_CROP_CENTER_DELTA_PX = 1;
const MAX_CAMERA_SHAKE_SCORE = 0.08;
const MAX_MICRO_JITTER_SCORE = 0.08;
const MAX_ZOOM_DELTA = 0.025;
const MAX_PAN_DELTA_RATIO = 0.025;
const MIN_TOP_SAFE_MARGIN_PX = 180;
const MIN_BOTTOM_SAFE_MARGIN_PX = 260;
const MIN_RIGHT_UI_MARGIN_PX = 170;

export function evaluateLowCostMotionQualityGate(
  input: LowCostMotionQualityInput
): LowCostMotionQualityGateReport {
  const blockers: LowCostMotionQualityBlocker[] = [];

  if (input.paidI2VSceneCount !== 0) blockers.push("PAID_I2V_SCENE_COUNT_NOT_ZERO");
  if (input.lowCostMotionSceneCount < MIN_LOW_COST_MOTION_SCENES) {
    blockers.push("LOW_COST_MOTION_SCENE_COUNT_TOO_LOW");
  }
  if (input.staticOnlyRatio > MAX_STATIC_ONLY_RATIO) blockers.push("STATIC_ONLY_RATIO_TOO_HIGH");
  if (input.sameFrameRatio > MAX_SAME_FRAME_RATIO) blockers.push("SAME_FRAME_RATIO_TOO_HIGH");
  if (!input.captionSafeAreaPass) blockers.push("CAPTION_SAFE_AREA_FAILED");
  if (!input.voiceoverAudioPresent) blockers.push("VOICEOVER_AUDIO_REQUIRED");
  if (!input.hookVisibleFirstSecond) blockers.push("HOOK_NOT_VISIBLE_FIRST_SECOND");
  if (!input.noTextClipped) blockers.push("TEXT_CLIPPED");
  if (!input.publicUploadBlocked) blockers.push("PUBLIC_UPLOAD_NOT_BLOCKED");
  if (input.motionSmoothingApplied === false || input.subpixelJitterFixed === false) {
    blockers.push("MICRO_JITTER_DETECTED");
  }
  if (isAbove(input.cropCenterDeltaMaxPx, MAX_CROP_CENTER_DELTA_PX)) {
    blockers.push("SUBPIXEL_CROP_JITTER_DETECTED");
  }
  if (isAbove(input.cameraShakeScore, MAX_CAMERA_SHAKE_SCORE)) {
    blockers.push("CAMERA_SHAKE_TOO_HIGH");
  }
  if (isAbove(input.microJitterScore, MAX_MICRO_JITTER_SCORE)) {
    blockers.push("MICRO_JITTER_DETECTED");
  }
  if (isAbove(input.maxZoomDelta, MAX_ZOOM_DELTA) || isAbove(input.maxPanDeltaRatio, MAX_PAN_DELTA_RATIO)) {
    blockers.push("LOW_COST_MOTION_TOO_AGGRESSIVE");
  }
  if (isBelow(input.topSafeMarginPx, MIN_TOP_SAFE_MARGIN_PX)) {
    blockers.push("TEXT_TOP_SAFE_AREA_TOO_TIGHT");
  }
  if (isBelow(input.bottomSafeMarginPx, MIN_BOTTOM_SAFE_MARGIN_PX) ||
    isBelow(input.rightUiMarginPx, MIN_RIGHT_UI_MARGIN_PX)) {
    blockers.push("TEXT_CLIPPED_OR_TOO_CLOSE_TO_EDGE");
  }

  const renderReady = blockers.length === 0;
  if (renderReady && input.rendererExecuted !== true) {
    blockers.push("LOW_COST_MOTION_RENDERER_NOT_EXECUTED");
  }

  return {
    final_upload_allowed: blockers.length === 0 && input.rendererExecuted === true,
    low_cost_motion_ready: renderReady,
    paid_i2v_scene_count: input.paidI2VSceneCount,
    low_cost_motion_scene_count: input.lowCostMotionSceneCount,
    static_only_ratio: input.staticOnlyRatio,
    same_frame_ratio: input.sameFrameRatio,
    caption_safe_area_pass: input.captionSafeAreaPass,
    voiceover_audio_present: input.voiceoverAudioPresent,
    hook_visible_first_second: input.hookVisibleFirstSecond,
    no_text_clipped: input.noTextClipped,
    public_upload_blocked: input.publicUploadBlocked,
    motion_smoothing_applied: input.motionSmoothingApplied === true,
    subpixel_jitter_fixed: input.subpixelJitterFixed === true,
    max_zoom_delta: normalizeMetric(input.maxZoomDelta),
    max_pan_delta: normalizeMetric(input.maxPanDeltaRatio),
    easing_function: input.easingFunction?.trim() || "smootherstep",
    micro_jitter_score: normalizeMetric(input.microJitterScore),
    caption_top_margin_px: normalizeMetric(input.topSafeMarginPx),
    caption_bottom_margin_px: normalizeMetric(input.bottomSafeMarginPx),
    right_ui_margin_px: normalizeMetric(input.rightUiMarginPx),
    blockers: [...new Set(blockers)],
    safeSummary: renderReady
      ? "Low-cost programmed motion is ready for a separate local renderer execution; final upload remains blocked until render artifacts pass review."
      : "Low-cost programmed motion is blocked by sanitized quality gates."
  };
}

function isAbove(value: number | undefined, threshold: number) {
  return typeof value === "number" && Number.isFinite(value) && value > threshold;
}

function isBelow(value: number | undefined, threshold: number) {
  return typeof value === "number" && Number.isFinite(value) && value < threshold;
}

function normalizeMetric(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
