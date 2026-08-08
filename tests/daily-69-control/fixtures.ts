import type { RankedLiveProduct } from "@/lib/live-product-video";

export function rankedProducts(count: number, formulaFirst = false): RankedLiveProduct[] {
  return Array.from({ length: count }, (_, index) => {
    const useCase = index % 3 === 0 ? "vehicle_organization" : index % 3 === 1 ? "desk_organization" : "laundry_drying";
    const names = { vehicle_organization: "차량 정리함", desk_organization: "책상 케이블 정리", laundry_drying: "접이식 빨래건조대" } as const;
    const canonicalProductName = index === 0 && formulaFirst ? '=HYPERLINK("https://invalid.example","상품")' : `${names[useCase]} ${index}`;
    return {
      candidate: {
        candidateId: `daily69-${index}`, productKey: `daily69-product-${index}`, rawProductId: `${100000 + index}`,
        rawProductName: canonicalProductName, canonicalProductName, productAliases: [canonicalProductName], productAnchors: [names[useCase], "정리"], useCase,
        category: `카테고리${index % 3}`, categoryPath: `카테고리${index % 3}>상품군${index}`, priceText: `${10000 + index}`,
        rawProductUrl: `https://www.coupang.com/vp/products/${100000 + index}`, selectedAffiliateUrl: `https://link.coupang.com/a/test${index}`,
        productImageUrls: [`https://image.coupangcdn.com/image/test-${index}.jpg`], sourceProvider: "coupang_partners_product_search",
        sourceRequestId: `request-${index}`, discoveredAt: "2026-08-09T00:00:00.000Z", sourceKeyword: names[useCase], eventContext: { eventId: "daily69", eventName: "daily69" }
      },
      score: { productKey: `daily69-product-${index}`, eventRelevanceScore: 90, motionSuitabilityScore: 90, policySafetyScore: 100, imageReadinessScore: 100, affiliateReadinessScore: 100, duplicatePenalty: 0, usageEvidenceScore: 100, finalProductScore: 100 - index / 100, selectionRank: index + 1, eligible: true, blockers: [] }
    };
  });
}
