import { describe, expect, it } from "vitest";
import {
  appendSlot069,
  buildProductBoundAllocation,
  supplementalIdempotencyPassed
} from "@/lib/usage-evidence";
import { makeActive, makeReserve, makeV5Ranked, makeV5Registry } from "./fixture";

function baseline() {
  const active = Array.from({ length: 68 }, (_, index) => {
    const rank = index + 1;
    const item = makeActive(makeV5Ranked(`active-${rank}`, rank % 3 === 0 ? "camping_storage" : rank % 3 === 1 ? "home_storage" : "kitchen_organization", rank), rank);
    const hour = 1 + Math.floor((rank - 1) / 3);
    item.scheduledAt = new Date(`2026-08-09T${String(hour).padStart(2, "0")}:00:00+09:00`).toISOString();
    return item;
  });
  const reserve = Array.from({ length: 14 }, (_, index) => makeReserve(makeV5Ranked(`reserve-${index + 1}`, "home_storage", 100 + index)));
  return { active, reserve };
}

describe("V5 supplemental slot-069 proof", () => {
  it("appends one new distinct active product without consuming reserve", () => {
    const { active, reserve } = baseline();
    const registry = makeV5Registry([{ productKey: "recovered", useCase: "camping_storage" }]);
    const pack = registry.packs.find((entry) => entry.boundProductKey === "recovered")!;
    const allocation = buildProductBoundAllocation({ pack, assets: new Map(registry.assets.map((asset) => [asset.assetId, asset])), productKey: "recovered" });
    const queue = appendSlot069({ active, reserve, entry: makeV5Ranked("recovered", "camping_storage", 999), allocation, now: new Date("2026-08-09T12:00:00.000Z") });
    expect(queue).toHaveLength(69);
    expect(reserve).toHaveLength(14);
    expect(new Set([...queue.map((item) => item.productKey), ...reserve.map((item) => item.candidate.productKey)]).size).toBe(83);
    expect(queue.at(-1)).toMatchObject({ slotId: "slot-069", queueRank: 69 });
    const hourly = new Map<string, number>();
    for (const item of queue) hourly.set(item.scheduledAt, (hourly.get(item.scheduledAt) ?? 0) + 1);
    expect(hourly.size).toBe(23);
    expect([...hourly.values()].every((count) => count === 3)).toBe(true);
    expect(queue.slice(66).map((item) => item.scheduledAt)).toEqual([queue[68].scheduledAt, queue[68].scheduledAt, queue[68].scheduledAt]);
  });

  it("forbids promoting an existing reserve product", () => {
    const { active, reserve } = baseline();
    const candidate = reserve[0];
    expect(() => appendSlot069({ active, reserve, entry: candidate, allocation: { productKey: candidate.candidate.productKey, useCase: candidate.candidate.useCase, packId: "pack", assetIds: ["a", "b", "c"], sequenceFingerprint: "sequence", sourceIds: ["source"] }, now: new Date("2026-08-09T12:00:00.000Z") })).toThrow("V5_SLOT069_DISTINCT_PRODUCT_REQUIRED");
  });

  it("requires the zero-call DAILY_QUEUE_ALREADY_FILLED idempotency result", () => {
    expect(supplementalIdempotencyPassed({ safeMessage: "DAILY_QUEUE_ALREADY_FILLED", apiCalls: 0, newActive: 0, newReserve: 0, activeUnchanged: true, reserveUnchanged: true, allocationUnchanged: true })).toBe(true);
    expect(supplementalIdempotencyPassed({ safeMessage: "NIGHTLY_QUEUE_CREATED", apiCalls: 1, newActive: 0, newReserve: 0, activeUnchanged: true, reserveUnchanged: true, allocationUnchanged: true })).toBe(false);
  });
});
