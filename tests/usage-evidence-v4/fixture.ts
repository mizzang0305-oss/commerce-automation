import type { RankedLiveProduct } from "@/lib/live-product-video";
import type { LocalQueueItem, ReserveCandidate } from "@/lib/queue-scheduler/types";
import { makeUsageEvidenceRegistry } from "../usage-evidence/fixture";

export function makeV4Ranked(input: { category: string; keyword: string; count: number; useCase?: RankedLiveProduct["candidate"]["useCase"] }): RankedLiveProduct[] {
  return Array.from({ length: input.count }, (_, index) => {
    const productKey = `${input.category}-${input.keyword}-${index}`;
    return {
      candidate: {
        rawProductId: String(9_000_000 + index),
        rawProductName: `${input.keyword} 상품 ${index}`,
        canonicalProductName: `${input.keyword} 상품 ${index}`,
        category: input.category,
        categoryPath: input.category,
        priceText: "12900",
        rawProductUrl: `https://example.invalid/product/${encodeURIComponent(productKey)}`,
        selectedAffiliateUrl: `https://example.invalid/affiliate/${encodeURIComponent(productKey)}`,
        productImageUrls: [`https://example.invalid/image/${index}.jpg`],
        sourceProvider: "coupang_partners_product_search",
        sourceRequestId: `request-${input.keyword}-${index}`,
        discoveredAt: "2026-08-09T00:00:00.000Z",
        sourceKeyword: input.keyword,
        eventContext: { eventId: "v4-test", eventName: "v4 test" },
        candidateId: `candidate-${productKey}`,
        productKey,
        productAliases: [],
        productAnchors: [],
        useCase: input.useCase ?? "unsupported"
      },
      score: {
        productKey,
        eventRelevanceScore: 100,
        motionSuitabilityScore: 100,
        policySafetyScore: 100,
        imageReadinessScore: 100,
        affiliateReadinessScore: 100,
        duplicatePenalty: 0,
        usageEvidenceScore: input.useCase ? 100 : 0,
        finalProductScore: 100 - index,
        selectionRank: index + 1,
        eligible: Boolean(input.useCase),
        blockers: input.useCase ? [] : ["USAGE_EVIDENCE_NOT_AVAILABLE"]
      }
    };
  });
}

export function makeActive(category: string, count: number, offset = 0): LocalQueueItem[] {
  return Array.from({ length: count }, (_, index) => {
    const productKey = `active-${category}-${offset + index}`;
    return { productKey, candidate: { productKey, category, categoryPath: category } } as unknown as LocalQueueItem;
  });
}

export function makeReserve(category: string, count: number, offset = 0): ReserveCandidate[] {
  return Array.from({ length: count }, (_, index) => {
    const productKey = `reserve-${category}-${offset + index}`;
    return { candidate: { productKey, category, categoryPath: category } } as unknown as ReserveCandidate;
  });
}

export function makeV4Registry() {
  return makeUsageEvidenceRegistry({ packsPerUseCase: 2 });
}

export function validOwnerManifest() {
  return {
    schemaVersion: "owner-sanitized-media-intake-v1",
    sourceId: "source-001",
    ownerProvided: true,
    rightsConfirmed: true,
    privacyConfirmed: true,
    brandNeutralConfirmed: true,
    allowedUseCases: ["kitchen_organization"],
    sourceHumanReviewStatus: "not_available",
    humanOwnerReviewStatus: "not_requested",
    publishEligible: false,
    noUploadAutomationCandidate: true
  } as const;
}
