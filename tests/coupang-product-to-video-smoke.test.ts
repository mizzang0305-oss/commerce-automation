import { beforeEach, describe, expect, test, vi } from "vitest";
import { POST as startSmoke } from "../app/api/dev/coupang-product-to-video-smoke/start/route";
import { POST as promoteSmoke } from "../app/api/dev/coupang-product-to-video-smoke/promote/route";
import { POST as generateSmokeContent } from "../app/api/dev/coupang-product-to-video-smoke/generate-content/route";
import { POST as nextBatchSmoke } from "../app/api/dev/coupang-product-to-video-smoke/next-batch/route";
import { GET as getSmokeStatus } from "../app/api/dev/coupang-product-to-video-smoke/status/route";
import { getAutomationRepository, resetMockRepositoryForTests } from "@/lib/repositories/automationRepository";

function postRequest(url: string, body: Record<string, unknown> = {}) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("Coupang product-to-video smoke workflow", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_DEV_TOOLS", "true");
    vi.stubEnv("WORKER_VISUAL_BINDING_SECRET", "worker-visual-binding-test-secret-0001");
    resetMockRepositoryForTests();
  });

  test("start creates only a product candidate", async () => {
    const repository = getAutomationRepository();
    const initialQueue = await repository.getQueue();
    const initialJobs = await repository.getWorkerJobs();

    const response = await startSmoke(postRequest("http://localhost/api/dev/coupang-product-to-video-smoke/start"));
    const payload = await readJson(response);
    const finalQueue = await repository.getQueue();
    const finalJobs = await repository.getWorkerJobs();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      step: "start",
      queue_items_created: 0,
      worker_jobs_created: 0
    });
    expect(payload.candidate_id).toEqual(expect.stringMatching(/^candidate-/));
    expect(payload.status).toMatchObject({
      stage: "candidate_created",
      candidate_id: payload.candidate_id,
      queue_id: ""
    });
    expect(finalQueue).toHaveLength(initialQueue.length);
    expect(finalJobs).toHaveLength(initialJobs.length);
  });

  test("promote creates queue and generated content scaffold without worker jobs", async () => {
    const startPayload = await readJson(
      await startSmoke(postRequest("http://localhost/api/dev/coupang-product-to-video-smoke/start"))
    );
    const repository = getAutomationRepository();
    const initialJobs = await repository.getWorkerJobs();

    const response = await promoteSmoke(
      postRequest("http://localhost/api/dev/coupang-product-to-video-smoke/promote", {
        candidate_id: startPayload.candidate_id
      })
    );
    const payload = await readJson(response);
    const queueItem = await repository.getQueueItem(String(payload.queue_id));
    const content = await repository.getGeneratedContentByQueueItem(String(payload.queue_id));
    const finalJobs = await repository.getWorkerJobs();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      step: "promote",
      created_worker_jobs: 0
    });
    expect(queueItem).toMatchObject({
      id: payload.queue_id,
      queue_status: "scheduled",
      thumbnail_url: expect.stringContaining("https://")
    });
    expect(content).toMatchObject({
      product_queue_id: payload.queue_id,
      disclosure_text: expect.stringContaining("제휴")
    });
    expect(finalJobs).toHaveLength(initialJobs.length);
  });

  test("generate-content fills video script but creates no worker jobs", async () => {
    const startPayload = await readJson(
      await startSmoke(postRequest("http://localhost/api/dev/coupang-product-to-video-smoke/start"))
    );
    const promotePayload = await readJson(
      await promoteSmoke(
        postRequest("http://localhost/api/dev/coupang-product-to-video-smoke/promote", {
          candidate_id: startPayload.candidate_id
        })
      )
    );
    const repository = getAutomationRepository();
    const initialJobs = await repository.getWorkerJobs();

    const response = await generateSmokeContent(
      postRequest("http://localhost/api/dev/coupang-product-to-video-smoke/generate-content", {
        queue_id: promotePayload.queue_id
      })
    );
    const payload = await readJson(response);
    const content = await repository.getGeneratedContentByQueueItem(String(promotePayload.queue_id));
    const finalJobs = await repository.getWorkerJobs();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      step: "generate-content",
      content_provider: "template",
      created_worker_jobs: 0
    });
    expect(content?.video_script).toContain(String(content?.product_name));
    expect(finalJobs).toHaveLength(initialJobs.length);
  });

  test("next-batch is the only smoke step that creates a worker job", async () => {
    const startPayload = await readJson(
      await startSmoke(postRequest("http://localhost/api/dev/coupang-product-to-video-smoke/start"))
    );
    const promotePayload = await readJson(
      await promoteSmoke(
        postRequest("http://localhost/api/dev/coupang-product-to-video-smoke/promote", {
          candidate_id: startPayload.candidate_id
        })
      )
    );
    await generateSmokeContent(
      postRequest("http://localhost/api/dev/coupang-product-to-video-smoke/generate-content", {
        queue_id: promotePayload.queue_id
      })
    );

    const response = await nextBatchSmoke(
      postRequest("http://localhost/api/dev/coupang-product-to-video-smoke/next-batch", {
        queue_id: promotePayload.queue_id
      })
    );
    const payload = await readJson(response);
    const jobs = await getAutomationRepository().getWorkerJobs();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      step: "next-batch",
      created_jobs: 1,
      status: {
        render_plan_attached: true,
        render_plan_shot_count: 5,
        render_plan_override_present: false,
        effective_render_plan_shot_count: 5
      }
    });
    expect(jobs).toEqual([
      expect.objectContaining({
        product_queue_id: promotePayload.queue_id,
        job_type: "video_render",
        status: "pending"
      })
    ]);
  });

  test("status reports next action and blocking reasons", async () => {
    const startPayload = await readJson(
      await startSmoke(postRequest("http://localhost/api/dev/coupang-product-to-video-smoke/start"))
    );
    const promoted = await readJson(
      await promoteSmoke(
        postRequest("http://localhost/api/dev/coupang-product-to-video-smoke/promote", {
          candidate_id: startPayload.candidate_id
        })
      )
    );

    const response = await getSmokeStatus(
      new Request(`http://localhost/api/dev/coupang-product-to-video-smoke/status?queue_id=${promoted.queue_id}`)
    );
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload.status).toMatchObject({
      queue_id: promoted.queue_id,
      stage: "promoted_to_queue",
      next_step: "generate-content",
      render_plan_override_present: false,
      effective_render_plan_shot_count: 0
    });
    expect(payload.status).toHaveProperty("blocking_reasons", expect.arrayContaining(["missing_script"]));
    expect(JSON.stringify(payload)).not.toContain("WORKER_API_SECRET");
    expect(JSON.stringify(payload)).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  test("production guard blocks start when dev tools are disabled", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_DEV_TOOLS", "");

    const response = await startSmoke(postRequest("http://localhost/api/dev/coupang-product-to-video-smoke/start"));

    expect(response.status).toBe(404);
    await expect(response.text()).resolves.toContain("Not found.");
  });
});
