import type { MotionClipResult, MotionManifest, MotionProviderName } from "./motionProviderTypes";

export function buildMotionManifest(input: {
  productRef: string;
  providerName: MotionProviderName;
  clips: MotionClipResult[];
  publicUploadBlocked: boolean;
}): MotionManifest {
  const providerMode = input.clips[0]?.providerMode ?? providerModeForName(input.providerName);
  const motionSceneCount = input.clips.filter(hasSceneMotion).length;
  const realMotionSceneCount = input.clips.filter((clip) => clip.realMotion).length;
  const handInteractionSceneCount = input.clips.filter((clip) => clip.handInteraction && clip.realMotion).length;
  const utensilInteractionSceneCount = input.clips.filter((clip) => clip.utensilInteraction && clip.realMotion).length;
  const slideshowLikeRatio = input.clips.length
    ? Math.max(...input.clips.map((clip) => clip.slideshowLikeRatio))
    : 1;
  const allScenesStatic = input.clips.length === 0 || input.clips.every((clip) => clip.allScenesStatic);
  const imageSwapOnlyVideo = input.clips.some((clip) => clip.imageSwapOnly);

  return {
    product_ref: input.productRef,
    provider_name: input.providerName,
    provider_mode: providerMode,
    clips: input.clips,
    motion_scene_count: motionSceneCount,
    real_motion_scene_count: realMotionSceneCount,
    hand_interaction_scene_count: handInteractionSceneCount,
    utensil_interaction_scene_count: utensilInteractionSceneCount,
    product_rotate_scene_present: input.clips.some((clip) => clip.productRotateScene && clip.realMotion),
    slideshow_like_ratio: slideshowLikeRatio,
    all_scenes_static: allScenesStatic,
    image_swap_only_video: imageSwapOnlyVideo,
    public_upload_blocked: input.publicUploadBlocked,
    safeSummary: `${input.providerName} manifest with ${input.clips.length} safe clip references`
  };
}

function hasSceneMotion(clip: MotionClipResult) {
  return clip.realMotion || (!clip.allScenesStatic && !clip.imageSwapOnly && clip.staticFrameRatio <= 0.25);
}

function providerModeForName(providerName: MotionProviderName) {
  if (providerName === "cloud_image_to_video") return "image_to_video_generated";
  if (providerName === "comfyui_wan_i2v") return "image_to_video_generated";
  if (providerName === "ltx_video") return "real_motion_generated";
  if (providerName === "animated_still") return "animated_still_generated";
  return "slideshow_generated";
}
