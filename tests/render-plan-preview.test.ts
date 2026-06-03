import { describe, expect, test } from "vitest";
import type { GeneratedContent, ProductQueueItem } from "@/types/automation";
import { summarizeRenderPlanPreview } from "@/lib/video/renderPlanPreview";
import { buildStoryboardRenderPlan } from "@/lib/video/storyboardTemplatePlanner";

describe("render plan preview summary", () => {
  test("summarizes shot count, total duration, and ready shot rows", () => {
    const item = queueItemFixture();
    const content = generatedContentFixture();
    const plan = buildStoryboardRenderPlan(item, content);

    if (!plan.ok) {
      throw new Error(plan.missing_reasons.join(","));
    }

    const summary = summarizeRenderPlanPreview(plan.render_plan, item, content);

    expect(summary.mode).toBe("render_plan");
    expect(summary.shot_count).toBe(4);
    expect(summary.total_duration_sec).toBe(18);
    expect(summary.ready).toBe(true);
    expect(summary.gaps).toEqual([]);
    expect(summary.rows).toHaveLength(4);
    expect(summary.rows[0]).toMatchObject({
      shot_id: "hook",
      shot_index: 1,
      start_time_sec: 0,
      duration_sec: 3,
      readiness_status: "ready",
      missing_reasons: []
    });
  });

  test("reports legacy fallback mode when no render plan is available", () => {
    const summary = summarizeRenderPlanPreview(null, queueItemFixture(), generatedContentFixture());

    expect(summary).toMatchObject({
      mode: "legacy_fallback",
      ready: false,
      shot_count: 0,
      total_duration_sec: 0,
      rows: []
    });
    expect(summary.gaps).toContain("no_render_plan");
  });

  test("summarizes an effective render plan after applying an override", () => {
    const item = queueItemFixture();
    const content = generatedContentFixture({
      render_plan_override: {
        shots: [
          {
            shot_id: "hook",
            caption: "Operator preview hook",
            voice_text: "This operator preview hook is safe.",
            duration_seconds: 4
          }
        ],
        updated_by: "operator"
      }
    });
    const plan = buildStoryboardRenderPlan(item, content);

    if (!plan.ok) {
      throw new Error(plan.missing_reasons.join(","));
    }

    const summary = summarizeRenderPlanPreview(plan.render_plan, item, content);

    expect(summary.override_present).toBe(true);
    expect(summary.total_duration_sec).toBe(19);
    expect(summary.rows[0]).toMatchObject({
      shot_id: "hook",
      caption: "Operator preview hook",
      voice_text: "This operator preview hook is safe.",
      duration_sec: 4
    });
  });

  test("reports readiness gaps for invalid shot plans without faking readiness", () => {
    const item = queueItemFixture({ thumbnail_url: "" });
    const content = generatedContentFixture({ video_script: "" });
    const plan = buildStoryboardRenderPlan(queueItemFixture(), generatedContentFixture());

    if (!plan.ok) {
      throw new Error(plan.missing_reasons.join(","));
    }

    const invalidPlan = {
      ...plan.render_plan,
      shots: [
        {
          ...plan.render_plan.shots[0],
          duration_sec: 0,
          image_url: "",
          caption: "This caption is intentionally much longer than the preview threshold so operators see the review warning before the render step."
        }
      ]
    };

    const summary = summarizeRenderPlanPreview(invalidPlan, item, content);

    expect(summary.ready).toBe(false);
    expect(summary.gaps).toEqual(
      expect.arrayContaining(["missing_image", "missing_script", "invalid_duration", "too_long_caption"])
    );
    expect(summary.rows[0]).toMatchObject({
      readiness_status: "needs_review",
      missing_reasons: expect.arrayContaining(["missing_image", "invalid_duration", "too_long_caption"])
    });
  });
});

function queueItemFixture(overrides: Partial<ProductQueueItem> = {}): ProductQueueItem {
  return {
    id: "queue-render-plan-preview-001",
    queue_date: "2026-06-03",
    queue_rank: 1,
    upload_slot: 1,
    scheduled_at: "2026-06-03T00:00:00.000Z",
    keyword: "gift",
    theme: "seasonal",
    product_name: "Coupang render plan preview item",
    category_path: "gift/lifestyle",
    price_now_text: "15,900 KRW",
    thumbnail_url: "https://image.example.com/product.jpg",
    raw_coupang_url: "https://www.coupang.com/vp/products/123",
    selected_affiliate_url: "https://link.coupang.com/a/render-plan-preview",
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
    id: "content-render-plan-preview-001",
    product_queue_id: "queue-render-plan-preview-001",
    raw_coupang_url: "https://www.coupang.com/vp/products/123",
    product_name: "Coupang render plan preview item",
    selected_affiliate_url: "https://link.coupang.com/a/render-plan-preview",
    video_title: "Coupang render plan preview item checklist",
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
