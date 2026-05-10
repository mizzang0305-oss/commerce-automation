import "server-only";

import type { MutableMockAutomationRepository } from "@/lib/repositories/types";
import { createLocalJsonAutomationRepository } from "@/lib/repositories/localJsonAutomationRepository";
import { createMockAutomationRepository } from "@/lib/repositories/mockAutomationRepository";
import { getAutomationDataDir } from "@/lib/repositories/storagePaths";

export type AutomationStorageAdapter = "memory" | "local-json";

export type RepositoryRuntimeInfo = {
  adapter: AutomationStorageAdapter;
  dataDir?: string;
};

let runtimeInfo: RepositoryRuntimeInfo = {
  adapter: "local-json",
  dataDir: getAutomationDataDir()
};

export function createAutomationRepositoryFromEnv(): MutableMockAutomationRepository {
  const requested = process.env.AUTOMATION_STORAGE_ADAPTER || "local-json";

  if (requested === "memory") {
    runtimeInfo = { adapter: "memory" };
    return createMockAutomationRepository();
  }

  if (requested !== "local-json") {
    console.warn(`Unknown AUTOMATION_STORAGE_ADAPTER "${requested}", falling back to local-json.`);
  }

  const dataDir = getAutomationDataDir();
  runtimeInfo = { adapter: "local-json", dataDir };
  return createLocalJsonAutomationRepository({ dataDir });
}

export function getRepositoryRuntimeInfo(): RepositoryRuntimeInfo {
  return { ...runtimeInfo };
}
