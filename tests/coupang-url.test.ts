import { describe, expect, test } from "vitest";
import {
  buildCoupangProductKey,
  extractCoupangProductId,
  isLikelyCoupangProductUrl,
  normalizeCoupangUrl,
  removeTrackingParams,
  validateAffiliateUrl
} from "@/lib/coupang/coupangUrl";

describe("Coupang URL helpers", () => {
  test("normalizes product URLs and removes tracking parameters", () => {
    const normalized = normalizeCoupangUrl(
      "https://www.coupang.com/vp/products/123456789?utm_source=ad&itemId=111&vendorItemId=222&sourceType=share"
    );

    expect(normalized).toBe(
      "https://www.coupang.com/vp/products/123456789?itemId=111&vendorItemId=222"
    );
    expect(removeTrackingParams(normalized)).toBe(normalized);
  });

  test("detects Coupang product URLs and extracts product id", () => {
    expect(isLikelyCoupangProductUrl("https://www.coupang.com/vp/products/123456789")).toBe(true);
    expect(isLikelyCoupangProductUrl("https://link.coupang.com/a/test-mvp")).toBe(false);
    expect(extractCoupangProductId("https://www.coupang.com/vp/products/123456789")).toBe("123456789");
  });

  test("builds stable product keys from product, item, and vendor ids", () => {
    expect(
      buildCoupangProductKey({
        raw_coupang_url: "https://www.coupang.com/vp/products/123456789",
        item_id: "111",
        vendor_item_id: "222"
      })
    ).toBe("coupang:product:123456789:item:111:vendor:222");

    expect(buildCoupangProductKey({ raw_coupang_url: "https://www.coupang.com/vp/products/123456789" })).toBe(
      "coupang:product:123456789"
    );
  });

  test("validates affiliate links without accepting raw product URLs", () => {
    expect(validateAffiliateUrl("https://link.coupang.com/a/test-mvp")).toMatchObject({
      ok: true,
      status: "valid"
    });
    expect(validateAffiliateUrl("")).toMatchObject({
      ok: false,
      status: "missing"
    });
    expect(validateAffiliateUrl("https://www.coupang.com/vp/products/123456789")).toMatchObject({
      ok: false,
      status: "invalid"
    });
  });
});
