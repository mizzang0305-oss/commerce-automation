import { describe, expect, it } from "vitest";
import {
  buildAvailabilityEvidence,
  isStableReplacementEvidence,
  selectStableReplacementCandidate,
  selectMinimalPositiveV5Packs
} from "@/lib/usage-evidence";
import { makeActive, makeReserve, makeV5Ranked, makeV5Registry } from "./fixture";

const observed = (productKey: string, flags: [boolean, boolean, boolean, boolean]) => buildAvailabilityEvidence({
  productKey,
  observedInPrepare: flags[0],
  observedInRun1: flags[1],
  observedInRun2: flags[2],
  observedInTargetedRecovery: flags[3],
  sourceKeywords: ["stable"],
  lastObservedAt: "2026-08-09T12:00:00.000Z"
});

describe("V5 product availability gate", () => {
  it("accepts only the allowed two-observation stability combinations", () => {
    expect(isStableReplacementEvidence(observed("a", [false, false, true, true]))).toBe(true);
    expect(isStableReplacementEvidence(observed("b", [false, true, true, false]))).toBe(true);
    expect(isStableReplacementEvidence(observed("c", [false, true, false, true]))).toBe(true);
    expect(isStableReplacementEvidence(observed("d", [true, false, false, false]))).toBe(false);
  });

  it("rejects active, reserve, selected-bound, and one-snapshot replacement candidates", () => {
    const activeRanked = makeV5Ranked("active", "home_storage", 1);
    const reserveRanked = makeV5Ranked("reserve", "home_storage", 2);
    const selectedRanked = makeV5Ranked("selected", "home_storage", 3);
    const unstableRanked = makeV5Ranked("unstable", "home_storage", 4);
    const stableRanked = makeV5Ranked("stable", "home_storage", 5);
    const selected = selectStableReplacementCandidate({
      candidates: [activeRanked, reserveRanked, selectedRanked, unstableRanked, stableRanked].map((entry) => ({
        entry,
        availability: entry.candidate.productKey === "unstable" ? observed("unstable", [true, false, false, false]) : observed(entry.candidate.productKey, [false, true, false, true]),
        identityFidelityScore: 0.95,
        categoryHeadroom: 5
      })),
      active: [makeActive(activeRanked, 1)],
      reserve: [makeReserve(reserveRanked)],
      selectedBoundProductKeys: ["selected"]
    });
    expect(selected?.entry.candidate.productKey).toBe("stable");
  });

  it("prioritizes availability before identity for V5 marginal selection", () => {
    const registry = makeV5Registry([
      { productKey: "stable", useCase: "home_storage" },
      { productKey: "unknown", useCase: "home_storage" }
    ]);
    registry.packs.find((pack) => pack.boundProductKey === "stable")!.availabilityEvidence = observed("stable", [false, true, false, true]);
    registry.packs.find((pack) => pack.boundProductKey === "stable")!.identityFidelityScore = 0.91;
    registry.packs.find((pack) => pack.boundProductKey === "unknown")!.identityFidelityScore = 0.99;
    const result = selectMinimalPositiveV5Packs({
      registry,
      candidates: [makeV5Ranked("unknown", "home_storage"), makeV5Ranked("stable", "home_storage")],
      active: [], reserve: [], dailyTargetCount: 1, minimumReserveCount: 0,
      maxCategoryRatio: 1, maxProductFamilyRatio: 1
    });
    expect(result.selectedPackIds).toEqual(["pack-v5-stable"]);
  });
});
