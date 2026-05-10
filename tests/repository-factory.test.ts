import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createAutomationRepositoryFromEnv,
  getRepositoryRuntimeInfo
} from "@/lib/repositories/repositoryFactory";

let oldAdapter: string | undefined;
let oldDataDir: string | undefined;
let dataDir = "";

beforeEach(async () => {
  oldAdapter = process.env.AUTOMATION_STORAGE_ADAPTER;
  oldDataDir = process.env.AUTOMATION_DATA_DIR;
  dataDir = await mkdtemp(join(tmpdir(), "commerce-factory-"));
  process.env.AUTOMATION_DATA_DIR = dataDir;
});

afterEach(async () => {
  process.env.AUTOMATION_STORAGE_ADAPTER = oldAdapter;
  process.env.AUTOMATION_DATA_DIR = oldDataDir;
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
});
