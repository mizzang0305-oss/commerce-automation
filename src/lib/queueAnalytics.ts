import type { GeneratedContent, ProductAsset, ProductQueueItem, QueueStatus, WorkerJob } from "@/types/automation";

const QUEUE_STATUSES: QueueStatus[] = [
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
];

export function summarizeQueueItems(
  items: ProductQueueItem[],
  contents: Map<string, GeneratedContent | null> = new Map()
) {
  const byStatus = countQueueByStatus(items);
  let videoReadyWithoutVideoUrlCount = 0;
  let missingDisclosureTextCount = 0;
  let missingScriptCount = 0;

  for (const item of items) {
    if (item.queue_status === "video_ready" && !item.video_url.trim()) {
      videoReadyWithoutVideoUrlCount += 1;
    }
    const content = contents.get(item.id);
    if (!content?.disclosure_text.trim()) {
      missingDisclosureTextCount += 1;
    }
    if (!content?.video_script.trim()) {
      missingScriptCount += 1;
    }
  }

  return {
    total: items.length,
    byStatus,
    manualReviewCount: countManualReview(items),
    videoReadyCount: countVideoReady(items),
    missingAffiliateUrlCount: countMissingAffiliateUrl(items),
    missingDisclosureTextCount,
    missingScriptCount,
    missingThumbnailUrlCount: countMissingThumbnailUrl(items),
    videoReadyWithoutVideoUrlCount,
    manualReviewReasons: getManualReviewReasonSummary(items)
  };
}

export function countQueueByStatus(items: ProductQueueItem[]) {
  const byStatus = Object.fromEntries(QUEUE_STATUSES.map((status) => [status, 0])) as Record<QueueStatus, number>;
  for (const item of items) {
    byStatus[item.queue_status] += 1;
  }
  return byStatus;
}

export function countMissingAffiliateUrl(items: ProductQueueItem[]) {
  return items.filter((item) => !item.selected_affiliate_url.trim()).length;
}

export function countMissingThumbnailUrl(items: ProductQueueItem[]) {
  return items.filter((item) => !item.thumbnail_url.trim()).length;
}

export function countVideoReady(items: ProductQueueItem[]) {
  return items.filter((item) => item.queue_status === "video_ready").length;
}

export function countManualReview(items: ProductQueueItem[]) {
  return items.filter((item) => item.queue_status === "manual_review").length;
}

export function countMissingDisclosureText(contents: GeneratedContent[]) {
  return contents.filter((content) => !content.disclosure_text.trim()).length;
}

export function countMissingVideoScript(contents: GeneratedContent[]) {
  return contents.filter((content) => !content.video_script.trim()).length;
}

export function getManualReviewReasonSummary(items: ProductQueueItem[]) {
  return getManualReviewReasons(items);
}

export function getManualReviewReasons(items: ProductQueueItem[]) {
  const reasons = new Map<string, number>();
  for (const item of items) {
    if (item.queue_status !== "manual_review") {
      continue;
    }
    const reason = item.error_message.trim() || "사유 미입력";
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }

  return [...reasons.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason, "ko"));
}

export function getProcessingTooLongItems(
  items: ProductQueueItem[],
  now: Date = new Date(),
  thresholdMinutes = 60
) {
  const thresholdMs = thresholdMinutes * 60 * 1000;
  return items.filter((item) => {
    if (item.queue_status !== "processing" && item.queue_status !== "video_render_started") {
      return false;
    }
    const timestamp = item.updated_at || item.scheduled_at;
    return now.getTime() - new Date(timestamp).getTime() > thresholdMs;
  });
}

export function getRenderableChecklist(
  item: ProductQueueItem,
  content: GeneratedContent | null,
  assets: ProductAsset[] = [],
  jobs: WorkerJob[] = []
) {
  const items = [
    {
      label: "제휴 링크",
      ok: Boolean(item.selected_affiliate_url.trim()),
      help: "selected_affiliate_url이 있어야 worker job을 만들 수 있습니다."
    },
    {
      label: "제휴 고지 문구",
      ok: Boolean(content?.disclosure_text.trim()),
      help: "제휴 고지 없는 콘텐츠는 수동 업로드 준비 상태가 될 수 없습니다."
    },
    {
      label: "영상 대본",
      ok: Boolean(content?.video_script.trim()),
      help: "video_render payload에 전달할 대본이 필요합니다."
    },
    {
      label: "상품 이미지 URL",
      ok: Boolean(item.thumbnail_url.trim()),
      help: item.thumbnail_url.trim()
        ? "Python Worker가 다운로드할 상품 이미지 URL이 준비되었습니다."
        : "상품 이미지 URL이 없어 영상 생성이 차단됩니다."
    },
    {
      label: "워커 작업",
      ok: jobs.some((job) => job.product_queue_id === item.id),
      help: "next-batch가 video_render worker job을 생성해야 합니다."
    },
    {
      label: "영상 URL",
      ok: Boolean(item.video_url.trim()),
      help: "video_url 없는 완료 처리는 fake success로 간주합니다."
    },
    {
      label: "업로드 패키지",
      ok: assets.some((asset) => asset.asset_type === "upload_package" && asset.url.trim()),
      help: "수동 검수자가 확인할 upload_package.txt가 필요합니다."
    }
  ];

  return {
    ready: items.every((entry) => entry.ok),
    items
  };
}
