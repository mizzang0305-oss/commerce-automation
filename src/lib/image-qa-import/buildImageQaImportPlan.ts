import type { LocalImageGenerationPackage } from "@/lib/image-generation-bridge/types";
import { imageQaImportSideEffects } from "@/lib/image-qa-import/constants";
import { buildSelectedImageAssetPlan } from "@/lib/image-qa-import/selectedImageAssets";
import type {
  GeneratedImageAssetCandidate,
  ImageImportManifest,
  ImageQaImportPlan,
  ImageQaStatus
} from "@/lib/image-qa-import/types";
import type { ProductCandidate } from "@/types/automation";
export { imageQaImportSideEffects };

const baseQaChecklist = [
  "Product identity is visually consistent with the original candidate information.",
  "No fake review, guaranteed effect, best-price, fabricated discount, or medical efficacy claim.",
  "No unauthorized logo, unrelated object, or materially altered product function.",
  "Mobile readability is acceptable for short-form video and thumbnail usage.",
  "Manual approval is required before any image import, upload, slideshow, or video package step."
];

const nextStepAfterQa = [
  "Select passed images for the next plan-only slideshow package PR.",
  "Keep rejected or needs_fix assets out of future slideshow planning.",
  "Do not upload files, read local files, call Google Drive APIs, or write database rows in this bridge."
];

function buildSource(providedPath: string): GeneratedImageAssetCandidate["source"] {
  return /google drive|g:\/|g:\\|my drive/i.test(providedPath) ? "google_drive_sync_path" : "manual_manifest";
}

function buildQaMarkdown(plan: Omit<ImageQaImportPlan, "qa_markdown">) {
  const lines = [
    `# Image QA Import Plan: ${plan.candidate_id}`,
    "",
    "- mode: image_qa_import_bridge",
    "- package_type: manual_image_import_plan",
    "- approval_required: true",
    "- side_effects: external_api_called=false, image_generated=false, video_generated=false, uploaded=false, db_written=false, local_file_read=false, local_file_written=false, google_drive_api_called=false, r2_uploaded=false, worker_job_created=false, queue_created=false",
    "",
    "## Assets"
  ];

  for (const asset of plan.assets) {
    lines.push(
      "",
      `### ${asset.asset_type}`,
      `- expected_filename: ${asset.expected_filename}`,
      `- provided_filename: ${asset.provided_filename || "(not provided)"}`,
      `- provided_path: ${asset.provided_path || "(not provided)"}`,
      `- qa_status: ${asset.qa_status}`,
      `- source: ${asset.source}`,
      "- checklist:",
      ...asset.qa_checklist.map((item) => `  - ${item}`)
    );
  }

  lines.push(
    "",
    "## Selected Image Asset Plan",
    `- ready_for_slideshow_plan: ${String(plan.selected_image_asset_plan.ready_for_slideshow_plan)}`,
    `- missing_required_asset_types: ${plan.selected_image_asset_plan.missing_required_asset_types.join(", ") || "none"}`,
    `- next_step: ${plan.selected_image_asset_plan.next_step}`,
    "",
    "## Next Step After QA",
    ...plan.next_step_after_qa.map((step) => `- ${step}`)
  );

  return lines.join("\n");
}

export function buildImageQaImportPlan(
  candidate: ProductCandidate,
  localPackage: LocalImageGenerationPackage,
  importManifest?: ImageImportManifest,
  options: { now?: string } = {}
): ImageQaImportPlan {
  const createdAt = options.now ?? new Date().toISOString();
  const manifestByAssetType = new Map(importManifest?.assets.map((asset) => [asset.asset_type, asset]) ?? []);
  const assets: GeneratedImageAssetCandidate[] = localPackage.assets.map((expectedAsset) => {
    const providedAsset = manifestByAssetType.get(expectedAsset.asset_type);
    const qaStatus: ImageQaStatus = providedAsset?.qa_status ?? "pending_review";
    const providedPath = providedAsset?.provided_path ?? "";
    return {
      id: `${candidate.id}-${expectedAsset.asset_type}-qa-import-candidate`,
      candidate_id: candidate.id,
      asset_type: expectedAsset.asset_type,
      expected_filename: expectedAsset.suggested_filename,
      provided_filename: providedAsset?.provided_filename ?? "",
      provided_path: providedPath,
      source: providedPath ? buildSource(providedPath) : "manual_manifest",
      qa_status: qaStatus,
      qa_notes: providedAsset
        ? ["Manifest value accepted as text only. File existence was not checked."]
        : ["No provided file path yet. Paste a manual manifest after image QA."],
      qa_checklist: [...baseQaChecklist, ...expectedAsset.safety_notes.slice(0, 3)],
      safety_flags: expectedAsset.safety_notes
    };
  });

  const selectedImageAssetPlan = buildSelectedImageAssetPlan(candidate.id, assets);
  const importManifestJson = JSON.stringify(
    {
      candidate_id: candidate.id,
      assets: assets.map((asset) => ({
        asset_type: asset.asset_type,
        provided_filename: asset.provided_filename || asset.expected_filename,
        provided_path: asset.provided_path,
        qa_status: asset.qa_status
      }))
    },
    null,
    2
  );

  const planWithoutMarkdown = {
    id: `${candidate.id}-image-qa-import-plan`,
    candidate_id: candidate.id,
    mode: "image_qa_import_bridge" as const,
    package_type: "manual_image_import_plan" as const,
    assets,
    selected_image_asset_plan: selectedImageAssetPlan,
    import_manifest_json: importManifestJson,
    next_step_after_qa: nextStepAfterQa,
    side_effects: { ...imageQaImportSideEffects },
    approval_required: true as const,
    created_at: createdAt
  };

  return {
    ...planWithoutMarkdown,
    qa_markdown: buildQaMarkdown(planWithoutMarkdown)
  };
}
