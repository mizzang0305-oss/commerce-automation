import { describe, expect, test, vi } from "vitest";

import type { CoupangCandidateInput } from "@/lib/coupang/coupangCandidateImport";
import {
  scoutEventAwareCoupangCandidate,
  type EventAwareCandidateScoutSideEffects
} from "@/lib/coupang/eventAwareCandidateScout";
import { buildRollingEventWindow, listCommerceEventsForWindow } from "@/lib/coupang/eventCalendar";
import { buildEventProductKeywordPlan } from "@/lib/coupang/eventProductKeywordPlanner";
import {
  isPolicySafeEventCandidate,
  rankEventAwareCandidates,
  scoreEventAwareCandidate
} from "@/lib/coupang/eventCandidateRanking";
import type { ProductCandidate } from "@/types/automation";

const baselineCandidateId = "candidate-490aa6d25e8ea89d";

describe("event-aware Coupang candidate scout", () => {
  test("generates a rolling 30-day Asia/Seoul event window from the current date", () => {
    const window = buildRollingEventWindow({ today: "2026-06-23" });
    const events = listCommerceEventsForWindow(window);

    expect(window).toEqual({
      startDate: "2026-06-23",
      endDate: "2026-07-23",
      timezone: "Asia/Seoul",
      daysAhead: 30
    });
    expect(events.map((event) => event.eventId)).toEqual(
      expect.arrayContaining(["summer-prep", "rainy-season", "summer-vacation", "chobok"])
    );
    expect([...new Set(events.map((event) => event.source))]).toEqual(
      expect.arrayContaining(["static_calendar", "seasonal_rule"])
    );
  });

  test("creates static and seasonal product keyword plans with safe category guards", () => {
    const rainySeason = listCommerceEventsForWindow(buildRollingEventWindow({ today: "2026-06-23" }))
      .find((event) => event.eventId === "rainy-season");
    expect(rainySeason).toBeDefined();

    const plan = buildEventProductKeywordPlan(rainySeason!);

    expect(plan.primaryKeywords).toEqual(expect.arrayContaining(["제습기", "습기제거제", "빨래건조대"]));
    expect(plan.secondaryKeywords).toEqual(expect.arrayContaining(["방수커버", "우산꽂이"]));
    expect(plan.preferredCategories).toEqual(expect.arrayContaining(["생활용품", "세탁/건조", "수납/정리"]));
    expect(plan.blockedCategories).toEqual(expect.arrayContaining(["의약품", "건강기능식품", "주류", "무기"]));
    expect(plan.excludedKeywords).toEqual(expect.arrayContaining(["다이어트", "의약", "정품보장", "최저가"]));
  });

  test("blocks policy risky products before ranking", () => {
    const plan = buildEventProductKeywordPlan({
      eventId: "summer-prep",
      name: "Summer prep",
      type: "season",
      confidence: "high",
      source: "seasonal_rule",
      dateRange: { start: "2026-06-01", end: "2026-07-31" }
    });
    const risky = candidate({
      id: "candidate-risky",
      product_name: "여름 다이어트 건강기능 보조제",
      category: "건강기능식품",
      selected_affiliate_url: "https://link.coupang.com/a/risky",
      imageUrl: "https://image.example.com/risky.jpg"
    });

    expect(isPolicySafeEventCandidate(risky, plan)).toEqual({
      ok: false,
      blocked_reasons: expect.arrayContaining(["policy_risky_keyword", "policy_risky_category"])
    });
    expect(scoreEventAwareCandidate(risky, plan, { baselineCandidateId }).policySafetyScore).toBe(0);
  });

  test("event-aware ranking prefers relevant seasonal products and blocks missing readiness", () => {
    const plan = buildEventProductKeywordPlan({
      eventId: "rainy-season",
      name: "Rainy season",
      type: "weather",
      confidence: "high",
      source: "seasonal_rule",
      dateRange: { start: "2026-06-15", end: "2026-07-20" }
    });
    const relevant = candidate({
      id: "candidate-relevant",
      product_name: "장마철 제습기 빨래건조 생활 세트",
      category: "생활용품",
      selected_affiliate_url: "https://link.coupang.com/a/relevant",
      imageUrl: "https://image.example.com/relevant.jpg"
    });
    const generic = candidate({
      id: "candidate-generic",
      product_name: "무난한 인테리어 인형",
      category: "홈데코",
      selected_affiliate_url: "https://link.coupang.com/a/generic",
      imageUrl: "https://image.example.com/generic.jpg"
    });
    const missingAffiliate = candidate({
      id: "candidate-no-affiliate",
      product_name: "장마철 방수커버",
      category: "생활용품",
      selected_affiliate_url: "",
      imageUrl: "https://image.example.com/missing-affiliate.jpg"
    });
    const missingImage = candidate({
      id: "candidate-no-image",
      product_name: "장마철 습기제거제",
      category: "생활용품",
      selected_affiliate_url: "https://link.coupang.com/a/missing-image",
      imageUrl: ""
    });

    const ranked = rankEventAwareCandidates([generic, missingAffiliate, relevant, missingImage], plan, {
      baselineCandidateId
    });

    expect(ranked).toHaveLength(1);
    expect(ranked[0].candidate.id).toBe("candidate-relevant");
    expect(ranked[0].score.eventRelevanceScore).toBeGreaterThan(60);
    expect(ranked[0].score.finalScore).toBeGreaterThan(scoreEventAwareCandidate(generic, plan).finalScore);
  });

  test("scout imports exactly one safe event-aware candidate without render, R2, DB-extra, or raw URL output", async () => {
    const upsertProductCandidates = vi.fn(async (items: ProductCandidate[]) => items);
    const repository = {
      getProductCandidates: vi.fn(async () => [
        candidate({
          id: baselineCandidateId,
          product_name: "빌리빈 스테인리스 조리도구 8종 세트",
          category: "주방용품",
          selected_affiliate_url: "https://link.coupang.com/a/baseline",
          imageUrl: "https://image.example.com/baseline.jpg"
        })
      ]),
      upsertProductCandidates
    };
    const searchProducts = vi.fn(async ({ keyword }: { keyword: string }): Promise<CoupangCandidateInput[]> => [
      productInput({
        productName: "빌리빈 스테인리스 조리도구 8종 세트",
        productId: "490490490",
        affiliateSlug: "baseline-dupe",
        imageSlug: "baseline-dupe",
        keyword,
        category: "주방용품"
      }),
      productInput({
        productName: "장마철 제습기 빨래건조 생활 세트",
        productId: "770770770",
        affiliateSlug: "rain-safe",
        imageSlug: "rain-safe",
        keyword,
        category: "생활용품"
      }),
      productInput({
        productName: "장마철 건강기능 보조제",
        productId: "880880880",
        affiliateSlug: "rain-risky",
        imageSlug: "rain-risky",
        keyword,
        category: "건강기능식품"
      })
    ]);

    const result = await scoutEventAwareCoupangCandidate({
      today: "2026-06-23",
      baselineCandidateId,
      repository,
      searchProducts,
      maxKeywordsToScout: 1
    });
    const serialized = JSON.stringify(result);

    expect(result.ok).toBe(true);
    expect(result.selected_candidate?.id).not.toBe(baselineCandidateId);
    expect(result.selected_candidate?.product_name).toBe("장마철 제습기 빨래건조 생활 세트");
    expect(result.selected_score?.eventRelevanceScore).toBeGreaterThanOrEqual(60);
    expect(result.selected_score?.policySafetyScore).toBe(100);
    expect(result.safe_summary).toMatchObject({
      baseline_candidate_excluded: true,
      affiliate_url_present: true,
      product_image_present: true,
      raw_urls_printed: false
    });
    expect(result.side_effects).toEqual<EventAwareCandidateScoutSideEffects>({
      candidate_import_written: true,
      db_write_scope: "candidate_import_only",
      render_attempted: false,
      mp4_created: false,
      r2_uploaded: false,
      product_assets_written: false,
      youtube_execute_called: false,
      videos_insert_called: false,
      public_upload: false,
      unlisted_upload: false
    });
    expect(upsertProductCandidates).toHaveBeenCalledTimes(1);
    expect(upsertProductCandidates.mock.calls[0][0]).toHaveLength(1);
    expect(searchProducts).toHaveBeenCalledTimes(1);
    expect(serialized).not.toContain("link.coupang.com");
    expect(serialized).not.toContain("image.example.com");
  });
});

function candidate(input: {
  id: string;
  product_name: string;
  category: string;
  selected_affiliate_url: string;
  imageUrl: string;
}): ProductCandidate {
  return {
    id: input.id,
    product_name: input.product_name,
    raw_coupang_url: `https://www.coupang.com/vp/products/${input.id.replace(/\D/g, "") || "100000000"}`,
    selected_affiliate_url: input.selected_affiliate_url,
    product_key: `coupang:${input.id}`,
    platform: "coupang",
    source_type: "event_aware_scout",
    source_name: "event_aware_coupang_scout",
    category: input.category,
    candidate_score: 70,
    duplicate_status: "unique",
    promotion_status: "ready",
    payload: {
      thumbnail_url: input.imageUrl,
      image_url: input.imageUrl,
      category_path: input.category,
      affiliate_validation_status: input.selected_affiliate_url ? "valid" : "missing",
      image_readiness_status: input.imageUrl ? "ready" : "missing_image",
      risk_flags: []
    },
    created_at: "2026-06-23T00:00:00.000Z",
    updated_at: "2026-06-23T00:00:00.000Z"
  };
}

function productInput(input: {
  productName: string;
  productId: string;
  affiliateSlug: string;
  imageSlug: string;
  keyword: string;
  category: string;
}): CoupangCandidateInput {
  return {
    product_name: input.productName,
    raw_coupang_url: `https://www.coupang.com/vp/products/${input.productId}?itemId=${input.productId}1&vendorItemId=${input.productId}2`,
    selected_affiliate_url: `https://link.coupang.com/a/${input.affiliateSlug}`,
    productImage: `https://image.example.com/${input.imageSlug}.jpg`,
    category_path: input.category,
    source_type: "event_aware_scout",
    source: "event_aware_coupang_scout",
    price_now_text: "19900",
    keyword: input.keyword
  } satisfies CoupangCandidateInput & { keyword: string };
}
