import { describe, expect, test } from "vitest";
import type { ProductCandidate } from "@/types/automation";
import { createCandidateProductKey, normalizeCandidateUrl } from "@/lib/candidates/productKey";

function candidateFixture(overrides: Partial<ProductCandidate> = {}): ProductCandidate {
  return {
    id: "candidate-key-001",
    product_name: "  접이식   노트북 거치대  ",
    raw_coupang_url: "https://www.coupang.com/vp/products/123456?utm_source=test&itemId=987&vendorItemId=555",
    selected_affiliate_url: "https://link.coupang.com/a/example",
    payload: { source: "coupang", productId: "123456", itemId: "987", vendorItemId: "555" },
    created_at: "2026-05-31T00:00:00.000Z",
    updated_at: "2026-05-31T00:00:00.000Z",
    ...overrides
  };
}

describe("candidate product_key generation", () => {
  test("uses Coupang product identifiers when available", () => {
    expect(createCandidateProductKey(candidateFixture())).toBe("coupang:123456:987:555");
  });

  test("uses Musinsa goods number from payload or URL", () => {
    expect(
      createCandidateProductKey(
        candidateFixture({
          raw_coupang_url: "https://www.musinsa.com/products/998877?utm_source=ad",
          payload: { source: "musinsa" }
        })
      )
    ).toBe("musinsa:998877");
  });

  test("normalizes URLs by dropping tracking query params and trailing slash", () => {
    expect(
      normalizeCandidateUrl("https://example.com/item/ABC/?utm_source=x&fbclid=y&option=1")
    ).toBe("https://example.com/item/ABC?option=1");
  });

  test("falls back to a deterministic source/url/name hash without exposing payload secrets", () => {
    const key = createCandidateProductKey(
      candidateFixture({
        raw_coupang_url: "https://event.example.com/deal?id=abc&utm_campaign=secret",
        payload: {
          source: "toss",
          access_token: "must-not-appear",
          api_key: "must-not-appear"
        }
      })
    );

    expect(key).toMatch(/^toss:[a-f0-9]{12}:[a-f0-9]{12}$/);
    expect(key).not.toContain("must-not-appear");
    expect(key).not.toContain("secret");
  });
});
