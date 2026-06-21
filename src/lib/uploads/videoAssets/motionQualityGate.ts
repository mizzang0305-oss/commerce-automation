import type { MotionManifest, MotionQualityBlocker } from "./motionProviderTypes";

const MIN_MOTION_SCENE_COUNT = 4;
const MIN_REAL_MOTION_SCENE_COUNT = 2;
const MIN_HAND_INTERACTION_SCENE_COUNT = 2;
const MIN_UTENSIL_INTERACTION_SCENE_COUNT = 2;
const MAX_SLIDESHOW_LIKE_RATIO = 0.25;

export const REQUIRED_MOTION_QUALITY_BLOCKERS = [
  "MOTION_PROVIDER_NOT_CONFIGURED",
  "CLOUD_VIDEO_PROVIDER_NOT_CONFIGURED",
  "CLOUD_VIDEO_PROVIDER_COST_APPROVAL_REQUIRED",
  "CLOUD_VIDEO_PROVIDER_LIVE_API_NOT_IMPLEMENTED",
  "FAL_KLING_I2V_PROVIDER_DISABLED",
  "FAL_API_KEY_MISSING",
  "FAL_KLING_I2V_MODEL_ID_MISSING",
  "FAL_KLING_I2V_COST_APPROVAL_REQUIRED",
  "FAL_KLING_I2V_PROVIDER_NOT_CONFIGURED",
  "FAL_KLING_I2V_LIVE_EXECUTION_NOT_APPROVED",
  "FAL_KLING_I2V_PAID_API_CALL_BLOCKED",
  "PAID_I2V_MANUAL_PREMIUM_APPROVAL_REQUIRED",
  "PAID_I2V_COST_CAP_REQUIRED",
  "PAID_I2V_SCENE_CAP_EXCEEDED",
  "PAID_I2V_AUTOPILOT_BLOCKED",
  "SOURCE_VIDEO_RIGHTS_NOT_CONFIRMED",
  "SOURCE_VIDEO_PROVIDER_DISABLED",
  "SOURCE_VIDEO_RAW_DOWNLOAD_BLOCKED",
  "LOW_COST_MOTION_RENDERER_NOT_EXECUTED",
  "REAL_MOTION_CLIP_REQUIRED",
  "MOTION_SCENE_COUNT_TOO_LOW",
  "HAND_INTERACTION_SCENE_MISSING",
  "UTENSIL_INTERACTION_SCENE_MISSING",
  "PRODUCT_ROTATE_SCENE_MISSING",
  "SLIDESHOW_LIKE_OUTPUT_BLOCKED",
  "ALL_SCENES_STATIC_BLOCKED",
  "IMAGE_SWAP_ONLY_VIDEO_BLOCKED"
] as const satisfies readonly MotionQualityBlocker[];

export type MotionQualityGateReport = {
  final_upload_allowed: boolean;
  youtube_upload_allowed: boolean;
  public_upload_blocked: boolean;
  blockers: MotionQualityBlocker[];
  motion_scene_count: number;
  real_motion_scene_count: number;
  hand_interaction_scene_count: number;
  utensil_interaction_scene_count: number;
  product_rotate_scene_present: boolean;
  slideshow_like_ratio: number;
  all_scenes_static: boolean;
  image_swap_only_video: boolean;
};

export function evaluateMotionQualityGate(manifest: MotionManifest): MotionQualityGateReport {
  const blockers: MotionQualityBlocker[] = [];

  if (manifest.motion_scene_count < MIN_MOTION_SCENE_COUNT) {
    blockers.push("MOTION_SCENE_COUNT_TOO_LOW");
  }
  if (manifest.real_motion_scene_count < MIN_REAL_MOTION_SCENE_COUNT) {
    blockers.push("REAL_MOTION_CLIP_REQUIRED");
  }
  if (manifest.hand_interaction_scene_count < MIN_HAND_INTERACTION_SCENE_COUNT) {
    blockers.push("HAND_INTERACTION_SCENE_MISSING");
  }
  if (manifest.utensil_interaction_scene_count < MIN_UTENSIL_INTERACTION_SCENE_COUNT) {
    blockers.push("UTENSIL_INTERACTION_SCENE_MISSING");
  }
  if (!manifest.product_rotate_scene_present) {
    blockers.push("PRODUCT_ROTATE_SCENE_MISSING");
  }
  if (manifest.provider_mode === "slideshow_generated" || manifest.slideshow_like_ratio > MAX_SLIDESHOW_LIKE_RATIO) {
    blockers.push("SLIDESHOW_LIKE_OUTPUT_BLOCKED");
  }
  if (manifest.all_scenes_static) {
    blockers.push("ALL_SCENES_STATIC_BLOCKED");
  }
  if (manifest.provider_mode === "slideshow_generated" || manifest.image_swap_only_video) {
    blockers.push("IMAGE_SWAP_ONLY_VIDEO_BLOCKED");
  }
  if (!manifest.public_upload_blocked) {
    blockers.push("PUBLIC_UPLOAD_NOT_BLOCKED");
  }

  const uniqueBlockers = [...new Set(blockers)];
  const finalUploadAllowed = uniqueBlockers.length === 0 && manifest.public_upload_blocked;

  return {
    final_upload_allowed: finalUploadAllowed,
    youtube_upload_allowed: finalUploadAllowed,
    public_upload_blocked: manifest.public_upload_blocked,
    blockers: uniqueBlockers,
    motion_scene_count: manifest.motion_scene_count,
    real_motion_scene_count: manifest.real_motion_scene_count,
    hand_interaction_scene_count: manifest.hand_interaction_scene_count,
    utensil_interaction_scene_count: manifest.utensil_interaction_scene_count,
    product_rotate_scene_present: manifest.product_rotate_scene_present,
    slideshow_like_ratio: manifest.slideshow_like_ratio,
    all_scenes_static: manifest.all_scenes_static,
    image_swap_only_video: manifest.image_swap_only_video
  };
}
