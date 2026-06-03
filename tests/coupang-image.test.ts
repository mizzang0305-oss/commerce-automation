import { describe, expect, test } from "vitest";
import type { ProductCandidate, ProductQueueItem } from "@/types/automation";
import {
  buildImageReadiness,
  normalizeImageUrl,
  pickBestCandidateImage,
  validateCandidateImageUrl
} from "@/lib/coupang/coupangImage";

describe("Coupang image readiness helpers", () => {
  test("normalizes image URLs without stripping useful query params", () => {
    expect(normalizeImageUrl("  https://image.example.com/product.jpg?width=1080  ")).toBe(
      "https://image.example.com/product.jpg?width=1080"
    );
  });

  test("validates missing, unsafe, and public image URLs", () => {
    expect(validateCandidateImageUrl("")).toMatchObject({ ok: false, reason: "missing_image" });
    expect(validateCandidateImageUrl("file:///secret/product.jpg")).toMatchObject({
      ok: false,
      reason: "invalid_image_url"
    });
    expect(validateCandidateImageUrl("javascript:alert(1)")).toMatchObject({
      ok: false,
      reason: "invalid_image_url"
    });
    expect(validateCandidateImageUrl("https://image.example.com/product.webp")).toMatchObject({
      ok: true,
      normalized_url: "https://image.example.com/product.webp"
    });
    expect(validateCandidateImageUrl("https://picsum.photos/seed/coupang-image/1080/1920")).toMatchObject({
      ok: true
    });
  });

  test("picks thumbnail_url before payload fallbacks", () => {
    const candidate = candidateFixture({
      payload: {
        thumbnail_url: "https://image.example.com/thumb.jpg",
        image_url: "https://image.example.com/image.jpg",
        images: ["https://image.example.com/array.jpg"]
      }
    });

    expect(pickBestCandidateImage(candidate)).toBe("https://image.example.com/thumb.jpg");
    expect(pickBestCandidateImage(candidateFixture({ payload: { image_url: "https://image.example.com/image.jpg" } }))).toBe(
      "https://image.example.com/image.jpg"
    );
    expect(pickBestCandidateImage(candidateFixture({ payload: { images: ["https://image.example.com/array.jpg"] } }))).toBe(
      "https://image.example.com/array.jpg"
    );
  });

  test("reports missing or invalid image readiness", () => {
    expect(buildImageReadiness(candidateFixture({ payload: {} }))).toMatchObject({
      status: "missing_image",
      ready: false
    });
    expect(buildImageReadiness(candidateFixture({ payload: { thumbnail_url: "data:image/png;base64,abc" } }))).toMatchObject({
      status: "invalid_image_url",
      ready: false
    });
    expect(buildImageReadiness(queueFixture({ thumbnail_url: "https://image.example.com/product.png" }))).toMatchObject({
      status: "ready",
      ready: true,
      image_url: "https://image.example.com/product.png"
    });
  });
});

function candidateFixture(overrides: Partial<ProductCandidate> = {}): ProductCandidate {
  return {
    id: "candidate-image-001",
    product_name: "Image candidate",
    raw_coupang_url: "https://www.coupang.com/vp/products/123",
    selected_affiliate_url: "https://link.coupang.com/a/image",
    payload: {},
    created_at: "2026-06-03T00:00:00.000Z",
    updated_at: "2026-06-03T00:00:00.000Z",
    ...overrides
  };
}

function queueFixture(overrides: Partial<ProductQueueItem> = {}): ProductQueueItem {
  return {
    id: "queue-image-001",
    queue_date: "2026-06-03",
    queue_rank: 1,
    upload_slot: 1,
    scheduled_at: "2026-06-03T00:00:00.000Z",
    keyword: "",
    theme: "",
    product_name: "Queue image item",
    category_path: "",
    price_now_text: "",
    thumbnail_url: "",
    raw_coupang_url: "",
    selected_affiliate_url: "",
    product_score: 0,
    score_reason: "",
    video_angle: "",
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
