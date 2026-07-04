import type {
  V074YouTubeUploadAdapter,
  V074YouTubeUploadAdapterResult
} from "./v074YouTubeUploadAdapter";

export class BlockedV074YouTubeUploadAdapter implements V074YouTubeUploadAdapter {
  readonly mode = "blocked" as const;

  async upload(): Promise<V074YouTubeUploadAdapterResult> {
    return {
      status: "BLOCKED",
      blocker: "BLOCKED_V074_REAL_YOUTUBE_MUTATION_FORBIDDEN",
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
