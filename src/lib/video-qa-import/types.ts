export type GeneratedVideoQaStatus =
  | "pending_review"
  | "passed"
  | "needs_fix"
  | "rejected"
  | "selected_for_manual_upload";

export type GeneratedVideoSource = "local_path" | "google_drive_sync_path" | "manual_manifest";

export type GeneratedVideoFormat = "shorts_9_16" | "unknown";

export type GeneratedVideoQaImportSideEffects = {
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
  worker_job_created: false;
  queue_created: false;
};

export type GeneratedVideoManifestAsset = {
  provided_filename: string;
  provided_path: string;
  source: GeneratedVideoSource;
  duration_sec: number | null;
  format: GeneratedVideoFormat;
  qa_status: GeneratedVideoQaStatus;
  qa_notes: string[];
};

export type GeneratedVideoManifest = {
  candidate_id: string;
  videos: GeneratedVideoManifestAsset[];
};

export interface GeneratedVideoAssetCandidate extends GeneratedVideoManifestAsset {
  id: string;
  candidate_id: string;
  qa_checklist: string[];
  safety_flags: string[];
}

export interface GeneratedVideoQaImportPlan {
  id: string;
  candidate_id: string;
  mode: "generated_video_qa_import_bridge";
  package_type: "manual_video_qa_import_plan";
  videos: GeneratedVideoAssetCandidate[];
  ready_for_manual_upload_package: boolean;
  missing_requirements: string[];
  qa_markdown: string;
  import_manifest_json: string;
  next_step_after_qa: string[];
  side_effects: GeneratedVideoQaImportSideEffects;
  approval_required: true;
  created_at: string;
}

export type GeneratedVideoManifestValidationResult =
  | {
      ok: true;
      manifest: GeneratedVideoManifest;
      errors: [];
      warnings: string[];
      side_effects: GeneratedVideoQaImportSideEffects;
      approval_required: true;
    }
  | {
      ok: false;
      manifest: null;
      errors: string[];
      warnings: string[];
      side_effects: GeneratedVideoQaImportSideEffects;
      approval_required: true;
    };
