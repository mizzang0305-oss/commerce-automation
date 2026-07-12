import "server-only";

import {
  ServerYouTubeUploadAdapter
} from "@/lib/uploads/youtube/youtubeUploadAdapter";
import {
  getYouTubeUploadAccessTokenForServerUpload
} from "@/lib/uploads/youtube/youtubeTokenProviderContract";
import type {
  YouTubeUploadAdapter
} from "@/lib/uploads/youtube/types";
import type {
  V081PrivateUploadPilotAdapterRequest,
  V081PrivateUploadPilotAdapterResult
} from "./v081PrivateUploadPilot";
import {
  blockedV092PrivateExecutorResult,
  isV092BlockedPrivateUploadRequestResolution,
  type V092PrivateUploadExecutorOptions,
  type V092ResolvedPrivateUploadRequest
} from "./v092PrivateUploadExecutorBoundary";
import type { V083RealPrivateUploadExecutor } from "./v083RealPrivateUploadExecutionAdapterCore";

export function createV092ServerOnlyYouTubePrivateUploadExecutor(
  options: V092PrivateUploadExecutorOptions = {}
): V083RealPrivateUploadExecutor {
  return async (request) => {
    const blocker = validateAdapterRequest(request);
    if (blocker) {
      return blockedResult(blocker);
    }

    if (!options.uploadRequestResolver) {
      return blockedResult("BLOCKED_V081_UPLOAD_PACKAGE_MISSING");
    }

    const resolved = await options.uploadRequestResolver(request);
    if (!resolved) {
      return blockedResult("BLOCKED_V081_UPLOAD_PACKAGE_MISSING");
    }
    if (isV092BlockedPrivateUploadRequestResolution(resolved)) {
      return blockedResult(resolved.blocker);
    }

    const uploadRequestBlocker = validateResolvedUploadRequest(resolved);
    if (uploadRequestBlocker) {
      return blockedResult(uploadRequestBlocker);
    }

    const uploadAdapter = options.uploadAdapter ?? createDefaultServerUploadAdapter(options);
    const uploadResult = await uploadAdapter.upload(resolved.uploadRequest);
    const videosInsertCalled = Boolean(uploadResult.side_effects.youtube_upload_executed);
    const youtubeVideoId = trimOrNull(uploadResult.youtube_video_id);
    const channelId = trimOrNull(resolved.targetChannelId);
    const uploadedAt = videosInsertCalled && uploadResult.succeeded && youtubeVideoId
      ? (options.now ?? (() => new Date().toISOString()))()
      : null;
    const completeEvidence = Boolean(videosInsertCalled && uploadResult.succeeded && youtubeVideoId && channelId && uploadedAt);

    if (!completeEvidence) {
      return {
        ...blockedResult(resolveUploadBlocker(uploadResult, videosInsertCalled)),
        videosInsertCalled,
        videosInsertTotalCount: videosInsertCalled ? 1 : 0
      };
    }

    return {
      status: "UPLOADED",
      blocker: null,
      youtubeVideoId,
      channelId,
      uploadedAt,
      videosInsertCalled: true,
      videosInsertTotalCount: 1,
      commentThreadsInsertCalled: false,
      fakeSuccess: false,
      rawUrlsPrinted: false,
      rawVideoIdsPrinted: false,
      rawChannelIdsPrinted: false,
      secretsPrinted: false
    };
  };
}

function createDefaultServerUploadAdapter(
  options: Pick<V092PrivateUploadExecutorOptions, "env" | "fetchImpl" | "preparedVideoAssetReader">
) {
  return new ServerYouTubeUploadAdapter({
    env: options.env,
    fetchImpl: options.fetchImpl,
    preparedVideoAssetReader: options.preparedVideoAssetReader,
    accessTokenProvider: () => getYouTubeUploadAccessTokenForServerUpload({
      env: options.env,
      fetchImpl: options.fetchImpl
    })
  });
}

function validateAdapterRequest(request: V081PrivateUploadPilotAdapterRequest):
  V081PrivateUploadPilotAdapterResult["blocker"] {
  if (!trimOrNull(request.queueItemId)) {
    return "BLOCKED_V081_QUEUE_ITEM_MISSING";
  }
  if (!trimOrNull(request.uploadPackageId)) {
    return "BLOCKED_V081_UPLOAD_PACKAGE_MISSING";
  }
  if (request.visibility !== "private") {
    return request.visibility === "unlisted"
      ? "BLOCKED_V081_UNLISTED_UPLOAD_REQUESTED"
      : "BLOCKED_V081_PUBLIC_UPLOAD_REQUESTED";
  }
  if (request.maxItems !== 1) {
    return "BLOCKED_V081_MAX_ITEMS_NOT_ONE";
  }
  return null;
}

function validateResolvedUploadRequest(
  resolved: V092ResolvedPrivateUploadRequest
): V081PrivateUploadPilotAdapterResult["blocker"] {
  if (resolved.uploadRequest.visibility !== "private") {
    return resolved.uploadRequest.visibility === "unlisted"
      ? "BLOCKED_V081_UNLISTED_UPLOAD_REQUESTED"
      : "BLOCKED_V081_PUBLIC_UPLOAD_REQUESTED";
  }
  if (resolved.uploadRequest.execution_intent !== "private_execute") {
    return "BLOCKED_V081_MUTATION_ATTEMPT_OUTSIDE_APPROVED_PATH";
  }
  if (!trimOrNull(resolved.targetChannelId)) {
    return "BLOCKED_V081_TARGET_CHANNEL_EVIDENCE_MISSING";
  }
  return null;
}

function resolveUploadBlocker(
  result: Awaited<ReturnType<YouTubeUploadAdapter["upload"]>>,
  videosInsertCalled: boolean
): NonNullable<V081PrivateUploadPilotAdapterResult["blocker"]> {
  if (videosInsertCalled || result.succeeded) {
    return "BLOCKED_V083_ADAPTER_UPLOAD_EVIDENCE_INCOMPLETE";
  }
  if (result.blocked_reasons.includes("server_accessible_asset_required")) {
    return "BLOCKED_V081_VIDEO_ASSET_MISSING";
  }
  if (result.blocked_reasons.includes("token_not_ready")) {
    return "BLOCKED_V081_TOKEN_PROVIDER_NOT_READY";
  }
  return "BLOCKED_V081_REAL_ADAPTER_DISABLED";
}

function blockedResult(
  blocker: NonNullable<V081PrivateUploadPilotAdapterResult["blocker"]>
): V081PrivateUploadPilotAdapterResult {
  return blockedV092PrivateExecutorResult(blocker);
}

function trimOrNull(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized : null;
}
