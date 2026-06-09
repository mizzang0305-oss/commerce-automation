import type { YouTubeUploadResult, YouTubeUploadSideEffects, YouTubeUploadVisibility } from "@/lib/uploads/youtube/types";

export const youtubeUploadSafeSideEffects: YouTubeUploadSideEffects = {
  external_api_called: false,
  youtube_upload_executed: false,
  uploaded: false,
  db_written: false,
  r2_uploaded: false,
  queue_created: false,
  worker_job_created: false,
  platform_upload_triggered: false,
  public_upload_enabled: false
};

export function blockedYouTubeUploadResult(
  visibility: YouTubeUploadVisibility,
  safe_message: string,
  blocked_reasons: string[],
  attempted = false,
  extra: Partial<YouTubeUploadResult> = {}
): YouTubeUploadResult {
  return {
    provider: "youtube",
    attempted,
    succeeded: false,
    visibility,
    safe_message,
    blocked_reasons,
    side_effects: youtubeUploadSafeSideEffects,
    approval_required: true,
    ...extra
  };
}
