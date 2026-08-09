import { resolve } from "node:path";
import { LocalQueueRepository } from "../../src/lib/queue-scheduler";

void (async () => {
  const root = resolve(requiredEnv("QUEUE_SCHEDULER_ROOT"));
  const repository = new LocalQueueRepository(root);
  const settings = await repository.settings();
  await repository.writeSettings({ ...settings, enabled: false, isPaused: true, uploadEnabled: false });
  process.stdout.write(`${JSON.stringify({ event: "daily69_first_operation_emergency_paused", enabled: false, isPaused: true, SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 })}\n`);
})().catch(() => { process.stderr.write(`${JSON.stringify({ event: "daily69_first_operation_emergency_pause_failed", safeError: "EMERGENCY_PAUSE_FAILED", SAFE_TO_UPLOAD: false })}\n`); process.exitCode = 1; });

function requiredEnv(name: string) { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name}_MISSING`); return value; }
