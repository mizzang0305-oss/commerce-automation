import type { LiveProductCandidate } from "@/lib/live-product-video";

export type LocalQueueStatus =
  | "discovered" | "scheduled" | "claimed" | "processing"
  | "video_ready_autoqa" | "retry_wait" | "manual_review"
  | "blocked" | "failed" | "hold" | "skipped";

export type LocalQueueItem = {
  id: string;
  queueDate: string;
  queueRank: number;
  productKey: string;
  productId: string;
  rawProductName: string;
  canonicalProductName: string;
  sourceProvider: string;
  sourceKeyword: string;
  productScore: number;
  scheduledAt: string;
  status: LocalQueueStatus;
  attemptCount: number;
  leaseOwner: string;
  leaseAcquiredAt: string;
  leaseExpiresAt: string;
  nextAttemptAt: string;
  claimedAt: string;
  startedAt: string;
  finishedAt: string;
  creativeScore: number | null;
  videoQualityScore: number | null;
  videoPath: string;
  reviewPath: string;
  errorCode: string;
  safeMessage: string;
  reviewMetadata: { codexReview: "not_executed" | "pass" | "block" };
  candidate: LiveProductCandidate;
  createdAt: string;
  updatedAt: string;
};

export type LocalRun = {
  runId: string;
  type: "nightly_discovery" | "scheduled_batch";
  status: "success" | "partial" | "failed" | "noop";
  startedAt: string;
  finishedAt: string;
  claimed: number;
  completed: number;
  failed: number;
  retried: number;
  safeMessage: string;
  metrics: Record<string, number | string | boolean>;
};

export type QueueSchedulerSettings = {
  mode: "no_upload_pilot";
  dailyTargetCount: number;
  batchSize: number;
  intervalHours: number;
  startHour: number;
  endHour: number;
  pilotMaxDailyItems: number;
  uploadEnabled: false;
  isPaused: boolean;
  enabled: boolean;
  minimumFreeGb: number;
  leaseMinutes: number;
  retryBackoffMinutes: number;
  maxAttempts: number;
};

export const QUEUE_SCHEDULER_FLAGS = Object.freeze({
  SAFE_TO_UPLOAD: false,
  SAFE_TO_PUBLIC_UPLOAD: false,
  YOUTUBE_AUTO_UPLOAD: false,
  PUBLIC_UPLOAD: false,
  UNLISTED_UPLOAD: false,
  TIKTOK_AUTO_UPLOAD: false,
  THREADS_AUTO_POST: false,
  COMMENT_AUTOMATION: false,
  PRODUCTION_DB_WRITE: 0,
  SUPABASE_WRITE: 0,
  GOOGLE_SHEETS_WRITE: 0,
  R2_WRITE: 0,
  DRIVE_WRITE: 0,
  PLATFORM_UPLOAD: 0,
  PRODUCTION_DEPLOY: 0
} as const);
