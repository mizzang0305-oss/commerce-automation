import type { LocalImageGenerationManifest, LocalImageGenerationPackage } from "@/lib/image-generation-bridge/types";

export function buildLocalImageGenerationManifest(
  localPackage: Pick<
    LocalImageGenerationPackage,
    | "candidate_id"
    | "product_name"
    | "local_output_path_suggestion"
    | "google_drive_sync_path_suggestion"
    | "assets"
    | "side_effects"
  >
): LocalImageGenerationManifest {
  return {
    version: "1",
    candidate_id: localPackage.candidate_id,
    product_name: localPackage.product_name,
    local_output_path_suggestion: localPackage.local_output_path_suggestion,
    google_drive_sync_path_suggestion: localPackage.google_drive_sync_path_suggestion,
    assets: localPackage.assets.map((asset) => ({
      asset_type: asset.asset_type,
      suggested_filename: asset.suggested_filename,
      prompt: asset.prompt,
      negative_prompt: asset.negative_prompt,
      usage_targets: asset.usage_targets,
      recommended_aspect_ratio: asset.recommended_aspect_ratio
    })),
    side_effects: { ...localPackage.side_effects },
    approval_required: true
  };
}
