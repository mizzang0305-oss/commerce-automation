import { beforeEach, describe, expect, test, vi } from "vitest";
import { POST as claimJob } from "../app/api/worker/jobs/claim/route";
import { POST as heartbeatJob } from "../app/api/worker/jobs/[id]/heartbeat/route";
import { POST as completeJob } from "../app/api/worker/jobs/[id]/complete/route";
import { POST as failJob } from "../app/api/worker/jobs/[id]/fail/route";
import { GET as workerStatus } from "../app/api/worker/status/route";
import { POST as nextBatch } from "../app/api/run/next-batch/route";
import { getAutomationRepository, resetMockRepositoryForTests } from "@/lib/repositories/automationRepository";

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
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const response = await nextBatch();
    const payload = await readJson(response);
    const jobs = await getAutomationRepository().getWorkerJobs();
    const processingItems = await getAutomationRepository().getQueue({ status: "processing" });

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ ok: true, created_jobs: 2 });
    expect(jobs.filter((job) => job.job_type === "video_render")).toHaveLength(2);
    expect(processingItems.length).toBeGreaterThanOrEqual(2);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
