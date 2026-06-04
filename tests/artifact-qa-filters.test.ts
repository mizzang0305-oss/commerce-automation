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
});
