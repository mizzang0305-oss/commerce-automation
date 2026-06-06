import type { CommerceImageAssetType } from "@/lib/image-prompts/types";

export type ImageImportAssetType = CommerceImageAssetType;

export type ImageQaStatus = "pending_review" | "passed" | "needs_fix" | "rejected" | "selected";

export type ImageQaImportSideEffects = {
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
  payment_triggered: false;
  message_sent: false;
  deployment_triggered: false;
  worker_job_created: false;
  queue_created: false;
};

export type ImageImportManifestAsset = {
  asset_type: ImageImportAssetType;
  provided_filename: string;
  provided_path: string;
  qa_status: ImageQaStatus;
};

export type ImageImportManifest = {
  candidate_id: string;
  assets: ImageImportManifestAsset[];
};

export type GeneratedImageAssetCandidate = {
  id: string;
  candidate_id: string;
  asset_type: ImageImportAssetType;
  expected_filename: string;
  provided_filename: string;
  provided_path: string;
  source: "local_path" | "google_drive_sync_path" | "manual_manifest";
  qa_status: ImageQaStatus;
  qa_notes: string[];
  qa_checklist: string[];
  safety_flags: string[];
};

export type SelectedImageAssetPlan = {
  id: string;
  candidate_id: string;
  selected_assets: GeneratedImageAssetCandidate[];
  required_asset_types: ImageImportAssetType[];
  missing_required_asset_types: ImageImportAssetType[];
  ready_for_slideshow_plan: boolean;
  next_step: "manual_review" | "slideshow_package_plan";
};

export type ImageQaImportPlan = {
  id: string;
  candidate_id: string;
  mode: "image_qa_import_bridge";
  package_type: "manual_image_import_plan";
  assets: GeneratedImageAssetCandidate[];
  selected_image_asset_plan: SelectedImageAssetPlan;
  import_manifest_json: string;
  qa_markdown: string;
  next_step_after_qa: string[];
  side_effects: ImageQaImportSideEffects;
  approval_required: true;
  created_at: string;
};

export type ImageImportManifestValidationResult =
  | {
      ok: true;
      manifest: ImageImportManifest;
      errors: [];
      warnings: string[];
      side_effects: ImageQaImportSideEffects;
      approval_required: true;
    }
  | {
      ok: false;
      manifest: null;
      errors: string[];
      warnings: string[];
      side_effects: ImageQaImportSideEffects;
      approval_required: true;
    };
