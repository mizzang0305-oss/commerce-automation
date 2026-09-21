import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { classifyTaskInvocationProvenance, type SanitizedTaskSchedulerEvent } from "../../src/lib/daily69-first-operation/taskProvenance";

async function main() {
  const eventsPath = resolve(requiredArg("--events"));
  const taskName = requiredArg("--task-name");
  const parsed = JSON.parse(await readFile(eventsPath, "utf8")) as { events?: SanitizedTaskSchedulerEvent[] } | SanitizedTaskSchedulerEvent[];
  const events = Array.isArray(parsed) ? parsed : parsed.events;
  if (!Array.isArray(events)) throw new Error("TASK_PROVENANCE_EVENTS_INVALID");
  const result = classifyTaskInvocationProvenance({ taskName, events });
  process.stdout.write(`${JSON.stringify({ event: "daily69_task_provenance_classified", ...result, SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 })}\n`);
  if (result.classification !== "natural_scheduled") process.exitCode = 3;
}

function requiredArg(name: string) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : "";
  if (!value) throw new Error(`MISSING_ARGUMENT_${name.replace(/^-+/u, "").toUpperCase()}`);
  return value;
}
void main().catch((error: unknown) => {
  const value = error instanceof Error ? error.message : String(error);
  const safeError = /^[A-Z0-9_:-]+$/u.test(value) ? value : "TASK_PROVENANCE_CLASSIFICATION_FAILED";
  process.stderr.write(`${JSON.stringify({ event: "daily69_task_provenance_failed", safeError, SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 })}\n`);
  process.exitCode = 3;
});
