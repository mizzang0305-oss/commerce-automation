import type { YouTubeUploadAdapter, YouTubeUploadRequest } from "@/lib/uploads/youtube/types";
import type {
  V081PrivateUploadPilotAdapterRequest,
  V081PrivateUploadPilotAdapterResult
} from "./v081PrivateUploadPilot";
import type { V083RealPrivateUploadExecutor } from "./v083RealPrivateUploadExecutionAdapterCore";

export type V092ResolvedPrivateUploadRequest = {
  uploadRequest: YouTubeUploadRequest;
  targetChannelId: string | null;
};

export type V092PrivateUploadRequestResolver = (
  request: V081PrivateUploadPilotAdapterRequest
) => Promise<V092ResolvedPrivateUploadRequest | null>;

export type V092PrivateUploadExecutorOptions = {
  uploadRequestResolver?: V092PrivateUploadRequestResolver;
  uploadAdapter?: YouTubeUploadAdapter;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  uploadAssetProfile?: string | null;
  fetchImpl?: typeof fetch;
  now?: () => string;
};

export function createV092NoUploadPrivateExecutorPlaceholder(): V083RealPrivateUploadExecutor {
  return async () => blockedResult("BLOCKED_V081_UPLOAD_PACKAGE_MISSING");
}

export function blockedV092PrivateExecutorResult(
  blocker: NonNullable<V081PrivateUploadPilotAdapterResult["blocker"]>
): V081PrivateUploadPilotAdapterResult {
  return blockedResult(blocker);
}

function blockedResult(
  blocker: NonNullable<V081PrivateUploadPilotAdapterResult["blocker"]>
): V081PrivateUploadPilotAdapterResult {
  return {
    status: "BLOCKED",
    blocker,
    youtubeVideoId: null,
    channelId: null,
    uploadedAt: null,
    videosInsertCalled: false,
    videosInsertTotalCount: 0,
    commentThreadsInsertCalled: false,
    fakeSuccess: false,
    rawUrlsPrinted: false,
    rawVideoIdsPrinted: false,
    rawChannelIdsPrinted: false,
    secretsPrinted: false
  };
}
