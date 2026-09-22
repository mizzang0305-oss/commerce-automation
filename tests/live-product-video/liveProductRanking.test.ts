import { describe, expect, test } from "vitest";
import { rankLiveProducts, selectDistinctLiveProductSlots, selectLiveProductTargetCount, type RankedLiveProduct } from "@/lib/live-product-video";
import { candidate, context, providerProduct } from "./fixtures";
import { normalizeLiveProduct } from "@/lib/live-product-video";

describe("live product ranking and fallback", () => {
  test("reuses event-aware scoring and fails closed on policy, image, affiliate, duplicate, and usage evidence", () => {
    const safe = candidate();
    const duplicate = candidate();
    const risky = candidate({ rawProductId: "222", rawProductUrl: "https://www.coupang.com/vp/products/222", rawProductName: "차량용 다이어트 영양제" });
    const missingImage = candidate({ rawProductId: "333", rawProductUrl: "https://www.coupang.com/vp/products/333", productImageUrls: [] });
    const missingAffiliate = candidate({ rawProductId: "444", rawProductUrl: "https://www.coupang.com/vp/products/444", selectedAffiliateUrl: "" });
    const ranked = rankLiveProducts({ candidates: [safe, duplicate, risky, missingImage, missingAffiliate], keywordContexts: [context], usageEvidenceAvailable: () => true });
    expect(ranked.find((entry) => entry.candidate.productKey === safe.productKey)?.score.eligible).toBe(true);
    expect(ranked.some((entry) => entry.score.blockers.includes("DUPLICATE_PRODUCT"))).toBe(true);
    expect(ranked.some((entry) => entry.score.blockers.includes("POLICY_BLOCKED"))).toBe(true);
    expect(ranked.some((entry) => entry.score.blockers.includes("PRODUCT_IMAGE_NOT_READY"))).toBe(true);
    expect(ranked.some((entry) => entry.score.blockers.includes("AFFILIATE_NOT_READY"))).toBe(true);
  });

  test("selects one eligible candidate per supported use case with a three-attempt cap", () => {
    const vehicle = candidate();
    const desk = normalizeLiveProduct(providerProduct({ rawProductId: "555", rawProductUrl: "https://www.coupang.com/vp/products/555", rawProductName: "책상 케이블 정리함", categoryPath: "수납/정리", sourceKeyword: "책상 정리함" }));
    const drying = normalizeLiveProduct(providerProduct({ rawProductId: "666", rawProductUrl: "https://www.coupang.com/vp/products/666", rawProductName: "캠핑 빨래건조대", categoryPath: "세탁/건조", sourceKeyword: "캠핑 빨래건조대" }));
    const contexts = [context, { ...context, keyword: "책상 정리함", plan: { ...context.plan, primaryKeywords: ["책상 정리함"] } }, { ...context, keyword: "캠핑 빨래건조대", plan: { ...context.plan, primaryKeywords: ["캠핑 빨래건조대"] } }];
    const ranked = rankLiveProducts({ candidates: [vehicle, desk, drying], keywordContexts: contexts, usageEvidenceAvailable: () => true });
    const selected = selectDistinctLiveProductSlots({ ranked, maxAttemptsPerSlot: 3 });
    expect(selected.selected).toHaveLength(3);
    expect(new Set(selected.selected.map((entry) => entry.candidate.useCase)).size).toBe(3);
  });

  test.each([
    [2, 2, false],
    [3, 3, true],
    [4, 3, true],
    [10, 3, true]
  ])("caps a deterministic candidate pool of %i to %i", (candidateCount, selectedCount, targetMet) => {
    const selected = selectLiveProductTargetCount({ candidates: rankedPool(candidateCount), targetCount: 3 });
    expect(selected.selected.map((entry) => entry.candidate.productKey)).toEqual(
      Array.from({ length: selectedCount }, (_, index) => `product-${String(index + 1).padStart(2, "0")}`)
    );
    expect(selected.targetMet).toBe(targetMet);
    expect(selected.discarded).toHaveLength(Math.max(0, candidateCount - 3));
  });
});

function rankedPool(count: number): RankedLiveProduct[] {
  return Array.from({ length: count }, (_, index) => ({
    candidate: { productKey: `product-${String(index + 1).padStart(2, "0")}` },
    score: { eligible: true, selectionRank: index + 1 }
  } as RankedLiveProduct));
}
