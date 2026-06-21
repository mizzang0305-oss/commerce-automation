export type LowCostMotionQualityBlocker =
  | "PAID_I2V_SCENE_COUNT_NOT_ZERO"
  | "LOW_COST_MOTION_SCENE_COUNT_TOO_LOW"
  | "STATIC_ONLY_RATIO_TOO_HIGH"
  | "SAME_FRAME_RATIO_TOO_HIGH"
  | "CAPTION_SAFE_AREA_FAILED"
  | "VOICEOVER_AUDIO_REQUIRED"
  | "HOOK_NOT_VISIBLE_FIRST_SECOND"
  | "TEXT_CLIPPED"
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
  blockers: LowCostMotionQualityBlocker[];
  safeSummary: string;
};

const MIN_LOW_COST_MOTION_SCENES = 6;
const MAX_STATIC_ONLY_RATIO = 0.3;
const MAX_SAME_FRAME_RATIO = 0.35;

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
    blockers,
    safeSummary: renderReady
      ? "Low-cost programmed motion is ready for a separate local renderer execution; final upload remains blocked until render artifacts pass review."
      : "Low-cost programmed motion is blocked by sanitized quality gates."
  };
}
