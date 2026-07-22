import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  buildV037ReviewFallbackSummary,
  classifyV037ReviewCandidate,
  renderV037ReviewFailureCardHtml,
  type V037ReviewCandidate
} from "@/uploads/multi-channel/v037ReviewFallbackBlocker";

const V037_ROOT = path.join("commerce-assets", "review", "v037");

function loadSceneManifest(channelKey: string) {
  return JSON.parse(readFileSync(path.join(V037_ROOT, channelKey, "scene-manifest.json"), "utf8"));
}

function loadReviewConsole(channelKey: string) {
  return readFileSync(path.join(V037_ROOT, channelKey, "review-console.html"), "utf8");
}

function v037Candidate(channelKey: "neoman_moleulgeol" | "lets_buy" | "father_jobs"): V037ReviewCandidate {
  const manifest = loadSceneManifest(channelKey);
  return {
    item_id: channelKey,
    product_source_name: manifest.product_name,
    source_image_present: true,
    offer_text_present: true,
    price_or_spec_required: true,
    price_or_spec_present: true,
    renderer_name: manifest.provider,
    template_id: "v037-three-channel-review-console",
    output_path: path.join(V037_ROOT, channelKey, "local-review-video.mp4"),
    visual_probe: {
      dominant_color_ratio: 1,
      rgb_stdev: [0, 0, 0]
    }
  };
}

describe("v037 review fallback blocker", () => {
  test.each(["neoman_moleulgeol", "lets_buy", "father_jobs"] as const)(
    "blocks %s fallback renderer artifacts from normal human review",
    (channelKey) => {
      const result = classifyV037ReviewCandidate(v037Candidate(channelKey));

      expect(result).toMatchObject({
        review_status: "GENERATION_FAILED",
        normal_review_item_allowed: false,
        safe_to_upload: false,
        item_id: channelKey,
        renderer_name: "local_v037_scene_asset_renderer",
        template_id: "v037-three-channel-review-console",
        failure_reason: "FALLBACK_RENDERER_REGRESSION"
      });
      expect(result.output_path).toContain(path.join("commerce-assets", "review", "v037", channelKey, "local-review-video.mp4"));
    }
  );

  test("v037 review console currently exposes fallback video as a pending human review item", () => {
    const html = loadReviewConsole("neoman_moleulgeol");

    expect(html).toContain("human_review_status=PENDING_HUMAN_REVIEW");
    expect(html).toContain("safe_to_upload=false");
    expect(html).toContain('<video src="local-review-video.mp4"');
  });

  test("low-information or colorbar signatures force safe_to_upload=false and failure card rendering", () => {
    const candidate: V037ReviewCandidate = {
      item_id: "colorbar-fixture",
      product_source_name: "colorbar fallback fixture",
      source_image_present: true,
      offer_text_present: true,
      price_or_spec_required: true,
      price_or_spec_present: true,
      renderer_name: "commerce_renderer_v1",
      template_id: "commerce-template",
      output_path: "commerce-assets/review/v037/colorbar/local-review-video.mp4",
      visual_probe: {
        colorbar_signature_present: true,
        dominant_color_ratio: 0.2,
        rgb_stdev: [90, 100, 110]
      }
    };

    const result = classifyV037ReviewCandidate(candidate);

    expect(result.review_status).toBe("GENERATION_FAILED");
    expect(result.safe_to_upload).toBe(false);
    expect(result.normal_review_item_allowed).toBe(false);
    expect(result).toMatchObject({
      failure_reason: "COLORBAR_PLACEHOLDER_SIGNATURE"
    });
  });

  test("failure card contains required operator diagnostics without previewing fallback media", () => {
    const result = classifyV037ReviewCandidate({
      ...v037Candidate("lets_buy"),
      missing_asset_path: "commerce-assets/source-images/lets_buy/product.png"
    });
    if (result.review_status !== "GENERATION_FAILED") {
      throw new Error("expected failure card");
    }

    const html = renderV037ReviewFailureCardHtml(result);

    expect(html).toContain('data-review-status="GENERATION_FAILED"');
    expect(html).toContain("item id");
    expect(html).toContain("product/source name");
    expect(html).toContain("failure reason");
    expect(html).toContain("missing asset path");
    expect(html).toContain("renderer name");
    expect(html).toContain("template id");
    expect(html).toContain("next action");
    expect(html).toContain("safe_to_upload=false");
    expect(html).not.toContain("<video");
    expect(html).not.toContain("<img");
  });

  test("summary reports failed and fallback counts while keeping uploads blocked", () => {
    const summary = buildV037ReviewFallbackSummary([
      v037Candidate("neoman_moleulgeol"),
      v037Candidate("lets_buy"),
      v037Candidate("father_jobs")
    ]);

    expect(summary).toMatchObject({
      review_status: "GENERATION_FAILED",
      safe_to_upload: false,
      failed_count: 3,
      fallback_count: 3,
      normal_review_count: 0,
      production_side_effect: "NO",
      upload_executed: false,
      external_publish_executed: false
    });
    expect(summary.failure_cards).toHaveLength(3);
  });

  test("normal commerce creative remains reviewable but not uploadable", () => {
    const result = classifyV037ReviewCandidate({
      item_id: "normal-commerce-fixture",
      product_source_name: "normal product",
      source_image_present: true,
      offer_text_present: true,
      price_or_spec_required: true,
      price_or_spec_present: true,
      renderer_name: "commerce_product_renderer_v1",
      template_id: "price-spec-cta-template",
      output_path: "commerce-assets/review/v037/normal/local-review-video.mp4",
      visual_probe: {
        dominant_color_ratio: 0.14,
        rgb_stdev: [42, 38, 45],
        colorbar_signature_present: false,
        debug_test_pattern_marker_present: false
      }
    });

    expect(result).toMatchObject({
      review_status: "PENDING_HUMAN_REVIEW",
      normal_review_item_allowed: true,
      safe_to_upload: false
    });
  });

  test("missing commerce creative fields fail closed before human review", () => {
    const result = classifyV037ReviewCandidate({
      item_id: "missing-offer",
      product_source_name: "missing offer fixture",
      source_image_present: true,
      offer_text_present: false,
      price_or_spec_required: true,
      price_or_spec_present: false,
      renderer_name: "commerce_product_renderer_v1",
      template_id: "price-spec-cta-template",
      output_path: "commerce-assets/review/v037/missing/local-review-video.mp4"
    });

    expect(result).toMatchObject({
      review_status: "GENERATION_FAILED",
      normal_review_item_allowed: false,
      safe_to_upload: false,
      failure_reason: "OFFER_TEXT_MISSING"
    });
  });
});
