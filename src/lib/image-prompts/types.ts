import type { ProductCandidate } from "@/types/automation";

export type CommerceImageAssetType =
  | "main_product"
  | "benefit_scene"
  | "hook_thumbnail"
  | "comparison_card";

export type CommerceImageAspectRatio = "1:1" | "4:5" | "9:16" | "16:9";

export type CommerceImageUsageTarget =
  | "shorts"
  | "thumbnail"
  | "blog"
  | "sns_card"
  | "upload_package";

export type CommerceImagePromptPlanItem = {
  id: string;
  type: CommerceImageAssetType;
  purpose: string;
  prompt: string;
  negative_prompt: string;
  recommended_aspect_ratio: CommerceImageAspectRatio;
  usage_targets: CommerceImageUsageTarget[];
  safety_notes: string[];
  copy_label: string;
};

export type CommerceImagePromptPlanSideEffects = {
  image_generated: false;
  video_generated: false;
  uploaded: false;
  worker_job_created: false;
  queue_created: false;
};

export type CommerceImagePromptPlan = {
  candidate_id: string;
  product_name: string;
  source_keyword: string;
  category_path: string;
  risk_flags: string[];
  image_assets: CommerceImagePromptPlanItem[];
  side_effects: CommerceImagePromptPlanSideEffects;
  created_at: string;
};

export type CommerceImagePromptPlanInput = ProductCandidate;
