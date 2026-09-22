import type { LiveCoupangProviderProduct, LiveProductCandidate, LiveProductKeywordContext } from "@/lib/live-product-video";
import { normalizeLiveProduct } from "@/lib/live-product-video";

export const context: LiveProductKeywordContext = {
  keyword: "차량용 정리함",
  eventId: "summer-vacation",
  eventName: "Summer vacation",
  plan: {
    eventId: "summer-vacation",
    eventName: "Summer vacation",
    primaryKeywords: ["차량용 정리함"],
    secondaryKeywords: ["정리함"],
    excludedKeywords: ["영양제", "의약품"],
    preferredCategories: ["자동차용품", "수납/정리"],
    blockedCategories: ["건강기능식품"]
  }
};

export function providerProduct(overrides: Partial<LiveCoupangProviderProduct> = {}): LiveCoupangProviderProduct {
  return {
    rawProductId: "111222333",
    rawProductName: "차량용 컵홀더 정리함",
    category: "자동차용품",
    categoryPath: "자동차용품/수납",
    priceText: "19900",
    rawProductUrl: "https://www.coupang.com/vp/products/111222333?itemId=444555&vendorItemId=666777",
    selectedAffiliateUrl: "https://link.coupang.com/re/AFFSDP?lptag=AF0000000&pageKey=111222333&itemId=444555&vendorItemId=666777",
    productImageUrls: ["https://image.coupangcdn.com/image/product.jpg"],
    sourceProvider: "coupang_partners_product_search",
    sourceRequestId: "search-123456789abc",
    discoveredAt: "2026-08-08T00:00:00.000Z",
    sourceKeyword: "차량용 정리함",
    eventContext: { eventId: "summer-vacation", eventName: "Summer vacation" },
    ...overrides
  };
}

export function candidate(overrides: Partial<LiveCoupangProviderProduct> = {}): LiveProductCandidate {
  return normalizeLiveProduct(providerProduct(overrides));
}
