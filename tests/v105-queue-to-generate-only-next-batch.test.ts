import { describe, expect, test } from "vitest";

import {
  buildV105QueueToGenerateOnlyNextBatchReport,
  type V105QueueToGenerateOnlyNextBatchReport
} from "../src/automation/queueToGenerateOnlyNextBatchPlanner";
import type { ProductQueueItem } from "../src/types/automation";

const FORBIDDEN_REPORT_PATTERN =
  /https?:\/\/|"UC[A-Za-z0-9_-]{20,}"|Authorization|Bearer|HmacSHA256|client_secret|token=|secret=|signature=|signed_url|prepared_video_asset_url|C:\\|api_key=|AIza[0-9A-Za-z_-]{20,}|abcdefghijklmnopqrstuvwxyz1234567890/i;

describe("v105 queue to generate-only next-batch no-upload", () => {
  test("selects the V104 father_jobs manual_review candidate as a generate-only fallback", async () => {
    const report = await buildV105QueueToGenerateOnlyNextBatchReport({
      queueItems: [
        queueItem({
          id: "v104-father-event-candidate",
          channelKey: "father_jobs",
          queue_status: "manual_review",
          manual_review_status: "not_ready",
          queue_rank: 1,
          raw_coupang_url: "https://www.coupang.com/vp/products/raw-v105",
          selected_affiliate_url: "https://link.coupang.com/a/raw-v105"
        })
      ],
      now: "2026-07-09T00:00:00.000Z"
    });

    expect(report.FINAL_STATUS).toBe("SUCCESS_V105_QUEUE_TO_GENERATE_ONLY_NEXT_BATCH_PLANNED_NO_UPLOAD");
    expect(report.selectedChannelKey).toBe("father_jobs");
    expect(report.queueItemFound).toBe(true);
    expect(report.selectedItemStatus).toBe("manual_review");
    expect(report.selectedManualReviewStatus).toBe("not_ready");
    expect(report.selectedItemPromotedToUploadReadiness).toBe(false);
    expect(report.plannedBatchSize).toBe(1);
    expect(report.plannedPayloadCreated).toBe(true);
    expect(report.plannedPayloadMode).toBe("generate_only");
    expect(report.plannedPayloadSanitized).toBe(true);
    expect(report.plannedPayload?.mode).toBe("generate_only");
    expect(report.plannedPayload?.uploadExecutionDisabled).toBe(true);
    expect(report.plannedPayload?.items).toHaveLength(1);
    expect(report.plannedPayload?.items[0]).toMatchObject({
      channelKey: "father_jobs",
      queueStatus: "manual_review",
      manualReviewStatus: "not_ready",
      rawUrlPresent: true,
      affiliateUrlPresent: true,
      uploadReadinessPromoted: false
    });
    expectNoSideEffects(report);
  });

  test("honors max batch size and prioritizes due scheduled then ready manual upload then manual review fallback", async () => {
    const report = await buildV105QueueToGenerateOnlyNextBatchReport({
      maxBatchSize: 2,
      now: "2026-07-09T00:00:00.000Z",
      queueItems: [
        queueItem({ id: "manual-review-rank-1", queue_status: "manual_review", queue_rank: 1 }),
        queueItem({ id: "manual-ready-rank-2", queue_status: "ready_for_manual_upload", queue_rank: 2 }),
        queueItem({
          id: "scheduled-due-rank-3",
          queue_status: "scheduled",
          queue_rank: 3,
          scheduled_at: "2026-07-08T00:00:00.000Z"
        }),
        queueItem({
          id: "scheduled-future-rank-0",
          queue_status: "scheduled",
          queue_rank: 0,
          scheduled_at: "2099-07-08T00:00:00.000Z"
        })
      ]
    });

    expect(report.plannedPayload?.items.map((item) => item.queueStatus)).toEqual([
      "scheduled",
      "ready_for_manual_upload"
    ]);
    expect(report.plannedPayload?.items.map((item) => item.productNameSanitized)).toEqual([
      "product scheduled-due-rank-3",
      "product manual-ready-rank-2"
    ]);
    expect(report.plannedBatchSize).toBe(2);
    expectNoSideEffects(report);
  });

  test("excludes hold skipped error uploaded posted rows and blocks when no candidate remains", async () => {
    const report = await buildV105QueueToGenerateOnlyNextBatchReport({
      queueItems: [
        queueItem({ id: "hold-row", queue_status: "hold" }),
        queueItem({ id: "skipped-row", queue_status: "skipped" }),
        queueItem({ id: "error-row", queue_status: "error" }),
        queueItem({ id: "uploaded-row", queue_status: "uploaded" }),
        queueItem({ id: "posted-row", queue_status: "posted" }),
        queueItem({ id: "other-channel-row", channelKey: "lets_buy", queue_status: "manual_review" })
      ],
      now: "2026-07-09T00:00:00.000Z"
    });

    expect(report.FINAL_STATUS).toBe("BLOCKED_V105_NO_QUEUE_ITEM_FOR_NEXT_BATCH_NO_UPLOAD");
    expect(report.queueItemFound).toBe(false);
    expect(report.plannedPayloadCreated).toBe(false);
    expect(report.currentBlocker).toBe("BLOCKED_V105_NO_QUEUE_ITEM_FOR_NEXT_BATCH_NO_UPLOAD");
    expectNoSideEffects(report);
  });

  test("execute mode fails closed without webhook or upload mutation", async () => {
    const report = await buildV105QueueToGenerateOnlyNextBatchReport({
      mode: "execute",
      queueItems: [
        queueItem({
          id: "execute-blocked",
          queue_status: "scheduled",
          scheduled_at: "2026-07-08T00:00:00.000Z"
        })
      ],
      now: "2026-07-09T00:00:00.000Z"
    });

    expect(report.FINAL_STATUS).toBe("BLOCKED_V105_EXECUTE_NOT_APPROVED_NO_UPLOAD");
    expect(report.currentBlocker).toBe("BLOCKED_V105_EXECUTE_NOT_APPROVED_NO_UPLOAD");
    expect(report.plannedPayloadCreated).toBe(false);
    expectNoSideEffects(report);
  });

  test("redacts non-url sensitive evidence from planned payload labels", async () => {
    const report = await buildV105QueueToGenerateOnlyNextBatchReport({
      queueItems: [
        queueItem({
          id: "sensitive-label-row",
          queue_status: "manual_review",
          manual_review_status: "not_ready",
          product_name: "storage box UC1234567890123456789012",
          keyword:
            "Authorization Bearer abcdefghijklmnopqrstuvwxyz1234567890 token=plain secret=plain",
          theme:
            "client_secret=plain signature=plain HmacSHA256 api_key=AIzaSy123456789012345678901234",
          category_path:
            "C:\\Users\\LOVE\\secret\\payload.json https://example.invalid/signed?signature=raw"
        })
      ],
      now: "2026-07-09T00:00:00.000Z"
    });

    expect(report.FINAL_STATUS).toBe("SUCCESS_V105_QUEUE_TO_GENERATE_ONLY_NEXT_BATCH_PLANNED_NO_UPLOAD");
    expect(report.plannedPayloadSanitized).toBe(true);
    expect(report.plannedPayload?.mode).toBe("generate_only");
    expect(report.plannedPayload?.items[0]).toMatchObject({
      productNameSanitized: "storage box [channel-id]",
      keywordSanitized: "[redacted-auth] [secret] [secret]",
      themeSanitized: "[secret] [secret] [redacted-hmac] [secret]",
      categoryPathSanitized: "[path] [url]"
    });
    expectNoSideEffects(report);
  });
});

function queueItem(overrides: Partial<ProductQueueItem>): ProductQueueItem {
  const now = "2026-07-09T00:00:00.000Z";
  const id = overrides.id ?? "queue-v105";
  return {
    id,
    channelKey: overrides.channelKey ?? "father_jobs",
    queue_date: "2026-07-09",
    queue_rank: overrides.queue_rank ?? 1,
    upload_slot: 1,
    scheduled_at: overrides.scheduled_at ?? "2026-07-09T00:00:00.000Z",
    keyword: `keyword ${id}`,
    theme: `theme ${id}`,
    product_name: `product ${id}`,
    category_path: "event/weather/heatwave",
    price_now_text: "",
    thumbnail_url: "",
    raw_coupang_url: overrides.raw_coupang_url ?? "",
    selected_affiliate_url: overrides.selected_affiliate_url ?? "",
    product_score: 90,
    score_reason: "safe fixture",
    video_angle: "safe fixture",
    queue_status: overrides.queue_status ?? "manual_review",
    video_url: "",
    video_snapshot_url: "",
    blog_draft_url: "",
    youtube_upload_status: "not_ready",
    tiktok_upload_status: "not_ready",
    threads_post_status: "not_ready",
    manual_review_status: overrides.manual_review_status ?? "not_ready",
    error_message: "",
    created_at: now,
    updated_at: now,
    ...overrides
  };
}

function expectNoSideEffects(report: V105QueueToGenerateOnlyNextBatchReport) {
  expect(report.n8nWebhookCalled).toBe(false);
  expect(report.uploadExecuteAllowed).toBe(false);
  expect(report.videosInsertCalled).toBe(false);
  expect(report.videosInsertTotalCount).toBe(0);
  expect(report.commentThreadsInsertCalled).toBe(false);
  expect(report.schedulerExecutionCalled).toBe(false);
  expect(report.DB_write).toBe(false);
  expect(report.Supabase_write).toBe(false);
  expect(report.R2_upload).toBe(false);
  expect(report.storage_write).toBe(false);
  expect(report.raw_urls_printed).toBe(false);
  expect(report.raw_video_ids_printed).toBe(false);
  expect(report.raw_channel_ids_printed).toBe(false);
  expect(report.secrets_printed).toBe(false);
  expect(report.fake_success).toBe(false);
  expect(report.SAFE_TO_UPLOAD).toBe(false);
  expect(report.SAFE_TO_PUBLIC_UPLOAD).toBe(false);
  expect(JSON.stringify(report)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
}
