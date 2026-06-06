import type { CommerceImageAssetType, CommerceImagePromptPlan, CommerceImagePromptPlanItem } from "@/lib/image-prompts/types";
import type { CommerceImageVideoPlan } from "@/lib/video-plans/types";

export type LocalImageGenerationPackageSideEffects = {
  scraped_live_web: false;
  external_api_called: false;
  image_generated: false;
  video_generated: false;
  uploaded: false;
  db_written: false;
  file_uploaded: false;
  payment_triggered: false;
  message_sent: false;
  deployment_triggered: false;
  worker_job_created: false;
  queue_created: false;
  local_file_written: false;
  google_drive_api_called: false;
};

export type LocalImageGenerationPackageAsset = {
  id: string;
  asset_type: CommerceImageAssetType;
  purpose: string;
  prompt: string;
  negative_prompt: string;
  suggested_filename: string;
  local_output_path_suggestion: string;
  google_drive_sync_path_suggestion: string;
  usage_targets: CommerceImagePromptPlanItem["usage_targets"];
  recommended_aspect_ratio: CommerceImagePromptPlanItem["recommended_aspect_ratio"];
  safety_notes: string[];
  qa_checklist: string[];
};

export type LocalImageGenerationManifest = {
  version: "1";
  candidate_id: string;
  product_name: string;
  local_output_path_suggestion: string;
  google_drive_sync_path_suggestion: string;
  assets: Array<{
    asset_type: CommerceImageAssetType;
    suggested_filename: string;
    prompt: string;
    negative_prompt: string;
    usage_targets: CommerceImagePromptPlanItem["usage_targets"];
    recommended_aspect_ratio: CommerceImagePromptPlanItem["recommended_aspect_ratio"];
  }>;
  side_effects: LocalImageGenerationPackageSideEffects;
  approval_required: true;
};

export type LocalImageGenerationPackage = {
  id: string;
  candidate_id: string;
  product_name: string;
  source_keyword: string;
  category_path: string;
  local_output_path_suggestion: string;
  google_drive_sync_path_suggestion: string;
  assets: LocalImageGenerationPackageAsset[];
  manifest: LocalImageGenerationManifest;
  prompt_markdown: string;
  qa_checklist: string[];
  manual_generation_steps: string[];
  future_import_instruction: string;
  image_prompt_plan: CommerceImagePromptPlan;
  image_video_plan: CommerceImageVideoPlan;
  side_effects: LocalImageGenerationPackageSideEffects;
  approval_required: true;
  created_at: string;
};
