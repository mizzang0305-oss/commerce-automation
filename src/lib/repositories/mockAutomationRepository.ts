import type {
  AutomationRun,
  AutomationSettings,
  ChannelProfile,
  ChannelUploadPackage,
  GeneratedContent,
  ProductAsset,
  ProductCandidate,
  Platform,
  ProductionHistory,
  ProductQueueItem,
  QueueStatus,
  RunMode,
  WorkerHeartbeat,
  WorkerJob,
  WorkerJobType
} from "@/types/automation";
import type {
  MutableMockAutomationRepository,
  QueueFilters,
  QueueSummary,
  SettingsValidationResult
} from "@/lib/repositories/types";
import { assignSlots } from "@/lib/scheduler";
import { getQueueSummary } from "@/lib/status";
import { toDateInputValue } from "@/lib/format";
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

const DEFAULT_EXCLUDED_CATEGORIES = [
  "의류",
  "신발",
  "건강식품",
  "화장품",
  "식품",
  "고가전자제품",
  "대형가구"
];

const RUN_MODES: RunMode[] = [
  "generate_only",
  "youtube_private",
  "youtube_unlisted",
  "youtube_public"
];

export class SettingsValidationError extends Error {
  constructor(
    message: string,
    public field?: keyof AutomationSettings
  ) {
    super(message);
    this.name = "SettingsValidationError";
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function nowIso() {
  return new Date().toISOString();
}

export function createDefaultSettings(
  overrides: Partial<AutomationSettings> = {}
): AutomationSettings {
  return {
    id: "default",
    daily_target_count: 69,
    batch_size: 3,
    interval_hours: 1,
    start_hour: 1,
    end_hour: 23,
    run_mode: "generate_only",
    is_paused: true,
    youtube_upload_enabled: false,
    approval_required: true,
    python_worker_enabled: true,
    max_daily_uploads: 6,
    max_daily_videos: 69,
    allowed_worker_job_types: ["video_render", "sheet_sync"],
    category_include: [],
    category_exclude: DEFAULT_EXCLUDED_CATEGORIES,
    updated_at: nowIso(),
    ...overrides
  };
}

export function validateSettingsInput(
  input: Partial<AutomationSettings>
): SettingsValidationResult {
  if (input.daily_target_count !== undefined && !isIntBetween(input.daily_target_count, 1, 200)) {
    return { ok: false, field: "daily_target_count", message: "하루 생성 상품 수는 1~200 사이여야 합니다." };
  }
  if (input.batch_size !== undefined && !isIntBetween(input.batch_size, 1, 10)) {
    return { ok: false, field: "batch_size", message: "배치 크기는 1~10 사이여야 합니다." };
  }
  if (
    input.interval_hours !== undefined &&
    ![1, 2, 3, 6, 12].includes(input.interval_hours)
  ) {
    return { ok: false, field: "interval_hours", message: "실행 간격은 1, 2, 3, 6, 12 중 하나여야 합니다." };
  }
  if (input.start_hour !== undefined && !isIntBetween(input.start_hour, 0, 23)) {
    return { ok: false, field: "start_hour", message: "시작 시간은 0~23 사이여야 합니다." };
  }
  if (input.end_hour !== undefined && !isIntBetween(input.end_hour, 0, 23)) {
    return { ok: false, field: "end_hour", message: "종료 시간은 0~23 사이여야 합니다." };
  }
  if (input.max_daily_uploads !== undefined && !isIntBetween(input.max_daily_uploads, 0, 69)) {
    return { ok: false, field: "max_daily_uploads", message: "하루 공개 업로드 제한은 0~69 사이여야 합니다." };
  }
  if (input.max_daily_videos !== undefined && !isIntBetween(input.max_daily_videos, 0, 200)) {
    return { ok: false, field: "max_daily_videos", message: "하루 영상 생성 제한은 0~200 사이여야 합니다." };
  }
  if (
    input.allowed_worker_job_types !== undefined &&
    input.allowed_worker_job_types.some((jobType) => !["video_render", "sheet_sync"].includes(jobType))
  ) {
    return { ok: false, field: "allowed_worker_job_types", message: "지원하지 않는 worker job type입니다." };
  }
  if (input.run_mode !== undefined && !RUN_MODES.includes(input.run_mode)) {
    return { ok: false, field: "run_mode", message: "지원하지 않는 실행 모드입니다." };
  }

  return { ok: true, value: input };
}

function isIntBetween(value: number, min: number, max: number) {
  return Number.isInteger(value) && value >= min && value <= max;
}

const EXAMPLE_PRODUCTS = [
  ["무선 미니 청소기", "차량/데스크 정리", "생활/청소용품"],
  ["접이식 노트북 거치대", "재택근무 생산성", "디지털/주변기기"],
  ["초소형 보풀 제거기", "겨울 의류 관리", "생활/가전"],
  ["USB 충전식 손난로", "출근길 방한", "계절/난방"],
  ["싱크대 물막이 실리콘", "주방 물튐 방지", "주방/수납"],
  ["침대틈새 수납함", "원룸 공간 절약", "홈/정리"],
  ["자석 케이블 홀더", "책상 케이블 정리", "디지털/액세서리"],
  ["샤워기 필터 세트", "욕실 관리", "욕실/생활"],
  ["미니 전동 드라이버", "셀프 수리", "공구/DIY"],
  ["여행용 압축 파우치", "짐 줄이기", "여행/수납"],
  ["투명 냉장고 정리함", "냉장고 동선 개선", "주방/정리"],
  ["무타공 도어 후크", "좁은 현관 정리", "생활/수납"]
];

const STATUS_PATTERN: QueueStatus[] = [
  "scheduled",
  "processing",
  "content_ready",
  "video_render_started",
  "video_ready",
  "blog_draft_created",
  "ready_for_manual_upload",
  "manual_review",
  "error",
  "skipped",
  "hold",
  "scheduled"
];

function createQueueItem(index: number, status: QueueStatus, date: string): ProductQueueItem {
  const example = EXAMPLE_PRODUCTS[(index - 1) % EXAMPLE_PRODUCTS.length];
  const hasAffiliate = !["scheduled", "processing", "error", "skipped", "hold"].includes(status);
  const hasVideo = [
    "video_ready",
    "blog_draft_created",
    "ready_for_manual_upload",
    "manual_review"
  ].includes(status);
  const hasBlog = ["blog_draft_created", "ready_for_manual_upload", "manual_review"].includes(status);
  const id = `queue-${String(index).padStart(3, "0")}`;
  const updatedAt = nowIso();

  return {
    id,
    queue_date: date,
    queue_rank: index,
    upload_slot: Math.ceil(index / 3),
    scheduled_at: new Date(`${date}T01:00:00`).toISOString(),
    keyword: example[0],
    theme: example[1],
    product_name: `${example[0]} ${index}`,
    category_path: example[2],
    price_now_text: `${(9900 + index * 700).toLocaleString("ko-KR")}원`,
    thumbnail_url: `https://picsum.photos/seed/commerce-${index}/360/240`,
    raw_coupang_url: `https://www.coupang.com/vp/products/mock-${index}`,
    selected_affiliate_url: hasAffiliate ? `https://link.coupang.com/a/mock-${index}` : "",
    product_score: Math.min(98, 70 + (index % 29)),
    score_reason: "검색 의도와 계절성, 가격 접근성이 좋아 30일 내 반응 가능성이 높습니다.",
    video_angle: "짧은 문제 제기 후 사용 전후 차이를 보여주는 쇼츠 구성",
    queue_status: status,
    video_url: hasVideo ? `https://example.com/mock-assets/video-${id}.mp4` : "",
    video_snapshot_url: hasVideo ? `https://picsum.photos/seed/snapshot-${index}/480/270` : "",
    blog_draft_url: hasBlog ? `https://example.com/mock-blog-drafts/${id}` : "",
    youtube_upload_status:
      status === "ready_for_manual_upload" ? "ready_to_upload" : status === "manual_review" ? "manual_review" : "not_ready",
    tiktok_upload_status:
      status === "ready_for_manual_upload" ? "ready_to_upload" : status === "manual_review" ? "manual_review" : "not_ready",
    threads_post_status:
      status === "ready_for_manual_upload" ? "ready_to_post" : status === "manual_review" ? "manual_review" : "not_ready",
    manual_review_status:
      status === "ready_for_manual_upload"
        ? "ready_for_review"
        : status === "manual_review"
          ? "manual_review"
          : "not_ready",
    error_message:
      status === "error"
        ? "영상 렌더링 응답을 받지 못했습니다. n8n 실행 로그에서 원인을 확인하세요."
        : "",
    created_at: updatedAt,
    updated_at: updatedAt
  };
}

export function createMockQueueItems(settings = createDefaultSettings()): ProductQueueItem[] {
  const date = toDateInputValue();
  const items = Array.from({ length: settings.daily_target_count }, (_, index) => {
    const position = index + 1;
    const status = position <= STATUS_PATTERN.length ? STATUS_PATTERN[index] : "scheduled";
    return createQueueItem(position, status, date);
  });

  return assignSlots(items, settings);
}

export function createMockGeneratedContents(queue: ProductQueueItem[]): GeneratedContent[] {
  return queue
    .filter((item) => item.selected_affiliate_url || item.video_url || item.blog_draft_url)
    .map((item) => {
      const createdAt = nowIso();
      return {
        id: `content-${item.id}`,
        product_queue_id: item.id,
        raw_coupang_url: item.raw_coupang_url,
        product_name: item.product_name,
        selected_affiliate_url: item.selected_affiliate_url,
        video_title: `${item.keyword} 바로 써본 핵심 포인트`,
        video_script: `${item.product_name}의 장점과 주의점을 35초 안에 비교합니다.`,
        caption_1: `${item.keyword}, 이런 상황이면 꽤 유용합니다.`,
        caption_2: "가격과 사용 장면을 같이 확인하세요.",
        caption_3: "구매 전 상세페이지와 후기를 꼭 확인하세요.",
        threads_text: `${item.keyword} 찾는 분들을 위한 짧은 체크리스트입니다. 링크와 가격은 변동될 수 있어요.`,
        blog_title: `${item.keyword} 추천 포인트와 구매 전 체크사항`,
        blog_body: "상품 특징, 사용 장면, 장단점, 구매 전 확인할 점을 정리한 초안입니다.",
        hashtags: "#쿠팡파트너스 #생활용품 #쇼츠추천",
        youtube_description: `${item.product_name}\n\n이 포스팅은 쿠팡 파트너스 활동의 일환으로 일정액의 수수료를 제공받을 수 있습니다.`,
        tiktok_caption: `${item.keyword} 짧게 보고 결정하기 #쿠팡파트너스`,
        disclosure_text: "이 포스팅은 쿠팡 파트너스 활동의 일환으로 일정액의 수수료를 제공받을 수 있습니다.",
        content_source: "fallback",
        creatomate_render_id: item.video_url ? `mock-render-${item.id}` : "",
        video_url: item.video_url,
        video_snapshot_url: item.video_snapshot_url,
        video_status: item.video_url ? "ready" : "not_started",
        blog_draft_url: item.blog_draft_url,
        blog_draft_status: item.blog_draft_url ? "created" : "not_started",
        created_at: createdAt,
        updated_at: createdAt
      };
    });
}

export function createMockRuns(): AutomationRun[] {
  const startedAt = new Date(Date.now() - 1000 * 60 * 30).toISOString();
  const finishedAt = new Date(Date.now() - 1000 * 60 * 29).toISOString();

  return [
    {
      id: "run-local-seed",
      run_type: "manual_batch",
      status: "success",
      processed_count: 69,
      error_count: 0,
      started_at: startedAt,
      finished_at: finishedAt,
      log: "로컬 mock queue seed가 생성되었습니다. 외부 Webhook 호출은 수행하지 않았습니다.",
      safe_message: "로컬 샘플 큐가 준비되었습니다."
    },
    {
      id: "run-webhook-missing",
      run_type: "webhook_test",
      status: "failed",
      processed_count: 0,
      error_count: 1,
      started_at: finishedAt,
      finished_at: finishedAt,
      log: "n8n Webhook 설정이 없어 실행할 수 없습니다.",
      safe_message: "n8n Webhook 설정이 없어 실행할 수 없습니다."
    }
  ];
}

function sanitizeRun(run: AutomationRun): AutomationRun {
  return {
    ...run,
    log: run.log
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted]")
      .replace(/https?:\/\/[^\s"]*webhook[^\s"]*/gi, "[webhook-url-redacted]")
  };
}

export class InMemoryAutomationRepository implements MutableMockAutomationRepository {
  private settings: AutomationSettings;
  private queue: ProductQueueItem[];
  private contents: GeneratedContent[];
  private runs: AutomationRun[];
  private workerJobs: WorkerJob[];
  private workerHeartbeats: WorkerHeartbeat[];
  private productCandidates: ProductCandidate[];
  private productAssets: ProductAsset[];
  private productionHistory: ProductionHistory[];
  private channelProfiles: ChannelProfile[];
  private channelUploadPackages: ChannelUploadPackage[];

  constructor() {
    this.settings = createDefaultSettings();
    this.queue = createMockQueueItems(this.settings);
    this.contents = createMockGeneratedContents(this.queue);
    this.runs = createMockRuns();
    this.workerJobs = [];
    this.workerHeartbeats = [];
    this.productCandidates = [];
    this.productAssets = [];
    this.productionHistory = [];
    this.channelProfiles = getDefaultChannelProfiles().map(normalizeChannelProfile);
    this.channelUploadPackages = [];
  }

  async getSettings() {
    return clone(this.settings);
  }

  async updateSettings(input: Partial<AutomationSettings>) {
    const validation = validateSettingsInput(input);
    if (!validation.ok) {
      throw new SettingsValidationError(validation.message, validation.field);
    }

    this.settings = {
      ...this.settings,
      ...validation.value,
      updated_at: nowIso()
    };
    this.queue = assignSlots(this.queue, this.settings);
    return clone(this.settings);
  }

  async resetSettings() {
    this.settings = createDefaultSettings();
    this.queue = assignSlots(this.queue, this.settings);
    return clone(this.settings);
  }

  async getQueue(filters: QueueFilters = {}) {
    let items = [...this.queue];

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
    return getQueueSummary(this.queue);
  }

  async getQueueItem(id: string) {
    return clone(this.queue.find((item) => item.id === id) ?? null);
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
    const item = this.queue.find((queueItem) => queueItem.id === id);
    if (!item) {
      return null;
    }

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

    return clone(item);
  }

  async upsertQueueItems(items: ProductQueueItem[]) {
    for (const incoming of items) {
      const index = this.queue.findIndex(
        (item) => item.id === incoming.id || item.raw_coupang_url === incoming.raw_coupang_url
      );
      if (index === -1) {
        this.queue.push({ ...incoming, updated_at: nowIso() });
      } else {
        this.queue[index] = {
          ...this.queue[index],
          ...incoming,
          id: this.queue[index].id || incoming.id,
          updated_at: nowIso()
        };
      }
    }
    this.queue = this.queue.sort((a, b) => a.queue_rank - b.queue_rank);
  }

  async updateQueueItemByRawUrl(raw_coupang_url: string, patch: Partial<ProductQueueItem>) {
    const item = this.queue.find((queueItem) => queueItem.raw_coupang_url === raw_coupang_url);
    if (!item) {
      return null;
    }
    return this.updateQueueItem(item.id, patch);
  }

  async updateQueueItemById(id: string, patch: Partial<ProductQueueItem>) {
    return this.updateQueueItem(id, patch);
  }

  async getRuns() {
    return clone([...this.runs].sort((a, b) => b.started_at.localeCompare(a.started_at)));
  }

  async appendRun(run: AutomationRun) {
    const safeRun = sanitizeRun(run);
    this.runs.unshift(safeRun);
    return clone(safeRun);
  }

  async getGeneratedContentByQueueItem(id: string) {
    return clone(this.contents.find((content) => content.product_queue_id === id) ?? null);
  }

  async upsertGeneratedContent(content: GeneratedContent) {
    const index = this.contents.findIndex(
      (item) => item.id === content.id || item.product_queue_id === content.product_queue_id
    );
    if (index === -1) {
      this.contents.push(content);
      return clone(content);
    }

    this.contents[index] = { ...this.contents[index], ...content, updated_at: nowIso() };
    return clone(this.contents[index]);
  }

  async getWorkerJobs(filters: { status?: WorkerJob["status"] | "all"; job_type?: WorkerJobType | "all" } = {}) {
    let jobs = [...this.workerJobs];
    if (filters.status && filters.status !== "all") {
      jobs = jobs.filter((job) => job.status === filters.status);
    }
    if (filters.job_type && filters.job_type !== "all") {
      jobs = jobs.filter((job) => job.job_type === filters.job_type);
    }
    return clone(jobs.sort(sortWorkerJobs));
  }

  async getWorkerJob(id: string) {
    return clone(this.workerJobs.find((job) => job.id === id) ?? null);
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
      id: `job-${Date.now()}-${this.workerJobs.length + 1}`,
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
    this.workerJobs.push(job);
    return clone(job);
  }

  async claimWorkerJob(input: { worker_id: string; job_types: WorkerJobType[] }) {
    const job = [...this.workerJobs]
      .filter((candidate) => candidate.status === "pending" || candidate.status === "retry_wait")
      .filter((candidate) => input.job_types.includes(candidate.job_type))
      .sort(sortWorkerJobs)[0];

    if (!job) {
      await this.upsertWorkerHeartbeat({ worker_id: input.worker_id, current_job_id: "", current_job_type: "" });
      return null;
    }

    const now = nowIso();
    const index = this.workerJobs.findIndex((candidate) => candidate.id === job.id);
    this.workerJobs[index] = {
      ...this.workerJobs[index],
      status: "claimed",
      claimed_by: input.worker_id,
      claimed_at: now,
      heartbeat_at: now,
      started_at: this.workerJobs[index].started_at || now,
      error_message: ""
    };
    await this.upsertWorkerHeartbeat({
      worker_id: input.worker_id,
      current_job_id: job.id,
      current_job_type: job.job_type
    });
    return clone(this.workerJobs[index]);
  }

  async updateWorkerJobHeartbeat(id: string, worker_id: string) {
    const index = this.workerJobs.findIndex((job) => job.id === id && job.claimed_by === worker_id);
    if (index === -1) {
      return null;
    }

    this.workerJobs[index] = {
      ...this.workerJobs[index],
      status: this.workerJobs[index].status === "claimed" ? "processing" : this.workerJobs[index].status,
      heartbeat_at: nowIso()
    };
    await this.upsertWorkerHeartbeat({
      worker_id,
      current_job_id: id,
      current_job_type: this.workerJobs[index].job_type
    });
    return clone(this.workerJobs[index]);
  }

  async completeWorkerJob(id: string, worker_id: string, result: Record<string, unknown>) {
    const index = this.workerJobs.findIndex((job) => job.id === id && job.claimed_by === worker_id);
    if (index === -1) {
      return null;
    }

    if (this.workerJobs[index].job_type === "video_render" && !getResultUrl(result, "video_url")) {
      const retryCount = this.workerJobs[index].retry_count + 1;
      const status = retryCount < this.workerJobs[index].max_retries ? "retry_wait" : "failed";
      const errorMessage = "영상 렌더 결과에 video_url이 없어 완료 처리하지 않았습니다.";
      this.workerJobs[index] = {
        ...this.workerJobs[index],
        status,
        result,
        retry_count: retryCount,
        heartbeat_at: nowIso(),
        finished_at: status === "failed" ? nowIso() : "",
        error_message: errorMessage
      };
      await this.persistWorkerJobAssets(this.workerJobs[index], { includeVideo: false });
      if (this.workerJobs[index].product_queue_id) {
        await this.updateQueueItem(this.workerJobs[index].product_queue_id, {
          queue_status: "error",
          error_message: errorMessage
        });
      }
      await this.upsertWorkerHeartbeat({ worker_id, current_job_id: "", current_job_type: "" });
      return clone(this.workerJobs[index]);
    }

    const finishedAt = nowIso();
    this.workerJobs[index] = {
      ...this.workerJobs[index],
      status: "completed",
      result,
      heartbeat_at: finishedAt,
      finished_at: finishedAt,
      error_message: ""
    };
    await this.applyWorkerJobResult(this.workerJobs[index]);
    await this.upsertWorkerHeartbeat({ worker_id, current_job_id: "", current_job_type: "" });
    return clone(this.workerJobs[index]);
  }

  async failWorkerJob(id: string, worker_id: string, errorMessage: string) {
    const index = this.workerJobs.findIndex((job) => job.id === id && job.claimed_by === worker_id);
    if (index === -1) {
      return null;
    }

    const retryCount = this.workerJobs[index].retry_count + 1;
    const status = retryCount < this.workerJobs[index].max_retries ? "retry_wait" : "failed";
    this.workerJobs[index] = {
      ...this.workerJobs[index],
      status,
      retry_count: retryCount,
      error_message: errorMessage,
      heartbeat_at: nowIso(),
      finished_at: status === "failed" ? nowIso() : ""
    };
    if (status === "failed" && this.workerJobs[index].product_queue_id) {
      await this.updateQueueItem(this.workerJobs[index].product_queue_id, {
        queue_status: "error",
        error_message: errorMessage
      });
    }
    await this.upsertWorkerHeartbeat({ worker_id, current_job_id: "", current_job_type: "" });
    return clone(this.workerJobs[index]);
  }

  async getWorkerHeartbeats() {
    return clone([...this.workerHeartbeats].sort((a, b) => b.last_heartbeat_at.localeCompare(a.last_heartbeat_at)));
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
    const index = this.workerHeartbeats.findIndex((item) => item.worker_id === input.worker_id);
    if (index === -1) {
      this.workerHeartbeats.push(heartbeat);
    } else {
      this.workerHeartbeats[index] = heartbeat;
    }
    return clone(heartbeat);
  }

  async getProductCandidates(filters: ProductCandidateFilters = {}) {
    return clone(
      filterProductCandidates(
        enrichProductCandidates(this.productCandidates, {
          queueItems: this.queue,
          productionHistory: this.productionHistory
        }),
        filters
      )
    );
  }

  async getProductCandidate(id: string) {
    const candidate = this.productCandidates.find((item) => item.id === id);
    return clone(
      candidate
        ? enrichProductCandidate(candidate, {
            candidates: this.productCandidates,
            queueItems: this.queue,
            productionHistory: this.productionHistory
          })
        : null
    );
  }

  async updateProductCandidate(id: string, patch: Partial<ProductCandidate>) {
    const index = this.productCandidates.findIndex((candidate) => candidate.id === id);
    if (index === -1) {
      return null;
    }
    this.productCandidates[index] = {
      ...this.productCandidates[index],
      ...patch,
      id,
      updated_at: nowIso()
    };
    return clone(this.productCandidates[index]);
  }

  async promoteCandidateToQueue(candidateId: string, options: PromoteCandidateOptions = {}) {
    const candidate = this.productCandidates.find((item) => item.id === candidateId) ?? null;
    const promotion = buildCandidatePromotion({
      candidate,
      queueItems: this.queue,
      productionHistory: this.productionHistory,
      now: options.now,
      scheduled_at: options.scheduled_at
    });
    this.queue.push(promotion.queue_item);
    this.queue = this.queue.sort((a, b) => a.queue_rank - b.queue_rank);
    const contentIndex = this.contents.findIndex(
      (content) => content.id === promotion.content.id || content.product_queue_id === promotion.content.product_queue_id
    );
    if (contentIndex === -1) {
      this.contents.push(promotion.content);
    } else {
      this.contents[contentIndex] = promotion.content;
    }
    const candidateIndex = this.productCandidates.findIndex((item) => item.id === candidateId);
    if (candidateIndex !== -1) {
      this.productCandidates[candidateIndex] = {
        ...this.productCandidates[candidateIndex],
        ...promotion.candidate,
        promotion_status: "promoted",
        promoted_queue_id: promotion.queue_item.id,
        updated_at: nowIso()
      };
    }
    return clone(promotion);
  }

  async upsertProductCandidates(candidates: ProductCandidate[]) {
    const normalized = candidates.map((candidate) =>
      enrichProductCandidate(candidate, {
        candidates: [...this.productCandidates, ...candidates],
        queueItems: this.queue,
        productionHistory: this.productionHistory
      })
    );
    for (const candidate of normalized) {
      const index = this.productCandidates.findIndex((item) => item.id === candidate.id);
      if (index === -1) {
        this.productCandidates.push(candidate);
      } else {
        this.productCandidates[index] = {
          ...this.productCandidates[index],
          ...candidate,
          created_at: this.productCandidates[index].created_at || candidate.created_at
        };
      }
    }
    return clone(normalized);
  }

  async getProductionHistory() {
    return clone(this.productionHistory);
  }

  async getProductAssets(productQueueId?: string) {
    const assets = productQueueId
      ? this.productAssets.filter((asset) => asset.product_queue_id === productQueueId)
      : this.productAssets;
    return clone(assets);
  }

  async updateProductAssetQa(
    id: string,
    patch: Pick<ProductAsset, "qa_status" | "qa_note"> & { render_qa_metadata?: ProductAsset["render_qa_metadata"] }
  ) {
    const index = this.productAssets.findIndex((asset) => asset.id === id);
    if (index === -1) {
      return null;
    }
    this.productAssets[index] = {
      ...this.productAssets[index],
      qa_status: patch.qa_status,
      qa_note: patch.qa_note,
      render_qa_metadata: patch.render_qa_metadata ?? this.productAssets[index].render_qa_metadata ?? {},
      updated_at: nowIso()
    };
    return clone(this.productAssets[index]);
  }

  async getChannelProfiles() {
    return clone(this.channelProfiles.map(normalizeChannelProfile));
  }

  async getChannelProfile(id: string) {
    return clone(this.channelProfiles.find((profile) => profile.id === id) ?? null);
  }

  async updateChannelProfile(id: string, patch: Partial<ChannelProfile>) {
    const index = this.channelProfiles.findIndex((profile) => profile.id === id);
    if (index === -1) {
      return null;
    }
    this.channelProfiles[index] = normalizeChannelProfile({
      ...this.channelProfiles[index],
      ...patch,
      id,
      upload_enabled: false,
      manual_upload_only: true,
      updated_at: nowIso()
    });
    return clone(this.channelProfiles[index]);
  }

  async getChannelUploadPackages(productQueueId?: string) {
    const packages = productQueueId
      ? this.channelUploadPackages.filter((item) => item.product_queue_id === productQueueId)
      : this.channelUploadPackages;
    return clone(packages.map(normalizeChannelUploadPackage));
  }

  async getChannelUploadPackage(id: string) {
    const packageItem = this.channelUploadPackages.find((item) => item.id === id);
    return packageItem ? clone(normalizeChannelUploadPackage(packageItem)) : null;
  }

  async upsertChannelUploadPackage(input: ChannelUploadPackage) {
    const normalized = normalizeChannelUploadPackage(input);
    const index = this.channelUploadPackages.findIndex((item) => item.id === input.id);
    if (index === -1) {
      this.channelUploadPackages.push(normalized);
      return clone(normalized);
    }

    this.channelUploadPackages[index] = {
      ...this.channelUploadPackages[index],
      ...normalized,
      created_at: this.channelUploadPackages[index].created_at || normalized.created_at,
      updated_at: nowIso()
    };
    return clone(normalizeChannelUploadPackage(this.channelUploadPackages[index]));
  }

  async seedQueue(mode: "default" | "error-sample" | "simulate-transition" = "default") {
    if (mode === "simulate-transition") {
      this.queue = this.queue.map((item) => {
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
      this.queue = createMockQueueItems(this.settings);
      if (mode === "error-sample") {
        this.queue = this.queue.map((item, index) =>
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

    this.contents = createMockGeneratedContents(this.queue);
    await this.appendRun({
      id: `run-seed-${Date.now()}`,
      run_type: "manual_batch",
      status: "success",
      processed_count: this.queue.length,
      error_count: this.queue.filter((item) => item.queue_status === "error").length,
      started_at: nowIso(),
      finished_at: nowIso(),
      log: `개발용 seed 실행: ${mode}. 외부 Webhook 호출 없음.`,
      safe_message: "개발용 샘플 데이터가 갱신되었습니다."
    });
    return clone(this.queue);
  }

  private async updateQueueItem(id: string, patch: Partial<ProductQueueItem>) {
    const index = this.queue.findIndex((item) => item.id === id);
    if (index === -1) {
      return null;
    }

    this.queue[index] = {
      ...this.queue[index],
      ...patch,
      updated_at: nowIso()
    };

    return clone(this.queue[index]);
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
    this.productionHistory = this.productionHistory.filter((item) => item.id !== `history-${job.id}`);
    this.productionHistory.push({
      id: `history-${job.id}`,
      product_queue_id: job.product_queue_id,
      worker_job_id: job.id,
      event_type: "worker_job_completed",
      message: "Worker video render completed.",
      metadata: result,
      created_at: nowIso()
    });
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
    const assets: Array<[ProductAsset["asset_type"], string, string]> = [
      ["video", "rendered-videos", videoUrl],
      ["thumbnail", "thumbnails", thumbnailUrl],
      ["subtitle", "subtitles", srtUrl],
      ["upload_package", "upload-packages", uploadPackageUrl]
    ];
    for (const [assetType, bucket, url] of assets) {
      if (!url || (!options.includeVideo && assetType === "video")) {
        continue;
      }
      const id = `asset-${job.id}-${assetType}`;
      this.productAssets = this.productAssets.filter((asset) => asset.id !== id);
      this.productAssets.push({
        id,
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
      });
    }
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

export function createMockAutomationRepository(): MutableMockAutomationRepository {
  return new InMemoryAutomationRepository();
}
