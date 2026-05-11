import "server-only";

import type { ProductQueueItem, QueueStatus } from "@/types/automation";
import { createDefaultSettings, createMockQueueItems } from "@/lib/repositories/mockAutomationRepository";

const queueStatuses = new Set<QueueStatus>([
  "scheduled",
  "processing",
  "content_ready",
  "video_render_started",
  "video_ready",
  "blog_draft_created",
  "ready_for_manual_upload",
  "uploaded",
  "posted",
  "manual_review",
  "error",
  "skipped",
  "hold"
]);

export function normalizeCallbackQueueItem(input: Partial<ProductQueueItem>): ProductQueueItem {
  const fallbackSeed = createMockQueueItems(createDefaultSettings({ daily_target_count: 1 }))[0];
  const fallback: ProductQueueItem = {
    ...fallbackSeed,
    id: input.id || `callback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    raw_coupang_url: input.raw_coupang_url || "",
    queue_status: "scheduled",
    selected_affiliate_url: "",
    video_url: "",
    video_snapshot_url: "",
    blog_draft_url: ""
  };
  const now = new Date().toISOString();
  const status = input.queue_status && queueStatuses.has(input.queue_status) ? input.queue_status : fallback.queue_status;

  return {
    ...fallback,
    ...input,
    id: input.id || fallback.id,
    queue_date: input.queue_date || fallback.queue_date,
    queue_rank: input.queue_rank ?? fallback.queue_rank,
    upload_slot: input.upload_slot ?? fallback.upload_slot,
    scheduled_at: input.scheduled_at || fallback.scheduled_at,
    keyword: input.keyword || fallback.keyword,
    theme: input.theme || fallback.theme,
    product_name: input.product_name || fallback.product_name,
    category_path: input.category_path || fallback.category_path,
    price_now_text: input.price_now_text || fallback.price_now_text,
    thumbnail_url: input.thumbnail_url || fallback.thumbnail_url,
    raw_coupang_url: input.raw_coupang_url || fallback.raw_coupang_url,
    selected_affiliate_url: input.selected_affiliate_url || fallback.selected_affiliate_url,
    product_score: input.product_score ?? fallback.product_score,
    score_reason: input.score_reason || fallback.score_reason,
    video_angle: input.video_angle || fallback.video_angle,
    queue_status: status,
    video_url: input.video_url || fallback.video_url,
    video_snapshot_url: input.video_snapshot_url || fallback.video_snapshot_url,
    blog_draft_url: input.blog_draft_url || fallback.blog_draft_url,
    youtube_upload_status: input.youtube_upload_status || fallback.youtube_upload_status,
    tiktok_upload_status: input.tiktok_upload_status || fallback.tiktok_upload_status,
    threads_post_status: input.threads_post_status || fallback.threads_post_status,
    manual_review_status: input.manual_review_status || fallback.manual_review_status,
    error_message: input.error_message || "",
    created_at: input.created_at || now,
    updated_at: now
  };
}

export function sanitizeCallbackBody<T extends Record<string, unknown>>(body: T): T {
  return JSON.parse(
    JSON.stringify(body)
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
      .replace(/"(authorization|access_token|refresh_token|token|secret)"\s*:\s*"[^"]*"/gi, '"$1":"[redacted]"')
  ) as T;
}
