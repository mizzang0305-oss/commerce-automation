import { createHash } from "node:crypto";
import { validateCoupangAffiliateUrl } from "@/lib/affiliate-readiness";
import type { LocalQueueItem, QueueSchedulerSettings, ReserveCandidate } from "./types";

export const OPERATIONAL_ADMISSION_REASONS = [
  "CATEGORY_CAP_REACHED",
  "FAMILY_CAP_REACHED",
  "SOURCE_CAP_REACHED",
  "ASSET_CAP_REACHED",
  "SEQUENCE_FINGERPRINT_ALREADY_USED",
  "CANDIDATE_ALREADY_USED",
  "PRODUCT_BINDING_INVALID",
  "AFFILIATE_NOT_READY",
  "NOT_MATERIALIZABLE",
] as const;

export type OperationalAdmissionReason = typeof OPERATIONAL_ADMISSION_REASONS[number];

export type OperationalAdmissionPolicy = {
  dailyTargetCount: number;
  maxCategoryRatio: number;
  maxProductFamilyRatio: number;
  maxExactAssetReuse: number;
  maxSameSourceVideoDaily: number;
  cappedSourceIds: string[];
};

export type OperationalReplacementContext = {
  slotId: string;
  plannedPrimaryProductKey?: string;
  failedPrimaryProductKey?: string;
  failureStage?: string;
};

type OperationalAssignment = Pick<LocalQueueItem, "id" | "slotId" | "productKey" | "candidate" | "usageEvidenceAllocation"> & {
  // Admission depends on retained identities, not execution timestamps/outcomes.
  candidateHistory: Array<{ productKey: string; candidateId?: string }>;
};

export type OperationalAdmissionState = {
  assignments: OperationalAssignment[];
  consumedReserveIds: string[];
  usedCandidateIds: string[];
  usedProductIds: string[];
};

export type OperationalStateDelta = {
  categoryKey: string;
  categoryBefore: number;
  categoryAfter: number;
  categoryMaximum: number;
  familyKey: string;
  familyBefore: number;
  familyAfter: number;
  familyMaximum: number;
  sourceCounts: Array<{ key: string; before: number; after: number; maximum: number }>;
  assetCounts: Array<{ key: string; before: number; after: number; maximum: number }>;
  sequenceFingerprint: string;
};

export type OperationalAdmissionDecision = {
  eligible: boolean;
  reasons: OperationalAdmissionReason[];
  stateDelta: OperationalStateDelta;
  candidateIdentity: { candidateId: string; productKey: string };
  slotIdentity: { slotId: string };
  replacementIdentity: { plannedPrimaryProductKey: string; failedPrimaryProductKey: string; failureStage: string };
  prefixStateHash: string;
};

export type OperationalReserveCoverage = {
  schemaVersion: "daily69-operational-reserve-coverage-v1";
  policy: OperationalAdmissionPolicy;
  directSlots: number;
  reserveCandidates: number;
  directSlotsWithOperationalFallback: number;
  slotsWithZeroOperationalFallback: string[];
  minFallbacksPerSlot: number;
  maxFallbacksPerSlot: number;
  medianFallbacksPerSlot: number;
  p10FallbacksPerSlot: number;
  p50FallbacksPerSlot: number;
  p90FallbacksPerSlot: number;
  reserveCandidatesWithZeroCoverage: string[];
  maximumBipartiteMatchingSize: number;
  reasonCounts: Partial<Record<OperationalAdmissionReason, number>>;
  slotCoverage: Array<{
    slotId: string;
    prefixStateHash: string;
    operationalFallbackCount: number;
    eligibleCandidateIds: string[];
    rejectionReasonCounts: Partial<Record<OperationalAdmissionReason, number>>;
  }>;
  candidateCoverage: Array<{ candidateId: string; productKey: string; operationalCoverageCount: number }>;
  pass: boolean;
  safeCode: "" | "OPERATIONAL_RESERVE_COVERAGE_GAP";
  SAFE_TO_UPLOAD: false;
  PLATFORM_UPLOAD: 0;
};

export function operationalAdmissionPolicy(settings: QueueSchedulerSettings, maxSameSourceVideoDaily: number, cappedSourceIds: string[] = []): OperationalAdmissionPolicy {
  return {
    dailyTargetCount: settings.dailyTargetCount,
    maxCategoryRatio: settings.maxCategoryRatio,
    maxProductFamilyRatio: settings.maxProductFamilyRatio,
    maxExactAssetReuse: settings.maxExactAssetReuse,
    maxSameSourceVideoDaily,
    cappedSourceIds: [...new Set(cappedSourceIds)].sort(),
  };
}

export function createOperationalAdmissionState(items: LocalQueueItem[], reserve: ReserveCandidate[] = []): OperationalAdmissionState {
  const assignments = items.map((item) => ({
    id: item.id,
    slotId: item.slotId,
    productKey: item.productKey,
    candidate: structuredClone(item.candidate),
    usageEvidenceAllocation: item.usageEvidenceAllocation ? structuredClone(item.usageEvidenceAllocation) : undefined,
    candidateHistory: admissionHistory(item),
  }));
  const usedProductIds = new Set<string>();
  const usedCandidateIds = new Set<string>();
  for (const item of assignments) {
    usedProductIds.add(item.productKey);
    if (item.candidate.candidateId) usedCandidateIds.add(item.candidate.candidateId);
    for (const history of item.candidateHistory) {
      usedProductIds.add(history.productKey);
      if (history.candidateId) usedCandidateIds.add(history.candidateId);
    }
  }
  for (const entry of reserve.filter((candidate) => Boolean(candidate.claimedBySlot))) {
    usedProductIds.add(entry.candidate.productKey);
    if (entry.candidate.candidateId) usedCandidateIds.add(entry.candidate.candidateId);
  }
  return {
    assignments,
    consumedReserveIds: reserve.filter((candidate) => Boolean(candidate.claimedBySlot)).map(candidateIdentity).sort(),
    usedCandidateIds: [...usedCandidateIds].sort(),
    usedProductIds: [...usedProductIds].sort(),
  };
}

function admissionHistory(item: OperationalAssignment | LocalQueueItem): OperationalAssignment["candidateHistory"] {
  const history = (item.candidateHistory ?? []).map((entry) => ({
    productKey: entry.productKey,
    candidateId: entry.candidateId ?? (entry.productKey === item.productKey ? item.candidate.candidateId : undefined),
  }));
  if (!history.some((entry) => entry.productKey === item.productKey)) history.push({ productKey: item.productKey, candidateId: item.candidate.candidateId });
  return history;
}

type OperationalCandidateInput = {
  state: OperationalAdmissionState;
  candidate: ReserveCandidate;
  policy: OperationalAdmissionPolicy;
  replacementContext: OperationalReplacementContext;
  prefixStateHash?: string;
};

export function evaluateOperationalCandidate(input: OperationalCandidateInput): OperationalAdmissionDecision {
  return evaluateOperationalCandidateWithIndex(input, buildAdmissionIndex(input.state.assignments));
}

function evaluateOperationalCandidateWithIndex(input: OperationalCandidateInput, index: AdmissionIndex): OperationalAdmissionDecision {
  const { candidate, policy, replacementContext } = input;
  const target = index.assignmentBySlot.get(replacementContext.slotId);
  const evaluated = evaluateAgainstIndex(input.state, index, target, candidate, policy);
  const allocation = candidate.usageEvidenceAllocation;
  const category = categoryKey(candidate.candidate.categoryPath || candidate.candidate.category);
  const family = familyKey(candidate.candidate.canonicalProductName, candidate.candidate.categoryPath);
  const categoryMaximum = Math.max(1, Math.floor(policy.dailyTargetCount * policy.maxCategoryRatio));
  const familyMaximum = Math.max(1, Math.floor(policy.dailyTargetCount * policy.maxProductFamilyRatio));
  return {
    eligible: evaluated.reasons.length === 0,
    reasons: evaluated.reasons,
    stateDelta: {
      categoryKey: category,
      categoryBefore: evaluated.categoryBefore,
      categoryAfter: evaluated.categoryBefore + 1,
      categoryMaximum,
      familyKey: family,
      familyBefore: evaluated.familyBefore,
      familyAfter: evaluated.familyBefore + 1,
      familyMaximum,
      sourceCounts: (allocation?.sourceIds ?? []).map((key) => ({ key, before: excludedCount(index.sourceCounts, key, target?.usageEvidenceAllocation?.sourceIds), after: excludedCount(index.sourceCounts, key, target?.usageEvidenceAllocation?.sourceIds) + 1, maximum: policy.maxSameSourceVideoDaily })),
      assetCounts: (allocation?.assetIds ?? []).map((key) => ({ key, before: excludedCount(index.assetCounts, key, target?.usageEvidenceAllocation?.assetIds), after: excludedCount(index.assetCounts, key, target?.usageEvidenceAllocation?.assetIds) + 1, maximum: policy.maxExactAssetReuse })),
      sequenceFingerprint: allocation?.sequenceFingerprint ?? "",
    },
    candidateIdentity: { candidateId: candidate.candidate.candidateId ?? candidate.candidate.productKey, productKey: candidate.candidate.productKey },
    slotIdentity: { slotId: replacementContext.slotId },
    replacementIdentity: {
      plannedPrimaryProductKey: replacementContext.plannedPrimaryProductKey ?? "",
      failedPrimaryProductKey: replacementContext.failedPrimaryProductKey ?? "",
      failureStage: replacementContext.failureStage ?? "",
    },
    prefixStateHash: input.prefixStateHash ?? operationalStateHash(input.state, replacementContext.slotId),
  };
}

export function applyOperationalCandidate(state: OperationalAdmissionState, candidate: ReserveCandidate, decision: OperationalAdmissionDecision): OperationalAdmissionState {
  if (!decision.eligible) throw new Error("OPERATIONAL_CANDIDATE_NOT_ELIGIBLE");
  const next = structuredClone(state);
  const index = next.assignments.findIndex((assignment) => assignment.slotId === decision.slotIdentity.slotId);
  if (index < 0) throw new Error("OPERATIONAL_REPLACEMENT_SLOT_NOT_FOUND");
  const previous = next.assignments[index];
  next.assignments[index] = {
    ...previous,
    productKey: candidate.candidate.productKey,
    candidate: structuredClone(candidate.candidate),
    usageEvidenceAllocation: structuredClone(candidate.usageEvidenceAllocation),
    candidateHistory: [...admissionHistory(previous), { productKey: candidate.candidate.productKey, candidateId: candidate.candidate.candidateId }],
  };
  next.usedProductIds = [...new Set([...next.usedProductIds, candidate.candidate.productKey])].sort();
  if (candidate.candidate.candidateId) next.usedCandidateIds = [...new Set([...next.usedCandidateIds, candidate.candidate.candidateId])].sort();
  next.consumedReserveIds = [...new Set([...next.consumedReserveIds, candidateIdentity(candidate)])].sort();
  return next;
}

export function buildOperationalReserveCoverage(input: {
  items: LocalQueueItem[];
  reserve: ReserveCandidate[];
  directSlots: LocalQueueItem[];
  policy: OperationalAdmissionPolicy;
}): OperationalReserveCoverage {
  const state = createOperationalAdmissionState(input.items, input.reserve);
  // This private state is unchanged throughout the counterfactual coverage
  // traversal. Reuse its index, never a cache of mutable runtime state.
  const index = buildAdmissionIndex(state.assignments);
  const available = input.reserve.filter((candidate) => !candidate.claimedBySlot);
  const candidateCounts = new Map(available.map((candidate) => [candidateIdentity(candidate), 0]));
  const reasonCounts: Partial<Record<OperationalAdmissionReason, number>> = {};
  const graph = new Map<string, string[]>();
  const slotCoverage = input.directSlots.map((slot) => {
    const prefixStateHash = operationalStateHash(state, slot.slotId);
    const eligibleCandidateIds: string[] = [];
    const rejectionReasonCounts: Partial<Record<OperationalAdmissionReason, number>> = {};
    for (const candidate of available) {
      const decision = evaluateOperationalCandidateWithIndex({
        state,
        candidate,
        policy: input.policy,
        prefixStateHash,
        replacementContext: { slotId: slot.slotId, plannedPrimaryProductKey: slot.productKey, failedPrimaryProductKey: slot.productKey, failureStage: "COUNTERFACTUAL_PRIMARY_FAILURE" },
      }, index);
      const id = candidateIdentity(candidate);
      if (decision.eligible) {
        eligibleCandidateIds.push(id);
        candidateCounts.set(id, (candidateCounts.get(id) ?? 0) + 1);
      } else {
        for (const reason of decision.reasons) {
          rejectionReasonCounts[reason] = (rejectionReasonCounts[reason] ?? 0) + 1;
          reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
        }
      }
    }
    eligibleCandidateIds.sort();
    graph.set(slot.slotId, eligibleCandidateIds);
    return {
      slotId: slot.slotId,
      prefixStateHash,
      operationalFallbackCount: eligibleCandidateIds.length,
      eligibleCandidateIds,
      rejectionReasonCounts,
    };
  });
  const counts = slotCoverage.map((slot) => slot.operationalFallbackCount).sort((left, right) => left - right);
  const slotsWithZeroOperationalFallback = slotCoverage.filter((slot) => slot.operationalFallbackCount === 0).map((slot) => slot.slotId);
  const candidateCoverage = available.map((candidate) => ({
    candidateId: candidate.candidate.candidateId ?? candidate.candidate.productKey,
    productKey: candidate.candidate.productKey,
    operationalCoverageCount: candidateCounts.get(candidateIdentity(candidate)) ?? 0,
  })).sort((left, right) => left.candidateId.localeCompare(right.candidateId));
  return {
    schemaVersion: "daily69-operational-reserve-coverage-v1",
    policy: input.policy,
    directSlots: input.directSlots.length,
    reserveCandidates: available.length,
    directSlotsWithOperationalFallback: input.directSlots.length - slotsWithZeroOperationalFallback.length,
    slotsWithZeroOperationalFallback,
    minFallbacksPerSlot: counts[0] ?? 0,
    maxFallbacksPerSlot: counts[counts.length - 1] ?? 0,
    medianFallbacksPerSlot: quantile(counts, 0.5),
    p10FallbacksPerSlot: quantile(counts, 0.1),
    p50FallbacksPerSlot: quantile(counts, 0.5),
    p90FallbacksPerSlot: quantile(counts, 0.9),
    reserveCandidatesWithZeroCoverage: candidateCoverage.filter((candidate) => candidate.operationalCoverageCount === 0).map((candidate) => candidate.candidateId),
    maximumBipartiteMatchingSize: maximumMatching(graph),
    reasonCounts,
    slotCoverage,
    candidateCoverage,
    pass: slotsWithZeroOperationalFallback.length === 0 && input.directSlots.length > 0,
    safeCode: slotsWithZeroOperationalFallback.length === 0 && input.directSlots.length > 0 ? "" : "OPERATIONAL_RESERVE_COVERAGE_GAP",
    SAFE_TO_UPLOAD: false,
    PLATFORM_UPLOAD: 0,
  };
}

export function operationalCandidateCoverageSlots(input: {
  state: OperationalAdmissionState;
  candidate: ReserveCandidate;
  slots: LocalQueueItem[];
  policy: OperationalAdmissionPolicy;
}) {
  return operationalCandidateCoverageDecisions(input)
    .filter((decision) => decision.eligible)
    .map((decision) => decision.slotIdentity.slotId);
}

export function operationalCandidateCoverageDecisions(input: {
  state: OperationalAdmissionState;
  candidate: ReserveCandidate;
  slots: LocalQueueItem[];
  policy: OperationalAdmissionPolicy;
}): OperationalAdmissionDecision[] {
  return prepareOperationalAdmissionEvaluator(input.state).coverageDecisions(input.candidate, input.slots, input.policy);
}

export function prepareOperationalAdmissionEvaluator(state: OperationalAdmissionState) {
  // A private snapshot permits index/hash reuse across many candidates without
  // caching mutable runtime state. Eligibility always executes the same core.
  const snapshot = structuredClone(state);
  const index = buildAdmissionIndex(snapshot.assignments);
  const hashes = new Map<string, string>();
  const evaluate = (input: Omit<OperationalCandidateInput, "state" | "prefixStateHash">) => {
    const slotId = input.replacementContext.slotId;
    if (!hashes.has(slotId)) hashes.set(slotId, operationalStateHash(snapshot, slotId));
    return evaluateOperationalCandidateWithIndex({ ...input, state: snapshot, prefixStateHash: hashes.get(slotId) }, index);
  };
  const coverageDecisions = (candidate: ReserveCandidate, slots: LocalQueueItem[], policy: OperationalAdmissionPolicy) => slots.map((slot) => evaluate({
    candidate,
    policy,
    replacementContext: { slotId: slot.slotId, plannedPrimaryProductKey: slot.productKey, failedPrimaryProductKey: slot.productKey },
  }));
  return { evaluate, coverageDecisions, coverageSlots: (candidate: ReserveCandidate, slots: LocalQueueItem[], policy: OperationalAdmissionPolicy) => coverageDecisions(candidate, slots, policy).filter((decision) => decision.eligible).map((decision) => decision.slotIdentity.slotId) };
}

export function operationalStateHash(state: OperationalAdmissionState, excludedSlotId = "") {
  const value = {
    assignments: state.assignments.filter((assignment) => assignment.slotId !== excludedSlotId).map((assignment) => ({
      slotId: assignment.slotId,
      productKey: assignment.productKey,
      category: categoryKey(assignment.candidate.categoryPath || assignment.candidate.category),
      family: familyKey(assignment.candidate.canonicalProductName, assignment.candidate.categoryPath),
      allocation: assignment.usageEvidenceAllocation ?? null,
    })).sort((left, right) => left.slotId.localeCompare(right.slotId)),
    consumedReserveIds: [...state.consumedReserveIds].sort(),
    usedCandidateIds: [...state.usedCandidateIds].sort(),
    usedProductIds: [...state.usedProductIds].sort(),
  };
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function operationalCategoryKey(value: string) { return categoryKey(value); }
export function operationalFamilyKey(name: string, categoryPath: string) { return familyKey(name, categoryPath); }

function candidateIdentity(candidate: ReserveCandidate) { return candidate.candidate.candidateId ?? candidate.candidate.productKey; }
function normalizeName(value: string) { return value.normalize("NFKC").toLowerCase().replace(/[^가-힣a-z0-9]/gu, ""); }
function categoryKey(value: string) { return normalizeName(value.split(/[>\/]/u)[0] || "uncategorized") || "uncategorized"; }
function familyKey(name: string, categoryPath: string) { return `${categoryKey(categoryPath)}:${normalizeName(name).slice(0, 24)}`; }
type AdmissionIndex = {
  assignmentBySlot: Map<string, OperationalAssignment>;
  categoryCounts: Map<string, number>;
  familyCounts: Map<string, number>;
  sourceCounts: Map<string, number>;
  assetCounts: Map<string, number>;
  sequenceCounts: Map<string, number>;
};
function buildAdmissionIndex(assignments: OperationalAssignment[]): AdmissionIndex {
  const index: AdmissionIndex = { assignmentBySlot: new Map(), categoryCounts: new Map(), familyCounts: new Map(), sourceCounts: new Map(), assetCounts: new Map(), sequenceCounts: new Map() };
  for (const assignment of assignments) {
    index.assignmentBySlot.set(assignment.slotId, assignment);
    increment(index.categoryCounts, categoryKey(assignment.candidate.categoryPath || assignment.candidate.category));
    increment(index.familyCounts, familyKey(assignment.candidate.canonicalProductName, assignment.candidate.categoryPath));
    for (const key of assignment.usageEvidenceAllocation?.sourceIds ?? []) increment(index.sourceCounts, key);
    for (const key of assignment.usageEvidenceAllocation?.assetIds ?? []) increment(index.assetCounts, key);
    if (assignment.usageEvidenceAllocation?.sequenceFingerprint) increment(index.sequenceCounts, assignment.usageEvidenceAllocation.sequenceFingerprint);
  }
  return index;
}
function commonCandidateReasons(state: OperationalAdmissionState, candidate: ReserveCandidate) {
  const allocation = candidate.usageEvidenceAllocation;
  const structuralMaterialization = Boolean(allocation && allocation.productKey === candidate.candidate.productKey && allocation.useCase === candidate.candidate.useCase && allocation.packId && allocation.sequenceFingerprint && allocation.assetIds.length > 0 && allocation.sourceIds.length > 0);
  const reasons = new Set<OperationalAdmissionReason>();
  if (!structuralMaterialization) reasons.add("NOT_MATERIALIZABLE");
  if (allocation && (allocation.productKey !== candidate.candidate.productKey || allocation.useCase !== candidate.candidate.useCase)) reasons.add("PRODUCT_BINDING_INVALID");
  if (!candidate.score.eligible) reasons.add("PRODUCT_BINDING_INVALID");
  if (!validateCoupangAffiliateUrl(candidate.candidate.selectedAffiliateUrl).affiliateReady) reasons.add("AFFILIATE_NOT_READY");
  if (state.usedProductIds.includes(candidate.candidate.productKey) || (candidate.candidate.candidateId && state.usedCandidateIds.includes(candidate.candidate.candidateId))) reasons.add("CANDIDATE_ALREADY_USED");
  return reasons;
}
function evaluateAgainstIndex(state: OperationalAdmissionState, index: AdmissionIndex, target: OperationalAssignment | undefined, candidate: ReserveCandidate, policy: OperationalAdmissionPolicy) {
  const allocation = candidate.usageEvidenceAllocation;
  const category = categoryKey(candidate.candidate.categoryPath || candidate.candidate.category);
  const family = familyKey(candidate.candidate.canonicalProductName, candidate.candidate.categoryPath);
  const categoryBefore = (index.categoryCounts.get(category) ?? 0) - Number(target && categoryKey(target.candidate.categoryPath || target.candidate.category) === category);
  const familyBefore = (index.familyCounts.get(family) ?? 0) - Number(target && familyKey(target.candidate.canonicalProductName, target.candidate.categoryPath) === family);
  const reasons = commonCandidateReasons(state, candidate);
  if (categoryBefore >= Math.max(1, Math.floor(policy.dailyTargetCount * policy.maxCategoryRatio))) reasons.add("CATEGORY_CAP_REACHED");
  if (familyBefore >= Math.max(1, Math.floor(policy.dailyTargetCount * policy.maxProductFamilyRatio))) reasons.add("FAMILY_CAP_REACHED");
  if (allocation?.sequenceFingerprint && excludedCount(index.sequenceCounts, allocation.sequenceFingerprint, target?.usageEvidenceAllocation?.sequenceFingerprint ? [target.usageEvidenceAllocation.sequenceFingerprint] : undefined) > 0) reasons.add("SEQUENCE_FINGERPRINT_ALREADY_USED");
  for (const key of allocation?.sourceIds ?? []) if (policy.cappedSourceIds.includes(key) && excludedCount(index.sourceCounts, key, target?.usageEvidenceAllocation?.sourceIds) >= policy.maxSameSourceVideoDaily) reasons.add("SOURCE_CAP_REACHED");
  for (const key of allocation?.assetIds ?? []) if (excludedCount(index.assetCounts, key, target?.usageEvidenceAllocation?.assetIds) >= policy.maxExactAssetReuse) reasons.add("ASSET_CAP_REACHED");
  return { reasons: OPERATIONAL_ADMISSION_REASONS.filter((reason) => reasons.has(reason)), categoryBefore, familyBefore };
}
function excludedCount(counts: Map<string, number>, key: string, targetKeys: string[] | undefined) { return (counts.get(key) ?? 0) - Number(targetKeys?.includes(key) ?? false); }
function increment(counts: Map<string, number>, key: string) { counts.set(key, (counts.get(key) ?? 0) + 1); }
function quantile(sorted: number[], percentile: number) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentile) - 1))];
}
function maximumMatching(graph: Map<string, string[]>) {
  const matchedSlotByCandidate = new Map<string, string>();
  let matched = 0;
  for (const slot of [...graph.keys()].sort()) if (augment(slot, new Set())) matched += 1;
  return matched;
  function augment(slot: string, visited: Set<string>): boolean {
    for (const candidate of graph.get(slot) ?? []) {
      if (visited.has(candidate)) continue;
      visited.add(candidate);
      const previous = matchedSlotByCandidate.get(candidate);
      if (!previous || augment(previous, visited)) { matchedSlotByCandidate.set(candidate, slot); return true; }
    }
    return false;
  }
}
