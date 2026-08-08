import { join } from "node:path";
import type { SheetsGateway } from "@/lib/google-sheets/googleSheetsClient";
import { SheetsCommandRepository } from "@/lib/google-sheets/sheetsCommandRepository";
import { SheetsLogRepository } from "@/lib/google-sheets/sheetsLogRepository";
import { isQueueControlCommand, safeJson, toKstTimestamp, type QueueControlCommand, type SheetCommand } from "@/lib/google-sheets/sheetSchemas";
import { LocalQueueRepository, runNextBatch, runNightlyScout } from "@/lib/queue-scheduler";
import { atomicWriteJson, readJson } from "@/lib/queue-scheduler/atomicJson";
import { acquireProcessLock } from "@/lib/queue-scheduler/lock";
import { QueueProjectionService } from "./projection";

type JournalEntry = { commandId: string; status: "completed" | "failed" | "stale_rejected"; safeMessage: string; localRevision: number; completedAt: string };

const ITEM_COMMANDS: ReadonlySet<QueueControlCommand> = new Set(["RETRY_SLOT", "HOLD_SLOT", "SKIP_SLOT", "RELEASE_HOLD", "REPLACE_FROM_RESERVE"]);

export async function processOneQueueControlCommand(input: {
  gateway: SheetsGateway;
  repository: LocalQueueRepository;
  projection: QueueProjectionService;
  runnerId: string;
  now?: Date;
}) {
  const commands = new SheetsCommandRepository(input.gateway);
  const logs = new SheetsLogRepository(input.gateway);
  const journal = new CommandJournal(input.repository.root);
  const existingJournal = await journal.list();
  const listed = (await commands.list()).filter((command) => isQueueControlCommand(command.command));
  const recoverable = listed.find((command) => command.status === "claimed" && existingJournal.some((entry) => entry.commandId === command.commandId));
  if (recoverable) return finalizeFromJournal(recoverable, existingJournal.find((entry) => entry.commandId === recoverable.commandId)!, commands);
  const selected = listed.filter((command) => command.status === "pending").sort((left, right) => left.requestedAt.localeCompare(right.requestedAt))[0];
  if (!selected) return { processed: false as const };
  const marker = `runner:${input.runnerId}`;
  await commands.update(selected.commandId, { status: "claimed", result: marker, errorMemo: "" });
  const claimed = (await commands.list()).find((command) => command.commandId === selected.commandId);
  if (!claimed || claimed.status !== "claimed" || claimed.result !== marker) return { processed: false as const };

  const startedAt = toKstTimestamp(input.now ?? new Date());
  const before = await safeLocalState(input.repository, claimed.queueId);
  let status: JournalEntry["status"] = "completed";
  let safeMessage = "CONTROL_COMMAND_COMPLETED";
  try {
    safeMessage = await executeStaticCommand(claimed, input.repository, input.projection, commands, input.now ?? new Date());
  } catch (error) {
    safeMessage = safeError(error);
    status = safeMessage === "STALE_CONTROL_COMMAND" ? "stale_rejected" : "failed";
  }
  const state = await input.repository.controlState();
  const entry: JournalEntry = { commandId: claimed.commandId, status, safeMessage, localRevision: state.localRevision, completedAt: toKstTimestamp() };
  await journal.append(entry);
  const after = await safeLocalState(input.repository, claimed.queueId);
  try {
    await commands.update(claimed.commandId, { status, result: safeMessage, errorMemo: status === "completed" ? "" : safeMessage, completedAt: entry.completedAt, localRevision: state.localRevision });
    await logs.append({ commandId: claimed.commandId, queueId: claimed.queueId, command: claimed.command, status, safeMessage, before: safeJson(before), after: safeJson(after), startedAt, completedAt: entry.completedAt, externalCall: claimed.command === "RUN_NIGHTLY_SCOUT" ? "coupang_search_only" : "false", details: "local_queue_authority;no_upload" });
  } catch {
    return { processed: true as const, commandId: claimed.commandId, status, safeMessage, localApplied: status === "completed", sheetFinalizePending: true };
  }
  return { processed: true as const, commandId: claimed.commandId, status, safeMessage, localApplied: status === "completed", sheetFinalizePending: false };
}

async function executeStaticCommand(command: SheetCommand, repository: LocalQueueRepository, projection: QueueProjectionService, commands: SheetsCommandRepository, now: Date) {
  if (!isQueueControlCommand(command.command)) throw new Error("COMMAND_NOT_ALLOWED");
  if (ITEM_COMMANDS.has(command.command)) {
    if (!command.queueId) throw new Error("QUEUE_ID_REQUIRED");
    if (command.expectedRevision === null) throw new Error("EXPECTED_REVISION_REQUIRED");
  }
  let message = "CONTROL_COMMAND_COMPLETED";
  switch (command.command) {
    case "PAUSE_AUTOMATION": await repository.setPaused(true); message = "AUTOMATION_PAUSED"; break;
    case "RESUME_AUTOMATION": await repository.setPaused(false); message = "AUTOMATION_RESUMED"; break;
    case "RUN_NIGHTLY_SCOUT": message = (await runNightlyScout({ repository, now })).run.safeMessage; break;
    case "RUN_NEXT_BATCH": message = (await runNextBatch({ repository, now })).run.safeMessage; break;
    case "RETRY_SLOT": await repository.mutateItem({ id: command.queueId, expectedRevision: command.expectedRevision!, action: "retry", now }); message = "SLOT_RETRY_SCHEDULED"; break;
    case "HOLD_SLOT": await repository.mutateItem({ id: command.queueId, expectedRevision: command.expectedRevision!, action: "hold", now, reason: command.requestValue || "OWNER_HOLD" }); message = "SLOT_HELD"; break;
    case "SKIP_SLOT": await repository.mutateItem({ id: command.queueId, expectedRevision: command.expectedRevision!, action: "skip", now }); message = "SLOT_SKIPPED"; break;
    case "RELEASE_HOLD": await repository.mutateItem({ id: command.queueId, expectedRevision: command.expectedRevision!, action: "release_hold", now }); message = "SLOT_HOLD_RELEASED"; break;
    case "REPLACE_FROM_RESERVE": {
      const replacement = await repository.replaceWithReserve({ id: command.queueId, expectedRevision: command.expectedRevision!, reason: "OWNER_RESERVE_REPLACEMENT", now });
      if (!replacement) throw new Error("RESERVE_REPLACEMENT_NOT_AVAILABLE");
      message = "SLOT_REPLACED_FROM_RESERVE"; break;
    }
    case "CANCEL_COMMAND": {
      const targetId = command.requestValue.trim();
      if (!targetId || targetId === command.commandId) throw new Error("CANCEL_TARGET_INVALID");
      await commands.cancel(targetId); message = "COMMAND_CANCELLED"; break;
    }
    case "REFRESH_PROJECTION": await projection.project(); return "PROJECTION_REFRESHED";
  }
  try { await projection.project(); }
  catch { return `${message}_PROJECTION_PENDING`; }
  return message;
}

async function safeLocalState(repository: LocalQueueRepository, queueId: string) {
  const [state, settings, items] = await Promise.all([repository.controlState(), repository.settings(), repository.items()]);
  const item = items.find((entry) => entry.id === queueId);
  return { localRevision: state.localRevision, enabled: settings.enabled, isPaused: settings.isPaused, item: item ? { queueId: item.id, slotId: item.slotId, status: item.status, localRevision: item.localRevision, errorCode: item.errorCode } : null };
}
function safeError(error: unknown) { const value = error instanceof Error ? error.message : String(error); return /^[A-Z0-9_:-]+$/u.test(value) ? value : "CONTROL_COMMAND_FAILED"; }
async function finalizeFromJournal(command: SheetCommand, entry: JournalEntry, commands: SheetsCommandRepository) {
  await commands.update(command.commandId, { status: entry.status, result: entry.safeMessage, errorMemo: entry.status === "completed" ? "" : entry.safeMessage, completedAt: entry.completedAt, localRevision: entry.localRevision });
  return { processed: true as const, commandId: command.commandId, status: entry.status, safeMessage: entry.safeMessage, localApplied: entry.status === "completed", duplicateExecutionPrevented: true };
}

class CommandJournal {
  private readonly path: string;
  private readonly lockPath: string;
  constructor(root: string) { this.path = join(root, "executed-control-commands.json"); this.lockPath = join(root, "executed-control-commands.lock"); }
  async list() { return readJson<JournalEntry[]>(this.path, []); }
  async append(entry: JournalEntry) {
    const release = await acquireProcessLock(this.lockPath, `command-journal-${process.pid}`, 60_000);
    try {
      const entries = await this.list();
      if (entries.some((value) => value.commandId === entry.commandId)) return;
      await atomicWriteJson(this.path, [...entries, entry].slice(-2_000));
    } finally { await release(); }
  }
}
