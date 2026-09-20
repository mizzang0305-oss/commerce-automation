import { describe, expect, test, vi } from "vitest";
import * as materialization from "@/lib/usage-evidence/materializationEligibility";
import { allocateUsageEvidence, createUsageAllocationState, validateUsageEvidenceRegistry } from "@/lib/usage-evidence";
import { makeRankedProducts, makeUsageEvidenceRegistry } from "./fixture";

describe("usage evidence allocator", () => {
  test("evaluates only pack-referenced assets without bypassing the production gate", () => {
    const registry = makeUsageEvidenceRegistry({ packsPerUseCase: 15 });
    const useCase = registry.packs[0].useCase;
    const candidate = makeRankedProducts(100).find(entry => entry.candidate.useCase === useCase)!;
    const referencedRoles = registry.packs.filter(pack => pack.useCase === useCase).reduce((count, pack) => count
      + pack.problemAssetIds.length + new Set([...pack.usageAssetIds, ...pack.actionAssetIds]).size + pack.afterAssetIds.length, 0);
    const gate = vi.spyOn(materialization, "isUsageEvidenceAssetProductionMaterializable");
    try {
      expect(allocateUsageEvidence({ candidate, registry, state: createUsageAllocationState() }).allocation).not.toBeNull();
      expect(gate.mock.calls.length).toBeGreaterThanOrEqual(3);
      expect(gate.mock.calls.length).toBeLessThanOrEqual(referencedRoles);
      expect(gate.mock.calls.every(([asset, actualUseCase]) => actualUseCase === useCase && asset.useCases.includes(useCase))).toBe(true);
    } finally { gate.mockRestore(); }
  });

  test("role lookup still rejects an asset belonging to another use case", () => {
    const registry = makeUsageEvidenceRegistry({ packsPerUseCase: 1 });
    const pack = registry.packs[0];
    const candidate = makeRankedProducts(100).find(entry => entry.candidate.useCase === pack.useCase)!;
    registry.assets.find(asset => asset.assetId === pack.problemAssetIds[0])!.useCases = ["different_use_case"];
    expect(allocateUsageEvidence({ candidate, registry, state: createUsageAllocationState() })).toMatchObject({ allocation: null, reason: "assetCapacityRejected" });
  });

  test("the Daily69 unique-sequence mode does not reuse an earlier nonconsecutive sequence", () => {
    const registry = makeUsageEvidenceRegistry({ packsPerUseCase: 2 });
    const candidates = makeRankedProducts(100).filter(entry => entry.candidate.useCase === registry.packs[0].useCase);
    const state = createUsageAllocationState();
    const first = allocateUsageEvidence({ candidate: candidates[0], registry, state, requireUniqueSequence: true });
    const second = allocateUsageEvidence({ candidate: candidates[1], registry, state, requireUniqueSequence: true });
    expect(first.allocation).not.toBeNull();
    expect(second.allocation).not.toBeNull();
    expect(first.allocation!.sequenceFingerprint).not.toBe(second.allocation!.sequenceFingerprint);
    const before = structuredClone(state);
    expect(allocateUsageEvidence({ candidate: candidates[2], registry, state, requireUniqueSequence: true }).allocation).toBeNull();
    expect(state).toEqual(before);
  });
  test("enforces a five-use daily pack and asset cap", () => {
    const registry = makeUsageEvidenceRegistry({ packsPerUseCase: 2 });
    const useCase = registry.packs[0].useCase;
    const ranked = makeRankedProducts(100).filter((entry) => entry.candidate.useCase === useCase);
    const state = createUsageAllocationState();
    for (let index = 0; index < 10; index += 1) expect(allocateUsageEvidence({ candidate: ranked[index], registry, state }).allocation).not.toBeNull();
    expect(allocateUsageEvidence({ candidate: ranked[10], registry, state }).allocation).toBeNull();
  });

  test("blocks a third consecutive identical sequence", () => {
    const registry = makeUsageEvidenceRegistry({ packsPerUseCase: 1 });
    const useCase = registry.packs[0].useCase;
    const ranked = makeRankedProducts(100).filter((entry) => entry.candidate.useCase === useCase);
    const state = createUsageAllocationState();
    expect(allocateUsageEvidence({ candidate: ranked[0], registry, state }).allocation).not.toBeNull();
    expect(allocateUsageEvidence({ candidate: ranked[1], registry, state }).allocation).not.toBeNull();
    expect(allocateUsageEvidence({ candidate: ranked[2], registry, state }).reason).toBe("sequenceCapacityRejected");
  });

  test("keeps a registry-valid derived frame pack out of production allocations", () => {
    const registry = makeUsageEvidenceRegistry({ packsPerUseCase: 3, sourceKind: "derived_frame_pack", sharedSourceId: "reviewed-video", maxSameSourceVideoDaily: 2 });
    const useCase = registry.packs[0].useCase;
    const ranked = makeRankedProducts(100).filter((entry) => entry.candidate.useCase === useCase);
    const state = createUsageAllocationState();
    expect(validateUsageEvidenceRegistry(registry)).toBe(registry);
    expect(allocateUsageEvidence({ candidate: ranked[0], registry, state })).toMatchObject({ allocation: null, reason: "assetCapacityRejected" });
  });

  test("selects exactly three scenes from reviewed role alternatives", () => {
    const registry = makeUsageEvidenceRegistry({ packsPerUseCase: 1 });
    const pack = registry.packs[0];
    const roleLists = [pack.problemAssetIds, pack.usageAssetIds, pack.afterAssetIds];
    for (const [index, roleIds] of roleLists.entries()) {
      const original = registry.assets.find((asset) => asset.assetId === roleIds[0])!;
      const alternative = { ...original, assetId: `${original.assetId}-alternative`, sourceId: `${original.sourceId}-alternative`, sourceSha256: String(index + 1).repeat(64), derivedSha256: String(index + 4).repeat(64), visualFingerprint: String(index + 7).repeat(16) };
      registry.assets.push(alternative);
      pack.assetIds.push(alternative.assetId);
      roleIds.push(alternative.assetId);
      if (index === 1) pack.actionAssetIds.push(alternative.assetId);
    }
    const ranked = makeRankedProducts(100).filter((entry) => entry.candidate.useCase === pack.useCase);
    const state = createUsageAllocationState();
    const allocations = ranked.slice(0, 5).map((candidate) => allocateUsageEvidence({ candidate, registry, state, batchSize: 100 }).allocation!);
    expect(allocations.every((allocation) => allocation.assetIds.length === 3 && new Set(allocation.assetIds).size === 3)).toBe(true);
    const counts = new Map<string, number>();
    for (const allocation of allocations) for (const assetId of allocation.assetIds) counts.set(assetId, (counts.get(assetId) ?? 0) + 1);
    expect(counts.size).toBe(6);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(3);
  });
});
