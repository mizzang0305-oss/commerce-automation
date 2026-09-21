import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { closeoutFirstOperation } from "../../src/lib/daily69-first-operation";
import { bindRetainedTaskEvents } from "../../src/lib/daily69-first-operation/postCloseout";
import type { SanitizedTaskSchedulerEvent } from "../../src/lib/daily69-first-operation/taskProvenance";
import { queryOperationalLog } from "./bind-task-events";

type CloseoutResult = { completion: "PASS" | "PENDING" | "FAILED"; [key: string]: unknown };

export async function finalizeNaturalCloseout(operationRoot: string, dependencies: {
  collectEvents?: () => Promise<SanitizedTaskSchedulerEvent[]>;
  closeout?: (root: string) => Promise<CloseoutResult>;
  attempts?: number;
  intervalMs?: number;
  wait?: (milliseconds: number) => Promise<void>;
} = {}) {
  const root = resolve(operationRoot);
  const attempts = Math.max(1, dependencies.attempts ?? 60);
  const intervalMs = Math.max(0, dependencies.intervalMs ?? 5_000);
  const wait = dependencies.wait ?? ((milliseconds: number) => new Promise<void>((resolvePromise) => setTimeout(resolvePromise, milliseconds)));
  let binding: Awaited<ReturnType<typeof bindRetainedTaskEvents>> | null = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const events = await (dependencies.collectEvents ?? (() => queryOperationalLog(root)))();
    binding = await bindRetainedTaskEvents(root, events);
    if (binding.terminalFailures.length > 0) throw new Error(binding.terminalFailures[0].safeError || "DAILY69_TASK_TERMINAL_FAILED");
    if (binding.malformedReceipts === 0 && binding.unproven === 0 && binding.bound + binding.alreadyBound === binding.receipts) break;
    if (attempt < attempts) await wait(intervalMs);
  }
  if (!binding || binding.malformedReceipts > 0 || binding.unproven > 0 || binding.bound + binding.alreadyBound !== binding.receipts) {
    throw new Error("DAILY69_TASK_EVENTS_PENDING");
  }
  const closeout = await (dependencies.closeout ?? closeoutFirstOperation)(root);
  return { binding, closeout, completion: closeout.completion, SAFE_TO_UPLOAD: false as const, PLATFORM_UPLOAD: 0 as const };
}

async function main() {
  const operationRoot = resolve(requiredRoot());
  const eventsPath = optionalArg("--events");
  const fixedEvents = eventsPath ? await readEvents(resolve(eventsPath)) : null;
  const result = await finalizeNaturalCloseout(operationRoot, fixedEvents ? { collectEvents: async () => fixedEvents, attempts: 1 } : {});
  process.stdout.write(`${JSON.stringify({ event: "daily69_natural_closeout_finalized", ...result })}\n`);
  if (result.completion !== "PASS") process.exitCode = result.completion === "PENDING" ? 2 : 3;
}

async function readEvents(path: string): Promise<SanitizedTaskSchedulerEvent[]> {
  const value = JSON.parse(await readFile(path, "utf8")) as { events?: SanitizedTaskSchedulerEvent[] } | SanitizedTaskSchedulerEvent[];
  const events = Array.isArray(value) ? value : value.events;
  if (!Array.isArray(events)) throw new Error("TASK_SCHEDULER_OPERATIONAL_EVENTS_INVALID");
  return events;
}

function requiredRoot() {
  const value = optionalArg("--queue-root") ?? process.env.QUEUE_SCHEDULER_ROOT;
  if (!value) throw new Error("FIRST_OPERATION_QUEUE_ROOT_MISSING");
  return value;
}

function optionalArg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function safeError(error: unknown) {
  const value = error instanceof Error ? error.message : String(error);
  return /^[A-Z0-9_:-]+$/u.test(value) ? value : "DAILY69_NATURAL_CLOSEOUT_FINALIZER_FAILED";
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error: unknown) => {
    const code = safeError(error);
    process.stderr.write(`${JSON.stringify({ event: "daily69_natural_closeout_finalizer_failed", safeError: code, SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 })}\n`);
    process.exitCode = code === "DAILY69_TASK_EVENTS_PENDING" ? 2 : 3;
  });
}
