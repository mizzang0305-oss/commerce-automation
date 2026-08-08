import { DEFAULT_QUEUE_SCHEDULER_SETTINGS, LocalQueueRepository } from "../../src/lib/queue-scheduler";

const repository = new LocalQueueRepository();
void repository.writeSettings({ ...DEFAULT_QUEUE_SCHEDULER_SETTINGS, enabled: true, isPaused: false }).then(() => console.log(JSON.stringify({ event: "queue_pilot_configured", enabled: true, dailyTargetCount: 9, batchSize: 3, pilotMaxDailyItems: 9, uploadEnabled: false, SAFE_TO_UPLOAD: false }))).catch((error: unknown) => { console.error(JSON.stringify({ event: "queue_pilot_configuration_failed", safeError: error instanceof Error ? error.message : "QUEUE_PILOT_CONFIGURATION_FAILED", SAFE_TO_UPLOAD: false })); process.exitCode = 1; });
