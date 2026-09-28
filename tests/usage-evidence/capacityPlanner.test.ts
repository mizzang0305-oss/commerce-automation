import { describe, expect, test } from "vitest";
import { DAILY_69_NO_UPLOAD_SETTINGS } from "@/lib/queue-scheduler";
import { planUsageEvidenceCapacity, usageEvidenceCapacityUnits, validateUsageEvidenceRegistry } from "@/lib/usage-evidence";
import { makeRankedProducts, makeUsageEvidenceRegistry } from "./fixture";
import type { LocalQueueItem } from "@/lib/queue-scheduler/types";

describe("Daily69 usage capacity planner", () => {
  test("keeps nine carry assignments fixed and selects only sixty new direct products", () => {
    const registry = makeUsageEvidenceRegistry({ packsPerUseCase: 30 });
    const ranked = makeRankedProducts(180);
    const existing = ranked.slice(0, 9).map((entry, index) => ({
      id: `carry-${index}`, slotId: `slot-${String(index + 1).padStart(3, "0")}`,
      productKey: entry.candidate.productKey, candidate: entry.candidate, candidateHistory: [],
    } as unknown as LocalQueueItem));
    const before = structuredClone(existing);
    const plan = planUsageEvidenceCapacity({ ranked, registry, settings: DAILY_69_NO_UPLOAD_SETTINGS, existing });
    expect(plan.active).toHaveLength(60);
    expect(plan.reserve).toHaveLength(14);
    expect(plan.diagnostics.activeShortfall).toBe(0);
    expect(new Set(plan.allocations.map(allocation => allocation.sequenceFingerprint)).size).toBe(plan.allocations.length);
    expect(plan.operationalCoverage.directSlots).toBe(60);
    expect(new Set([...existing.map(item => item.productKey), ...plan.active.map(item => item.candidate.productKey), ...plan.reserve.map(item => item.candidate.productKey)]).size).toBe(83);
    expect(existing).toEqual(before);
  });
  test("plans active 69 plus reserve 14 without relaxing diversity policies", () => {
    const registry = validateUsageEvidenceRegistry(makeUsageEvidenceRegistry({ packsPerUseCase: 15 }));
    const plan = planUsageEvidenceCapacity({ ranked: makeRankedProducts(180), registry, settings: DAILY_69_NO_UPLOAD_SETTINGS });
    expect(usageEvidenceCapacityUnits(registry)).toBeGreaterThanOrEqual(83);
    expect(plan.active).toHaveLength(69);
    expect(plan.reserve).toHaveLength(14);
    expect(plan.allocations).toHaveLength(83);
    expect(plan.diagnostics.activeShortfall).toBe(0);
    expect(plan.diagnostics.reserveShortfall).toBe(0);
    expect(plan.operationalCoverage.pass).toBe(true);
    expect(plan.operationalCoverage.directSlotsWithOperationalFallback).toBe(69);
    expect(plan.operationalCoverage.slotsWithZeroOperationalFallback).toEqual([]);
    expect(plan.operationalCoverage.reserveCandidatesWithZeroCoverage).toEqual([]);
    expect(plan.operationalCoverage.minFallbacksPerSlot).toBeGreaterThanOrEqual(1);
    const categoryCounts = new Map<string, number>();
    for (const entry of plan.active) categoryCounts.set(entry.candidate.category, (categoryCounts.get(entry.candidate.category) ?? 0) + 1);
    expect(Math.max(...categoryCounts.values())).toBeLessThanOrEqual(Math.floor(69 * 0.35));
  });

  test("fails closed when evidence capacity is insufficient", () => {
    const registry = makeUsageEvidenceRegistry({ packsPerUseCase: 2 });
    const plan = planUsageEvidenceCapacity({ ranked: makeRankedProducts(180), registry, settings: DAILY_69_NO_UPLOAD_SETTINGS });
    expect(plan.active.length + plan.reserve.length).toBeLessThan(83);
    expect(plan.diagnostics.activeShortfall + plan.diagnostics.reserveShortfall).toBeGreaterThan(0);
    expect(plan.operationalCoverage.pass).toBe(false);
  });

  test("is deterministic and selects the same coverage-diverse reserve pool repeatedly", () => {
    const registry = validateUsageEvidenceRegistry(makeUsageEvidenceRegistry({ packsPerUseCase: 15 }));
    const input = { ranked: makeRankedProducts(180), registry, settings: DAILY_69_NO_UPLOAD_SETTINGS };
    const first = planUsageEvidenceCapacity(input);
    const second = planUsageEvidenceCapacity(input);
    expect(first.reserve.map((entry) => entry.candidate.productKey)).toEqual(second.reserve.map((entry) => entry.candidate.productKey));
    expect(first.operationalCoverage).toEqual(second.operationalCoverage);
  });
});
