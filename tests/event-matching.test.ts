import { describe, expect, test } from "vitest";
import type { EventCalendarItem, ProductCandidate } from "@/types/automation";
import {
  getUpcomingEvents,
  matchCandidateToEvents,
  scoreEventCandidate
} from "@/lib/events/eventMatching";

function eventFixture(overrides: Partial<EventCalendarItem> = {}): EventCalendarItem {
  return {
    id: "event-summer-trip",
    event_key: "summer-trip",
    event_name: "여름휴가",
    event_type: "season",
    starts_at: "2026-06-20T00:00:00.000Z",
    ends_at: "2026-06-30T00:00:00.000Z",
    lead_days_min: 7,
    lead_days_max: 30,
    target_categories: ["여행", "생활"],
    target_keywords: ["휴가", "여행", "쿨러"],
    excluded_keywords: ["중고", "해외직구"],
    platforms: ["coupang", "test"],
    priority: 80,
    seasonality_score: 20,
    status: "active",
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    ...overrides
  };
}

function candidateFixture(overrides: Partial<ProductCandidate> = {}): ProductCandidate {
  return {
    id: "candidate-summer-cooler",
    product_name: "여름휴가 휴대용 쿨러백",
    raw_coupang_url: "https://www.coupang.com/vp/products/summer-cooler",
    selected_affiliate_url: "https://link.coupang.com/a/summer-cooler",
    product_key: "coupang:summer-cooler",
    platform: "coupang",
    source_type: "event",
    source_name: "summer-trip",
    category: "여행",
    candidate_score: 88,
    score_reason: "휴가 시즌 키워드와 카테고리 일치",
    duplicate_status: "unique",
    promotion_status: "ready",
    payload: {
      event_key: "summer-trip",
      event_name: "여름휴가",
      keywords: ["휴가", "여행"],
      thumbnail_url: "https://image.example.com/summer-cooler.jpg"
    },
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    ...overrides
  };
}

describe("event candidate matching", () => {
  test("selects active events inside the 7-30 day production window", () => {
    const events = [
      eventFixture(),
      eventFixture({
        id: "event-too-soon",
        event_key: "too-soon",
        starts_at: "2026-06-05T00:00:00.000Z"
      }),
      eventFixture({
        id: "event-too-late",
        event_key: "too-late",
        starts_at: "2026-08-10T00:00:00.000Z"
      }),
      eventFixture({
        id: "event-paused",
        event_key: "paused",
        status: "paused"
      })
    ];

    expect(getUpcomingEvents(events, new Date("2026-06-01T00:00:00.000Z"), 30).map((event) => event.event_key))
      .toEqual(["summer-trip"]);
  });

  test("scores matching candidates and excludes unsafe or unusable candidates", () => {
    const event = eventFixture();

    expect(scoreEventCandidate(candidateFixture(), event).excluded).toBe(false);
    expect(scoreEventCandidate(candidateFixture(), event).match_score).toBeGreaterThan(100);
    expect(scoreEventCandidate(candidateFixture({ selected_affiliate_url: "" }), event)).toMatchObject({
      excluded: true,
      excluded_reason: "제휴 링크가 없어 이벤트 제작 후보에서 제외했습니다."
    });
    expect(scoreEventCandidate(candidateFixture({ duplicate_status: "already_queued" }), event)).toMatchObject({
      excluded: true,
      excluded_reason: "중복 후보는 이벤트 제작 후보에서 제외했습니다."
    });
    expect(scoreEventCandidate(candidateFixture({ product_name: "여름휴가 중고 쿨러백" }), event)).toMatchObject({
      excluded: true,
      excluded_reason: "제외 키워드가 포함되어 이벤트 제작 후보에서 제외했습니다."
    });
  });

  test("returns sorted candidate event matches with production and publish dates", () => {
    const matches = matchCandidateToEvents(
      candidateFixture(),
      [
        eventFixture({ event_key: "lower", priority: 10, target_keywords: ["휴대용"] }),
        eventFixture()
      ],
      new Date("2026-06-01T00:00:00.000Z")
    );

    expect(matches[0]).toMatchObject({
      event_key: "summer-trip",
      event_name: "여름휴가"
    });
    expect(matches[0].recommended_production_date).toBe("2026-06-01");
    expect(matches[0].recommended_publish_date).toBe("2026-06-13");
  });
});
