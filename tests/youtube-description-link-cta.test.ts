import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import {
  YOUTUBE_DESCRIPTION_CTA_LINE,
  YOUTUBE_ON_SCREEN_CTA_TEXT,
  buildYouTubeLinkCtaMetadata,
  buildYouTubeProductVideoUploadPackage,
  buildYouTubeUploadRequest,
  validateYouTubeLinkCtaMetadata
} from "@/lib/uploads/youtube";
import { PASSING_SHORTS_CONTENT_QUALITY } from "./fixtures/youtubeShortsContentQuality";

const AFFILIATE_URL = "https://link.coupang.com/a/description-link-cta";
const DISCLOSURE =
  "\u203b \uC774 \uB9C1\uD06C\uB294 \uCFE0\uD321 \uD30C\uD2B8\uB108\uC2A4 \uD65C\uB3D9\uC758 \uC77C\uD658\uC73C\uB85C, \uC774\uC5D0 \uB530\uB978 \uC77C\uC815\uC561\uC758 \uC218\uC218\uB8CC\uB97C \uC81C\uACF5\uBC1B\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4.";
const BODY =
  "\uC7A5\uB9C8\uCCA0 \uBE68\uB798 \uB0C4\uC0C8\uAC00 \uAC71\uC815\uB41C\uB2E4\uBA74, \uC811\uC774\uC2DD \uBE68\uB798\uAC74\uC870\uB300 \uD06C\uAE30\u00B7\uD558\uC911\u00B7\uBCF4\uAD00\uACF5\uAC04\uC744 \uBA3C\uC800 \uD655\uC778\uD558\uC138\uC694.";
const STUDIO_CHECKLIST_DOC = "docs/YOUTUBE_LINK_CTA_STUDIO_CHECKLIST.md";

const preparedVideoAsset = {
  asset_id: "asset-description-link-cta",
  provider: "signed_url",
  signed_url: "https://assets.example.test/description-link-cta.mp4",
  prepared_video_asset_url: "https://assets.example.test/description-link-cta.mp4",
  mime_type: "video/mp4",
  size_bytes: 1024,
  server_accessible: true
};

describe("YouTube description link and CTA metadata", () => {
  test("builds a URL-first description and pinned comment template without wrapped URLs", () => {
    const metadata = buildYouTubeLinkCtaMetadata({
      selected_affiliate_url: AFFILIATE_URL,
      description: [
        "\uC0C1\uD488 \uB9C1\uD06C:",
        AFFILIATE_URL,
        BODY,
        DISCLOSURE
      ].join("\n"),
      disclosure_text: DISCLOSURE
    });
    const validation = validateYouTubeLinkCtaMetadata({
      ...metadata,
      selected_affiliate_url: AFFILIATE_URL,
      disclosure_text: DISCLOSURE
    });

    expect(metadata.description.split(/\r?\n/)[0]).toBe(AFFILIATE_URL);
    expect(metadata.description).toContain(YOUTUBE_DESCRIPTION_CTA_LINE);
    expect(metadata.description).toContain(DISCLOSURE);
    expect(metadata.pinned_comment_template).toContain(AFFILIATE_URL);
    expect(metadata.pinned_comment_template).not.toMatch(/`|<https:\/\/|\[[^\]]+]\(https:\/\//);
    expect(metadata.on_screen_cta_text).toBe(YOUTUBE_ON_SCREEN_CTA_TEXT);
    expect(validation).toMatchObject({
      description_url_present: true,
      description_first_line_is_plain_https_url: true,
      no_markdown_wrapped_url: true,
      no_backtick_url: true,
      no_line_break_inside_url: true,
      affiliate_disclosure_present: true,
      pinned_comment_template_ready: true,
      on_screen_cta_mentions_description_or_pinned_comment: true,
      likely_clickable_in_watch_page: true,
      shorts_feed_click_limitation_noted: true
    });
  });

  test("upload request builder uses the URL-first metadata and prepares a pinned comment", () => {
    const result = buildYouTubeUploadRequest({
      candidate_id: "candidate-description-link-cta",
      video_path_or_url: "commerce-assets/output/video-packages/description-link-cta.mp4",
      prepared_video_asset: preparedVideoAsset,
      title: "Private drying rack review",
      description: BODY,
      disclosure_text: DISCLOSURE,
      selected_affiliate_url: AFFILIATE_URL,
      shorts_content_quality: PASSING_SHORTS_CONTENT_QUALITY,
      visibility: "private"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected request build success");
    }
    expect(result.request.description.split(/\r?\n/)[0]).toBe(AFFILIATE_URL);
    expect(result.request.description).toContain(YOUTUBE_DESCRIPTION_CTA_LINE);
    expect(result.request.pinned_comment_template).toContain(AFFILIATE_URL);
    expect(result.request.on_screen_cta_text).toBe(YOUTUBE_ON_SCREEN_CTA_TEXT);
    expect(validateYouTubeLinkCtaMetadata({
      description: result.request.description,
      pinned_comment_template: result.request.pinned_comment_template,
      on_screen_cta_text: result.request.on_screen_cta_text,
      selected_affiliate_url: AFFILIATE_URL,
      disclosure_text: DISCLOSURE
    })).toMatchObject({
      description_first_line_is_plain_https_url: true,
      pinned_comment_template_ready: true
    });
  });

  test("product package prepare also emits URL-first description and pinned comment metadata", () => {
    const result = buildYouTubeProductVideoUploadPackage({
      candidate_id: "candidate-product-description-link-cta",
      product_name: "\uC811\uC774\uC2DD \uBE68\uB798\uAC74\uC870\uB300",
      product_source: "coupang",
      selected_affiliate_url: AFFILIATE_URL,
      video_path_or_url: "commerce-assets/output/video-packages/product-description-link-cta.mp4",
      prepared_video_asset: preparedVideoAsset,
      visibility: "private",
      title: "\uC811\uC774\uC2DD \uBE68\uB798\uAC74\uC870\uB300 \uD655\uC778 \uD3EC\uC778\uD2B8",
      description: BODY,
      disclosure_text: DISCLOSURE,
      shorts_content_quality: PASSING_SHORTS_CONTENT_QUALITY
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected product package build success");
    }
    expect(result.package.description.split(/\r?\n/)[0]).toBe(AFFILIATE_URL);
    expect(result.package.pinned_comment_template).toContain(AFFILIATE_URL);
    expect(result.package.on_screen_cta_text).toBe(YOUTUBE_ON_SCREEN_CTA_TEXT);
  });

  test("description_first_line_plain_https_url_test", () => {
    const metadata = buildYouTubeLinkCtaMetadata({
      selected_affiliate_url: AFFILIATE_URL,
      description: BODY,
      disclosure_text: DISCLOSURE
    });

    expect(validateYouTubeLinkCtaMetadata({
      ...metadata,
      selected_affiliate_url: AFFILIATE_URL,
      disclosure_text: DISCLOSURE
    }).description_first_line_is_plain_https_url).toBe(true);
  });

  test("affiliate_disclosure_required_test", () => {
    const metadata = buildYouTubeLinkCtaMetadata({
      selected_affiliate_url: AFFILIATE_URL,
      description: BODY,
      disclosure_text: DISCLOSURE
    });

    expect(validateYouTubeLinkCtaMetadata({
      ...metadata,
      selected_affiliate_url: AFFILIATE_URL,
      disclosure_text: DISCLOSURE
    }).affiliate_disclosure_present).toBe(true);
  });

  test("onscreen_cta_mentions_description_or_pinned_comment_test", () => {
    expect(YOUTUBE_ON_SCREEN_CTA_TEXT).toContain("\uC124\uBA85\uB780");
    expect(YOUTUBE_ON_SCREEN_CTA_TEXT).toContain("\uACE0\uC815\uB313\uAE00");
  });

  test("comment_403_no_retry_test", () => {
    const checklist = readFileSync(STUDIO_CHECKLIST_DOC, "utf8");

    expect(checklist).toContain("comment_api_retry_attempted=false");
    expect(checklist).toContain("manual_pin_required=true");
    expect(checklist).toContain("HTTP 403");
  });

  test("manual_pin_required_test", () => {
    const checklist = readFileSync(STUDIO_CHECKLIST_DOC, "utf8");

    expect(checklist).toContain("manual_pin_required=true");
    expect(checklist).toContain("Pin the manually created comment in Studio.");
  });

  test("raw_affiliate_url_not_logged_test", () => {
    const checklist = readFileSync(STUDIO_CHECKLIST_DOC, "utf8");

    expect(checklist).toContain("<PLAIN_HTTPS_AFFILIATE_URL>");
    expect(checklist).not.toContain(AFFILIATE_URL);
  });
});
