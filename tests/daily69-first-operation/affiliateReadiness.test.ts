import { describe, expect, it, vi } from "vitest";
import {
  buildAffiliateReadinessReport,
  prepareAffiliateReadyQueue,
  validateCoupangAffiliateUrl
} from "../../src/lib/affiliate-readiness";

describe("Daily69 affiliate readiness contract", () => {
  it.each([
    ["", "missing"],
    ["   ", "missing"],
    ["not a url", "invalid_url"],
    ["javascript:alert(1)", "invalid_scheme"],
    ["file:///tmp/affiliate", "invalid_scheme"],
    ["data:text/plain,affiliate", "invalid_scheme"],
    ["https://example.com/a/test", "invalid_host"],
    ["https://user:password@link.coupang.com/a/test", "credentials_present"],
    ["https://link.coupang.com/", "invalid_path"]
  ])("rejects unsafe affiliate value as %s", (value, code) => {
    expect(validateCoupangAffiliateUrl(value)).toMatchObject({
      affiliateReady: false,
      affiliateReadinessCode: code,
      rawUrlPrinted: false,
      secretsPrinted: false
    });
  });

  it("accepts only a canonical HTTPS Coupang affiliate URL without exposing it", () => {
    const secretUrl = "https://link.coupang.com/a/sensitive-affiliate-value";
    const result = validateCoupangAffiliateUrl(secretUrl);
    expect(result).toMatchObject({ affiliateReady: true, affiliateReadinessCode: "ready", approvedHost: true });
    expect(JSON.stringify(result)).not.toContain(secretUrl);
  });

  it("reports 69/69 as arm-ready and 68/69 as fail-closed without raw URLs", () => {
    const ready = items(69);
    expect(buildAffiliateReadinessReport(ready)).toMatchObject({
      total: 69,
      affiliateReady: 69,
      affiliateMissing: 0,
      affiliateInvalid: 0,
      readyForArm: true
    });
    ready[68] = item(68, "");
    const blocked = buildAffiliateReadinessReport(ready);
    expect(blocked).toMatchObject({ total: 69, affiliateReady: 68, affiliateMissing: 1, readyForArm: false });
    expect(JSON.stringify(blocked)).not.toContain("link.coupang.com");
  });

  it("does not call a resolver or overwrite an existing valid URL", async () => {
    const original = item(1, "https://link.coupang.com/a/existing");
    const resolver = vi.fn(async () => ({ status: "resolved" as const, selectedAffiliateUrl: "https://link.coupang.com/a/replacement" }));
    const prepared = await prepareAffiliateReadyQueue({ items: [original], resolver });
    expect(resolver).not.toHaveBeenCalled();
    expect(prepared.providerCalls).toBe(0);
    expect(prepared.items[0]).toBe(original);
    expect(prepared.report.affiliateReady).toBe(1);
  });

  it("uses the injected preparation seam once for a missing URL and validates the result", async () => {
    const resolver = vi.fn(async () => ({ status: "resolved" as const, selectedAffiliateUrl: "https://link.coupang.com/a/resolved" }));
    const prepared = await prepareAffiliateReadyQueue({ items: [item(1, "")], resolver });
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(prepared).toMatchObject({ providerCalls: 1, queueMutations: 0, schedulerMutations: 0, sheetsMutations: 0, SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 });
    expect(prepared.report).toMatchObject({ affiliateReady: 1, affiliateMissing: 0 });
  });
});

function items(count: number) {
  return Array.from({ length: count }, (_, index) => item(index, `https://link.coupang.com/a/test-${index}`));
}

function item(index: number, selectedAffiliateUrl: string) {
  return { productKey: `product-${index}`, candidate: { selectedAffiliateUrl } };
}
