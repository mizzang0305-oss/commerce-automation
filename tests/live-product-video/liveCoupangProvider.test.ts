import { describe, expect, test, vi } from "vitest";
import { searchLiveCoupangProducts } from "@/lib/live-product-video";
import { context } from "./fixtures";

const readyEnv = {
  COUPANG_PARTNERS_PROVIDER_ENABLED: "true",
  COUPANG_PARTNERS_ACCESS_KEY: "test-access",
  COUPANG_PARTNERS_SECRET_KEY: "test-secret",
  COUPANG_PARTNER_ID: "test-partner"
};

describe("live Coupang provider", () => {
  test("uses the authoritative signed search and returns safe normalized rows", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: { productData: [{
      productId: 111222333,
      productName: "차량용 컵홀더 정리함",
      productPrice: 19900,
      productImage: "https://image.coupangcdn.com/image/product.jpg",
      productUrl: "https://link.coupang.com/re/AFFSDP?lptag=AF0000000&pageKey=111222333&itemId=444555&vendorItemId=666777",
      categoryName: "자동차용품"
    }] } }), { status: 200, headers: { "content-type": "application/json" } }));
    const result = await searchLiveCoupangProducts({ context, limit: 6, env: readyEnv, fetchImpl: fetchImpl as typeof fetch, now: new Date("2026-08-08T00:00:00.000Z") });
    expect(result.ok).toBe(true);
    expect(result.apiCallCount).toBe(1);
    expect(result.products[0]).toMatchObject({ rawProductId: "111222333", sourceKeyword: "차량용 정리함", sourceProvider: "coupang_partners_product_search" });
    expect(result.credentialsExposed).toBe(false);
    expect(JSON.stringify(result)).not.toContain("test-secret");
  });

  test("fails closed before fetch when provider credentials are missing", async () => {
    const fetchImpl = vi.fn();
    const result = await searchLiveCoupangProducts({ context, limit: 6, env: {}, fetchImpl: fetchImpl as typeof fetch });
    expect(result.ok).toBe(false);
    expect(result.configured).toBe(false);
    expect(result.apiCallCount).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("reports empty and API failures without leaking auth material", async () => {
    const empty = await searchLiveCoupangProducts({ context, limit: 6, env: readyEnv, fetchImpl: vi.fn(async () => new Response(JSON.stringify({ data: { productData: [] } }), { status: 200 })) as typeof fetch });
    const failed = await searchLiveCoupangProducts({ context, limit: 6, env: readyEnv, fetchImpl: vi.fn(async () => new Response("", { status: 401 })) as typeof fetch });
    expect(empty.blocker).toBe("COUPANG_PARTNERS_SEARCH_EMPTY");
    expect(failed.blocker).toBe("COUPANG_PARTNERS_SEARCH_HTTP_401");
    expect(JSON.stringify([empty, failed])).not.toContain("Authorization");
  });
});
