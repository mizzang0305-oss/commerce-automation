import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import type {
  AutomationRun,
  AutomationSettings,
  ChannelUploadPackage,
  GeneratedContent,
  ProductAsset,
  ProductCandidate,
  Platform,
  ProductionHistory,
  ProductQueueItem,
  WorkerHeartbeat,
  WorkerJob,
  WorkerJobType
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
import {
  buildCandidatePromotion,
  filterProductCandidates,
  type ProductCandidateFilters,
  type PromoteCandidateOptions
} from "@/lib/candidatePromotion";
import { enrichProductCandidate, enrichProductCandidates } from "@/lib/candidates/candidateNormalizer";

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
    const settings = await readJson<AutomationSettings>(this.paths.settings);
    return clone({ ...createDefaultSettings(), ...settings });
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

  async upsertQueueItems(items: ProductQueueItem[]) {
    const queue = await this.readQueue();
    for (const incoming of items) {
      const index = queue.findIndex(
        (item) => item.id === incoming.id || item.raw_coupang_url === incoming.raw_coupang_url
      );
      if (index === -1) {
        queue.push({ ...incoming, updated_at: nowIso() });
      } else {
        queue[index] = {
          ...queue[index],
          ...incoming,
          id: queue[index].id || incoming.id,
          updated_at: nowIso()
        };
      }
    }
    await atomicWriteJson(
      this.paths.queue,
      queue.sort((a, b) => a.queue_rank - b.queue_rank)
    );
  }

  async updateQueueItemByRawUrl(raw_coupang_url: string, patch: Partial<ProductQueueItem>) {
    const queue = await this.readQueue();
    const item = queue.find((queueItem) => queueItem.raw_coupang_url === raw_coupang_url);
    if (!item) {
      return null;
    }
    return this.updateQueueItem(item.id, patch);
  }

  async updateQueueItemById(id: string, patch: Partial<ProductQueueItem>) {
    return this.updateQueueItem(id, patch);
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

  async upsertGeneratedContent(content: GeneratedContent) {
    await this.ensureInitialized();
    const contents = await readJson<GeneratedContent[]>(this.paths.contents);
    const index = contents.findIndex(
      (item) => item.id === content.id || item.product_queue_id === content.product_queue_id
    );
    if (index === -1) {
      contents.push(content);
    } else {
      contents[index] = { ...contents[index], ...content, updated_at: nowIso() };
    }
    await atomicWriteJson(this.paths.contents, contents);
    return clone(index === -1 ? content : contents[index]);
  }

  async getWorkerJobs(filters: { status?: WorkerJob["status"] | "all"; job_type?: WorkerJobType | "all" } = {}) {
    await this.ensureInitialized();
    let jobs = await readJson<WorkerJob[]>(this.paths.workerJobs);
    if (filters.status && filters.status !== "all") {
      jobs = jobs.filter((job) => job.status === filters.status);
    }
    if (filters.job_type && filters.job_type !== "all") {
      jobs = jobs.filter((job) => job.job_type === filters.job_type);
    }
    return clone(jobs.sort(sortWorkerJobs));
  }

  async getWorkerJob(id: string) {
    await this.ensureInitialized();
    const jobs = await readJson<WorkerJob[]>(this.paths.workerJobs);
    return clone(jobs.find((job) => job.id === id) ?? null);
  }

  async createWorkerJob(input: {
    job_type: WorkerJobType;
    product_queue_id: string;
    product_candidate_id: string;
    priority: number;
    payload: Record<string, unknown>;
    max_retries: number;
  }) {
    await this.ensureInitialized();
    const jobs = await readJson<WorkerJob[]>(this.paths.workerJobs);
    const createdAt = nowIso();
    const job: WorkerJob = {
      id: `job-${Date.now()}-${jobs.length + 1}`,
      job_type: input.job_type,
      status: "pending",
      product_queue_id: input.product_queue_id,
      product_candidate_id: input.product_candidate_id,
      priority: input.priority,
      payload: input.payload,
      result: {},
      claimed_by: "",
      claimed_at: "",
      heartbeat_at: "",
      error_message: "",
      retry_count: 0,
      max_retries: input.max_retries,
      created_at: createdAt,
      started_at: "",
      finished_at: ""
    };
    jobs.push(job);
    await atomicWriteJson(this.paths.workerJobs, jobs);
    return clone(job);
  }

  async claimWorkerJob(input: { worker_id: string; job_types: WorkerJobType[] }) {
    await this.ensureInitialized();
    const jobs = await readJson<WorkerJob[]>(this.paths.workerJobs);
    const job = [...jobs]
      .filter((candidate) => candidate.status === "pending" || candidate.status === "retry_wait")
      .filter((candidate) => input.job_types.includes(candidate.job_type))
      .sort(sortWorkerJobs)[0];

    if (!job) {
      await this.upsertWorkerHeartbeat({ worker_id: input.worker_id, current_job_id: "", current_job_type: "" });
      return null;
    }

    const now = nowIso();
    const index = jobs.findIndex((candidate) => candidate.id === job.id);
    jobs[index] = {
      ...jobs[index],
      status: "claimed",
      claimed_by: input.worker_id,
      claimed_at: now,
      heartbeat_at: now,
      started_at: jobs[index].started_at || now,
      error_message: ""
    };
    await atomicWriteJson(this.paths.workerJobs, jobs);
    await this.upsertWorkerHeartbeat({
      worker_id: input.worker_id,
      current_job_id: job.id,
      current_job_type: job.job_type
    });
    return clone(jobs[index]);
  }

  async updateWorkerJobHeartbeat(id: string, worker_id: string) {
    await this.ensureInitialized();
    const jobs = await readJson<WorkerJob[]>(this.paths.workerJobs);
    const index = jobs.findIndex((job) => job.id === id && job.claimed_by === worker_id);
    if (index === -1) {
      return null;
    }
    jobs[index] = {
      ...jobs[index],
      status: jobs[index].status === "claimed" ? "processing" : jobs[index].status,
      heartbeat_at: nowIso()
    };
    await atomicWriteJson(this.paths.workerJobs, jobs);
    await this.upsertWorkerHeartbeat({ worker_id, current_job_id: id, current_job_type: jobs[index].job_type });
    return clone(jobs[index]);
  }

  async completeWorkerJob(id: string, worker_id: string, result: Record<string, unknown>) {
    await this.ensureInitialized();
    const jobs = await readJson<WorkerJob[]>(this.paths.workerJobs);
    const index = jobs.findIndex((job) => job.id === id && job.claimed_by === worker_id);
    if (index === -1) {
      return null;
    }
    if (jobs[index].job_type === "video_render" && !getResultUrl(result, "video_url")) {
      const retryCount = jobs[index].retry_count + 1;
      const status = retryCount < jobs[index].max_retries ? "retry_wait" : "failed";
      const errorMessage = "영상 렌더 결과에 video_url이 없어 완료 처리하지 않았습니다.";
      jobs[index] = {
        ...jobs[index],
        status,
        result,
        retry_count: retryCount,
        heartbeat_at: nowIso(),
        finished_at: status === "failed" ? nowIso() : "",
        error_message: errorMessage
      };
      await atomicWriteJson(this.paths.workerJobs, jobs);
      await this.persistWorkerJobAssets(jobs[index], { includeVideo: false });
      if (jobs[index].product_queue_id) {
        await this.updateQueueItem(jobs[index].product_queue_id, {
          queue_status: "error",
          error_message: errorMessage
        });
      }
      await this.upsertWorkerHeartbeat({ worker_id, current_job_id: "", current_job_type: "" });
      return clone(jobs[index]);
    }
    const finishedAt = nowIso();
    jobs[index] = {
      ...jobs[index],
      status: "completed",
      result,
      heartbeat_at: finishedAt,
      finished_at: finishedAt,
      error_message: ""
    };
    await atomicWriteJson(this.paths.workerJobs, jobs);
    await this.applyWorkerJobResult(jobs[index]);
    await this.upsertWorkerHeartbeat({ worker_id, current_job_id: "", current_job_type: "" });
    return clone(jobs[index]);
  }

  async failWorkerJob(id: string, worker_id: string, errorMessage: string) {
    await this.ensureInitialized();
    const jobs = await readJson<WorkerJob[]>(this.paths.workerJobs);
    const index = jobs.findIndex((job) => job.id === id && job.claimed_by === worker_id);
    if (index === -1) {
      return null;
    }
    const retryCount = jobs[index].retry_count + 1;
    const status = retryCount < jobs[index].max_retries ? "retry_wait" : "failed";
    jobs[index] = {
      ...jobs[index],
      status,
      retry_count: retryCount,
      error_message: errorMessage,
      heartbeat_at: nowIso(),
      finished_at: status === "failed" ? nowIso() : ""
    };
    await atomicWriteJson(this.paths.workerJobs, jobs);
    if (status === "failed" && jobs[index].product_queue_id) {
      await this.updateQueueItem(jobs[index].product_queue_id, { queue_status: "error", error_message: errorMessage });
    }
    await this.upsertWorkerHeartbeat({ worker_id, current_job_id: "", current_job_type: "" });
    return clone(jobs[index]);
  }

  async getWorkerHeartbeats() {
    await this.ensureInitialized();
    const heartbeats = await readJson<WorkerHeartbeat[]>(this.paths.workerHeartbeats);
    return clone(heartbeats.sort((a, b) => b.last_heartbeat_at.localeCompare(a.last_heartbeat_at)));
  }

  async upsertWorkerHeartbeat(input: {
    worker_id: string;
    current_job_id: string;
    current_job_type: WorkerJobType | "";
  }) {
    await this.ensureInitialized();
    const heartbeats = await readJson<WorkerHeartbeat[]>(this.paths.workerHeartbeats);
    const now = nowIso();
    const heartbeat: WorkerHeartbeat = {
      worker_id: input.worker_id,
      status: "online",
      current_job_id: input.current_job_id,
      current_job_type: input.current_job_type,
      last_heartbeat_at: now,
      updated_at: now
    };
    const index = heartbeats.findIndex((item) => item.worker_id === input.worker_id);
    if (index === -1) {
      heartbeats.push(heartbeat);
    } else {
      heartbeats[index] = heartbeat;
    }
    await atomicWriteJson(this.paths.workerHeartbeats, heartbeats);
    return clone(heartbeat);
  }

  async getProductCandidates(filters: ProductCandidateFilters = {}) {
    await this.ensureInitialized();
    const [candidates, queue, productionHistory] = await Promise.all([
      readJson<ProductCandidate[]>(this.paths.productCandidates),
      this.readQueue(),
      readJson<ProductionHistory[]>(this.paths.productionHistory)
    ]);
    return clone(filterProductCandidates(enrichProductCandidates(candidates, { queueItems: queue, productionHistory }), filters));
  }

  async getProductCandidate(id: string) {
    await this.ensureInitialized();
    const [candidates, queue, productionHistory] = await Promise.all([
      readJson<ProductCandidate[]>(this.paths.productCandidates),
      this.readQueue(),
      readJson<ProductionHistory[]>(this.paths.productionHistory)
    ]);
    const candidate = candidates.find((item) => item.id === id);
    return clone(candidate ? enrichProductCandidate(candidate, { candidates, queueItems: queue, productionHistory }) : null);
  }

  async updateProductCandidate(id: string, patch: Partial<ProductCandidate>) {
    await this.ensureInitialized();
    const candidates = await readJson<ProductCandidate[]>(this.paths.productCandidates);
    const index = candidates.findIndex((candidate) => candidate.id === id);
    if (index === -1) {
      return null;
    }
    candidates[index] = {
      ...candidates[index],
      ...patch,
      id,
      updated_at: nowIso()
    };
    await atomicWriteJson(this.paths.productCandidates, candidates);
    return clone(candidates[index]);
  }

  async promoteCandidateToQueue(candidateId: string, options: PromoteCandidateOptions = {}) {
    await this.ensureInitialized();
    const candidates = await readJson<ProductCandidate[]>(this.paths.productCandidates);
    const queue = await this.readQueue();
    const productionHistory = await readJson<ProductionHistory[]>(this.paths.productionHistory);
    const candidate = candidates.find((item) => item.id === candidateId) ?? null;
    const promotion = buildCandidatePromotion({
      candidate,
      queueItems: queue,
      productionHistory,
      now: options.now,
      scheduled_at: options.scheduled_at
    });
    queue.push(promotion.queue_item);
    await atomicWriteJson(
      this.paths.queue,
      queue.sort((a, b) => a.queue_rank - b.queue_rank)
    );
    const contents = await readJson<GeneratedContent[]>(this.paths.contents);
    const contentIndex = contents.findIndex(
      (content) => content.id === promotion.content.id || content.product_queue_id === promotion.content.product_queue_id
    );
    if (contentIndex === -1) {
      contents.push(promotion.content);
    } else {
      contents[contentIndex] = promotion.content;
    }
    await atomicWriteJson(this.paths.contents, contents);
    const candidateIndex = candidates.findIndex((item) => item.id === candidateId);
    if (candidateIndex !== -1) {
      candidates[candidateIndex] = {
        ...candidates[candidateIndex],
        ...promotion.candidate,
        promotion_status: "promoted",
        promoted_queue_id: promotion.queue_item.id,
        updated_at: nowIso()
      };
      await atomicWriteJson(this.paths.productCandidates, candidates);
    }
    return clone(promotion);
  }

  async upsertProductCandidates(candidates: ProductCandidate[]) {
    await this.ensureInitialized();
    const existing = await readJson<ProductCandidate[]>(this.paths.productCandidates);
    const [queue, productionHistory] = await Promise.all([
      this.readQueue(),
      readJson<ProductionHistory[]>(this.paths.productionHistory)
    ]);
    const normalized = candidates.map((candidate) =>
      enrichProductCandidate(candidate, {
        candidates: [...existing, ...candidates],
        queueItems: queue,
        productionHistory
      })
    );
    for (const candidate of normalized) {
      const index = existing.findIndex((item) => item.id === candidate.id);
      if (index === -1) {
        existing.push(candidate);
      } else {
        existing[index] = {
          ...existing[index],
          ...candidate,
          created_at: existing[index].created_at || candidate.created_at
        };
      }
    }
    await atomicWriteJson(this.paths.productCandidates, existing);
    return clone(normalized);
  }

  async getProductionHistory() {
    await this.ensureInitialized();
    return clone(await readJson<ProductionHistory[]>(this.paths.productionHistory));
  }

  async getProductAssets(productQueueId?: string) {
    await this.ensureInitialized();
    const assets = await readJson<ProductAsset[]>(this.paths.productAssets);
    return clone(productQueueId ? assets.filter((asset) => asset.product_queue_id === productQueueId) : assets);
  }

  async getChannelUploadPackages(productQueueId?: string) {
    await this.ensureInitialized();
    const packages = await readJson<ChannelUploadPackage[]>(this.paths.channelUploadPackages);
    return clone(productQueueId ? packages.filter((item) => item.product_queue_id === productQueueId) : packages);
  }

  async upsertChannelUploadPackage(input: ChannelUploadPackage) {
    await this.ensureInitialized();
    const packages = await readJson<ChannelUploadPackage[]>(this.paths.channelUploadPackages);
    const index = packages.findIndex((item) => item.id === input.id);
    if (index === -1) {
      packages.push(input);
      await atomicWriteJson(this.paths.channelUploadPackages, packages);
      return clone(input);
    }

    packages[index] = {
      ...packages[index],
      ...input,
      created_at: packages[index].created_at || input.created_at,
      updated_at: nowIso()
    };
    await atomicWriteJson(this.paths.channelUploadPackages, packages);
    return clone(packages[index]);
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
    await atomicWriteJson(this.paths.workerJobs, []);
    await atomicWriteJson(this.paths.workerHeartbeats, []);
    await atomicWriteJson(this.paths.productCandidates, []);
    await atomicWriteJson(this.paths.productionHistory, []);
    await atomicWriteJson(this.paths.productAssets, []);
    await atomicWriteJson(this.paths.channelUploadPackages, []);
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
    const workerJobsExists = await fileExists(this.paths.workerJobs);
    const workerHeartbeatsExists = await fileExists(this.paths.workerHeartbeats);
    const productCandidatesExists = await fileExists(this.paths.productCandidates);
    const productionHistoryExists = await fileExists(this.paths.productionHistory);
    const productAssetsExists = await fileExists(this.paths.productAssets);
    const channelUploadPackagesExists = await fileExists(this.paths.channelUploadPackages);

    if (
      settingsExists &&
      queueExists &&
      contentsExists &&
      runsExists &&
      workerJobsExists &&
      workerHeartbeatsExists &&
      productCandidatesExists &&
      productionHistoryExists &&
      productAssetsExists &&
      channelUploadPackagesExists
    ) {
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
    if (!workerJobsExists) {
      await atomicWriteJson(this.paths.workerJobs, []);
    }
    if (!workerHeartbeatsExists) {
      await atomicWriteJson(this.paths.workerHeartbeats, []);
    }
    if (!productCandidatesExists) {
      await atomicWriteJson(this.paths.productCandidates, []);
    }
    if (!productionHistoryExists) {
      await atomicWriteJson(this.paths.productionHistory, []);
    }
    if (!productAssetsExists) {
      await atomicWriteJson(this.paths.productAssets, []);
    }
    if (!channelUploadPackagesExists) {
      await atomicWriteJson(this.paths.channelUploadPackages, []);
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

  private async applyWorkerJobResult(job: WorkerJob) {
    if (job.job_type !== "video_render" || !job.product_queue_id) {
      return;
    }

    const result = job.result;
    const videoUrl = getResultUrl(result, "video_url");
    if (!videoUrl) {
      return;
    }
    const thumbnailUrl = getResultUrl(result, "thumbnail_url");

    await this.updateQueueItem(job.product_queue_id, {
      queue_status: "video_ready",
      video_url: videoUrl,
      video_snapshot_url: thumbnailUrl,
      error_message: ""
    });

    await this.persistWorkerJobAssets(job, { includeVideo: true });
    const productionHistory = await readJson<ProductionHistory[]>(this.paths.productionHistory);
    const dedupedHistory = productionHistory.filter((item) => item.id !== `history-${job.id}`);
    dedupedHistory.push({
      id: `history-${job.id}`,
      product_queue_id: job.product_queue_id,
      worker_job_id: job.id,
      event_type: "worker_job_completed",
      message: "Worker video render completed.",
      metadata: result,
      created_at: nowIso()
    });
    await atomicWriteJson(this.paths.productionHistory, dedupedHistory);
  }

  private async persistWorkerJobAssets(job: WorkerJob, options: { includeVideo: boolean }) {
    if (!job.product_queue_id) {
      return;
    }
    const result = job.result;
    const videoUrl = getResultUrl(result, "video_url");
    const thumbnailUrl = getResultUrl(result, "thumbnail_url");
    const srtUrl = getResultUrl(result, "srt_url");
    const uploadPackageUrl = getResultUrl(result, "upload_package_url");
    const productAssets = await readJson<ProductAsset[]>(this.paths.productAssets);
    const assets: Array<[ProductAsset["asset_type"], string, string]> = [
      ["video", "rendered-videos", videoUrl],
      ["thumbnail", "thumbnails", thumbnailUrl],
      ["subtitle", "subtitles", srtUrl],
      ["upload_package", "upload-packages", uploadPackageUrl]
    ];
    let updatedAssets = productAssets;
    for (const [assetType, bucket, url] of assets) {
      if (!url || (!options.includeVideo && assetType === "video")) {
        continue;
      }
      const id = `asset-${job.id}-${assetType}`;
      updatedAssets = updatedAssets.filter((asset) => asset.id !== id);
      updatedAssets.push({
        id,
        product_queue_id: job.product_queue_id,
        worker_job_id: job.id,
        asset_type: assetType,
        bucket,
        url,
        created_at: nowIso()
      });
    }
    await atomicWriteJson(this.paths.productAssets, updatedAssets);
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

function sortWorkerJobs(a: WorkerJob, b: WorkerJob) {
  return b.priority - a.priority || a.created_at.localeCompare(b.created_at);
}

function getResultUrl(result: Record<string, unknown>, key: string) {
  const value = result[key];
  return typeof value === "string" ? value.trim() : "";
}

export function createLocalJsonAutomationRepository(options: LocalJsonRepositoryOptions = {}) {
  return new LocalJsonAutomationRepository(options);
}
