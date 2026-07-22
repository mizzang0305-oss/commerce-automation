import { describe, expect, test, vi } from "vitest";
import {
  COMMERCE_DAILY_KST_SLOTS,
  buildCommerceDailyScheduleId
} from "@/lib/orchestration/commerceDailyCadence";
import {
  buildScheduledEventProductPreview,
  buildScheduledEventProductProviderPlan,
  COUPANG_SCHEDULED_PRODUCT_SEARCH_APPROVAL,
  searchScheduledEventProducts
} from "@/lib/coupang/scheduledEventProductProvider";

describe("scheduled event product provider", () => {
  test("defines four distinct Korea publishing target windows", () => {
    expect(COMMERCE_DAILY_KST_SLOTS.map((slot) => [slot.id, slot.local_time, slot.product_rank])).toEqual([
      ["morning_commute", "07:30", 0],
      ["lunch_break", "12:20", 1],
      ["evening_commute", "18:30", 2],
      ["before_bed", "22:30", 3]
    ]);
    expect(buildCommerceDailyScheduleId({
      date: "2026-07-21T23:10:00.000Z",
      slotId: "morning_commute"
    })).toBe("commerce-daily-2026-07-22-morning_commute");
  });

  test("builds an event-aware provider plan without making a live call", () => {
    const plan = buildScheduledEventProductProviderPlan({
      slotId: "lunch_break",
      now: "2026-07-22T03:20:00.000Z",
      env: {}
    });

    expect(plan).toMatchObject({
      mode: "korea_30d_event_coupang_provider_plan",
      schedule_id: "commerce-daily-2026-07-22-lunch_break",
      slot: {
        id: "lunch_break",
        local_time: "12:20",
        timezone: "Asia/Seoul",
        product_rank: 1
      },
      source_authorization_basis: "owned_channel",
      provider: {
        id: "coupang_partners_product_search",
        ready: false,
        blocker: "COUPANG_PARTNERS_PROVIDER_DISABLED",
        external_api_call_allowed: false,
        external_api_called: false,
        process_credentials_read_by_plan: false,
        live_search_requires_separate_approval: true,
        raw_values_masked: true
      },
      output: {
        local_plan_logged: true,
        owner_review_required: true,
        draft_created: false,
        publish_attempted: false,
        external_upload: false,
        SAFE_TO_UPLOAD: false,
        SAFE_TO_PUBLIC_UPLOAD: false
      }
    });
    expect(plan.selected_event).not.toBeNull();
    expect(plan.search_keywords.length).toBeGreaterThan(0);
  });

  test("assigns four distinct near-term Korean events to the four daily slots", () => {
    const eventIds = COMMERCE_DAILY_KST_SLOTS.map((slot) =>
      buildScheduledEventProductProviderPlan({
        slotId: slot.id,
        now: "2026-07-22T00:00:00.000Z",
        env: {}
      }).selected_event?.id
    );

    expect(eventIds.every(Boolean)).toBe(true);
    expect(new Set(eventIds).size).toBe(4);
  });

  test("uses the slot rank to avoid repeating the same top product all day", () => {
    const products = Array.from({ length: 4 }, (_, index) => ({
      schema_version: "1" as const,
      product_name: `후보 ${index + 1}`,
      price: 1000 + index,
      image_url: `https://thumbnail.example.test/${index + 1}.jpg`,
      stock_status: "unknown" as const,
      seller: "Coupang",
      collected_at: "2026-07-22T00:00:00.000Z",
      source_url: `https://www.coupang.com/vp/products/${index + 1}`,
      raw_hash: String(index + 1).repeat(64)
    }));
    const selectedNames = COMMERCE_DAILY_KST_SLOTS.map((slot) =>
      buildScheduledEventProductPreview({
        slotId: slot.id,
        products,
        now: "2026-07-22T00:00:00.000Z"
      }).product?.product_name
    );

    expect(selectedNames).toEqual(["후보 1", "후보 2", "후보 3", "후보 4"]);
  });

  test("reports credential readiness without serializing raw values or calling the API", () => {
    const plan = buildScheduledEventProductProviderPlan({
      slotId: "before_bed",
      now: "2026-07-22T13:30:00.000Z",
      env: {
        COUPANG_PARTNERS_PROVIDER_ENABLED: "true",
        COUPANG_PARTNERS_ACCESS_KEY: "sensitive-access",
        COUPANG_PARTNERS_SECRET_KEY: "sensitive-secret",
        COUPANG_PARTNER_ID: "sensitive-partner"
      }
    });
    const serialized = JSON.stringify(plan);

    expect(plan.provider).toMatchObject({
      ready: true,
      blocker: null,
      external_api_call_allowed: false,
      external_api_called: false,
      process_credentials_read_by_plan: false,
      live_search_requires_separate_approval: true,
      raw_values_masked: true
    });
    expect(serialized).not.toContain("sensitive-access");
    expect(serialized).not.toContain("sensitive-secret");
    expect(serialized).not.toContain("sensitive-partner");
    expect(serialized).not.toMatch(/"Authorization"|access-key=|signature=/i);
  });

  test("blocks live search before reading credentials or calling fetch without exact approval", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const result = await searchScheduledEventProducts({
      slotId: "morning_commute",
      approval: "wrong",
      now: "2026-07-22T00:00:00.000Z",
      env: {
        COUPANG_PARTNERS_ACCESS_KEY: "must-not-be-used",
        COUPANG_PARTNERS_SECRET_KEY: "must-not-be-used"
      },
      fetchImpl
    });

    expect(result).toMatchObject({
      ok: false,
      blocker: "COUPANG_SCHEDULED_PRODUCT_SEARCH_APPROVAL_REQUIRED",
      products: [],
      external_api_called: false,
      credential_input_used: false,
      automatic_retry_attempted: false,
      local_pool_write_allowed: false,
      publish_attempted: false
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("must-not-be-used");
  });

  test("normalizes mocked provider results for local preview after exact one-shot approval", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      data: {
        productData: [
          {
            productName: "광복절 태극기 세트",
            productPrice: 12900,
            productImage: "https://thumbnail.example.test/flag.jpg",
            productUrl: "https://www.coupang.com/vp/products/123456"
          },
          {
            productName: "unsafe source",
            productPrice: 100,
            productImage: "https://thumbnail.example.test/unsafe.jpg",
            productUrl: "https://example.test/products/1"
          }
        ]
      }
    }), { status: 200 }));
    const result = await searchScheduledEventProducts({
      slotId: "evening_commute",
      approval: COUPANG_SCHEDULED_PRODUCT_SEARCH_APPROVAL,
      now: "2026-07-22T09:30:00.000Z",
      env: {
        COUPANG_PARTNERS_PROVIDER_ENABLED: "true",
        COUPANG_PARTNERS_ACCESS_KEY: "dummy-access",
        COUPANG_PARTNERS_SECRET_KEY: "dummy-secret",
        COUPANG_PARTNER_ID: "dummy-partner"
      },
      fetchImpl
    });

    expect(result).toMatchObject({
      ok: true,
      blocker: null,
      external_api_called: true,
      credential_input_used: true,
      automatic_retry_attempted: false,
      local_pool_write_allowed: true,
      owner_review_required: true,
      publish_attempted: false,
      products: [{
        product_name: "광복절 태극기 세트",
        price: 12900,
        source_url: "https://www.coupang.com/vp/products/123456"
      }]
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.products).toHaveLength(1);
  });
});
