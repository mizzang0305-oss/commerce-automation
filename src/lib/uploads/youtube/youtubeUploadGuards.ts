export const APPROVE_YOUTUBE_PRIVATE_UPLOAD = "APPROVE_YOUTUBE_PRIVATE_UPLOAD";
export const RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE = "RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE";

export function hasExactYouTubeUploadConfirmation(value: unknown) {
  return typeof value === "string" && value.trim() === APPROVE_YOUTUBE_PRIVATE_UPLOAD;
}

export function hasExactYouTubeLiveSmokeApproval(value: unknown) {
  return typeof value === "string" && value.trim() === RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE;
}

export function readBooleanEnv(name: string, env: NodeJS.ProcessEnv = process.env) {
  return env[name]?.trim().toLowerCase() === "true";
}
