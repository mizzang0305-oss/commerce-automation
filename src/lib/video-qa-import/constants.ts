import type { GeneratedVideoQaImportSideEffects, GeneratedVideoQaStatus } from "@/lib/video-qa-import/types";

export const generatedVideoQaStatuses: GeneratedVideoQaStatus[] = [
  "pending_review",
  "passed",
  "needs_fix",
  "rejected",
  "selected_for_manual_upload"
];

export const generatedVideoQaImportPlanSideEffects: GeneratedVideoQaImportSideEffects = {
  external_api_called: false,
  scraped_live_web: false,
  image_generated: false,
  video_generated: false,
  uploaded: false,
  db_written: false,
  file_uploaded: false,
  local_file_read: false,
  local_file_written: false,
  google_drive_api_called: false,
  r2_uploaded: false,
  ffmpeg_executed: false,
  moviepy_executed: false,
  upload_package_created: false,
  worker_job_created: false,
  queue_created: false
};
