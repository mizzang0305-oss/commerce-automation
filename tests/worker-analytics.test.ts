import { describe, expect, test } from "vitest";
import type { WorkerHeartbeat, WorkerJob } from "@/types/automation";
import {
  countFfmpegFailures,
  countJobsByStatus,
  countJobsByType,
  getCompletedVideoJobsWithoutVideoUrl,
  getRecentFailureReasons,
  getStaleWorkerJobs,
  summarizeWorkerHeartbeats,
  summarizeWorkerJobs
} from "@/lib/workerAnalytics";

describe("worker analytics", () => {
  test("summarizes worker jobs by status, type, and ffmpeg failures", () => {
    const jobs = [
      buildJob({ id: "pending-1", status: "pending" }),
      buildJob({ id: "retry-1", status: "retry_wait", error_message: "ffmpeg가 PATH에 없어 영상 렌더링을 실행하지 못했습니다." }),
      buildJob({ id: "completed-1", status: "completed", result: { video_url: "" } }),
      buildJob({ id: "sheet-1", job_type: "sheet_sync", status: "completed" })
    ];

    const summary = summarizeWorkerJobs(jobs);

    expect(summary.total).toBe(4);
    expect(summary.byStatus.retry_wait).toBe(1);
    expect(summary.byType.video_render).toBe(3);
    expect(summary.byType.sheet_sync).toBe(1);
    expect(countJobsByStatus(jobs).completed).toBe(2);
    expect(countJobsByType(jobs).sheet_sync).toBe(1);
    expect(summary.ffmpegFailureCount).toBe(1);
    expect(countFfmpegFailures(jobs)).toBe(1);
    expect(summary.completedVideoRenderMissingVideoUrl).toHaveLength(1);
    expect(getCompletedVideoJobsWithoutVideoUrl(jobs)).toHaveLength(1);
    expect(getRecentFailureReasons(jobs, 1)).toEqual([
      { reason: "ffmpeg가 PATH에 없어 영상 렌더링을 실행하지 못했습니다.", count: 1 }
    ]);
  });

  test("detects stale processing and claimed jobs", () => {
    const jobs = [
      buildJob({ id: "fresh", status: "processing", heartbeat_at: "2026-05-24T00:50:00.000Z" }),
      buildJob({ id: "stale", status: "claimed", claimed_at: "2026-05-24T00:00:00.000Z", heartbeat_at: "" })
    ];

    expect(getStaleWorkerJobs(jobs, new Date("2026-05-24T01:00:00.000Z"), 30).map((job) => job.id)).toEqual(["stale"]);
  });

  test("summarizes worker heartbeats and per-worker job results", () => {
    const heartbeats: WorkerHeartbeat[] = [
      buildHeartbeat({ worker_id: "worker-a", status: "online", last_heartbeat_at: "2026-05-24T00:59:00.000Z" }),
      buildHeartbeat({ worker_id: "worker-b", status: "online", last_heartbeat_at: "2026-05-24T00:00:00.000Z" })
    ];
    const jobs = [
      buildJob({ claimed_by: "worker-a", status: "completed" }),
      buildJob({ claimed_by: "worker-a", status: "failed" }),
      buildJob({ claimed_by: "worker-b", status: "retry_wait" })
    ];

    const summary = summarizeWorkerHeartbeats(heartbeats, jobs, new Date("2026-05-24T01:00:00.000Z"), 15);

    expect(summary.onlineCount).toBe(1);
    expect(summary.offlineCount).toBe(1);
    expect(summary.staleWorkers.map((worker) => worker.worker_id)).toEqual(["worker-b"]);
    expect(summary.byWorker["worker-a"]).toMatchObject({ totalJobs: 2, failedJobs: 1 });
  });
});

function buildJob(overrides: Partial<WorkerJob> = {}): WorkerJob {
  return {
    id: "job",
    job_type: "video_render",
    status: "pending",
    product_queue_id: "queue-1",
    product_candidate_id: "",
    priority: 1,
    payload: {},
    result: {},
    claimed_by: "",
    claimed_at: "",
    heartbeat_at: "",
    error_message: "",
    retry_count: 0,
    max_retries: 3,
    created_at: "2026-05-24T00:00:00.000Z",
    started_at: "",
    finished_at: "",
    ...overrides
  };
}

function buildHeartbeat(overrides: Partial<WorkerHeartbeat> = {}): WorkerHeartbeat {
  return {
    worker_id: "worker",
    status: "online",
    current_job_id: "",
    current_job_type: "",
    last_heartbeat_at: "2026-05-24T00:00:00.000Z",
    updated_at: "2026-05-24T00:00:00.000Z",
    ...overrides
  };
}
