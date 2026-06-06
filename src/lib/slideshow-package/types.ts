import type { ImageImportAssetType, SelectedImageAssetPlan } from "@/lib/image-qa-import/types";

export type SlideshowFormat = "shorts_9_16";

export type SlideshowMotion = "zoom_in" | "zoom_out" | "pan_left" | "pan_right" | "static";

export type SlideshowPackagePlanSideEffects = {
  external_api_called: false;
  scraped_live_web: false;
  image_generated: false;
  video_generated: false;
  uploaded: false;
  db_written: false;
  file_uploaded: false;
  local_file_read: false;
  local_file_written: false;
  google_drive_api_called: false;
  r2_uploaded: false;
  ffmpeg_executed: false;
  moviepy_executed: false;
  upload_package_created: false;
  payment_triggered: false;
  message_sent: false;
  deployment_triggered: false;
  worker_job_created: false;
  queue_created: false;
};

export interface SlideshowTimelineItem {
  index: number;
  start_sec: number;
  end_sec: number;
  duration_sec: number;
  asset_id: string;
  asset_type: ImageImportAssetType;
  image_path_reference: string;
  motion: SlideshowMotion;
  overlay_text: string;
  narration: string;
  subtitle: string;
  safety_notes: string[];
}

export interface SlideshowRenderCommandPreview {
  ffmpeg_command_preview: string;
  moviepy_script_preview: string;
  command_execution_allowed: false;
  requires_manual_approval: true;
}

export interface SlideshowPackagePlan {
  id: string;
  candidate_id: string;
  mode: "selected_image_slideshow_package_plan";
  package_type: "manual_slideshow_plan";
  format: SlideshowFormat;
  duration_sec: 15;
  ready_for_slideshow_plan: boolean;
  selected_image_asset_plan: SelectedImageAssetPlan;
  timeline: SlideshowTimelineItem[];
  image_sequence: string[];
  narration_script: string;
  subtitle_lines: string[];
  timeline_markdown: string;
  cta: string;
  affiliate_disclosure_reminder: string;
  bgm_direction: string;
  sfx_direction: string[];
  ffmpeg_preview: SlideshowRenderCommandPreview;
  moviepy_preview: SlideshowRenderCommandPreview;
  output_filename_suggestion: string;
  output_folder_suggestion: string;
  upload_package_folder_suggestion: string;
  manual_render_checklist: string[];
  next_step_after_plan: string[];
  side_effects: SlideshowPackagePlanSideEffects;
  approval_required: true;
  created_at: string;
}
