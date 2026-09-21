import type { RankedLiveProduct } from "@/lib/live-product-video";
import type { QueueSchedulerSettings } from "@/lib/queue-scheduler/types";
import { planUsageEvidenceCapacity, type UsageCapacityPlan } from "./capacityPlanner";
import type { UsageEvidenceAllocation, UsageEvidenceRegistry } from "./contracts";
import { validateUsageEvidenceRegistry } from "./registry";

export type V3MarginalPackGain = {
  packId: string;
  useCase: string;
  activeGain: number;
  reserveGain: number;
  allocatableGain: number;
  sourcePressureDelta: number;
  assetPressureDelta: number;
  categoryCapImpact: number;
  familyCapImpact: number;
  activeAfter: number;
  reserveAfter: number;
  allocatableAfter: number;
};

export type V3MarginalEvaluation = {
  baseline: ReturnType<typeof summarizePlan>;
  final: ReturnType<typeof summarizePlan>;
  target: { active: number; reserve: number; distinct: number };
  selectedPackIds: string[];
  steps: V3MarginalPackGain[];
  packEvaluations: Array<V3MarginalPackGain & { selected: boolean; zeroGainReason: string | null }>;
  zeroGainPackIds: string[];
  unselectedAfterTargetPackIds: string[];
  result: "TARGET_REACHED" | "POSITIVE_GAIN_EXHAUSTED";
};

export function selectV3Registry(candidateRegistry: UsageEvidenceRegistry, selectedPackIds: string[]): UsageEvidenceRegistry {
  const selected = new Set(selectedPackIds);
  const packs = candidateRegistry.packs.filter((pack) => pack.packGeneration !== "v3_motion" || selected.has(pack.packId));
  const selectedAssetIds = new Set(packs.flatMap((pack) => pack.assetIds));
  return validateUsageEvidenceRegistry({
    ...candidateRegistry,
    assets: candidateRegistry.assets.filter((asset) => selectedAssetIds.has(asset.assetId)),
    packs
  });
}

export function evaluateV3MarginalPacks(input: {
  ranked: RankedLiveProduct[];
  baselineRegistry: UsageEvidenceRegistry;
  candidateRegistry: UsageEvidenceRegistry;
  settings: QueueSchedulerSettings;
  rawCount?: number;
  normalizedCount?: number;
}): V3MarginalEvaluation {
  const baselineRegistry = validateUsageEvidenceRegistry(input.baselineRegistry);
  const candidateRegistry = validateUsageEvidenceRegistry(input.candidateRegistry);
  const candidatePacks = candidateRegistry.packs
    .filter((pack) => pack.packGeneration === "v3_motion")
    .sort((left, right) => left.packId.localeCompare(right.packId));
  const baselinePackIds = new Set(baselineRegistry.packs.map((pack) => pack.packId));
  if (candidatePacks.some((pack) => baselinePackIds.has(pack.packId))) throw new Error("V3_PACK_ID_COLLISION");

  const plan = (registry: UsageEvidenceRegistry) => planUsageEvidenceCapacity({
    ranked: input.ranked,
    registry,
    settings: input.settings,
    rawCount: input.rawCount,
    normalizedCount: input.normalizedCount
  });
  const baselinePlan = plan(baselineRegistry);
  const standaloneEvaluations = candidatePacks.map((pack) => {
    const registry = selectV3Registry(candidateRegistry, [pack.packId]);
    const gain = marginalGain(pack.packId, pack.useCase, baselinePlan, plan(registry), baselineRegistry, registry);
    return {
      ...gain,
      selected: false,
      zeroGainReason: gain.allocatableGain > 0 ? null : "NO_INCREMENTAL_ALLOCATABLE_CANDIDATE_FOR_PACK"
    };
  });
  let currentPlan = baselinePlan;
  let currentRegistry = baselineRegistry;
  const selectedPackIds: string[] = [];
  const steps: V3MarginalPackGain[] = [];

  while (currentPlan.active.length < input.settings.dailyTargetCount || currentPlan.reserve.length < input.settings.minimumReserveCount) {
    const remaining = candidatePacks.filter((pack) => !selectedPackIds.includes(pack.packId));
    const evaluated = remaining.map((pack) => {
      const registry = selectV3Registry(candidateRegistry, [...selectedPackIds, pack.packId]);
      const nextPlan = plan(registry);
      return {
        plan: nextPlan,
        gain: marginalGain(pack.packId, pack.useCase, currentPlan, nextPlan, currentRegistry, registry)
      };
    }).sort((left, right) => right.gain.allocatableGain - left.gain.allocatableGain
      || right.gain.activeGain - left.gain.activeGain
      || left.gain.sourcePressureDelta - right.gain.sourcePressureDelta
      || left.gain.assetPressureDelta - right.gain.assetPressureDelta
      || left.gain.packId.localeCompare(right.gain.packId));
    const best = evaluated[0];
    if (!best || best.gain.allocatableGain <= 0) break;
    selectedPackIds.push(best.gain.packId);
    steps.push(best.gain);
    currentPlan = best.plan;
    currentRegistry = selectV3Registry(candidateRegistry, selectedPackIds);
  }

  const unselected = candidatePacks.filter((pack) => !selectedPackIds.includes(pack.packId));
  const zeroGainPackIds: string[] = [];
  const unselectedAfterTargetPackIds: string[] = [];
  for (const pack of unselected) {
    if (currentPlan.active.length >= input.settings.dailyTargetCount && currentPlan.reserve.length >= input.settings.minimumReserveCount) {
      unselectedAfterTargetPackIds.push(pack.packId);
      continue;
    }
    const nextPlan = plan(selectV3Registry(candidateRegistry, [...selectedPackIds, pack.packId]));
    if (nextPlan.active.length + nextPlan.reserve.length <= currentPlan.active.length + currentPlan.reserve.length) zeroGainPackIds.push(pack.packId);
  }

  const reached = currentPlan.active.length >= input.settings.dailyTargetCount && currentPlan.reserve.length >= input.settings.minimumReserveCount;
  const selectedGains = new Map(steps.map((step) => [step.packId, step]));
  const packEvaluations = standaloneEvaluations.map((evaluation) => {
    const selectedGain = selectedGains.get(evaluation.packId);
    return selectedGain
      ? { ...selectedGain, selected: true, zeroGainReason: null }
      : { ...evaluation, selected: false };
  });
  return {
    baseline: summarizePlan(baselinePlan),
    final: summarizePlan(currentPlan),
    target: { active: input.settings.dailyTargetCount, reserve: input.settings.minimumReserveCount, distinct: input.settings.dailyTargetCount + input.settings.minimumReserveCount },
    selectedPackIds,
    steps,
    packEvaluations,
    zeroGainPackIds,
    unselectedAfterTargetPackIds,
    result: reached ? "TARGET_REACHED" : "POSITIVE_GAIN_EXHAUSTED"
  };
}

function marginalGain(
  packId: string,
  useCase: string,
  before: UsageCapacityPlan,
  after: UsageCapacityPlan,
  beforeRegistry: UsageEvidenceRegistry,
  afterRegistry: UsageEvidenceRegistry
): V3MarginalPackGain {
  const beforePressure = allocationPressure(before.allocations, beforeRegistry);
  const afterPressure = allocationPressure(after.allocations, afterRegistry);
  return {
    packId,
    useCase,
    activeGain: after.active.length - before.active.length,
    reserveGain: after.reserve.length - before.reserve.length,
    allocatableGain: after.active.length + after.reserve.length - before.active.length - before.reserve.length,
    sourcePressureDelta: afterPressure.maxSourceUses - beforePressure.maxSourceUses,
    assetPressureDelta: afterPressure.maxAssetUses - beforePressure.maxAssetUses,
    categoryCapImpact: after.diagnostics.categoryCapacityRejected - before.diagnostics.categoryCapacityRejected,
    familyCapImpact: after.diagnostics.familyCapacityRejected - before.diagnostics.familyCapacityRejected,
    activeAfter: after.active.length,
    reserveAfter: after.reserve.length,
    allocatableAfter: after.active.length + after.reserve.length
  };
}

function allocationPressure(allocations: UsageEvidenceAllocation[], registry: UsageEvidenceRegistry) {
  const assets = new Map(registry.assets.map((asset) => [asset.assetId, asset]));
  const sourceUses = new Map<string, number>();
  const assetUses = new Map<string, number>();
  for (const allocation of allocations) {
    for (const assetId of allocation.assetIds) assetUses.set(assetId, (assetUses.get(assetId) ?? 0) + 1);
    const sources = new Set(allocation.assetIds.map((assetId) => assets.get(assetId)?.sourceId).filter((value): value is string => Boolean(value)));
    for (const sourceId of sources) sourceUses.set(sourceId, (sourceUses.get(sourceId) ?? 0) + 1);
  }
  return {
    maxSourceUses: Math.max(0, ...sourceUses.values()),
    maxAssetUses: Math.max(0, ...assetUses.values())
  };
}

function summarizePlan(plan: UsageCapacityPlan) {
  return {
    active: plan.active.length,
    reserve: plan.reserve.length,
    distinct: new Set([...plan.active, ...plan.reserve].map((entry) => entry.candidate.productKey)).size,
    diagnostics: plan.diagnostics
  };
}
