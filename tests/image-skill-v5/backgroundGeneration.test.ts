import { describe, expect, test } from "vitest";
import { buildV5BackgroundPrompt, PRODUCT_BOUND_SYNTHETIC_USE_CASES } from "@/lib/usage-evidence";

describe("V5 background plate generation contract", () => {
  test.each(PRODUCT_BOUND_SYNTHETIC_USE_CASES)("builds a brand-neutral 9:16 background-only prompt for %s", (useCase) => {
    const prompt = buildV5BackgroundPrompt(useCase, "usage_background");
    expect(prompt).toContain("vertical 9:16");
    expect(prompt).toContain("background plate only");
    expect(prompt).toContain("do not draw or imply a specific product");
    expect(prompt).toContain("no text; no logos; no watermark; no visible face");
  });
});
