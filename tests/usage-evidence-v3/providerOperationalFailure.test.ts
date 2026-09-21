import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { DAILY_69_NO_UPLOAD_SETTINGS, LocalQueueRepository, runNightlyScout } from "@/lib/queue-scheduler";
import type { LiveCoupangProviderResult } from "@/lib/live-product-video";
import { makeUsageEvidenceRegistry } from "../usage-evidence/fixture";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("V3 provider operational failure budget", () => {
  test.each([401, 403, 429])("stops after one terminal HTTP %s response", async (status) => {
    const root = await mkdtemp(join(tmpdir(), "daily69-provider-terminal-"));
    roots.push(root);
    const repository = new LocalQueueRepository(root);
    await repository.writeSettings({ ...DAILY_69_NO_UPLOAD_SETTINGS, enabled: false, isPaused: true });
    const search = vi.fn(async (): Promise<LiveCoupangProviderResult> => ({
      ok: false,
      configured: true,
      blocker: `COUPANG_PARTNERS_SEARCH_HTTP_${status}`,
      products: [],
      apiCallCount: 1,
      searchApiCalled: true,
      deeplinkApiCalled: false,
      credentialsExposed: false,
      authorizationHeadersExposed: false
    }));
    const result = await runNightlyScout({
      repository,
      providerReady: true,
      search,
      usageEvidenceRegistry: makeUsageEvidenceRegistry(),
      shadowMode: true
    });
    expect(search).toHaveBeenCalledTimes(1);
    expect(result.run.metrics.apiCallCount).toBe(1);
  });
});
