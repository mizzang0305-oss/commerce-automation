import { describe, expect, test, vi } from "vitest";
import type { AutomationRepository } from "@/lib/repositories/types";
import { resolveAuthoritativePrivatePilotBinding } from "@/lib/uploads/youtube/authoritativePrivatePilotBinding";
import type {
  ChannelUploadPackage,
  ProductAsset,
  ProductCandidate,
  ProductQueueItem,
  WorkerJob
} from "@/types/automation";

describe("authoritative private pilot asset binding", () => {
  test("resolves package to queue, candidate, completed worker job, and exact QA-passed asset", async () => {
    const binding = await resolveAuthoritativePrivatePilotBinding({
      repository: repository(),
      uploadPackageId: "package-1",
      videoAssetId: "asset-1",
      expectedCandidateId: "candidate-1",
      expectedChecksumSha256: "a".repeat(64),
      now: "2026-07-28T03:20:00.000Z"
    });
    expect(binding.preparedVideoAsset).toMatchObject({
      asset_id: "asset-1",
      checksum_sha256: "a".repeat(64),
      provider: "r2",
      server_accessible: true
    });
  });

  test.each([
    ["checksum mismatch", { video_checksum_sha256: "b".repeat(64) }],
    ["not server accessible", { prepared_video_asset_server_accessible: false }],
    ["URL mismatch", { prepared_video_asset_url: "https://assets.example/other.mp4" }],
    ["expired", { prepared_video_asset_expires_at: "2026-07-28T03:19:59.000Z" }]
  ])("blocks %s", async (_label, metadataPatch) => {
    await expect(resolveAuthoritativePrivatePilotBinding({
      repository: repository(metadataPatch),
      uploadPackageId: "package-1",
      videoAssetId: "asset-1",
      expectedChecksumSha256: "a".repeat(64),
      now: "2026-07-28T03:20:00.000Z"
    })).rejects.toThrow(/AUTHORITATIVE_ASSET_BINDING_REQUIRED|PREPARED_VIDEO_ASSET_EXPIRED/);
  });

  test("blocks a non-passed asset and a mismatched Worker job", async () => {
    const qaRepository = repository();
    qaRepository.getProductAssets = vi.fn(async () => [{
      ...assetFixture({}),
      qa_status: "needs_fix"
    }]);
    await expect(resolveAuthoritativePrivatePilotBinding({
      repository: qaRepository,
      uploadPackageId: "package-1",
      videoAssetId: "asset-1"
    })).rejects.toThrow("AUTHORITATIVE_ASSET_BINDING_REQUIRED");

    const workerRepository = repository();
    workerRepository.getWorkerJob = vi.fn(async () => ({
      ...workerJobFixture(),
      id: "job-other"
    }));
    await expect(resolveAuthoritativePrivatePilotBinding({
      repository: workerRepository,
      uploadPackageId: "package-1",
      videoAssetId: "asset-1"
    })).rejects.toThrow("AUTHORITATIVE_ASSET_BINDING_REQUIRED");
  });
});

function repository(metadataPatch: Record<string, unknown> = {}) {
  const queue = queueFixture();
  const candidate = candidateFixture();
  const job = workerJobFixture();
  const asset = assetFixture(metadataPatch);
  const uploadPackage = packageFixture();
  return {
    getChannelUploadPackage: vi.fn(async () => uploadPackage),
    getQueueItem: vi.fn(async () => queue),
    getProductAssets: vi.fn(async () => [asset]),
    getProductCandidate: vi.fn(async () => candidate),
    getWorkerJob: vi.fn(async () => job)
  } as unknown as AutomationRepository;
}

function queueFixture(): ProductQueueItem {
  return {
    id: "queue-1",
    queue_date: "2026-07-28",
    queue_rank: 1,
    upload_slot: 1,
    scheduled_at: "2026-07-28T03:00:00.000Z",
    keyword: "제습기",
    theme: "scheduled",
    product_name: "제습기",
    category_path: "생활가전",
    price_now_text: "",
    thumbnail_url: "https://assets.example/thumb.jpg",
    raw_coupang_url: "https://www.coupang.com/vp/products/1",
    selected_affiliate_url: "https://link.coupang.com/a/example",
    product_score: 90,
    score_reason: "",
    video_angle: "",
    queue_status: "ready_for_manual_upload",
    video_url: "https://assets.example/video.mp4",
    video_snapshot_url: "",
    blog_draft_url: "",
    youtube_upload_status: "ready_to_upload",
    tiktok_upload_status: "not_ready",
    threads_post_status: "not_ready",
    manual_review_status: "approved",
    error_message: "",
    created_at: "2026-07-28T03:00:00.000Z",
    updated_at: "2026-07-28T03:00:00.000Z"
  };
}

function candidateFixture(): ProductCandidate {
  return {
    id: "candidate-1",
    product_name: "제습기",
    raw_coupang_url: "https://www.coupang.com/vp/products/1",
    selected_affiliate_url: "https://link.coupang.com/a/example",
    product_key: "coupang:1",
    promoted_queue_id: "queue-1",
    payload: {},
    created_at: "2026-07-28T03:00:00.000Z",
    updated_at: "2026-07-28T03:00:00.000Z"
  };
}

function workerJobFixture(): WorkerJob {
  return {
    id: "job-1",
    job_type: "video_render",
    status: "completed",
    product_queue_id: "queue-1",
    product_candidate_id: "candidate-1",
    priority: 1,
    payload: {},
    result: {},
    claimed_by: "worker-1",
    claimed_at: "",
    heartbeat_at: "",
    error_message: "",
    retry_count: 0,
    max_retries: 1,
    created_at: "",
    started_at: "",
    finished_at: ""
  };
}

function assetFixture(metadataPatch: Record<string, unknown>): ProductAsset {
  return {
    id: "asset-1",
    product_queue_id: "queue-1",
    product_candidate_id: "candidate-1",
    worker_job_id: "job-1",
    asset_type: "video",
    bucket: "rendered-videos",
    url: "https://assets.example/video.mp4",
    qa_status: "passed",
    qa_note: "",
    render_qa_metadata: {
      video_checksum_sha256: "a".repeat(64),
      video_size_bytes: 1000,
      prepared_video_asset_provider: "r2",
      prepared_video_asset_storage_key: "job-1/video.mp4",
      prepared_video_asset_url: "https://assets.example/video.mp4",
      prepared_video_asset_expires_at: "2026-07-28T03:30:00.000Z",
      prepared_video_asset_server_accessible: true,
      ...metadataPatch
    },
    created_at: ""
  };
}

function packageFixture(): ChannelUploadPackage {
  return {
    id: "package-1",
    product_queue_id: "queue-1",
    channel_profile_id: "channel-1",
    platform: "youtube",
    title: "제습기",
    description: "설명",
    hashtags: "#제습기",
    disclosure_text: "제휴 링크 포함",
    video_url: "https://assets.example/video.mp4",
    thumbnail_url: "",
    subtitle_url: "",
    upload_package_url: "",
    status: "manual_ready",
    uploaded_url: "",
    uploaded_at: "",
    uploaded_by: "",
    upload_notes: "",
    platform_upload_status: "manual_ready",
    upload_enabled: false,
    manual_upload_only: true,
    created_at: "",
    updated_at: ""
  };
}
