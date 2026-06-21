export type MotionProviderMode =
  | "real_motion_generated"
  | "image_to_video_generated"
  | "animated_still_generated"
  | "slideshow_generated";

export type MotionProviderName =
  | "comfyui_wan_i2v"
  | "ltx_video"
  | "animated_still"
  | "slideshow";

export type MotionQualityBlocker =
  | "MOTION_PROVIDER_NOT_CONFIGURED"
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
  prompt: string;
  negativePrompt: string;
  durationSeconds: number;
  productSafeRef: string;
  requiredMotion: string;
  handInteraction: boolean;
  utensilInteraction: boolean;
  productRotateScene: boolean;
};

export type MotionClipResult = {
  sceneId: string;
  providerName: MotionProviderName;
  providerMode: MotionProviderMode;
  safeClipRef: string;
  durationSeconds: number;
  realMotion: boolean;
  handInteraction: boolean;
  utensilInteraction: boolean;
  productRotateScene: boolean;
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
      blocker: "MOTION_PROVIDER_NOT_CONFIGURED";
      fallback_chain: MotionProviderName[];
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
