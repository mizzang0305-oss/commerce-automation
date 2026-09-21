import { describe, expect, test } from "vitest";
import { isV5SyntheticAssetEligible } from "@/lib/usage-evidence";
import { makeV5Pack } from "./fixture";

describe("V5 product pixel preservation", () => {
  test("accepts exact Coupang-reference pixel provenance", () => {
    const { assets } = makeV5Pack("exact-product", "home_storage");
    expect(assets.every(isV5SyntheticAssetEligible)).toBe(true);
    expect(assets.every((asset) => asset.productPixelSource === "exact_coupang_reference")).toBe(true);
  });

  test("prohibits a prompt-only AI product redraw", () => {
    const { assets } = makeV5Pack("redrawn-product", "home_storage", { productPixelSource: "not_present" });
    expect(assets.some(isV5SyntheticAssetEligible)).toBe(false);
  });
});
