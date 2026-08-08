export const AUTONOMOUS_VIDEO_QA_CONFIG = Object.freeze({
  scoreThreshold: 75,
  first3Threshold: 70,
  freezeRatioBlocker: 0.45,
  longestFreezeSecondsBlocker: 1.5,
  minimumPrimaryVisualWidthRatio: 0.78,
  targetCanvasFillRatio: 0.82,
  longPauseReviewMs: 700,
  longPauseStrongPenaltyMs: 900,
  weights: Object.freeze({
    first3: 20,
    motion: 18,
    occupancy: 12,
    caption: 12,
    creativeDiversity: 10,
    productClarity: 10,
    audioPacing: 8,
    layoutSafety: 5,
    policyClarity: 5
  })
} as const);

export const AUTONOMOUS_VIDEO_REVIEW_FLAGS = Object.freeze({
  AUTONOMOUS_VIDEO_REVIEW_V2: false,
  SAFE_TO_UPLOAD: false,
  SAFE_TO_PUBLIC_UPLOAD: false,
  YOUTUBE_AUTO_UPLOAD: false,
  PUBLIC_UPLOAD: false,
  UNLISTED_UPLOAD: false,
  TIKTOK_AUTO_UPLOAD: false,
  THREADS_AUTO_POST: false,
  COMMENT_AUTOMATION: false,
  DB_WRITE: 0,
  PRODUCTION_DEPLOY: 0,
  WORKER_CHANGE: 0,
  SCHEDULER_CHANGE: 0,
  EXTERNAL_REVIEW_UPLOAD: 0
} as const);
