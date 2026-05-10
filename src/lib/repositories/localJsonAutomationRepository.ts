import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import type {
  AutomationRun,
  AutomationSettings,
  GeneratedContent,
  Platform,
  ProductQueueItem
} from "@/types/automation";
import type {
  MutableMockAutomationRepository,
  QueueFilters,
  QueueSummary
} from "@/lib/repositories/types";
import {
  createDefaultSettings,
  createMockGeneratedContents,
  createMockQueueItems,
  createMockRuns,
  SettingsValidationError,
  validateSettingsInput
} from "@/lib/repositories/mockAutomationRepository";
import { getQueueSummary } from "@/lib/status";
import { assignSlots } from "@/lib/scheduler";
import { getAutomationDataDir, getStoragePaths, type AutomationStoragePaths } from "@/lib/repositories/storagePaths";

export class LocalJsonStorageError extends Error {
  constructor(message = "로컬 JSON 저장소를 읽을 수 없습니다.") {
    super(message);
    this.name = "LocalJsonStorageError";
  }
}

export type LocalJsonRepositoryOptions = {
  dataDir?: string;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function nowIso() {
  return new Date().toISOString();
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path, "utf8");
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

async function atomicWriteJson<T>(path: string, value: T) {
  const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tmpPath, path);
}

async function readJson<T>(path: string): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new LocalJsonStorageError();
    }
    throw error;
  }
}

function sanitizeRun(run: AutomationRun): AutomationRun {
  return {
    ...run,
    log: run.log
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted]")
      .replace(/https?:\/\/[^\s"]*webhook[^\s"]*/gi, "[webhook-url-redacted]")
  };
}

export class LocalJsonAutomationRepository implements MutableMockAutomationRepository {
  private paths: AutomationStoragePaths;
  private initPromise: Promise<void> | null = null;

  constructor(options: LocalJsonRepositoryOptions = {}) {
    this.paths = getStoragePaths(options.dataDir ?? getAutomationDataDir());
  }

  async getSettings() {
    await this.ensureInitialized();
    return clone(await readJson<AutomationSettings>(this.paths.settings));
  }

  async updateSettings(input: Partial<AutomationSettings>) {
    await this.ensureInitialized();
    const validation = validateSettingsInput(input);
    if (!validation.ok) {
      throw new SettingsValidationError(validation.message, validation.field);
    }

    const settings = await this.getSettings();
    const updated = {
      ...settings,
      ...validation.value,
      updated_at: nowIso()
    };
    await atomicWriteJson(this.paths.settings, updated);

    const queue = assignSlots(await this.readQueue(), updated);
    await atomicWriteJson(this.paths.queue, queue);
    return clone(updated);
  }

  async getQueue(filters: QueueFilters = {}) {
    await this.ensureInitialized();
    let items = await this.readQueue();

    if (filters.date) {
      items = items.filter((item) => item.queue_date === filters.date);
    }
    if (filters.status && filters.status !== "all") {
      items = items.filter((item) => item.queue_status === filters.status);
    }
    if (filters.upload_status) {
      items = items.filter(
        (item) =>
          item.youtube_upload_status === filters.upload_status ||
          item.tiktok_upload_status === filters.upload_status ||
          item.threads_post_status === filters.upload_status
      );
    }
    if (filters.keyword) {
      const keyword = filters.keyword.toLowerCase();
      items = items.filter(
        (item) =>
          item.keyword.toLowerCase().includes(keyword) ||
          item.product_name.toLowerCase().includes(keyword)
      );
    }
    if (filters.theme) {
      const theme = filters.theme.toLowerCase();
      items = items.filter((item) => item.theme.toLowerCase().includes(theme));
    }
    if (filters.priority === "issues-first") {
      items = items.sort((a, b) => priorityWeight(a) - priorityWeight(b) || a.queue_rank - b.queue_rank);
    } else {
      items = items.sort((a, b) => a.queue_rank - b.queue_rank);
    }
    if (filters.limit) {
      items = items.slice(0, filters.limit);
    }

    return clone(items);
  }

  async getQueueSummary(): Promise<QueueSummary> {
    return getQueueSummary(await this.readQueue());
  }

  async getQueueItem(id: string) {
    const queue = await this.readQueue();
    return clone(queue.find((item) => item.id === id) ?? null);
  }

  async retryQueueItem(id: string) {
    return this.updateQueueItem(id, {
      queue_status: "scheduled",
      error_message: "",
      youtube_upload_status: "not_ready",
      tiktok_upload_status: "not_ready",
      threads_post_status: "not_ready",
      manual_review_status: "not_ready"
    });
  }

  async holdQueueItem(id: string) {
    return this.updateQueueItem(id, { queue_status: "hold" });
  }

  async skipQueueItem(id: string) {
    return this.updateQueueItem(id, { queue_status: "skipped" });
  }

  async markManualUploaded(id: string, platform: Platform) {
    const queue = await this.readQueue();
    const index = queue.findIndex((item) => item.id === id);
    if (index === -1) {
      return null;
    }

    const item = queue[index];
    if (platform === "youtube") {
      item.youtube_upload_status = "manual_review";
      item.queue_status = "uploaded";
    }
    if (platform === "tiktok") {
      item.tiktok_upload_status = "uploaded";
      item.queue_status = "uploaded";
    }
    if (platform === "threads") {
      item.threads_post_status = "posted";
      item.queue_status = "posted";
    }
    item.manual_review_status = "approved";
    item.updated_at = nowIso();
    queue[index] = item;
    await atomicWriteJson(this.paths.queue, queue);
    return clone(item);
  }

  async getRuns() {
    await this.ensureInitialized();
    const runs = await readJson<AutomationRun[]>(this.paths.runs);
    return clone(runs.sort((a, b) => b.started_at.localeCompare(a.started_at)));
  }

  async appendRun(run: AutomationRun) {
    await this.ensureInitialized();
    const safeRun = sanitizeRun(run);
    const runs = await readJson<AutomationRun[]>(this.paths.runs);
    runs.unshift(safeRun);
    await atomicWriteJson(this.paths.runs, runs);
    return clone(safeRun);
  }

  async getGeneratedContentByQueueItem(id: string) {
    await this.ensureInitialized();
    const contents = await readJson<GeneratedContent[]>(this.paths.contents);
    return clone(contents.find((content) => content.product_queue_id === id) ?? null);
  }

  async seedQueue(mode: "default" | "error-sample" | "simulate-transition" = "default") {
    await this.ensureInitialized();
    const settings = await this.getSettings();
    let queue = await this.readQueue();

    if (mode === "simulate-transition") {
      queue = queue.map((item) => {
        if (item.queue_status === "scheduled") {
          return { ...item, queue_status: "processing", updated_at: nowIso() };
        }
        if (item.queue_status === "processing") {
          return {
            ...item,
            queue_status: "video_ready",
            video_url: `https://example.com/mock-assets/video-${item.id}.mp4`,
            video_snapshot_url: `https://picsum.photos/seed/snapshot-${item.id}/480/270`,
            updated_at: nowIso()
          };
        }
        if (item.queue_status === "video_ready") {
          return {
            ...item,
            queue_status: "blog_draft_created",
            blog_draft_url: `https://example.com/mock-blog-drafts/${item.id}`,
            updated_at: nowIso()
          };
        }
        if (item.queue_status === "blog_draft_created") {
          return {
            ...item,
            queue_status: "ready_for_manual_upload",
            youtube_upload_status: "ready_to_upload",
            tiktok_upload_status: "ready_to_upload",
            threads_post_status: "ready_to_post",
            manual_review_status: "ready_for_review",
            updated_at: nowIso()
          };
        }
        if (item.queue_status === "error") {
          return { ...item, queue_status: "scheduled", error_message: "", updated_at: nowIso() };
        }
        return item;
      });
    } else {
      queue = createMockQueueItems(settings);
      if (mode === "error-sample") {
        queue = queue.map((item, index) =>
          index < 5
            ? {
                ...item,
                queue_status: "error",
                error_message: "개발용 오류 샘플입니다. 실제 Webhook 성공으로 처리하지 않았습니다.",
                updated_at: nowIso()
              }
            : item
        );
      }
    }

    await atomicWriteJson(this.paths.queue, queue);
    await atomicWriteJson(this.paths.contents, createMockGeneratedContents(queue));
    await this.appendRun({
      id: `run-seed-${Date.now()}`,
      run_type: "manual_batch",
      status: "success",
      processed_count: queue.length,
      error_count: queue.filter((item) => item.queue_status === "error").length,
      started_at: nowIso(),
      finished_at: nowIso(),
      log: `개발용 seed 실행: ${mode}. 외부 Webhook 호출 없음.`,
      safe_message: "개발용 샘플 데이터가 갱신되었습니다."
    });
    return clone(queue);
  }

  async resetSettings() {
    const settings = createDefaultSettings();
    await this.ensureInitialized();
    await atomicWriteJson(this.paths.settings, settings);
    await atomicWriteJson(this.paths.queue, assignSlots(await this.readQueue(), settings));
    return clone(settings);
  }

  async resetStorage() {
    const settings = createDefaultSettings();
    const queue = createMockQueueItems(settings);
    await mkdir(this.paths.dataDir, { recursive: true });
    await atomicWriteJson(this.paths.settings, settings);
    await atomicWriteJson(this.paths.queue, queue);
    await atomicWriteJson(this.paths.contents, createMockGeneratedContents(queue));
    await atomicWriteJson(this.paths.runs, createMockRuns());
  }

  private async ensureInitialized() {
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = this.initializeFiles();
    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async initializeFiles() {
    await mkdir(this.paths.dataDir, { recursive: true });
    const settingsExists = await fileExists(this.paths.settings);
    const queueExists = await fileExists(this.paths.queue);
    const contentsExists = await fileExists(this.paths.contents);
    const runsExists = await fileExists(this.paths.runs);

    if (settingsExists && queueExists && contentsExists && runsExists) {
      return;
    }

    const settings = settingsExists
      ? await readJson<AutomationSettings>(this.paths.settings)
      : createDefaultSettings();
    const queue = queueExists ? await readJson<ProductQueueItem[]>(this.paths.queue) : createMockQueueItems(settings);
    const contents = contentsExists
      ? await readJson<GeneratedContent[]>(this.paths.contents)
      : createMockGeneratedContents(queue);
    const runs = runsExists ? await readJson<AutomationRun[]>(this.paths.runs) : createMockRuns();

    if (!settingsExists) {
      await atomicWriteJson(this.paths.settings, settings);
    }
    if (!queueExists) {
      await atomicWriteJson(this.paths.queue, queue);
    }
    if (!contentsExists) {
      await atomicWriteJson(this.paths.contents, contents);
    }
    if (!runsExists) {
      await atomicWriteJson(this.paths.runs, runs);
    }
  }

  private async readQueue() {
    await this.ensureInitialized();
    return readJson<ProductQueueItem[]>(this.paths.queue);
  }

  private async updateQueueItem(id: string, patch: Partial<ProductQueueItem>) {
    const queue = await this.readQueue();
    const index = queue.findIndex((item) => item.id === id);
    if (index === -1) {
      return null;
    }

    queue[index] = {
      ...queue[index],
      ...patch,
      updated_at: nowIso()
    };
    await atomicWriteJson(this.paths.queue, queue);
    return clone(queue[index]);
  }
}

function priorityWeight(item: ProductQueueItem) {
  if (item.queue_status === "error") {
    return 0;
  }
  if (item.queue_status === "manual_review") {
    return 1;
  }
  if (item.queue_status === "ready_for_manual_upload") {
    return 2;
  }
  return 3;
}

export function createLocalJsonAutomationRepository(options: LocalJsonRepositoryOptions = {}) {
  return new LocalJsonAutomationRepository(options);
}
