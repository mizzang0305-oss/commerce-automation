import { describe, expect, it, vi } from "vitest";
import { scoutStudioCandidates, upcomingSlots } from "@/lib/commerce-studio/candidates/scout";
import type { SimpleProducerConfig, SimpleProducerState } from "@/lib/simple-producer/types";
import type { LiveCoupangProviderResult } from "@/lib/live-product-video/liveCoupangProvider";
import type { OwnerReviewedRealUseAsset } from "@/lib/video-automation/types";

const now = new Date("2026-09-24T01:00:00.000Z");
const config: SimpleProducerConfig = { schema: "simple-producer/v1", enabled: true, dailyGenerateTarget: 3,
  maxItemsPerRun: 1, generationSlots: ["09:00", "15:00", "21:00"], timeZone: "Asia/Seoul", evidenceRoot: "D:\\isolated" };
const state: SimpleProducerState = { schema: "simple-producer/v1", slots: [] };
const publisher = { jobs: [], ledger: [] };

function found(keyword: string): LiveCoupangProviderResult {
  return { ok: true, configured: true, blocker: null, apiCallCount: 1, searchApiCalled: true,
    deeplinkApiCalled: false, credentialsExposed: false, authorizationHeadersExposed: false,
    products: [{ rawProductId: "123", rawProductName: `${keyword} 차량 수납함`, category: "자동차용품",
      categoryPath: "자동차용품 차량 수납", priceText: "10000", rawProductUrl: "https://www.coupang.com/vp/products/123?itemId=456&vendorItemId=789",
      selectedAffiliateUrl: "https://link.coupang.com/a/fixture", productImageUrls: ["https://thumbnail.coupangcdn.com/fixture.jpg"],
      sourceProvider: "coupang_partners_product_search", sourceRequestId: "fixture-request", discoveredAt: now.toISOString(),
      sourceKeyword: keyword, eventContext: { eventId: "fixture", eventName: "fixture" } }] };
}

describe("bounded Studio candidate scout", () => {
  it("includes only future today/tomorrow slots", () => {
    expect(upcomingSlots(now, config.generationSlots)).toEqual([
      "2026-09-24|15:00", "2026-09-24|21:00", "2026-09-25|09:00", "2026-09-25|15:00", "2026-09-25|21:00"
    ]);
  });

  it("reuses a fresh candidate cache without a provider call", async () => {
    const search = vi.fn();
    const result = await scoutStudioCandidates({ now, config, publisher, assetRoot: "D:\\assets", search,
      state: { ...state, studioCandidatesScoutedAt: new Date(now.getTime() - 60_000).toISOString(), studioCandidates: [] } });
    expect(result).toMatchObject({ ok: true, cacheHit: true, searchCalls: 0 });
    expect(search).not.toHaveBeenCalled();
  });

  it("refreshes candidate evidence at the 30-minute selection boundary", async () => {
    const search = vi.fn(async () => ({ ...found("fixture"), ok: false, blocker: "COUPANG_PARTNERS_SEARCH_EMPTY" as const, products: [] }));
    const result = await scoutStudioCandidates({ now, config, publisher, assetRoot: "D:\\assets", search,
      state: { ...state, studioCandidatesScoutedAt: new Date(now.getTime() - 1_800_000).toISOString(), studioCandidates: [] } });
    expect(result.cacheHit).toBe(false);
    expect(search).toHaveBeenCalled();
  });

  it("bounds real provider searches and never creates a candidate from an empty response", async () => {
    const search = vi.fn(async ({ context }: { context: { keyword: string } }) => found(context.keyword));
    const result = await scoutStudioCandidates({ now, config, state, publisher, assetRoot: "D:\\assets", search,
      resolveUsage: async () => ({} as OwnerReviewedRealUseAsset) });
    expect(result.ok).toBe(true);
    expect(search.mock.calls.length).toBeLessThanOrEqual(5);
    expect(result.searchCalls).toBe(search.mock.calls.length);
    expect(result.candidates.length).toBeLessThanOrEqual(60);
    expect(result.candidates.every((candidate) => candidate.productId === "coupang:product:123:item:456:vendor:789")).toBe(true);
    const empty = await scoutStudioCandidates({ now, config, state, publisher, assetRoot: "D:\\assets",
      search: async () => ({ ...found("fixture"), ok: false, blocker: "COUPANG_PARTNERS_SEARCH_EMPTY", products: [] }) });
    expect(empty.candidates).toEqual([]);
    expect(empty.eligibleProductsFound).toBe(0);
  });

  it("fails closed on missing provider rather than inventing fixture products", async () => {
    const result = await scoutStudioCandidates({ now, config, state, publisher, assetRoot: "D:\\assets",
      search: async () => ({ ...found("fixture"), ok: false, configured: false, products: [] }) });
    expect(result).toMatchObject({ ok: false, safeError: "STUDIO_SCOUT_PROVIDER_NOT_CONFIGURED", candidates: [] });
  });
});
