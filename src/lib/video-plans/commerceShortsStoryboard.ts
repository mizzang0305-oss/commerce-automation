import type { CommerceImageAssetType } from "@/lib/image-prompts/types";
import type { CommerceVideoPlanShot } from "@/lib/video-plans/types";

type StoryboardInput = {
  productName: string;
  sourceKeyword: string;
  categoryPath: string;
};

export function buildCommerceShortsStoryboard(input: StoryboardInput): CommerceVideoPlanShot[] {
  const category = input.categoryPath || input.sourceKeyword || "daily use";
  const productName = input.productName || "candidate product";

  return [
    {
      index: 1,
      start_sec: 0,
      end_sec: 2,
      image_asset_type: "hook_thumbnail",
      visual_direction: "Open with a vertical mobile cover that leaves room for a bold Korean headline.",
      motion: "zoom_in",
      overlay_text: "Check this before buying",
      narration: `${productName} looks useful, but start with the purchase points that matter.`,
      subtitle: "Check the key points before buying."
    },
    {
      index: 2,
      start_sec: 2,
      end_sec: 5,
      image_asset_type: "benefit_scene",
      visual_direction: `Show a realistic ${category} usage scene without implying a fake personal review.`,
      motion: "pan_left",
      overlay_text: "Where it helps",
      narration: `Frame the everyday situation where ${productName} could be useful.`,
      subtitle: "Show the everyday use case."
    },
    {
      index: 3,
      start_sec: 5,
      end_sec: 8,
      image_asset_type: "main_product",
      visual_direction: "Keep the product centered with clean spacing and no fake logo or unrelated object.",
      motion: "static",
      overlay_text: "Product focus",
      narration: `Introduce ${productName} clearly and avoid exaggerated claims.`,
      subtitle: "Keep the product clear and centered."
    },
    {
      index: 4,
      start_sec: 8,
      end_sec: 11,
      image_asset_type: "comparison_card",
      visual_direction: "Use a simple before-and-after style comparison without fake numerical claims.",
      motion: "zoom_out",
      overlay_text: "Compare before choosing",
      narration: "Compare the old way and the product-assisted scene in a conservative visual card.",
      subtitle: "Compare the old way and the assisted scene."
    },
    {
      index: 5,
      start_sec: 11,
      end_sec: 14,
      image_asset_type: "benefit_scene",
      visual_direction: "Return to the usage scene and show the practical purchase reason.",
      motion: "pan_right",
      overlay_text: "Why consider it",
      narration: "Summarize the practical reason to consider the product, not a guaranteed result.",
      subtitle: "Summarize the practical reason."
    },
    {
      index: 6,
      start_sec: 14,
      end_sec: 15,
      image_asset_type: "main_product",
      visual_direction: "End on a clean product frame with CTA and affiliate disclosure reminder.",
      motion: "static",
      overlay_text: "Check link and disclosure",
      narration: "Check the product details and affiliate disclosure before purchasing.",
      subtitle: "Check details and disclosure."
    }
  ];
}

export function getRequiredImageAssetTypes(shots: CommerceVideoPlanShot[]): CommerceImageAssetType[] {
  return Array.from(new Set(shots.map((shot) => shot.image_asset_type)));
}
