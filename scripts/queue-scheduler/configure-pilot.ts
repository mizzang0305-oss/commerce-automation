import { resolve } from "node:path";
import { DEFAULT_QUEUE_SCHEDULER_SETTINGS, LocalQueueRepository } from "../../src/lib/queue-scheduler";
import { atomicWriteJson } from "../../src/lib/queue-scheduler/atomicJson";

const fresh = process.argv.includes("--fresh");
const disable = process.argv.includes("--disable");
const base = resolve("data", "queue-scheduler-v1");
const pilotId = `pilot-${new Date().toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14)}`;
const root = fresh ? resolve(base, "pilots", pilotId) : undefined;

void (async () => {
  if (fresh && root) await atomicWriteJson(resolve(base, "active-pilot.json"), { version: "queue-pilot-pointer-v1", pilotId, root, activatedAt: new Date().toISOString(), SAFE_TO_UPLOAD: false });
  const repository = new LocalQueueRepository(root);
  await repository.writeSettings({ ...DEFAULT_QUEUE_SCHEDULER_SETTINGS, enabled: !disable, isPaused: disable });
  console.log(JSON.stringify({ event: disable ? "queue_pilot_disabled" : "queue_pilot_configured", fresh, namespace: repository.root, enabled: !disable, isPaused: disable, dailyTargetCount: 9, batchSize: 3, pilotMaxDailyItems: 9, maxProductCandidates: 3, uploadEnabled: false, SAFE_TO_UPLOAD: false }));
})().catch((error: unknown) => { console.error(JSON.stringify({ event: "queue_pilot_configuration_failed", safeError: error instanceof Error ? error.message : "QUEUE_PILOT_CONFIGURATION_FAILED", SAFE_TO_UPLOAD: false })); process.exitCode = 1; });
