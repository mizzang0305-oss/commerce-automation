import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  DAILY69_MAX_PRODUCT_CANDIDATES,
  DAILY_69_NO_UPLOAD_SETTINGS,
  isOperationalReserveCandidate,
  buildOperationalReserveCoverage,
  operationalAdmissionPolicy,
  LocalQueueRepository,
  runNextBatch,
  validateSettings,
  type LocalQueueItem,
  type QueueSchedulerSettings,
  type QueueVideoResult,
  type QueueVideoRuntimeReadiness,
} from "../../src/lib/queue-scheduler";
import type { RankedLiveProduct } from "../../src/lib/live-product-video";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("Daily69 bounded candidate ladder", () => {
  it("advances a structured primary visual block to another candidate", async () => {
    const fixture = await dailyRepository(13);
    const target = fixture.items[0];
    const attempts: string[] = [];
    const result = await runNextBatch({ repository: fixture.repository, now: fixture.now, preflight: readyPreflight, executor: async ({ items }) => items.map((item) => {
      if (item.id !== target.id) return pass(item);
      attempts.push(item.productKey);
      return attempts.length === 1 ? codexBlock(item) : pass(item);
    }) });
    expect(result.run.completed).toBe(3);
    expect(attempts).toHaveLength(2);
    expect(new Set(attempts).size).toBe(2);
  });

  it("advances a terminal primary ASR failure without retrying the same product", async () => {
    const fixture = await dailyRepository(13);
    const target = fixture.items[0];
    const attempts: string[] = [];
    await runNextBatch({ repository: fixture.repository, now: fixture.now, preflight: readyPreflight, executor: async ({ items }) => items.map((item) => {
      if (item.id !== target.id) return pass(item);
      attempts.push(item.productKey);
      return attempts.length === 1 ? fail(item, "ASR_FAILED_AFTER_REPAIR") : pass(item);
    }) });
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).not.toBe(attempts[0]);
  });

  it("reaches a third candidate after two distinct terminal failures", async () => {
    const { attempts, result } = await runFailuresBeforePass(2);
    expect(result.run.completed).toBe(3);
    expect(attempts).toHaveLength(3);
    expect(new Set(attempts).size).toBe(3);
  });

  it("reaches a fourth eligible candidate after three distinct terminal failures", async () => {
    const { attempts, result } = await runFailuresBeforePass(3);
    expect(result.run.completed).toBe(3);
    expect(result.run.metrics.fallbacks).toBe(3);
    expect(attempts).toHaveLength(4);
    expect(new Set(attempts).size).toBe(4);
  });

  it("does not treat a content rejection as a transient retry", async () => {
    const fixture = await dailyRepository(13);
    const target = fixture.items[0];
    const attempts: string[] = [];
    await runNextBatch({ repository: fixture.repository, now: fixture.now, preflight: readyPreflight, executor: async ({ items }) => items.map((item) => {
      if (item.id !== target.id) return pass(item);
      attempts.push(item.productKey);
      return attempts.length === 1 ? codexBlock(item) : pass(item);
    }) });
    expect(attempts.filter((productKey) => productKey === attempts[0])).toHaveLength(1);
  });

  it("never reuses a consumed candidate or duplicates its render", async () => {
    const { attempts } = await runFailuresBeforePass(3);
    expect(attempts).toEqual([...new Set(attempts)]);
  });

  it("never submits the same immutable candidate to Codex twice", async () => {
    const fixture = await dailyRepository(14);
    const target = fixture.items[0];
    const reviews = new Map<string, number>();
    await runNextBatch({ repository: fixture.repository, now: fixture.now, preflight: readyPreflight, executor: async ({ items }) => items.map((item) => {
      if (item.id !== target.id) return pass(item);
      reviews.set(item.productKey, (reviews.get(item.productKey) ?? 0) + 1);
      return reviews.size <= 3 ? codexBlock(item) : pass(item);
    }) });
    expect([...reviews.values()].every((count) => count === 1)).toBe(true);
  });

  it("fails closed with the exact pool exhaustion code and retains the last rejection", async () => {
    const fixture = await dailyRepository(12);
    const target = fixture.items[0];
    const attempts: string[] = [];
    const result = await runNextBatch({ repository: fixture.repository, now: fixture.now, preflight: readyPreflight, executor: async ({ items }) => items.map((item) => {
      if (item.id !== target.id) return pass(item);
      attempts.push(item.productKey);
      return fail(item, "ASR_FAILED_AFTER_REPAIR");
    }) });
    expect(result.terminalResults[0].errorCode).toBe("CANDIDATE_POOL_EXHAUSTED");
    const terminal = (await fixture.repository.items()).find((item) => item.id === target.id)!;
    expect(terminal.errorCode).toBe("CANDIDATE_POOL_EXHAUSTED");
    expect(terminal.candidateHistory[terminal.candidateHistory.length - 1]).toMatchObject({ outcome: "blocked", reason: "ASR_FAILED_AFTER_REPAIR" });
    expect(attempts).toHaveLength(4);
  });

  it("preserves category caps during runtime reserve selection", async () => {
    const fixture = await dailyRepository(13);
    const candidate = fixture.reserve[0];
    candidate.candidate.category = "cap-category";
    candidate.candidate.categoryPath = "cap-category";
    const others = fixture.items.slice(1, 4);
    for (const item of others) { item.candidate.category = "cap-category"; item.candidate.categoryPath = "cap-category"; }
    expect(isOperationalReserveCandidate(candidate, { items: fixture.items, item: fixture.items[0], settings: { ...fixture.settings, maxCategoryRatio: 1 / 3 } })).toBe(false);
  });

  it("preserves family caps during runtime reserve selection", async () => {
    const fixture = await dailyRepository(13);
    const candidate = fixture.reserve[0];
    fixture.items[1].candidate.canonicalProductName = candidate.candidate.canonicalProductName;
    fixture.items[1].candidate.categoryPath = candidate.candidate.categoryPath;
    expect(isOperationalReserveCandidate(candidate, { items: fixture.items, item: fixture.items[0], settings: { ...fixture.settings, maxProductFamilyRatio: 0.1 } })).toBe(false);
  });

  it("preserves source reuse and sequence distinctness caps", async () => {
    const fixture = await dailyRepository(13);
    const candidate = fixture.reserve[0];
    const allocation = candidate.usageEvidenceAllocation!;
    for (const item of fixture.items.slice(1, 6)) item.usageEvidenceAllocation = { ...item.usageEvidenceAllocation!, assetIds: [allocation.assetIds[0]] };
    expect(isOperationalReserveCandidate(candidate, { items: fixture.items, item: fixture.items[0], settings: fixture.settings })).toBe(false);
    fixture.items[1].usageEvidenceAllocation = { ...fixture.items[1].usageEvidenceAllocation!, sequenceFingerprint: allocation.sequenceFingerprint };
    expect(isOperationalReserveCandidate(candidate, { items: fixture.items, item: fixture.items[0], settings: { ...fixture.settings, maxExactAssetReuse: 99 } })).toBe(false);
  });

  it("rejects a reserve candidate without exact materialization allocation", async () => {
    const fixture = await dailyRepository(13);
    const candidate = { ...fixture.reserve[0], usageEvidenceAllocation: undefined };
    expect(isOperationalReserveCandidate(candidate, { items: fixture.items, item: fixture.items[0], settings: fixture.settings })).toBe(false);
  });

  it("skips an affiliate-invalid candidate while retaining an operational reserve", async () => {
    const fixture = await dailyRepository(14);
    const reserve = await fixture.repository.reserveCandidates();
    const invalidKey = reserve[0].candidate.productKey;
    reserve[0].candidate.selectedAffiliateUrl = "";
    await writeFile(fixture.repository.reservePath, JSON.stringify(reserve));
    const replacement = await fixture.repository.replaceWithReserve({ id: fixture.items[0].id, reason: "ASR_FAILED_AFTER_REPAIR", now: fixture.now });
    expect(replacement).not.toBeNull();
    expect(replacement!.productKey).not.toBe(invalidKey);
  });

  it("rejects a wrong-product executor result at the runner boundary", async () => {
    const fixture = await dailyRepository(12);
    const target = fixture.items[0];
    const result = await runNextBatch({ repository: fixture.repository, now: fixture.now, preflight: readyPreflight, executor: async ({ items }) => items.map((item) => item.id === target.id ? { ...pass(item), productKey: "wrong-product" } : pass(item)) });
    expect(result.results[0]).toMatchObject({ productKey: target.productKey, passed: false, errorCode: "PRODUCT_BINDING_MISMATCH" });
    expect((await fixture.repository.items()).find((item) => item.id === target.id)).toMatchObject({ status: "blocked", productKey: target.productKey });
  });

  it("accepts a fully bound operational reserve candidate", async () => {
    const fixture = await dailyRepository(13);
    expect(isOperationalReserveCandidate(fixture.reserve[0], { items: fixture.items, item: fixture.items[0], settings: fixture.settings })).toBe(true);
  });

  it("does not weaken QA while advancing to a different candidate", async () => {
    const fixture = await dailyRepository(13);
    const target = fixture.items[0];
    let targetCalls = 0;
    const result = await runNextBatch({ repository: fixture.repository, now: fixture.now, preflight: readyPreflight, executor: async ({ items }) => items.map((item) => {
      if (item.id !== target.id) return pass(item);
      targetCalls += 1;
      return targetCalls === 1 ? fail(item, "VIDEO_AUTO_QA_FAILED_AFTER_REPAIR") : pass(item);
    }) });
    expect(result.results[0]).toMatchObject({ passed: false, errorCode: "VIDEO_AUTO_QA_FAILED_AFTER_REPAIR" });
    expect(result.terminalResults[0]).toMatchObject({ passed: true });
    expect(result.results[0].productKey).not.toBe(result.terminalResults[0].productKey);
  });

  it("enforces a deterministic finite ladder budget", async () => {
    const fixture = await dailyRepository(16);
    const queue = JSON.parse(await readFile(fixture.repository.queuePath, "utf8")) as LocalQueueItem[];
    queue[0].maxProductCandidates = 4;
    await writeFile(fixture.repository.queuePath, JSON.stringify(queue));
    const targetId = queue[0].id;
    const attempts: string[] = [];
    const result = await runNextBatch({ repository: fixture.repository, now: fixture.now, preflight: readyPreflight, executor: async ({ items }) => items.map((item) => {
      if (item.id !== targetId) return pass(item);
      attempts.push(item.productKey);
      return fail(item, "ASR_FAILED_AFTER_REPAIR");
    }) });
    expect(attempts).toHaveLength(4);
    expect(result.terminalResults[0].errorCode).toBe("CANDIDATE_LADDER_LIMIT_REACHED");
  });

  it("keeps pilot budget at three while Daily69 uses primary plus fourteen reserves", () => {
    expect(DAILY69_MAX_PRODUCT_CANDIDATES).toBe(15);
    expect(validateSettings({ ...DAILY_69_NO_UPLOAD_SETTINGS, maxProductCandidates: 3 })).toBeTruthy();
    expect(() => validateSettings({ ...DAILY_69_NO_UPLOAD_SETTINGS, maxProductCandidates: 14 })).toThrow("PRODUCT_CANDIDATE_LIMIT_INVALID");
  });
});

async function runFailuresBeforePass(failures: number) {
  const fixture = await dailyRepository(16);
  const target = fixture.items[0];
  const attempts: string[] = [];
  const result = await runNextBatch({ repository: fixture.repository, now: fixture.now, preflight: readyPreflight, executor: async ({ items }) => items.map((item) => {
    if (item.id !== target.id) return pass(item);
    attempts.push(item.productKey);
    return attempts.length <= failures ? fail(item, attempts.length % 2 === 0 ? "ASR_FAILED_AFTER_REPAIR" : "CODEX_VISUAL_REVIEW_BLOCKED") : pass(item);
  }) });
  return { attempts, result };
}

async function dailyRepository(count: number) {
  const root = await mkdtemp(join(tmpdir(), "daily69-candidate-ladder-"));
  roots.push(root);
  const repository = new LocalQueueRepository(root);
  const settings: QueueSchedulerSettings = { ...DAILY_69_NO_UPLOAD_SETTINGS, dailyTargetCount: 9, pilotMaxDailyItems: 9, processingDailyCap: 9, minimumReserveCount: 0, maxCategoryRatio: 1, maxProductFamilyRatio: 1, enabled: true, isPaused: false };
  await repository.writeSettings(settings);
  const values = ranked(count);
  const allocations = values.map((entry, index) => ({ productKey: entry.candidate.productKey, useCase: entry.candidate.useCase, packId: `pack-${index}`, assetIds: [`asset-${index}`], sequenceFingerprint: `sequence-${index}`, sourceIds: [`source-${index}`] }));
  const operationalCoverage = buildOperationalReserveCoverage({ items: [], reserve: [], directSlots: [], policy: operationalAdmissionPolicy(settings, 15) });
  await repository.insertRanked({ ranked: values, queueDate: "2026-09-10", now: new Date("2026-09-10T00:00:00.000Z"), dueNow: true, capacityPlan: { active: values.slice(0, 9), reserve: values.slice(9), allocations, operationalCoverage, diagnostics: {} as never } });
  return { repository, settings, now: new Date("2026-09-10T00:00:01.000Z"), items: await repository.items(), reserve: await repository.reserveCandidates() };
}

function pass(item: LocalQueueItem): QueueVideoResult { return { queueId: item.id, productKey: item.productKey, passed: true, errorCode: "", finalVideo: `${item.id}.mp4`, reviewPath: "review.json", creativeScore: 90, videoQualityScore: 92, retryable: false }; }
function fail(item: LocalQueueItem, errorCode: string): QueueVideoResult { return { ...pass(item), passed: false, errorCode, finalVideo: "", reviewPath: "" }; }
function codexBlock(item: LocalQueueItem): QueueVideoResult { return { ...pass(item), codexReview: { status: "block", errorCode: "", retryable: false, attempts: 1, deduplicated: false, receiptPath: "receipt.json", evidence: { hardBlockers: ["SEVERE_PRODUCT_CROP"] } as never } }; }
async function readyPreflight(): Promise<QueueVideoRuntimeReadiness> { return { ready: true, assetRoot: true, python: true, pythonVersion: "Python 3", whisperXRuntime: true, ttsCommand: true, asrPython: true, asrScript: true, asrModel: true, ffmpeg: true, ffprobe: true, diskSpace: true, durationMs: 1, blockers: [], configured: { assetRoot: true, python: true, ttsCommand: true, asrPython: true, asrScript: true, asrModel: true }, SAFE_TO_UPLOAD: false }; }

function ranked(count: number): RankedLiveProduct[] {
  return Array.from({ length: count }, (_, index) => ({
    candidate: { candidateId: `candidate-${index}`, productKey: `product-${index}`, rawProductId: `${index}`, rawProductName: `상품 ${index}`, canonicalProductName: `상품 ${index}`, productAliases: [`상품${index}`], productAnchors: [`상품${index}`, "정리"], useCase: index % 3 === 0 ? "vehicle_organization" : index % 3 === 1 ? "desk_organization" : "laundry_drying", category: `생활-${index}`, categoryPath: `생활-${index}`, priceText: "10000", rawProductUrl: `https://www.coupang.com/vp/products/${index}`, selectedAffiliateUrl: `https://link.coupang.com/a/${index}`, productImageUrls: [`https://image.example/${index}.jpg`], sourceProvider: "coupang_partners_product_search", sourceRequestId: `request-${index}`, discoveredAt: "2026-09-10T00:00:00.000Z", sourceKeyword: "정리", eventContext: { eventId: "event", eventName: "event" } },
    score: { productKey: `product-${index}`, eventRelevanceScore: 20, motionSuitabilityScore: 20, policySafetyScore: 20, imageReadinessScore: 10, affiliateReadinessScore: 10, duplicatePenalty: 0, usageEvidenceScore: 10, finalProductScore: 90 - index, selectionRank: index + 1, eligible: true, blockers: [] },
  }));
}
