import type { CommerceImageAssetType, CommerceImageAspectRatio, CommerceImageUsageTarget } from "@/lib/image-prompts/types";

export type CommerceImagePromptTemplate = {
  type: CommerceImageAssetType;
  purpose: string;
  recommended_aspect_ratio: CommerceImageAspectRatio;
  usage_targets: CommerceImageUsageTarget[];
  copy_label: string;
  instruction: string;
};

export const commerceImagePromptTemplates: CommerceImagePromptTemplate[] = [
  {
    type: "main_product",
    purpose: "상품 중심 대표 이미지",
    recommended_aspect_ratio: "1:1",
    usage_targets: ["blog", "sns_card", "upload_package"],
    copy_label: "Copy main product prompt",
    instruction:
      "clean e-commerce product image, centered product composition, simple background, mobile-friendly clarity, accurate product appearance, no exaggerated claims, no fake brand logo, no unrelated objects"
  },
  {
    type: "benefit_scene",
    purpose: "사용 장면과 구매 이유를 보여주는 이미지",
    recommended_aspect_ratio: "4:5",
    usage_targets: ["blog", "sns_card", "shorts"],
    copy_label: "Copy benefit scene prompt",
    instruction:
      "realistic usage scene, problem-solution framing, natural home or lifestyle setting, product benefit visually clear, calm commercial photography, practical use context without pretending to be a customer review"
  },
  {
    type: "hook_thumbnail",
    purpose: "쇼츠 첫 화면과 커버 이미지",
    recommended_aspect_ratio: "9:16",
    usage_targets: ["shorts", "thumbnail"],
    copy_label: "Copy hook thumbnail prompt",
    instruction:
      "vertical 9:16 mobile thumbnail, strong visual hook, bold Korean headline area with empty safe space, clear product focus, high contrast, readable composition, no guaranteed results, no fake testimonial"
  },
  {
    type: "comparison_card",
    purpose: "기존 방식과 상품 사용 장면의 비교 카드",
    recommended_aspect_ratio: "16:9",
    usage_targets: ["blog", "sns_card", "upload_package"],
    copy_label: "Copy comparison card prompt",
    instruction:
      "before and after comparison card, split layout, clear visual contrast, simple Korean labels, convenience-focused framing, no fake numerical claim, no guaranteed improvement, no fabricated review quote"
  }
];
