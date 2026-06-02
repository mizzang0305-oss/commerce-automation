import { resolve } from "node:path";

export type AutomationStoragePaths = {
  dataDir: string;
  settings: string;
  queue: string;
  contents: string;
  runs: string;
  workerJobs: string;
  workerHeartbeats: string;
  productCandidates: string;
  productionHistory: string;
  productAssets: string;
  channelUploadPackages: string;
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
    runs: resolve(dataDir, "runs.json"),
    workerJobs: resolve(dataDir, "worker_jobs.json"),
    workerHeartbeats: resolve(dataDir, "worker_heartbeats.json"),
    productCandidates: resolve(dataDir, "product_candidates.json"),
    productionHistory: resolve(dataDir, "production_history.json"),
    productAssets: resolve(dataDir, "product_assets.json"),
    channelUploadPackages: resolve(dataDir, "channel_upload_packages.json")
  };
}
