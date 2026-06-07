import type { LocalSlideshowRenderSideEffects } from "@/lib/local-slideshow-render/types";

export const localSlideshowRenderConfirmationPhrase = "PREPARE_LOCAL_SLIDESHOW_RENDER_PACKAGE" as const;

export const localSlideshowRenderSideEffects: LocalSlideshowRenderSideEffects = {
  ffmpeg_executed: false,
  moviepy_executed: false,
  local_file_read: false,
  local_file_written: false,
  image_generated: false,
  video_generated: false,
  upload_package_created: false,
  uploaded: false,
  db_written: false,
  worker_job_created: false,
  queue_created: false,
  external_api_called: false,
  deployment_triggered: false
};
