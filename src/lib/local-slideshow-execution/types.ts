import type { LocalSlideshowRenderPackage } from "@/lib/local-slideshow-render";

export type LocalSlideshowRenderEngine = "ffmpeg" | "moviepy";
export type LocalSlideshowRenderEnginePreference = "auto" | LocalSlideshowRenderEngine;

export type LocalSlideshowExecutionSideEffects = {
  external_api_called: false;
  db_written: false;
  file_uploaded: false;
  payment_triggered: false;
  message_sent: false;
  deployment_triggered: false;
  local_file_read: boolean;
  local_file_written: boolean;
  video_generated: boolean;
  ffmpeg_executed: boolean;
  moviepy_executed: boolean;
  uploaded: false;
  upload_package_created: false;
  worker_job_created: false;
  queue_created: false;
  r2_uploaded: false;
};

export interface LocalSlideshowExecutionResult {
  id: string;
  candidate_id: string;
  mode: "local_slideshow_render_execution";
  confirmation_required: "APPROVE_LOCAL_SLIDESHOW_RENDER_EXECUTION";
  confirmation_matched: boolean;
  render_engine: LocalSlideshowRenderEngine;
  execution_attempted: boolean;
  execution_succeeded: boolean;
  output_video_path: string | null;
  output_manifest_path: string | null;
  output_report_path: string | null;
  logs_preview: string[];
  warnings: string[];
  side_effects: LocalSlideshowExecutionSideEffects;
  approval_required: true;
}

export interface LocalSlideshowExecutionRequest {
  candidateId: string;
  renderPackage: LocalSlideshowRenderPackage;
  enginePreference?: LocalSlideshowRenderEnginePreference;
  inputImagePaths?: string[];
}
