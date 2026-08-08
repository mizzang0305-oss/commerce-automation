import { statfs } from "node:fs/promises";
import { LocalQueueRepository, kstDate } from "./repository";

export async function getQueueSchedulerStatus(repository = new LocalQueueRepository(), now = new Date()) {
  const [items, runs, settings, disk] = await Promise.all([repository.items(), repository.runs(), repository.settings(), statfs(repository.root)]);
  const today = items.filter((item) => item.queueDate === kstDate(now));
  const count = (status: string) => today.filter((item) => item.status === status).length;
  return { today: kstDate(now), total: today.length, queued: count("scheduled"), due: today.filter((item) => item.status === "scheduled" && Date.parse(item.scheduledAt) <= now.getTime()).length, processing: count("claimed") + count("processing"), videoReady: count("video_ready_autoqa"), retry: count("retry_wait"), failed: count("failed"), blocked: count("blocked"), nextDue: today.filter((item) => item.status === "scheduled").sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0]?.scheduledAt ?? null, lastNightlyRun: [...runs].reverse().find((run) => run.type === "nightly_discovery") ?? null, lastBatchRun: [...runs].reverse().find((run) => run.type === "scheduled_batch") ?? null, diskFreeGb: Math.round(Number(disk.bavail * disk.bsize) / 1024 / 1024 / 1024 * 100) / 100, settings, SAFE_TO_UPLOAD: false, SAFE_TO_PUBLIC_UPLOAD: false, PLATFORM_UPLOAD: 0 };
}
