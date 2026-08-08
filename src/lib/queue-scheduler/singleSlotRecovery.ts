import type { LocalQueueItem, ReserveCandidate } from "./types";

export type SupplementalSlotBinding = {
  slotId: string;
  initialProductKey: string;
  finalProductKey: string;
  replacementReason: string;
  productBindingPassed: boolean;
  historicalQueueRewritten: false;
  SAFE_TO_UPLOAD: false;
};

export function selectCompatibleRecoveryReserve(input: {
  slot: LocalQueueItem;
  reserve: ReserveCandidate[];
  queue: LocalQueueItem[];
}): ReserveCandidate | null {
  const used = new Set(input.queue.flatMap((item) => [item.productKey, ...item.candidateHistory.map((entry) => entry.productKey)]));
  return [...input.reserve]
    .filter((entry) => !entry.claimedBySlot && entry.score.eligible && !used.has(entry.candidate.productKey))
    .filter((entry) => entry.candidate.useCase === input.slot.candidate.useCase)
    .sort((left, right) => right.score.finalProductScore - left.score.finalProductScore || left.candidate.productKey.localeCompare(right.candidate.productKey))[0] ?? null;
}

export function buildSupplementalSlotBinding(input: {
  slot: LocalQueueItem;
  finalProductKey: string;
  replacementReason?: string;
}): SupplementalSlotBinding {
  return {
    slotId: input.slot.slotId,
    initialProductKey: input.slot.productKey,
    finalProductKey: input.finalProductKey,
    replacementReason: input.replacementReason ?? "",
    productBindingPassed: Boolean(input.finalProductKey),
    historicalQueueRewritten: false,
    SAFE_TO_UPLOAD: false,
  };
}
