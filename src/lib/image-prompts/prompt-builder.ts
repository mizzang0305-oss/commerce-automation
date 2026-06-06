import type { ProductCandidate } from "@/types/automation";
import { buildCommerceImageNegativePrompt, getCommerceImageRiskFlags, getCommerceImageSafetyNotes } from "@/lib/image-prompts/safety";
import { commerceImagePromptTemplates } from "@/lib/image-prompts/templates";
import type { CommerceImagePromptPlan, CommerceImagePromptPlanSideEffects } from "@/lib/image-prompts/types";

export const commerceImagePlanSideEffects: CommerceImagePromptPlanSideEffects = {
  image_generated: false,
  video_generated: false,
  uploaded: false,
  worker_job_created: false,
  queue_created: false
};

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getSourceKeyword(candidate: ProductCandidate) {
  return readString(candidate.payload.keyword) || readString(candidate.payload.source_keyword) || candidate.product_name;
}

function getCategoryPath(candidate: ProductCandidate) {
  return readString(candidate.payload.category_path) || candidate.category || "";
}

function buildPrompt(candidate: ProductCandidate, templateInstruction: string) {
  const productName = candidate.product_name || "상품명 미정";
  const keyword = getSourceKeyword(candidate);
  const category = getCategoryPath(candidate);

  return [
    templateInstruction,
    `product name: ${productName}`,
    `commerce keyword: ${keyword}`,
    category ? `category: ${category}` : "",
    "Korean commerce visual planning, copy-only prompt, no image generation executed"
  ].filter(Boolean).join(". ");
}

export function buildCommerceImagePromptPlan(
  candidate: ProductCandidate,
  options: { now?: string } = {}
): CommerceImagePromptPlan {
  const riskFlags = getCommerceImageRiskFlags(candidate);
  const createdAt = options.now ?? new Date().toISOString();

  return {
    candidate_id: candidate.id,
    product_name: candidate.product_name,
    source_keyword: getSourceKeyword(candidate),
    category_path: getCategoryPath(candidate),
    risk_flags: riskFlags,
    image_assets: commerceImagePromptTemplates.map((template) => {
      const conservative = template.type === "hook_thumbnail" || template.type === "comparison_card";
      return {
        id: `${candidate.id}-${template.type}`,
        type: template.type,
        purpose: template.purpose,
        prompt: buildPrompt(candidate, template.instruction),
        negative_prompt: buildCommerceImageNegativePrompt(candidate, { conservative }),
        recommended_aspect_ratio: template.recommended_aspect_ratio,
        usage_targets: template.usage_targets,
        safety_notes: getCommerceImageSafetyNotes(candidate, { conservative }),
        copy_label: template.copy_label
      };
    }),
    side_effects: { ...commerceImagePlanSideEffects },
    created_at: createdAt
  };
}
