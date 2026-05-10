import type {
  AutomationRun,
  AutomationSettings,
  GeneratedContent,
  Platform,
  ProductQueueItem,
  QueueStatus
} from "@/types/automation";

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
  getRuns(): Promise<AutomationRun[]>;
  appendRun(run: AutomationRun): Promise<AutomationRun>;
  getGeneratedContentByQueueItem(id: string): Promise<GeneratedContent | null>;
}

export interface MutableMockAutomationRepository extends AutomationRepository {
  seedQueue(mode?: "default" | "error-sample" | "simulate-transition"): Promise<ProductQueueItem[]>;
  resetSettings(): Promise<AutomationSettings>;
  resetStorage?(): Promise<void>;
}
