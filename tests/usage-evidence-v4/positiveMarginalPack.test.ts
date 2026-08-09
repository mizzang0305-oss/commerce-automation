import { describe, expect, test } from "vitest";
import { selectPositiveV4MarginalPacks } from "@/lib/usage-evidence";

describe("V4 positive marginal pack selection", () => {
  test("omits zero-gain packs, including packs for capped legacy use cases", () => {
    const result = selectPositiveV4MarginalPacks({
      baseline: { active: 58, reserve: 14, distinct: 72 },
      packs: [
        { packId: "legacy-zero", useCase: "laundry_drying", categoryKey: "생활용품", activeGain: 0, reserveGain: 0, distinctGain: 0, categoryHeadroomUsed: 0, familyImpact: 0, assetPressure: 0, sourcePressure: 0, sequenceImpact: 0 },
        { packId: "kitchen-positive", useCase: "kitchen_organization", categoryKey: "주방용품", activeGain: 4, reserveGain: 0, distinctGain: 4, categoryHeadroomUsed: 4, familyImpact: 0, assetPressure: 1, sourcePressure: 1, sequenceImpact: 0 }
      ]
    });
    expect(result.selectedPackIds).toEqual(["kitchen-positive"]);
    expect(result.zeroGainOmitted).toMatchObject([{ packId: "legacy-zero", selected: false, zeroGainReason: "NO_POSITIVE_LIVE_ACTIVE_GAIN" }]);
  });
});
