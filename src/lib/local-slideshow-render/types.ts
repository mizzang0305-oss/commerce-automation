import type { SlideshowPackagePlan } from "@/lib/slideshow-package";

export type LocalSlideshowRenderSideEffects = {
  ffmpeg_executed: false;
  moviepy_executed: false;
  local_file_read: false;
  local_file_written: false;
  image_generated: false;
  video_generated: false;
  upload_package_created: false;
  uploaded: false;
  db_written: false;
  worker_job_created: false;
  queue_created: false;
  external_api_called: false;
  deployment_triggered: false;
};

export interface LocalSlideshowRenderPackage {
  id: string;
  candidate_id: string;
  mode: "local_slideshow_render_bridge";
  package_type: "manual_local_render_package";
  confirmation_required: "PREPARE_LOCAL_SLIDESHOW_RENDER_PACKAGE";
  confirmation_matched: boolean;
  execution_enabled: false;
  slideshow_package_plan: SlideshowPackagePlan;
  ffmpeg_command_preview: string;
  moviepy_script_preview: string;
  powershell_steps_markdown: string;
  input_assets_checklist: string[];
  output_paths: string[];
  manual_execution_checklist: string[];
  side_effects: LocalSlideshowRenderSideEffects;
  approval_required: true;
  created_at: string;
}
