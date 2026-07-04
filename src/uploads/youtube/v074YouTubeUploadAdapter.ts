import type { V074PublicUploadBlocker } from "./v074PublicUploadSafetyGate";
import { BlockedV074YouTubeUploadAdapter } from "./v074BlockedYouTubeUploadAdapter";
import { MockV074YouTubeUploadAdapter } from "./v074MockYouTubeUploadAdapter";
import type { V074YouTubeUploadRequest } from "./v074YouTubeUploadRequestBuilder";

export type V074YouTubeUploadAdapterMode = "blocked" | "mock" | "real_disabled";

export type V074YouTubeUploadAdapterResult = {
  status: "BLOCKED" | "MOCK_ONLY" | "DRY_RUN_ONLY";
  blocker: V074PublicUploadBlocker | null;
  youtubeVideoId: null;
  videosInsertCalled: false;
  uploadExecutionCalled: false;
  fakeSuccess: false;
  rawUrlsPrinted: false;
  rawChannelIdsPrinted: false;
  secretsPrinted: false;
};

export type V074YouTubeUploadAdapter = {
  mode: V074YouTubeUploadAdapterMode;
  upload(request: V074YouTubeUploadRequest): Promise<V074YouTubeUploadAdapterResult>;
};

export class DisabledRealV074YouTubeUploadAdapter implements V074YouTubeUploadAdapter {
  readonly mode = "real_disabled" as const;

  async upload(): Promise<V074YouTubeUploadAdapterResult> {
    return {
      status: "BLOCKED",
      blocker: "BLOCKED_V074_REAL_ADAPTER_DISABLED",
      youtubeVideoId: null,
      videosInsertCalled: false,
      uploadExecutionCalled: false,
      fakeSuccess: false,
      rawUrlsPrinted: false,
      rawChannelIdsPrinted: false,
      secretsPrinted: false
    };
  }
}

export function createDefaultV074YouTubeUploadAdapter(): V074YouTubeUploadAdapter {
  return new BlockedV074YouTubeUploadAdapter();
}

export {
  BlockedV074YouTubeUploadAdapter,
  MockV074YouTubeUploadAdapter
};
