import { describe, expect, test } from "vitest";
import type { GeneratedContent, ProductQueueItem } from "@/types/automation";
import { buildStoryboardRenderPlan, getRenderPlanReadiness } from "@/lib/video/storyboardTemplatePlanner";

describe("storyboard render plan template planner", () => {
  test("builds a deterministic 9:16 render plan for a ready Coupang queue item", () => {
    const result = buildStoryboardRenderPlan(queueItemFixture(), generatedContentFixture());

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.missing_reasons.join(","));
    }

    expect(result.render_plan).toMatchObject({
      version: "1",
      queue_id: "queue-render-plan-001",
      product_name: "Coupang render plan item",
      source: "storyboard_template",
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
    });
    expect(result.render_plan.shots).toHaveLength(4);
    expect(result.render_plan.shots.map((shot) => shot.shot_id)).toEqual([
      "hook",
      "product_focus",
      "check_points",
      "manual_cta"
    ]);
    expect(result.render_plan.shots.every((shot) => shot.image_url === "https://image.example.com/product.jpg")).toBe(
      true
    );
    expect(result.render_plan.shots.every((shot) => shot.duration_sec > 0)).toBe(true);
    expect(result.render_plan.disclosure_text).toContain("affiliate");

    const serialized = JSON.stringify(result.render_plan);
    expect(serialized).not.toContain("ViMax");
    expect(serialized).not.toContain("OPENAI_API_KEY");
    expect(serialized).not.toContain("GEMINI_API_KEY");
    expect(serialized).not.toContain("YOUTUBE_CLIENT_SECRET");
  });

  test("reports readiness gaps instead of producing a fake render plan", () => {
    const item = queueItemFixture({
      selected_affiliate_url: "",
      thumbnail_url: "",
      product_name: ""
    });
    const content = generatedContentFixture({
      video_script: "",
      disclosure_text: ""
    });

    expect(getRenderPlanReadiness(item, content)).toMatchObject({
      ready: false,
      missing_reasons: [
        "product_name",
        "selected_affiliate_url",
        "thumbnail_url",
        "video_script",
        "disclosure_text"
      ]
    });

    const result = buildStoryboardRenderPlan(item, content);
    expect(result).toMatchObject({
      ok: false,
      error_code: "RENDER_PLAN_NOT_READY",
      missing_reasons: [
        "product_name",
        "selected_affiliate_url",
        "thumbnail_url",
        "video_script",
        "disclosure_text"
      ]
    });
  });
});

function queueItemFixture(overrides: Partial<ProductQueueItem> = {}): ProductQueueItem {
  return {
    id: "queue-render-plan-001",
    queue_date: "2026-06-03",
    queue_rank: 1,
    upload_slot: 1,
    scheduled_at: "2026-06-03T00:00:00.000Z",
    keyword: "gift",
    theme: "seasonal",
    product_name: "Coupang render plan item",
    category_path: "gift/lifestyle",
    price_now_text: "15,900 KRW",
    thumbnail_url: "https://image.example.com/product.jpg",
    raw_coupang_url: "https://www.coupang.com/vp/products/123",
    selected_affiliate_url: "https://link.coupang.com/a/render-plan",
    product_score: 87,
    score_reason: "clear image and useful category",
    video_angle: "quick checklist",
    queue_status: "scheduled",
    video_url: "",
    video_snapshot_url: "",
    blog_draft_url: "",
    youtube_upload_status: "not_ready",
    tiktok_upload_status: "not_ready",
    threads_post_status: "not_ready",
    manual_review_status: "not_ready",
    error_message: "",
    created_at: "2026-06-03T00:00:00.000Z",
    updated_at: "2026-06-03T00:00:00.000Z",
    ...overrides
  };
}

function generatedContentFixture(overrides: Partial<GeneratedContent> = {}): GeneratedContent {
  return {
    id: "content-render-plan-001",
    product_queue_id: "queue-render-plan-001",
    raw_coupang_url: "https://www.coupang.com/vp/products/123",
    product_name: "Coupang render plan item",
    selected_affiliate_url: "https://link.coupang.com/a/render-plan",
    video_title: "Coupang render plan item checklist",
    video_script:
      "Start with the product at a glance. Highlight the category and price context. Remind viewers to check options before buying.",
    caption_1: "Product at a glance",
    caption_2: "Check the details",
    caption_3: "Confirm options before buying",
    threads_text: "",
    blog_title: "",
    blog_body: "",
    hashtags: "#coupang #shorts",
    youtube_description: "",
    tiktok_caption: "",
    disclosure_text: "This content contains affiliate links.",
    content_source: "fallback",
    creatomate_render_id: "",
    video_url: "",
    video_snapshot_url: "",
    video_status: "not_started",
    blog_draft_url: "",
    blog_draft_status: "not_started",
    created_at: "2026-06-03T00:00:00.000Z",
    updated_at: "2026-06-03T00:00:00.000Z",
    ...overrides
  };
}
