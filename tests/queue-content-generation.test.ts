import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { POST as generateContent } from "../app/api/queue/[id]/generate-content/route";
import { POST as nextBatch } from "../app/api/run/next-batch/route";
import { getAutomationRepository, resetMockRepositoryForTests } from "@/lib/repositories/automationRepository";

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

function routeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

function generateRequest(body: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/queue/test/generate-content", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

const originalProvider = process.env.CONTENT_AI_PROVIDER;
const originalOpenAiKey = process.env.OPENAI_API_KEY;
const originalGeminiKey = process.env.GEMINI_API_KEY;
const originalVisualBindingSecret = process.env.WORKER_VISUAL_BINDING_SECRET;

describe("queue content generation api", () => {
  beforeEach(() => {
    resetMockRepositoryForTests();
    process.env.WORKER_API_SECRET = "worker-secret";
    process.env.WORKER_VISUAL_BINDING_SECRET = "worker-visual-binding-test-secret-0001";
    delete process.env.CONTENT_AI_PROVIDER;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    restoreEnv("CONTENT_AI_PROVIDER", originalProvider);
    restoreEnv("OPENAI_API_KEY", originalOpenAiKey);
    restoreEnv("GEMINI_API_KEY", originalGeminiKey);
    restoreEnv("WORKER_VISUAL_BINDING_SECRET", originalVisualBindingSecret);
  });

  test("blocks content generation when affiliate url is missing", async () => {
    const repository = getAutomationRepository();
    const item = (await repository.getQueue({ status: "scheduled", limit: 1 }))[0];
    await repository.updateQueueItemById(item.id, { selected_affiliate_url: "" });

    const response = await generateContent(generateRequest(), routeContext(item.id));
    const payload = await readJson(response);

    expect(response.status).toBe(400);
    expect(String(payload.message)).toContain("제휴 링크");
    expect(await repository.getWorkerJobs()).toHaveLength(0);
  });

  test("blocks content generation when product name is missing", async () => {
    const repository = getAutomationRepository();
    const item = (await repository.getQueue({ status: "scheduled", limit: 1 }))[0];
    await repository.updateQueueItemById(item.id, {
      product_name: "",
      selected_affiliate_url: "https://link.coupang.com/a/content-draft",
      thumbnail_url: "https://picsum.photos/seed/content-draft/360/240"
    });

    const response = await generateContent(generateRequest(), routeContext(item.id));
    const payload = await readJson(response);

    expect(response.status).toBe(400);
    expect(String(payload.message)).toContain("상품명");
    expect(await repository.getWorkerJobs()).toHaveLength(0);
  });

  test("creates template generated content draft without creating worker jobs", async () => {
    const repository = getAutomationRepository();
    const item = (await repository.getQueue({ status: "scheduled", limit: 1 }))[0];
    await repository.updateQueueItemById(item.id, {
      product_name: "콘텐츠 초안 상품",
      selected_affiliate_url: "https://link.coupang.com/a/content-draft",
      thumbnail_url: "https://picsum.photos/seed/content-draft/360/240",
      price_now_text: "39,900원"
    });
    const existing = await repository.getGeneratedContentByQueueItem(item.id);
    if (existing) {
      await repository.upsertGeneratedContent({
        ...existing,
        video_title: "",
        video_script: "",
        youtube_description: "",
        tiktok_caption: "",
        hashtags: "",
        disclosure_text: "",
        updated_at: new Date().toISOString()
      });
    }

    const response = await generateContent(generateRequest(), routeContext(item.id));
    const payload = await readJson(response);
    const content = await repository.getGeneratedContentByQueueItem(item.id);

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      created_worker_jobs: 0,
      content_provider: "template",
      requested_provider: "template",
      used_fallback: false,
      provider_configured: false
    });
    expect(payload.safety_warnings).toEqual(expect.any(Array));
    expect(content?.video_title).toContain("콘텐츠 초안 상품");
    expect(content?.video_script).toContain("콘텐츠 초안 상품");
    expect(content?.video_script).toContain("구매 전");
    expect(content?.disclosure_text).toContain("제휴마케팅");
    expect(content?.youtube_description).toContain("구매 전");
    expect(content?.tiktok_caption).toContain("구매 전");
    expect(content?.hashtags).toContain("#");
    expect(await repository.getWorkerJobs()).toHaveLength(0);
  });

  test("falls back to template when openai is selected without a key", async () => {
    process.env.CONTENT_AI_PROVIDER = "openai";
    delete process.env.OPENAI_API_KEY;
    const repository = getAutomationRepository();
    const item = (await repository.getQueue({ status: "scheduled", limit: 1 }))[0];
    await repository.updateQueueItemById(item.id, {
      product_name: "AI 폴백 상품",
      selected_affiliate_url: "https://link.coupang.com/a/ai-fallback",
      thumbnail_url: "https://picsum.photos/seed/ai-fallback/360/240"
    });

    const response = await generateContent(generateRequest(), routeContext(item.id));
    const payload = await readJson(response);
    const serialized = JSON.stringify(payload);

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      requested_provider: "openai",
      content_provider: "template",
      used_fallback: true,
      provider_configured: false,
      created_worker_jobs: 0
    });
    expect(serialized).not.toContain("OPENAI_API_KEY");
    expect(await repository.getWorkerJobs()).toHaveLength(0);
  });

  test("generated draft lets next-batch create the worker job later", async () => {
    const repository = getAutomationRepository();
    await repository.updateSettings({ is_paused: false, batch_size: 1 });
    const item = (await repository.getQueue({ status: "scheduled", limit: 1 }))[0];
    await repository.updateQueueItemById(item.id, {
      product_name: "다음 배치 상품",
      selected_affiliate_url: "https://link.coupang.com/a/next-batch-draft",
      thumbnail_url: "https://picsum.photos/seed/next-batch-draft/360/240",
      scheduled_at: new Date(Date.now() - 60_000).toISOString()
    });

    const draftResponse = await generateContent(generateRequest(), routeContext(item.id));
    expect(draftResponse.status).toBe(200);
    expect(await repository.getWorkerJobs()).toHaveLength(0);

    const batchResponse = await nextBatch();
    const batchPayload = await readJson(batchResponse);
    const jobs = await repository.getWorkerJobs();

    expect(batchResponse.status).toBe(200);
    expect(batchPayload).toMatchObject({ ok: true, created_jobs: 1 });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].payload).toMatchObject({
      product_name: "다음 배치 상품",
      selected_affiliate_url: "https://link.coupang.com/a/next-batch-draft",
      disclosure_text: expect.stringContaining("제휴마케팅"),
      script: expect.stringContaining("다음 배치 상품")
    });
  });
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
