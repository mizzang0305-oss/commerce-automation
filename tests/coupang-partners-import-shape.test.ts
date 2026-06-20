import { describe, expect, test } from "vitest";

import {
  buildCoupangCandidate,
  classifyCoupangImportReadiness,
  COUPANG_IMPORT_SIDE_EFFECTS
} from "@/lib/coupang/coupangCandidateImport";
import { buildRealProductAutoPilot } from "@/lib/uploads/youtube/realProductAutoPilotBuilder";
import type { ProductAsset, ProductQueueItem } from "@/types/automation";

const now = "2026-06-15T00:00:00.000Z";

describe("Coupang Partners import shape normalization", () => {
  test("maps live-like Partners productUrl to selected_affiliate_url", () => {
    const result = buildCoupangCandidate({
      product_name: "Real stainless cookware set",
      raw_coupang_url: "https://www.coupang.com/vp/products/111222333?itemId=444555&vendorItemId=666777",
      productUrl: "https://link.coupang.com/re/AFFSDP?lptag=AF0000000&pageKey=111222333&itemId=444555&vendorItemId=666777",
      productImage: "https://ads-partners.coupang.com/image1.jpg",
      source_type: "coupang_real_product_scout",
      source: "coupang_real_product_scout"
    });

    expect(result.readiness.affiliate_validation_status).toBe("valid");
    expect(result.candidate.selected_affiliate_url).toContain("link.coupang.com");
    expect(result.candidate.selected_affiliate_url).not.toBe("");
  });

  test("maps affiliate fallback fields to selected_affiliate_url", () => {
    for (const field of ["affiliate_url", "landing_url", "shorten_url"] as const) {
      const result = buildCoupangCandidate({
        product_name: `Affiliate fallback ${field}`,
        raw_coupang_url: `https://www.coupang.com/vp/products/${field.length}12345`,
        [field]: `https://link.coupang.com/re/${field}?lptag=AF0000000`,
        thumbnail_url: "https://image.coupangcdn.com/image/product.jpg"
      });

      expect(result.readiness.affiliate_validation_status).toBe("valid");
      expect(result.candidate.selected_affiliate_url).toContain("link.coupang.com");
    }
  });

  test("maps productImage and imagePath fields to ready image_url", () => {
    const fromProductImage = buildCoupangCandidate({
      product_name: "Product image mapping",
      raw_coupang_url: "https://www.coupang.com/vp/products/123123123",
      selected_affiliate_url: "https://link.coupang.com/re/AFFSDP?lptag=AF0000000",
      productImage: "https://ads-partners.coupang.com/products/product-image.jpg"
    });
    const fromImagePath = buildCoupangCandidate({
      product_name: "Image path mapping",
      raw_coupang_url: "https://www.coupang.com/vp/products/321321321",
      selected_affiliate_url: "https://link.coupang.com/re/AFFSDP?lptag=AF0000000",
      imagePath: "//ads-partners.coupang.com/products/product-image.png"
    });

    expect(fromProductImage.readiness).toMatchObject({
      image_readiness_status: "ready",
      image_url: "https://ads-partners.coupang.com/products/product-image.jpg"
    });
    expect(fromImagePath.readiness).toMatchObject({
      image_readiness_status: "ready",
      image_url: "https://ads-partners.coupang.com/products/product-image.png"
    });
  });

  test("separates missing and invalid import blockers without raw URLs in safe summaries", () => {
    const missingAffiliate = buildCoupangCandidate({
      product_name: "Missing affiliate",
      raw_coupang_url: "https://www.coupang.com/vp/products/444555666",
      productImage: "https://ads-partners.coupang.com/products/product-image.jpg"
    });
    const invalidAffiliate = buildCoupangCandidate({
      product_name: "Invalid affiliate",
      raw_coupang_url: "https://www.coupang.com/vp/products/555666777",
      selected_affiliate_url: "https://example.com/not-coupang",
      productImage: "https://ads-partners.coupang.com/products/product-image.jpg"
    });
    const missingImage = buildCoupangCandidate({
      product_name: "Missing image",
      raw_coupang_url: "https://www.coupang.com/vp/products/666777888",
      selected_affiliate_url: "https://link.coupang.com/re/AFFSDP?lptag=AF0000000"
    });
    const invalidImage = buildCoupangCandidate({
      product_name: "Invalid image",
      raw_coupang_url: "https://www.coupang.com/vp/products/777888999",
      selected_affiliate_url: "https://link.coupang.com/re/AFFSDP?lptag=AF0000000",
      productImage: "file:///secret/product.jpg"
    });

    expect(classifyCoupangImportReadiness(missingAffiliate.candidate)).toMatchObject({
      error_code: "COUPANG_IMPORT_AFFILIATE_URL_FIELD_MISSING",
      blocked_reasons: ["imported_candidate_affiliate_url_missing"],
      side_effects: COUPANG_IMPORT_SIDE_EFFECTS
    });
    expect(classifyCoupangImportReadiness(invalidAffiliate.candidate)).toMatchObject({
      error_code: "COUPANG_IMPORT_AFFILIATE_URL_INVALID",
      blocked_reasons: ["imported_candidate_affiliate_url_invalid"]
    });
    expect(classifyCoupangImportReadiness(missingImage.candidate)).toMatchObject({
      error_code: "COUPANG_IMPORT_IMAGE_URL_FIELD_MISSING",
      blocked_reasons: ["imported_candidate_image_url_missing"]
    });
    expect(classifyCoupangImportReadiness(invalidImage.candidate)).toMatchObject({
      error_code: "COUPANG_IMPORT_IMAGE_URL_INVALID",
      blocked_reasons: ["imported_candidate_image_url_invalid"]
    });

    const serialized = JSON.stringify([
      classifyCoupangImportReadiness(invalidAffiliate.candidate),
      classifyCoupangImportReadiness(invalidImage.candidate)
    ]);
    expect(serialized).not.toContain("example.com/not-coupang");
    expect(serialized).not.toContain("file:///secret/product.jpg");
  });

  test("auto pilot reports import mapping blockers instead of generic missing real product", () => {
    const invalidAffiliate = buildCoupangCandidate({
      product_name: "Real product with invalid affiliate",
      raw_coupang_url: "https://www.coupang.com/vp/products/888999000",
      selected_affiliate_url: "https://example.com/not-coupang",
      productImage: "https://ads-partners.coupang.com/products/product-image.jpg"
    });

    const result = buildRealProductAutoPilot({
      candidates: [invalidAffiliate.candidate],
      queueItems: [],
      productAssets: []
    });

    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("COUPANG_IMPORT_AFFILIATE_URL_INVALID");
    expect(result.blocked_reasons).toEqual(["imported_candidate_affiliate_url_invalid"]);
    expect(result.next_auto_action).toBe("FIX_COUPANG_PARTNERS_IMPORT_MAPPING");
    expect(result.side_effects.db_written).toBe(false);
    expect(result.side_effects.youtube_execute_called).toBe(false);
  });

  test("imported live Partners candidate becomes selectable without upload side effects", () => {
    const imported = buildCoupangCandidate({
      product_name: "Real selectable product",
      raw_coupang_url: "https://www.coupang.com/vp/products/900111222?itemId=333444&vendorItemId=555666",
      productUrl: "https://link.coupang.com/re/AFFSDP?lptag=AF0000000&pageKey=900111222",
      productImage: "https://ads-partners.coupang.com/products/product-image.jpg",
      source_type: "coupang_real_product_scout",
      source: "coupang_real_product_scout"
    }).candidate;
    const promotedCandidate = { ...imported, promoted_queue_id: "queue-real-live-partners" };
    const result = buildRealProductAutoPilot({
      mode: "prepare_only",
      candidates: [promotedCandidate],
      queueItems: [queue({ product_name: promotedCandidate.product_name })],
      productAssets: [videoAsset()]
    });

    expect(result.ok).toBe(true);
    expect(result.selected_product?.candidate_id).toBe(imported.id);
    expect(result.side_effects).toMatchObject({
      db_written: false,
      r2_uploaded: false,
      queue_created: false,
      worker_job_created: false,
      upload_package_created: false,
      youtube_execute_called: false,
      youtube_upload_executed: false
    });
  });
});

function queue(overrides: Partial<ProductQueueItem> = {}): ProductQueueItem {
  return {
    id: "queue-real-live-partners",
    queue_date: "2026-06-15",
    queue_rank: 1,
    upload_slot: 1,
    scheduled_at: now,
    keyword: "",
    theme: "",
    product_name: "Real selectable product",
    category_path: "",
    price_now_text: "",
    thumbnail_url: "https://ads-partners.coupang.com/products/product-image.jpg",
    raw_coupang_url: "https://www.coupang.com/vp/products/900111222",
    selected_affiliate_url: "https://link.coupang.com/re/AFFSDP?lptag=AF0000000",
    product_score: 80,
    score_reason: "",
    video_angle: "",
    queue_status: "video_ready",
    video_url: "https://cdn.example.com/videos/real-product.mp4",
    video_snapshot_url: "",
    blog_draft_url: "",
    youtube_upload_status: "not_ready",
    tiktok_upload_status: "not_ready",
    threads_post_status: "not_ready",
    manual_review_status: "not_ready",
    error_message: "",
    created_at: now,
    updated_at: now,
    ...overrides
  };
}

function videoAsset(overrides: Partial<ProductAsset> = {}): ProductAsset {
  return {
    id: "asset-video-real-live-partners",
    product_queue_id: "queue-real-live-partners",
    worker_job_id: "",
    asset_type: "video",
    bucket: "r2-videos",
    url: "https://cdn.example.com/videos/real-product.mp4",
    render_qa_metadata: {
      mime_type: "video/mp4",
      size_bytes: 1234567,
      checksum_sha256: "b".repeat(64),
      voiceover_audio_present: true,
      voiceover_audio_file_present: true,
      video_has_audio_stream: true,
      audio_muxed_into_video: true,
      audio_mime_type: "audio/wav",
      audio_duration_seconds: 24,
      duration_seconds: 25,
      scene_count: 6,
      caption_count: 6,
      static_single_image_only: false
    },
    created_at: now,
    ...overrides
  };
}
