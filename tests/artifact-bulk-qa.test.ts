import { describe, expect, test } from "vitest";
import { POST as bulkUpdateArtifactQa } from "../app/api/artifacts/bulk-qa/route";
import { GET as getArtifact } from "../app/api/artifacts/[id]/route";
import { resetMockRepositoryForTests } from "@/lib/repositories/automationRepository";

async function createCompletedArtifact() {
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
  const claimed = await repository.claimWorkerJob({ worker_id: "bulk-qa-worker", job_types: ["video_render"] });
  await repository.completeWorkerJob(claimed?.id ?? job.id, "bulk-qa-worker", {
    video_url: "https://r2.example.com/rendered-videos/video.mp4",
    thumbnail_url: "https://r2.example.com/thumbnails/thumb.jpg",
    srt_url: "https://r2.example.com/subtitles/subtitle.srt",
    upload_package_url: "https://r2.example.com/upload-packages/package.json"
  });
  const assets = await repository.getProductAssets(item.id);
  return { repository, item, assets };
}

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/artifacts/bulk-qa", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("artifact bulk QA API", () => {
  test("updates selected artifact QA fields without worker, upload, or queue side effects", async () => {
    const { repository, assets } = await createCompletedArtifact();
    const initialJobs = await repository.getWorkerJobs();
    const selected = assets.slice(0, 2);

    const response = await bulkUpdateArtifactQa(
      request({
        artifact_ids: selected.map((asset) => asset.id),
        qa_status: "needs_fix",
        qa_note: "Subtitle timing needs operator review."
      })
    );
    const payload = await response.json();
    const finalJobs = await repository.getWorkerJobs();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      requested_count: 2,
      updated_count: 2,
      skipped_count: 0,
      upload_triggered: false,
      worker_jobs_created: false,
      queue_auto_uploaded_or_posted: false
    });
    expect(finalJobs).toHaveLength(initialJobs.length);

    const detail = await getArtifact(new Request(`http://localhost/api/artifacts/${selected[0].id}`), {
      params: Promise.resolve({ id: selected[0].id })
    });
    await expect(detail.json()).resolves.toMatchObject({
      artifact: {
        qa_status: "needs_fix",
        qa_note: "Subtitle timing needs operator review."
      }
    });
  });

  test("rejects empty selection and invalid QA status with safe JSON", async () => {
    const emptyResponse = await bulkUpdateArtifactQa(request({ artifact_ids: [], qa_status: "passed" }));
    await expect(emptyResponse.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ARTIFACT_IDS_REQUIRED"
    });
    expect(emptyResponse.status).toBe(400);

    const invalidResponse = await bulkUpdateArtifactQa(request({ artifact_ids: ["asset-1"], qa_status: "uploaded" }));
    await expect(invalidResponse.json()).resolves.toMatchObject({
      ok: false,
      error_code: "INVALID_QA_STATUS"
    });
    expect(invalidResponse.status).toBe(400);
  });
});
