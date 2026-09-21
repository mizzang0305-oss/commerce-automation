import { describe, expect, test } from "vitest";
import { isV5SyntheticAssetEligible, type UsageAssetBlockCode } from "@/lib/usage-evidence";
import { makeV5Pack } from "./fixture";

describe("V5 product identity hard blockers", () => {
  test.each<UsageAssetBlockCode>([
    "PRODUCT_LOGO_HALLUCINATED",
    "PRODUCT_COLOR_CHANGED",
    "PRODUCT_SHAPE_CHANGED",
    "PRODUCT_COMPONENT_COUNT_CHANGED",
    "PRODUCT_CLIPPING_DETECTED",
    "GENERATED_TEXT_OR_WATERMARK_DETECTED"
  ])("rejects %s", (blockCode) => {
    const { assets } = makeV5Pack(`blocked-${blockCode}`, "kitchen_organization", { blockCode });
    expect(assets.some(isV5SyntheticAssetEligible)).toBe(false);
  });
});
