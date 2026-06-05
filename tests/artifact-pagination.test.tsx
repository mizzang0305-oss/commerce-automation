import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { GET as getArtifacts } from "../app/api/artifacts/route";
import { ArtifactQaClient } from "@/components/ArtifactQaClient";
import { resetMockRepositoryForTests } from "@/lib/repositories/automationRepository";

async function createArtifacts(count: number) {
  const repository = resetMockRepositoryForTests();
  const items = await repository.getQueue({ status: "scheduled", limit: count });
  for (const [index, item] of items.entries()) {
    const job = await repository.createWorkerJob({
      job_type: "video_render",
      product_queue_id: item.id,
      product_candidate_id: "",
      priority: 10,
      payload: {},
      max_retries: 1
    });
    const claimed = await repository.claimWorkerJob({ worker_id: `pagination-worker-${index}`, job_types: ["video_render"] });
    await repository.completeWorkerJob(claimed?.id ?? job.id, `pagination-worker-${index}`, {
      video_url: `https://r2.example.com/rendered-videos/video-${index}.mp4`,
      thumbnail_url: `https://r2.example.com/thumbnails/thumb-${index}.jpg`,
      srt_url: `https://r2.example.com/subtitles/subtitle-${index}.srt`,
      upload_package_url: `https://r2.example.com/upload-packages/package-${index}.json`
    });
  }
  return repository;
}

describe("artifact QA pagination", () => {
  test("returns pagination metadata and clamps page size", async () => {
    const repository = await createArtifacts(3);
    const initialJobs = await repository.getWorkerJobs();

    const response = await getArtifacts(new Request("http://localhost/api/artifacts?page=1&page_size=500&sort=newest"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.pagination).toEqual(
      expect.objectContaining({
        page: 1,
        page_size: 100,
        total_items: 3,
        total_pages: 1,
        has_next: false,
        has_prev: false
      })
    );
    expect(payload.side_effects).toEqual({
      upload_triggered: false,
      worker_jobs_created: false,
      queue_auto_uploaded_or_posted: false
    });
    await expect(repository.getWorkerJobs()).resolves.toHaveLength(initialJobs.length);
  });

  test("artifact pagination controls preserve filters and reset page when filters change", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        artifacts,
        summary,
        pagination: { page: 1, page_size: 10, total_items: 1, total_pages: 1, has_next: false, has_prev: false }
      })
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ArtifactQaClient
        artifacts={artifacts}
        summary={summary}
        pagination={{ page: 2, page_size: 25, total_items: 40, total_pages: 2, has_next: false, has_prev: true }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("page=1"), expect.any(Object));
    });

    fireEvent.change(screen.getByLabelText("QA"), { target: { value: "passed" } });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("qa_status=passed"), expect.any(Object));
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("page=1"), expect.any(Object));
    });
  });
});

const artifacts = [
  {
    id: "artifact-pagination-1",
    product_queue_id: "queue-pagination-1",
    product_name: "Pagination product",
    video_url: "https://r2.example.com/video.mp4",
    thumbnail_url: "https://r2.example.com/thumb.jpg",
    subtitle_url: "https://r2.example.com/subtitle.srt",
    upload_package_url: "https://r2.example.com/package.json",
    video_exists: true,
    thumbnail_exists: true,
    subtitle_exists: true,
    upload_package_exists: true,
    asset_types: ["video", "thumbnail", "subtitle", "upload_package"],
    missing_asset_types: [],
    qa_status: "pending" as const,
    qa_note: "",
    created_at: "2026-06-05T00:00:00.000Z"
  }
];

const summary = {
  total: 1,
  pending: 1,
  passed: 0,
  needs_fix: 0,
  rejected: 0,
  missing_video: 0,
  missing_thumbnail: 0,
  missing_subtitle: 0,
  missing_upload_package: 0
};
