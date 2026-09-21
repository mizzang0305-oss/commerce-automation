import { performance } from "node:perf_hooks";
import type { RankedLiveProduct } from "@/lib/live-product-video";
import type { LocalQueueItem, QueueSchedulerSettings } from "@/lib/queue-scheduler/types";
import type { ReserveCandidate } from "@/lib/queue-scheduler/types";
import { buildOperationalReserveCoverage, createOperationalAdmissionState, operationalAdmissionPolicy, prepareOperationalAdmissionEvaluator, type OperationalReserveCoverage } from "@/lib/queue-scheduler/operationalAdmission";
import { allocateUsageEvidence, cloneUsageAllocationState, createUsageAllocationState } from "./allocator";
import type { UsageEvidenceAllocation, UsageEvidenceRegistry } from "./contracts";

export type UsageCapacityPlan = {
  active: RankedLiveProduct[];
  reserve: RankedLiveProduct[];
  allocations: UsageEvidenceAllocation[];
  operationalCoverage: OperationalReserveCoverage;
  diagnostics: {
    rawCount: number; normalizedCount: number; uniqueCount: number; policyEligibleCount: number; supportedUseCaseCount: number; usageAssetEligibleCount: number;
    categoryCapacityRejected: number; familyCapacityRejected: number; assetCapacityRejected: number; sequenceCapacityRejected: number; useCaseMismatchRejected: number; productBoundMismatchRejected: number;
    activeSelected: number; reserveSelected: number; activeShortfall: number; reserveShortfall: number; allocationMs: number;
    directSlotsWithOperationalFallback: number; slotsWithZeroOperationalFallback: number; minOperationalFallbacksPerSlot: number; maximumBipartiteMatchingSize: number; operationalReserveZeroCoverage: number;
  };
};

export function planUsageEvidenceCapacity(input: { ranked: RankedLiveProduct[]; registry: UsageEvidenceRegistry; settings: QueueSchedulerSettings; existing?: LocalQueueItem[]; rawCount?: number; normalizedCount?: number }): UsageCapacityPlan {
  const started = performance.now();
  const unique = uniqueRanked(input.ranked);
  const policyEligible = unique.filter((entry) => entry.score.eligible);
  let state = createUsageAllocationState({ allocations: (input.existing ?? []).map((item) => item.usageEvidenceAllocation).filter((allocation): allocation is UsageEvidenceAllocation => Boolean(allocation)), registry: input.registry });
  const active: RankedLiveProduct[] = [];
  const reserve: RankedLiveProduct[] = [];
  const allocationByKey = new Map<string, UsageEvidenceAllocation>();
  const categoryCounts = countBy(input.existing ?? [], (item) => categoryKey(item.candidate.categoryPath || item.candidate.category));
  const familyCounts = countBy(input.existing ?? [], (item) => familyKey(item.candidate.canonicalProductName, item.candidate.categoryPath));
  const useCaseCounts = countBy(input.existing ?? [], (item) => item.candidate.useCase);
  const categoryMax = Math.max(1, Math.floor(input.settings.dailyTargetCount * input.settings.maxCategoryRatio));
  const familyMax = Math.max(1, Math.floor(input.settings.dailyTargetCount * input.settings.maxProductFamilyRatio));
  const existingKeys = new Set((input.existing ?? []).map((item) => item.productKey));
  const existingNames = new Set((input.existing ?? []).map((item) => normalize(item.candidate.canonicalProductName)));
  const directTarget = Math.max(0, input.settings.dailyTargetCount - (input.existing?.length ?? 0));
  const remaining = policyEligible.filter((entry) => !existingKeys.has(entry.candidate.productKey) && !existingNames.has(normalize(entry.candidate.canonicalProductName)));
  let categoryCapacityRejected = 0; let familyCapacityRejected = 0; let assetCapacityRejected = 0; let sequenceCapacityRejected = 0; let useCaseMismatchRejected = 0; let productBoundMismatchRejected = 0;
  while (remaining.length && active.length < directTarget) {
    const lastTwo = active.slice(-2).map((entry) => entry.candidate.useCase);
    const candidates = remaining.map((entry, index) => ({ entry, index })).filter(({ entry }) => {
      const category = categoryKey(entry.candidate.categoryPath || entry.candidate.category);
      const family = familyKey(entry.candidate.canonicalProductName, entry.candidate.categoryPath);
      return (categoryCounts.get(category) ?? 0) < categoryMax && (familyCounts.get(family) ?? 0) < familyMax && !(lastTwo.length === 2 && lastTwo.every((value) => value === entry.candidate.useCase));
    }).sort((left, right) => (useCaseCounts.get(left.entry.candidate.useCase) ?? 0) - (useCaseCounts.get(right.entry.candidate.useCase) ?? 0) || left.index - right.index);
    let chosenIndex = -1; let chosenAllocation: UsageEvidenceAllocation | null = null;
    for (const candidate of candidates) {
      const result = allocateUsageEvidence({ candidate: candidate.entry, registry: input.registry, requireUniqueSequence: input.settings.mode === "no_upload_daily_69", state });
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
  const coveredSlots = new Set<string>();
  const planningItemsForReserve = planningQueue([...(input.existing ?? []), ...active], allocationByKey);
  const operationalStateForReserve = createOperationalAdmissionState(planningItemsForReserve);
  const reserveEvaluator = prepareOperationalAdmissionEvaluator(operationalStateForReserve);
  const cappedSourceIds = input.registry.assets.filter((asset) => ["owner_reviewed_video", "sanitized_local_video", "derived_clip", "derived_frame_pack"].includes(asset.sourceKind)).map((asset) => asset.sourceId);
  const operationalPolicyForReserve = operationalAdmissionPolicy(input.settings, input.registry.maxSameSourceVideoDaily, cappedSourceIds);
  const proposals = remaining.map((entry, index) => {
    const proposalState = cloneUsageAllocationState(state);
    const result = allocateUsageEvidence({ candidate: entry, registry: input.registry, requireUniqueSequence: input.settings.mode === "no_upload_daily_69", state: proposalState });
    if (!result.allocation) return { entry, index, coverageSlots: [] as string[] };
    const candidate = planningReserve(entry, result.allocation);
    return { entry, index, coverageSlots: reserveEvaluator.coverageSlots(candidate, planningItemsForReserve, operationalPolicyForReserve) };
  }).filter((proposal) => proposal.coverageSlots.length > 0);
  while (remaining.length && reserve.length < input.settings.minimumReserveCount) {
    proposals.sort((left, right) => right.coverageSlots.filter((slotId) => !coveredSlots.has(slotId)).length - left.coverageSlots.filter((slotId) => !coveredSlots.has(slotId)).length
      || right.coverageSlots.length - left.coverageSlots.length
      || (useCaseCounts.get(left.entry.candidate.useCase) ?? 0) - (useCaseCounts.get(right.entry.candidate.useCase) ?? 0)
      || left.index - right.index);
    const proposal = proposals.shift();
    if (!proposal) break;
    const trialState = cloneUsageAllocationState(state);
    const result = allocateUsageEvidence({ candidate: proposal.entry, registry: input.registry, requireUniqueSequence: input.settings.mode === "no_upload_daily_69", state: trialState });
    if (!result.allocation) continue;
    const candidate = planningReserve(proposal.entry, result.allocation);
    const coverageSlots = reserveEvaluator.coverageSlots(candidate, planningItemsForReserve, operationalPolicyForReserve);
    if (coverageSlots.length === 0) continue;
    const remainingIndex = remaining.indexOf(proposal.entry);
    if (remainingIndex >= 0) remaining.splice(remainingIndex, 1);
    reserve.push(proposal.entry);
    allocationByKey.set(proposal.entry.candidate.productKey, result.allocation);
    state = trialState;
    for (const slotId of coverageSlots) coveredSlots.add(slotId);
    increment(useCaseCounts, proposal.entry.candidate.useCase);
  }
  for (const entry of remaining.filter((candidate) => !reserve.includes(candidate))) {
    const category = categoryKey(entry.candidate.categoryPath || entry.candidate.category); const family = familyKey(entry.candidate.canonicalProductName, entry.candidate.categoryPath);
    if ((categoryCounts.get(category) ?? 0) >= categoryMax) categoryCapacityRejected += 1;
    else if ((familyCounts.get(family) ?? 0) >= familyMax) familyCapacityRejected += 1;
  }
  const planningItems = planningQueue([...(input.existing ?? []), ...active], allocationByKey);
  const operationalCoverage = buildOperationalReserveCoverage({
    items: planningItems,
    directSlots: planningItems.slice(input.existing?.length ?? 0),
    reserve: reserve.map((entry) => planningReserve(entry, allocationByKey.get(entry.candidate.productKey)!)),
    policy: operationalAdmissionPolicy(input.settings, input.registry.maxSameSourceVideoDaily, cappedSourceIds),
  });
  const supportedUseCaseCount = new Set(input.registry.packs.map((pack) => pack.useCase)).size;
return { active, reserve, allocations: [...allocationByKey.values()], operationalCoverage, diagnostics: { rawCount: input.rawCount ?? input.ranked.length, normalizedCount: input.normalizedCount ?? input.ranked.length, uniqueCount: unique.length, policyEligibleCount: policyEligible.length, supportedUseCaseCount, usageAssetEligibleCount: active.length + reserve.length, categoryCapacityRejected, familyCapacityRejected, assetCapacityRejected, sequenceCapacityRejected, useCaseMismatchRejected, productBoundMismatchRejected, activeSelected: active.length, reserveSelected: reserve.length, activeShortfall: Math.max(0, directTarget - active.length), reserveShortfall: Math.max(0, input.settings.minimumReserveCount - reserve.length), directSlotsWithOperationalFallback: operationalCoverage.directSlotsWithOperationalFallback, slotsWithZeroOperationalFallback: operationalCoverage.slotsWithZeroOperationalFallback.length, minOperationalFallbacksPerSlot: operationalCoverage.minFallbacksPerSlot, maximumBipartiteMatchingSize: operationalCoverage.maximumBipartiteMatchingSize, operationalReserveZeroCoverage: operationalCoverage.reserveCandidatesWithZeroCoverage.length, allocationMs: Math.round((performance.now() - started) * 1_000) / 1_000 } };
}

function planningQueue(values: Array<LocalQueueItem | RankedLiveProduct>, allocationByKey: Map<string, UsageEvidenceAllocation>): LocalQueueItem[] {
  return values.map((value, index) => {
    if ("slotId" in value) return value;
    const rank = index + 1;
    return {
      id: `planning-${String(rank).padStart(3, "0")}`,
      slotId: `slot-${String(rank).padStart(3, "0")}`,
      queueDate: "planning",
      queueRank: rank,
      productKey: value.candidate.productKey,
      candidate: value.candidate,
      usageEvidenceAllocation: allocationByKey.get(value.candidate.productKey),
      candidateHistory: [{ productKey: value.candidate.productKey, canonicalProductName: value.candidate.canonicalProductName, startedAt: "", finishedAt: "", outcome: "active", reason: "PRIMARY_SELECTED", schedulerAttempts: 0, replacementOfProductKey: "" }],
    } as LocalQueueItem;
  });
}

function planningReserve(entry: RankedLiveProduct, allocation: UsageEvidenceAllocation): ReserveCandidate {
  return { ...entry, insertedAt: "", claimedBySlot: "", claimedAt: "", queueDate: "planning", usageEvidenceAllocation: allocation };
}

function uniqueRanked(values: RankedLiveProduct[]) { const keys = new Set<string>(); const names = new Set<string>(); return values.filter((entry) => { const name = normalize(entry.candidate.canonicalProductName); if (keys.has(entry.candidate.productKey) || names.has(name)) return false; keys.add(entry.candidate.productKey); names.add(name); return true; }); }
function normalize(value: string) { return value.toLowerCase().replace(/[^가-힣a-z0-9]/gu, ""); }
function categoryKey(value: string) { return normalize(value.split(/[>\/]/u)[0] || "uncategorized") || "uncategorized"; }
function familyKey(name: string, categoryPath: string) { return `${categoryKey(categoryPath)}:${normalize(name).slice(0, 24)}`; }
function countBy<T>(values: T[], key: (value: T) => string) { const counts = new Map<string, number>(); for (const value of values) increment(counts, key(value)); return counts; }
function increment(counts: Map<string, number>, key: string) { counts.set(key, (counts.get(key) ?? 0) + 1); }
