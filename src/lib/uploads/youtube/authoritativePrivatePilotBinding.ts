import type { AutomationRepository } from "@/lib/repositories/types";
import type {
  ChannelUploadPackage,
  ProductAsset,
  ProductCandidate,
  ProductQueueItem,
  WorkerJob
} from "@/types/automation";
import type { PreparedVideoAssetProvider, PreparedVideoAssetRef } from "@/lib/uploads/youtube/uploadAssetContract";

const SERVER_PROVIDERS = new Set<PreparedVideoAssetProvider>([
  "r2",
  "supabase_storage",
  "signed_url",
  "signed_https",
  "r2_signed_url",
  "supabase_signed_url",
  "external_https"
]);

export type AuthoritativePrivatePilotBinding = {
  uploadPackage: ChannelUploadPackage;
  queue: ProductQueueItem;
  candidate: ProductCandidate;
  workerJob: WorkerJob;
  videoAsset: ProductAsset;
  preparedVideoAsset: PreparedVideoAssetRef;
};

export async function resolveAuthoritativePrivatePilotBinding(input: {
  repository: AutomationRepository;
  uploadPackageId: string;
  videoAssetId: string;
  expectedCandidateId?: string;
  expectedChecksumSha256?: string;
  now?: string | Date;
}): Promise<AuthoritativePrivatePilotBinding> {
  const uploadPackage = await input.repository.getChannelUploadPackage(input.uploadPackageId);
  if (!uploadPackage) throw new Error("UPLOAD_PACKAGE_NOT_FOUND");
  const queue = await input.repository.getQueueItem(uploadPackage.product_queue_id);
  if (!queue) throw new Error("AUTHORITATIVE_PRODUCT_BINDING_REQUIRED");

  const assets = await input.repository.getProductAssets(queue.id);
  const videoAsset = assets.find((asset) => asset.id === input.videoAssetId);
  if (
    !videoAsset ||
    videoAsset.asset_type !== "video" ||
    videoAsset.product_queue_id !== queue.id ||
    videoAsset.qa_status !== "passed"
  ) {
    throw new Error("AUTHORITATIVE_ASSET_BINDING_REQUIRED");
  }
  const candidateId = videoAsset.product_candidate_id?.trim() ?? "";
  if (!candidateId || (input.expectedCandidateId && candidateId !== input.expectedCandidateId)) {
    throw new Error("AUTHORITATIVE_ASSET_BINDING_REQUIRED");
  }
  const [candidate, workerJob] = await Promise.all([
    input.repository.getProductCandidate(candidateId),
    input.repository.getWorkerJob(videoAsset.worker_job_id)
  ]);
  if (
    !candidate ||
    candidate.promoted_queue_id !== queue.id ||
    !workerJob ||
    workerJob.id !== videoAsset.worker_job_id ||
    workerJob.status !== "completed" ||
    workerJob.product_queue_id !== queue.id ||
    workerJob.product_candidate_id !== candidate.id
  ) {
    throw new Error("AUTHORITATIVE_ASSET_BINDING_REQUIRED");
  }

  const metadata = videoAsset.render_qa_metadata ?? {};
  const checksum = sha256(metadata.video_checksum_sha256);
  const provider = preparedProvider(metadata.prepared_video_asset_provider);
  const storageKey = string(metadata.prepared_video_asset_storage_key);
  const preparedUrl = httpsUrl(metadata.prepared_video_asset_url);
  const expiresAt = timestamp(metadata.prepared_video_asset_expires_at);
  const sizeBytes = positiveInteger(metadata.video_size_bytes);
  if (
    !checksum ||
    !provider ||
    !storageKey ||
    !preparedUrl ||
    preparedUrl !== videoAsset.url ||
    preparedUrl !== uploadPackage.video_url ||
    metadata.prepared_video_asset_server_accessible !== true ||
    !sizeBytes ||
    (input.expectedChecksumSha256 && checksum !== input.expectedChecksumSha256)
  ) {
    throw new Error("AUTHORITATIVE_ASSET_BINDING_REQUIRED");
  }
  if (expiresAt && Date.parse(expiresAt) <= toMillis(input.now ?? new Date())) {
    throw new Error("PREPARED_VIDEO_ASSET_EXPIRED");
  }
  return {
    uploadPackage,
    queue,
    candidate,
    workerJob,
    videoAsset,
    preparedVideoAsset: {
      asset_id: videoAsset.id,
      storage_key: storageKey,
      signed_url: null,
      prepared_video_asset_url: preparedUrl,
      mime_type: "video/mp4",
      size_bytes: sizeBytes,
      checksum_sha256: checksum,
      expires_at: expiresAt || null,
      provider,
      server_accessible: true
    }
  };
}

function string(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sha256(value: unknown) {
  const normalized = string(value).toLowerCase();
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : "";
}

function preparedProvider(value: unknown): PreparedVideoAssetProvider | "" {
  const normalized = string(value) as PreparedVideoAssetProvider;
  return SERVER_PROVIDERS.has(normalized) ? normalized : "";
}

function httpsUrl(value: unknown) {
  const normalized = string(value);
  return /^https:\/\//i.test(normalized) ? normalized : "";
}

function timestamp(value: unknown) {
  const normalized = string(value);
  return normalized && Number.isFinite(Date.parse(normalized))
    ? new Date(normalized).toISOString()
    : "";
}

function positiveInteger(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

function toMillis(value: string | Date) {
  return new Date(value).getTime();
}
