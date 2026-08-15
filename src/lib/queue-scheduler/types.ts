import type { LiveProductCandidate, RankedLiveProduct } from "@/lib/live-product-video";
import type { UsageEvidenceAllocation } from "@/lib/usage-evidence";

export type LocalQueueStatus =
  | "discovered" | "scheduled" | "claimed" | "processing"
  | "video_ready_machine_qa" | "video_ready_autoqa" | "retry_wait" | "manual_review"
  | "blocked" | "failed" | "hold" | "skipped";

export type LocalQueueItem = {
  id: string;
  slotId: string;
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
  productCandidateAttempt: number;
  maxProductCandidates: number;
  candidateHistory: Array<{
    productKey: string;
    canonicalProductName: string;
    startedAt: string;
    finishedAt: string;
    outcome: "active" | "passed" | "replaced" | "blocked";
    reason: string;
    schedulerAttempts: number;
    replacementOfProductKey: string;
  }>;
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
  operationCarryover?: {
    prevalidatedCanary: true;
    sourceCanaryRunId: string;
    sourceVideoHash: string;
    sourceReviewHash: string;
    carriedIntoOperationDate: string;
  };
  candidate: LiveProductCandidate;
  usageEvidenceAllocation?: UsageEvidenceAllocation;
  createdAt: string;
  updatedAt: string;
  localRevision: number;
  controlPreviousStatus?: LocalQueueStatus;
  holdReason?: string;
};

export type LocalRun = {
  runId: string;
  type: "nightly_discovery" | "scheduled_batch";
  status: "success" | "partial" | "failed" | "blocked_preflight" | "noop";
  startedAt: string;
  finishedAt: string;
  claimed: number;
  completed: number;
  blocked: number;
  failed: number;
  retried: number;
  safeMessage: string;
  metrics: Record<string, number | string | boolean>;
};

export type QueueSchedulerSettings = {
  mode: "no_upload_pilot" | "no_upload_daily_69" | "no_upload_daily69_first_operation";
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
  maxProductCandidates: number;
  reserveRatio: number;
  minimumReserveCount: number;
  maxRawDiscoveries: number;
  maxProviderCalls: number;
  processingDailyCap: number;
  maxCategoryRatio: number;
  maxProductFamilyRatio: number;
  maxExactAssetReuse: number;
  observationMode: boolean;
  autoPauseAfterObservation: boolean;
};

export type ReserveCandidate = RankedLiveProduct & {
  insertedAt: string;
  claimedBySlot: string;
  claimedAt: string;
  queueDate?: string;
  usageEvidenceAllocation?: UsageEvidenceAllocation;
};

export type QueueControlState = {
  localRevision: number;
  projectionRevision: number;
  snapshotHash: string;
  projectedAt: string;
  source: "local_queue_scheduler";
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
