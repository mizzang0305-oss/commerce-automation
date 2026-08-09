import { performance } from "node:perf_hooks";
import type { RankedLiveProduct } from "@/lib/live-product-video";
import type { LocalQueueItem, QueueSchedulerSettings } from "@/lib/queue-scheduler/types";
import { allocateUsageEvidence, createUsageAllocationState } from "./allocator";
import type { UsageEvidenceAllocation, UsageEvidenceRegistry } from "./contracts";

export type UsageCapacityPlan = {
  active: RankedLiveProduct[];
  reserve: RankedLiveProduct[];
  allocations: UsageEvidenceAllocation[];
  diagnostics: {
    rawCount: number; normalizedCount: number; uniqueCount: number; policyEligibleCount: number; supportedUseCaseCount: number; usageAssetEligibleCount: number;
    categoryCapacityRejected: number; familyCapacityRejected: number; assetCapacityRejected: number; sequenceCapacityRejected: number; useCaseMismatchRejected: number; productBoundMismatchRejected: number;
    activeSelected: number; reserveSelected: number; activeShortfall: number; reserveShortfall: number; allocationMs: number;
  };
};

export function planUsageEvidenceCapacity(input: { ranked: RankedLiveProduct[]; registry: UsageEvidenceRegistry; settings: QueueSchedulerSettings; existing?: LocalQueueItem[]; rawCount?: number; normalizedCount?: number }): UsageCapacityPlan {
  const started = performance.now();
  const unique = uniqueRanked(input.ranked);
  const policyEligible = unique.filter((entry) => entry.score.eligible);
  const state = createUsageAllocationState();
  const active: RankedLiveProduct[] = [];
  const reserve: RankedLiveProduct[] = [];
  const allocationByKey = new Map<string, UsageEvidenceAllocation>();
  const categoryCounts = countBy(input.existing ?? [], (item) => categoryKey(item.candidate.categoryPath || item.candidate.category));
  const familyCounts = countBy(input.existing ?? [], (item) => familyKey(item.candidate.canonicalProductName, item.candidate.categoryPath));
  const useCaseCounts = countBy(input.existing ?? [], (item) => item.candidate.useCase);
  const categoryMax = Math.max(1, Math.floor(input.settings.dailyTargetCount * input.settings.maxCategoryRatio));
  const familyMax = Math.max(1, Math.floor(input.settings.dailyTargetCount * input.settings.maxProductFamilyRatio));
  const remaining = [...policyEligible];
  let categoryCapacityRejected = 0; let familyCapacityRejected = 0; let assetCapacityRejected = 0; let sequenceCapacityRejected = 0; let useCaseMismatchRejected = 0; let productBoundMismatchRejected = 0;
  while (remaining.length && active.length < input.settings.dailyTargetCount) {
    const lastTwo = active.slice(-2).map((entry) => entry.candidate.useCase);
    const candidates = remaining.map((entry, index) => ({ entry, index })).filter(({ entry }) => {
      const category = categoryKey(entry.candidate.categoryPath || entry.candidate.category);
      const family = familyKey(entry.candidate.canonicalProductName, entry.candidate.categoryPath);
      return (categoryCounts.get(category) ?? 0) < categoryMax && (familyCounts.get(family) ?? 0) < familyMax && !(lastTwo.length === 2 && lastTwo.every((value) => value === entry.candidate.useCase));
    }).sort((left, right) => (useCaseCounts.get(left.entry.candidate.useCase) ?? 0) - (useCaseCounts.get(right.entry.candidate.useCase) ?? 0) || left.index - right.index);
    let chosenIndex = -1; let chosenAllocation: UsageEvidenceAllocation | null = null;
    for (const candidate of candidates) {
      const result = allocateUsageEvidence({ candidate: candidate.entry, registry: input.registry, state });
      if (result.allocation) { chosenIndex = candidate.index; chosenAllocation = result.allocation; break; }
      if (result.reason === "sequenceCapacityRejected") sequenceCapacityRejected += 1;
      else if (result.reason === "categoryCompatibilityRejected") categoryCapacityRejected += 1;
      else if (result.reason === "useCaseMismatchRejected") useCaseMismatchRejected += 1;
      else if (result.reason === "productBoundMismatchRejected") productBoundMismatchRejected += 1;
      else assetCapacityRejected += 1;
    }
    if (chosenIndex < 0 || !chosenAllocation) break;
    const [chosen] = remaining.splice(chosenIndex, 1);
    active.push(chosen); allocationByKey.set(chosen.candidate.productKey, chosenAllocation);
    increment(categoryCounts, categoryKey(chosen.candidate.categoryPath || chosen.candidate.category)); increment(familyCounts, familyKey(chosen.candidate.canonicalProductName, chosen.candidate.categoryPath)); increment(useCaseCounts, chosen.candidate.useCase);
  }
  while (remaining.length && reserve.length < input.settings.minimumReserveCount) {
    const candidates = remaining.map((entry, index) => ({ entry, index }))
      .sort((left, right) => (useCaseCounts.get(left.entry.candidate.useCase) ?? 0) - (useCaseCounts.get(right.entry.candidate.useCase) ?? 0) || left.index - right.index);
    let chosenIndex = -1; let chosenAllocation: UsageEvidenceAllocation | null = null;
    for (const candidate of candidates) {
      const result = allocateUsageEvidence({ candidate: candidate.entry, registry: input.registry, state });
      if (result.allocation) { chosenIndex = candidate.index; chosenAllocation = result.allocation; break; }
      if (result.reason === "sequenceCapacityRejected") sequenceCapacityRejected += 1;
      else if (result.reason === "categoryCompatibilityRejected") categoryCapacityRejected += 1;
      else if (result.reason === "useCaseMismatchRejected") useCaseMismatchRejected += 1;
      else if (result.reason === "productBoundMismatchRejected") productBoundMismatchRejected += 1;
      else assetCapacityRejected += 1;
    }
    if (chosenIndex < 0 || !chosenAllocation) break;
    const [chosen] = remaining.splice(chosenIndex, 1);
    reserve.push(chosen); allocationByKey.set(chosen.candidate.productKey, chosenAllocation);
    increment(useCaseCounts, chosen.candidate.useCase);
  }
  for (const entry of remaining.filter((candidate) => !reserve.includes(candidate))) {
    const category = categoryKey(entry.candidate.categoryPath || entry.candidate.category); const family = familyKey(entry.candidate.canonicalProductName, entry.candidate.categoryPath);
    if ((categoryCounts.get(category) ?? 0) >= categoryMax) categoryCapacityRejected += 1;
    else if ((familyCounts.get(family) ?? 0) >= familyMax) familyCapacityRejected += 1;
  }
  const supportedUseCaseCount = new Set(input.registry.packs.map((pack) => pack.useCase)).size;
  return { active, reserve, allocations: [...allocationByKey.values()], diagnostics: { rawCount: input.rawCount ?? input.ranked.length, normalizedCount: input.normalizedCount ?? input.ranked.length, uniqueCount: unique.length, policyEligibleCount: policyEligible.length, supportedUseCaseCount, usageAssetEligibleCount: active.length + reserve.length, categoryCapacityRejected, familyCapacityRejected, assetCapacityRejected, sequenceCapacityRejected, useCaseMismatchRejected, productBoundMismatchRejected, activeSelected: active.length, reserveSelected: reserve.length, activeShortfall: Math.max(0, input.settings.dailyTargetCount - active.length), reserveShortfall: Math.max(0, input.settings.minimumReserveCount - reserve.length), allocationMs: Math.round((performance.now() - started) * 1_000) / 1_000 } };
}

function uniqueRanked(values: RankedLiveProduct[]) { const keys = new Set<string>(); const names = new Set<string>(); return values.filter((entry) => { const name = normalize(entry.candidate.canonicalProductName); if (keys.has(entry.candidate.productKey) || names.has(name)) return false; keys.add(entry.candidate.productKey); names.add(name); return true; }); }
function normalize(value: string) { return value.toLowerCase().replace(/[^가-힣a-z0-9]/gu, ""); }
function categoryKey(value: string) { return normalize(value.split(/[>\/]/u)[0] || "uncategorized") || "uncategorized"; }
function familyKey(name: string, categoryPath: string) { return `${categoryKey(categoryPath)}:${normalize(name).slice(0, 24)}`; }
function countBy<T>(values: T[], key: (value: T) => string) { const counts = new Map<string, number>(); for (const value of values) increment(counts, key(value)); return counts; }
function increment(counts: Map<string, number>, key: string) { counts.set(key, (counts.get(key) ?? 0) + 1); }
