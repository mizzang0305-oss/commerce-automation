import { describe, expect, test } from "vitest";
import { selectMinimalPositiveV5Packs } from "@/lib/usage-evidence";
import { makeActive, makeReserve, makeV5Ranked, makeV5Registry } from "./fixture";

describe("V5 minimal positive marginal selection", () => {
  test("omits zero-gain duplicates and stops after eleven positive active gains", () => {
    const baseline = Array.from({ length: 58 }, (_, index) => makeV5Ranked(`base-${index}`, (index % 3 === 0 ? "home_storage" : index % 3 === 1 ? "kitchen_organization" : "camping_storage"), index));
    const reserveRows = Array.from({ length: 14 }, (_, index) => makeV5Ranked(`reserve-${index}`, (index % 3 === 0 ? "home_storage" : index % 3 === 1 ? "kitchen_organization" : "camping_storage"), 100 + index));
    const gains = Array.from({ length: 12 }, (_, index) => ({ productKey: `gain-${index}`, useCase: (index < 4 ? "home_storage" : index < 8 ? "kitchen_organization" : "camping_storage") as "home_storage" | "kitchen_organization" | "camping_storage" }));
    const registry = makeV5Registry([{ productKey: "base-0", useCase: "home_storage" }, ...gains]);
    const candidates = [makeV5Ranked("base-0", "home_storage"), ...gains.map((row, index) => makeV5Ranked(row.productKey, row.useCase, 200 + index))];
    const proof = selectMinimalPositiveV5Packs({ registry, candidates, active: baseline.map(makeActive), reserve: reserveRows.map(makeReserve) });
    expect(proof.selectedPackCount).toBe(11);
    expect(proof.predictedActive).toBe(69);
    expect(proof.predictedReserve).toBe(14);
    expect(proof.predictedDistinct).toBe(83);
    expect(proof.rows.find((row) => row.productKey === "base-0")?.zeroGainReason).toBe("DUPLICATE_PRODUCT");
  });
});
