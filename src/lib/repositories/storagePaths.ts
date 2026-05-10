import { resolve } from "node:path";

export type AutomationStoragePaths = {
  dataDir: string;
  settings: string;
  queue: string;
  contents: string;
  runs: string;
};

export function getAutomationDataDir(input = process.env.AUTOMATION_DATA_DIR): string {
  return resolve(/* turbopackIgnore: true */ process.cwd(), input || "./data");
}

export function getStoragePaths(dataDir = getAutomationDataDir()): AutomationStoragePaths {
  return {
    dataDir,
    settings: resolve(dataDir, "settings.json"),
    queue: resolve(dataDir, "queue.json"),
    contents: resolve(dataDir, "contents.json"),
    runs: resolve(dataDir, "runs.json")
  };
}
