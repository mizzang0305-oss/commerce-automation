import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AutomationRun,
  AutomationSettings,
  ChannelProfile,
  ChannelUploadPackage,
  GeneratedContent,
  Platform,
  ProductAsset,
  ProductCandidate,
  ProductQueueItem,
  ProductionHistory,
  QueueStatus,
  WorkerHeartbeat,
  WorkerJob,
  WorkerJobStatus,
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
  SettingsValidationError,
  validateSettingsInput
} from "@/lib/repositories/mockAutomationRepository";
import { getQueueSummary } from "@/lib/status";
import { assignSlots } from "@/lib/scheduler";
import { getSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { normalizeChannelUploadPackage } from "@/lib/channels/uploadResult";
import { getDefaultChannelProfiles } from "@/lib/channels/defaultChannels";
import { normalizeChannelProfile } from "@/lib/channels/channelProfileAdmin";
import {
  buildCandidatePromotion,
  filterProductCandidates,
  type ProductCandidateFilters,
  type PromoteCandidateOptions
} from "@/lib/candidatePromotion";
import { enrichProductCandidate, enrichProductCandidates } from "@/lib/candidates/candidateNormalizer";

type JsonMap = Record<string, unknown>;

export type SupabaseQueryError = {
  code?: string;
  message: string;
  details?: string | null;
  detail?: string | null;
  hint?: string | null;
};

export class SupabaseRepositoryError extends Error {
  action: string;
  supabaseError: SupabaseQueryError;

  constructor(action: string, supabaseError: SupabaseQueryError) {
    super(`Supabase repository ${action} failed.`);
    this.name = "SupabaseRepositoryError";
    this.action = action;
    this.supabaseError = supabaseError;
  }
}

export type SupabaseWorkerJobRow = {
  id: string;
  job_type: string;
  status: string;
  product_queue_id: string | null;
  product_candidate_id: string | null;
  priority: number | null;
  payload: JsonMap | null;
  result: JsonMap | null;
  claimed_by: string | null;
  claimed_at: string | null;
  heartbeat_at: string | null;
  error_message: string | null;
  retry_count: number | null;
  max_retries: number | null;
  created_at: string | null;
  started_at: string | null;
  finished_at: string | null;
};

export type SupabaseRepositoryOptions = {
  client?: SupabaseClient;
};

const VIDEO_RENDER_MISSING_URL_MESSAGE =
  "영상 렌더 결과에 video_url이 없어 완료 처리하지 않았습니다.";

function nowIso() {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sanitizeRun(run: AutomationRun): AutomationRun {
  return {
    ...run,
    log: run.log
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted]")
      .replace(/https?:\/\/[^\s"]*webhook[^\s"]*/gi, "[webhook-url-redacted]")
  };
}

function ensureRecord(value: unknown): JsonMap {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonMap) : {};
}

function emptyString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberOrDefault(value: unknown, defaultValue: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : defaultValue;
  }
  return defaultValue;
}

function booleanOrDefault(value: unknown, defaultValue: boolean) {
  return typeof value === "boolean" ? value : defaultValue;
}

function stripUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}

function getResultUrl(result: Record<string, unknown>, key: string) {
  const value = result[key];
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeSupabaseDiagnostic(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value
    .replace(/SUPABASE_SERVICE_ROLE_KEY/gi, "[redacted-secret-name]")
    .replace(/WORKER_API_SECRET/gi, "[redacted-secret-name]")
    .replace(/R2_SECRET/gi, "[redacted-secret-name]")
    .replace(/S3_SECRET_ACCESS_KEY/gi, "[redacted-secret-name]")
    .replace(/Authorization/gi, "[redacted-header]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]");
}

function throwIfSupabaseError(error: SupabaseQueryError | null | undefined, action: string) {
  if (error) {
    console.error("[supabase-repository] query failed", {
      action,
      code: error.code ?? "",
      message: sanitizeSupabaseDiagnostic(error.message),
      detail: sanitizeSupabaseDiagnostic(error.detail ?? error.details),
      hint: sanitizeSupabaseDiagnostic(error.hint)
    });
    throw new SupabaseRepositoryError(action, error);
  }
}

function sortWorkerJobs(a: WorkerJob, b: WorkerJob) {
  return b.priority - a.priority || a.created_at.localeCompare(b.created_at);
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

export function mapSupabaseWorkerJob(row: SupabaseWorkerJobRow): WorkerJob {
  return {
    id: row.id,
    job_type: row.job_type as WorkerJobType,
    status: row.status as WorkerJobStatus,
    product_queue_id: row.product_queue_id ?? "",
    product_candidate_id: row.product_candidate_id ?? "",
    priority: row.priority ?? 0,
    payload: ensureRecord(row.payload),
    result: ensureRecord(row.result),
    claimed_by: row.claimed_by ?? "",
    claimed_at: row.claimed_at ?? "",
    heartbeat_at: row.heartbeat_at ?? "",
    error_message: row.error_message ?? "",
    retry_count: row.retry_count ?? 0,
    max_retries: row.max_retries ?? 3,
    created_at: row.created_at ?? "",
    started_at: row.started_at ?? "",
    finished_at: row.finished_at ?? ""
  };
}

function nullableTimestamp(value: string) {
  return value.trim() ? value : null;
}

export function serializeSupabaseWorkerJobForWrite(job: WorkerJob): Record<string, unknown> {
  return {
    ...job,
    claimed_at: nullableTimestamp(job.claimed_at),
    heartbeat_at: nullableTimestamp(job.heartbeat_at),
    started_at: nullableTimestamp(job.started_at),
    finished_at: nullableTimestamp(job.finished_at)
  };
}

export function validateSupabaseWorkerJobCompletion(job: WorkerJob, result: Record<string, unknown>) {
  if (job.job_type !== "video_render" || getResultUrl(result, "video_url")) {
    return { ok: true as const };
  }

  const retryCount = job.retry_count + 1;
  return {
    ok: false as const,
    retryCount,
    status: retryCount < job.max_retries ? "retry_wait" as const : "failed" as const,
    errorMessage: VIDEO_RENDER_MISSING_URL_MESSAGE
  };
}

export function buildSupabaseAssetRowsForWorkerJob(job: WorkerJob, options: { includeVideo: boolean }): ProductAsset[] {
  if (!job.product_queue_id) {
    return [];
  }

  const assets: Array<[ProductAsset["asset_type"], string, string]> = [
    ["video", "rendered-videos", getResultUrl(job.result, "video_url")],
    ["thumbnail", "thumbnails", getResultUrl(job.result, "thumbnail_url")],
    ["subtitle", "subtitles", getResultUrl(job.result, "srt_url")],
    ["upload_package", "upload-packages", getResultUrl(job.result, "upload_package_url")]
  ];

  return assets
    .filter(([assetType, , url]) => Boolean(url) && (options.includeVideo || assetType !== "video"))
    .map(([assetType, bucket, url]) => ({
      id: `asset-${job.id}-${assetType}`,
      product_queue_id: job.product_queue_id,
      worker_job_id: job.id,
      asset_type: assetType,
      bucket,
      url,
      render_qa_metadata: {},
      qa_status: "pending",
      qa_note: "",
      created_at: nowIso(),
      updated_at: nowIso()
    }));
}

function mapSettingsRow(row: Partial<AutomationSettings> | null | undefined): AutomationSettings {
  return {
    ...createDefaultSettings(),
    ...row,
    id: row?.id ?? "default",
    allowed_worker_job_types: Array.isArray(row?.allowed_worker_job_types)
      ? row.allowed_worker_job_types
      : createDefaultSettings().allowed_worker_job_types,
    category_include: Array.isArray(row?.category_include) ? row.category_include : [],
    category_exclude: Array.isArray(row?.category_exclude) ? row.category_exclude : createDefaultSettings().category_exclude,
    updated_at: row?.updated_at ?? nowIso()
  };
}

function mapQueueRow(row: Record<string, unknown>): ProductQueueItem {
  return {
    id: emptyString(row.id),
    queue_date: emptyString(row.queue_date),
    queue_rank: numberOrDefault(row.queue_rank, 0),
    upload_slot: numberOrDefault(row.upload_slot, 0),
    scheduled_at: emptyString(row.scheduled_at),
    keyword: emptyString(row.keyword),
    theme: emptyString(row.theme),
    product_name: emptyString(row.product_name),
    category_path: emptyString(row.category_path),
    price_now_text: emptyString(row.price_now_text),
    thumbnail_url: emptyString(row.thumbnail_url),
    raw_coupang_url: emptyString(row.raw_coupang_url),
    selected_affiliate_url: emptyString(row.selected_affiliate_url),
    product_score: numberOrDefault(row.product_score, 0),
    score_reason: emptyString(row.score_reason),
    video_angle: emptyString(row.video_angle),
    queue_status: (emptyString(row.queue_status) || "scheduled") as QueueStatus,
    video_url: emptyString(row.video_url),
    video_snapshot_url: emptyString(row.video_snapshot_url),
    blog_draft_url: emptyString(row.blog_draft_url),
    youtube_upload_status: (emptyString(row.youtube_upload_status) || "not_ready") as ProductQueueItem["youtube_upload_status"],
    tiktok_upload_status: (emptyString(row.tiktok_upload_status) || "not_ready") as ProductQueueItem["tiktok_upload_status"],
    threads_post_status: (emptyString(row.threads_post_status) || "not_ready") as ProductQueueItem["threads_post_status"],
    manual_review_status: (emptyString(row.manual_review_status) || "not_ready") as ProductQueueItem["manual_review_status"],
    error_message: emptyString(row.error_message),
    created_at: emptyString(row.created_at),
    updated_at: emptyString(row.updated_at)
  };
}

function mapGeneratedContentRow(row: Record<string, unknown>): GeneratedContent {
  return {
    id: emptyString(row.id),
    product_queue_id: emptyString(row.product_queue_id),
    raw_coupang_url: emptyString(row.raw_coupang_url),
    product_name: emptyString(row.product_name),
    selected_affiliate_url: emptyString(row.selected_affiliate_url),
    video_title: emptyString(row.video_title),
    video_script: emptyString(row.video_script),
    caption_1: emptyString(row.caption_1),
    caption_2: emptyString(row.caption_2),
    caption_3: emptyString(row.caption_3),
    threads_text: emptyString(row.threads_text),
    blog_title: emptyString(row.blog_title),
    blog_body: emptyString(row.blog_body),
    hashtags: emptyString(row.hashtags),
    youtube_description: emptyString(row.youtube_description),
    tiktok_caption: emptyString(row.tiktok_caption),
    disclosure_text: emptyString(row.disclosure_text),
    content_source: (emptyString(row.content_source) || "fallback") as GeneratedContent["content_source"],
    creatomate_render_id: emptyString(row.creatomate_render_id),
    video_url: emptyString(row.video_url),
    video_snapshot_url: emptyString(row.video_snapshot_url),
    video_status: emptyString(row.video_status),
    blog_draft_url: emptyString(row.blog_draft_url),
    blog_draft_status: emptyString(row.blog_draft_status),
    render_plan_override: normalizeRenderPlanOverrideRow(row.render_plan_override),
    render_plan_override_updated_at: emptyString(row.render_plan_override_updated_at),
    render_plan_override_updated_by: emptyString(row.render_plan_override_updated_by),
    created_at: emptyString(row.created_at),
    updated_at: emptyString(row.updated_at)
  };
}

function normalizeRenderPlanOverrideRow(value: unknown): GeneratedContent["render_plan_override"] {
  return value && typeof value === "object" && !Array.isArray(value) && Array.isArray((value as { shots?: unknown }).shots)
    ? value as GeneratedContent["render_plan_override"]
    : null;
}

function mapRunRow(row: Record<string, unknown>): AutomationRun {
  return {
    id: emptyString(row.id),
    request_id: emptyString(row.request_id) || undefined,
    n8n_run_id: emptyString(row.n8n_run_id) || undefined,
    http_status: typeof row.http_status === "number" ? row.http_status : undefined,
    run_type: (emptyString(row.run_type) || "manual_batch") as AutomationRun["run_type"],
    status: (emptyString(row.status) || "success") as AutomationRun["status"],
    processed_count: numberOrDefault(row.processed_count, 0),
    error_count: numberOrDefault(row.error_count, 0),
    started_at: emptyString(row.started_at),
    finished_at: emptyString(row.finished_at),
    log: emptyString(row.log),
    safe_message: emptyString(row.safe_message)
  };
}

function mapHeartbeatRow(row: Record<string, unknown>): WorkerHeartbeat {
  return {
    worker_id: emptyString(row.worker_id),
    status: (emptyString(row.status) || "offline") as WorkerHeartbeat["status"],
    current_job_id: emptyString(row.current_job_id),
    current_job_type: (emptyString(row.current_job_type) || "") as WorkerHeartbeat["current_job_type"],
    last_heartbeat_at: emptyString(row.last_heartbeat_at),
    updated_at: emptyString(row.updated_at)
  };
}

function mapCandidateRow(row: Record<string, unknown>): ProductCandidate {
  return {
    id: emptyString(row.id),
    product_name: emptyString(row.product_name),
    raw_coupang_url: emptyString(row.raw_coupang_url),
    selected_affiliate_url: emptyString(row.selected_affiliate_url),
    product_key: emptyString(row.product_key),
    platform: emptyString(row.platform),
    source_type: emptyString(row.source_type),
    source_name: emptyString(row.source_name),
    category: emptyString(row.category),
    candidate_score: numberOrDefault(row.candidate_score, 0),
    score_reason: emptyString(row.score_reason),
    duplicate_status: (emptyString(row.duplicate_status) || "unknown") as ProductCandidate["duplicate_status"],
    duplicate_reason: emptyString(row.duplicate_reason),
    promotion_status: (emptyString(row.promotion_status) || "needs_review") as ProductCandidate["promotion_status"],
    promoted_queue_id: emptyString(row.promoted_queue_id),
    payload: ensureRecord(row.payload),
    created_at: emptyString(row.created_at),
    updated_at: emptyString(row.updated_at)
  };
}

function mapAssetRow(row: Record<string, unknown>): ProductAsset {
  return {
    id: emptyString(row.id),
    product_queue_id: emptyString(row.product_queue_id),
    worker_job_id: emptyString(row.worker_job_id),
    asset_type: emptyString(row.asset_type) as ProductAsset["asset_type"],
    bucket: emptyString(row.bucket),
    url: emptyString(row.url),
    render_qa_metadata: ensureRecord(row.render_qa_metadata),
    qa_status: (emptyString(row.qa_status) || "pending") as ProductAsset["qa_status"],
    qa_note: emptyString(row.qa_note),
    created_at: emptyString(row.created_at),
    updated_at: emptyString(row.updated_at)
  };
}

function mapChannelProfileRow(row: Record<string, unknown>): ChannelProfile {
  return normalizeChannelProfile({
    id: emptyString(row.id),
    channel_key: emptyString(row.channel_key),
    channel_name: emptyString(row.channel_name),
    platform: (emptyString(row.platform) || "youtube") as ChannelProfile["platform"],
    youtube_channel_id: emptyString(row.youtube_channel_id),
    youtube_handle: emptyString(row.youtube_handle),
    niche: emptyString(row.niche),
    allowed_categories: Array.isArray(row.allowed_categories) ? row.allowed_categories.filter((entry): entry is string => typeof entry === "string") : [],
    excluded_categories: Array.isArray(row.excluded_categories) ? row.excluded_categories.filter((entry): entry is string => typeof entry === "string") : [],
    default_hashtags: Array.isArray(row.default_hashtags) ? row.default_hashtags.filter((entry): entry is string => typeof entry === "string") : [],
    title_template: emptyString(row.title_template),
    description_template: emptyString(row.description_template),
    hashtag_template: emptyString(row.hashtag_template),
    pinned_comment_template: emptyString(row.pinned_comment_template),
    upload_window: ensureRecord(row.upload_window),
    status: (emptyString(row.status) || "active") as ChannelProfile["status"],
    upload_enabled: booleanOrDefault(row.upload_enabled, false),
    manual_upload_only: booleanOrDefault(row.manual_upload_only, true),
    created_at: emptyString(row.created_at),
    updated_at: emptyString(row.updated_at)
  });
}

function mapChannelUploadPackageRow(row: Record<string, unknown>): ChannelUploadPackage {
  return {
    id: emptyString(row.id),
    product_queue_id: emptyString(row.product_queue_id),
    channel_profile_id: emptyString(row.channel_profile_id),
    platform: (emptyString(row.platform) || "youtube") as ChannelUploadPackage["platform"],
    title: emptyString(row.title),
    description: emptyString(row.description),
    hashtags: emptyString(row.hashtags),
    disclosure_text: emptyString(row.disclosure_text),
    video_url: emptyString(row.video_url),
    thumbnail_url: emptyString(row.thumbnail_url),
    subtitle_url: emptyString(row.subtitle_url),
    upload_package_url: emptyString(row.upload_package_url),
    status: (emptyString(row.status) || "manual_ready") as ChannelUploadPackage["status"],
    uploaded_url: emptyString(row.uploaded_url),
    uploaded_at: emptyString(row.uploaded_at),
    uploaded_by: emptyString(row.uploaded_by),
    upload_notes: emptyString(row.upload_notes),
    platform_upload_status: emptyString(row.platform_upload_status) || "manual_ready",
    upload_enabled: booleanOrDefault(row.upload_enabled, false),
    manual_upload_only: booleanOrDefault(row.manual_upload_only, true),
    created_at: emptyString(row.created_at),
    updated_at: emptyString(row.updated_at)
  };
}

function mapProductionHistoryRow(row: Record<string, unknown>): ProductionHistory {
  return {
    id: emptyString(row.id),
    product_queue_id: emptyString(row.product_queue_id),
    worker_job_id: emptyString(row.worker_job_id),
    event_type: emptyString(row.event_type),
    message: emptyString(row.message),
    metadata: ensureRecord(row.metadata),
    created_at: emptyString(row.created_at)
  };
}

export class SupabaseAutomationRepository implements MutableMockAutomationRepository {
  private client: SupabaseClient;

  constructor(options: SupabaseRepositoryOptions = {}) {
    this.client = options.client ?? getSupabaseAdminClient();
  }

  async getSettings() {
    const { data, error } = await this.client
      .from("automation_settings")
      .select("*")
      .eq("id", "default")
      .maybeSingle();
    throwIfSupabaseError(error, "getSettings");

    if (!data) {
      const defaults = createDefaultSettings();
      await this.upsertRows("automation_settings", defaults);
      return clone(defaults);
    }

    return clone(mapSettingsRow(data as Partial<AutomationSettings>));
  }

  async updateSettings(input: Partial<AutomationSettings>) {
    const validation = validateSettingsInput(input);
    if (!validation.ok) {
      throw new SettingsValidationError(validation.message, validation.field);
    }

    const settings = {
      ...(await this.getSettings()),
      ...validation.value,
      id: "default",
      updated_at: nowIso()
    };
    await this.upsertRows("automation_settings", settings);

    const queue = assignSlots(await this.getQueue(), settings);
    if (queue.length > 0) {
      await this.upsertRows("product_queue", queue);
    }

    return clone(settings);
  }

  async getQueue(filters: QueueFilters = {}) {
    const { data, error } = await this.client
      .from("product_queue")
      .select("*")
      .order("queue_rank", { ascending: true });
    throwIfSupabaseError(error, "getQueue");

    let items = ((data ?? []) as Record<string, unknown>[]).map(mapQueueRow);
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
    return getQueueSummary(await this.getQueue());
  }

  async getQueueItem(id: string) {
    const { data, error } = await this.client
      .from("product_queue")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    throwIfSupabaseError(error, "getQueueItem");
    return data ? clone(mapQueueRow(data as Record<string, unknown>)) : null;
  }

  async retryQueueItem(id: string) {
    return this.updateQueueItemById(id, {
      queue_status: "scheduled",
      error_message: "",
      youtube_upload_status: "not_ready",
      tiktok_upload_status: "not_ready",
      threads_post_status: "not_ready",
      manual_review_status: "not_ready"
    });
  }

  async holdQueueItem(id: string) {
    return this.updateQueueItemById(id, { queue_status: "hold" });
  }

  async skipQueueItem(id: string) {
    return this.updateQueueItemById(id, { queue_status: "skipped" });
  }

  async markManualUploaded(id: string, platform: Platform) {
    const item = await this.getQueueItem(id);
    if (!item) {
      return null;
    }
    const patch: Partial<ProductQueueItem> = {
      manual_review_status: "approved"
    };
    if (platform === "youtube") {
      patch.youtube_upload_status = "manual_review";
      patch.queue_status = "uploaded";
    }
    if (platform === "tiktok") {
      patch.tiktok_upload_status = "uploaded";
      patch.queue_status = "uploaded";
    }
    if (platform === "threads") {
      patch.threads_post_status = "posted";
      patch.queue_status = "posted";
    }
    return this.updateQueueItemById(id, patch);
  }

  async upsertQueueItems(items: ProductQueueItem[]) {
    if (items.length === 0) {
      return;
    }
    const rows: ProductQueueItem[] = [];
    for (const item of items) {
      const existing = item.raw_coupang_url
        ? await this.getQueueItemByRawUrl(item.raw_coupang_url)
        : null;
      rows.push({
        ...item,
        id: existing?.id || item.id,
        updated_at: nowIso()
      });
    }
    await this.upsertRows("product_queue", rows);
  }

  async updateQueueItemByRawUrl(raw_coupang_url: string, patch: Partial<ProductQueueItem>) {
    const { data, error } = await this.client
      .from("product_queue")
      .update(stripUndefined({ ...patch, updated_at: nowIso() }))
      .eq("raw_coupang_url", raw_coupang_url)
      .select("*")
      .maybeSingle();
    throwIfSupabaseError(error, "updateQueueItemByRawUrl");
    return data ? clone(mapQueueRow(data as Record<string, unknown>)) : null;
  }

  async updateQueueItemById(id: string, patch: Partial<ProductQueueItem>) {
    const { data, error } = await this.client
      .from("product_queue")
      .update(stripUndefined({ ...patch, updated_at: nowIso() }))
      .eq("id", id)
      .select("*")
      .maybeSingle();
    throwIfSupabaseError(error, "updateQueueItemById");
    return data ? clone(mapQueueRow(data as Record<string, unknown>)) : null;
  }

  async getRuns() {
    const { data, error } = await this.client
      .from("automation_runs")
      .select("*")
      .order("started_at", { ascending: false });
    throwIfSupabaseError(error, "getRuns");
    return clone(((data ?? []) as Record<string, unknown>[]).map(mapRunRow));
  }

  async appendRun(run: AutomationRun) {
    const safeRun = sanitizeRun(run);
    await this.upsertRows("automation_runs", safeRun);
    return clone(safeRun);
  }

  async getGeneratedContentByQueueItem(id: string) {
    const { data, error } = await this.client
      .from("generated_contents")
      .select("*")
      .eq("product_queue_id", id)
      .maybeSingle();
    throwIfSupabaseError(error, "getGeneratedContentByQueueItem");
    return data ? clone(mapGeneratedContentRow(data as Record<string, unknown>)) : null;
  }

  async upsertGeneratedContent(content: GeneratedContent) {
    const existing = await this.getGeneratedContentByQueueItem(content.product_queue_id);
    const payload = {
      ...content,
      id: existing?.id || content.id,
      updated_at: nowIso()
    };
    const { data, error } = await this.client
      .from("generated_contents")
      .upsert(payload, { onConflict: "product_queue_id" })
      .select("*")
      .single();
    throwIfSupabaseError(error, "upsertGeneratedContent");
    return clone(mapGeneratedContentRow(data as Record<string, unknown>));
  }

  async getWorkerJobs(filters: { status?: WorkerJob["status"] | "all"; job_type?: WorkerJobType | "all" } = {}) {
    const { data, error } = await this.client
      .from("worker_jobs")
      .select("*")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true });
    throwIfSupabaseError(error, "getWorkerJobs");
    let jobs = ((data ?? []) as SupabaseWorkerJobRow[]).map(mapSupabaseWorkerJob);
    if (filters.status && filters.status !== "all") {
      jobs = jobs.filter((job) => job.status === filters.status);
    }
    if (filters.job_type && filters.job_type !== "all") {
      jobs = jobs.filter((job) => job.job_type === filters.job_type);
    }
    return clone(jobs.sort(sortWorkerJobs));
  }

  async getWorkerJob(id: string) {
    const { data, error } = await this.client
      .from("worker_jobs")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    throwIfSupabaseError(error, "getWorkerJob");
    return data ? clone(mapSupabaseWorkerJob(data as SupabaseWorkerJobRow)) : null;
  }

  async createWorkerJob(input: {
    job_type: WorkerJobType;
    product_queue_id: string;
    product_candidate_id: string;
    priority: number;
    payload: Record<string, unknown>;
    max_retries: number;
  }) {
    const createdAt = nowIso();
    const job: WorkerJob = {
      id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
    await this.upsertRows("worker_jobs", serializeSupabaseWorkerJobForWrite(job));
    return clone(job);
  }

  async claimWorkerJob(input: { worker_id: string; job_types: WorkerJobType[] }) {
    const { data, error } = await this.client
      .from("worker_jobs")
      .select("*")
      .in("status", ["pending", "retry_wait"])
      .in("job_type", input.job_types)
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    throwIfSupabaseError(error, "claimWorkerJob.select");

    if (!data) {
      await this.upsertWorkerHeartbeat({ worker_id: input.worker_id, current_job_id: "", current_job_type: "" });
      return null;
    }

    const job = mapSupabaseWorkerJob(data as SupabaseWorkerJobRow);
    const now = nowIso();
    const { data: updated, error: updateError } = await this.client
      .from("worker_jobs")
      .update({
        status: "claimed",
        claimed_by: input.worker_id,
        claimed_at: now,
        heartbeat_at: now,
        started_at: job.started_at || now,
        error_message: ""
      })
      .eq("id", job.id)
      .in("status", ["pending", "retry_wait"])
      .select("*")
      .maybeSingle();
    throwIfSupabaseError(updateError, "claimWorkerJob.update");

    if (!updated) {
      await this.upsertWorkerHeartbeat({ worker_id: input.worker_id, current_job_id: "", current_job_type: "" });
      return null;
    }

    const claimed = mapSupabaseWorkerJob(updated as SupabaseWorkerJobRow);
    await this.upsertWorkerHeartbeat({
      worker_id: input.worker_id,
      current_job_id: claimed.id,
      current_job_type: claimed.job_type
    });
    return clone(claimed);
  }

  async updateWorkerJobHeartbeat(id: string, worker_id: string) {
    const current = await this.getWorkerJob(id);
    if (!current || current.claimed_by !== worker_id) {
      return null;
    }

    const { data, error } = await this.client
      .from("worker_jobs")
      .update({
        status: current.status === "claimed" ? "processing" : current.status,
        heartbeat_at: nowIso()
      })
      .eq("id", id)
      .eq("claimed_by", worker_id)
      .select("*")
      .maybeSingle();
    throwIfSupabaseError(error, "updateWorkerJobHeartbeat");

    if (!data) {
      return null;
    }

    const job = mapSupabaseWorkerJob(data as SupabaseWorkerJobRow);
    await this.upsertWorkerHeartbeat({ worker_id, current_job_id: id, current_job_type: job.job_type });
    return clone(job);
  }

  async completeWorkerJob(id: string, worker_id: string, result: Record<string, unknown>) {
    const job = await this.getWorkerJob(id);
    if (!job || job.claimed_by !== worker_id) {
      return null;
    }

    const validation = validateSupabaseWorkerJobCompletion(job, result);
    if (!validation.ok) {
      const { data, error } = await this.client
        .from("worker_jobs")
        .update({
          status: validation.status,
          result,
          retry_count: validation.retryCount,
          heartbeat_at: nowIso(),
          finished_at: validation.status === "failed" ? nowIso() : null,
          error_message: validation.errorMessage
        })
        .eq("id", id)
        .eq("claimed_by", worker_id)
        .select("*")
        .maybeSingle();
      throwIfSupabaseError(error, "completeWorkerJob.rejectMissingVideoUrl");

      if (!data) {
        return null;
      }

      const updated = mapSupabaseWorkerJob(data as SupabaseWorkerJobRow);
      await this.persistWorkerJobAssets(updated, { includeVideo: false });
      if (updated.product_queue_id) {
        await this.updateQueueItemById(updated.product_queue_id, {
          queue_status: "error",
          error_message: validation.errorMessage
        });
      }
      await this.upsertWorkerHeartbeat({ worker_id, current_job_id: "", current_job_type: "" });
      return clone(updated);
    }

    const finishedAt = nowIso();
    const { data, error } = await this.client
      .from("worker_jobs")
      .update({
        status: "completed",
        result,
        heartbeat_at: finishedAt,
        finished_at: finishedAt,
        error_message: ""
      })
      .eq("id", id)
      .eq("claimed_by", worker_id)
      .select("*")
      .maybeSingle();
    throwIfSupabaseError(error, "completeWorkerJob");

    if (!data) {
      return null;
    }

    const completed = mapSupabaseWorkerJob(data as SupabaseWorkerJobRow);
    await this.applyWorkerJobResult(completed);
    await this.upsertWorkerHeartbeat({ worker_id, current_job_id: "", current_job_type: "" });
    return clone(completed);
  }

  async failWorkerJob(id: string, worker_id: string, errorMessage: string) {
    const job = await this.getWorkerJob(id);
    if (!job || job.claimed_by !== worker_id) {
      return null;
    }

    const retryCount = job.retry_count + 1;
    const status = retryCount < job.max_retries ? "retry_wait" : "failed";
    const { data, error } = await this.client
      .from("worker_jobs")
      .update({
        status,
        retry_count: retryCount,
        error_message: errorMessage,
        heartbeat_at: nowIso(),
        finished_at: status === "failed" ? nowIso() : null
      })
      .eq("id", id)
      .eq("claimed_by", worker_id)
      .select("*")
      .maybeSingle();
    throwIfSupabaseError(error, "failWorkerJob");

    if (!data) {
      return null;
    }

    const updated = mapSupabaseWorkerJob(data as SupabaseWorkerJobRow);
    if (status === "failed" && updated.product_queue_id) {
      await this.updateQueueItemById(updated.product_queue_id, {
        queue_status: "error",
        error_message: errorMessage
      });
    }
    await this.upsertWorkerHeartbeat({ worker_id, current_job_id: "", current_job_type: "" });
    return clone(updated);
  }

  async getWorkerHeartbeats() {
    const { data, error } = await this.client
      .from("worker_heartbeats")
      .select("*")
      .order("last_heartbeat_at", { ascending: false });
    throwIfSupabaseError(error, "getWorkerHeartbeats");
    return clone(((data ?? []) as Record<string, unknown>[]).map(mapHeartbeatRow));
  }

  async upsertWorkerHeartbeat(input: {
    worker_id: string;
    current_job_id: string;
    current_job_type: WorkerJobType | "";
  }) {
    const now = nowIso();
    const heartbeat: WorkerHeartbeat = {
      worker_id: input.worker_id,
      status: "online",
      current_job_id: input.current_job_id,
      current_job_type: input.current_job_type,
      last_heartbeat_at: now,
      updated_at: now
    };
    const { data, error } = await this.client
      .from("worker_heartbeats")
      .upsert(heartbeat, { onConflict: "worker_id" })
      .select("*")
      .single();
    throwIfSupabaseError(error, "upsertWorkerHeartbeat");
    return clone(mapHeartbeatRow(data as Record<string, unknown>));
  }

  async getProductCandidates(filters: ProductCandidateFilters = {}) {
    const { data, error } = await this.client
      .from("product_candidates")
      .select("*")
      .order("created_at", { ascending: false });
    throwIfSupabaseError(error, "getProductCandidates");
    const [queueItems, productionHistory] = await Promise.all([this.getQueue(), this.getProductionHistory()]);
    return clone(
      filterProductCandidates(
        enrichProductCandidates(((data ?? []) as Record<string, unknown>[]).map(mapCandidateRow), {
          queueItems,
          productionHistory
        }),
        filters
      )
    );
  }

  async getProductCandidate(id: string) {
    const { data, error } = await this.client
      .from("product_candidates")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    throwIfSupabaseError(error, "getProductCandidate");
    if (!data) {
      return null;
    }
    const [candidates, queueItems, productionHistory] = await Promise.all([
      this.getProductCandidates(),
      this.getQueue(),
      this.getProductionHistory()
    ]);
    return clone(enrichProductCandidate(mapCandidateRow(data as Record<string, unknown>), {
      candidates,
      queueItems,
      productionHistory
    }));
  }

  async updateProductCandidate(id: string, patch: Partial<ProductCandidate>) {
    const { data, error } = await this.client
      .from("product_candidates")
      .update(stripUndefined({ ...patch, id, updated_at: nowIso() }))
      .eq("id", id)
      .select("*")
      .maybeSingle();
    throwIfSupabaseError(error, "updateProductCandidate");
    return data ? clone(mapCandidateRow(data as Record<string, unknown>)) : null;
  }

  async promoteCandidateToQueue(candidateId: string, options: PromoteCandidateOptions = {}) {
    const [candidate, queueItems, productionHistory] = await Promise.all([
      this.getProductCandidate(candidateId),
      this.getQueue(),
      this.getProductionHistory()
    ]);
    const promotion = buildCandidatePromotion({
      candidate,
      queueItems,
      productionHistory,
      now: options.now,
      scheduled_at: options.scheduled_at
    });
    await this.upsertRows("product_queue", promotion.queue_item);
    await this.upsertRows("generated_contents", promotion.content);
    await this.updateProductCandidate(candidateId, {
      ...promotion.candidate,
      promotion_status: "promoted",
      promoted_queue_id: promotion.queue_item.id
    });
    return clone(promotion);
  }

  async upsertProductCandidates(candidates: ProductCandidate[]) {
    if (candidates.length === 0) {
      return [];
    }
    const [existing, queueItems, productionHistory] = await Promise.all([
      this.getProductCandidates(),
      this.getQueue(),
      this.getProductionHistory()
    ]);
    const normalized = candidates.map((candidate) =>
      enrichProductCandidate(candidate, {
        candidates: [...existing, ...candidates],
        queueItems,
        productionHistory
      })
    );
    const { data, error } = await this.client
      .from("product_candidates")
      .upsert(normalized, { onConflict: "id" })
      .select("*");
    throwIfSupabaseError(error, "upsertProductCandidates");
    return clone(((data ?? []) as Record<string, unknown>[]).map(mapCandidateRow));
  }

  async getProductionHistory() {
    const { data, error } = await this.client
      .from("production_history")
      .select("*")
      .order("created_at", { ascending: false });
    throwIfSupabaseError(error, "getProductionHistory");
    return clone(((data ?? []) as Record<string, unknown>[]).map(mapProductionHistoryRow));
  }

  async getProductAssets(productQueueId?: string) {
    let query = this.client.from("product_assets").select("*");
    if (productQueueId) {
      query = query.eq("product_queue_id", productQueueId);
    }
    const { data, error } = await query.order("created_at", { ascending: true });
    throwIfSupabaseError(error, "getProductAssets");
    return clone(((data ?? []) as Record<string, unknown>[]).map(mapAssetRow));
  }

  async updateProductAssetQa(
    id: string,
    patch: Pick<ProductAsset, "qa_status" | "qa_note"> & { render_qa_metadata?: ProductAsset["render_qa_metadata"] }
  ) {
    const { data, error } = await this.client
      .from("product_assets")
      .update(stripUndefined({
        qa_status: patch.qa_status,
        qa_note: patch.qa_note,
        render_qa_metadata: patch.render_qa_metadata ?? {},
        updated_at: nowIso()
      }))
      .eq("id", id)
      .select("*")
      .maybeSingle();
    throwIfSupabaseError(error, "updateProductAssetQa");
    return data ? clone(mapAssetRow(data as Record<string, unknown>)) : null;
  }

  async getChannelProfiles() {
    const { data, error } = await this.client
      .from("channel_profiles")
      .select("*")
      .order("channel_name", { ascending: true });
    throwIfSupabaseError(error, "getChannelProfiles");

    if (!data || data.length === 0) {
      const defaults = getDefaultChannelProfiles().map(normalizeChannelProfile);
      await this.upsertRows("channel_profiles", defaults);
      return clone(defaults);
    }

    return clone(((data ?? []) as Record<string, unknown>[]).map(mapChannelProfileRow));
  }

  async getChannelProfile(id: string) {
    const { data, error } = await this.client
      .from("channel_profiles")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    throwIfSupabaseError(error, "getChannelProfile");
    return data ? clone(mapChannelProfileRow(data as Record<string, unknown>)) : null;
  }

  async updateChannelProfile(id: string, patch: Partial<ChannelProfile>) {
    const existing = await this.getChannelProfile(id);
    if (!existing) {
      return null;
    }
    const normalized = normalizeChannelProfile({
      ...existing,
      ...patch,
      id,
      upload_enabled: false,
      manual_upload_only: true,
      updated_at: nowIso()
    });
    const { data, error } = await this.client
      .from("channel_profiles")
      .upsert(normalized, { onConflict: "id" })
      .select("*")
      .single();
    throwIfSupabaseError(error, "updateChannelProfile");
    return clone(mapChannelProfileRow(data as Record<string, unknown>));
  }

  async getChannelUploadPackages(productQueueId?: string) {
    let query = this.client.from("channel_upload_packages").select("*");
    if (productQueueId) {
      query = query.eq("product_queue_id", productQueueId);
    }
    const { data, error } = await query.order("created_at", { ascending: false });
    throwIfSupabaseError(error, "getChannelUploadPackages");
    return clone(((data ?? []) as Record<string, unknown>[]).map(mapChannelUploadPackageRow));
  }

  async getChannelUploadPackage(id: string) {
    const { data, error } = await this.client
      .from("channel_upload_packages")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    throwIfSupabaseError(error, "getChannelUploadPackage");
    return data ? clone(mapChannelUploadPackageRow(data as Record<string, unknown>)) : null;
  }

  async upsertChannelUploadPackage(input: ChannelUploadPackage) {
    const normalized = normalizeChannelUploadPackage(input);
    const row = {
      ...normalized,
      uploaded_at: normalized.uploaded_at.trim() ? normalized.uploaded_at : null
    };
    const { data, error } = await this.client
      .from("channel_upload_packages")
      .upsert(row, { onConflict: "id" })
      .select("*")
      .single();
    throwIfSupabaseError(error, "upsertChannelUploadPackage");
    return clone(mapChannelUploadPackageRow(data as Record<string, unknown>));
  }

  async seedQueue(mode: "default" | "error-sample" | "simulate-transition" = "default") {
    const settings = await this.getSettings();
    let queue = await this.getQueue();

    if (mode === "simulate-transition") {
      queue = queue.map((item) => {
        if (item.queue_status === "scheduled") {
          return { ...item, queue_status: "processing" as const, updated_at: nowIso() };
        }
        if (item.queue_status === "processing") {
          return {
            ...item,
            queue_status: "video_ready" as const,
            video_url: `https://example.com/mock-assets/video-${item.id}.mp4`,
            video_snapshot_url: `https://picsum.photos/seed/snapshot-${item.id}/480/270`,
            updated_at: nowIso()
          };
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
                error_message: "개발용 오류 샘플입니다. 실제 실패 성공으로 처리하지 않습니다.",
                updated_at: nowIso()
              }
            : item
        );
      }
    }

    await this.upsertQueueItems(queue);
    await this.upsertRows("generated_contents", createMockGeneratedContents(queue));
    await this.appendRun({
      id: `run-seed-${Date.now()}`,
      run_type: "manual_batch",
      status: "success",
      processed_count: queue.length,
      error_count: queue.filter((item) => item.queue_status === "error").length,
      started_at: nowIso(),
      finished_at: nowIso(),
      log: `개발용 seed 실행: ${mode}. 외부 webhook 호출 없음.`,
      safe_message: "개발용 샘플 데이터가 갱신되었습니다."
    });
    return clone(queue);
  }

  async resetSettings() {
    const settings = createDefaultSettings();
    await this.upsertRows("automation_settings", settings);
    const queue = assignSlots(await this.getQueue(), settings);
    if (queue.length > 0) {
      await this.upsertRows("product_queue", queue);
    }
    return clone(settings);
  }

  private async upsertRows(table: string, rows: unknown) {
    const { error } = await this.client.from(table).upsert(rows as object | object[], { onConflict: "id" });
    throwIfSupabaseError(error, `upsert ${table}`);
  }

  private async getQueueItemByRawUrl(rawCoupangUrl: string) {
    const { data, error } = await this.client
      .from("product_queue")
      .select("*")
      .eq("raw_coupang_url", rawCoupangUrl)
      .limit(1)
      .maybeSingle();
    throwIfSupabaseError(error, "getQueueItemByRawUrl");
    return data ? mapQueueRow(data as Record<string, unknown>) : null;
  }

  private async applyWorkerJobResult(job: WorkerJob) {
    if (job.job_type !== "video_render" || !job.product_queue_id) {
      return;
    }

    const videoUrl = getResultUrl(job.result, "video_url");
    if (!videoUrl) {
      return;
    }
    await this.updateQueueItemById(job.product_queue_id, {
      queue_status: "video_ready",
      video_url: videoUrl,
      video_snapshot_url: getResultUrl(job.result, "thumbnail_url"),
      error_message: ""
    });
    await this.persistWorkerJobAssets(job, { includeVideo: true });
    await this.upsertRows("production_history", {
      id: `history-${job.id}`,
      product_queue_id: job.product_queue_id,
      worker_job_id: job.id,
      event_type: "worker_job_completed",
      message: "Worker video render completed.",
      metadata: job.result,
      created_at: nowIso()
    });
  }

  private async persistWorkerJobAssets(job: WorkerJob, options: { includeVideo: boolean }) {
    const assets = buildSupabaseAssetRowsForWorkerJob(job, options);
    if (assets.length === 0) {
      return;
    }
    await this.upsertRows("product_assets", assets);
  }
}

export function createSupabaseAutomationRepository(options: SupabaseRepositoryOptions = {}) {
  return new SupabaseAutomationRepository(options);
}
