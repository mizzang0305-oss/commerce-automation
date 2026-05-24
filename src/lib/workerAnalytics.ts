import type { WorkerHeartbeat, WorkerJob, WorkerJobStatus, WorkerJobType } from "@/types/automation";

const WORKER_JOB_STATUSES: WorkerJobStatus[] = [
  "pending",
  "claimed",
  "processing",
  "completed",
  "failed",
  "retry_wait",
  "cancelled"
];

const WORKER_JOB_TYPES: WorkerJobType[] = ["video_render", "sheet_sync"];

export function summarizeWorkerJobs(jobs: WorkerJob[]) {
  const byStatus = countJobsByStatus(jobs);
  const byType = countJobsByType(jobs);
  const retryWaitJobs: WorkerJob[] = [];

  for (const job of jobs) {
    if (job.status === "retry_wait") {
      retryWaitJobs.push(job);
    }
  }

  return {
    total: jobs.length,
    byStatus,
    byType,
    ffmpegFailureCount: countFfmpegFailures(jobs),
    retryWaitJobs,
    completedVideoRenderMissingVideoUrl: getCompletedVideoJobsWithoutVideoUrl(jobs),
    topFailureReasons: getRecentFailureReasons(jobs, 5)
  };
}

export function countJobsByStatus(jobs: WorkerJob[]) {
  const byStatus = Object.fromEntries(WORKER_JOB_STATUSES.map((status) => [status, 0])) as Record<WorkerJobStatus, number>;
  for (const job of jobs) {
    byStatus[job.status] += 1;
  }
  return byStatus;
}

export function countJobsByType(jobs: WorkerJob[]) {
  const byType = Object.fromEntries(WORKER_JOB_TYPES.map((type) => [type, 0])) as Record<WorkerJobType, number>;
  for (const job of jobs) {
    byType[job.job_type] += 1;
  }
  return byType;
}

export function countFfmpegFailures(jobs: WorkerJob[]) {
  return jobs.filter((job) => job.error_message.toLowerCase().includes("ffmpeg")).length;
}

export function getRecentFailureReasons(jobs: WorkerJob[], limit = 5) {
  const failureReasons = new Map<string, number>();
  for (const job of jobs) {
    if (job.error_message) {
      failureReasons.set(job.error_message, (failureReasons.get(job.error_message) ?? 0) + 1);
    }
  }
  return [...failureReasons.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason, "ko"))
    .slice(0, limit);
}

export function getCompletedVideoJobsWithoutVideoUrl(jobs: WorkerJob[]) {
  return jobs.filter((job) => job.job_type === "video_render" && job.status === "completed" && !getStringResult(job, "video_url"));
}

export function getStaleWorkerJobs(jobs: WorkerJob[], now: Date = new Date(), thresholdMinutes = 30) {
  const thresholdMs = thresholdMinutes * 60 * 1000;
  return jobs.filter((job) => {
    if (job.status !== "claimed" && job.status !== "processing") {
      return false;
    }
    const timestamp = job.heartbeat_at || job.started_at || job.claimed_at;
    if (!timestamp) {
      return true;
    }
    return now.getTime() - new Date(timestamp).getTime() > thresholdMs;
  });
}

export function summarizeWorkerHeartbeats(
  heartbeats: WorkerHeartbeat[],
  jobs: WorkerJob[] = [],
  now: Date = new Date(),
  staleMinutes = 15
) {
  const staleWorkers = heartbeats.filter((worker) => {
    if (!worker.last_heartbeat_at) {
      return true;
    }
    return now.getTime() - new Date(worker.last_heartbeat_at).getTime() > staleMinutes * 60 * 1000;
  });
  const staleIds = new Set(staleWorkers.map((worker) => worker.worker_id));
  const byWorker: Record<string, { totalJobs: number; failedJobs: number; completedJobs: number; retryWaitJobs: number }> = {};

  for (const worker of heartbeats) {
    byWorker[worker.worker_id] = { totalJobs: 0, failedJobs: 0, completedJobs: 0, retryWaitJobs: 0 };
  }
  for (const job of jobs) {
    if (!job.claimed_by) {
      continue;
    }
    byWorker[job.claimed_by] ??= { totalJobs: 0, failedJobs: 0, completedJobs: 0, retryWaitJobs: 0 };
    byWorker[job.claimed_by].totalJobs += 1;
    if (job.status === "failed") {
      byWorker[job.claimed_by].failedJobs += 1;
    }
    if (job.status === "completed") {
      byWorker[job.claimed_by].completedJobs += 1;
    }
    if (job.status === "retry_wait") {
      byWorker[job.claimed_by].retryWaitJobs += 1;
    }
  }

  const heartbeatTimes = heartbeats
    .map((worker) => worker.last_heartbeat_at)
    .filter(Boolean)
    .sort();

  return {
    total: heartbeats.length,
    onlineCount: heartbeats.filter((worker) => worker.status === "online" && !staleIds.has(worker.worker_id)).length,
    offlineCount: heartbeats.filter((worker) => worker.status === "offline" || staleIds.has(worker.worker_id)).length,
    staleWorkers,
    lastHeartbeatAt: heartbeatTimes.length > 0 ? heartbeatTimes[heartbeatTimes.length - 1] : "",
    byWorker
  };
}

function getStringResult(job: WorkerJob, key: string) {
  const value = job.result[key];
  return typeof value === "string" ? value.trim() : "";
}
