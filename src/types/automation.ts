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
  max_daily_uploads: number;
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
  created_at: string;
  updated_at: string;
};

export type AutomationRun = {
  id: string;
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
