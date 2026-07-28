import { describe, expect, test, vi } from "vitest";
import type { ChannelUploadPackage } from "@/types/automation";
import type { YouTubeUploadRequest } from "@/lib/uploads/youtube/types";
import type { PrivatePilotReservationStore } from "@/lib/uploads/youtube/privatePilotRepository";
import { executeScheduledPrivatePilot } from "@/lib/uploads/youtube/scheduledPrivatePilotGate";

describe("scheduled private pilot upload gate", () => {
  test("without a persisted fresh approval calls videos.insert zero times", async () => {
    const upload = vi.fn();
    const result = await executeScheduledPrivatePilot({
      ...baseInput(upload),
      approval: undefined
    });
    expect(result).toMatchObject({
      ok: false,
      blocker: "FRESH_OWNER_APPROVAL_REQUIRED",
      adapter_call_count: 0,
      videos_insert_succeeded: false
    });
    expect(upload).not.toHaveBeenCalled();
  });

  test("reserves atomically, transitions before the call, and completes once", async () => {
    const upload = successfulUpload();
    const store = reservationStore();
    const result = await executeScheduledPrivatePilot(baseInput(upload, store));
    expect(upload).toHaveBeenCalledTimes(1);
    expect(store.reserve).toHaveBeenCalledTimes(1);
    expect(store.markExternalCallStarted).toHaveBeenCalledTimes(1);
    expect(store.complete).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      ok: true,
      status: "private_uploaded",
      visibility: "private",
      adapter_call_count: 1,
      videos_insert_succeeded: true,
      comment_threads_insert_called: false,
      automatic_retry_attempted: false
    });
    expect(JSON.stringify(result)).not.toContain("FULL_VIDEO_ID_MUST_NOT_LEAK");
    expect(JSON.stringify(result)).not.toContain("youtube.example");
  });

  test("reservation conflict keeps adapter calls at zero", async () => {
    const upload = vi.fn();
    const store = reservationStore({
      reserve: vi.fn(async () => ({
        reserved: false as const,
        blocker: "DUPLICATE_OR_DAILY_PRIVATE_UPLOAD_BLOCKED"
      }))
    });
    const result = await executeScheduledPrivatePilot(baseInput(upload, store));
    expect(result).toMatchObject({
      ok: false,
      blocker: "DUPLICATE_OR_DAILY_PRIVATE_UPLOAD_BLOCKED",
      adapter_call_count: 0
    });
    expect(upload).not.toHaveBeenCalled();
  });

  test("pre-external transition failure records failed_before_external_call and calls adapter zero times", async () => {
    const upload = vi.fn();
    const store = reservationStore({
      markExternalCallStarted: vi.fn(async () => false)
    });
    const result = await executeScheduledPrivatePilot(baseInput(upload, store));
    expect(result).toMatchObject({
      ok: false,
      blocker: "PRE_EXTERNAL_TRANSITION_FAILED",
      adapter_call_count: 0
    });
    expect(store.markFailedBeforeExternalCall).toHaveBeenCalledWith(
      "reservation-1",
      "PRE_EXTERNAL_TRANSITION_FAILED"
    );
    expect(upload).not.toHaveBeenCalled();
  });

  test("blocks unlisted, public-equivalent safety drift, and already uploaded package", async () => {
    const upload = vi.fn();
    const unlisted = await executeScheduledPrivatePilot({
      ...baseInput(upload),
      request: { ...requestFixture(), visibility: "unlisted" }
    });
    expect(unlisted).toMatchObject({ ok: false, blocker: "UNLISTED_UPLOAD_BLOCKED", adapter_call_count: 0 });

    const safetyDrift = await executeScheduledPrivatePilot({
      ...baseInput(upload),
      safety: { ...safety(), PUBLIC_UPLOAD_ENABLED: true as never }
    });
    expect(safetyDrift).toMatchObject({ ok: false, blocker: "PUBLIC_UPLOAD_MUST_REMAIN_DISABLED" });

    const duplicate = await executeScheduledPrivatePilot({
      ...baseInput(upload),
      uploadPackage: { ...packageFixture(), uploaded_at: "2026-07-28T03:19:00.000Z" }
    });
    expect(duplicate).toMatchObject({ ok: false, blocker: "DUPLICATE_UPLOAD_BLOCKED" });
    expect(upload).not.toHaveBeenCalled();
  });

  test("after an external-call throw requires human review and never retries", async () => {
    const upload = vi.fn(async () => {
      throw new Error("response lost");
    });
    const store = reservationStore();
    const result = await executeScheduledPrivatePilot(baseInput(upload, store));
    expect(result).toMatchObject({
      ok: false,
      status: "HUMAN_REVIEW_REQUIRED",
      adapter_call_count: 1,
      automatic_retry_attempted: false
    });
    expect(store.markHumanReviewRequired).toHaveBeenCalledWith(
      "reservation-1",
      "YOUTUBE_UPLOAD_EXTERNAL_CALL_FAILED"
    );
    expect(upload).toHaveBeenCalledTimes(1);
  });

  test("post-call persistence failure requires human review without re-upload", async () => {
    const upload = successfulUpload();
    const store = reservationStore({
      complete: vi.fn(async () => false)
    });
    const result = await executeScheduledPrivatePilot(baseInput(upload, store));
    expect(result).toMatchObject({
      ok: false,
      status: "HUMAN_REVIEW_REQUIRED",
      blocker: "PRIVATE_UPLOAD_RESULT_PERSISTENCE_FAILED",
      adapter_call_count: 1,
      automatic_retry_attempted: false
    });
    expect(store.markHumanReviewRequired).toHaveBeenCalledWith(
      "reservation-1",
      "PRIVATE_UPLOAD_RESULT_PERSISTENCE_FAILED"
    );
    expect(upload).toHaveBeenCalledTimes(1);
  });
});

function baseInput(
  upload: ReturnType<typeof vi.fn>,
  store: PrivatePilotReservationStore = reservationStore()
) {
  return {
    uploadPackage: packageFixture(),
    request: requestFixture(),
    approval: {
      approval_id: "approval-1",
      upload_package_id: "package-1",
      product_candidate_id: "candidate-1",
      video_asset_id: "asset-1",
      video_checksum_sha256: "a".repeat(64),
      status: "approved" as const,
      approved_at: "2026-07-28T03:15:00.000Z",
      expires_at: "2026-07-28T03:30:00.000Z",
      consumed_at: ""
    },
    approvalNonce: "b".repeat(64),
    reservationStore: store,
    adapter: { upload },
    now: "2026-07-28T03:20:00.000Z",
    safety: safety()
  };
}

function reservationStore(
  overrides: Partial<PrivatePilotReservationStore> = {}
): PrivatePilotReservationStore {
  return {
    reserve: vi.fn(async () => ({ reserved: true as const, reservationId: "reservation-1" })),
    markExternalCallStarted: vi.fn(async () => true),
    markFailedBeforeExternalCall: vi.fn(async () => true),
    markHumanReviewRequired: vi.fn(async () => true),
    complete: vi.fn(async () => true),
    ...overrides
  };
}

function successfulUpload() {
  return vi.fn(async () => ({
    provider: "youtube" as const,
    attempted: true,
    succeeded: true,
    youtube_video_id: "FULL_VIDEO_ID_MUST_NOT_LEAK",
    youtube_url: "https://youtube.example/watch?v=FULL_VIDEO_ID_MUST_NOT_LEAK",
    visibility: "private" as const,
    safe_message: "uploaded",
    blocked_reasons: [],
    side_effects: {
      external_api_called: true,
      youtube_upload_executed: true,
      uploaded: true,
      db_written: false as const,
      r2_uploaded: false as const,
      queue_created: false as const,
      worker_job_created: false as const,
      platform_upload_triggered: true,
      public_upload_enabled: false as const
    },
    approval_required: true as const
  }));
}

function safety() {
  return {
    SAFE_TO_UPLOAD: true,
    SAFE_TO_PUBLIC_UPLOAD: false as const,
    PUBLIC_UPLOAD_ENABLED: false as const,
    UNLISTED_UPLOAD_ENABLED: false as const,
    COMMENT_AUTOMATION_ENABLED: false as const,
    MAX_PRIVATE_PILOT_ITEMS: 1 as const,
    FAKE_SUCCESS: false as const
  };
}

function packageFixture(): ChannelUploadPackage {
  return {
    id: "package-1",
    product_queue_id: "queue-1",
    channel_profile_id: "channel-1",
    platform: "youtube",
    title: "제습기 사용 팁",
    description: "설명",
    hashtags: "#제습기",
    disclosure_text: "제휴 링크가 포함됩니다.",
    video_url: "https://assets.example/video.mp4",
    thumbnail_url: "https://assets.example/thumb.jpg",
    subtitle_url: "https://assets.example/captions.srt",
    upload_package_url: "https://assets.example/package.txt",
    status: "manual_ready",
    uploaded_url: "",
    uploaded_at: "",
    uploaded_by: "",
    upload_notes: "",
    platform_upload_status: "not_started",
    upload_enabled: false,
    manual_upload_only: true,
    created_at: "2026-07-28T03:00:00.000Z",
    updated_at: "2026-07-28T03:00:00.000Z"
  };
}

function requestFixture(): YouTubeUploadRequest {
  return {
    provider: "youtube",
    candidate_id: "candidate-1",
    prepared_video_asset: {
      asset_id: "asset-1",
      provider: "r2",
      storage_key: "job-1/video.mp4",
      mime_type: "video/mp4",
      size_bytes: 1000,
      checksum_sha256: "a".repeat(64),
      prepared_video_asset_url: "https://assets.example/video.mp4",
      signed_url: "",
      expires_at: "",
      server_accessible: true
    },
    video_path_or_url: "https://assets.example/video.mp4",
    title: "제습기 사용 팁",
    description: "설명",
    tags: ["제습기"],
    visibility: "private",
    execution_intent: "private_execute",
    disclosure_text: "제휴 링크가 포함됩니다.",
    selected_affiliate_url: "https://link.coupang.com/a/private-pilot",
    pinned_comment_template: "",
    on_screen_cta_text: "",
    made_for_kids: false,
    self_declared_made_for_kids: false
  };
}
