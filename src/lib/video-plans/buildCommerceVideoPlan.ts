import type { CommerceImagePromptPlan } from "@/lib/image-prompts/types";
import { buildCommerceShortsStoryboard, getRequiredImageAssetTypes } from "@/lib/video-plans/commerceShortsStoryboard";
import { commercePlanApprovalRequired, coupangPartnersDisclosureReminder } from "@/lib/video-plans/disclosure";
import type { CommerceImageVideoPlan, CommerceVideoPlan, CommerceVideoPlanSideEffects } from "@/lib/video-plans/types";

export const commerceVideoPlanSideEffects: CommerceVideoPlanSideEffects = {
  scraped_live_web: false,
  external_api_called: false,
  image_generated: false,
  video_generated: false,
  uploaded: false,
  db_written: false,
  file_uploaded: false,
  payment_triggered: false,
  message_sent: false,
  deployment_triggered: false,
  worker_job_created: false,
  queue_created: false
};

export function buildCommerceVideoPlan(
  imagePlan: CommerceImagePromptPlan,
  options: { now?: string } = {}
): CommerceVideoPlan {
  const createdAt = options.now ?? new Date().toISOString();
  const shots = buildCommerceShortsStoryboard({
    productName: imagePlan.product_name,
    sourceKeyword: imagePlan.source_keyword,
    categoryPath: imagePlan.category_path
  });
  const subtitleLines = shots.map((shot) => `${shot.start_sec}-${shot.end_sec}s: ${shot.subtitle}`);

  return {
    id: `${imagePlan.candidate_id}-video-plan-15s`,
    product_candidate_id: imagePlan.candidate_id,
    duration_sec: 15,
    format: "shorts_9_16",
    storyboard_title: `${imagePlan.product_name} 15-second storyboard`,
    hook: shots[0]?.overlay_text ?? "Check this before buying",
    shot_list: shots,
    narration_script: shots.map((shot) => shot.narration).join(" "),
    subtitle_lines: subtitleLines,
    cta: "Review the Coupang product page, price, shipping, and affiliate disclosure before purchasing.",
    affiliate_disclosure_reminder: coupangPartnersDisclosureReminder,
    bgm_direction: "Light, steady commerce background music. Avoid urgent or manipulative tone.",
    sfx_direction: ["soft transition", "subtle card pop", "no alarm or fake notification sound"],
    required_image_assets: getRequiredImageAssetTypes(shots),
    safety_notes: [
      ...imagePlan.risk_flags,
      "Plan-only output. Do not present generated scenes as real personal usage.",
      "No treatment, guaranteed effect, best-price, fake review, or fabricated discount claim.",
      "Coupang Partners disclosure reminder must be kept in the manual upload package."
    ],
    side_effects: { ...commerceVideoPlanSideEffects },
    approval_required: commercePlanApprovalRequired,
    created_at: createdAt
  };
}

export function buildCommerceImageVideoPlan(
  imagePlan: CommerceImagePromptPlan,
  options: { now?: string } = {}
): CommerceImageVideoPlan {
  const createdAt = options.now ?? new Date().toISOString();
  const videoPlan = buildCommerceVideoPlan(imagePlan, { now: createdAt });

  return {
    candidate_id: imagePlan.candidate_id,
    image_asset_plans: imagePlan.image_assets,
    image_plan: imagePlan,
    video_plan: videoPlan,
    side_effects: { ...commerceVideoPlanSideEffects },
    approval_required: commercePlanApprovalRequired,
    created_at: createdAt
  };
}
