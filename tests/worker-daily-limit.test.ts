import { describe, expect, test } from "vitest";
import type { WorkerJob } from "@/types/automation";
import { countKstDailyVideoRenderJobs, getKstDateKey } from "@/lib/workerDailyLimit";

describe("worker daily limit", () => {
  test("formats date keys with the Asia/Seoul business date", () => {
    expect(getKstDateKey("2026-05-24T15:30:00.000Z")).toBe("2026-05-25");
  });

  test("counts video_render jobs by KST date and excludes failed or cancelled jobs", () => {
    const now = "2026-05-24T15:30:00.000Z";
    const jobs = [
      buildJob({ id: "same-kst-pending", created_at: "2026-05-24T16:00:00.000Z", status: "pending" }),
      buildJob({ id: "same-kst-completed", created_at: "2026-05-25T01:00:00.000Z", status: "completed" }),
      buildJob({ id: "previous-kst", created_at: "2026-05-24T14:59:59.000Z", status: "pending" }),
      buildJob({ id: "same-kst-failed", created_at: "2026-05-24T16:00:00.000Z", status: "failed" }),
      buildJob({ id: "same-kst-cancelled", created_at: "2026-05-24T16:00:00.000Z", status: "cancelled" }),
      buildJob({ id: "same-kst-sheet", job_type: "sheet_sync", created_at: "2026-05-24T16:00:00.000Z" })
    ];

    expect(countKstDailyVideoRenderJobs(jobs, now)).toBe(2);
  });
});

function buildJob(overrides: Partial<WorkerJob> = {}): WorkerJob {
  return {
    id: "job",
    job_type: "video_render",
    status: "pending",
    product_queue_id: "",
    product_candidate_id: "",
    priority: 0,
    payload: {},
    result: {},
    claimed_by: "",
    claimed_at: "",
    heartbeat_at: "",
    error_message: "",
    retry_count: 0,
    max_retries: 3,
    created_at: "2026-05-24T16:00:00.000Z",
    started_at: "",
    finished_at: "",
    ...overrides
  };
}
