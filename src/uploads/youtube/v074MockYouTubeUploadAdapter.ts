import type {
  V074YouTubeUploadAdapter,
  V074YouTubeUploadAdapterResult
} from "./v074YouTubeUploadAdapter";

export class MockV074YouTubeUploadAdapter implements V074YouTubeUploadAdapter {
  readonly mode = "mock" as const;

  async upload(): Promise<V074YouTubeUploadAdapterResult> {
    return {
      status: "MOCK_ONLY",
      blocker: null,
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
