import { describe, expect, test } from "vitest";
import type { GeneratedContent, ProductQueueItem } from "@/types/automation";
import { buildStoryboardRenderPlan } from "@/lib/video/storyboardTemplatePlanner";
import {
  applyRenderPlanOverride,
  sanitizeRenderPlanOverrideInput,
  validateRenderPlanOverride
} from "@/lib/video/renderPlanOverride";

describe("render plan lightweight overrides", () => {
  test("applies caption, voice text, and duration without mutating the base render plan", () => {
    const base = readyRenderPlan();
    const originalCaption = base.shots[0].caption;
    const override = sanitizeRenderPlanOverrideInput({
      shots: [
        {
          shot_id: "hook",
          caption: "Check this gift before buying",
          voice_text: "Use this short checklist before you buy this product.",
          duration_seconds: 4
        }
      ],
      updated_by: "operator"
    });

    const validation = validateRenderPlanOverride(override, base);
    expect(validation.ok).toBe(true);
    if (!validation.ok) {
      throw new Error(validation.message);
    }

    const effective = applyRenderPlanOverride(base, override);

    expect(effective.shots[0]).toMatchObject({
      shot_id: "hook",
      caption: "Check this gift before buying",
      voice_text: "Use this short checklist before you buy this product.",
      duration_sec: 4
    });
    expect(base.shots[0].caption).toBe(originalCaption);
    expect(effective.safety).toMatchObject({
      external_api_call: false,
      platform_upload: false,
      vimax_dependency: false,
      worker_jobs_created: false
    });
  });

  test("rejects unknown shots, unsafe claims, external URLs, and out-of-range duration", () => {
    const base = readyRenderPlan();

    expect(validateRenderPlanOverride({ shots: [{ shot_id: "missing", caption: "Safe" }] }, base)).toMatchObject({
      ok: false,
      error_code: "UNKNOWN_RENDER_PLAN_SHOT"
    });
    expect(validateRenderPlanOverride({ shots: [{ shot_id: "hook", caption: "100% lowest price guaranteed" }] }, base)).toMatchObject({
      ok: false,
      error_code: "UNSAFE_RENDER_PLAN_OVERRIDE"
    });
    expect(validateRenderPlanOverride({ shots: [{ shot_id: "hook", external_url: "https://example.com" }] }, base)).toMatchObject({
      ok: false,
      error_code: "INVALID_RENDER_PLAN_OVERRIDE"
    });
    expect(validateRenderPlanOverride({ shots: [{ shot_id: "hook", duration_seconds: 12 }] }, base)).toMatchObject({
      ok: false,
      error_code: "INVALID_RENDER_PLAN_DURATION"
    });
  });
});

function readyRenderPlan() {
  const result = buildStoryboardRenderPlan(queueItemFixture(), generatedContentFixture());
  if (!result.ok) {
    throw new Error(result.missing_reasons.join(","));
  }
  return result.render_plan;
}

function queueItemFixture(overrides: Partial<ProductQueueItem> = {}): ProductQueueItem {
  return {
    id: "queue-render-plan-override-001",
    queue_date: "2026-06-03",
    queue_rank: 1,
    upload_slot: 1,
    scheduled_at: "2026-06-03T00:00:00.000Z",
    keyword: "gift",
    theme: "seasonal",
    product_name: "Render plan override item",
    category_path: "gift/lifestyle",
    price_now_text: "15,900 KRW",
    thumbnail_url: "https://image.example.com/product.jpg",
    raw_coupang_url: "https://www.coupang.com/vp/products/123",
    selected_affiliate_url: "https://link.coupang.com/a/render-plan-override",
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
    id: "content-render-plan-override-001",
    product_queue_id: "queue-render-plan-override-001",
    raw_coupang_url: "https://www.coupang.com/vp/products/123",
    product_name: "Render plan override item",
    selected_affiliate_url: "https://link.coupang.com/a/render-plan-override",
    video_title: "Render plan override item checklist",
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
