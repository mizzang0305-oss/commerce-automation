import { describe, expect, test } from "vitest";
import { DAILY_69_NO_UPLOAD_SETTINGS } from "@/lib/queue-scheduler";
import { evaluateV3MarginalPacks, selectV3Registry, validateUsageEvidenceRegistry } from "@/lib/usage-evidence";
import { makeRankedProducts, makeUsageEvidenceRegistry, withV3MotionPack } from "../usage-evidence/fixture";

describe("V3 marginal pack selection", () => {
  test("rejects every V3 motion pack until the production materializer supports that source kind", () => {
    const baseline = validateUsageEvidenceRegistry(makeUsageEvidenceRegistry({ packsPerUseCase: 2 }));
    let candidate = baseline;
    for (const useCase of ["cable_organization", "desk_organization", "laundry_space_organization", "laundry_drying"] as const) {
      for (let index = 1; index <= 3; index += 1) candidate = withV3MotionPack(candidate, useCase, index);
    }
    candidate = validateUsageEvidenceRegistry(candidate);
    const result = evaluateV3MarginalPacks({ ranked: makeRankedProducts(180), baselineRegistry: baseline, candidateRegistry: candidate, settings: DAILY_69_NO_UPLOAD_SETTINGS });
    expect(result.result).toBe("POSITIVE_GAIN_EXHAUSTED");
    expect(result.selectedPackIds).toHaveLength(0);
    expect(result.zeroGainPackIds).toHaveLength(12);
    expect(result.steps.every((step) => step.allocatableGain > 0)).toBe(true);
    expect(result.steps.every((step) => Number.isFinite(step.categoryCapImpact) && Number.isFinite(step.familyCapImpact))).toBe(true);
    const selected = selectV3Registry(candidate, result.selectedPackIds);
    expect(baseline.packs.every((pack) => selected.packs.some((value) => value.packId === pack.packId))).toBe(true);
    expect(selected.packs.filter((pack) => pack.packGeneration === "v3_motion")).toHaveLength(0);
  });

  test("reports a vehicle pack as zero gain when the candidate set has no vehicle demand", () => {
    const baseline = validateUsageEvidenceRegistry(makeUsageEvidenceRegistry({ packsPerUseCase: 2 }));
    const candidate = validateUsageEvidenceRegistry(withV3MotionPack(baseline, "vehicle_organization", 1));
    const ranked = makeRankedProducts(90).filter((entry) => !entry.candidate.useCase.startsWith("vehicle"));
    const result = evaluateV3MarginalPacks({ ranked, baselineRegistry: baseline, candidateRegistry: candidate, settings: DAILY_69_NO_UPLOAD_SETTINGS });
    expect(result.result).toBe("POSITIVE_GAIN_EXHAUSTED");
    expect(result.selectedPackIds).toHaveLength(0);
    expect(result.zeroGainPackIds).toEqual(["vehicle_organization-v3-test-pack-1"]);
  });
});
