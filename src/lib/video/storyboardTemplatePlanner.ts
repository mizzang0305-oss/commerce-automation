import type { GeneratedContent, ProductQueueItem } from "@/types/automation";
import type {
  BuildRenderPlanResult,
  RenderPlan,
  RenderPlanMissingReason,
  RenderPlanReadiness,
  RenderPlanShot
} from "./renderPlanTypes";

export function getRenderPlanReadiness(
  item: ProductQueueItem,
  content?: GeneratedContent | null
): RenderPlanReadiness {
  const missing_reasons: RenderPlanMissingReason[] = [];

  if (!item.product_name.trim()) {
    missing_reasons.push("product_name");
  }
  if (!item.selected_affiliate_url.trim()) {
    missing_reasons.push("selected_affiliate_url");
  }
  if (!item.thumbnail_url.trim()) {
    missing_reasons.push("thumbnail_url");
  }
  if (!content?.video_script?.trim()) {
    missing_reasons.push("video_script");
  }
  if (!content?.disclosure_text?.trim()) {
    missing_reasons.push("disclosure_text");
  }

  return {
    ready: missing_reasons.length === 0,
    missing_reasons
  };
}

export function buildStoryboardRenderPlan(
  item: ProductQueueItem,
  content?: GeneratedContent | null
): BuildRenderPlanResult {
  const readiness = getRenderPlanReadiness(item, content);
  if (!readiness.ready) {
    return {
      ok: false,
      error_code: "RENDER_PLAN_NOT_READY",
      message: "Queue item is missing required render plan inputs.",
      missing_reasons: readiness.missing_reasons
    };
  }

  const safeContent = content as GeneratedContent;
  const imageUrl = item.thumbnail_url.trim();
  const productName = item.product_name.trim();
  const scriptLines = splitScript(safeContent.video_script);
  const categoryOrTheme = [item.category_path, item.theme, item.keyword].map((value) => value.trim()).find(Boolean);
  const priceLine = item.price_now_text.trim() ? `Listed price/context: ${item.price_now_text.trim()}` : "";
  const title = safeContent.video_title.trim() || `${productName} checklist`;

  const shots: RenderPlanShot[] = [
    {
      shot_id: "hook",
      duration_sec: 3,
      layout: "title_card",
      image_role: "product",
      image_url: imageUrl,
      caption: clipText(title, 52),
      voice_text: clipText(scriptLines[0] || `${productName} quick checklist.`, 140),
      safe_area: "top_title",
      metadata: { source: "template", sequence: 1 }
    },
    {
      shot_id: "product_focus",
      duration_sec: 5,
      layout: "product_focus",
      image_role: "product",
      image_url: imageUrl,
      caption: clipText(categoryOrTheme || "Product context", 52),
      voice_text: clipText(scriptLines[1] || `${productName} is shown with practical buying context.`, 160),
      safe_area: "center_focus",
      metadata: { source: "template", sequence: 2 }
    },
    {
      shot_id: "check_points",
      duration_sec: 6,
      layout: "detail_check",
      image_role: "product",
      image_url: imageUrl,
      caption: clipText(priceLine || "Check options, shipping, and return terms", 58),
      voice_text: clipText(
        scriptLines[2] || "Confirm options, delivery terms, and return conditions before buying.",
        180
      ),
      safe_area: "bottom_caption",
      metadata: { source: "template", sequence: 3 }
    },
    {
      shot_id: "manual_cta",
      duration_sec: 4,
      layout: "manual_upload_cta",
      image_role: "product",
      image_url: imageUrl,
      caption: "Check the product page before purchase",
      voice_text: clipText(
        `${scriptLines[3] || "Review the latest product page before purchase."} ${safeContent.disclosure_text.trim()}`,
        220
      ),
      safe_area: "bottom_caption",
      metadata: { source: "template", sequence: 4 }
    }
  ];

  const render_plan: RenderPlan = {
    version: "1",
    queue_id: item.id,
    product_name: productName,
    source: "storyboard_template",
    shots,
    disclosure_text: safeContent.disclosure_text.trim(),
    render_target: {
      width: 1080,
      height: 1920,
      fps: 30,
      aspect_ratio: "9:16"
    },
    safety: {
      external_api_call: false,
      platform_upload: false,
      vimax_dependency: false,
      worker_jobs_created: false
    }
  };

  return {
    ok: true,
    render_plan,
    missing_reasons: []
  };
}

function splitScript(script: string) {
  return script
    .split(/[\n.!?]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function clipText(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}...`;
}
