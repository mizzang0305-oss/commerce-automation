import { describe, expect, test } from "vitest";
import { rankLiveProducts, selectDistinctLiveProductSlots, selectLiveProductTargetCount, type LiveProductUseCase, type RankedLiveProduct } from "@/lib/live-product-video";
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

  test("blocks when the candidate pool has fewer products than the requested target", () => {
    const result = selectLiveProductTargetCount({ candidates: rankedCandidates(2), targetCount: 3 });
    expect(result.targetMet).toBe(false);
    expect(result.selected).toHaveLength(2);
    expect(result.discarded).toHaveLength(0);
  });

  test("keeps exactly three candidates when the candidate pool equals the target", () => {
    const result = selectLiveProductTargetCount({ candidates: rankedCandidates(3), targetCount: 3 });
    expect(result.targetMet).toBe(true);
    expect(result.selected).toHaveLength(3);
    expect(result.discarded).toHaveLength(0);
  });

  test("takes the deterministic canonical top three and records later candidates as discarded", () => {
    const candidates = rankedCandidates(4);
    const result = selectLiveProductTargetCount({ candidates: [candidates[3], candidates[1], candidates[2], candidates[0]], targetCount: 3 });
    expect(result.targetMet).toBe(true);
    expect(result.selected.map((entry) => entry.candidate.productKey)).toEqual(candidates.slice(0, 3).map((entry) => entry.candidate.productKey));
    expect(result.discarded.map((entry) => entry.candidate.productKey)).toEqual([candidates[3].candidate.productKey]);
  });

  test("uses the same canonical top three for ten candidates across repeated inputs", () => {
    const candidates = rankedCandidates(10);
    const first = selectLiveProductTargetCount({ candidates: [...candidates].reverse(), targetCount: 3 });
    const second = selectLiveProductTargetCount({ candidates: [...candidates].reverse(), targetCount: 3 });
    const expected = candidates.slice(0, 3).map((entry) => entry.candidate.productKey);
    expect(first.selected.map((entry) => entry.candidate.productKey)).toEqual(expected);
    expect(second.selected.map((entry) => entry.candidate.productKey)).toEqual(expected);
    expect(first.discarded).toHaveLength(7);
  });

  test("does not select an affiliate-blocked candidate", () => {
    const candidates = rankedCandidates(4);
    candidates[0] = {
      candidate: { ...candidates[0].candidate, selectedAffiliateUrl: "" },
      score: { ...candidates[0].score, eligible: false, blockers: ["AFFILIATE_NOT_READY"] }
    };
    const result = selectLiveProductTargetCount({ candidates, targetCount: 3 });
    expect(result.targetMet).toBe(true);
    expect(result.selected.every((entry) => entry.score.blockers.includes("AFFILIATE_NOT_READY") === false)).toBe(true);
  });
});

const useCases: LiveProductUseCase[] = [
  "home_storage",
  "kitchen_organization",
  "camping_storage",
  "vehicle_console_organization",
  "vehicle_cabin_storage",
  "cable_organization",
  "laundry_space_organization",
  "vehicle_organization",
  "desk_organization",
  "laundry_drying"
];

function rankedCandidates(count: number): RankedLiveProduct[] {
  return Array.from({ length: count }, (_, index) => {
    const product = candidate({
      rawProductId: `target-${index + 1}`,
      rawProductUrl: `https://www.coupang.com/vp/products/target-${index + 1}`,
      rawProductName: `정리 상품 ${index + 1}`
    });
    const live = { ...product, useCase: useCases[index] };
    return {
      candidate: live,
      score: {
        productKey: live.productKey,
        eventRelevanceScore: 100,
        motionSuitabilityScore: 100,
        policySafetyScore: 100,
        imageReadinessScore: 100,
        affiliateReadinessScore: 100,
        duplicatePenalty: 0,
        usageEvidenceScore: 100,
        finalProductScore: 100 - index,
        selectionRank: index + 1,
        eligible: true,
        blockers: []
      }
    };
  });
}
