import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DurableStudioBridge, type StudioCompareSwapStore, type StudioDocument } from "@/lib/commerce-studio/bridge/durableStore";
import { studioModelFromSnapshot } from "@/lib/commerce-studio/bridge/snapshotModel";

const binding = { environmentId: "fixture-preview", hostId: "fixture-host", ownerId: "owner-google-sub" };
function fixtureStore(): StudioCompareSwapStore {
  let value: { revision: number; document: StudioDocument } | null = null;
  return {
    async read() { return value ? structuredClone(value) : null; },
    async compareSwap(_binding, revision, document) {
      if ((value?.revision ?? 0) !== revision) return false;
      value = { revision: revision + 1, document: structuredClone(document) };
      return true;
    }
  };
}
function snapshot(sequence: number, eventId = randomUUID()) {
  return { schemaVersion: 1, ...binding, sourceRuntimeSha: "a".repeat(40), sourceSequence: sequence,
    eventId, observedAt: "2026-09-23T00:00:00.000Z", sourceRevision: "revision-1",
    completeness: { producer: false, publisher: true, plans: false, candidates: false },
    payload: { producer: null, publisher: { jobs: [], ledger: [] }, plans: null, candidates: null } };
}

describe("durable Studio bridge isolated CAS store", () => {
  it("preserves verified empty publisher and unknown producer through restart", async () => {
    const store = fixtureStore();
    const first = new DurableStudioBridge(store, binding);
    expect(await first.read(binding.ownerId)).toBeNull();
    expect(await first.ingest(snapshot(1))).toBe("accepted");
    const restarted = new DurableStudioBridge(store, binding);
    const model = studioModelFromSnapshot(await restarted.read(binding.ownerId), new Date("2026-09-23T00:01:00.000Z"));
    expect(model.publisherSource).toBe("connected");
    expect(model.producerSource).toBe("unavailable");
    expect(model.contents).toHaveLength(0);
    expect(model.receivedAt).toBeTruthy();
  });

  it("rejects replay/collision/stale and persists nonce uniqueness", async () => {
    const bridge = new DurableStudioBridge(fixtureStore(), binding);
    const first = snapshot(1);
    expect(await bridge.ingest(first)).toBe("accepted");
    expect(await bridge.ingest(first)).toBe("duplicate");
    await expect(bridge.ingest({ ...first, sourceRevision: "changed" })).rejects.toThrow("STUDIO_EVENT_ID_COLLISION");
    await expect(bridge.ingest(snapshot(1))).rejects.toThrow("STUDIO_SOURCE_SEQUENCE_STALE");
    const nonce = randomUUID();
    expect(await bridge.useNonce(binding.hostId, nonce)).toBe(true);
    expect(await bridge.useNonce(binding.hostId, nonce)).toBe(false);
  });

  it("stores owner command pending until host ACK and keeps ACK across restart", async () => {
    const store = fixtureStore();
    const bridge = new DurableStudioBridge(store, binding);
    const command = { commandId: randomUUID(), ...binding, type: "HOLD_PLAN", targetId: "2026-09-24|09:00",
      expectedVersion: 0, requestedAt: "2026-09-23T00:00:00.000Z", expiresAt: "2026-09-23T00:05:00.000Z", payload: {} };
    expect((await bridge.enqueue(command, binding.ownerId, new Date("2026-09-23T00:01:00.000Z"))).status).toBe("pending");
    expect((await bridge.pendingForHost(binding.hostId, new Date("2026-09-23T00:02:00.000Z")))).toHaveLength(1);
    await bridge.acknowledge(binding.hostId, command.commandId, { status: "applied", receipt: "HOST_APPLIED", appliedRevision: 1 });
    const restarted = new DurableStudioBridge(store, binding);
    expect((await restarted.command(binding.ownerId, command.commandId))?.receipt).toBe("HOST_APPLIED");
    await expect(restarted.acknowledge(binding.hostId, command.commandId,
      { status: "applied", receipt: "DIFFERENT", appliedRevision: 1 })).rejects.toThrow("STUDIO_ACK_CONFLICT");
    expect(await restarted.pendingForHost(binding.hostId, new Date("2026-09-23T00:02:00.000Z"))).toHaveLength(0);
  });

  it("keeps historical 09:00 execution after schedule moves to 10:00 and marks stale source", async () => {
    const bridge = new DurableStudioBridge(fixtureStore(), binding);
    const base = snapshot(1);
    const input = {
      ...base,
      completeness: { ...base.completeness, producer: true },
      payload: { ...base.payload, producer: { settings: { enabled: true, dailyGenerateTarget: 1,
        maxItemsPerRun: 1, generationSlots: ["10:00"], timeZone: "Asia/Seoul", revision: 2 },
      slots: [{ date: "2026-09-22", slot: "09:00", status: "succeeded", createdAt: "2026-09-22T00:00:00.000Z",
        updatedAt: "2026-09-22T00:10:00.000Z", productId: "p1", uploadJobId: "", safeError: "" }] } }
    };
    await bridge.ingest(input, "2026-09-23T00:00:00.000Z");
    const model = studioModelFromSnapshot(await bridge.read(binding.ownerId), new Date("2026-09-23T00:10:00.000Z"), true);
    expect(model.slots.some((slot) => slot.date === "2026-09-22" && slot.time === "09:00" && slot.status === "succeeded")).toBe(true);
    expect(model.slots.some((slot) => slot.date === "2026-09-23" && slot.time === "10:00")).toBe(true);
    expect(model.sourceStale).toBe(true);
    expect(model.commandsAvailable).toBe(false);
  });
});
