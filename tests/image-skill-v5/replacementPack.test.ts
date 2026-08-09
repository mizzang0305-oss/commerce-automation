import { describe, expect, it } from "vitest";
import { replaceSelectedProductBoundPack } from "@/lib/usage-evidence";
import { makeV5Pack, makeV5Registry } from "./fixture";

describe("V5 stability-aware replacement registry", () => {
  it("preserves the historical pack in the candidate registry and replaces exactly one selected pack", () => {
    const candidateRegistry = makeV5Registry([
      { productKey: "historical", useCase: "camping_storage" },
      { productKey: "kept", useCase: "home_storage" }
    ]);
    const replacement = makeV5Pack("replacement", "camping_storage").pack;
    replacement.replacementOfPackId = "pack-v5-historical";
    replacement.replacementOfProductKey = "historical";
    replacement.replacementReason = "SELECTED_PRODUCT_NOT_STABLE_IN_LIVE_SEARCH";
    candidateRegistry.packs.push(replacement);
    const result = replaceSelectedProductBoundPack({
      candidateRegistry,
      selectedPackIds: ["pack-v5-historical", "pack-v5-kept"],
      missingPackId: "pack-v5-historical",
      replacementPack: replacement
    });
    expect(candidateRegistry.packs.some((pack) => pack.packId === "pack-v5-historical")).toBe(true);
    expect(result.selectedPackIds).toEqual(["pack-v5-kept", "pack-v5-replacement"]);
    expect(result.selectedRegistry.packs.some((pack) => pack.packId === "pack-v5-historical")).toBe(false);
    expect(result.selectedRegistry.packs.filter((pack) => pack.packKind === "product_bound_synthetic_pack")).toHaveLength(2);
  });
});
