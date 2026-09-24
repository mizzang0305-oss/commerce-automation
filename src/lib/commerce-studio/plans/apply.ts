import type { SimpleProducerStore } from "@/lib/simple-producer/state";
import type { StudioCommand, StudioPlan, StudioSettings } from "@/lib/commerce-studio/bridge/contracts";
import { STUDIO_CANDIDATE_MAX_AGE_MS } from "@/lib/commerce-studio/candidates/policy";

export type StudioHostReceipt = { commandId: string; status: "applied" | "rejected" | "pending"; safeError: string; appliedVersion: number | null };
export type StudioSettingsAdapter = {
  read(): Promise<StudioSettings>;
  write(next: StudioSettings): Promise<void>;
  readTaskSlots(): Promise<string[]>;
  writeTaskSlots(slots: string[]): Promise<void>;
};

export async function applyStudioHostCommand(input: {
  command: StudioCommand;
  producerStore: SimpleProducerStore;
  ownerId: string;
  hostId: string;
  environmentId: string;
  now: Date;
  generationSlots: readonly string[];
  usedProductIds?: ReadonlySet<string>;
  settingsAdapter?: StudioSettingsAdapter;
}): Promise<StudioHostReceipt> {
  const { command } = input;
  if (command.ownerId !== input.ownerId || command.hostId !== input.hostId || command.environmentId !== input.environmentId) throw new Error("STUDIO_HOST_BINDING_MISMATCH");
  return input.producerStore.mutate(async (state) => {
    const previous = state.studioCommandReceipts?.find((entry) => entry.commandId === command.commandId);
    if (previous?.status === "applied" || previous?.status === "rejected") return previous;
    const reject = (safeError: string): StudioHostReceipt => {
      const receipt = { commandId: command.commandId, status: "rejected" as const, safeError, appliedVersion: null };
      saveReceipt(state, receipt);
      return receipt;
    };
    if (new Date(command.expiresAt).getTime() <= input.now.getTime()) return reject("STUDIO_COMMAND_EXPIRED");
    if (command.type === "SET_PRODUCER_SETTINGS") {
      if (!input.settingsAdapter) return reject("STUDIO_SETTINGS_ADAPTER_MISSING");
      if ((state.studioSettingsRevision ?? 0) !== command.expectedVersion) return reject("STUDIO_SETTINGS_VERSION_STALE");
      const current = await input.settingsAdapter.read();
      const expectedNext: StudioSettings = { ...command.payload, revision: command.expectedVersion + 1 };
      if (current.revision !== command.expectedVersion &&
          !sameSettings(current, expectedNext)) return reject("STUDIO_SETTINGS_VERSION_STALE");
      try {
        if (!sameSettings(current, expectedNext)) await input.settingsAdapter.write(expectedNext);
        const slots = await input.settingsAdapter.readTaskSlots();
        if (slots.join(",") !== expectedNext.generationSlots.join(",")) await input.settingsAdapter.writeTaskSlots(expectedNext.generationSlots);
        const applied = await input.settingsAdapter.read();
        const task = await input.settingsAdapter.readTaskSlots();
        if (!sameSettings(applied, expectedNext) || task.join(",") !== expectedNext.generationSlots.join(",")) throw new Error("STUDIO_SETTINGS_READBACK_MISMATCH");
        state.studioSettingsRevision = expectedNext.revision;
        const receipt = { commandId: command.commandId, status: "applied" as const, safeError: "", appliedVersion: expectedNext.revision };
        saveReceipt(state, receipt);
        return receipt;
      } catch {
        const receipt = { commandId: command.commandId, status: "pending" as const, safeError: "STUDIO_SETTINGS_RECONCILE_REQUIRED", appliedVersion: null };
        saveReceipt(state, receipt);
        return receipt;
      }
    }
    const [date, slot, extra] = command.targetId.split("|");
    if (extra || !/^\d{4}-\d{2}-\d{2}$/u.test(date || "") || !/^(?:0\d|1\d|2[01]):[0-5]\d$/u.test(slot || "")) return reject("STUDIO_PLAN_TARGET_INVALID");
    const slotStart = Date.parse(`${date}T${slot}:00+09:00`);
    if (!Number.isFinite(slotStart) || kstDateTime(new Date(slotStart)) !== `${date}T${slot}`) return reject("STUDIO_PLAN_TARGET_INVALID");
    const today = kstDate(input.now);
    if (date < today) return reject("STUDIO_PLAN_DATE_PAST");
    if (slotStart <= input.now.getTime()) return reject("STUDIO_PLAN_SLOT_PAST");
    if (!input.generationSlots.includes(slot)) return reject("STUDIO_PLAN_SLOT_NOT_SCHEDULED");
    if (state.slots.some((entry) => entry.date === date && entry.slot === slot)) return reject("STUDIO_PLAN_ALREADY_CLAIMED");
    const plans = state.studioPlans ?? (state.studioPlans = []);
    const existing = plans.find((entry) => entry.planId === command.targetId);
    if ((existing?.version ?? 0) !== command.expectedVersion) return reject("STUDIO_PLAN_VERSION_STALE");
    if (existing && ["claimed", "completed", "failed"].includes(existing.status)) return reject("STUDIO_PLAN_ALREADY_CLAIMED");
    let next: StudioPlan;
    if (command.type === "SELECT_PRODUCT") {
      const candidate = state.studioCandidates?.find((entry) => entry.snapshotId === command.payload.candidateSnapshotId && entry.productId === command.payload.productId);
      if (!candidate || candidate.slotId !== command.targetId || !candidate.eligible || candidate.safeBlockers.length ||
          input.usedProductIds?.has(candidate.productId) ||
          state.slots.some((entry) => entry.productId === candidate.productId) ||
          plans.some((plan) => plan.planId !== command.targetId && plan.exactProductId === candidate.productId &&
            ["selected", "claimed", "completed"].includes(plan.status))) return reject("STUDIO_CANDIDATE_NOT_ELIGIBLE");
      if (!Number.isFinite(Date.parse(candidate.eligibilityCheckedAt)) ||
          input.now.getTime() - Date.parse(candidate.eligibilityCheckedAt) >= STUDIO_CANDIDATE_MAX_AGE_MS ||
          Date.parse(candidate.eligibilityCheckedAt) > input.now.getTime()) return reject("STUDIO_CANDIDATE_STALE");
      next = { planId: command.targetId, date, slot, version: command.expectedVersion + 1,
        status: "selected", selectionMode: "manual", candidateSnapshotId: candidate.snapshotId,
        exactProductId: candidate.productId, channelKey: candidate.channelKey,
        selectedAt: input.now.toISOString(), lockedAt: null, executionRecordId: null };
    } else {
      next = { planId: command.targetId, date, slot, version: command.expectedVersion + 1,
        status: "held", selectionMode: "auto", candidateSnapshotId: null,
        exactProductId: null, channelKey: null, selectedAt: null, lockedAt: null, executionRecordId: null };
    }
    if (existing) plans[plans.indexOf(existing)] = next;
    else plans.push(next);
    const receipt = { commandId: command.commandId, status: "applied" as const, safeError: "", appliedVersion: next.version };
    saveReceipt(state, receipt);
    return receipt;
  });
}

function saveReceipt(state: { studioCommandReceipts?: StudioHostReceipt[] }, receipt: StudioHostReceipt) {
  const receipts = state.studioCommandReceipts ?? (state.studioCommandReceipts = []);
  const index = receipts.findIndex((entry) => entry.commandId === receipt.commandId);
  if (index < 0) receipts.push(receipt);
  else receipts[index] = receipt;
}

function sameSettings(a: StudioSettings, b: StudioSettings) {
  return a.enabled === b.enabled && a.dailyGenerateTarget === b.dailyGenerateTarget && a.maxItemsPerRun === b.maxItemsPerRun &&
    a.timeZone === b.timeZone && a.revision === b.revision && a.generationSlots.join(",") === b.generationSlots.join(",");
}

function kstDate(now: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function kstDateTime(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}`;
}
