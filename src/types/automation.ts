import type { RenderPlanOverride } from "@/lib/video/renderPlanOverride";

export type RunMode =
  | "generate_only"
  | "youtube_private"
  | "youtube_unlisted"
  | "youtube_public";

export type QueueStatus =
  | "scheduled"
  | "processing"
  | "content_ready"
  | "video_render_started"
  | "video_ready"
  | "blog_draft_created"
  | "ready_for_manual_upload"
  | "uploaded"
  | "posted"
  | "manual_review"
  | "error"
  | "skipped"
  | "hold";

export type YouTubeUploadStatus =
  | "not_ready"
  | "ready_to_upload"
  | "private_uploaded"
  | "unlisted_uploaded"
  | "public_uploaded"
  | "manual_review"
  | "blocked"
  | "error";

export type TikTokUploadStatus =
  | "not_ready"
  | "ready_to_upload"
  | "uploaded"
  | "manual_review"
  | "blocked"
  | "error";

export type ThreadsPostStatus =
  | "not_ready"
  | "ready_to_post"
  | "posted"
  | "manual_review"
  | "blocked"
  | "error";

export type ManualReviewStatus =
  | "not_ready"
  | "ready_for_review"
  | "approved"
  | "rejected"
  | "manual_review";

export type ContentSource = "gemini" | "openai" | "fallback";

export type AutomationRunType =
  | "nightly_scout"
  | "hourly_batch"
  | "next_batch"
  | "manual_batch"
  | "retry_item"
  | "hold_item"
  | "skip_item"
  | "webhook_test";

export type AutomationRunStatus = "running" | "success" | "failed";

export type AutomationSettings = {
  id: string;
  daily_target_count: number;
  batch_size: number;
  interval_hours: number;
  start_hour: number;
  end_hour: number;
  run_mode: RunMode;
  is_paused: boolean;
  youtube_upload_enabled: boolean;
  approval_required: boolean;
  python_worker_enabled: boolean;
  max_daily_uploads: number;
  max_daily_videos: number;
  allowed_worker_job_types: WorkerJobType[];
  category_include: string[];
  category_exclude: string[];
  updated_at: string;
};

export type ProductQueueItem = {
  id: string;
  queue_date: string;
  queue_rank: number;
  upload_slot: number;
  scheduled_at: string;
  keyword: string;
  theme: string;
  product_name: string;
  category_path: string;
  price_now_text: string;
  thumbnail_url: string;
  raw_coupang_url: string;
  selected_affiliate_url: string;
  product_score: number;
  score_reason: string;
  video_angle: string;
  queue_status: QueueStatus;
  video_url: string;
  video_snapshot_url: string;
  blog_draft_url: string;
  youtube_upload_status: YouTubeUploadStatus;
  tiktok_upload_status: TikTokUploadStatus;
  threads_post_status: ThreadsPostStatus;
  manual_review_status: ManualReviewStatus;
  error_message: string;
  created_at: string;
  updated_at: string;
};

export type GeneratedContent = {
  id: string;
  product_queue_id: string;
  raw_coupang_url: string;
  product_name: string;
  selected_affiliate_url: string;
  video_title: string;
  video_script: string;
  caption_1: string;
  caption_2: string;
  caption_3: string;
  threads_text: string;
  blog_title: string;
  blog_body: string;
  hashtags: string;
  youtube_description: string;
  tiktok_caption: string;
  disclosure_text: string;
  content_source: ContentSource;
  creatomate_render_id: string;
  video_url: string;
  video_snapshot_url: string;
  video_status: string;
  blog_draft_url: string;
  blog_draft_status: string;
  render_plan_override?: RenderPlanOverride | null;
  render_plan_override_updated_at?: string;
  render_plan_override_updated_by?: string;
  created_at: string;
  updated_at: string;
};

export type AutomationRun = {
  id: string;
  request_id?: string;
  n8n_run_id?: string;
  http_status?: number;
  run_type: AutomationRunType;
  status: AutomationRunStatus;
  processed_count: number;
  error_count: number;
  started_at: string;
  finished_at: string;
  log: string;
  safe_message: string;
};

export type Platform = "youtube" | "tiktok" | "threads";

export type WorkerJobType = "video_render" | "sheet_sync";

export type WorkerJobStatus =
  | "pending"
  | "claimed"
  | "processing"
  | "completed"
  | "failed"
  | "retry_wait"
  | "cancelled";

export type JsonRecord = Record<string, unknown>;

export type CandidateDuplicateStatus =
  | "unique"
  | "duplicate_candidate"
  | "already_queued"
  | "already_produced"
  | "unknown";

export type CandidatePromotionStatus =
  | "ready"
  | "blocked_missing_affiliate"
  | "blocked_missing_name"
  | "blocked_duplicate"
  | "needs_review"
  | "promoted";

export type WorkerJob = {
  id: string;
  job_type: WorkerJobType;
  status: WorkerJobStatus;
  product_queue_id: string;
  product_candidate_id: string;
  priority: number;
  payload: JsonRecord;
  result: JsonRecord;
  claimed_by: string;
  claimed_at: string;
  heartbeat_at: string;
  error_message: string;
  retry_count: number;
  max_retries: number;
  created_at: string;
  started_at: string;
  finished_at: string;
};

export type WorkerHeartbeat = {
  worker_id: string;
  status: "online" | "offline";
  current_job_id: string;
  current_job_type: WorkerJobType | "";
  last_heartbeat_at: string;
  updated_at: string;
};

export type ProductCandidate = {
  id: string;
  product_name: string;
  raw_coupang_url: string;
  selected_affiliate_url: string;
  product_key?: string;
  platform?: string;
  source_type?: string;
  source_name?: string;
  category?: string;
  candidate_score?: number;
  score_reason?: string;
  duplicate_status?: CandidateDuplicateStatus;
  duplicate_reason?: string;
  promotion_status?: CandidatePromotionStatus;
  promoted_queue_id?: string;
  payload: JsonRecord;
  created_at: string;
  updated_at: string;
};

export type ProductAsset = {
  id: string;
  product_queue_id: string;
  worker_job_id: string;
  asset_type: "video" | "thumbnail" | "subtitle" | "upload_package" | "sheet_export" | "product_image";
  bucket: string;
  url: string;
  created_at: string;
};

export type ChannelUploadPackageStatus =
  | "manual_ready"
  | "uploaded"
  | "skipped"
  | "needs_fix";

export type ChannelUploadPackage = {
  id: string;
  product_queue_id: string;
  channel_profile_id: string;
  platform: Platform;
  title: string;
  description: string;
  hashtags: string;
  disclosure_text: string;
  video_url: string;
  thumbnail_url: string;
  subtitle_url: string;
  upload_package_url: string;
  status: ChannelUploadPackageStatus;
  uploaded_url: string;
  uploaded_at: string;
  uploaded_by: string;
  upload_notes: string;
  platform_upload_status: string;
  upload_enabled: boolean;
  manual_upload_only: boolean;
  created_at: string;
  updated_at: string;
};

export type ProductionHistory = {
  id: string;
  product_queue_id: string;
  worker_job_id: string;
  event_type: string;
  message: string;
  metadata: JsonRecord;
  created_at: string;
};

export type EventType =
  | "holiday"
  | "season"
  | "sale"
  | "weather"
  | "school"
  | "family"
  | "food"
  | "fashion"
  | "custom";

export type EventCalendarStatus = "active" | "paused" | "archived";

export type EventCalendarItem = {
  id: string;
  event_key: string;
  event_name: string;
  event_type: EventType;
  starts_at: string;
  ends_at: string;
  lead_days_min: number;
  lead_days_max: number;
  target_categories: string[];
  target_keywords: string[];
  excluded_keywords: string[];
  platforms: string[];
  priority: number;
  seasonality_score: number;
  status: EventCalendarStatus;
  created_at: string;
  updated_at: string;
};

export type DailyProductionPlanStatus = "draft" | "confirmed" | "completed" | "cancelled";

export type DailyProductionPlanItemStatus =
  | "planned"
  | "promoted"
  | "content_ready"
  | "video_ready"
  | "skipped";

export type DailyProductionPlan = {
  id: string;
  plan_date: string;
  status: DailyProductionPlanStatus;
  target_video_count: number;
  created_at: string;
  updated_at: string;
};

export type DailyProductionPlanItem = {
  id: string;
  plan_id: string;
  product_candidate_id: string;
  product_queue_id: string;
  event_key: string;
  target_channel_id: string;
  rank: number;
  status: DailyProductionPlanItemStatus;
  reason: string;
  created_at: string;
};

export type ChannelProfileStatus = "active" | "paused" | "archived";

export type ChannelProfile = {
  id: string;
  channel_key: string;
  channel_name: string;
  platform: Platform;
  youtube_channel_id: string;
  youtube_handle: string;
  niche: string;
  allowed_categories: string[];
  excluded_categories: string[];
  default_hashtags: string[];
  title_template?: string;
  description_template?: string;
  hashtag_template?: string;
  pinned_comment_template?: string;
  upload_window: JsonRecord;
  status: ChannelProfileStatus;
  upload_enabled: boolean;
  manual_upload_only: boolean;
  created_at: string;
  updated_at: string;
};
