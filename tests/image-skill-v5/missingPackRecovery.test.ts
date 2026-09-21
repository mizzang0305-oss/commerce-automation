import { describe, expect, it } from "vitest";
import {
  attachAvailabilityEvidence,
  buildAvailabilityEvidence,
  buildDirectRecoveryKeywords,
  evaluateDirectRecoveryMatch,
  findSingleMissingSelectedPack,
  validateSlot069Pack
} from "@/lib/usage-evidence";
import { makeActive, makeV5Ranked, makeV5Registry } from "./fixture";

describe("V5 missing selected pack recovery", () => {
  it("finds exactly one missing product-bound pack and builds two deterministic direct queries", () => {
    const registry = makeV5Registry([
      { productKey: "present", useCase: "home_storage" },
      { productKey: "missing", useCase: "camping_storage" }
    ]);
    const selectedPackIds = ["pack-v5-present", "pack-v5-missing"];
    const missing = findSingleMissingSelectedPack({ selectedPackIds, registry, active: [makeActive(makeV5Ranked("present", "home_storage"), 1)] });
    expect(missing.pack.packId).toBe("pack-v5-missing");
    expect(missing.expectedContribution).toEqual({ active: 1, reserve: 0, distinct: 1 });
    expect(buildDirectRecoveryKeywords(missing.pack)).toHaveLength(2);
  });

  it("reports the existing pack unavailable after exactly two unmatched queries", () => {
    expect(evaluateDirectRecoveryMatch({ targetProductKey: "missing", queryProductKeys: [["other-a"], ["other-b"]] })).toEqual({ matched: false, queryIndex: null });
    expect(evaluateDirectRecoveryMatch({ targetProductKey: "missing", queryProductKeys: [["missing"], ["other-b"]] })).toEqual({ matched: true, queryIndex: 0 });
    expect(() => evaluateDirectRecoveryMatch({ targetProductKey: "missing", queryProductKeys: [[], [], []] })).toThrow("V5_SLOT069_PROVIDER_BUDGET_EXCEEDED");
  });

  it("preserves the pack and attaches fresh availability evidence without promoting human review", () => {
    const registry = makeV5Registry([{ productKey: "missing", useCase: "camping_storage" }]);
    const evidence = buildAvailabilityEvidence({
      productKey: "missing",
      observedInPrepare: true,
      observedInRun1: false,
      observedInRun2: false,
      observedInTargetedRecovery: true,
      sourceKeywords: ["캠핑 수납가방 정리백"],
      lastObservedAt: "2026-08-09T12:00:00.000Z"
    });
    const updated = attachAvailabilityEvidence({ registry, packId: "pack-v5-missing", evidence });
    const pack = updated.packs.find((entry) => entry.packId === "pack-v5-missing")!;
    expect(pack.availabilityEvidence?.observationCount).toBe(2);
    expect(pack.availabilityEvidence?.availabilityScore).toBe(0.5);
    expect(validateSlot069Pack({ pack, registry: updated, productKey: "missing" })).toBe(true);
    expect(updated.assets.every((asset) => asset.humanOwnerReviewStatus === "not_requested" && asset.publishEligible === false)).toBe(true);
  });
});
