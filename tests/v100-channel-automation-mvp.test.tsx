import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { POST as nextBatch } from "../app/api/run/next-batch/route";
import { GET as getQueue } from "../app/api/queue/route";
import { DashboardView } from "../src/components/DashboardView";
import { QueueFilters } from "../src/components/QueueFilters";
import { RunLogTable } from "../src/components/RunLogTable";
import { resetMockRepositoryForTests, getAutomationRepository } from "@/lib/repositories/automationRepository";
import {
  buildChannelNextBatchPayload,
  buildChannelAutomationCards,
  getDefaultChannelAutomationSettings,
  getDueQueueItems,
  CHANNEL_AUTOMATION_KEYS
} from "@/lib/channelAutomation";
import type { AutomationRun, ProductQueueItem } from "@/types/automation";

const RAW_WEBHOOK_URL = "https://n8n.example.com/webhook/v100-secret";
const RAW_SECRET = "n8n-v100-secret";

describe("v100 channel automation MVP no-upload", () => {
  beforeEach(() => {
    resetMockRepositoryForTests();
    delete process.env.N8N_NEXT_BATCH_WEBHOOK_URL;
    delete process.env.N8N_WEBHOOK_SECRET;
    delete process.env.PUBLIC_APP_BASE_URL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("selects due queue items for one channel only and respects status, schedule, rank, and batch size", () => {
    const now = new Date("2026-07-08T00:00:00.000Z");
    const settings = getDefaultChannelAutomationSettings("father_jobs", {
      batch_size: 2
    });
    const items = [
      queueItem("father-2", "father_jobs", "scheduled", 2, "2026-07-07T23:00:00.000Z"),
      queueItem("lets-1", "lets_buy", "scheduled", 1, "2026-07-07T23:00:00.000Z"),
      queueItem("father-future", "father_jobs", "scheduled", 1, "2026-07-09T00:00:00.000Z"),
      queueItem("father-hold", "father_jobs", "hold", 1, "2026-07-07T23:00:00.000Z"),
      queueItem("father-1", "father_jobs", "scheduled", 1, "2026-07-07T23:00:00.000Z"),
      queueItem("father-3", "father_jobs", "scheduled", 3, "2026-07-07T23:00:00.000Z")
    ];

    expect(getDueQueueItems(items, settings, now, "father_jobs").map((item) => item.id)).toEqual([
      "father-1",
      "father-2"
    ]);
  });

  test("builds a sanitized channel next-batch payload with channel key and selected items", () => {
    const settings = getDefaultChannelAutomationSettings("father_jobs", { batch_size: 3, interval_hours: 1 });
    const payload = buildChannelNextBatchPayload({
      channelKey: "father_jobs",
      settings,
      requestId: "channel_next_batch-test",
      requestedAt: "2026-07-08T00:00:00.000Z",
      items: [queueItem("father-1", "father_jobs")],
      callbackBaseUrl: "https://app.example.test"
    });
    const serialized = JSON.stringify(payload);

    expect(payload).toMatchObject({
      type: "next_batch",
      channel_key: "father_jobs",
      batch_size: 3,
      interval_hours: 1,
      mode: "process_next_batch"
    });
    expect(payload.items).toHaveLength(1);
    expect(payload.callback).toMatchObject({
      method: "POST",
      url: "https://app.example.test/api/callback/n8n/batch-result"
    });
    expect(serialized).not.toContain(RAW_WEBHOOK_URL);
    expect(serialized).not.toContain(RAW_SECRET);
  });

  test("channel next-batch marks selected items processing and sends only a sanitized n8n payload", async () => {
    const repository = getAutomationRepository();
    await repository.updateSettings({ is_paused: false, batch_size: 2 });
    const fatherItems = (await repository.getQueue()).filter((item) => item.channelKey === "father_jobs").slice(0, 2);
    for (const item of fatherItems) {
      await repository.updateQueueItemById(item.id, {
        queue_status: "scheduled",
        scheduled_at: "2026-07-07T00:00:00.000Z"
      });
    }
    process.env.N8N_NEXT_BATCH_WEBHOOK_URL = RAW_WEBHOOK_URL;
    process.env.N8N_WEBHOOK_SECRET = RAW_SECRET;
    process.env.PUBLIC_APP_BASE_URL = "https://app.example.test";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, run_id: "n8n-v100", processed_count: 2, error_count: 0 }), {
        status: 200
      })
    );

    const response = await nextBatch(
      new Request("http://localhost/api/run/next-batch?channelKey=father_jobs", { method: "POST" })
    );
    const payload = await response.json() as Record<string, unknown>;
    const processingItems = await repository.getQueue({ status: "processing" });
    const runs = await repository.getRuns();
    const requestBody = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body));

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      channel_key: "father_jobs",
      selected_items: 2,
      created_jobs: 0,
      uploadExecuteCalled: false,
      videosInsertCalled: false,
      commentThreadsInsertCalled: false,
      SAFE_TO_UPLOAD: false,
      SAFE_TO_PUBLIC_UPLOAD: false
    });
    expect(requestBody.channel_key).toBe("father_jobs");
    expect(requestBody.items).toHaveLength(2);
    expect(processingItems.map((item) => item.channelKey)).toContain("father_jobs");
    expect(await repository.getWorkerJobs()).toHaveLength(0);
    expect(runs[0]).toMatchObject({ run_type: "channel_next_batch", status: "success", channelKey: "father_jobs" });
    expect(JSON.stringify(payload)).not.toContain(RAW_WEBHOOK_URL);
    expect(JSON.stringify(runs[0])).not.toContain(RAW_WEBHOOK_URL);
    expect(JSON.stringify(runs[0])).not.toContain(RAW_SECRET);
  });

  test("channel next-batch rolls selected items back to scheduled when webhook fails", async () => {
    const repository = getAutomationRepository();
    await repository.updateSettings({ is_paused: false, batch_size: 1 });
    const item = (await repository.getQueue()).find((entry) => entry.channelKey === "father_jobs");
    await repository.updateQueueItemById(item?.id ?? "", {
      queue_status: "scheduled",
      scheduled_at: "2026-07-07T00:00:00.000Z"
    });
    process.env.N8N_NEXT_BATCH_WEBHOOK_URL = RAW_WEBHOOK_URL;
    process.env.N8N_WEBHOOK_SECRET = RAW_SECRET;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: false }), { status: 500 }));

    const response = await nextBatch(
      new Request("http://localhost/api/run/next-batch", {
        method: "POST",
        body: JSON.stringify({ channelKey: "father_jobs" })
      })
    );
    const payload = await response.json() as Record<string, unknown>;
    const updated = await repository.getQueueItem(item?.id ?? "");

    expect(response.status).toBe(502);
    expect(payload).toMatchObject({
      ok: false,
      channel_key: "father_jobs",
      selected_items: 1,
      created_jobs: 0,
      videosInsertCalled: false,
      commentThreadsInsertCalled: false
    });
    expect(updated?.queue_status).toBe("scheduled");
    expect(await repository.getWorkerJobs()).toHaveLength(0);
  });

  test("GET /api/queue supports channelKey filter", async () => {
    const response = await getQueue(new Request("http://localhost/api/queue?channelKey=lets_buy&limit=10"));
    const payload = await response.json() as { items: ProductQueueItem[] };

    expect(response.status).toBe(200);
    expect(payload.items.length).toBeGreaterThan(0);
    expect(payload.items.every((item) => item.channelKey === "lets_buy")).toBe(true);
  });

  test("dashboard channel cards expose manual-upload readiness without upload controls", () => {
    const cards = buildChannelAutomationCards({
      items: [
        queueItem("father-ready", "father_jobs", "ready_for_manual_upload"),
        queueItem("father-processing", "father_jobs", "processing"),
        queueItem("lets-error", "lets_buy", "error")
      ],
      settings: CHANNEL_AUTOMATION_KEYS.map((channelKey) => getDefaultChannelAutomationSettings(channelKey))
    });

    render(
      <DashboardView
        settings={mockSettings()}
        items={[]}
        summary={mockSummary()}
        runs={[]}
        diagnostics={mockDiagnostics()}
        channelAutomationCards={cards}
      />
    );

    expect(screen.getByText("Autopilot Scheduler: Scaffold Only")).toBeInTheDocument();
    expect(screen.getByText("SAFE_TO_UPLOAD=false")).toBeInTheDocument();
    expect(screen.getAllByText("실제 업로드/댓글 실행 비활성화").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /public upload/i })).not.toBeInTheDocument();
  });

  test("queue filters and runs table show channel key without exposing webhook secrets", () => {
    render(<QueueFilters defaults={{ channelKey: "father_jobs" }} />);
    expect(screen.getByLabelText("Channel")).toHaveValue("father_jobs");

    const run: AutomationRun = {
      id: "run-v100",
      request_id: "req-v100",
      run_type: "channel_next_batch",
      status: "success",
      processed_count: 1,
      error_count: 0,
      started_at: "2026-07-08T00:00:00.000Z",
      finished_at: "2026-07-08T00:00:01.000Z",
      log: "safe only",
      safe_message: "channel batch queued",
      channelKey: "father_jobs"
    };
    render(<RunLogTable runs={[run]} />);

    expect(screen.getAllByText("father_jobs").length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain(RAW_WEBHOOK_URL);
    expect(document.body.textContent).not.toContain(RAW_SECRET);
  });
});

function queueItem(
  id: string,
  channelKey: ProductQueueItem["channelKey"] = "father_jobs",
  queue_status: ProductQueueItem["queue_status"] = "scheduled",
  queue_rank = 1,
  scheduled_at = "2026-07-07T00:00:00.000Z"
): ProductQueueItem {
  const now = "2026-07-08T00:00:00.000Z";
  return {
    id,
    channelKey,
    queue_date: "2026-07-08",
    queue_rank,
    upload_slot: 1,
    scheduled_at,
    keyword: "keyword",
    theme: "theme",
    product_name: `Product ${id}`,
    category_path: "생활",
    price_now_text: "9,900원",
    thumbnail_url: "https://picsum.photos/seed/v100/360/240",
    raw_coupang_url: "https://www.coupang.com/vp/products/v100",
    selected_affiliate_url: "https://link.coupang.com/a/v100",
    product_score: 90,
    score_reason: "safe fixture",
    video_angle: "safe fixture",
    queue_status,
    video_url: "",
    video_snapshot_url: "",
    blog_draft_url: "",
    youtube_upload_status: "not_ready",
    tiktok_upload_status: "not_ready",
    threads_post_status: "not_ready",
    manual_review_status: "not_ready",
    error_message: "",
    created_at: now,
    updated_at: now
  };
}

function mockSettings() {
  return {
    id: "settings",
    daily_target_count: 3,
    batch_size: 1,
    interval_hours: 1,
    start_hour: 0,
    end_hour: 23,
    run_mode: "generate_only" as const,
    is_paused: false,
    youtube_upload_enabled: false,
    approval_required: true,
    python_worker_enabled: true,
    max_daily_uploads: 0,
    max_daily_videos: 3,
    allowed_worker_job_types: ["video_render", "sheet_sync"] as const,
    category_include: [],
    category_exclude: [],
    updated_at: "2026-07-08T00:00:00.000Z"
  };
}

function mockSummary() {
  return {
    total: 0,
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
}

function mockDiagnostics() {
  return {
    nightlyScoutConfigured: false,
    nextBatchConfigured: false,
    retryItemConfigured: false,
    holdItemConfigured: false,
    skipItemConfigured: false,
    secretConfigured: false,
    callbackBaseUrlConfigured: false,
    callbackSecretConfigured: false
  };
}
