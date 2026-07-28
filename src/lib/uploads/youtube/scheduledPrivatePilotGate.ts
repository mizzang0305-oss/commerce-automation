import { createHash } from "node:crypto";
import type { ChannelUploadPackage } from "@/types/automation";
import type {
  YouTubeUploadAdapter,
  YouTubeUploadRequest
} from "@/lib/uploads/youtube/types";
import type {
  PrivatePilotOwnerApproval,
  PrivatePilotReservationStore
} from "@/lib/uploads/youtube/privatePilotRepository";

export type ScheduledPrivatePilotResult =
  | {
      ok: true;
      status: "private_uploaded";
      visibility: "private";
      adapter_call_count: 1;
      videos_insert_succeeded: true;
      comment_threads_insert_called: false;
      automatic_retry_attempted: false;
      sanitized_result: {
        video_id_sha256_prefix: string;
        video_url_sha256_prefix: string;
      };
    }
  | {
      ok: false;
      status: "blocked" | "HUMAN_REVIEW_REQUIRED";
      blocker: string;
      adapter_call_count: 0 | 1;
      videos_insert_succeeded: false;
      comment_threads_insert_called: false;
      automatic_retry_attempted: false;
    };

export async function executeScheduledPrivatePilot(input: {
  uploadPackage: ChannelUploadPackage;
  request: YouTubeUploadRequest;
  approval?: PrivatePilotOwnerApproval;
  approvalNonce?: string;
  reservationStore: PrivatePilotReservationStore;
  adapter: YouTubeUploadAdapter;
  now?: string | Date;
  safety: {
    SAFE_TO_UPLOAD: boolean;
    SAFE_TO_PUBLIC_UPLOAD: false;
    PUBLIC_UPLOAD_ENABLED: false;
    UNLISTED_UPLOAD_ENABLED: false;
    COMMENT_AUTOMATION_ENABLED: false;
    MAX_PRIVATE_PILOT_ITEMS: 1;
    FAKE_SUCCESS: false;
  };
}): Promise<ScheduledPrivatePilotResult> {
  const blockedReason = validate(input);
  if (blockedReason) return blocked(blockedReason, 0);

  const reservation = await input.reservationStore.reserve({
    uploadPackageId: input.uploadPackage.id,
    approvalId: input.approval!.approval_id,
    approvalNonce: input.approvalNonce!
  });
  if (!reservation.reserved) return blocked(reservation.blocker, 0);

  let externalCallStarted = false;
  try {
    externalCallStarted = await input.reservationStore.markExternalCallStarted(
      reservation.reservationId
    );
  } catch {
    externalCallStarted = false;
  }
  if (!externalCallStarted) {
    await bestEffort(() =>
      input.reservationStore.markFailedBeforeExternalCall(
        reservation.reservationId,
        "PRE_EXTERNAL_TRANSITION_FAILED"
      )
    );
    return blocked("PRE_EXTERNAL_TRANSITION_FAILED", 0);
  }

  let result;
  try {
    result = await input.adapter.upload(input.request);
  } catch {
    await bestEffort(() =>
      input.reservationStore.markHumanReviewRequired(
        reservation.reservationId,
        "YOUTUBE_UPLOAD_EXTERNAL_CALL_FAILED"
      )
    );
    return humanReview("YOUTUBE_UPLOAD_EXTERNAL_CALL_FAILED", 1);
  }
  if (!result.succeeded || !result.side_effects.uploaded) {
    await bestEffort(() =>
      input.reservationStore.markHumanReviewRequired(
        reservation.reservationId,
        "YOUTUBE_UPLOAD_EXTERNAL_CALL_FAILED"
      )
    );
    return humanReview("YOUTUBE_UPLOAD_EXTERNAL_CALL_FAILED", 1);
  }
  const videoId = result.youtube_video_id?.trim() ?? "";
  const videoUrl = result.youtube_url?.trim() ?? "";
  if (!videoId || !videoUrl) {
    await bestEffort(() =>
      input.reservationStore.markHumanReviewRequired(
        reservation.reservationId,
        "YOUTUBE_UPLOAD_RESULT_INCOMPLETE"
      )
    );
    return humanReview("YOUTUBE_UPLOAD_RESULT_INCOMPLETE", 1);
  }
  const sanitizedResult = {
    video_id_sha256_prefix: sha256(videoId).slice(0, 12),
    video_url_sha256_prefix: sha256(videoUrl).slice(0, 12)
  };
  let persisted = false;
  try {
    persisted = await input.reservationStore.complete(reservation.reservationId, {
      videoIdSha256Prefix: sanitizedResult.video_id_sha256_prefix,
      videoUrlSha256Prefix: sanitizedResult.video_url_sha256_prefix
    });
  } catch {
    persisted = false;
  }
  if (!persisted) {
    await bestEffort(() =>
      input.reservationStore.markHumanReviewRequired(
        reservation.reservationId,
        "PRIVATE_UPLOAD_RESULT_PERSISTENCE_FAILED"
      )
    );
    return humanReview("PRIVATE_UPLOAD_RESULT_PERSISTENCE_FAILED", 1);
  }
  return {
    ok: true,
    status: "private_uploaded",
    visibility: "private",
    adapter_call_count: 1,
    videos_insert_succeeded: true,
    comment_threads_insert_called: false,
    automatic_retry_attempted: false,
    sanitized_result: sanitizedResult
  };
}

function validate(input: Parameters<typeof executeScheduledPrivatePilot>[0]) {
  if (!input.safety.SAFE_TO_UPLOAD) return "SAFE_TO_UPLOAD_FALSE";
  if (input.safety.SAFE_TO_PUBLIC_UPLOAD || input.safety.PUBLIC_UPLOAD_ENABLED) {
    return "PUBLIC_UPLOAD_MUST_REMAIN_DISABLED";
  }
  if (input.safety.UNLISTED_UPLOAD_ENABLED) return "UNLISTED_UPLOAD_MUST_REMAIN_DISABLED";
  if (input.safety.COMMENT_AUTOMATION_ENABLED) return "COMMENT_AUTOMATION_MUST_REMAIN_DISABLED";
  if (input.safety.MAX_PRIVATE_PILOT_ITEMS !== 1) return "MAX_PRIVATE_PILOT_ITEMS_MUST_EQUAL_ONE";
  if (input.safety.FAKE_SUCCESS) return "FAKE_SUCCESS_MUST_REMAIN_FALSE";
  if (input.request.visibility !== "private") {
    return input.request.visibility === "unlisted" ? "UNLISTED_UPLOAD_BLOCKED" : "PUBLIC_UPLOAD_BLOCKED";
  }
  if (input.request.execution_intent !== "private_execute") return "PRIVATE_EXECUTION_INTENT_REQUIRED";
  if (input.uploadPackage.status !== "manual_ready" || !input.uploadPackage.manual_upload_only) {
    return "UPLOAD_PACKAGE_NOT_MANUAL_READY";
  }
  if (
    input.uploadPackage.id !== input.approval?.upload_package_id ||
    input.request.candidate_id !== input.approval?.product_candidate_id ||
    input.request.prepared_video_asset.asset_id !== input.approval?.video_asset_id ||
    input.request.prepared_video_asset.checksum_sha256 !== input.approval?.video_checksum_sha256 ||
    input.approval?.status !== "approved" ||
    !/^[a-f0-9]{64}$/.test(input.approvalNonce ?? "")
  ) {
    return "FRESH_OWNER_APPROVAL_REQUIRED";
  }
  const now = toMillis(input.now ?? new Date());
  const approvedAt = toMillis(input.approval.approved_at);
  const expiresAt = toMillis(input.approval.expires_at);
  if (!Number.isFinite(approvedAt) || !Number.isFinite(expiresAt) || approvedAt > now || expiresAt < now) {
    return "FRESH_OWNER_APPROVAL_REQUIRED";
  }
  if (input.uploadPackage.uploaded_at || input.uploadPackage.uploaded_url) {
    return "DUPLICATE_UPLOAD_BLOCKED";
  }
  return "";
}

function blocked(blocker: string, adapterCallCount: 0 | 1): ScheduledPrivatePilotResult {
  return {
    ok: false,
    status: "blocked",
    blocker,
    adapter_call_count: adapterCallCount,
    videos_insert_succeeded: false,
    comment_threads_insert_called: false,
    automatic_retry_attempted: false
  };
}

function humanReview(blocker: string, adapterCallCount: 1): ScheduledPrivatePilotResult {
  return {
    ok: false,
    status: "HUMAN_REVIEW_REQUIRED",
    blocker,
    adapter_call_count: adapterCallCount,
    videos_insert_succeeded: false,
    comment_threads_insert_called: false,
    automatic_retry_attempted: false
  };
}

function toMillis(value: string | Date) {
  return new Date(value).getTime();
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function bestEffort(action: () => Promise<unknown>) {
  try {
    await action();
  } catch {
    // The reservation remains external_call_started and is never auto-retried.
  }
}
