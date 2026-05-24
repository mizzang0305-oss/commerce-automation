import { afterEach, describe, expect, test } from "vitest";
import { GET as getDiagnostics } from "../app/api/dev/diagnostics/route";
import { POST as resetSettings } from "../app/api/dev/reset-settings/route";
import { POST as resetStorage } from "../app/api/dev/reset-storage/route";
import { POST as seedDevQueue } from "../app/api/dev/seed/route";
import { resetMockRepositoryForTests } from "@/lib/repositories/automationRepository";
import { denyDevRouteIfDisabled, isDevRouteEnabled } from "@/lib/server/devRouteGuard";

const originalNodeEnv = process.env.NODE_ENV;
const originalEnableDevTools = process.env.ENABLE_DEV_TOOLS;
const originalSupabaseUrl = process.env.SUPABASE_URL;
const originalSupabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe("dev API production guard", () => {
  afterEach(() => {
    restoreEnv("NODE_ENV", originalNodeEnv);
    restoreEnv("ENABLE_DEV_TOOLS", originalEnableDevTools);
    restoreEnv("SUPABASE_URL", originalSupabaseUrl);
    restoreEnv("SUPABASE_SERVICE_ROLE_KEY", originalSupabaseServiceRoleKey);
    resetMockRepositoryForTests();
  });

  test("blocks mutating dev routes in production by default", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.ENABLE_DEV_TOOLS;

    const seed = await seedDevQueue(
      new Request("http://localhost/api/dev/seed", {
        method: "POST",
        body: JSON.stringify({ mode: "worker-smoke" })
      })
    );
    const resetStorageResponse = await resetStorage();
    const resetSettingsResponse = await resetSettings();

    expect(seed.status).toBe(404);
    expect(resetStorageResponse.status).toBe(404);
    expect(resetSettingsResponse.status).toBe(404);
    await expect(seed.text()).resolves.toContain("Not found.");
  });

  test("allows dev routes in production only when ENABLE_DEV_TOOLS is true", async () => {
    process.env.NODE_ENV = "production";
    process.env.ENABLE_DEV_TOOLS = "true";
    resetMockRepositoryForTests();

    const response = await seedDevQueue(
      new Request("http://localhost/api/dev/seed", {
        method: "POST",
        body: JSON.stringify({ mode: "worker-smoke" })
      })
    );

    expect(isDevRouteEnabled()).toBe(true);
    expect(denyDevRouteIfDisabled()).toBeNull();
    expect(response.status).toBe(200);
  });

  test("keeps diagnostics safe in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-secret";

    const response = await getDiagnostics();
    const payload = await response.json();
    const serialized = JSON.stringify(payload);

    expect(response.status).toBe(200);
    expect(payload.repository.supabase_url_configured).toBe(true);
    expect(payload.repository.supabase_service_role_configured).toBe(true);
    expect(serialized).not.toContain("https://project.supabase.co");
    expect(serialized).not.toContain("test-service-role-secret");
  });
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
