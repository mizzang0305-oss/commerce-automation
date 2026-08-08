import { describe, expect, test } from "vitest";
import { classifyLiveProductUseCase, normalizeCanonicalProductName, normalizeLiveProduct } from "@/lib/live-product-video";
import { providerProduct } from "./fixtures";

describe("live product normalizer", () => {
  test("normalizes promotion and option suffixes without changing identity", () => {
    expect(normalizeCanonicalProductName("[로켓배송] 차량용 컵홀더 정리함, 색상: 블랙")).toBe("차량용 컵홀더 정리함");
  });

  test("binds deterministic identity, provenance, aliases, and anchors", () => {
    const result = normalizeLiveProduct(providerProduct());
    expect(result.productKey).toContain("coupang:product:111222333");
    expect(result.useCase).toBe("vehicle_organization");
    expect(result.productAnchors).toEqual(expect.arrayContaining(["차량", "정리", "수납"]));
    expect(result.sourceRequestId).toBe("search-123456789abc");
  });

  test("classifies only supported owner-reviewed use cases", () => {
    expect(classifyLiveProductUseCase("책상 케이블 선정리 홀더")).toBe("desk_organization");
    expect(classifyLiveProductUseCase("접이식 빨래 건조대")).toBe("laundry_drying");
    expect(classifyLiveProductUseCase("휴대용 선풍기")).toBe("unsupported");
  });
});
