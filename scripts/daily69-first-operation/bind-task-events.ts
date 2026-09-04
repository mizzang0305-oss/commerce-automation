import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { finalizerExecutionTimeBounds, FINALIZER_TASK_NAME } from "../../src/lib/daily69-first-operation/finalizerResult";
import { bindRetainedTaskEvents, retainedExecutionTimeBounds } from "../../src/lib/daily69-first-operation/postCloseout";
import type { SanitizedTaskSchedulerEvent } from "../../src/lib/daily69-first-operation/taskProvenance";

const execute = promisify(execFile);

async function main() {
  const operationRoot = resolve(requiredRoot());
  const eventsPath = optionalArg("--events");
  const events = eventsPath ? await readSanitizedEvents(resolve(eventsPath)) : await queryOperationalLog(operationRoot);
  const result = await bindRetainedTaskEvents(operationRoot, events);
  process.stdout.write(`${JSON.stringify({ event: "daily69_task_events_bound", ...result })}\n`);
  if (result.malformedReceipts > 0 || result.unproven > 0 || result.bound + result.alreadyBound !== result.receipts) process.exitCode = 2;
}

export async function queryOperationalLog(operationRoot: string, options: { finalizerOnly?: boolean } = {}): Promise<SanitizedTaskSchedulerEvent[]> {
  if (process.platform !== "win32") throw new Error("TASK_SCHEDULER_OPERATIONAL_LOG_WINDOWS_ONLY");
  const bounds = await (options.finalizerOnly ? finalizerExecutionTimeBounds(operationRoot) : retainedExecutionTimeBounds(operationRoot));
  if (bounds.malformedReceipts > 0) throw new Error("DAILY69_RETAINED_EXECUTION_RECEIPTS_INVALID");
  const script = operationalLogScript(bounds.startUtc, bounds.endUtc, options.finalizerOnly ? [FINALIZER_TASK_NAME] : undefined);
  try {
    const { stdout } = await execute("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], {
      windowsHide: true, timeout: 45_000, maxBuffer: 4 * 1024 * 1024,
    });
    return parseSanitizedEvents(stdout);
  } catch (error) {
    const failure = error as { killed?: boolean; code?: string; stderr?: string };
    if (failure.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") throw new Error("DAILY69_TASK_EVENTS_QUERY_OUTPUT_LIMIT");
    if (failure.killed) throw new Error("DAILY69_TASK_EVENTS_QUERY_TIMEOUT");
    const childCode = failure.stderr?.trim();
    if (childCode === "DAILY69_TASK_EVENTS_QUERY_OUTPUT_LIMIT" || childCode === "TASK_SCHEDULER_OPERATIONAL_EVENTS_INVALID") throw new Error(childCode);
    if (error instanceof Error && /^[A-Z0-9_:-]+$/u.test(error.message)) throw error;
    throw new Error("DAILY69_TASK_EVENTS_QUERY_FAILED");
  }
}

async function readSanitizedEvents(path: string) {
  return parseSanitizedEvents(await readFile(path, "utf8"));
}

export function parseSanitizedEvents(content: string): SanitizedTaskSchedulerEvent[] {
  const parsed = JSON.parse(content) as unknown;
  const values = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" && Array.isArray((parsed as { events?: unknown }).events)
    ? (parsed as { events: unknown[] }).events : parsed ? [parsed] : [];
  const normalized = values.map((value) => normalizeSanitizedEvent(value));
  if (!normalized.every(isSanitizedEvent)) throw new Error("TASK_SCHEDULER_OPERATIONAL_EVENTS_INVALID");
  return normalized;
}

function normalizeSanitizedEvent(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const event = value as Record<string, unknown>;
  return event.taskInstanceId === null ? { ...event, taskInstanceId: "" } : event;
}

function isSanitizedEvent(value: unknown): value is SanitizedTaskSchedulerEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<SanitizedTaskSchedulerEvent>;
  return Number.isSafeInteger(event.eventRecordId) && Number(event.eventRecordId) > 0
    && Number.isSafeInteger(event.eventId) && [100, 102, 107, 110, 129, 200, 201].includes(Number(event.eventId))
    && typeof event.timeCreatedUtc === "string" && Number.isFinite(Date.parse(event.timeCreatedUtc))
    && typeof event.taskName === "string" && event.taskName.length > 0
    && typeof event.taskInstanceId === "string"
    && (event.processId === undefined || Number.isSafeInteger(event.processId))
    && (event.resultCode === undefined || Number.isSafeInteger(event.resultCode))
    && (event.principalSidSha256 === undefined || /^[a-f0-9]{64}$/u.test(event.principalSidSha256));
}

export function operationalLogScript(startUtc: string, endUtc: string, taskNames = [
  "Minz-Commerce-ControlRunner-NoUpload-V1", "Minz-Commerce-VideoBatch-NoUpload-V1", "Minz-Commerce-Daily69-Closeout-NoUpload-V1",
]) {
  const start = new Date(startUtc).toISOString();
  const end = new Date(endUtc).toISOString();
  if (taskNames.length === 0 || taskNames.length > 4 || taskNames.some((name) => !/^[A-Za-z0-9_-]{1,128}$/u.test(name))) throw new Error("TASK_SCHEDULER_QUERY_TASK_INVALID");
  const taskPredicate = taskNames.map((name) => "Data[@Name='TaskName']='\\" + name + "'").join(" or ");
  const helper = resolve(dirname(fileURLToPath(import.meta.url)), "operational-log-query.cs").split("'").join("''");
  return String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$xpath = "*[System[(EventID=107 or EventID=100 or EventID=129 or EventID=200 or EventID=201 or EventID=102 or EventID=110) and TimeCreated[@SystemTime >= '${start}' and @SystemTime <= '${end}']] and EventData[(${taskPredicate})]]"
try {
  Add-Type -LiteralPath '${helper}' -ReferencedAssemblies 'System.Core','System.Xml','System.Web.Extensions' -ErrorAction Stop
  [Console]::Out.Write([Daily69OperationalLogQuery]::Read($xpath))
} catch {
  $errorCode = 'DAILY69_TASK_EVENTS_QUERY_FAILED'
  $exception = $_.Exception
  while ($null -ne $exception) {
    if ($exception.Message -in @('DAILY69_TASK_EVENTS_QUERY_OUTPUT_LIMIT','TASK_SCHEDULER_OPERATIONAL_EVENTS_INVALID')) { $errorCode = $exception.Message; break }
    $exception = $exception.InnerException
  }
  [Console]::Error.WriteLine($errorCode)
  exit 3
}
`;
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
  return /^[A-Z0-9_:-]+$/u.test(value) ? value : "DAILY69_TASK_EVENT_BINDING_FAILED";
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${JSON.stringify({ event: "daily69_task_event_binding_failed", safeError: safeError(error), SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 })}\n`);
    process.exitCode = 3;
  });
}
