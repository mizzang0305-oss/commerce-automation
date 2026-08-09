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
  maxProductCandidates: 3,
  reserveRatio: 0.2,
  minimumReserveCount: 0,
  maxRawDiscoveries: 30,
  maxProviderCalls: 10,
  processingDailyCap: 9,
  maxCategoryRatio: 1,
  maxProductFamilyRatio: 1,
  maxExactAssetReuse: 5,
  observationMode: false,
  autoPauseAfterObservation: false
});

export const DAILY_69_NO_UPLOAD_SETTINGS: QueueSchedulerSettings = Object.freeze({
  ...DEFAULT_QUEUE_SCHEDULER_SETTINGS,
  mode: "no_upload_daily_69",
  dailyTargetCount: 69,
  pilotMaxDailyItems: 69,
  startHour: 1,
  endHour: 23,
  minimumFreeGb: 20,
  minimumReserveCount: 14,
  maxRawDiscoveries: 240,
  maxProviderCalls: 30,
  processingDailyCap: 9,
  maxCategoryRatio: 0.35,
  maxProductFamilyRatio: 0.1,
  maxExactAssetReuse: 5,
  enabled: false,
  isPaused: true
});

export function validateSettings(value: QueueSchedulerSettings): QueueSchedulerSettings {
  if (value.uploadEnabled !== false) throw new Error("UPLOAD_MUST_REMAIN_DISABLED");
  if (!Number.isInteger(value.dailyTargetCount) || value.dailyTargetCount < 1 || value.dailyTargetCount > 69) throw new Error("DAILY_TARGET_COUNT_INVALID");
  if (!Number.isInteger(value.pilotMaxDailyItems) || value.pilotMaxDailyItems < 1 || value.pilotMaxDailyItems > 69 || value.dailyTargetCount > value.pilotMaxDailyItems) throw new Error("PILOT_MAX_DAILY_ITEMS_INVALID");
  if (value.batchSize !== 3) throw new Error("PILOT_BATCH_SIZE_INVALID");
  if (value.intervalHours < 1 || value.startHour < 0 || value.endHour > 23 || value.startHour > value.endHour) throw new Error("SCHEDULE_SETTINGS_INVALID");
  if (value.maxAttempts < 1 || value.maxAttempts > 2) throw new Error("RETRY_LIMIT_INVALID");
  if (value.maxProductCandidates !== 3) throw new Error("PRODUCT_CANDIDATE_LIMIT_INVALID");
  if (value.minimumFreeGb < 0 || value.minimumFreeGb < (value.mode === "no_upload_daily_69" ? 20 : 0)) throw new Error("MINIMUM_FREE_GB_INVALID");
  if (value.reserveRatio !== 0.2 || value.minimumReserveCount < 0) throw new Error("RESERVE_SETTINGS_INVALID");
  if (!Number.isInteger(value.maxRawDiscoveries) || value.maxRawDiscoveries < value.dailyTargetCount || value.maxRawDiscoveries > 240) throw new Error("DISCOVERY_CAP_INVALID");
  if (!Number.isInteger(value.maxProviderCalls) || value.maxProviderCalls < 1 || value.maxProviderCalls > 30) throw new Error("PROVIDER_CALL_CAP_INVALID");
  const maximumProcessingCap = value.mode === "no_upload_pilot" ? 9 : 69;
  if (!Number.isInteger(value.processingDailyCap) || value.processingDailyCap < 1 || value.processingDailyCap > maximumProcessingCap || value.processingDailyCap > value.dailyTargetCount) throw new Error("PROCESSING_DAILY_CAP_INVALID");
  if (value.maxCategoryRatio <= 0 || value.maxCategoryRatio > 1 || value.maxProductFamilyRatio <= 0 || value.maxProductFamilyRatio > 1) throw new Error("DIVERSITY_SETTINGS_INVALID");
  if (value.maxExactAssetReuse !== 5) throw new Error("ASSET_REUSE_CAP_INVALID");
  if (typeof value.observationMode !== "boolean" || typeof value.autoPauseAfterObservation !== "boolean") throw new Error("OBSERVATION_SETTINGS_INVALID");
  return value;
}
