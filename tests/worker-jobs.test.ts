import { beforeEach, describe, expect, test, vi } from "vitest";
import { POST as claimJob } from "../app/api/worker/jobs/claim/route";
import { POST as heartbeatJob } from "../app/api/worker/jobs/[id]/heartbeat/route";
import { POST as completeJob } from "../app/api/worker/jobs/[id]/complete/route";
import { POST as failJob } from "../app/api/worker/jobs/[id]/fail/route";
import { GET as workerStatus } from "../app/api/worker/status/route";
import { POST as nextBatch } from "../app/api/run/next-batch/route";
import { POST as seedDevQueue } from "../app/api/dev/seed/route";
import { getAutomationRepository, resetMockRepositoryForTests } from "@/lib/repositories/automationRepository";
import type { GeneratedContent } from "@/types/automation";

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

function workerRequest(body: unknown, secret = "worker-secret") {
  return new Request("http://localhost/api/worker/test", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

function routeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("worker job api", () => {
  beforeEach(() => {
    resetMockRepositoryForTests();
    process.env.WORKER_API_SECRET = "worker-secret";
  });

  test("returns 401 when worker secret is missing or wrong", async () => {
    const missing = await claimJob(
      new Request("http://localhost/api/worker/jobs/claim", {
        method: "POST",
        body: JSON.stringify({ worker_id: "worker-1" })
      })
    );
    const wrong = await claimJob(workerRequest({ worker_id: "worker-1" }, "wrong-secret"));

    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
  });

  test("claims one pending job and prevents duplicate claim", async () => {
    const repository = getAutomationRepository();
    const item = (await repository.getQueue({ status: "scheduled", limit: 1 }))[0];
    const job = await repository.createWorkerJob({
      job_type: "video_render",
      product_queue_id: item.id,
      product_candidate_id: "",
      priority: 10,
      payload: { product_name: item.product_name },
      max_retries: 3
    });

    const first = await claimJob(workerRequest({ worker_id: "worker-1", job_types: ["video_render"] }));
    const second = await claimJob(workerRequest({ worker_id: "worker-2", job_types: ["video_render"] }));
    const firstPayload = await readJson(first);
    const secondPayload = await readJson(second);

    expect(first.status).toBe(200);
    expect(firstPayload.job).toMatchObject({ id: job.id, status: "claimed", claimed_by: "worker-1" });
    expect(second.status).toBe(200);
    expect(secondPayload.job).toBeNull();
  });

  test("updates heartbeat and worker status", async () => {
    const repository = getAutomationRepository();
    const job = await repository.createWorkerJob({
      job_type: "sheet_sync",
      product_queue_id: "",
      product_candidate_id: "",
      priority: 1,
      payload: {},
      max_retries: 3
    });
    await claimJob(workerRequest({ worker_id: "worker-1", job_types: ["sheet_sync"] }));

    const response = await heartbeatJob(
      workerRequest({ worker_id: "worker-1" }),
      routeContext(job.id)
    );
    const statusResponse = await workerStatus();
    const statusPayload = await readJson(statusResponse);

    expect(response.status).toBe(200);
    expect(JSON.stringify(statusPayload)).toContain("worker-1");
  });

  test("complete stores result urls and moves queue item to video_ready", async () => {
    const repository = getAutomationRepository();
    const item = (await repository.getQueue({ status: "scheduled", limit: 1 }))[0];
    const job = await repository.createWorkerJob({
      job_type: "video_render",
      product_queue_id: item.id,
      product_candidate_id: "",
      priority: 1,
      payload: {},
      max_retries: 3
    });
    await claimJob(workerRequest({ worker_id: "worker-1", job_types: ["video_render"] }));

    const response = await completeJob(
      workerRequest({
        worker_id: "worker-1",
        result: {
          video_url: "https://storage.example/rendered-videos/item.mp4",
          thumbnail_url: "https://storage.example/thumbnails/item.jpg",
          srt_url: "https://storage.example/subtitles/item.srt",
          upload_package_url: "https://storage.example/upload-packages/item.txt"
        }
      }),
      routeContext(job.id)
    );
    const updated = await repository.getQueueItem(item.id);

    expect(response.status).toBe(200);
    expect(updated?.queue_status).toBe("video_ready");
    expect(updated?.video_url).toBe("https://storage.example/rendered-videos/item.mp4");
    expect(updated?.video_snapshot_url).toBe("https://storage.example/thumbnails/item.jpg");
    expect((await repository.getProductAssets(item.id)).map((asset) => asset.asset_type)).toEqual([
      "video",
      "thumbnail",
      "subtitle",
      "upload_package"
    ]);
  });

  test("complete without video_url does not complete job or move queue item to video_ready", async () => {
    const repository = getAutomationRepository();
    const item = (await repository.getQueue({ status: "scheduled", limit: 1 }))[0];
    const job = await repository.createWorkerJob({
      job_type: "video_render",
      product_queue_id: item.id,
      product_candidate_id: "",
      priority: 1,
      payload: {},
      max_retries: 3
    });
    await claimJob(workerRequest({ worker_id: "worker-1", job_types: ["video_render"] }));

    const response = await completeJob(
      workerRequest({
        worker_id: "worker-1",
        result: {
          video_url: "",
          thumbnail_url: "https://storage.example/thumbnails/item.jpg",
          srt_url: "https://storage.example/subtitles/item.srt",
          upload_package_url: "https://storage.example/upload-packages/item.txt"
        }
      }),
      routeContext(job.id)
    );
    const updatedJob = await repository.getWorkerJob(job.id);
    const updatedItem = await repository.getQueueItem(item.id);
    const assets = await repository.getProductAssets(item.id);

    expect(response.status).toBe(422);
    expect(updatedJob?.status).toBe("retry_wait");
    expect(updatedItem?.queue_status).toBe("error");
    expect(updatedItem?.queue_status).not.toBe("video_ready");
    expect(updatedItem?.video_url).toBe("");
    expect(assets.map((asset) => asset.asset_type)).toEqual(["thumbnail", "subtitle", "upload_package"]);
  });

  test("fail stores error message and leaves job retryable when retries remain", async () => {
    const repository = getAutomationRepository();
    const job = await repository.createWorkerJob({
      job_type: "video_render",
      product_queue_id: "",
      product_candidate_id: "",
      priority: 1,
      payload: {},
      max_retries: 3
    });
    await claimJob(workerRequest({ worker_id: "worker-1", job_types: ["video_render"] }));

    const response = await failJob(
      workerRequest({ worker_id: "worker-1", error_message: "render failed" }),
      routeContext(job.id)
    );
    const updated = await repository.getWorkerJob(job.id);

    expect(response.status).toBe(200);
    expect(updated).toMatchObject({
      status: "retry_wait",
      error_message: "render failed",
      retry_count: 1
    });
  });
});

describe("next batch worker dispatch", () => {
  beforeEach(() => {
    resetMockRepositoryForTests();
    process.env.WORKER_API_SECRET = "worker-secret";
    delete process.env.N8N_NEXT_BATCH_WEBHOOK_URL;
    delete process.env.N8N_WEBHOOK_SECRET;
  });

  test("creates worker jobs instead of calling n8n", async () => {
    await getAutomationRepository().updateSettings({ is_paused: false, batch_size: 2 });
    const repository = getAutomationRepository();
    const scheduledItems = await repository.getQueue({ status: "scheduled", limit: 2 });
    for (const item of scheduledItems) {
      await makeItemRenderable(item.id);
    }
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const response = await nextBatch();
    const payload = await readJson(response);
    const jobs = await repository.getWorkerJobs();
    const processingItems = await repository.getQueue({ status: "processing" });

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ ok: true, created_jobs: 2 });
    expect(jobs.filter((job) => job.job_type === "video_render")).toHaveLength(2);
    expect(processingItems.length).toBeGreaterThanOrEqual(2);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("creates a video_render job for a renderable worker smoke seed item", async () => {
    const repository = getAutomationRepository();
    await repository.updateSettings({ is_paused: false, batch_size: 1 });
    const seedResponse = await seedDevQueue(
      new Request("http://localhost/api/dev/seed", {
        method: "POST",
        body: JSON.stringify({ mode: "worker-smoke" })
      })
    );
    const seedPayload = await readJson(seedResponse);

    const response = await nextBatch();
    const payload = await readJson(response);
    const jobs = await repository.getWorkerJobs();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ ok: true, created_jobs: 1 });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      job_type: "video_render",
      status: "pending",
      product_queue_id: seedPayload.item_id
    });
    expect(jobs[0].payload).toMatchObject({
      selected_affiliate_url: expect.stringContaining("https://link.coupang.com"),
      disclosure_text: expect.stringContaining("쿠팡 파트너스"),
      script: expect.stringContaining("worker smoke")
    });
  });

  test("does not create worker jobs when python worker dispatch is disabled", async () => {
    const repository = getAutomationRepository();
    await repository.updateSettings({ is_paused: false, python_worker_enabled: false });
    const response = await nextBatch();
    const payload = await readJson(response);

    expect(response.status).toBe(409);
    expect(payload).toMatchObject({ ok: false, created_jobs: 0 });
    expect(await repository.getWorkerJobs()).toHaveLength(0);
  });

  test("does not create worker jobs when video_render is not allowed", async () => {
    const repository = getAutomationRepository();
    await repository.updateSettings({ is_paused: false, allowed_worker_job_types: ["sheet_sync"] });
    const response = await nextBatch();
    const payload = await readJson(response);

    expect(response.status).toBe(409);
    expect(payload).toMatchObject({ ok: false, created_jobs: 0 });
    expect(await repository.getWorkerJobs()).toHaveLength(0);
  });

  test("moves item without selected affiliate url to manual review instead of creating a job", async () => {
    const repository = getAutomationRepository();
    await repository.updateSettings({ is_paused: false, batch_size: 1 });
    const item = (await repository.getQueue({ status: "scheduled", limit: 1 }))[0];
    await repository.updateQueueItemById(item.id, {
      selected_affiliate_url: "",
      thumbnail_url: "https://picsum.photos/seed/renderable/360/240"
    });
    await repository.upsertGeneratedContent(buildGeneratedContent(item.id, { disclosure_text: "제휴 고지 문구", video_script: "대본" }));

    const response = await nextBatch();
    const updated = await repository.getQueueItem(item.id);

    expect(response.status).toBe(200);
    expect((await readJson(response)).created_jobs).toBe(0);
    expect(updated?.queue_status).toBe("manual_review");
    expect(updated?.error_message).toContain("제휴 링크");
    expect(await repository.getWorkerJobs()).toHaveLength(0);
  });

  test("moves item without disclosure text to manual review instead of creating a job", async () => {
    const repository = getAutomationRepository();
    await repository.updateSettings({ is_paused: false, batch_size: 1 });
    const item = (await repository.getQueue({ status: "scheduled", limit: 1 }))[0];
    await repository.updateQueueItemById(item.id, {
      selected_affiliate_url: "https://link.coupang.com/a/renderable",
      thumbnail_url: "https://picsum.photos/seed/renderable/360/240"
    });
    await repository.upsertGeneratedContent(buildGeneratedContent(item.id, { disclosure_text: "", video_script: "대본" }));

    const response = await nextBatch();
    const updated = await repository.getQueueItem(item.id);

    expect(response.status).toBe(200);
    expect((await readJson(response)).created_jobs).toBe(0);
    expect(updated?.queue_status).toBe("manual_review");
    expect(updated?.error_message).toContain("제휴 고지");
    expect(await repository.getWorkerJobs()).toHaveLength(0);
  });

  test("does not create additional jobs when max daily videos is reached", async () => {
    const repository = getAutomationRepository();
    await repository.updateSettings({ is_paused: false, batch_size: 2, max_daily_videos: 1 });
    const scheduledItems = await repository.getQueue({ status: "scheduled", limit: 2 });
    for (const item of scheduledItems) {
      await makeItemRenderable(item.id);
    }
    await repository.createWorkerJob({
      job_type: "video_render",
      product_queue_id: "existing",
      product_candidate_id: "",
      priority: 1,
      payload: {},
      max_retries: 3
    });

    const response = await nextBatch();
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ ok: true, created_jobs: 0 });
    expect((await repository.getWorkerJobs()).filter((job) => job.job_type === "video_render")).toHaveLength(1);
  });

  test("returns safe no-op response when no scheduled items are due", async () => {
    const repository = getAutomationRepository();
    await repository.updateSettings({ is_paused: false, batch_size: 2 });
    const scheduledItems = await repository.getQueue({ status: "scheduled" });
    for (const item of scheduledItems) {
      await repository.updateQueueItemById(item.id, {
        scheduled_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      });
    }

    const response = await nextBatch();
    const payload = await readJson(response);
    const runs = await repository.getRuns();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      selected_items: 0,
      created_jobs: 0,
      message: "처리할 예약 상품이 없습니다."
    });
    expect(runs[0].safe_message).toBe("처리할 예약 상품이 없습니다.");
  });
});

async function makeItemRenderable(id: string) {
  const repository = getAutomationRepository();
  await repository.updateQueueItemById(id, {
    selected_affiliate_url: `https://link.coupang.com/a/${id}`,
    thumbnail_url: `https://picsum.photos/seed/${id}/360/240`
  });
  await repository.upsertGeneratedContent(
    buildGeneratedContent(id, {
      disclosure_text: "이 콘텐츠는 제휴 링크를 포함합니다.",
      video_script: "상품 장점을 짧게 소개하는 영상 대본입니다."
    })
  );
}

function buildGeneratedContent(
  productQueueId: string,
  overrides: Partial<GeneratedContent> = {}
): GeneratedContent {
  const now = new Date().toISOString();
  return {
    id: `content-${productQueueId}`,
    product_queue_id: productQueueId,
    raw_coupang_url: `https://www.coupang.com/vp/products/${productQueueId}`,
    product_name: `Renderable ${productQueueId}`,
    selected_affiliate_url: `https://link.coupang.com/a/${productQueueId}`,
    video_title: "렌더 테스트",
    video_script: "상품 장점을 짧게 소개하는 영상 대본입니다.",
    caption_1: "",
    caption_2: "",
    caption_3: "",
    threads_text: "",
    blog_title: "",
    blog_body: "",
    hashtags: "",
    youtube_description: "",
    tiktok_caption: "",
    disclosure_text: "이 콘텐츠는 제휴 링크를 포함합니다.",
    content_source: "fallback" as const,
    creatomate_render_id: "",
    video_url: "",
    video_snapshot_url: "",
    video_status: "not_started",
    blog_draft_url: "",
    blog_draft_status: "not_started",
    created_at: now,
    updated_at: now,
    ...overrides
  };
}
