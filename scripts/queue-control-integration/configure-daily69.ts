import { resolve } from "node:path";
import { DAILY_69_NO_UPLOAD_SETTINGS, LocalQueueRepository } from "../../src/lib/queue-scheduler";
import { atomicWriteJson } from "../../src/lib/queue-scheduler/atomicJson";

const operational = process.argv.includes("--operational");
const enabled = process.argv.includes("--enable");
const dueNow = process.argv.includes("--due-now");
const timestamp = new Date().toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14);
const base = resolve("data", "queue-scheduler-v1");
const requestedNamespace = process.env.QUEUE_CONTROL_NAMESPACE?.trim() ?? "";
if (requestedNamespace && !/^[A-Za-z0-9_-]{1,96}$/u.test(requestedNamespace)) throw new Error("QUEUE_CONTROL_NAMESPACE_INVALID");
const namespace = requestedNamespace || (operational ? `operational-${kstTomorrow()}` : `daily69-canary-${timestamp}`);
const root = process.env.QUEUE_SCHEDULER_ROOT?.trim() ? resolve(process.env.QUEUE_SCHEDULER_ROOT) : resolve(base, operational ? "operational" : "canaries", namespace);

void (async () => {
  const repository = new LocalQueueRepository(root);
  await repository.writeSettings({ ...DAILY_69_NO_UPLOAD_SETTINGS, enabled, isPaused: !enabled });
  await atomicWriteJson(resolve(base, operational ? "active-operational.json" : "active-daily69-canary.json"), { version: "daily69-pointer-v1", namespace, root, activatedAt: new Date().toISOString(), dueNow, SAFE_TO_UPLOAD: false });
  process.stdout.write(`${JSON.stringify({ event: "daily69_configured", namespace, enabled, paused: !enabled, dailyTargetCount: 69, reserveMinimum: 14, processingDailyCap: 9, batchSize: 3, uploadEnabled: false, SAFE_TO_UPLOAD: false })}\n`);
})().catch((error: unknown) => { process.stderr.write(`${JSON.stringify({ event: "daily69_configuration_failed", safeError: safeError(error), SAFE_TO_UPLOAD: false })}\n`); process.exitCode = 1; });

function kstTomorrow() { const value = new Date(Date.now() + 24 * 60 * 60_000); return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(value).replace(/-/gu, ""); }
function safeError(error: unknown) { const value = error instanceof Error ? error.message : String(error); return /^[A-Z0-9_:-]+$/u.test(value) ? value : "DAILY69_CONFIGURATION_FAILED"; }
