import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { DAILY_69_NO_UPLOAD_SETTINGS, LocalQueueRepository } from "@/lib/queue-scheduler";
import { auditDaily69Composition, decideDaily69Activation, estimateDaily69Disk } from "@/lib/queue-control-integration";
import { rankedProducts } from "./fixtures";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));
async function setup() { const root = await mkdtemp(join(tmpdir(), "daily69-")); roots.push(root); const repository = new LocalQueueRepository(root); await repository.writeSettings({ ...DAILY_69_NO_UPLOAD_SETTINGS, enabled: true, isPaused: false }); return repository; }

describe("daily 69 no-upload capacity", () => {
  test("creates fixed slot-001..069 plus at least 14 reserve with a 23x3 schedule", async () => {
    const repository = await setup();
    const now = new Date("2026-08-09T00:00:00.000Z");
    const first = await repository.insertRanked({ ranked: rankedProducts(83), queueDate: "2026-08-09", now });
    const revisionAfterFirst = (await repository.controlState()).localRevision;
    const second = await repository.insertRanked({ ranked: rankedProducts(83), queueDate: "2026-08-09", now });
    expect(first.queued).toHaveLength(69); expect(first.reserveCount).toBeGreaterThanOrEqual(14); expect(second.queued).toHaveLength(0);
    expect((await repository.controlState()).localRevision).toBe(revisionAfterFirst);
    expect(first.queued[0].slotId).toBe("slot-001"); expect(first.queued[68].slotId).toBe("slot-069");
    const hours = first.queued.map((item) => new Date(item.scheduledAt).toLocaleString("en-US", { timeZone: "Asia/Seoul", hour: "2-digit", hour12: false }));
    expect(new Set(hours)).toHaveLength(23); expect(hours.filter((hour) => hour === "01")).toHaveLength(3); expect(hours.filter((hour) => hour === "23")).toHaveLength(3);
    expect(auditDaily69Composition(first.queued, await repository.settings())).toMatchObject({ duplicates: 0, categoryReady: true, familyReady: true, assetReady: true, hookReady: true });
  });

  test("never claims beyond the nine logical processing slots", async () => {
    const repository = await setup(); const now = new Date("2026-08-09T00:00:00.000Z");
    await repository.insertRanked({ ranked: rankedProducts(83), queueDate: "2026-08-09", now, dueNow: true });
    const claimed = [];
    for (let batch = 0; batch < 3; batch += 1) {
      const rows = await repository.claimDue({ now, runId: `batch-${batch}`, limit: 3, leaseMinutes: 10, pilotMax: 69 });
      claimed.push(...rows);
      for (const row of rows) await repository.complete({ id: row.id, videoPath: `${row.id}.mp4`, reviewPath: "review.json", creativeScore: 90, videoQualityScore: 90, now });
    }
    expect(claimed).toHaveLength(9); expect(new Set(claimed.map((item) => item.slotId)).size).toBe(9);
    expect(await repository.claimDue({ now, runId: "after-cap", limit: 3, leaseMinutes: 10, pilotMax: 69 })).toHaveLength(0);
    expect((await repository.items()).filter((item) => item.status === "scheduled")).toHaveLength(60);
  });

  test("fails disk readiness without p95 evidence and arms only when every gate passes", () => {
    expect(estimateDaily69Disk({ videoSizesBytes: [], freeBytes: 100 * 1024 ** 3 })).toMatchObject({ ready: false, blocker: "DISK_P95_SAMPLE_NOT_AVAILABLE" });
    const disk = estimateDaily69Disk({ videoSizesBytes: [10_000_000, 12_000_000, 11_000_000], freeBytes: 100 * 1024 ** 3 });
    expect(disk.ready).toBe(true); expect(disk.requiredFreeGb).toBeGreaterThanOrEqual(20);
    const decision = decideDaily69Activation({ activeCount: 69, reserveCount: 14, canaryCompleted: 9, canaryTarget: 9, schedulerPass: true, controlCenterPass: true, sheetsLivePass: true, controlRunnerPass: true, pauseResumePass: true, projectionPass: true, duplicateCount: 0, activeLeaseCount: 0, diskPass: true, batchP95Seconds: 900, uploadCalls: 0, postCalls: 0, driveCalls: 0, productionWrites: 0 });
    expect(decision).toMatchObject({ armed: true, decision: "DAILY_69_NO_UPLOAD_CONTROL_CENTER_PROVEN_AND_ARMED" });
    expect(decideDaily69Activation({ ...({ activeCount: 69, reserveCount: 14, canaryCompleted: 8, canaryTarget: 9, schedulerPass: true, controlCenterPass: true, sheetsLivePass: true, controlRunnerPass: true, pauseResumePass: true, projectionPass: true, duplicateCount: 0, activeLeaseCount: 0, diskPass: true, batchP95Seconds: 900, uploadCalls: 0, postCalls: 0, driveCalls: 0, productionWrites: 0 }) }).armed).toBe(false);
  });
});
