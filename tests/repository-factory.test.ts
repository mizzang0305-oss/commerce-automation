import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createAutomationRepositoryFromEnv,
  getRepositoryRuntimeInfo
} from "@/lib/repositories/repositoryFactory";

let oldAdapter: string | undefined;
let oldRepositoryAdapter: string | undefined;
let oldDataDir: string | undefined;
let oldSupabaseUrl: string | undefined;
let oldSupabaseServiceRoleKey: string | undefined;
let dataDir = "";

beforeEach(async () => {
  oldAdapter = process.env.AUTOMATION_STORAGE_ADAPTER;
  oldRepositoryAdapter = process.env.AUTOMATION_REPOSITORY_ADAPTER;
  oldDataDir = process.env.AUTOMATION_DATA_DIR;
  oldSupabaseUrl = process.env.SUPABASE_URL;
  oldSupabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  dataDir = await mkdtemp(join(tmpdir(), "commerce-factory-"));
  process.env.AUTOMATION_DATA_DIR = dataDir;
  delete process.env.AUTOMATION_STORAGE_ADAPTER;
  delete process.env.AUTOMATION_REPOSITORY_ADAPTER;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

afterEach(async () => {
  restoreEnv("AUTOMATION_STORAGE_ADAPTER", oldAdapter);
  restoreEnv("AUTOMATION_REPOSITORY_ADAPTER", oldRepositoryAdapter);
  restoreEnv("AUTOMATION_DATA_DIR", oldDataDir);
  restoreEnv("SUPABASE_URL", oldSupabaseUrl);
  restoreEnv("SUPABASE_SERVICE_ROLE_KEY", oldSupabaseServiceRoleKey);
  await rm(dataDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("repositoryFactory", () => {
  test("uses memory adapter when requested", async () => {
    process.env.AUTOMATION_STORAGE_ADAPTER = "memory";

    const repository = createAutomationRepositoryFromEnv();
    const info = getRepositoryRuntimeInfo();

    expect(info.adapter).toBe("memory");
    await expect(repository.getQueue()).resolves.toHaveLength(69);
  });

  test("uses local-json adapter when requested", async () => {
    process.env.AUTOMATION_STORAGE_ADAPTER = "local-json";

    const repository = createAutomationRepositoryFromEnv();
    const info = getRepositoryRuntimeInfo();

    expect(info.adapter).toBe("local-json");
    expect(info.dataDir).toBe(dataDir);
    await expect(repository.getSettings()).resolves.toMatchObject({ daily_target_count: 69 });
  });

  test("falls back to local-json for unknown adapter and warns", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    process.env.AUTOMATION_STORAGE_ADAPTER = "mystery";

    createAutomationRepositoryFromEnv();
    const info = getRepositoryRuntimeInfo();

    expect(info.adapter).toBe("local-json");
    expect(warn).toHaveBeenCalled();
  });

  test("supports supabase adapter selection through repository env", () => {
    process.env.AUTOMATION_REPOSITORY_ADAPTER = "supabase";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";

    createAutomationRepositoryFromEnv();
    const info = getRepositoryRuntimeInfo();

    expect(info.adapter).toBe("supabase");
    expect(info.dataDir).toBeUndefined();
  });

  test("supports supabase adapter selection through legacy storage env", () => {
    process.env.AUTOMATION_STORAGE_ADAPTER = "supabase";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";

    createAutomationRepositoryFromEnv();
    const info = getRepositoryRuntimeInfo();

    expect(info.adapter).toBe("supabase");
  });

  test("throws a safe error when supabase adapter is selected without server credentials", () => {
    process.env.AUTOMATION_REPOSITORY_ADAPTER = "supabase";

    expect(() => createAutomationRepositoryFromEnv()).toThrow(
      "Supabase repository adapter requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server."
    );
  });
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
