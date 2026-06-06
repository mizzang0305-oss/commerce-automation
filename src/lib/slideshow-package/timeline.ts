import type { GeneratedImageAssetCandidate, ImageImportAssetType } from "@/lib/image-qa-import/types";
import type { SlideshowMotion, SlideshowTimelineItem } from "@/lib/slideshow-package/types";
import type { ProductCandidate } from "@/types/automation";

const shotTemplate: Array<{
  asset_type: ImageImportAssetType;
  start_sec: number;
  end_sec: number;
  motion: SlideshowMotion;
  overlay_text: string;
}> = [
  { asset_type: "hook_thumbnail", start_sec: 0, end_sec: 2, motion: "zoom_in", overlay_text: "구매 전 확인할 포인트" },
  { asset_type: "benefit_scene", start_sec: 2, end_sec: 5, motion: "pan_right", overlay_text: "어디에 도움이 될까?" },
  { asset_type: "main_product", start_sec: 5, end_sec: 8, motion: "static", overlay_text: "상품 핵심 확인" },
  { asset_type: "comparison_card", start_sec: 8, end_sec: 11, motion: "pan_left", overlay_text: "비교해서 보기" },
  { asset_type: "benefit_scene", start_sec: 11, end_sec: 14, motion: "zoom_out", overlay_text: "사용 전 체크" },
  { asset_type: "main_product", start_sec: 14, end_sec: 15, motion: "static", overlay_text: "링크와 고지 확인" }
];

function assetByType(assets: GeneratedImageAssetCandidate[], assetType: ImageImportAssetType) {
  return assets.find((asset) => asset.asset_type === assetType) ?? assets[0];
}

function productName(candidate: ProductCandidate) {
  return candidate.product_name?.trim() || "상품";
}

function buildNarration(candidate: ProductCandidate, assetType: ImageImportAssetType, overlayText: string) {
  const name = productName(candidate);
  if (assetType === "hook_thumbnail") {
    return `${name}을 보기 전에 실제 사용 목적과 구성 포인트를 먼저 확인하세요.`;
  }
  if (assetType === "comparison_card") {
    return "장점만 보지 말고 기존 방식과 비교해서 필요한지 판단하는 것이 좋습니다.";
  }
  if (assetType === "main_product") {
    return `${name}의 형태, 구성, 구매 전 확인할 항목을 차분히 살펴봅니다.`;
  }
  return `${overlayText} 실제 생활 장면에서 어떤 상황에 맞는지 점검합니다.`;
}

export function buildSlideshowTimeline(
  candidate: ProductCandidate,
  selectedAssets: GeneratedImageAssetCandidate[]
): SlideshowTimelineItem[] {
  if (selectedAssets.length === 0) {
    return [];
  }

  return shotTemplate.map((shot, index) => {
    const asset = assetByType(selectedAssets, shot.asset_type);
    const narration = buildNarration(candidate, shot.asset_type, shot.overlay_text);
    return {
      index: index + 1,
      start_sec: shot.start_sec,
      end_sec: shot.end_sec,
      duration_sec: shot.end_sec - shot.start_sec,
      asset_id: asset.id,
      asset_type: asset.asset_type,
      image_path_reference: asset.provided_path || asset.provided_filename || asset.expected_filename,
      motion: shot.motion,
      overlay_text: shot.overlay_text,
      narration,
      subtitle: narration,
      safety_notes: asset.safety_flags
    };
  });
}

export function buildTimelineMarkdown(timeline: SlideshowTimelineItem[]) {
  const lines = ["# Selected Image Slideshow Timeline", "", "## 15-second slideshow timeline"];
  for (const item of timeline) {
    lines.push(
      "",
      `### Shot ${item.index}: ${item.start_sec}-${item.end_sec}s`,
      `- asset_type: ${item.asset_type}`,
      `- image_path_reference: ${item.image_path_reference}`,
      `- motion: ${item.motion}`,
      `- overlay_text: ${item.overlay_text}`,
      `- narration: ${item.narration}`,
      `- subtitle: ${item.subtitle}`
    );
  }
  return lines.join("\n");
}
