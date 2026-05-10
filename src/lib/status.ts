import type { ProductQueueItem, QueueStatus } from "@/types/automation";
import type { QueueSummary } from "@/lib/repositories/types";

export const queueStatusLabels: Record<QueueStatus, string> = {
  scheduled: "예약됨",
  processing: "처리중",
  content_ready: "콘텐츠 생성됨",
  video_render_started: "영상 생성중",
  video_ready: "영상 준비됨",
  blog_draft_created: "블로그 초안 생성됨",
  ready_for_manual_upload: "업로드 준비",
  uploaded: "수동 업로드 표시",
  posted: "수동 게시 표시",
  manual_review: "수동 검수",
  error: "오류",
  skipped: "제외",
  hold: "보류"
};

export const queueStatusBadgeClasses: Record<QueueStatus, string> = {
  scheduled: "bg-slate-100 text-slate-700 ring-slate-200",
  processing: "bg-blue-100 text-blue-700 ring-blue-200",
  content_ready: "bg-indigo-100 text-indigo-700 ring-indigo-200",
  video_render_started: "bg-purple-100 text-purple-700 ring-purple-200",
  video_ready: "bg-green-100 text-green-700 ring-green-200",
  blog_draft_created: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  ready_for_manual_upload: "bg-teal-100 text-teal-700 ring-teal-200",
  uploaded: "bg-green-100 text-green-700 ring-green-200",
  posted: "bg-green-100 text-green-700 ring-green-200",
  manual_review: "bg-orange-100 text-orange-700 ring-orange-200",
  error: "bg-red-100 text-red-700 ring-red-200",
  skipped: "bg-slate-100 text-slate-500 ring-slate-200",
  hold: "bg-yellow-100 text-yellow-800 ring-yellow-200"
};

export function getQueueSummary(items: ProductQueueItem[]): QueueSummary {
  const summary: QueueSummary = {
    total: items.length,
    scheduled: 0,
    processing: 0,
    content_ready: 0,
    video_render_started: 0,
    video_ready: 0,
    blog_draft_created: 0,
    ready_for_manual_upload: 0,
    uploaded: 0,
    posted: 0,
    manual_review: 0,
    error: 0,
    skipped: 0,
    hold: 0
  };

  for (const item of items) {
    summary[item.queue_status] += 1;
  }

  return summary;
}

export function getRecentErrors(items: ProductQueueItem[], limit = 5) {
  return items
    .filter((item) => item.queue_status === "error" || item.error_message)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, limit);
}
