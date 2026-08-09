import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { buildSafeProviderPreflight } from "@/lib/usage-evidence/liveCapacityProof";
import { DAILY_69_NO_UPLOAD_SETTINGS, LocalQueueRepository, runNightlyScout } from "@/lib/queue-scheduler";
import { makeUsageEvidenceRegistry } from "../usage-evidence/fixture";

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("V3 provider readiness", () => {
  test.each([
    [{}, "COUPANG_PARTNERS_PROVIDER_DISABLED"],
    [{ COUPANG_PARTNERS_PROVIDER_ENABLED: "true" }, "COUPANG_PARTNERS_ACCESS_KEY_MISSING"],
    [{ COUPANG_PARTNERS_PROVIDER_ENABLED: "true", COUPANG_ACCESS_KEY: "a" }, "COUPANG_PARTNERS_SECRET_KEY_MISSING"],
    [{ COUPANG_PARTNERS_PROVIDER_ENABLED: "true", COUPANG_ACCESS_KEY: "a", COUPANG_SECRET_KEY: "s" }, "COUPANG_PARTNERS_CUSTOMER_OR_PARTNER_ID_MISSING"]
  ])("fails closed with a safe exact blocker", (env, blocker) => {
    expect(buildSafeProviderPreflight(env).blocker).toBe(blocker);
  });

  test("supports authoritative alias keys", () => {
    const result = buildSafeProviderPreflight({
      COUPANG_PARTNERS_PROVIDER_ENABLED: "true",
      COUPANG_ACCESS_KEY: "access",
      COUPANG_SECRET_KEY: "secret",
      COUPANG_PARTNER_ID: "partner"
    });
    expect(result).toMatchObject({ LIVE_PROVIDER_CONFIGURED: true, request_ok: true, external_api_called: false });
  });

  test("providerReady true cannot bypass missing process env on the real provider path", async () => {
    for (const key of ["COUPANG_PARTNERS_PROVIDER_ENABLED", "COUPANG_PARTNERS_ACCESS_KEY", "COUPANG_ACCESS_KEY", "COUPANG_PARTNERS_SECRET_KEY", "COUPANG_SECRET_KEY", "COUPANG_CUSTOMER_ID", "COUPANG_PARTNER_ID", "COUPANG_PARTNERS_CUSTOMER_ID"]) vi.stubEnv(key, "");
    const root = await mkdtemp(join(tmpdir(), "daily69-provider-readiness-"));
    roots.push(root);
    const repository = new LocalQueueRepository(root);
    await repository.writeSettings({ ...DAILY_69_NO_UPLOAD_SETTINGS, enabled: false, isPaused: true });
    await expect(runNightlyScout({ repository, providerReady: true, usageEvidenceRegistry: makeUsageEvidenceRegistry(), shadowMode: true })).rejects.toThrow("COUPANG_PROVIDER_NOT_CONFIGURED");
  });
});
