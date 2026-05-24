import "server-only";

import type { MutableMockAutomationRepository } from "@/lib/repositories/types";
import { createLocalJsonAutomationRepository } from "@/lib/repositories/localJsonAutomationRepository";
import { createMockAutomationRepository } from "@/lib/repositories/mockAutomationRepository";
import { createSupabaseAutomationRepository } from "@/lib/repositories/supabaseAutomationRepository";
import { getAutomationDataDir } from "@/lib/repositories/storagePaths";

export type AutomationStorageAdapter = "memory" | "local-json" | "supabase";

export type RepositoryRuntimeInfo = {
  adapter: AutomationStorageAdapter;
  dataDir?: string;
};

let runtimeInfo: RepositoryRuntimeInfo = {
  adapter: "local-json",
  dataDir: getAutomationDataDir()
};

export function createAutomationRepositoryFromEnv(): MutableMockAutomationRepository {
  const requested =
    process.env.AUTOMATION_REPOSITORY_ADAPTER ||
    process.env.AUTOMATION_STORAGE_ADAPTER ||
    "local-json";

  if (requested === "memory") {
    runtimeInfo = { adapter: "memory" };
    return createMockAutomationRepository();
  }

  if (requested === "supabase") {
    const repository = createSupabaseAutomationRepository();
    runtimeInfo = { adapter: "supabase" };
    return repository;
  }

  if (requested !== "local-json") {
    console.warn(`Unknown repository adapter "${requested}", falling back to local-json.`);
  }

  const dataDir = getAutomationDataDir();
  runtimeInfo = { adapter: "local-json", dataDir };
  return createLocalJsonAutomationRepository({ dataDir });
}

export function getRepositoryRuntimeInfo(): RepositoryRuntimeInfo {
  return { ...runtimeInfo };
}
