import { describe, expect, test } from "vitest";
import type { ChannelProfile, EventCalendarItem, ProductCandidate, ProductionHistory } from "@/types/automation";
import { buildDailyProductionPlan } from "@/lib/planner/dailyProductionPlanner";

function eventFixture(overrides: Partial<EventCalendarItem> = {}): EventCalendarItem {
  return {
    id: "event-gift",
    event_key: "gift-season",
    event_name: "연말선물",
    event_type: "season",
    starts_at: "2026-12-20T00:00:00.000Z",
    ends_at: "2026-12-31T00:00:00.000Z",
    lead_days_min: 7,
    lead_days_max: 30,
    target_categories: ["선물", "생활"],
    target_keywords: ["선물", "추천"],
    excluded_keywords: [],
    platforms: ["coupang"],
    priority: 90,
    seasonality_score: 25,
    status: "active",
    created_at: "2026-12-01T00:00:00.000Z",
    updated_at: "2026-12-01T00:00:00.000Z",
    ...overrides
  };
}

function candidateFixture(overrides: Partial<ProductCandidate> = {}): ProductCandidate {
  return {
    id: "candidate-gift-001",
    product_name: "연말 선물 추천 머그컵",
    raw_coupang_url: "https://www.coupang.com/vp/products/gift-001",
    selected_affiliate_url: "https://link.coupang.com/a/gift-001",
    product_key: "coupang:gift-001",
    platform: "coupang",
    source_type: "event",
    source_name: "gift-season",
    category: "선물",
    candidate_score: 92,
    score_reason: "",
    duplicate_status: "unique",
    promotion_status: "ready",
    payload: { keywords: ["선물", "추천"], event_key: "gift-season" },
    created_at: "2026-12-01T00:00:00.000Z",
    updated_at: "2026-12-01T00:00:00.000Z",
    ...overrides
  };
}

function channelFixture(overrides: Partial<ChannelProfile> = {}): ChannelProfile {
  return {
    id: "channel-event-gift",
    channel_key: "event-gift",
    channel_name: "이벤트 선물 추천",
    platform: "youtube",
    youtube_channel_id: "",
    youtube_handle: "",
    niche: "시즌/기념일/선물 추천",
    allowed_categories: ["선물", "생활"],
    excluded_categories: [],
    default_hashtags: ["#선물추천", "#쿠팡추천"],
    upload_window: { start_hour: 10, end_hour: 20 },
    status: "active",
    upload_enabled: false,
    manual_upload_only: true,
    created_at: "2026-12-01T00:00:00.000Z",
    updated_at: "2026-12-01T00:00:00.000Z",
    ...overrides
  };
}

describe("daily production planner", () => {
  test("plans ready unique candidates and assigns manual-only channel profiles", () => {
    const result = buildDailyProductionPlan({
      date: "2026-12-01",
      candidates: [
        candidateFixture(),
        candidateFixture({ id: "candidate-no-affiliate", selected_affiliate_url: "" }),
        candidateFixture({ id: "candidate-duplicate", product_key: "coupang:gift-duplicate", duplicate_status: "duplicate_candidate" })
      ],
      events: [eventFixture()],
      channelProfiles: [channelFixture()],
      targetCount: 3,
      now: new Date("2026-12-01T00:00:00.000Z")
    });

    expect(result.plan).toMatchObject({
      plan_date: "2026-12-01",
      status: "draft",
      target_video_count: 3
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      product_candidate_id: "candidate-gift-001",
      event_key: "gift-season",
      target_channel_id: "channel-event-gift",
      status: "planned"
    });
    expect(result.channel_safety).toMatchObject({
      youtube_upload_enabled: false,
      manual_upload_only: true
    });
  });

  test("excludes product keys already produced today", () => {
    const productionHistory: ProductionHistory[] = [
      {
        id: "history-produced",
        product_queue_id: "queue-produced",
        worker_job_id: "job-produced",
        event_type: "worker_job_completed",
        message: "completed",
        metadata: { product_key: "coupang:gift-001" },
        created_at: "2026-12-01T05:00:00.000Z"
      }
    ];

    const result = buildDailyProductionPlan({
      date: "2026-12-01",
      candidates: [candidateFixture()],
      events: [eventFixture()],
      channelProfiles: [channelFixture()],
      targetCount: 3,
      productionHistory,
      now: new Date("2026-12-01T00:00:00.000Z")
    });

    expect(result.items).toHaveLength(0);
    expect(result.excluded.some((item) => item.reason.includes("오늘 이미 제작"))).toBe(true);
  });
});
