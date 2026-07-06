import {
  BlockedV081PrivateUploadPilotAdapter,
  type V081PrivateUploadPilotAdapter,
  type V081PrivateUploadPilotAdapterRequest,
  type V081PrivateUploadPilotAdapterResult
} from "./v081PrivateUploadPilot";
import {
  buildV083PrivateUploadExecutionReadiness,
  type V083PrivateUploadExecutionReadiness,
  type V083PrivateUploadExecutionReadinessInput
} from "./v083PrivateUploadExecutionReadiness";

export type V083RealPrivateUploadExecutionAdapterFactoryInput =
  V083PrivateUploadExecutionReadinessInput & {
    uploadExecutor?: V083RealPrivateUploadExecutor;
  };

export type V083RealPrivateUploadExecutor = (
  request: V081PrivateUploadPilotAdapterRequest
) => Promise<V081PrivateUploadPilotAdapterResult>;

export type V083RealPrivateUploadExecutionAdapterFactory = {
  version: "v083";
  readiness: V083PrivateUploadExecutionReadiness;
  adapter: V081PrivateUploadPilotAdapter;
  executionAllowedInThisPr: false;
  uploadExecutionCalled: false;
  videos_insert_called: false;
  videos_insert_total_count: 0;
  commentThreads_insert_called: false;
  visibility_changed: false;
  scheduler_executed: false;
  raw_urls_printed: false;
  raw_video_ids_printed: false;
  raw_channel_ids_printed: false;
  secrets_printed: false;
  fake_success: false;
};

class V083RealPrivateUploadExecutionAdapter implements V081PrivateUploadPilotAdapter {
  readonly mode = "real_candidate" as const;

  constructor(private readonly uploadExecutor?: V083RealPrivateUploadExecutor) {}

  async uploadPrivatePilot(
    request: V081PrivateUploadPilotAdapterRequest
  ): Promise<V081PrivateUploadPilotAdapterResult> {
    if (!this.uploadExecutor) {
      return {
        status: "BLOCKED",
        blocker: "BLOCKED_V083_REAL_UPLOAD_EXECUTOR_NOT_INJECTED",
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

    return this.uploadExecutor(request);
  }
}

export function createV083RealPrivateUploadExecutionAdapterFactory(
  input: V083RealPrivateUploadExecutionAdapterFactoryInput = {}
): V083RealPrivateUploadExecutionAdapterFactory {
  const readiness = buildV083PrivateUploadExecutionReadiness(input);
  const adapter = readiness.ready
    ? new V083RealPrivateUploadExecutionAdapter(input.uploadExecutor)
    : new BlockedV081PrivateUploadPilotAdapter();

  return {
    version: "v083",
    readiness,
    adapter,
    executionAllowedInThisPr: false,
    uploadExecutionCalled: false,
    videos_insert_called: false,
    videos_insert_total_count: 0,
    commentThreads_insert_called: false,
    visibility_changed: false,
    scheduler_executed: false,
    raw_urls_printed: false,
    raw_video_ids_printed: false,
    raw_channel_ids_printed: false,
    secrets_printed: false,
    fake_success: false
  };
}
