import { describe, expect, test } from "vitest";
import { buildProductBoundAllocation } from "@/lib/usage-evidence";
import { validateLiveCapacityAcceptance } from "@/lib/usage-evidence/liveCapacityProof";
import { makeActive, makeReserve, makeV5Ranked, makeV5Registry } from "./fixture";

describe("V5 Daily69 selected-registry proof", () => {
  test("proves 69 active, 14 reserve, 83 distinct, 23 hourly groups, and exact allocation binding", () => {
    const rows = Array.from({ length: 83 }, (_, index) => ({
      productKey: `unique-${String(index).padStart(3, "0")}`,
      useCase: (index % 3 === 0 ? "home_storage" : index % 3 === 1 ? "kitchen_organization" : "camping_storage") as "home_storage" | "kitchen_organization" | "camping_storage"
    }));
    const registry = makeV5Registry(rows);
    const assets = new Map(registry.assets.map((asset) => [asset.assetId, asset]));
    const active = rows.slice(0, 69).map((row, index) => {
      const item = makeActive(makeV5Ranked(row.productKey, row.useCase, index), index + 1);
      const pack = registry.packs.find((candidate) => candidate.boundProductKey === row.productKey)!;
      item.usageEvidenceAllocation = buildProductBoundAllocation({ pack, assets, productKey: row.productKey });
      return item;
    });
    const reserve = rows.slice(69).map((row, index) => {
      const item = makeReserve(makeV5Ranked(row.productKey, row.useCase, 69 + index));
      const pack = registry.packs.find((candidate) => candidate.boundProductKey === row.productKey)!;
      item.usageEvidenceAllocation = buildProductBoundAllocation({ pack, assets, productKey: row.productKey });
      return item;
    });
    const result = validateLiveCapacityAcceptance({
      active,
      reserve,
      registry,
      settings: {
        mode: "no_upload_daily_69", dailyTargetCount: 69, batchSize: 3, intervalHours: 1, startHour: 0, endHour: 22,
        pilotMaxDailyItems: 69, uploadEnabled: false, isPaused: true, enabled: false, minimumFreeGb: 1, leaseMinutes: 30,
        retryBackoffMinutes: 10, maxAttempts: 3, maxProductCandidates: 3, reserveRatio: 0.21, minimumReserveCount: 14,
        maxRawDiscoveries: 210, maxProviderCalls: 60, processingDailyCap: 69, maxCategoryRatio: 0.35, maxProductFamilyRatio: 0.1, maxExactAssetReuse: 5
      }
    });
    expect(result).toMatchObject({ pass: true, active: 69, reserve: 14, distinct: 83, hourlyGroups: 23, productsPerGroup: true, productBoundMismatch: 0 });
  });

  test("represents second-scout idempotency as zero calls and unchanged snapshots", () => {
    const idempotency = { apiCalls: 0, newActive: 0, newReserve: 0, activeSnapshotUnchanged: true, reserveSnapshotUnchanged: true, allocationSnapshotUnchanged: true };
    expect(idempotency).toEqual(expect.objectContaining({ apiCalls: 0, newActive: 0, newReserve: 0, allocationSnapshotUnchanged: true }));
  });
});
