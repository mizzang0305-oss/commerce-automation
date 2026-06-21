export type MotionProviderMode =
  | "source_video_generated"
  | "real_motion_generated"
  | "image_to_video_generated"
  | "programmed_still_motion_generated"
  | "animated_still_generated"
  | "slideshow_generated";

export type MotionProviderName =
  | "rights_confirmed_source_video"
  | "advanced_still_motion"
  | "photorealistic_scene_still"
  | "fal_kling_i2v"
  | "cloud_image_to_video"
  | "comfyui_wan_i2v"
  | "ltx_video"
  | "animated_still"
  | "slideshow";

export type MotionSceneKind =
  | "hook"
  | "problem"
  | "product_intro"
  | "hand_pickup"
  | "cooking_use"
  | "product_rotate"
  | "checklist"
  | "cta"
  | (string & {});

export type MotionQualityBlocker =
  | "MOTION_PROVIDER_NOT_CONFIGURED"
  | "CLOUD_VIDEO_PROVIDER_NOT_CONFIGURED"
  | "CLOUD_VIDEO_PROVIDER_COST_APPROVAL_REQUIRED"
  | "CLOUD_VIDEO_PROVIDER_LIVE_API_NOT_IMPLEMENTED"
  | "FAL_KLING_I2V_PROVIDER_DISABLED"
  | "FAL_API_KEY_MISSING"
  | "FAL_KLING_I2V_MODEL_ID_MISSING"
  | "FAL_KLING_I2V_COST_APPROVAL_REQUIRED"
  | "FAL_KLING_I2V_PROVIDER_NOT_CONFIGURED"
  | "FAL_KLING_I2V_LIVE_EXECUTION_NOT_APPROVED"
  | "FAL_KLING_I2V_PAID_API_CALL_BLOCKED"
  | "FAL_SUBMIT_HTTP_502"
  | "PAID_I2V_MANUAL_PREMIUM_APPROVAL_REQUIRED"
  | "PAID_I2V_COST_CAP_REQUIRED"
  | "PAID_I2V_SCENE_CAP_EXCEEDED"
  | "PAID_I2V_AUTOPILOT_BLOCKED"
  | "SOURCE_VIDEO_RIGHTS_NOT_CONFIRMED"
  | "SOURCE_VIDEO_PROVIDER_DISABLED"
  | "SOURCE_VIDEO_RAW_DOWNLOAD_BLOCKED"
  | "LOW_COST_MOTION_RENDERER_NOT_EXECUTED"
  | "LOW_COST_MOTION_SCENE_COUNT_TOO_LOW"
  | "STATIC_ONLY_RATIO_TOO_HIGH"
  | "SAME_FRAME_RATIO_TOO_HIGH"
  | "CAPTION_SAFE_AREA_FAILED"
  | "VOICEOVER_AUDIO_REQUIRED"
  | "HOOK_NOT_VISIBLE_FIRST_SECOND"
  | "TEXT_CLIPPED"
  | "COMFYUI_WAN_I2V_PROVIDER_DISABLED"
  | "COMFYUI_BASE_URL_MISSING"
  | "COMFYUI_WAN_I2V_WORKFLOW_PATH_MISSING"
  | "COMFYUI_WAN_I2V_WORKFLOW_NOT_FOUND"
  | "COMFYUI_WAN_I2V_WORKFLOW_INVALID_JSON"
  | "COMFYUI_WAN_I2V_PROVIDER_NOT_CONFIGURED"
  | "COMFYUI_WAN_I2V_LIVE_EXECUTION_NOT_APPROVED"
  | "COMFYUI_WAN_I2V_OUTPUT_INVALID"
  | "REAL_MOTION_CLIP_REQUIRED"
  | "MOTION_SCENE_COUNT_TOO_LOW"
  | "HAND_INTERACTION_SCENE_MISSING"
  | "UTENSIL_INTERACTION_SCENE_MISSING"
  | "PRODUCT_ROTATE_SCENE_MISSING"
  | "SLIDESHOW_LIKE_OUTPUT_BLOCKED"
  | "ALL_SCENES_STATIC_BLOCKED"
  | "IMAGE_SWAP_ONLY_VIDEO_BLOCKED"
  | "PUBLIC_UPLOAD_NOT_BLOCKED";

export type MotionSceneBrief = {
  sceneId: string;
  kind?: MotionSceneKind;
  productName?: string;
  caption?: string;
  prompt: string;
  negativePrompt: string;
  durationSeconds: number;
  productSafeRef: string;
  sourceImageSafeRef?: string;
  sourceImageLocalPath?: string;
  outputPrefix?: string;
  seed?: number;
  width?: number;
  height?: number;
  requiredSignals?: string[];
  requiredMotion: string;
  handInteraction: boolean;
  utensilInteraction: boolean;
  productRotateScene: boolean;
  kitchenContext?: boolean;
};

export type MotionClipResult = {
  sceneId: string;
  providerName: MotionProviderName;
  providerMode: MotionProviderMode;
  safeClipRef: string;
  localPath?: string;
  outputBasename?: string;
  mimeType?: string;
  durationSeconds: number;
  realMotion: boolean;
  handInteraction: boolean;
  utensilInteraction: boolean;
  productRotateScene: boolean;
  kitchenContext?: boolean;
  staticFrameRatio: number;
  slideshowLikeRatio: number;
  imageSwapOnly: boolean;
  allScenesStatic: boolean;
  safeSummary: string;
};

export type MotionProviderGenerateInput = {
  sceneBriefs: MotionSceneBrief[];
  requireFinalUploadSafe?: boolean;
};

export type MotionProviderGenerateResult =
  | {
      ok: true;
      providerName: MotionProviderName;
      providerMode: MotionProviderMode;
      clips: MotionClipResult[];
    }
  | {
      ok: false;
      providerName: MotionProviderName;
      providerMode: MotionProviderMode;
      blockers: MotionQualityBlocker[];
      safeSummary: string;
    };

export type MotionProvider = {
  name: MotionProviderName;
  mode: MotionProviderMode;
  configured: boolean;
  safeSummary: string;
  generate(input: MotionProviderGenerateInput): Promise<MotionProviderGenerateResult>;
};

export type MotionProviderSelection =
  | {
      ok: true;
      provider_name: MotionProviderName;
      provider_mode: MotionProviderMode;
      fallback_chain: MotionProviderName[];
      provider: MotionProvider;
    }
  | {
      ok: false;
      blocker: MotionQualityBlocker;
      blockers: MotionQualityBlocker[];
      fallback_chain: MotionProviderName[];
      safeSummary: string;
    };

export type MotionManifest = {
  product_ref: string;
  provider_name: MotionProviderName;
  provider_mode: MotionProviderMode;
  clips: MotionClipResult[];
  motion_scene_count: number;
  real_motion_scene_count: number;
  hand_interaction_scene_count: number;
  utensil_interaction_scene_count: number;
  product_rotate_scene_present: boolean;
  slideshow_like_ratio: number;
  all_scenes_static: boolean;
  image_swap_only_video: boolean;
  public_upload_blocked: boolean;
  safeSummary: string;
};
