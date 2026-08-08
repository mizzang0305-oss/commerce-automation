import { describe, expect, test } from "vitest";
import { DAILY_69_NO_UPLOAD_SETTINGS } from "@/lib/queue-scheduler";
import { planUsageEvidenceCapacity, usageEvidenceCapacityUnits, validateUsageEvidenceRegistry } from "@/lib/usage-evidence";
import { makeRankedProducts, makeUsageEvidenceRegistry } from "./fixture";

describe("Daily69 usage capacity planner", () => {
  test("plans active 69 plus reserve 14 without relaxing diversity policies", () => {
    const registry = validateUsageEvidenceRegistry(makeUsageEvidenceRegistry({ packsPerUseCase: 4 }));
    const plan = planUsageEvidenceCapacity({ ranked: makeRankedProducts(180), registry, settings: DAILY_69_NO_UPLOAD_SETTINGS });
    expect(usageEvidenceCapacityUnits(registry)).toBe(140);
    expect(plan.active).toHaveLength(69);
    expect(plan.reserve).toHaveLength(14);
    expect(plan.allocations).toHaveLength(83);
    expect(plan.diagnostics.activeShortfall).toBe(0);
    expect(plan.diagnostics.reserveShortfall).toBe(0);
    const categoryCounts = new Map<string, number>();
    for (const entry of plan.active) categoryCounts.set(entry.candidate.category, (categoryCounts.get(entry.candidate.category) ?? 0) + 1);
    expect(Math.max(...categoryCounts.values())).toBeLessThanOrEqual(Math.floor(69 * 0.35));
  });

  test("fails closed when evidence capacity is insufficient", () => {
    const registry = makeUsageEvidenceRegistry({ packsPerUseCase: 2 });
    const plan = planUsageEvidenceCapacity({ ranked: makeRankedProducts(180), registry, settings: DAILY_69_NO_UPLOAD_SETTINGS });
    expect(plan.active.length + plan.reserve.length).toBeLessThan(83);
    expect(plan.diagnostics.activeShortfall + plan.diagnostics.reserveShortfall).toBeGreaterThan(0);
  });
});
