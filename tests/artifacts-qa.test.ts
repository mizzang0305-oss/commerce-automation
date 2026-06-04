import { describe, expect, test } from "vitest";
import { GET as getArtifacts } from "../app/api/artifacts/route";
import { GET as getArtifact } from "../app/api/artifacts/[id]/route";
import { POST as updateArtifactQa } from "../app/api/artifacts/[id]/qa/route";
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
  const claimed = await repository.claimWorkerJob({ worker_id: "qa-worker", job_types: ["video_render"] });
  await repository.completeWorkerJob(claimed?.id ?? job.id, "qa-worker", {
    video_url: "https://r2.example.com/rendered-videos/video.mp4",
    thumbnail_url: "https://r2.example.com/thumbnails/thumb.jpg",
    srt_url: "https://r2.example.com/subtitles/subtitle.srt",
    upload_package_url: "https://r2.example.com/upload-packages/package.json"
  });
  const [asset] = await repository.getProductAssets(item.id);
  return { repository, item, asset };
}

describe("worker artifact QA API", () => {
  test("lists safe artifact summaries and flags missing artifact groups", async () => {
    await createCompletedArtifact();

    const response = await getArtifacts();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.summary).toEqual(
      expect.objectContaining({
        passed: 0,
        needs_fix: 0,
        rejected: 0,
        missing_video: 0,
        missing_upload_package: 0
      })
    );
    expect(payload.artifacts[0]).toEqual(
      expect.objectContaining({
        video_exists: true,
        thumbnail_exists: true,
        subtitle_exists: true,
        upload_package_exists: true,
        qa_status: "pending"
      })
    );
    expect(JSON.stringify(payload)).not.toContain("R2_SECRET");
  });

  test("updates QA status without creating worker jobs or upload side effects", async () => {
    const { repository, asset } = await createCompletedArtifact();
    const initialJobs = await repository.getWorkerJobs();

    const response = await updateArtifactQa(
      new Request(`http://localhost/api/artifacts/${asset.id}/qa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qa_status: "passed", qa_note: "영상/썸네일/자막/upload package 확인 완료" })
      }),
      { params: Promise.resolve({ id: asset.id }) }
    );
    const payload = await response.json();
    const finalJobs = await repository.getWorkerJobs();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      artifact: {
        qa_status: "passed",
        qa_note: "영상/썸네일/자막/upload package 확인 완료"
      },
      upload_triggered: false,
      worker_jobs_created: false
    });
    expect(finalJobs).toHaveLength(initialJobs.length);

    const detail = await getArtifact(new Request(`http://localhost/api/artifacts/${asset.id}`), {
      params: Promise.resolve({ id: asset.id })
    });
    await expect(detail.json()).resolves.toMatchObject({
      artifact: {
        qa_status: "passed"
      }
    });
  });
});
