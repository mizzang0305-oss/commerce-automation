import { appendFile, mkdir, open, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  commerceContentDraftSchema,
  orchestratorTargetSchema,
  type CommerceContentDraft,
  type OrchestratorTarget
} from "@/lib/orchestration/commercePocSchemas";

export const LOCAL_FAILED_SCHEDULE_RETRY_APPROVAL = "APPROVE_LOCAL_FAILED_SCHEDULE_RETRY";

const localExecutionResultSchema = z.object({
  ok: z.literal(true),
  drafts: z.array(commerceContentDraftSchema),
  webhook_called: z.literal(false),
  notification_sent: z.literal(false),
  publish_attempted: z.literal(false),
  SAFE_TO_UPLOAD: z.literal(false),
  SAFE_TO_PUBLIC_UPLOAD: z.literal(false)
}).passthrough();

export const localCommerceScheduleEventSchema = z.object({
  schema_version: z.literal("1"),
  schedule_id: z.string().min(1),
  batch_id: z.string().min(1),
  target: orchestratorTargetSchema,
  status: z.enum(["scheduled", "running", "retry_wait", "completed", "failed"]),
  attempt: z.number().int().nonnegative(),
  retry_generation: z.number().int().nonnegative().default(0),
  operator_action: z.enum(["none", "retry_failed"]).default("none"),
  recorded_at: z.string().datetime(),
  next_run_at: z.string().datetime().nullable(),
  error_code: z.string().min(1).nullable(),
  draft_ids: z.array(z.string().min(1)),
  side_effects: z.object({
    external_call_attempted: z.literal(false),
    webhook_called: z.literal(false),
    notification_sent: z.literal(false),
    platform_upload_attempted: z.literal(false),
    database_written: z.literal(false),
    product_queue_created: z.literal(false),
    worker_jobs_created: z.literal(false)
  }).strict()
}).strict();

export const localCommerceDraftQueueRecordSchema = z.object({
  schema_version: z.literal("1"),
  schedule_id: z.string().min(1),
  batch_id: z.string().min(1),
  target: orchestratorTargetSchema,
  draft_id: z.string().min(1),
  product_raw_hash: z.string().regex(/^[0-9a-f]{64}$/),
  state: z.literal("draft_pending_review"),
  approval_required: z.literal(true),
  publish_allowed: z.literal(false),
  queued_at: z.string().datetime()
}).strict();

export type LocalCommerceScheduleEvent = z.infer<typeof localCommerceScheduleEventSchema>;
export type LocalCommerceDraftQueueRecord = z.infer<typeof localCommerceDraftQueueRecordSchema>;

export type LocalCommerceExecutionResult = {
  ok: true;
  drafts: CommerceContentDraft[];
  webhook_called: false;
  notification_sent: false;
  publish_attempted: false;
  SAFE_TO_UPLOAD: false;
  SAFE_TO_PUBLIC_UPLOAD: false;
};

export class LocalCommerceSchedulerStore {
  constructor(private readonly dataDir = join(process.cwd(), "data", "commerce-poc")) {}

  async withSchedulerLock<T>(task: () => Promise<T>): Promise<T> {
    await mkdir(this.dataDir, { recursive: true });
    const lockPath = join(this.dataDir, "scheduler.lock");
    const lockHandle = await this.acquireSchedulerLock(lockPath);
    try {
      return await task();
    } finally {
      await lockHandle.close();
      try {
        await unlink(lockPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
    }
  }

  async readEvents(scheduleId: string): Promise<LocalCommerceScheduleEvent[]> {
    return (await this.readJsonl("scheduler-status.jsonl"))
      .map((record) => localCommerceScheduleEventSchema.parse(record))
      .filter((event) => event.schedule_id === scheduleId);
  }

  async appendEvent(event: LocalCommerceScheduleEvent) {
    const parsed = localCommerceScheduleEventSchema.parse(event);
    await this.appendJsonl("scheduler-status.jsonl", [parsed]);
    return parsed;
  }

  async enqueueDrafts(input: {
    scheduleId: string;
    batchId: string;
    target: OrchestratorTarget;
    drafts: CommerceContentDraft[];
    queuedAt: string;
  }): Promise<LocalCommerceDraftQueueRecord[]> {
    const candidates = input.drafts.map((draft) => localCommerceDraftQueueRecordSchema.parse({
      schema_version: "1",
      schedule_id: input.scheduleId,
      batch_id: input.batchId,
      target: input.target,
      draft_id: draft.id,
      product_raw_hash: draft.product_raw_hash,
      state: "draft_pending_review",
      approval_required: true,
      publish_allowed: false,
      queued_at: input.queuedAt
    }));
    const existing = (await this.readJsonl("draft-queue.jsonl"))
      .map((record) => localCommerceDraftQueueRecordSchema.parse(record));
    const existingByDraftId = new Map(existing.map((record) => [record.draft_id, record]));
    const missing: LocalCommerceDraftQueueRecord[] = [];

    for (const candidate of candidates) {
      const previous = existingByDraftId.get(candidate.draft_id);
      if (!previous) {
        missing.push(candidate);
        existingByDraftId.set(candidate.draft_id, candidate);
        continue;
      }
      if (JSON.stringify(canonicalDraftQueueRecord(previous)) !== JSON.stringify(canonicalDraftQueueRecord(candidate))) {
        throw new Error(`DRAFT_QUEUE_ID_REUSED_WITH_DIFFERENT_RECORD:${candidate.draft_id}`);
      }
    }

    await this.appendJsonl("draft-queue.jsonl", missing);
    return candidates.map((candidate) => existingByDraftId.get(candidate.draft_id) ?? candidate);
  }

  private async readJsonl(fileName: string): Promise<unknown[]> {
    try {
      const content = await readFile(join(this.dataDir, fileName), "utf8");
      return content
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as unknown);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  private async appendJsonl(fileName: string, records: unknown[]) {
    if (records.length === 0) {
      return;
    }
    await mkdir(this.dataDir, { recursive: true });
    const lines = records.map((record) => JSON.stringify(record)).join("\n");
    await appendFile(join(this.dataDir, fileName), `${lines}\n`, "utf8");
  }

  private async acquireSchedulerLock(lockPath: string) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const handle = await open(lockPath, "wx");
        try {
          await handle.writeFile(JSON.stringify({
            schema_version: "1",
            pid: process.pid,
            acquired_at: new Date().toISOString()
          }), "utf8");
          return handle;
        } catch (writeError) {
          await handle.close();
          try {
            await unlink(lockPath);
          } catch {
            // Preserve the original initialization failure; a corrupt lock remains fail-closed.
          }
          throw writeError;
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
          throw error;
        }
        const stale = await this.isStaleSchedulerLock(lockPath);
        if (!stale || attempt > 0) {
          throw new Error("LOCAL_SCHEDULER_ALREADY_RUNNING");
        }
        try {
          await unlink(lockPath);
        } catch (unlinkError) {
          if ((unlinkError as NodeJS.ErrnoException).code !== "ENOENT") {
            throw new Error("LOCAL_SCHEDULER_ALREADY_RUNNING");
          }
        }
      }
    }
    throw new Error("LOCAL_SCHEDULER_ALREADY_RUNNING");
  }

  private async isStaleSchedulerLock(lockPath: string) {
    try {
      const raw = JSON.parse(await readFile(lockPath, "utf8")) as { pid?: unknown };
      if (!Number.isInteger(raw.pid) || Number(raw.pid) <= 0) {
        return false;
      }
      return !isProcessAlive(Number(raw.pid));
    } catch {
      return false;
    }
  }
}

type RunLocalCommerceScheduleInput = {
  scheduleId: string;
  batchId: string;
  target: OrchestratorTarget;
  scheduledAt: string;
  maxAttempts?: number;
  retryDelayMs?: number;
  retryFailedApproval?: string;
  now?: () => string;
  execute: () => Promise<LocalCommerceExecutionResult>;
  store?: LocalCommerceSchedulerStore;
};

export async function runLocalCommerceSchedule(input: RunLocalCommerceScheduleInput) {
  const store = input.store ?? new LocalCommerceSchedulerStore();
  return store.withSchedulerLock(() => runLocalCommerceScheduleLocked({ ...input, store }));
}

async function runLocalCommerceScheduleLocked(input: RunLocalCommerceScheduleInput & {
  store: LocalCommerceSchedulerStore;
}) {
  const maxAttempts = z.number().int().min(1).max(5).parse(input.maxAttempts ?? 3);
  const retryDelayMs = z.number().int().min(0).max(86_400_000).parse(input.retryDelayMs ?? 0);
  const scheduledAt = z.string().datetime().parse(input.scheduledAt);
  const target = orchestratorTargetSchema.parse(input.target);
  const now = input.now ?? (() => new Date().toISOString());
  const store = input.store;
  const retryFailedRequested = input.retryFailedApproval !== undefined;
  if (retryFailedRequested && input.retryFailedApproval !== LOCAL_FAILED_SCHEDULE_RETRY_APPROVAL) {
    throw new Error("LOCAL_FAILED_SCHEDULE_RETRY_APPROVAL_INVALID");
  }
  let events = await store.readEvents(input.scheduleId);

  if (events.some((event) => event.batch_id !== input.batchId || event.target !== target)) {
    throw new Error(`SCHEDULE_ID_REUSED_WITH_DIFFERENT_CONTRACT:${input.scheduleId}`);
  }

  if (events.length === 0) {
    if (retryFailedRequested) {
      throw new Error("LOCAL_FAILED_SCHEDULE_RETRY_REQUIRES_FAILED_STATE");
    }
    await store.appendEvent(buildEvent({
      scheduleId: input.scheduleId,
      batchId: input.batchId,
      target,
      status: "scheduled",
      attempt: 0,
      retryGeneration: 0,
      recordedAt: now(),
      nextRunAt: scheduledAt
    }));
    events = await store.readEvents(input.scheduleId);
  }

  if (retryFailedRequested) {
    const latest = events[events.length - 1];
    if (!latest || latest.status !== "failed") {
      throw new Error("LOCAL_FAILED_SCHEDULE_RETRY_REQUIRES_FAILED_STATE");
    }
    const recordedAt = now();
    const retryScheduled = await store.appendEvent(buildEvent({
      scheduleId: input.scheduleId,
      batchId: input.batchId,
      target,
      status: "scheduled",
      attempt: 0,
      retryGeneration: latest.retry_generation + 1,
      operatorAction: "retry_failed",
      recordedAt,
      nextRunAt: recordedAt
    }));
    events.push(retryScheduled);
  }

  while (true) {
    const latest = events[events.length - 1];
    if (!latest) {
      throw new Error("LOCAL_SCHEDULER_STATE_MISSING");
    }
    if (latest.status === "completed" || latest.status === "failed") {
      return buildSummary(latest, events.length);
    }

    const currentTime = now();
    if (latest.status === "running") {
      const canRetry = latest.attempt < maxAttempts;
      const nextRunAt = canRetry
        ? new Date(new Date(currentTime).getTime() + retryDelayMs).toISOString()
        : null;
      const recovered = await store.appendEvent(buildEvent({
        scheduleId: input.scheduleId,
        batchId: input.batchId,
        target,
        status: canRetry ? "retry_wait" : "failed",
        attempt: latest.attempt,
        retryGeneration: latest.retry_generation,
        recordedAt: currentTime,
        nextRunAt,
        errorCode: "LOCAL_EXECUTION_INTERRUPTED"
      }));
      events.push(recovered);
      if (!canRetry || retryDelayMs > 0) {
        return buildSummary(recovered, events.length);
      }
      continue;
    }

    const dueAt = latest.next_run_at ?? scheduledAt;
    if (new Date(dueAt).getTime() > new Date(currentTime).getTime()) {
      return buildSummary(latest, events.length);
    }

    const attempt = latest.attempt + 1;
    const running = await store.appendEvent(buildEvent({
      scheduleId: input.scheduleId,
      batchId: input.batchId,
      target,
      status: "running",
      attempt,
      retryGeneration: latest.retry_generation,
      recordedAt: currentTime,
      nextRunAt: null
    }));
    events.push(running);

    try {
      const result = localExecutionResultSchema.parse(await input.execute());
      const queued = await store.enqueueDrafts({
        scheduleId: input.scheduleId,
        batchId: input.batchId,
        target,
        drafts: result.drafts,
        queuedAt: now()
      });
      const completed = await store.appendEvent(buildEvent({
        scheduleId: input.scheduleId,
        batchId: input.batchId,
        target,
        status: "completed",
        attempt,
        retryGeneration: latest.retry_generation,
        recordedAt: now(),
        nextRunAt: null,
        draftIds: queued.map((record) => record.draft_id)
      }));
      events.push(completed);
      return buildSummary(completed, events.length);
    } catch {
      const recordedAt = now();
      const canRetry = attempt < maxAttempts;
      const nextRunAt = canRetry
        ? new Date(new Date(recordedAt).getTime() + retryDelayMs).toISOString()
        : null;
      const failedEvent = await store.appendEvent(buildEvent({
        scheduleId: input.scheduleId,
        batchId: input.batchId,
        target,
        status: canRetry ? "retry_wait" : "failed",
        attempt,
        retryGeneration: latest.retry_generation,
        recordedAt,
        nextRunAt,
        errorCode: "LOCAL_EXECUTION_FAILED"
      }));
      events.push(failedEvent);
      if (!canRetry || retryDelayMs > 0) {
        return buildSummary(failedEvent, events.length);
      }
    }
  }
}

function buildEvent(input: {
  scheduleId: string;
  batchId: string;
  target: OrchestratorTarget;
  status: LocalCommerceScheduleEvent["status"];
  attempt: number;
  retryGeneration: number;
  recordedAt: string;
  nextRunAt: string | null;
  errorCode?: string;
  draftIds?: string[];
  operatorAction?: LocalCommerceScheduleEvent["operator_action"];
}): LocalCommerceScheduleEvent {
  return localCommerceScheduleEventSchema.parse({
    schema_version: "1",
    schedule_id: input.scheduleId,
    batch_id: input.batchId,
    target: input.target,
    status: input.status,
    attempt: input.attempt,
    retry_generation: input.retryGeneration,
    operator_action: input.operatorAction ?? "none",
    recorded_at: input.recordedAt,
    next_run_at: input.nextRunAt,
    error_code: input.errorCode ?? null,
    draft_ids: input.draftIds ?? [],
    side_effects: {
      external_call_attempted: false,
      webhook_called: false,
      notification_sent: false,
      platform_upload_attempted: false,
      database_written: false,
      product_queue_created: false,
      worker_jobs_created: false
    }
  });
}

function buildSummary(latest: LocalCommerceScheduleEvent, eventCount: number) {
  return {
    ok: latest.status === "completed" || latest.status === "scheduled",
    schedule_id: latest.schedule_id,
    batch_id: latest.batch_id,
    target: latest.target,
    status: latest.status,
    attempts: latest.attempt,
    retry_generation: latest.retry_generation,
    status_events: eventCount,
    drafts_queued: latest.draft_ids.length,
    error_code: latest.error_code,
    next_run_at: latest.next_run_at,
    external_call_attempted: false,
    webhook_called: false,
    notification_sent: false,
    publish_attempted: false,
    database_written: false,
    product_queue_created: false,
    worker_jobs_created: false,
    SAFE_TO_UPLOAD: false,
    SAFE_TO_PUBLIC_UPLOAD: false
  } as const;
}

function canonicalDraftQueueRecord(record: LocalCommerceDraftQueueRecord) {
  const { queued_at, ...stable } = record;
  void queued_at;
  return stable;
}

function isProcessAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}
