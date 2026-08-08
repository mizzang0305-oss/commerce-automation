import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { acquireProcessLock, DEFAULT_QUEUE_SCHEDULER_SETTINGS, LocalQueueRepository, runNextBatch } from "../../src/lib/queue-scheduler";
import type { RankedLiveProduct } from "../../src/lib/live-product-video";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));
async function repository(enabled = true, paused = false) { const root = await mkdtemp(join(tmpdir(), "queue-runner-")); roots.push(root); const repo = new LocalQueueRepository(root); await repo.writeSettings({ ...DEFAULT_QUEUE_SCHEDULER_SETTINGS, enabled, isPaused: paused, minimumFreeGb: 0 }); return repo; }

describe("queue batch runner", () => {
  it.each([[false, false, "QUEUE_SCHEDULER_DISABLED"], [true, true, "QUEUE_SCHEDULER_PAUSED"]] as const)("disabled/paused is a no-op", async (enabled, paused, expected) => { const result = await runNextBatch({ repository: await repository(enabled, paused) }); expect(result.run.safeMessage).toBe(expected); expect(result.results).toHaveLength(0); });
  it("continues a batch when one item fails and preserves 3-item claim", async () => { const repo = await repository(); const now = new Date(); await repo.insertRanked({ ranked: ranked(9), queueDate: kst(now), now, dueNow: true }); const result = await runNextBatch({ repository: repo, now, executor: async ({ items }) => items.map((item, index) => ({ queueId: item.id, productKey: item.productKey, passed: index !== 0, errorCode: index === 0 ? "ASR_FAILED" : "", finalVideo: index === 0 ? "" : `${item.id}.mp4`, reviewPath: "review.json", creativeScore: 90, videoQualityScore: 92, retryable: false })) }); expect(result.run.claimed).toBe(3); expect(result.run.completed).toBe(2); expect(result.run.failed).toBe(1); expect(result.run.status).toBe("partial"); });
  it("returns overlap safe no-op", async () => { const repo = await repository(); const release = await acquireProcessLock(join(repo.root, "runner.lock"), "other", 60_000); try { const result = await runNextBatch({ repository: repo }); expect(result.run.safeMessage).toBe("SCHEDULER_ALREADY_RUNNING"); } finally { await release(); } });
});
function kst(date: Date) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(date); }
function ranked(count: number): RankedLiveProduct[] { return Array.from({ length: count }, (_, i) => ({ candidate: { candidateId: `c${i}`, productKey: `p${i}`, rawProductId: `${i}`, rawProductName: `상품${i}`, canonicalProductName: `상품${i}`, productAliases: [], productAnchors: [`상품${i}`, "정리"], useCase: i % 3 === 0 ? "vehicle_organization" : i % 3 === 1 ? "desk_organization" : "laundry_drying", category: "생활", categoryPath: "생활", priceText: "1", rawProductUrl: `https://www.coupang.com/${i}`, selectedAffiliateUrl: `https://link.coupang.com/${i}`, productImageUrls: [`https://image/${i}`], sourceProvider: "coupang_partners_product_search", sourceRequestId: `r${i}`, discoveredAt: new Date().toISOString(), sourceKeyword: "정리", eventContext: { eventId: "e", eventName: "e" } }, score: { productKey: `p${i}`, eventRelevanceScore: 1, motionSuitabilityScore: 1, policySafetyScore: 1, imageReadinessScore: 1, affiliateReadinessScore: 1, duplicatePenalty: 0, usageEvidenceScore: 1, finalProductScore: 90, selectionRank: i + 1, eligible: true, blockers: [] } })); }
