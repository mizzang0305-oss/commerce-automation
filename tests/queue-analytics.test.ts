import { describe, expect, test } from "vitest";
import type { GeneratedContent, ProductAsset, ProductQueueItem, WorkerJob } from "@/types/automation";
import {
  countManualReview,
  countMissingAffiliateUrl,
  countMissingDisclosureText,
  countMissingThumbnailUrl,
  countMissingVideoScript,
  countQueueByStatus,
  countVideoReady,
  getManualReviewReasons,
  getManualReviewReasonSummary,
  getProcessingTooLongItems,
  getRenderableChecklist,
  summarizeQueueItems
} from "@/lib/queueAnalytics";

describe("queue analytics", () => {
  test("summarizes queue readiness and missing fields", () => {
    const items = [
      buildItem({ id: "ready", queue_status: "video_ready", video_url: "https://storage/video.mp4" }),
      buildItem({ id: "manual", queue_status: "manual_review", error_message: "제휴 링크가 없습니다.", selected_affiliate_url: "" }),
      buildItem({ id: "missing-video", queue_status: "video_ready", video_url: "" }),
      buildItem({ id: "missing-thumb", thumbnail_url: "" })
    ];
    const contents = new Map<string, GeneratedContent | null>([
      ["ready", buildContent("ready")],
      ["manual", buildContent("manual", { disclosure_text: "" })],
      ["missing-video", buildContent("missing-video")],
      ["missing-thumb", buildContent("missing-thumb", { video_script: "" })]
    ]);

    const summary = summarizeQueueItems(items, contents);

    expect(summary.byStatus.video_ready).toBe(2);
    expect(summary.manualReviewCount).toBe(1);
    expect(summary.missingAffiliateUrlCount).toBe(1);
    expect(summary.missingDisclosureTextCount).toBe(1);
    expect(summary.missingScriptCount).toBe(1);
    expect(summary.missingThumbnailUrlCount).toBe(1);
    expect(summary.videoReadyWithoutVideoUrlCount).toBe(1);
    expect(countQueueByStatus(items).video_ready).toBe(2);
    expect(countMissingAffiliateUrl(items)).toBe(1);
    expect(countMissingThumbnailUrl(items)).toBe(1);
    expect(countVideoReady(items)).toBe(2);
    expect(countManualReview(items)).toBe(1);
    expect(countMissingDisclosureText([...contents.values()].filter(Boolean) as GeneratedContent[])).toBe(1);
    expect(countMissingVideoScript([...contents.values()].filter(Boolean) as GeneratedContent[])).toBe(1);
  });

  test("counts missing disclosure and script for queue items without generated content", () => {
    const items = [
      buildItem({ id: "ready" }),
      buildItem({ id: "missing-content" }),
      buildItem({ id: "null-content" })
    ];
    const contents = new Map<string, GeneratedContent | null>([
      ["ready", buildContent("ready")],
      ["null-content", null]
    ]);

    const summary = summarizeQueueItems(items, contents);

    expect(summary.missingDisclosureTextCount).toBe(2);
    expect(summary.missingScriptCount).toBe(2);
  });

  test("groups manual review reasons", () => {
    const reasons = getManualReviewReasons([
      buildItem({ id: "a", queue_status: "manual_review", error_message: "제휴 링크가 없습니다." }),
      buildItem({ id: "b", queue_status: "manual_review", error_message: "제휴 링크가 없습니다." }),
      buildItem({ id: "c", queue_status: "manual_review", error_message: "" })
    ]);

    expect(reasons[0]).toEqual({ reason: "제휴 링크가 없습니다.", count: 2 });
    expect(reasons[1]).toEqual({ reason: "사유 미입력", count: 1 });
    expect(getManualReviewReasonSummary([
      buildItem({ id: "a", queue_status: "manual_review", error_message: "제휴 링크가 없습니다." })
    ])).toEqual([{ reason: "제휴 링크가 없습니다.", count: 1 }]);
  });

  test("detects queue items processing too long", () => {
    const items = [
      buildItem({ id: "fresh", queue_status: "processing", updated_at: "2026-05-24T00:50:00.000Z" }),
      buildItem({ id: "stale", queue_status: "video_render_started", updated_at: "2026-05-24T00:00:00.000Z" }),
      buildItem({ id: "done", queue_status: "video_ready", updated_at: "2026-05-24T00:00:00.000Z" })
    ];

    expect(getProcessingTooLongItems(items, new Date("2026-05-24T01:00:00.000Z"), 30).map((item) => item.id)).toEqual(["stale"]);
  });

  test("builds renderable checklist with missing values", () => {
    const item = buildItem({ selected_affiliate_url: "", thumbnail_url: "" });
    const checklist = getRenderableChecklist(
      item,
      buildContent(item.id, { disclosure_text: "", video_script: "" }),
      [],
      []
    );

    expect(checklist.ready).toBe(false);
    expect(checklist.items.filter((entry) => !entry.ok).map((entry) => entry.label)).toEqual([
      "제휴 링크",
      "제휴 고지 문구",
      "영상 대본",
      "썸네일 이미지",
      "워커 작업",
      "영상 URL",
      "업로드 패키지"
    ]);
  });

  test("checklist passes when queue item has required worker outputs", () => {
    const item = buildItem({ video_url: "https://storage/video.mp4" });
    const assets: ProductAsset[] = [
      buildAsset({ asset_type: "upload_package", url: "https://storage/upload.txt" })
    ];
    const jobs = [buildJob({ product_queue_id: item.id, status: "completed" })];

    const checklist = getRenderableChecklist(item, buildContent(item.id), assets, jobs);

    expect(checklist.ready).toBe(true);
  });
});

function buildItem(overrides: Partial<ProductQueueItem> = {}): ProductQueueItem {
  return {
    id: "queue-1",
    queue_date: "2026-05-24",
    queue_rank: 1,
    upload_slot: 1,
    scheduled_at: "2026-05-24T00:00:00.000Z",
    keyword: "키워드",
    theme: "테마",
    product_name: "상품",
    category_path: "카테고리",
    price_now_text: "9,900원",
    thumbnail_url: "https://image.example/thumb.jpg",
    raw_coupang_url: "https://www.coupang.com/vp/products/1",
    selected_affiliate_url: "https://link.coupang.com/a/test",
    product_score: 90,
    score_reason: "",
    video_angle: "",
    queue_status: "scheduled",
    video_url: "",
    video_snapshot_url: "",
    blog_draft_url: "",
    youtube_upload_status: "not_ready",
    tiktok_upload_status: "not_ready",
    threads_post_status: "not_ready",
    manual_review_status: "not_ready",
    error_message: "",
    created_at: "2026-05-24T00:00:00.000Z",
    updated_at: "2026-05-24T00:00:00.000Z",
    ...overrides
  };
}

function buildContent(productQueueId: string, overrides: Partial<GeneratedContent> = {}): GeneratedContent {
  return {
    id: `content-${productQueueId}`,
    product_queue_id: productQueueId,
    raw_coupang_url: "",
    product_name: "상품",
    selected_affiliate_url: "https://link.coupang.com/a/test",
    video_title: "영상 제목",
    video_script: "영상 대본",
    caption_1: "",
    caption_2: "",
    caption_3: "",
    threads_text: "",
    blog_title: "",
    blog_body: "",
    hashtags: "",
    youtube_description: "",
    tiktok_caption: "",
    disclosure_text: "이 콘텐츠는 제휴 링크를 포함합니다.",
    content_source: "fallback",
    creatomate_render_id: "",
    video_url: "",
    video_snapshot_url: "",
    video_status: "not_started",
    blog_draft_url: "",
    blog_draft_status: "not_started",
    created_at: "2026-05-24T00:00:00.000Z",
    updated_at: "2026-05-24T00:00:00.000Z",
    ...overrides
  };
}

function buildAsset(overrides: Partial<ProductAsset> = {}): ProductAsset {
  return {
    id: "asset-1",
    product_queue_id: "queue-1",
    worker_job_id: "job-1",
    asset_type: "upload_package",
    bucket: "upload-packages",
    url: "https://storage/upload.txt",
    created_at: "2026-05-24T00:00:00.000Z",
    ...overrides
  };
}

function buildJob(overrides: Partial<WorkerJob> = {}): WorkerJob {
  return {
    id: "job-1",
    job_type: "video_render",
    status: "completed",
    product_queue_id: "queue-1",
    product_candidate_id: "",
    priority: 1,
    payload: {},
    result: { video_url: "https://storage/video.mp4" },
    claimed_by: "worker",
    claimed_at: "",
    heartbeat_at: "",
    error_message: "",
    retry_count: 0,
    max_retries: 3,
    created_at: "2026-05-24T00:00:00.000Z",
    started_at: "",
    finished_at: "",
    ...overrides
  };
}
