import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { LocalQueueRepository, DEFAULT_QUEUE_SCHEDULER_SETTINGS } from "../../src/lib/queue-scheduler";
import type { RankedLiveProduct } from "../../src/lib/live-product-video";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function setup() { const root = await mkdtemp(join(tmpdir(), "queue-scheduler-")); roots.push(root); const repository = new LocalQueueRepository(root); await repository.writeSettings({ ...DEFAULT_QUEUE_SCHEDULER_SETTINGS, enabled: true }); return repository; }

describe("local durable queue", () => {
  it("creates exactly 9 atomically and makes a duplicate nightly run idempotent", async () => {
    const repository = await setup(); const now = new Date("2026-08-08T00:00:00Z");
    const first = await repository.insertRanked({ ranked: ranked(12), queueDate: "2026-08-08", now, dueNow: true });
    const second = await repository.insertRanked({ ranked: ranked(12), queueDate: "2026-08-08", now, dueNow: true });
    expect(first.queued).toHaveLength(9); expect(new Set(first.queued.map((item) => item.productKey)).size).toBe(9); expect(second.queued).toHaveLength(0);
    expect(await repository.items()).toHaveLength(9);
    expect((await readdir(repository.root)).some((name) => name.endsWith(".tmp"))).toBe(false);
    expect(JSON.parse(await readFile(repository.queuePath, "utf8"))).toHaveLength(9);
  });

  it("blocks normalized same-day duplicates", async () => {
    const repository = await setup(); const values = ranked(10); values[1].candidate.canonicalProductName = "상품 0";
    const result = await repository.insertRanked({ ranked: values, queueDate: "2026-08-08", now: new Date(), dueNow: true });
    expect(result.queued).toHaveLength(9); expect(result.duplicateSkipped).toBeGreaterThan(0);
  });

  it("claims at most 3 due items and never claims future or completed items", async () => {
    const repository = await setup(); const now = new Date("2026-08-08T00:00:00Z");
    await repository.insertRanked({ ranked: ranked(9), queueDate: "2026-08-08", now, dueNow: true });
    const first = await repository.claimDue({ now, runId: "r1", limit: 3, leaseMinutes: 10, pilotMax: 9 }); expect(first).toHaveLength(3);
    for (const item of first) await repository.complete({ id: item.id, videoPath: "x.mp4", reviewPath: "review.json", creativeScore: 90, videoQualityScore: 90, now });
    const second = await repository.claimDue({ now, runId: "r2", limit: 3, leaseMinutes: 10, pilotMax: 9 }); expect(second).toHaveLength(3); expect(second.some((item) => first.some((done) => done.id === item.id))).toBe(false);
    const items = await repository.items(); items.find((item) => item.status === "scheduled")!.scheduledAt = new Date(now.getTime() + 60_000).toISOString(); await writeFile(repository.queuePath, JSON.stringify(items));
    const third = await repository.claimDue({ now, runId: "r3", limit: 9, leaseMinutes: 10, pilotMax: 9 }); expect(third).toHaveLength(2);
  });

  it("recovers stale leases and enforces max two attempts", async () => {
    const repository = await setup(); const now = new Date("2026-08-08T00:00:00Z"); await repository.insertRanked({ ranked: ranked(9), queueDate: "2026-08-08", now, dueNow: true });
    const [item] = await repository.claimDue({ now, runId: "stale", limit: 1, leaseMinutes: 1, pilotMax: 9 });
    expect(await repository.recoverStale(new Date(now.getTime() + 120_000))).toBe(1);
    const reclaimed = await repository.claimDue({ now: new Date(now.getTime() + 120_000), runId: "retry", limit: 1, leaseMinutes: 1, pilotMax: 9 }); expect(reclaimed[0].id).toBe(item.id);
    const status = await repository.fail({ id: item.id, code: "TEMPORARY_SUBPROCESS_FAILURE", retryable: true, now, settings: await repository.settings() }); expect(status).toBe("failed");
  });
});

function ranked(count: number): RankedLiveProduct[] { return Array.from({ length: count }, (_, index) => ({ candidate: { candidateId: `candidate-${index}`, productKey: `product-${index}`, rawProductId: `${index}`, rawProductName: `상품 ${index}`, canonicalProductName: `상품 ${index}`, productAliases: [`상품${index}`], productAnchors: [`상품${index}`, "정리"], useCase: index % 3 === 0 ? "vehicle_organization" : index % 3 === 1 ? "desk_organization" : "laundry_drying", category: "생활", categoryPath: "생활", priceText: "10000", rawProductUrl: `https://www.coupang.com/vp/products/${index}`, selectedAffiliateUrl: `https://link.coupang.com/a/${index}`, productImageUrls: [`https://image.example/${index}.jpg`], sourceProvider: "coupang_partners_product_search", sourceRequestId: `request-${index}`, discoveredAt: new Date().toISOString(), sourceKeyword: "정리", eventContext: { eventId: "event", eventName: "event" } }, score: { productKey: `product-${index}`, eventRelevanceScore: 20, motionSuitabilityScore: 20, policySafetyScore: 20, imageReadinessScore: 10, affiliateReadinessScore: 10, duplicatePenalty: 0, usageEvidenceScore: 10, finalProductScore: 90 - index, selectionRank: index + 1, eligible: true, blockers: [] } })); }
