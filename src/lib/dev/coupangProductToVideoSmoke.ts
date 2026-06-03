import "server-only";

import {
  buildCoupangCandidate,
  type CoupangCandidateInput,
  type CoupangCandidateReadiness
} from "@/lib/coupang/coupangCandidateImport";
import type { AutomationRepository } from "@/lib/repositories/types";
import type {
  ChannelUploadPackage,
  GeneratedContent,
  ProductAsset,
  ProductCandidate,
  ProductQueueItem,
  WorkerJob
} from "@/types/automation";

export type CoupangSmokeStage =
  | "not_started"
  | "candidate_created"
  | "promoted_to_queue"
  | "content_ready"
  | "worker_job_pending"
  | "worker_running"
  | "worker_failed"
  | "video_ready"
  | "upload_package_ready";

export type CoupangSmokeStatus = {
  stage: CoupangSmokeStage;
  next_step: string;
  blocking_reasons: string[];
  candidate_id: string;
  queue_id: string;
  worker_job_id: string;
  queue_status: string;
  video_url: string;
  product_assets_count: number;
  product_asset_types: string[];
  render_plan_attached: boolean;
  render_plan_shot_count: number;
  upload_package_id: string;
  upload_package_status: string;
  created_worker_jobs: number;
  public_upload_enabled: false;
  worker_command: string;
  worker_execution_note: string;
};

export type CoupangSmokeStartResult = {
  candidate: ProductCandidate;
  readiness: CoupangCandidateReadiness;
  queue_items_created: number;
  worker_jobs_created: number;
  status: CoupangSmokeStatus;
};

const WORKER_COMMAND = [
  "cd C:\\Users\\LOVE\\MyProjects\\commerce-automation\\python-worker",
  ".\\.venv\\Scripts\\python worker.py"
].join("\n");

const DEFAULT_CHANNEL_PROFILE_ID = "channel-event-gift";

export function getDefaultSmokeChannelProfileId() {
  return DEFAULT_CHANNEL_PROFILE_ID;
}

export function buildDefaultCoupangSmokeInput(now = new Date()): CoupangCandidateInput {
  const stamp = String(now.getTime());
  return {
    product_name: `쿠팡 원클릭 영상 스모크 상품 ${stamp.slice(-6)}`,
    raw_coupang_url: `https://www.coupang.com/vp/products/${stamp}?itemId=${stamp.slice(-9)}&vendorItemId=${stamp.slice(-8)}&utm_source=dev-smoke`,
    selected_affiliate_url: `https://link.coupang.com/a/product-video-smoke-${stamp}`,
    thumbnail_url: `https://picsum.photos/seed/coupang-product-video-${stamp}/1080/1920`,
    price_now_text: "15,900원",
    category_path: "선물/생활",
    source_type: "manual_url",
    source: "dev_coupang_product_to_video_smoke"
  };
}

export async function startCoupangProductToVideoSmoke(
  repository: AutomationRepository,
  input: CoupangCandidateInput = buildDefaultCoupangSmokeInput()
): Promise<CoupangSmokeStartResult> {
  const [initialQueue, initialJobs, candidates, queueItems, productionHistory] = await Promise.all([
    repository.getQueue(),
    repository.getWorkerJobs(),
    repository.getProductCandidates(),
    repository.getQueue(),
    repository.getProductionHistory()
  ]);
  const result = buildCoupangCandidate(input, {
    candidates,
    queueItems,
    productionHistory
  });

  await repository.updateSettings({
    is_paused: false,
    python_worker_enabled: true,
    batch_size: 1,
    run_mode: "generate_only",
    youtube_upload_enabled: false,
    approval_required: true,
    allowed_worker_job_types: ["video_render", "sheet_sync"]
  });
  const [candidate] = await repository.upsertProductCandidates([result.candidate]);
  const [finalQueue, finalJobs] = await Promise.all([
    repository.getQueue(),
    repository.getWorkerJobs()
  ]);
  const savedCandidate = candidate ?? result.candidate;
  const status = await getCoupangProductToVideoSmokeStatus(repository, {
    candidate_id: savedCandidate.id
  });

  return {
    candidate: savedCandidate,
    readiness: result.readiness,
    queue_items_created: Math.max(0, finalQueue.length - initialQueue.length),
    worker_jobs_created: Math.max(0, finalJobs.length - initialJobs.length),
    status
  };
}

export async function promoteCoupangProductToVideoSmoke(repository: AutomationRepository, candidateId: string) {
  if (!candidateId.trim()) {
    throw new CoupangSmokeError("MISSING_CANDIDATE_ID", "candidate_id가 필요합니다.", 400);
  }

  const initialJobs = await repository.getWorkerJobs();
  const result = await repository.promoteCandidateToQueue(candidateId, {
    scheduled_at: new Date(Date.now() - 60_000).toISOString()
  });
  const queueItem = await repository.updateQueueItemById(result.queue_item.id, {
    queue_rank: 0,
    upload_slot: 1,
    scheduled_at: new Date(Date.now() - 60_000).toISOString(),
    queue_status: "scheduled",
    error_message: ""
  });
  const finalJobs = await repository.getWorkerJobs();
  const status = await getCoupangProductToVideoSmokeStatus(repository, {
    candidate_id: candidateId,
    queue_id: result.queue_item.id
  });

  return {
    ...result,
    queue_item: queueItem ?? result.queue_item,
    created_worker_jobs: Math.max(0, finalJobs.length - initialJobs.length),
    status
  };
}

export async function getCoupangProductToVideoSmokeStatus(
  repository: AutomationRepository,
  input: { candidate_id?: string; queue_id?: string } = {}
): Promise<CoupangSmokeStatus> {
  const candidate = await resolveCandidate(repository, input);
  const queue = await resolveQueue(repository, input.queue_id, candidate);
  const [content, jobs, assets, packages] = await Promise.all([
    queue ? repository.getGeneratedContentByQueueItem(queue.id) : Promise.resolve(null),
    repository.getWorkerJobs(),
    queue ? repository.getProductAssets(queue.id) : Promise.resolve([]),
    queue ? repository.getChannelUploadPackages(queue.id) : Promise.resolve([])
  ]);
  const queueJobs = queue ? jobs.filter((job) => job.product_queue_id === queue.id) : [];
  const latestJob = queueJobs.sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
  const latestPackage = packages.sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
  const renderPlanShotCount = getRenderPlanShotCount(latestJob?.payload);
  const blockingReasons = buildBlockingReasons({ candidate, queue, content, latestJob, assets, latestPackage });
  const stage = inferStage({ candidate, queue, content, latestJob, assets, latestPackage, blockingReasons });

  return {
    stage,
    next_step: nextStepForStage(stage, blockingReasons),
    blocking_reasons: blockingReasons,
    candidate_id: candidate?.id ?? input.candidate_id ?? "",
    queue_id: queue?.id ?? input.queue_id ?? "",
    worker_job_id: latestJob?.id ?? "",
    queue_status: queue?.queue_status ?? "",
    video_url: queue?.video_url ?? "",
    product_assets_count: assets.filter((asset) => asset.url.trim()).length,
    product_asset_types: assets.filter((asset) => asset.url.trim()).map((asset) => asset.asset_type).sort(),
    render_plan_attached: renderPlanShotCount > 0,
    render_plan_shot_count: renderPlanShotCount,
    upload_package_id: latestPackage?.id ?? "",
    upload_package_status: latestPackage?.status ?? "",
    created_worker_jobs: queueJobs.length,
    public_upload_enabled: false,
    worker_command: WORKER_COMMAND,
    worker_execution_note: "WebApp은 Python Worker를 직접 실행하지 않습니다. 별도 PowerShell에서 실행하세요."
  };
}

function getRenderPlanShotCount(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("render_plan" in payload)) {
    return 0;
  }
  const renderPlan = (payload as { render_plan?: unknown }).render_plan;
  if (!renderPlan || typeof renderPlan !== "object" || !("shots" in renderPlan)) {
    return 0;
  }
  const shots = (renderPlan as { shots?: unknown }).shots;
  return Array.isArray(shots) ? shots.length : 0;
}

async function resolveCandidate(repository: AutomationRepository, input: { candidate_id?: string; queue_id?: string }) {
  if (input.candidate_id) {
    return repository.getProductCandidate(input.candidate_id);
  }
  const candidates = await repository.getProductCandidates({ source: "coupang", limit: 20 });
  return candidates.find((candidate) => candidate.source_name === "dev_coupang_product_to_video_smoke") ?? null;
}

async function resolveQueue(
  repository: AutomationRepository,
  queueId: string | undefined,
  candidate: ProductCandidate | null
) {
  if (queueId) {
    return repository.getQueueItem(queueId);
  }
  if (candidate?.promoted_queue_id) {
    return repository.getQueueItem(candidate.promoted_queue_id);
  }
  return null;
}

function buildBlockingReasons(input: {
  candidate: ProductCandidate | null;
  queue: ProductQueueItem | null;
  content: GeneratedContent | null;
  latestJob: WorkerJob | null;
  assets: ProductAsset[];
  latestPackage: ChannelUploadPackage | null;
}) {
  const reasons: string[] = [];
  if (!input.candidate) {
    reasons.push("no_candidate");
    return reasons;
  }
  if (!input.candidate.selected_affiliate_url.trim()) {
    reasons.push("missing_affiliate");
  }
  const imageUrl = typeof input.candidate.payload.thumbnail_url === "string" ? input.candidate.payload.thumbnail_url : "";
  if (!imageUrl.trim()) {
    reasons.push("missing_image");
  }
  if (!input.queue) {
    reasons.push("no_queue");
    return reasons;
  }
  if (!input.queue.thumbnail_url.trim()) {
    reasons.push("missing_image");
  }
  if (!input.content?.disclosure_text?.trim()) {
    reasons.push("missing_disclosure");
  }
  if (!input.content?.video_script?.trim()) {
    reasons.push("missing_script");
  }
  if (!input.latestJob) {
    reasons.push("no_worker_job");
  }
  if (input.latestJob?.status === "failed" || input.latestJob?.status === "retry_wait") {
    reasons.push("worker_failed");
  }
  if (input.queue.queue_status === "video_ready" && !input.queue.video_url.trim()) {
    reasons.push("no_video_url");
  }
  const assetTypes = new Set(input.assets.filter((asset) => asset.url.trim()).map((asset) => asset.asset_type));
  if (input.queue.queue_status === "video_ready" && !["video", "thumbnail", "subtitle", "upload_package"].every((type) => assetTypes.has(type as ProductAsset["asset_type"]))) {
    reasons.push("no_r2_assets");
  }
  if (input.queue.queue_status === "video_ready" && !input.latestPackage) {
    reasons.push("no_upload_package");
  }
  return [...new Set(reasons)];
}

function inferStage(input: {
  candidate: ProductCandidate | null;
  queue: ProductQueueItem | null;
  content: GeneratedContent | null;
  latestJob: WorkerJob | null;
  assets: ProductAsset[];
  latestPackage: ChannelUploadPackage | null;
  blockingReasons: string[];
}): CoupangSmokeStage {
  if (!input.candidate) {
    return "not_started";
  }
  if (!input.queue) {
    return "candidate_created";
  }
  if (!input.content?.video_script?.trim()) {
    return "promoted_to_queue";
  }
  if (!input.latestJob) {
    return "content_ready";
  }
  if (input.latestJob.status === "failed" || input.latestJob.status === "retry_wait") {
    return "worker_failed";
  }
  if (input.latestJob.status === "pending") {
    return "worker_job_pending";
  }
  if (input.latestJob.status === "claimed" || input.latestJob.status === "processing") {
    return "worker_running";
  }
  if (input.queue.queue_status === "video_ready" && input.queue.video_url.trim()) {
    return input.latestPackage ? "upload_package_ready" : "video_ready";
  }
  return "worker_running";
}

function nextStepForStage(stage: CoupangSmokeStage, blockingReasons: string[]) {
  if (blockingReasons.includes("missing_affiliate") || blockingReasons.includes("missing_image")) {
    return "fix-candidate";
  }
  const nextSteps: Record<CoupangSmokeStage, string> = {
    not_started: "start",
    candidate_created: "promote",
    promoted_to_queue: "generate-content",
    content_ready: "next-batch",
    worker_job_pending: "run-worker",
    worker_running: "refresh-status",
    worker_failed: "inspect-worker-error",
    video_ready: "build-upload-package",
    upload_package_ready: "done"
  };
  return nextSteps[stage];
}

export class CoupangSmokeError extends Error {
  constructor(
    public error_code: string,
    message: string,
    public status = 400
  ) {
    super(message);
    this.name = "CoupangSmokeError";
  }
}
