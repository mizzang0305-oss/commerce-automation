import { describe, expect, test, vi } from "vitest";
import { buildSafeProviderPreflight } from "@/lib/usage-evidence/liveCapacityProof";
import { buildDaily69KeywordContexts, searchLiveCoupangProducts } from "@/lib/live-product-video";

describe("V3 provider secret redaction", () => {
  test("serializes readiness and signing presence without raw values or auth material", () => {
    const access = "unit-access-value";
    const secret = "unit-secret-value";
    const partner = "unit-partner-value";
    const serialized = JSON.stringify(buildSafeProviderPreflight({
      COUPANG_PARTNERS_PROVIDER_ENABLED: "true",
      COUPANG_PARTNERS_ACCESS_KEY: access,
      COUPANG_PARTNERS_SECRET_KEY: secret,
      COUPANG_PARTNERS_CUSTOMER_ID: partner
    }));
    expect(serialized).not.toContain(access);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain(partner);
    expect(serialized).not.toContain("Authorization");
    expect(serialized).not.toContain("CEA algorithm");
    expect(serialized).not.toContain("signature=");
    expect(serialized).toContain('"auth_header_present":true');
  });

  test("removes a provider identifier from persisted affiliate URL parameters", async () => {
    const partner = "partner-id-must-not-persist";
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      data: { productData: [{
        productId: 123,
        productName: "정리 수납함",
        categoryName: "생활용품",
        productUrl: `https://link.coupang.com/a/example?pageKey=123&lptag=${partner}`,
        productImage: "https://image.coupangcdn.com/image/example.jpg"
      }] }
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const context = buildDaily69KeywordContexts(new Date("2026-08-09T00:00:00.000Z"), 1, ["desk_organization"]).contexts[0]!;
    const result = await searchLiveCoupangProducts({
      context,
      limit: 1,
      allowDeeplink: false,
      fetchImpl,
      env: {
        COUPANG_PARTNERS_PROVIDER_ENABLED: "true",
        COUPANG_PARTNERS_ACCESS_KEY: "access",
        COUPANG_PARTNERS_SECRET_KEY: "secret",
        COUPANG_PARTNER_ID: partner
      }
    });
    expect(result.ok).toBe(true);
    expect(result.products[0]?.selectedAffiliateUrl).not.toContain(partner);
    expect(result.products[0]?.selectedAffiliateUrl).not.toContain("lptag");
  });
});
