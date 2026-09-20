import type { RankedLiveProduct } from "@/lib/live-product-video";
import type { UsageEvidenceAllocation, UsageEvidenceAllocationDiagnostics, UsageEvidenceAsset, UsageEvidencePack, UsageEvidenceRegistry } from "./contracts";
import { isUsageEvidenceAssetProductionMaterializable } from "./materializationEligibility";
import { eligiblePacksForUseCase } from "./registry";

type AllocationState = {
  packUses: Map<string, number>;
  assetUses: Map<string, number>;
  sourceVideoUses: Map<string, number>;
  allocations: UsageEvidenceAllocation[];
};

type PackOption = {
  pack: UsageEvidencePack;
  assets: [UsageEvidenceAsset, UsageEvidenceAsset, UsageEvidenceAsset];
  sourceVideoIds: string[];
  pressure: { sourceMaximum: number; assetMaximum: number; assetTotal: number };
};

const VIDEO_SOURCE_KINDS = new Set<UsageEvidenceAsset["sourceKind"]>([
  "owner_reviewed_video",
  "sanitized_local_video",
  "derived_clip",
  "derived_frame_pack"
]);

export function createUsageAllocationState(input?: { allocations: UsageEvidenceAllocation[]; registry: UsageEvidenceRegistry }): AllocationState {
  const state: AllocationState = { packUses: new Map(), assetUses: new Map(), sourceVideoUses: new Map(), allocations: [] };
  if (!input) return state;
  const videoSources = new Set(input.registry.assets.filter((asset) => VIDEO_SOURCE_KINDS.has(asset.sourceKind)).map((asset) => asset.sourceId));
  for (const allocation of input.allocations) {
    increment(state.packUses, allocation.packId);
    for (const assetId of allocation.assetIds) increment(state.assetUses, assetId);
    for (const sourceId of allocation.sourceIds) if (videoSources.has(sourceId)) increment(state.sourceVideoUses, sourceId);
    state.allocations.push(structuredClone(allocation));
  }
  return state;
}

export function cloneUsageAllocationState(state: AllocationState): AllocationState {
  return { packUses: new Map(state.packUses), assetUses: new Map(state.assetUses), sourceVideoUses: new Map(state.sourceVideoUses), allocations: [...state.allocations] };
}

export function allocateUsageEvidence(input: { candidate: RankedLiveProduct; registry: UsageEvidenceRegistry; state: AllocationState; batchSize?: number; requireUniqueSequence?: boolean }): { allocation: UsageEvidenceAllocation | null; reason: keyof UsageEvidenceAllocationDiagnostics | "" } {
  const { candidate, registry, state } = input;
  const assets = new Map(registry.assets.map((asset) => [asset.assetId, asset]));
  const useCasePacks = eligiblePacksForUseCase(registry, candidate.candidate.useCase);
  if (useCasePacks.length === 0) return { allocation: null, reason: "useCaseMismatchRejected" };
  const productBoundPacks = useCasePacks.filter((pack) => pack.packKind === "product_bound_synthetic_pack");
  const exactProductBoundPacks = productBoundPacks.filter((pack) => pack.boundProductKey === candidate.candidate.productKey);
  const genericPacks = useCasePacks.filter((pack) => pack.packKind !== "product_bound_synthetic_pack");
  if (productBoundPacks.length > 0 && exactProductBoundPacks.length === 0 && genericPacks.length === 0) {
    return { allocation: null, reason: "productBoundMismatchRejected" };
  }
  const compatiblePacks = [...exactProductBoundPacks, ...genericPacks]
    .filter((pack) => categoryCompatible(pack, candidate.candidate.categoryPath || candidate.candidate.category));
  if (compatiblePacks.length === 0) return { allocation: null, reason: "categoryCompatibilityRejected" };

  const options = compatiblePacks
    .filter((pack) => (state.packUses.get(pack.packId) ?? 0) < Math.min(pack.dailyReuseLimit, registry.maxUsagePackReuse))
    .map((pack) => selectPackOption(pack, assets, state, registry.maxSameSourceVideoDaily, input.requireUniqueSequence === true))
    .filter((option): option is PackOption => option !== null)
    .sort((left, right) => comparePackOptions(left, right, state));

  let sequenceRejected = false;
  for (const option of options) {
    const assetIds = option.assets.map((asset) => asset.assetId);
    const sequenceFingerprint = `${option.pack.sequenceFingerprint}:${assetIds.join(":")}`;
    const lastSequences = state.allocations.slice(-registry.maxSameSequenceConsecutive);
    if (lastSequences.length === registry.maxSameSequenceConsecutive && lastSequences.every((entry) => entry.sequenceFingerprint === sequenceFingerprint)) {
      sequenceRejected = true;
      continue;
    }
    const batch = state.allocations.slice(-(input.batchSize ?? 3) + 1);
    if (batch.length === (input.batchSize ?? 3) - 1 && batch.every((entry) => entry.packId === option.pack.packId)) {
      sequenceRejected = true;
      continue;
    }
    const allocation: UsageEvidenceAllocation = {
      productKey: candidate.candidate.productKey,
      useCase: candidate.candidate.useCase,
      packId: option.pack.packId,
      assetIds,
      sequenceFingerprint,
      sourceIds: [...new Set(option.assets.map((asset) => asset.sourceId))]
    };
    increment(state.packUses, option.pack.packId);
    for (const asset of option.assets) increment(state.assetUses, asset.assetId);
    for (const sourceId of option.sourceVideoIds) increment(state.sourceVideoUses, sourceId);
    state.allocations.push(allocation);
    return { allocation, reason: "" };
  }
  return { allocation: null, reason: sequenceRejected ? "sequenceCapacityRejected" : "assetCapacityRejected" };
}

function selectPackOption(pack: UsageEvidencePack, assets: Map<string, UsageEvidenceAsset>, state: AllocationState, sourceDailyLimit: number, requireUniqueSequence: boolean): PackOption | null {
  // Only referenced role assets can participate in this pack. Apply the same
  // production gate after lookup instead of rescanning the entire registry for
  // every pack; keep role order, duplicate handling and last-ID Map semantics.
  const materializable = (asset: UsageEvidenceAsset) => isUsageEvidenceAssetProductionMaterializable(asset, pack.useCase);
  const problemAssets = resolveAssets(pack.problemAssetIds, assets).filter(materializable);
  const usageAssets = resolveAssets([...new Set([...pack.usageAssetIds, ...pack.actionAssetIds])], assets).filter(materializable);
  const afterAssets = resolveAssets(pack.afterAssetIds, assets).filter(materializable);
  const options: PackOption[] = [];
  for (const problem of problemAssets) {
    for (const usage of usageAssets) {
      for (const after of afterAssets) {
        const selected: [UsageEvidenceAsset, UsageEvidenceAsset, UsageEvidenceAsset] = [problem, usage, after];
        if (new Set(selected.map((asset) => asset.assetId)).size !== selected.length) continue;
        if (requireUniqueSequence && state.allocations.some((allocation) => allocation.sequenceFingerprint === `${pack.sequenceFingerprint}:${selected.map((asset) => asset.assetId).join(":")}`)) continue;
        if (selected.some((asset) => (state.assetUses.get(asset.assetId) ?? 0) >= Math.min(asset.dailyReuseLimit, 5))) continue;
        const sourceVideoIds = [...new Set(selected.filter((asset) => VIDEO_SOURCE_KINDS.has(asset.sourceKind)).map((asset) => asset.sourceId))];
        if (sourceVideoIds.some((sourceId) => (state.sourceVideoUses.get(sourceId) ?? 0) >= sourceDailyLimit)) continue;
        const projectedAssetPressure = selected.map((asset) => ((state.assetUses.get(asset.assetId) ?? 0) + 1) / Math.min(asset.dailyReuseLimit, 5));
        const sourceMaximum = Math.max(0, ...sourceVideoIds.map((sourceId) => ((state.sourceVideoUses.get(sourceId) ?? 0) + 1) / sourceDailyLimit));
        options.push({
          pack,
          assets: selected,
          sourceVideoIds,
          pressure: {
            sourceMaximum,
            assetMaximum: Math.max(...projectedAssetPressure),
            assetTotal: projectedAssetPressure.reduce((sum, value) => sum + value, 0)
          }
        });
      }
    }
  }
  options.sort((left, right) => compareOptionPressure(left, right));
  return options[0] ?? null;
}

function resolveAssets(ids: string[], assets: Map<string, UsageEvidenceAsset>): UsageEvidenceAsset[] {
  return ids.map((id) => assets.get(id)).filter((asset): asset is UsageEvidenceAsset => Boolean(asset));
}

function comparePackOptions(left: PackOption, right: PackOption, state: AllocationState): number {
  return productBoundPriority(left.pack) - productBoundPriority(right.pack)
    || compareOptionPressure(left, right)
    || (state.packUses.get(left.pack.packId) ?? 0) - (state.packUses.get(right.pack.packId) ?? 0)
    || left.pack.packId.localeCompare(right.pack.packId);
}

function productBoundPriority(pack: UsageEvidencePack) {
  return pack.packKind === "product_bound_synthetic_pack" ? 0 : 1;
}

function compareOptionPressure(left: PackOption, right: PackOption): number {
  return left.pressure.assetMaximum - right.pressure.assetMaximum
    || left.pressure.assetTotal - right.pressure.assetTotal
    || left.pressure.sourceMaximum - right.pressure.sourceMaximum
    || left.assets.map((asset) => asset.assetId).join(":").localeCompare(right.assets.map((asset) => asset.assetId).join(":"));
}

function categoryCompatible(pack: UsageEvidencePack, category: string) {
  const normalized = normalize(category);
  if (pack.categoryBlocklist.some((value) => normalized.includes(normalize(value)))) return false;
  return pack.categoryAllowlist.length === 0 || pack.categoryAllowlist.some((value) => normalized.includes(normalize(value)));
}
function normalize(value: string) { return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, ""); }
function increment(counts: Map<string, number>, key: string) { counts.set(key, (counts.get(key) ?? 0) + 1); }
