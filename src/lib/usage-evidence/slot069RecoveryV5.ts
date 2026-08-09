import { createHash } from "node:crypto";
import type { RankedLiveProduct } from "@/lib/live-product-video";
import { DAILY_69_NO_UPLOAD_SETTINGS, type LocalQueueItem, type ReserveCandidate } from "@/lib/queue-scheduler";
import type {
  ProductAvailabilityEvidence,
  UsageEvidenceAllocation,
  UsageEvidencePack,
  UsageEvidenceRegistry
} from "./contracts";
import { isV5ProductBoundPackEligible, V5_NO_DOWNSTREAM_EXECUTION } from "./productBoundSyntheticV5";

export const V5_SLOT069_LIMITS = Object.freeze({
  directRecoveryCalls: 2,
  replacementSearchCalls: 6,
  supplementalProofCalls: 3,
  reserveCalls: 1,
  maximumProviderCalls: 12,
  provisionalReplacementPacks: 3,
  selectedReplacementPacks: 1,
  standbyPacks: 1,
  normalBackgroundGenerations: 0,
  maximumRepairBackgroundGenerations: 4,
  maximumNewComposites: 16
});

export const V5_SLOT069_NO_DOWNSTREAM_EXECUTION = Object.freeze({
  ...V5_NO_DOWNSTREAM_EXECUTION,
  FINAL_VIDEO_RENDER_COUNT: 0,
  CONTROL_CENTER_PROJECTION: 0,
  VIDEO_CANARY_COUNT: 0
});

export type MissingSelectedPack = {
  pack: UsageEvidencePack;
  expectedContribution: { active: 1; reserve: 0; distinct: 1 };
};

export function findSingleMissingSelectedPack(input: {
  selectedPackIds: string[];
  registry: UsageEvidenceRegistry;
  active: LocalQueueItem[];
}): MissingSelectedPack {
  const selected = new Set(input.selectedPackIds);
  const present = new Set(input.active.map((item) => item.productKey));
  const missing = input.registry.packs.filter((pack) =>
    selected.has(pack.packId)
    && pack.packKind === "product_bound_synthetic_pack"
    && pack.boundProductKey
    && !present.has(pack.boundProductKey)
  );
  if (missing.length !== 1) throw new Error("V5_SLOT069_MISSING_PACK_SCOPE_INVALID");
  return { pack: missing[0], expectedContribution: { active: 1, reserve: 0, distinct: 1 } };
}

export function buildDirectRecoveryKeywords(pack: UsageEvidencePack): [string, string] {
  const name = (pack.canonicalProductName ?? "").replace(/[,/].*$/u, "").replace(/\s+/gu, " ").trim();
  if (!name) throw new Error("V5_SLOT069_CANONICAL_PRODUCT_NAME_REQUIRED");
  const tokens = name.split(" ").filter(Boolean);
  const core = tokens.slice(0, Math.min(tokens.length, 4)).join(" ");
  let fallback = name;
  if (pack.useCase === "camping_storage") fallback = "캠핑 수납가방 정리백";
  else if (pack.useCase === "home_storage") fallback = /신발|현관/u.test(name) ? "현관 신발 수납 정리대" : "옷장 수납 정리함";
  else if (pack.useCase === "kitchen_organization") fallback = /냉장고/u.test(name) ? "냉장고 정리 용기" : "주방 수납 정리함";
  const unique = [...new Set([core, fallback].map((value) => value.trim()).filter(Boolean))];
  if (unique.length !== 2) throw new Error("V5_SLOT069_DIRECT_QUERY_DIVERSITY_REQUIRED");
  return [unique[0], unique[1]];
}

export function evaluateDirectRecoveryMatch(input: { targetProductKey: string; queryProductKeys: string[][] }) {
  if (input.queryProductKeys.length > V5_SLOT069_LIMITS.directRecoveryCalls) throw new Error("V5_SLOT069_PROVIDER_BUDGET_EXCEEDED");
  const queryIndex = input.queryProductKeys.findIndex((keys) => keys.includes(input.targetProductKey));
  return { matched: queryIndex >= 0, queryIndex: queryIndex >= 0 ? queryIndex : null };
}

export function buildAvailabilityEvidence(input: {
  productKey: string;
  observedInPrepare: boolean;
  observedInRun1: boolean;
  observedInRun2: boolean;
  observedInTargetedRecovery: boolean;
  sourceKeywords: string[];
  lastObservedAt: string;
}): ProductAvailabilityEvidence {
  const observations = [input.observedInPrepare, input.observedInRun1, input.observedInRun2, input.observedInTargetedRecovery];
  const observationCount = observations.filter(Boolean).length;
  return {
    ...input,
    observationCount,
    sourceKeywords: [...new Set(input.sourceKeywords.map((value) => value.trim()).filter(Boolean))].sort(),
    availabilityScore: observationCount / observations.length
  };
}

export function isStableReplacementEvidence(evidence: ProductAvailabilityEvidence): boolean {
  return Boolean(
    (evidence.observedInRun2 && evidence.observedInTargetedRecovery)
    || (evidence.observedInRun1 && evidence.observedInRun2)
    || (evidence.observedInRun1 && evidence.observedInTargetedRecovery)
  );
}

export function selectStableReplacementCandidate(input: {
  candidates: Array<{ entry: RankedLiveProduct; availability: ProductAvailabilityEvidence; identityFidelityScore: number; categoryHeadroom: number }>;
  active: LocalQueueItem[];
  reserve: ReserveCandidate[];
  selectedBoundProductKeys: string[];
}) {
  const excluded = new Set([
    ...input.active.map((item) => item.productKey),
    ...input.reserve.map((entry) => entry.candidate.productKey),
    ...input.selectedBoundProductKeys
  ]);
  return input.candidates
    .filter((candidate) => !excluded.has(candidate.entry.candidate.productKey))
    .filter((candidate) => candidate.entry.score.eligible && isStableReplacementEvidence(candidate.availability))
    .sort((left, right) =>
      right.availability.availabilityScore - left.availability.availabilityScore
      || right.identityFidelityScore - left.identityFidelityScore
      || right.entry.score.finalProductScore - left.entry.score.finalProductScore
      || right.categoryHeadroom - left.categoryHeadroom
      || left.entry.candidate.productKey.localeCompare(right.entry.candidate.productKey)
    )[0] ?? null;
}

export function attachAvailabilityEvidence(input: {
  registry: UsageEvidenceRegistry;
  packId: string;
  evidence: ProductAvailabilityEvidence;
}): UsageEvidenceRegistry {
  let updated = false;
  const packs = input.registry.packs.map((pack) => {
    if (pack.packId !== input.packId) return pack;
    if (pack.boundProductKey !== input.evidence.productKey) throw new Error("PRODUCT_BOUND_USAGE_PACK_MISMATCH");
    updated = true;
    return { ...pack, availabilityEvidence: input.evidence };
  });
  if (!updated) throw new Error("V5_SLOT069_PACK_NOT_FOUND");
  return { ...input.registry, generatedAt: input.evidence.lastObservedAt, packs };
}

export function replaceSelectedProductBoundPack(input: {
  candidateRegistry: UsageEvidenceRegistry;
  selectedPackIds: string[];
  missingPackId: string;
  replacementPack: UsageEvidencePack;
}): { selectedRegistry: UsageEvidenceRegistry; selectedPackIds: string[] } {
  if (input.replacementPack.packKind !== "product_bound_synthetic_pack" || !input.replacementPack.boundProductKey) throw new Error("V5_SLOT069_REPLACEMENT_PACK_INVALID");
  const selected = input.selectedPackIds.filter((packId) => packId !== input.missingPackId);
  selected.push(input.replacementPack.packId);
  if (selected.length !== input.selectedPackIds.length || new Set(selected).size !== selected.length) throw new Error("V5_SLOT069_SELECTED_PACK_COUNT_INVALID");
  const selectedSet = new Set(selected);
  const packs = input.candidateRegistry.packs
    .filter((pack) => pack.packKind !== "product_bound_synthetic_pack" || selectedSet.has(pack.packId))
    .map((pack) => pack.packId === input.replacementPack.packId ? input.replacementPack : pack);
  const assetIds = new Set(packs.flatMap((pack) => pack.assetIds));
  return {
    selectedPackIds: selected,
    selectedRegistry: { ...input.candidateRegistry, packs, assets: input.candidateRegistry.assets.filter((asset) => assetIds.has(asset.assetId)) }
  };
}

export function appendSlot069(input: {
  active: LocalQueueItem[];
  reserve: ReserveCandidate[];
  entry: RankedLiveProduct;
  allocation: UsageEvidenceAllocation;
  now: Date;
}): LocalQueueItem[] {
  if (input.active.length !== 68 || input.reserve.length < 14) throw new Error("V5_SLOT069_BASELINE_INVALID");
  const expectedRanks = Array.from({ length: 68 }, (_, index) => index + 1);
  const expectedSlots = expectedRanks.map((rank) => `slot-${String(rank).padStart(3, "0")}`);
  if (input.active.some((item, index) => item.queueRank !== expectedRanks[index] || item.slotId !== expectedSlots[index])) throw new Error("V5_SLOT069_HISTORICAL_QUEUE_INVALID");
  const productKey = input.entry.candidate.productKey;
  if (!input.entry.score.eligible || input.allocation.productKey !== productKey) throw new Error("V5_SLOT069_PRODUCT_NOT_ELIGIBLE");
  if (input.active.some((item) => item.productKey === productKey) || input.reserve.some((item) => item.candidate.productKey === productKey)) throw new Error("V5_SLOT069_DISTINCT_PRODUCT_REQUIRED");
  const queueDate = input.active[0]?.queueDate;
  if (!queueDate || input.active.some((item) => item.queueDate !== queueDate)) throw new Error("V5_SLOT069_QUEUE_DATE_INVALID");
  const nowIso = input.now.toISOString();
  const rank = 69;
  const scheduledAt = schedule(queueDate, rank);
  const item: LocalQueueItem = {
    id: `localq-${queueDate.replace(/-/gu, "")}-069-${shortHash(productKey)}`,
    slotId: "slot-069",
    queueDate,
    queueRank: rank,
    productKey,
    productId: input.entry.candidate.rawProductId,
    rawProductName: input.entry.candidate.rawProductName,
    canonicalProductName: input.entry.candidate.canonicalProductName,
    sourceProvider: input.entry.candidate.sourceProvider,
    sourceKeyword: input.entry.candidate.sourceKeyword,
    productScore: input.entry.score.finalProductScore,
    scheduledAt,
    status: "scheduled",
    attemptCount: 0,
    productCandidateAttempt: 1,
    maxProductCandidates: DAILY_69_NO_UPLOAD_SETTINGS.maxProductCandidates,
    candidateHistory: [{
      productKey,
      canonicalProductName: input.entry.candidate.canonicalProductName,
      startedAt: nowIso,
      finishedAt: "",
      outcome: "active",
      reason: "SUPPLEMENTAL_SLOT_069_RECOVERY",
      schedulerAttempts: 0,
      replacementOfProductKey: ""
    }],
    leaseOwner: "",
    leaseAcquiredAt: "",
    leaseExpiresAt: "",
    nextAttemptAt: "",
    claimedAt: "",
    startedAt: "",
    finishedAt: "",
    creativeScore: null,
    videoQualityScore: null,
    videoPath: "",
    reviewPath: "",
    errorCode: "",
    safeMessage: "",
    reviewMetadata: { codexReview: "not_executed" },
    candidate: input.entry.candidate,
    usageEvidenceAllocation: input.allocation,
    createdAt: nowIso,
    updatedAt: nowIso,
    localRevision: 0
  };
  const result = [...input.active, item];
  if (result.slice(66).some((slot) => slot.scheduledAt !== scheduledAt)) throw new Error("V5_SLOT069_FINAL_GROUP_INVALID");
  return result;
}

export function validateSlot069Pack(input: { pack: UsageEvidencePack; registry: UsageEvidenceRegistry; productKey: string }) {
  const assets = new Map(input.registry.assets.map((asset) => [asset.assetId, asset]));
  return Boolean(
    input.pack.boundProductKey === input.productKey
    && input.pack.availabilityEvidence?.observedInTargetedRecovery
    && isV5ProductBoundPackEligible(input.pack, assets)
  );
}

export function assertSlot069ProviderBudget(input: { direct: number; replacement: number; proof: number; reserve?: number }) {
  const reserve = input.reserve ?? 0;
  if (input.direct < 0 || input.direct > V5_SLOT069_LIMITS.directRecoveryCalls
    || input.replacement < 0 || input.replacement > V5_SLOT069_LIMITS.replacementSearchCalls
    || input.proof < 0 || input.proof > V5_SLOT069_LIMITS.supplementalProofCalls
    || reserve < 0 || reserve > V5_SLOT069_LIMITS.reserveCalls
    || input.direct + input.replacement + input.proof + reserve > V5_SLOT069_LIMITS.maximumProviderCalls) {
    throw new Error("V5_SLOT069_PROVIDER_BUDGET_EXCEEDED");
  }
  return input.direct + input.replacement + input.proof + reserve;
}

export function supplementalIdempotencyPassed(input: {
  safeMessage: string;
  apiCalls: number;
  newActive: number;
  newReserve: number;
  activeUnchanged: boolean;
  reserveUnchanged: boolean;
  allocationUnchanged: boolean;
}) {
  return input.safeMessage === "DAILY_QUEUE_ALREADY_FILLED"
    && input.apiCalls === 0
    && input.newActive === 0
    && input.newReserve === 0
    && input.activeUnchanged
    && input.reserveUnchanged
    && input.allocationUnchanged;
}

function schedule(queueDate: string, rank: number) {
  const slot = Math.floor((rank - 1) / DAILY_69_NO_UPLOAD_SETTINGS.batchSize);
  const hour = Math.min(DAILY_69_NO_UPLOAD_SETTINGS.endHour, DAILY_69_NO_UPLOAD_SETTINGS.startHour + slot * DAILY_69_NO_UPLOAD_SETTINGS.intervalHours);
  return new Date(`${queueDate}T${String(hour).padStart(2, "0")}:00:00+09:00`).toISOString();
}

function shortHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
}
