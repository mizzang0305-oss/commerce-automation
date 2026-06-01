import { beforeEach, describe, expect, test } from "vitest";
import {
  evaluateScheduledRestoreReadiness,
  POST as generateContent
} from "../app/api/queue/[id]/generate-content/route";
import { POST as nextBatch } from "../app/api/run/next-batch/route";
import { buildDraftGeneratedContent } from "@/lib/content/contentTemplate";
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

describe("queue content generation api", () => {
  beforeEach(() => {
    resetMockRepositoryForTests();
    process.env.WORKER_API_SECRET = "worker-secret";
  });

  test("blocks content generation when affiliate url is missing", async () => {
    const repository = getAutomationRepository();
    const item = (await repository.getQueue({ status: "scheduled", limit: 1 }))[0];
    await repository.updateQueueItemById(item.id, { selected_affiliate_url: "" });

    const response = await generateContent(generateRequest(), routeContext(item.id));
    const payload = await readJson(response);

    expect(response.status).toBe(400);
    expect(payload.message).toContain("제휴 링크");
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
    expect(payload.message).toContain("상품명");
    expect(await repository.getWorkerJobs()).toHaveLength(0);
  });

  test("creates generated content draft without creating worker jobs", async () => {
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
    expect(payload).toMatchObject({ ok: true, created_worker_jobs: 0 });
    expect(content?.video_title).toContain("콘텐츠 초안 상품");
    expect(content?.video_script).toContain("콘텐츠 초안 상품");
    expect(content?.video_script).toContain("구매 전");
    expect(content?.disclosure_text).toContain("제휴마케팅");
    expect(content?.youtube_description).toContain("구매 전");
    expect(content?.tiktok_caption).toContain("구매 전");
    expect(content?.hashtags).toContain("#");
    expect(await repository.getWorkerJobs()).toHaveLength(0);
  });

  test("restores content-missing manual review item to scheduled after draft generation", async () => {
    const repository = getAutomationRepository();
    await repository.updateSettings({ is_paused: false, batch_size: 1 });
    const item = (await repository.getQueue({ status: "scheduled", limit: 1 }))[0];
    await repository.updateQueueItemById(item.id, {
      product_name: "수동 검토 복구 상품",
      selected_affiliate_url: "https://link.coupang.com/a/manual-review-draft",
      thumbnail_url: "https://picsum.photos/seed/manual-review-draft/360/240",
      scheduled_at: new Date(Date.now() - 60_000).toISOString(),
      queue_status: "manual_review",
      manual_review_status: "ready_for_review",
      error_message: "영상 대본이 없어 영상 생성 worker job을 만들지 않았습니다."
    });

    const response = await generateContent(generateRequest(), routeContext(item.id));
    const payload = await readJson(response);
    const updated = await repository.getQueueItem(item.id);

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      restored_scheduled: true,
      missing_reasons: [],
      created_worker_jobs: 0
    });
    expect(updated).toMatchObject({
      queue_status: "scheduled",
      manual_review_status: "not_ready",
      error_message: ""
    });
    expect(await repository.getWorkerJobs()).toHaveLength(0);

    const batchResponse = await nextBatch();
    const batchPayload = await readJson(batchResponse);
    const jobs = await repository.getWorkerJobs();

    expect(batchResponse.status).toBe(200);
    expect(batchPayload).toMatchObject({ ok: true, created_jobs: 1 });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      job_type: "video_render",
      product_queue_id: item.id
    });
  });

  test("restores content-missing error item to scheduled after draft generation", async () => {
    const repository = getAutomationRepository();
    const item = (await repository.getQueue({ status: "scheduled", limit: 1 }))[0];
    await repository.updateQueueItemById(item.id, {
      product_name: "오류 복구 상품",
      selected_affiliate_url: "https://link.coupang.com/a/error-draft",
      thumbnail_url: "https://picsum.photos/seed/error-draft/360/240",
      queue_status: "error",
      error_message: "영상 대본이 없어 영상 생성 worker job을 만들지 않았습니다."
    });

    const response = await generateContent(generateRequest(), routeContext(item.id));
    const payload = await readJson(response);
    const updated = await repository.getQueueItem(item.id);

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      restored_scheduled: true,
      missing_reasons: [],
      created_worker_jobs: 0
    });
    expect(updated).toMatchObject({
      queue_status: "scheduled",
      manual_review_status: "not_ready",
      error_message: ""
    });
    expect(await repository.getWorkerJobs()).toHaveLength(0);
  });

  test("does not restore manual review item when thumbnail is still missing", async () => {
    const repository = getAutomationRepository();
    const item = (await repository.getQueue({ status: "scheduled", limit: 1 }))[0];
    await repository.updateQueueItemById(item.id, {
      product_name: "썸네일 누락 상품",
      selected_affiliate_url: "https://link.coupang.com/a/missing-thumbnail",
      thumbnail_url: "",
      queue_status: "manual_review",
      error_message: "영상 대본이 없어 영상 생성 worker job을 만들지 않았습니다."
    });

    const response = await generateContent(generateRequest(), routeContext(item.id));
    const payload = await readJson(response);
    const updated = await repository.getQueueItem(item.id);

    expect(response.status).toBe(400);
    expect(payload).toMatchObject({ ok: false, created_worker_jobs: 0 });
    expect(payload.message).toContain("썸네일");
    expect(updated?.queue_status).toBe("manual_review");
    expect(await repository.getWorkerJobs()).toHaveLength(0);
  });

  test("restore readiness blocks generated content without disclosure text", async () => {
    const repository = getAutomationRepository();
    const item = (await repository.getQueue({ status: "scheduled", limit: 1 }))[0];
    const updated = await repository.updateQueueItemById(item.id, {
      product_name: "고지 누락 상품",
      selected_affiliate_url: "https://link.coupang.com/a/missing-disclosure",
      thumbnail_url: "https://picsum.photos/seed/missing-disclosure/360/240",
      queue_status: "manual_review",
      error_message: "영상 대본이 없어 영상 생성 worker job을 만들지 않았습니다."
    });

    expect(updated).not.toBeNull();
    const content = {
      ...buildDraftGeneratedContent(updated!),
      disclosure_text: "",
      video_script: "생성된 영상 대본입니다."
    };

    expect(evaluateScheduledRestoreReadiness(updated!, content)).toMatchObject({
      canRestore: false,
      missingReasons: ["제휴 고지 문구가 없어 예약 상태로 복구할 수 없습니다."]
    });
  });

  test("does not restore manual review item for non-content blocking reason", async () => {
    const repository = getAutomationRepository();
    const item = (await repository.getQueue({ status: "scheduled", limit: 1 }))[0];
    await repository.updateQueueItemById(item.id, {
      product_name: "비콘텐츠 차단 상품",
      selected_affiliate_url: "https://link.coupang.com/a/non-content-block",
      thumbnail_url: "https://picsum.photos/seed/non-content-block/360/240",
      queue_status: "manual_review",
      error_message: "제휴 링크가 없어 영상 생성 worker job을 만들지 않았습니다."
    });

    const response = await generateContent(generateRequest(), routeContext(item.id));
    const payload = await readJson(response);
    const updated = await repository.getQueueItem(item.id);

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      restored_scheduled: false,
      created_worker_jobs: 0
    });
    expect(payload.missing_reasons).toContain("manual_review 사유가 콘텐츠 초안 생성으로 해결 가능한 항목이 아닙니다.");
    expect(updated?.queue_status).toBe("manual_review");
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
