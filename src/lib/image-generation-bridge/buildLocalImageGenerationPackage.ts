import { buildGoogleDriveSyncPath, buildLocalImageAssetFilename, buildLocalImageOutputPath } from "@/lib/image-generation-bridge/filename";
import { buildLocalImageGenerationManifest } from "@/lib/image-generation-bridge/manifest";
import type { LocalImageGenerationPackage, LocalImageGenerationPackageSideEffects } from "@/lib/image-generation-bridge/types";
import { buildCommerceImagePromptPlan } from "@/lib/image-prompts/prompt-builder";
import { buildCommerceImageVideoPlan } from "@/lib/video-plans/buildCommerceVideoPlan";
import type { ProductCandidate } from "@/types/automation";

export const localImageGenerationPackageSideEffects: LocalImageGenerationPackageSideEffects = {
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
  queue_created: false,
  local_file_written: false,
  google_drive_api_called: false
};

const baseQaChecklist = [
  "Generated image matches the product category and does not change the product identity.",
  "No fake review, guaranteed effect, best-price, or fabricated discount claim.",
  "No fake logo, unauthorized brand mark, or unrelated object is introduced.",
  "Image is readable on a mobile screen and leaves room for Korean overlay text when needed.",
  "Asset is not imported into commerce-automation until a separate image QA/import PR is approved."
];

const manualGenerationSteps = [
  "Copy one prompt into an approved local image generation tool.",
  "Use the suggested filename exactly when saving the manually generated image.",
  "Save output under the suggested local folder or a synced Google Drive folder controlled outside this app.",
  "Run manual visual QA against the checklist before selecting any image for future import.",
  "Do not call image APIs, upload files, write DB rows, or create worker jobs from this package."
];

function buildPromptMarkdown(localPackage: Omit<LocalImageGenerationPackage, "manifest" | "prompt_markdown">) {
  const lines = [
    `# Local Image Generation Package: ${localPackage.product_name}`,
    "",
    `- candidate_id: ${localPackage.candidate_id}`,
    `- local_output_path_suggestion: ${localPackage.local_output_path_suggestion}`,
    `- google_drive_sync_path_suggestion: ${localPackage.google_drive_sync_path_suggestion}`,
    "- approval_required: true",
    "- side_effects: image_generated=false, video_generated=false, uploaded=false, db_written=false, local_file_written=false, google_drive_api_called=false",
    "",
    "## Manual Steps",
    ...manualGenerationSteps.map((step) => `- ${step}`),
    "",
    "## Assets"
  ];

  for (const asset of localPackage.assets) {
    lines.push(
      "",
      `### ${asset.asset_type}`,
      `- suggested_filename: ${asset.suggested_filename}`,
      `- purpose: ${asset.purpose}`,
      `- aspect_ratio: ${asset.recommended_aspect_ratio}`,
      `- local_output_path_suggestion: ${asset.local_output_path_suggestion}`,
      `- google_drive_sync_path_suggestion: ${asset.google_drive_sync_path_suggestion}`,
      "",
      "Prompt:",
      asset.prompt,
      "",
      "Negative prompt:",
      asset.negative_prompt,
      "",
      "QA checklist:",
      ...asset.qa_checklist.map((item) => `- ${item}`)
    );
  }

  return lines.join("\n");
}

export function buildLocalImageGenerationPackage(
  candidate: ProductCandidate,
  options: { now?: string } = {}
): LocalImageGenerationPackage {
  const createdAt = options.now ?? new Date().toISOString();
  const imagePromptPlan = buildCommerceImagePromptPlan(candidate, { now: createdAt });
  const imageVideoPlan = buildCommerceImageVideoPlan(imagePromptPlan, { now: createdAt });
  const localOutputPath = buildLocalImageOutputPath(candidate.id);
  const googleDriveSyncPath = buildGoogleDriveSyncPath(candidate.id);

  const assets = imagePromptPlan.image_assets.map((asset) => ({
    id: `${candidate.id}-${asset.type}-local-image`,
    asset_type: asset.type,
    purpose: asset.purpose,
    prompt: asset.prompt,
    negative_prompt: asset.negative_prompt,
    suggested_filename: buildLocalImageAssetFilename(candidate.id, asset.type),
    local_output_path_suggestion: localOutputPath,
    google_drive_sync_path_suggestion: googleDriveSyncPath,
    usage_targets: asset.usage_targets,
    recommended_aspect_ratio: asset.recommended_aspect_ratio,
    safety_notes: asset.safety_notes,
    qa_checklist: [...baseQaChecklist, ...asset.safety_notes.slice(0, 3)]
  }));

  const packageWithoutGeneratedFields = {
    id: `${candidate.id}-local-image-generation-package`,
    candidate_id: candidate.id,
    product_name: imagePromptPlan.product_name,
    source_keyword: imagePromptPlan.source_keyword,
    category_path: imagePromptPlan.category_path,
    local_output_path_suggestion: localOutputPath,
    google_drive_sync_path_suggestion: googleDriveSyncPath,
    assets,
    qa_checklist: baseQaChecklist,
    manual_generation_steps: manualGenerationSteps,
    future_import_instruction: "Do not import generated files until a separate image QA/import PR is approved.",
    image_prompt_plan: imagePromptPlan,
    image_video_plan: imageVideoPlan,
    side_effects: { ...localImageGenerationPackageSideEffects },
    approval_required: true as const,
    created_at: createdAt
  };

  const manifest = buildLocalImageGenerationManifest(packageWithoutGeneratedFields);
  const promptMarkdown = buildPromptMarkdown(packageWithoutGeneratedFields);

  return {
    ...packageWithoutGeneratedFields,
    manifest,
    prompt_markdown: promptMarkdown
  };
}
