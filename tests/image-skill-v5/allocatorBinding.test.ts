import { describe, expect, test } from "vitest";
import { allocateUsageEvidence, createUsageAllocationState } from "@/lib/usage-evidence";
import { makeV5Ranked, makeV5Registry } from "./fixture";

describe("V5 exact product allocation", () => {
  test("does not allocate an exact-product pack unsupported by the production materializer", () => {
    const registry = makeV5Registry([{ productKey: "exact", useCase: "home_storage" }]);
    const state = createUsageAllocationState();
    const first = allocateUsageEvidence({ candidate: makeV5Ranked("exact", "home_storage"), registry, state });
    expect(first).toEqual({ allocation: null, reason: "assetCapacityRejected" });
    const second = allocateUsageEvidence({ candidate: makeV5Ranked("exact", "home_storage", 2), registry, state });
    expect(second.allocation).toBeNull();
  });

  test("reports a product-bound mismatch instead of sharing the pack", () => {
    const registry = makeV5Registry([{ productKey: "exact", useCase: "home_storage" }]);
    const result = allocateUsageEvidence({ candidate: makeV5Ranked("other", "home_storage"), registry, state: createUsageAllocationState() });
    expect(result).toEqual({ allocation: null, reason: "productBoundMismatchRejected" });
  });
});
