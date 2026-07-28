import { describe, expect, test, vi } from "vitest";
import type { ChannelUploadPackage } from "@/types/automation";
import type { YouTubeUploadRequest } from "@/lib/uploads/youtube/types";
import { executeScheduledPrivatePilot } from "@/lib/uploads/youtube/scheduledPrivatePilotGate";

describe("scheduled private pilot upload gate", () => {
  test("without fresh approval calls videos.insert zero times", async () => {
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

  test("allows exactly one private item and stores only sanitized identifiers", async () => {
    const upload = vi.fn(async () => ({
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
    const result = await executeScheduledPrivatePilot(baseInput(upload));
    expect(upload).toHaveBeenCalledTimes(1);
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

  test("blocks unlisted, public-equivalent safety drift, duplicate, and daily second upload", async () => {
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
      duplicateUploadExists: true
    });
    expect(duplicate).toMatchObject({ ok: false, blocker: "DUPLICATE_UPLOAD_BLOCKED" });

    const dailyLimit = await executeScheduledPrivatePilot({
      ...baseInput(upload),
      dailyPrivateUploadCount: 1
    });
    expect(dailyLimit).toMatchObject({ ok: false, blocker: "DAILY_PRIVATE_UPLOAD_LIMIT_REACHED" });
    expect(upload).not.toHaveBeenCalled();
  });

  test("after an external call failure requires human review and never retries", async () => {
    const upload = vi.fn(async () => ({
      provider: "youtube" as const,
      attempted: true,
      succeeded: false,
      visibility: "private" as const,
      safe_message: "failed",
      blocked_reasons: ["youtube_video_upload_failed"],
      side_effects: {
        external_api_called: true,
        youtube_upload_executed: true,
        uploaded: false,
        db_written: false as const,
        r2_uploaded: false as const,
        queue_created: false as const,
        worker_job_created: false as const,
        platform_upload_triggered: true,
        public_upload_enabled: false as const
      },
      approval_required: true as const
    }));
    const result = await executeScheduledPrivatePilot(baseInput(upload));
    expect(result).toMatchObject({
      ok: false,
      status: "HUMAN_REVIEW_REQUIRED",
      adapter_call_count: 1,
      automatic_retry_attempted: false
    });
    expect(upload).toHaveBeenCalledTimes(1);
  });
});

function baseInput(upload: ReturnType<typeof vi.fn>) {
  return {
    uploadPackage: packageFixture(),
    request: requestFixture(),
    approval: {
      decision: "PASS" as const,
      package_id: "package-1",
      approved_at: "2026-07-28T03:15:00.000Z",
      expires_at: "2026-07-28T03:30:00.000Z",
      nonce: "fresh-owner-nonce"
    },
    adapter: { upload },
    now: "2026-07-28T03:20:00.000Z",
    dailyPrivateUploadCount: 0,
    duplicateUploadExists: false,
    safety: safety()
  };
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
