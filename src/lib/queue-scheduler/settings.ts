import type { QueueSchedulerSettings } from "./types";

export const DEFAULT_QUEUE_SCHEDULER_SETTINGS: QueueSchedulerSettings = Object.freeze({
  mode: "no_upload_pilot",
  dailyTargetCount: 9,
  batchSize: 3,
  intervalHours: 1,
  startHour: 1,
  endHour: 23,
  pilotMaxDailyItems: 9,
  uploadEnabled: false,
  isPaused: false,
  enabled: false,
  minimumFreeGb: 5,
  leaseMinutes: 120,
  retryBackoffMinutes: 30,
  maxAttempts: 2,
  maxProductCandidates: 3
});

export function validateSettings(value: QueueSchedulerSettings): QueueSchedulerSettings {
  if (value.uploadEnabled !== false) throw new Error("UPLOAD_MUST_REMAIN_DISABLED");
  if (value.pilotMaxDailyItems !== 9 || value.dailyTargetCount > 9) throw new Error("PILOT_MAX_DAILY_ITEMS_INVALID");
  if (value.batchSize !== 3) throw new Error("PILOT_BATCH_SIZE_INVALID");
  if (value.intervalHours < 1 || value.startHour < 0 || value.endHour > 23 || value.startHour > value.endHour) throw new Error("SCHEDULE_SETTINGS_INVALID");
  if (value.maxAttempts < 1 || value.maxAttempts > 2) throw new Error("RETRY_LIMIT_INVALID");
  if (value.maxProductCandidates !== 3) throw new Error("PRODUCT_CANDIDATE_LIMIT_INVALID");
  return value;
}
