import { describe, expect, test } from "vitest";
import {
  DEFAULT_YOUTUBE_PRODUCT_DISCLOSURE_TEXT,
  buildYouTubeProductVideoUploadPackage
} from "@/lib/uploads/youtube";
import { buildYouTubeUploadRequest } from "@/lib/uploads/youtube/buildYoutubeUploadRequest";
import { validateYouTubeDisclosureText } from "@/lib/uploads/youtube/youtubeDisclosureTextGuard";

const CANONICAL_KOREAN_DISCLOSURE =
  "※ 이 콘텐츠는 쿠팡파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.";

const READY_PRODUCT_PACKAGE_INPUT = {
  candidate_id: "candidate-490aa6d25e8ea89d",
  product_name: "빌리빈 스테인리스 조리도구 8종 세트",
  product_source: "coupang",
  selected_affiliate_url: "https://link.coupang.com/a/test-product",
  video_path_or_url: "https://assets.example.test/real-product.mp4",
  prepared_video_asset: {
    asset_id: "asset-candidate-490aa6d25e8ea89d-video",
    provider: "signed_url",
    signed_url: "https://assets.example.test/real-product.mp4",
    prepared_video_asset_url: "https://assets.example.test/real-product.mp4",
    mime_type: "video/mp4",
    size_bytes: 272273,
    server_accessible: true
  },
  visibility: "private",
  title: "domain-ready product/private smoke package title",
  description: "Domain-ready product private package.",
  disclosure_text: CANONICAL_KOREAN_DISCLOSURE,
  tags: ["coupang", "private upload"],
  made_for_kids: false
};

describe("YouTube product package disclosure/readiness repair", () => {
  test("canonical Korean Coupang Partners disclosure is the package default", () => {
    expect(DEFAULT_YOUTUBE_PRODUCT_DISCLOSURE_TEXT).toBe(CANONICAL_KOREAN_DISCLOSURE);
  });

  test("canonical Korean Coupang Partners disclosure passes the shared guard", () => {
    expect(validateYouTubeDisclosureText({
      description: `상품 설명\n\n${CANONICAL_KOREAN_DISCLOSURE}`,
      disclosure_text: CANONICAL_KOREAN_DISCLOSURE
    })).toEqual([]);
  });

  test("product package passes with canonical Korean disclosure and private visibility", () => {
    const result = buildYouTubeProductVideoUploadPackage(READY_PRODUCT_PACKAGE_INPUT);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(`expected package ready, got ${result.blocked_reasons.join(",")}`);
    }
    expect(result.package.disclosure_text).toBe(CANONICAL_KOREAN_DISCLOSURE);
    expect(result.package.description).toContain("쿠팡파트너스");
    expect(result.package.description).toContain("수수료");
    expect(result.package.readiness).toMatchObject({
      disclosure_ready: true,
      visibility_ready: true,
      public_upload_blocked: true,
      server_accessible_asset_ready: true
    });
    expect(result.package.blocked_reasons).toEqual([]);
  });

  test("product package repairs garbled disclosure with canonical Korean fallback", () => {
    const result = buildYouTubeProductVideoUploadPackage({
      ...READY_PRODUCT_PACKAGE_INPUT,
      description: "? ???? ?? ???? ??? ????, ?? ?? ???? ???? ? ????.",
      disclosure_text: "? ???? ?? ???? ??? ????, ?? ?? ???? ???? ? ????."
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(`expected package repair, got ${result.blocked_reasons.join(",")}`);
    }
    expect(result.package.disclosure_text).toBe(CANONICAL_KOREAN_DISCLOSURE);
    expect(result.package.description).toContain(CANONICAL_KOREAN_DISCLOSURE);
    expect(result.package.blocked_reasons).not.toContain("disclosure_text_garbled");
    expect(result.package.readiness.disclosure_ready).toBe(true);
  });

  test("source garbled product text does not reintroduce disclosure_text_garbled after package repair", () => {
    const garbledProductText = "? ???? ???? 8? ???";
    const result = buildYouTubeProductVideoUploadPackage({
      ...READY_PRODUCT_PACKAGE_INPUT,
      product_name: garbledProductText,
      description: [
        garbledProductText,
        CANONICAL_KOREAN_DISCLOSURE
      ].join("\n\n"),
      disclosure_text: CANONICAL_KOREAN_DISCLOSURE
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(`expected source text repair, got ${result.blocked_reasons.join(",")}`);
    }
    expect(result.package.disclosure_text).toBe(CANONICAL_KOREAN_DISCLOSURE);
    expect(result.package.description).toContain(CANONICAL_KOREAN_DISCLOSURE);
    expect(result.package.description).not.toContain(garbledProductText);
    expect(result.package.blocked_reasons).not.toContain("disclosure_text_garbled");
    expect(result.package.readiness.disclosure_ready).toBe(true);
  });

  test("private execute preflight accepts repaired package disclosure description", () => {
    const garbledProductText = "? ???? ???? 8? ???";
    const packageResult = buildYouTubeProductVideoUploadPackage({
      ...READY_PRODUCT_PACKAGE_INPUT,
      product_name: garbledProductText,
      description: [
        garbledProductText,
        CANONICAL_KOREAN_DISCLOSURE
      ].join("\n\n"),
      disclosure_text: CANONICAL_KOREAN_DISCLOSURE
    });

    expect(packageResult.ok).toBe(true);
    if (!packageResult.ok) {
      throw new Error(`expected repaired package, got ${packageResult.blocked_reasons.join(",")}`);
    }

    const requestResult = buildYouTubeUploadRequest({
      ...packageResult.package,
      execution_intent: "private_execute"
    });

    expect(requestResult.ok).toBe(true);
    if (!requestResult.ok) {
      expect(requestResult.missing_reasons).not.toContain("disclosure_text_garbled");
    }
  });
});
