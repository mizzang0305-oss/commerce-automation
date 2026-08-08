import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test, vi } from "vitest";
import { DAILY_69_NO_UPLOAD_SETTINGS, LocalQueueRepository, runNightlyScout } from "@/lib/queue-scheduler";
import type { LiveCoupangProviderResult } from "@/lib/live-product-video";
import { makeUsageEvidenceRegistry } from "../usage-evidence/fixture";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("bounded adaptive nightly scout", () => {
  test("fills 69 plus reserve within provider/raw caps and makes the second scout a zero-call no-op", async () => {
    const root = await mkdtemp(join(tmpdir(), "daily69-scout-")); roots.push(root); const repository = new LocalQueueRepository(root);
    await repository.writeSettings({ ...DAILY_69_NO_UPLOAD_SETTINGS, enabled: false, isPaused: true });
    let sequence = 0;
    const search = vi.fn(async ({ context, limit }: Parameters<NonNullable<Parameters<typeof runNightlyScout>[0]["search"]>>[0]): Promise<LiveCoupangProviderResult> => {
      const products = Array.from({ length: limit }, () => {
        const index = sequence++;
        const useCase = /차량|자동차|차박/u.test(context.keyword) ? "차량" : /책상|데스크|선|케이블/u.test(context.keyword) ? "책상" : "빨래건조대";
        const category = useCase === "차량" ? "자동차용품" : useCase === "책상" ? "생활용품" : "가구";
        return { rawProductId: `${900000 + index}`, rawProductName: `${context.keyword} ${index}`, category, categoryPath: `${category}>상품군${index}`, priceText: "12900", rawProductUrl: `https://www.coupang.com/vp/products/${900000 + index}`, selectedAffiliateUrl: `https://link.coupang.com/a/daily69${index}`, productImageUrls: [`https://image.coupangcdn.com/image/daily69-${index}.jpg`], sourceProvider: "coupang_partners_product_search" as const, sourceRequestId: `request-${index}`, discoveredAt: "2026-08-09T00:00:00.000Z", sourceKeyword: context.keyword, eventContext: { eventId: context.eventId, eventName: context.eventName } };
      });
      return { ok: true, configured: true, blocker: null, products, apiCallCount: 2, searchApiCalled: true, deeplinkApiCalled: true, credentialsExposed: false, authorizationHeadersExposed: false };
    });
    const now = new Date("2026-08-09T00:00:00.000Z");
    const usageEvidenceRegistry = makeUsageEvidenceRegistry({ packsPerUseCase: 4 });
    const first = await runNightlyScout({ repository, now, dueNow: true, providerReady: true, search, usageEvidenceRegistry, shadowMode: true });
    expect(first.queued, JSON.stringify(first.run.metrics)).toHaveLength(69); expect(first.run.status).toBe("success"); expect(Number(first.run.metrics.reserveCount)).toBeGreaterThanOrEqual(14);
    expect(Number(first.run.metrics.apiCallCount)).toBeLessThanOrEqual(30); expect(Number(first.run.metrics.discovered)).toBeLessThanOrEqual(240); expect(search.mock.calls.length).toBeLessThanOrEqual(15);
    search.mockClear();
    const second = await runNightlyScout({ repository, now, providerReady: true, search, usageEvidenceRegistry, shadowMode: true });
    expect(second.run.safeMessage).toBe("DAILY_QUEUE_ALREADY_FILLED"); expect(second.run.metrics.apiCallCount).toBe(0); expect(search).not.toHaveBeenCalled();
    await expect(repository.settings()).resolves.toMatchObject({ enabled: false, isPaused: true });
  });
});
