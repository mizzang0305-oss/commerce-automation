import { describe, expect, test } from "vitest";
import { evaluateNewUseCaseRegistration } from "@/lib/usage-evidence";

const ready = {
  useCase: "kitchen_organization",
  categoryHeadroom: 24,
  liveCandidateUniqueCount: 8,
  keywordCount: 3,
  sourceMediaCount: 2,
  distinctSourceIds: 2,
  packCount: 2,
  uniqueAssetsPerPack: 7,
  problemRoleAssets: 2,
  usageActionRoleAssets: 3,
  afterRoleAssets: 2,
  codexReviewPassed: true,
  marginalAllocatableGain: 4
};

describe("V4 new use-case registration", () => {
  test("requires at least two sources and two complete packs", () => {
    const result = evaluateNewUseCaseRegistration({ ...ready, sourceMediaCount: 1, distinctSourceIds: 1, packCount: 1 });
    expect(result.supported).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining(["V4_USE_CASE_TWO_SOURCES_REQUIRED", "V4_USE_CASE_TWO_PACKS_REQUIRED"]));
  });

  test("requires positive marginal gain before support is registered", () => {
    expect(evaluateNewUseCaseRegistration({ ...ready, marginalAllocatableGain: 0 })).toMatchObject({ supported: false, blockers: ["V4_POSITIVE_MARGINAL_GAIN_REQUIRED"] });
    expect(evaluateNewUseCaseRegistration(ready)).toMatchObject({ supported: true, blockers: [] });
  });
});
