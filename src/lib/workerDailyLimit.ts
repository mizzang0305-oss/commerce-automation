import type { WorkerJob } from "@/types/automation";

const DAILY_LIMIT_EXCLUDED_STATUSES = new Set(["failed", "cancelled"]);

export function getKstDateKey(value: Date | string = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

export function countKstDailyVideoRenderJobs(jobs: WorkerJob[], now: Date | string = new Date()) {
  const today = getKstDateKey(now);

  return jobs.filter((job) => {
    return (
      job.job_type === "video_render" &&
      getKstDateKey(job.created_at) === today &&
      !DAILY_LIMIT_EXCLUDED_STATUSES.has(job.status)
    );
  }).length;
}
