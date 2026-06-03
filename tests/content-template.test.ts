import { describe, expect, test } from "vitest";
import {
  buildDisclosureText,
  buildDraftGeneratedContent,
  buildHashtags,
  buildTiktokCaption,
  buildVideoScript,
  buildVideoTitle,
  buildYoutubeDescription
} from "@/lib/content/contentTemplate";
import { createGeneratedContentFixture, createQueueItemFixture } from "@/test/fixtures";

describe("content template generation", () => {
  test("builds a cautious renderable video script with disclosure text", () => {
    const item = createQueueItemFixture({
      product_name: "무선 청소기 테스트",
      category_path: "생활가전",
      price_now_text: "129,000원",
      video_angle: "좁은 공간 청소 루틴"
    });
    const script = buildVideoScript(item);

    expect(script).toContain("무선 청소기 테스트");
    expect(script).toContain("구매 전");
    expect(script).toContain(buildDisclosureText());
    expect(script).not.toContain("최저가");
    expect(script).not.toContain("보장");
  });

  test("keeps existing manual fields when content already has values", () => {
    const item = createQueueItemFixture({ product_name: "수동 작성 상품" });
    const content = createGeneratedContentFixture({
      video_title: "수동 제목",
      video_script: "수동 대본"
    });

    expect(buildVideoTitle(item, content)).toBe("수동 제목");
    expect(buildVideoScript(item, content)).toBe("수동 대본");
  });

  test("builds descriptions, captions, and hashtags without unsafe claims", () => {
    const item = createQueueItemFixture({
      product_name: "행사 후보 상품",
      category_path: "주방용품",
      keyword: "정리",
      price_now_text: "29,900원"
    });

    expect(buildYoutubeDescription(item)).toContain("구매 전");
    expect(buildTiktokCaption(item)).toContain("구매 전");
    expect(buildHashtags(item)).toContain("#주방용품");
    expect(buildYoutubeDescription(item)).not.toContain("최저가");
  });

  test("builds a full generated content scaffold with fallback source", () => {
    const item = createQueueItemFixture({
      id: "queue-template-test",
      product_name: "템플릿 생성 상품",
      selected_affiliate_url: "https://link.coupang.com/a/template-test"
    });

    const content = buildDraftGeneratedContent(item, null, "2026-06-03T00:00:00.000Z");

    expect(content.id).toBe("content-queue-template-test");
    expect(content.content_source).toBe("fallback");
    expect(content.video_script).toContain("템플릿 생성 상품");
    expect(content.disclosure_text).toContain("제휴마케팅");
    expect(content.created_at).toBe("2026-06-03T00:00:00.000Z");
  });
});
