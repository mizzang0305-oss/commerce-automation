import { APPROVE_GENERATE_STORY_VOICEOVER_MP4_AND_UPLOAD_ONE_PRIVATE } from "@/lib/uploads/youtube/storyVoiceoverUploadApproval";
import { APPROVE_FIX_SHORTS_RENDERING_PACING_AND_UPLOAD_ONE_PRIVATE } from "@/lib/uploads/youtube/shortsRenderingPacingApproval";
import { APPROVE_FIX_SHORTS_HOOK_VISUALS_VOICE_LINK_AND_UPLOAD_ONE_PRIVATE } from "@/lib/uploads/youtube/shortsHookVisualsVoiceApproval";
import { APPROVE_AUTO_SCENE_IMAGE_PIPELINE_AND_UPLOAD_ONE_PRIVATE } from "@/lib/uploads/youtube/autoSceneImagePipelineApproval";
import { APPROVE_IMPLEMENT_REAL_SCENE_IMAGE_PROVIDER_AND_UPLOAD_ONE_PRIVATE } from "@/lib/uploads/youtube/realSceneImageProviderApproval";
import { APPROVE_REAL_USAGE_SCENE_PROVIDER_AND_UPLOAD_ONE_PRIVATE } from "@/lib/uploads/youtube/realUsageSceneProviderApproval";
import { APPROVE_PHOTOREALISTIC_USAGE_SCENE_PROVIDER_AND_UPLOAD_ONE_PRIVATE } from "@/lib/uploads/youtube/photorealisticUsageSceneProviderApproval";

export const APPROVE_YOUTUBE_PRIVATE_UPLOAD = "APPROVE_YOUTUBE_PRIVATE_UPLOAD";
export const APPROVE_MOTION_FIRST_SHORTS_PRIVATE_UPLOAD = "APPROVE_MOTION_FIRST_SHORTS_PRIVATE_UPLOAD";
export const RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE = "RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE";

export function hasExactYouTubeUploadConfirmation(value: unknown) {
  return typeof value === "string" && [
    APPROVE_YOUTUBE_PRIVATE_UPLOAD,
    APPROVE_GENERATE_STORY_VOICEOVER_MP4_AND_UPLOAD_ONE_PRIVATE,
    APPROVE_FIX_SHORTS_RENDERING_PACING_AND_UPLOAD_ONE_PRIVATE,
    APPROVE_FIX_SHORTS_HOOK_VISUALS_VOICE_LINK_AND_UPLOAD_ONE_PRIVATE,
    APPROVE_AUTO_SCENE_IMAGE_PIPELINE_AND_UPLOAD_ONE_PRIVATE,
    APPROVE_IMPLEMENT_REAL_SCENE_IMAGE_PROVIDER_AND_UPLOAD_ONE_PRIVATE,
    APPROVE_REAL_USAGE_SCENE_PROVIDER_AND_UPLOAD_ONE_PRIVATE,
    APPROVE_PHOTOREALISTIC_USAGE_SCENE_PROVIDER_AND_UPLOAD_ONE_PRIVATE,
    APPROVE_MOTION_FIRST_SHORTS_PRIVATE_UPLOAD
  ].includes(value.trim());
}

export function hasExactYouTubeLiveSmokeApproval(value: unknown) {
  return typeof value === "string" && value.trim() === RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE;
}

export function readBooleanEnv(name: string, env: NodeJS.ProcessEnv = process.env) {
  return env[name]?.trim().toLowerCase() === "true";
}
