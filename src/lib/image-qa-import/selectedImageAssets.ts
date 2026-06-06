import { requiredImageImportAssetTypes } from "@/lib/image-qa-import/constants";
import type { GeneratedImageAssetCandidate, SelectedImageAssetPlan } from "@/lib/image-qa-import/types";

function isUsableForSelection(asset: GeneratedImageAssetCandidate) {
  return asset.qa_status === "passed" || asset.qa_status === "selected";
}

export function buildSelectedImageAssetPlan(
  candidateId: string,
  assets: GeneratedImageAssetCandidate[]
): SelectedImageAssetPlan {
  const selectedAssets = assets.filter(isUsableForSelection);
  const usableTypes = new Set(selectedAssets.map((asset) => asset.asset_type));
  const missingRequiredTypes = requiredImageImportAssetTypes.filter((assetType) => !usableTypes.has(assetType));
  const rejectedTypes = new Set(
    assets.filter((asset) => asset.qa_status === "rejected").map((asset) => asset.asset_type)
  );
  const readyForSlideshowPlan =
    usableTypes.has("main_product") &&
    usableTypes.has("hook_thumbnail") &&
    selectedAssets.length >= 3 &&
    !Array.from(rejectedTypes).some((assetType) => usableTypes.has(assetType));

  return {
    id: `${candidateId}-selected-image-assets`,
    candidate_id: candidateId,
    selected_assets: selectedAssets,
    required_asset_types: [...requiredImageImportAssetTypes],
    missing_required_asset_types: missingRequiredTypes,
    ready_for_slideshow_plan: readyForSlideshowPlan,
    next_step: readyForSlideshowPlan ? "slideshow_package_plan" : "manual_review"
  };
}
