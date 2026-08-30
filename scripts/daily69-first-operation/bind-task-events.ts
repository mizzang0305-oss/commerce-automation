import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
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

export async function queryOperationalLog(operationRoot: string): Promise<SanitizedTaskSchedulerEvent[]> {
  if (process.platform !== "win32") throw new Error("TASK_SCHEDULER_OPERATIONAL_LOG_WINDOWS_ONLY");
  const bounds = await retainedExecutionTimeBounds(operationRoot);
  if (bounds.malformedReceipts > 0) throw new Error("DAILY69_RETAINED_EXECUTION_RECEIPTS_INVALID");
  const script = operationalLogScript(bounds.startUtc, bounds.endUtc);
  const { stdout } = await execute("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], {
    windowsHide: true,
    timeout: 45_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  return parseSanitizedEvents(stdout);
}

async function readSanitizedEvents(path: string) {
  return parseSanitizedEvents(await readFile(path, "utf8"));
}

function parseSanitizedEvents(content: string): SanitizedTaskSchedulerEvent[] {
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
    && (event.resultCode === undefined || Number.isSafeInteger(event.resultCode));
}

function operationalLogScript(startUtc: string, endUtc: string) {
  return String.raw`
$ErrorActionPreference = 'Stop'
$startUtc = [DateTimeOffset]::Parse('${startUtc}').UtcDateTime
$endUtc = [DateTimeOffset]::Parse('${endUtc}').UtcDateTime
$ids = @(107, 100, 129, 200, 201, 102, 110)
$result = @()
$events = Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-TaskScheduler/Operational'; Id = $ids; StartTime = $startUtc; EndTime = $endUtc } -ErrorAction Stop
foreach ($eventRecord in $events) {
  $xml = [xml]$eventRecord.ToXml()
  $data = @{}
  foreach ($node in @($xml.Event.EventData.Data)) {
    $name = [string]$node.GetAttribute('Name')
    if ($name) { $data[$name] = [string]$node.'#text' }
  }
  $taskName = [string](@($data['TaskName'], $data['Task'], $data['Path']) | Where-Object { $_ } | Select-Object -First 1)
  $taskInstanceId = [string](@($data['TaskInstanceId'], $data['InstanceId'], $data['TaskInstance']) | Where-Object { $_ } | Select-Object -First 1)
  $processIdValue = [string](@($data['ProcessId'], $data['EnginePID']) | Where-Object { $_ } | Select-Object -First 1)
  $resultCodeValue = [string](@($data['ResultCode'], $data['Result'], $data['ErrorCode']) | Where-Object { $_ -ne $null -and $_ -ne '' } | Select-Object -First 1)
  $record = [ordered]@{
    eventRecordId = [long]$eventRecord.RecordId
    eventId = [int]$eventRecord.Id
    timeCreatedUtc = $eventRecord.TimeCreated.ToUniversalTime().ToString('o')
    taskName = $taskName
    taskInstanceId = $taskInstanceId
  }
  if ($processIdValue -match '^\d+$') { $record.processId = [int]$processIdValue }
  if ($resultCodeValue -match '^0[xX][0-9a-fA-F]+$') { $record.resultCode = [Convert]::ToInt64($resultCodeValue.Substring(2), 16) }
  elseif ($resultCodeValue -match '^-?\d+$') { $record.resultCode = [long]$resultCodeValue }
  $result += [pscustomobject]$record
}
@($result) | ConvertTo-Json -Depth 4 -Compress
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
