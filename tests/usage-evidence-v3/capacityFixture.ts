import { makeRankedProducts, makeUsageEvidenceRegistry } from "../usage-evidence/fixture";

/** Fourteen packs, each with exactly one reviewed three-role sequence. */
export function singleSequenceCapacityFixture() {
  const registry = makeUsageEvidenceRegistry({ packsPerUseCase: 2 });
  const sequences = registry.packs.map((pack) => {
    if (pack.problemAssetIds.length !== 1 || pack.usageAssetIds.length !== 1 || pack.afterAssetIds.length !== 1) {
      throw new Error("SINGLE_SEQUENCE_FIXTURE_CONTRACT_CHANGED");
    }
    return `${pack.sequenceFingerprint}:${[pack.problemAssetIds[0], pack.usageAssetIds[0], pack.afterAssetIds[0]].join(":")}`;
  });
  return { registry, ranked: makeRankedProducts(180), uniqueSequenceCount: new Set(sequences).size };
}
