import { describe, expect, test } from "vitest";
import { DAILY_69_NO_UPLOAD_SETTINGS } from "@/lib/queue-scheduler";
import { evaluateV3MarginalPacks, validateUsageEvidenceRegistry } from "@/lib/usage-evidence";
import { makeRankedProducts, makeUsageEvidenceRegistry, withV3MotionPack } from "../usage-evidence/fixture";

describe("V3 effective capacity", () => {
  test("does not count V3 motion packs that the production materializer cannot consume", () => {
    const baseline = validateUsageEvidenceRegistry(makeUsageEvidenceRegistry({ packsPerUseCase: 2 }));
    let candidate = baseline;
    for (const useCase of ["cable_organization", "desk_organization", "laundry_space_organization", "laundry_drying"] as const) {
      for (let index = 20; index < 23; index += 1) candidate = withV3MotionPack(candidate, useCase, index);
    }
    const result = evaluateV3MarginalPacks({ ranked: makeRankedProducts(180), baselineRegistry: baseline, candidateRegistry: validateUsageEvidenceRegistry(candidate), settings: DAILY_69_NO_UPLOAD_SETTINGS });
    expect(result.result).toBe("POSITIVE_GAIN_EXHAUSTED");
    expect(result.final.active).toBe(64);
    expect(result.final.reserve).toBe(6);
    expect(result.final.distinct).toBe(70);
    expect(result.final.diagnostics).toMatchObject({ activeShortfall: 5, reserveShortfall: 8 });
    expect(DAILY_69_NO_UPLOAD_SETTINGS.maxCategoryRatio).toBe(0.35);
    expect(DAILY_69_NO_UPLOAD_SETTINGS.maxProductFamilyRatio).toBe(0.1);
    expect(DAILY_69_NO_UPLOAD_SETTINGS.maxExactAssetReuse).toBe(5);
  });
});
