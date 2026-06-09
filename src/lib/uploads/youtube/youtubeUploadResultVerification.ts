import type { YouTubeUploadVisibility } from "@/lib/uploads/youtube/types";

export const youtubeUploadResultVerificationSideEffects = {
  external_api_called: false,
  youtube_upload_executed: false,
  uploaded: false,
  db_written: false,
  r2_uploaded: false,
  queue_created: false,
  worker_job_created: false,
  upload_package_created: false,
  public_upload_enabled: false
} as const;

export type YouTubeUploadResultVerificationInput = {
  candidate_id?: unknown;
  youtube_video_id?: unknown;
  youtube_url?: unknown;
  visibility?: unknown;
  studio_visibility_verified?: unknown;
  disclosure_verified?: unknown;
  title_verified?: unknown;
  public_upload_blocked?: unknown;
  verified_at?: unknown;
};

export type YouTubeUploadResultVerification = {
  candidate_id: string;
  youtube_video_id: string;
  youtube_url: string;
  visibility: Extract<YouTubeUploadVisibility, "private">;
  verified_at: string;
  studio_visibility_verified: boolean;
  disclosure_verified: boolean;
  title_verified: boolean;
  public_upload_blocked: boolean;
  token_exposed: false;
  authorization_exposed: false;
  upload_ready: boolean;
  final_verified: boolean;
  side_effects: typeof youtubeUploadResultVerificationSideEffects;
};

export function buildYouTubeUploadResultVerification(input: YouTubeUploadResultVerificationInput):
  | { ok: true; verification: YouTubeUploadResultVerification }
  | { ok: false; missing_reasons: string[]; side_effects: typeof youtubeUploadResultVerificationSideEffects } {
  const candidateId = safeTrim(input.candidate_id);
  const youtubeVideoId = safeTrim(input.youtube_video_id);
  const youtubeUrl = safeTrim(input.youtube_url);
  const visibility = safeTrim(input.visibility);
  const missingReasons: string[] = [];

  if (!candidateId) {
    missingReasons.push("candidate_id");
  }
  if (!youtubeVideoId) {
    missingReasons.push("youtube_video_id");
  }
  if (!youtubeUrl) {
    missingReasons.push("youtube_url");
  }
  if (visibility !== "private") {
    missingReasons.push(visibility === "public" ? "visibility_private_required" : "visibility");
  }

  if (missingReasons.length > 0) {
    return {
      ok: false,
      missing_reasons: missingReasons,
      side_effects: youtubeUploadResultVerificationSideEffects
    };
  }

  const studioVisibilityVerified = input.studio_visibility_verified === true;
  const disclosureVerified = input.disclosure_verified === true;
  const titleVerified = input.title_verified === true;
  const publicUploadBlocked = input.public_upload_blocked !== false;
  const finalVerified = studioVisibilityVerified && disclosureVerified && titleVerified && publicUploadBlocked;

  return {
    ok: true,
    verification: {
      candidate_id: candidateId,
      youtube_video_id: youtubeVideoId,
      youtube_url: youtubeUrl,
      visibility: "private",
      verified_at: safeTrim(input.verified_at) || new Date(0).toISOString(),
      studio_visibility_verified: studioVisibilityVerified,
      disclosure_verified: disclosureVerified,
      title_verified: titleVerified,
      public_upload_blocked: publicUploadBlocked,
      token_exposed: false,
      authorization_exposed: false,
      upload_ready: finalVerified,
      final_verified: finalVerified,
      side_effects: youtubeUploadResultVerificationSideEffects
    }
  };
}

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
