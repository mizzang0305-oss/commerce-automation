import type {
  AutomationRun,
  AutomationSettings,
  GeneratedContent,
  Platform,
  ProductAsset,
  ProductCandidate,
  ProductQueueItem,
  ProductionHistory,
  QueueStatus,
  WorkerHeartbeat,
  WorkerJob,
  WorkerJobType
} from "@/types/automation";
import type {
  PromoteCandidateOptions,
  PromoteCandidateResult,
  ProductCandidateFilters
} from "@/lib/candidatePromotion";

export type QueueFilters = {
  date?: string;
  status?: QueueStatus | "all";
  upload_status?: string;
  keyword?: string;
  theme?: string;
  priority?: "issues-first";
  limit?: number;
};

export type QueueSummary = {
  total: number;
  scheduled: number;
  processing: number;
  content_ready: number;
  video_render_started: number;
  video_ready: number;
  blog_draft_created: number;
  ready_for_manual_upload: number;
  uploaded: number;
  posted: number;
  manual_review: number;
  error: number;
  skipped: number;
  hold: number;
};

export type SettingsValidationResult =
  | { ok: true; value: Partial<AutomationSettings> }
  | { ok: false; message: string; field?: keyof AutomationSettings };

export interface AutomationRepository {
  getSettings(): Promise<AutomationSettings>;
  updateSettings(input: Partial<AutomationSettings>): Promise<AutomationSettings>;
  getQueue(filters?: QueueFilters): Promise<ProductQueueItem[]>;
  getQueueSummary(): Promise<QueueSummary>;
  getQueueItem(id: string): Promise<ProductQueueItem | null>;
  retryQueueItem(id: string): Promise<ProductQueueItem | null>;
  holdQueueItem(id: string): Promise<ProductQueueItem | null>;
  skipQueueItem(id: string): Promise<ProductQueueItem | null>;
  markManualUploaded(id: string, platform: Platform): Promise<ProductQueueItem | null>;
  upsertQueueItems(items: ProductQueueItem[]): Promise<void>;
  updateQueueItemByRawUrl(
    raw_coupang_url: string,
    patch: Partial<ProductQueueItem>
  ): Promise<ProductQueueItem | null>;
  updateQueueItemById(id: string, patch: Partial<ProductQueueItem>): Promise<ProductQueueItem | null>;
  getRuns(): Promise<AutomationRun[]>;
  appendRun(run: AutomationRun): Promise<AutomationRun>;
  getGeneratedContentByQueueItem(id: string): Promise<GeneratedContent | null>;
  upsertGeneratedContent(content: GeneratedContent): Promise<GeneratedContent>;
  getWorkerJobs(filters?: { status?: WorkerJob["status"] | "all"; job_type?: WorkerJobType | "all" }): Promise<WorkerJob[]>;
  getWorkerJob(id: string): Promise<WorkerJob | null>;
  createWorkerJob(input: {
    job_type: WorkerJobType;
    product_queue_id: string;
    product_candidate_id: string;
    priority: number;
    payload: Record<string, unknown>;
    max_retries: number;
  }): Promise<WorkerJob>;
  claimWorkerJob(input: { worker_id: string; job_types: WorkerJobType[] }): Promise<WorkerJob | null>;
  updateWorkerJobHeartbeat(id: string, worker_id: string): Promise<WorkerJob | null>;
  completeWorkerJob(id: string, worker_id: string, result: Record<string, unknown>): Promise<WorkerJob | null>;
  failWorkerJob(id: string, worker_id: string, errorMessage: string): Promise<WorkerJob | null>;
  getWorkerHeartbeats(): Promise<WorkerHeartbeat[]>;
  upsertWorkerHeartbeat(input: {
    worker_id: string;
    current_job_id: string;
    current_job_type: WorkerJobType | "";
  }): Promise<WorkerHeartbeat>;
  getProductCandidates(filters?: ProductCandidateFilters): Promise<ProductCandidate[]>;
  getProductCandidate(id: string): Promise<ProductCandidate | null>;
  updateProductCandidate(id: string, patch: Partial<ProductCandidate>): Promise<ProductCandidate | null>;
  promoteCandidateToQueue(candidateId: string, options?: PromoteCandidateOptions): Promise<PromoteCandidateResult>;
  upsertProductCandidates(candidates: ProductCandidate[]): Promise<ProductCandidate[]>;
  getProductionHistory(): Promise<ProductionHistory[]>;
  getProductAssets(productQueueId?: string): Promise<ProductAsset[]>;
}

export interface MutableMockAutomationRepository extends AutomationRepository {
  seedQueue(mode?: "default" | "error-sample" | "simulate-transition"): Promise<ProductQueueItem[]>;
  resetSettings(): Promise<AutomationSettings>;
  resetStorage?(): Promise<void>;
}
