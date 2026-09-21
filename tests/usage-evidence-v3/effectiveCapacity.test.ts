import { describe, expect, test } from "vitest";
import { DAILY_69_NO_UPLOAD_SETTINGS } from "@/lib/queue-scheduler";
import { evaluateV3MarginalPacks, validateUsageEvidenceRegistry } from "@/lib/usage-evidence";
import { withV3MotionPack } from "../usage-evidence/fixture";
import { singleSequenceCapacityFixture } from "./capacityFixture";

describe("V3 effective capacity", () => {
  test("does not count V3 motion packs that the production materializer cannot consume", () => {
    const fixture = singleSequenceCapacityFixture();
    const baseline = validateUsageEvidenceRegistry(fixture.registry);
    let candidate = baseline;
    for (const useCase of ["cable_organization", "desk_organization", "laundry_space_organization", "laundry_drying"] as const) {
      for (let index = 20; index < 23; index += 1) candidate = withV3MotionPack(candidate, useCase, index);
    }
    const result = evaluateV3MarginalPacks({ ranked: fixture.ranked, baselineRegistry: baseline, candidateRegistry: validateUsageEvidenceRegistry(candidate), settings: DAILY_69_NO_UPLOAD_SETTINGS });
    expect(result.result).toBe("POSITIVE_GAIN_EXHAUSTED");
    // 64+6 was the historical five-uses-per-sequence result, not 70 unique
    // sequences. Daily69 now binds every allocation to an unused sequence.
    expect(fixture.uniqueSequenceCount).toBe(14);
    expect(fixture.ranked).toHaveLength(180);
    expect(result.final.active).toBe(fixture.uniqueSequenceCount);
    expect(result.final.reserve).toBe(0);
    expect(result.final.distinct).toBe(fixture.uniqueSequenceCount);
    expect(result.final.diagnostics).toMatchObject({ activeShortfall: 55, reserveShortfall: 14 });
    expect(result.final.active).toBe(result.baseline.active);
    expect(result.selectedPackIds).toEqual([]);
    expect(result.packEvaluations.every((pack) => pack.allocatableGain === 0)).toBe(true);
    expect(DAILY_69_NO_UPLOAD_SETTINGS.maxCategoryRatio).toBe(0.35);
    expect(DAILY_69_NO_UPLOAD_SETTINGS.maxProductFamilyRatio).toBe(0.1);
    expect(DAILY_69_NO_UPLOAD_SETTINGS.maxExactAssetReuse).toBe(5);
  });
});
