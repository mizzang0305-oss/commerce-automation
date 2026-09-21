import { describe, expect, test } from "vitest";
import { selectV5ProductCandidates } from "@/lib/usage-evidence";
import { makeV5Ranked } from "./fixture";

describe("V5 authoritative Coupang product reference", () => {
  test("selects a policy/image/affiliate-ready uncapped product", () => {
    const ranked = makeV5Ranked("home-ready", "home_storage");
    const result = selectV5ProductCandidates({ ranked: [ranked], targets: { home_storage: 1 } });
    expect(result.selected).toHaveLength(1);
    expect(result.selected[0].authoritativeImageUrl).toContain("coupangcdn.com");
  });

  test("blocks a missing or invalid product image", () => {
    const ranked = makeV5Ranked("home-invalid", "home_storage");
    ranked.candidate.productImageUrls = ["file:///not-authoritative.png"];
    const result = selectV5ProductCandidates({ ranked: [ranked], targets: { home_storage: 1 } });
    expect(result.selected).toHaveLength(0);
    expect(result.rejected[0].blockers).toContain("PRODUCT_REFERENCE_IMAGE_NOT_READY");
  });
});
