import { describe, expect, test } from "vitest";
import { validateContentGenerationSafety } from "@/lib/content/contentSafety";
import { createQueueItemFixture } from "@/test/fixtures";

describe("content safety guard", () => {
  test("blocks guarantee and lowest-price claims", () => {
    const item = createQueueItemFixture({ product_name: "안전 검수 상품" });
    const result = validateContentGenerationSafety(
      {
        provider: "openai",
        requested_provider: "openai",
        provider_configured: true,
        used_fallback: false,
        video_title: "최저가 보장 상품",
        video_script: "무조건 100% 효과를 보장합니다. 최저가 보장.",
        caption_1: "",
        caption_2: "",
        caption_3: "",
        youtube_description: "최저가 보장",
        tiktok_caption: "100% 보장",
        hashtags: "#쇼핑",
        disclosure_text: "제휴 고지",
        safety_warnings: [],
        safe_message: ""
      },
      { queue_item: item }
    );

    expect(result.blocked).toBe(true);
    expect(result.warnings.join(" ")).toContain("보장");
  });

  test("warns when script is short and requires disclosure", () => {
    const item = createQueueItemFixture({ product_name: "짧은 대본 상품" });
    const result = validateContentGenerationSafety(
      {
        provider: "template",
        requested_provider: "template",
        provider_configured: false,
        used_fallback: false,
        video_title: "짧은 대본 상품",
        video_script: "짧음",
        caption_1: "",
        caption_2: "",
        caption_3: "",
        youtube_description: "",
        tiktok_caption: "",
        hashtags: "#쇼핑",
        disclosure_text: "",
        safety_warnings: [],
        safe_message: ""
      },
      { queue_item: item }
    );

    expect(result.ok).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.warnings.join(" ")).toContain("disclosure_text");
    expect(result.warnings.join(" ")).toContain("video_script");
  });
});
