import { afterEach, describe, expect, test } from "vitest";
import { generateContentWithProvider } from "@/lib/content/aiContentProvider";
import { generateTemplateContent } from "@/lib/content/templateContentProvider";
import { getAiProviderConfigStatus } from "@/lib/server/aiProviderConfig";
import { createQueueItemFixture } from "@/test/fixtures";

const originalProvider = process.env.CONTENT_AI_PROVIDER;
const originalOpenAiKey = process.env.OPENAI_API_KEY;
const originalGeminiKey = process.env.GEMINI_API_KEY;

afterEach(() => {
  restoreEnv("CONTENT_AI_PROVIDER", originalProvider);
  restoreEnv("OPENAI_API_KEY", originalOpenAiKey);
  restoreEnv("GEMINI_API_KEY", originalGeminiKey);
});

describe("content AI provider scaffold", () => {
  test("template provider returns required draft fields without external configuration", async () => {
    const item = createQueueItemFixture({
      product_name: "테스트 무선 청소기",
      category_path: "생활가전",
      price_now_text: "129,000원"
    });

    const result = await generateTemplateContent({ queue_item: item });

    expect(result.provider).toBe("template");
    expect(result.used_fallback).toBe(false);
    expect(result.video_title).toContain("테스트 무선 청소기");
    expect(result.video_script).toContain("테스트 무선 청소기");
    expect(result.video_script).toContain(result.disclosure_text);
    expect(result.youtube_description).toContain(result.disclosure_text);
    expect(result.tiktok_caption).toContain("#");
    expect(result.hashtags).toContain("#");
  });

  test("openai without a server key falls back to template without exposing secrets", async () => {
    process.env.CONTENT_AI_PROVIDER = "openai";
    delete process.env.OPENAI_API_KEY;
    const item = createQueueItemFixture({ product_name: "오픈AI 폴백 상품" });

    const result = await generateContentWithProvider({ queue_item: item });
    const serialized = JSON.stringify(result);

    expect(result.requested_provider).toBe("openai");
    expect(result.provider).toBe("template");
    expect(result.used_fallback).toBe(true);
    expect(result.provider_configured).toBe(false);
    expect(result.safe_message).toContain("template fallback");
    expect(serialized).not.toContain("OPENAI_API_KEY");
    expect(serialized).not.toContain("GEMINI_API_KEY");
  });

  test("reports only safe provider configuration booleans", () => {
    process.env.CONTENT_AI_PROVIDER = "gemini";
    process.env.OPENAI_API_KEY = "openai-secret-value";
    process.env.GEMINI_API_KEY = "gemini-secret-value";

    const status = getAiProviderConfigStatus();
    const serialized = JSON.stringify(status);

    expect(status).toMatchObject({
      provider: "gemini",
      openai_configured: true,
      gemini_configured: true,
      enabled: true
    });
    expect(serialized).not.toContain("openai-secret-value");
    expect(serialized).not.toContain("gemini-secret-value");
  });
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
