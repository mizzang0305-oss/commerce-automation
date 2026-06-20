import { APPROVE_GENERATE_STORY_VOICEOVER_MP4_AND_UPLOAD_ONE_PRIVATE } from "@/lib/uploads/youtube/storyVoiceoverUploadApproval";
import { APPROVE_FIX_SHORTS_RENDERING_PACING_AND_UPLOAD_ONE_PRIVATE } from "@/lib/uploads/youtube/shortsRenderingPacingApproval";

export const APPROVE_YOUTUBE_PRIVATE_UPLOAD = "APPROVE_YOUTUBE_PRIVATE_UPLOAD";
export const RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE = "RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE";

export function hasExactYouTubeUploadConfirmation(value: unknown) {
  return typeof value === "string" && [
    APPROVE_YOUTUBE_PRIVATE_UPLOAD,
    APPROVE_GENERATE_STORY_VOICEOVER_MP4_AND_UPLOAD_ONE_PRIVATE,
    APPROVE_FIX_SHORTS_RENDERING_PACING_AND_UPLOAD_ONE_PRIVATE
  ].includes(value.trim());
}

export function hasExactYouTubeLiveSmokeApproval(value: unknown) {
  return typeof value === "string" && value.trim() === RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE;
}

export function readBooleanEnv(name: string, env: NodeJS.ProcessEnv = process.env) {
  return env[name]?.trim().toLowerCase() === "true";
}
