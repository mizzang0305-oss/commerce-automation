import { describe, expect, test } from "vitest";
import { isV5ProductBoundPackEligible, isV5SyntheticAssetEligible, validateProductBoundPackForCandidate } from "@/lib/usage-evidence";
import { makeV5Pack } from "./fixture";

describe("V5 product-bound synthetic pack", () => {
  test("requires five assets, three product scenes, disclosure, review separation, and publish false", () => {
    const { assets, pack } = makeV5Pack("bound-product", "camping_storage");
    expect(isV5ProductBoundPackEligible(pack, new Map(assets.map((asset) => [asset.assetId, asset])))).toBe(true);
    expect(pack.assetIds).toHaveLength(5);
    expect(pack.dailyReuseLimit).toBe(1);
    expect(pack.syntheticDisclosureRequired).toBe(true);
    expect(pack.publishEligible).toBe(false);
    expect(assets.every((asset) => asset.humanOwnerReviewStatus === "not_requested" && asset.derivedCodexVisualReviewStatus === "pass")).toBe(true);
  });

  test("cannot bind another product", () => {
    const { pack } = makeV5Pack("bound-product", "camping_storage");
    expect(validateProductBoundPackForCandidate(pack, "other-product")).toEqual({ matched: false, blocker: "PRODUCT_BOUND_USAGE_PACK_MISMATCH" });
  });

  test("blocks missing synthetic disclosure and accidental publish eligibility", () => {
    const missingDisclosure = makeV5Pack("no-disclosure", "camping_storage", { disclosureRequired: false }).assets[0];
    const publishable = makeV5Pack("publishable", "camping_storage", { publishEligible: true }).assets[0];
    expect(isV5SyntheticAssetEligible(missingDisclosure)).toBe(false);
    expect(isV5SyntheticAssetEligible(publishable)).toBe(false);
  });
});
