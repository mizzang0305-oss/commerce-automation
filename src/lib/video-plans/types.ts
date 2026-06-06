import type { CommerceImageAssetType, CommerceImagePromptPlan } from "@/lib/image-prompts/types";

export type CommerceVideoPlanSideEffects = {
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
};

export type CommerceVideoPlanShot = {
  index: number;
  start_sec: number;
  end_sec: number;
  image_asset_type: CommerceImageAssetType;
  visual_direction: string;
  motion: "zoom_in" | "zoom_out" | "pan_left" | "pan_right" | "static";
  overlay_text: string;
  narration: string;
  subtitle: string;
};

export type CommerceVideoPlan = {
  id: string;
  product_candidate_id: string;
  duration_sec: 15;
  format: "shorts_9_16";
  storyboard_title: string;
  hook: string;
  shot_list: CommerceVideoPlanShot[];
  narration_script: string;
  subtitle_lines: string[];
  cta: string;
  affiliate_disclosure_reminder: string;
  bgm_direction: string;
  sfx_direction: string[];
  required_image_assets: CommerceImageAssetType[];
  safety_notes: string[];
  side_effects: CommerceVideoPlanSideEffects;
  approval_required: true;
  created_at: string;
};

export type CommerceImageVideoPlan = {
  candidate_id: string;
  image_asset_plans: CommerceImagePromptPlan["image_assets"];
  image_plan: CommerceImagePromptPlan;
  video_plan: CommerceVideoPlan;
  side_effects: CommerceVideoPlanSideEffects;
  approval_required: true;
  created_at: string;
};
