import { describe, expect, test } from "vitest";
import { GET as getArtifacts } from "../app/api/artifacts/route";
import { POST as updateArtifactQa } from "../app/api/artifacts/[id]/qa/route";
import { resetMockRepositoryForTests } from "@/lib/repositories/automationRepository";

async function createCompletedArtifact(queueIndex = 0) {
  const repository = resetMockRepositoryForTests();
  const items = await repository.getQueue({ status: "scheduled", limit: 5 });
  const item = items[queueIndex];
  const job = await repository.createWorkerJob({
    job_type: "video_render",
    product_queue_id: item.id,
    product_candidate_id: "",
    priority: 10,
    payload: {},
    max_retries: 1
  });
  const claimed = await repository.claimWorkerJob({ worker_id: `qa-filter-worker-${queueIndex}`, job_types: ["video_render"] });
  await repository.completeWorkerJob(claimed?.id ?? job.id, `qa-filter-worker-${queueIndex}`, {
    video_url: `https://r2.example.com/rendered-videos/video-${queueIndex}.mp4`,
    thumbnail_url: `https://r2.example.com/thumbnails/thumb-${queueIndex}.jpg`,
    srt_url: `https://r2.example.com/subtitles/subtitle-${queueIndex}.srt`,
    upload_package_url: `https://r2.example.com/upload-packages/package-${queueIndex}.json`
  });
  const [asset] = await repository.getProductAssets(item.id);
  return { repository, item, asset };
}

describe("artifact QA filters API", () => {
  test("filters artifact summaries by qa status, search text, asset type, and sort order", async () => {
    const { item, asset } = await createCompletedArtifact(0);
    await updateArtifactQa(
      new Request(`http://localhost/api/artifacts/${asset.id}/qa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qa_status: "passed", qa_note: "R2 artifact links verified." })
      }),
      { params: Promise.resolve({ id: asset.id }) }
    );

    const response = await getArtifacts(
      new Request(
        `http://localhost/api/artifacts?qa_status=passed&asset_type=video&search=${encodeURIComponent(item.product_name)}&sort=oldest`
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.filters).toEqual(
      expect.objectContaining({
        qa_status: "passed",
        asset_type: "video",
        search: item.product_name,
        sort: "oldest"
      })
    );
    expect(payload.artifacts).toHaveLength(1);
    expect(payload.artifacts[0]).toEqual(
      expect.objectContaining({
        product_queue_id: item.id,
        qa_status: "passed",
        asset_types: expect.arrayContaining(["video", "thumbnail", "subtitle", "upload_package"])
      })
    );
  });

  test("filters artifact summaries by explicit missing_* filter names", async () => {
    const repository = resetMockRepositoryForTests();
    const [item] = await repository.getQueue({ status: "scheduled", limit: 1 });
    const job = await repository.createWorkerJob({
      job_type: "video_render",
      product_queue_id: item.id,
      product_candidate_id: "",
      priority: 10,
      payload: {},
      max_retries: 1
    });
    const claimed = await repository.claimWorkerJob({ worker_id: "qa-missing-filter-worker", job_types: ["video_render"] });
    const workerJobId = claimed?.id ?? job.id;
    const now = new Date().toISOString();
    const mutableRepository = repository as unknown as {
      productAssets: Array<Record<string, unknown>>;
    };
    mutableRepository.productAssets.push(
      {
        id: `asset-${workerJobId}-thumbnail`,
        product_queue_id: item.id,
        worker_job_id: workerJobId,
        asset_type: "thumbnail",
        bucket: "thumbnails",
        url: "https://r2.example.com/thumbnails/missing-video-thumb.jpg",
        render_qa_metadata: {},
        qa_status: "pending",
        qa_note: "",
        created_at: now,
        updated_at: now
      },
      {
        id: `asset-${workerJobId}-subtitle`,
        product_queue_id: item.id,
        worker_job_id: workerJobId,
        asset_type: "subtitle",
        bucket: "subtitles",
        url: "https://r2.example.com/subtitles/missing-video.srt",
        render_qa_metadata: {},
        qa_status: "pending",
        qa_note: "",
        created_at: now,
        updated_at: now
      },
      {
        id: `asset-${workerJobId}-upload_package`,
        product_queue_id: item.id,
        worker_job_id: workerJobId,
        asset_type: "upload_package",
        bucket: "upload-packages",
        url: "https://r2.example.com/upload-packages/missing-video.json",
        render_qa_metadata: {},
        qa_status: "pending",
        qa_note: "",
        created_at: now,
        updated_at: now
      }
    );

    const response = await getArtifacts(new Request("http://localhost/api/artifacts?missing=missing_video"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.filters).toEqual(expect.objectContaining({ missing: "missing_video" }));
    expect(payload.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          product_queue_id: item.id,
          missing_asset_types: expect.arrayContaining(["video"])
        })
      ])
    );
  });
});
