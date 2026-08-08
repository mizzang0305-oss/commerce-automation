import { describe, expect, test } from "vitest";
import { allocateUsageEvidence, createUsageAllocationState } from "@/lib/usage-evidence";
import { makeRankedProducts, makeUsageEvidenceRegistry } from "./fixture";

describe("usage evidence allocator", () => {
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

  test("enforces the same source-video daily limit across distinct packs", () => {
    const registry = makeUsageEvidenceRegistry({ packsPerUseCase: 3, sourceKind: "derived_frame_pack", sharedSourceId: "reviewed-video", maxSameSourceVideoDaily: 2 });
    const useCase = registry.packs[0].useCase;
    const ranked = makeRankedProducts(100).filter((entry) => entry.candidate.useCase === useCase);
    const state = createUsageAllocationState();
    expect(allocateUsageEvidence({ candidate: ranked[0], registry, state }).allocation).not.toBeNull();
    expect(allocateUsageEvidence({ candidate: ranked[1], registry, state }).allocation).not.toBeNull();
    expect(allocateUsageEvidence({ candidate: ranked[2], registry, state }).allocation).toBeNull();
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
