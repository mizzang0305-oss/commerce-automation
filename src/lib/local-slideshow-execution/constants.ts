import type { LocalSlideshowExecutionSideEffects } from "@/lib/local-slideshow-execution/types";

export const localSlideshowExecutionConfirmationPhrase = "APPROVE_LOCAL_SLIDESHOW_RENDER_EXECUTION" as const;

export const localSlideshowExecutionSafeBlockedSideEffects: LocalSlideshowExecutionSideEffects = {
  external_api_called: false,
  db_written: false,
  file_uploaded: false,
  payment_triggered: false,
  message_sent: false,
  deployment_triggered: false,
  local_file_read: false,
  local_file_written: false,
  video_generated: false,
  ffmpeg_executed: false,
  moviepy_executed: false,
  uploaded: false,
  upload_package_created: false,
  worker_job_created: false,
  queue_created: false,
  r2_uploaded: false
};

export function buildLocalSlideshowExecutionSideEffects(
  overrides: Partial<Pick<
    LocalSlideshowExecutionSideEffects,
    "local_file_read" | "local_file_written" | "video_generated" | "ffmpeg_executed" | "moviepy_executed"
  >>
): LocalSlideshowExecutionSideEffects {
  return {
    ...localSlideshowExecutionSafeBlockedSideEffects,
    ...overrides
  };
}
