import { describe, expect, test } from "vitest";
import { selectPositiveV4MarginalPacks, shouldRunV4SecondScout, V4_UNCHANGED_POLICY_LIMITS } from "@/lib/usage-evidence";

describe("V4 category-diverse Daily69 contract", () => {
  test("keeps category, family, reuse, and sequence limits unchanged", () => {
    expect(V4_UNCHANGED_POLICY_LIMITS).toEqual({
      maxCategoryRatio: 0.35,
      maxProductFamilyRatio: 0.10,
      maxUsagePackReuse: 5,
      assetDailyReuseLimit: 5,
      maxSameSequenceConsecutive: 2,
      policyThresholdChanges: 0
    });
  });

  test("reaches 69 only through positive gains across three uncapped categories", () => {
    const packs = [
      ["kitchen", "kitchen_organization", "주방용품", 4],
      ["home", "home_storage", "홈인테리어", 4],
      ["camping", "camping_storage", "스포츠/레저", 3]
    ].map(([packId, useCase, categoryKey, gain]) => ({ packId: String(packId), useCase: String(useCase), categoryKey: String(categoryKey), activeGain: Number(gain), reserveGain: 0, distinctGain: Number(gain), categoryHeadroomUsed: Number(gain), familyImpact: 0, assetPressure: 1, sourcePressure: 1, sequenceImpact: 0 }));
    const result = selectPositiveV4MarginalPacks({ baseline: { active: 58, reserve: 14, distinct: 72 }, packs });
    expect(result).toMatchObject({ result: "TARGET_REACHED", final: { active: 69, reserve: 14, distinct: 83 } });
    expect(new Set(result.selected.map((pack) => pack.categoryKey)).size).toBe(3);
  });

  test("allows second scout only after RUN1 target and hard acceptance", () => {
    expect(shouldRunV4SecondScout({ run1TargetReached: true, hardAcceptancePassed: true })).toBe(true);
    expect(shouldRunV4SecondScout({ run1TargetReached: true, hardAcceptancePassed: false })).toBe(false);
    expect(shouldRunV4SecondScout({ run1TargetReached: false, hardAcceptancePassed: true })).toBe(false);
  });
});
