import type { ImageImportAssetType, ImageQaImportSideEffects, ImageQaStatus } from "@/lib/image-qa-import/types";

export const requiredImageImportAssetTypes: ImageImportAssetType[] = [
  "main_product",
  "benefit_scene",
  "hook_thumbnail",
  "comparison_card"
];

export const imageQaStatuses: ImageQaStatus[] = ["pending_review", "passed", "needs_fix", "rejected", "selected"];

export const imageQaImportSideEffects: ImageQaImportSideEffects = {
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
  payment_triggered: false,
  message_sent: false,
  deployment_triggered: false,
  worker_job_created: false,
  queue_created: false
};
