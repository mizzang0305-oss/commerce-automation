import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import type { YouTubeUploadAdapter, YouTubeUploadRequest, YouTubeUploadResult } from "../src/lib/uploads/youtube/types";
import {
  APPROVE_YOUTUBE_PRIVATE_UPLOAD_PILOT_1_ITEM_NO_COMMENT,
  executeV081PrivateUploadPilot
} from "../src/uploads/youtube/v081PrivateUploadPilot";
import {
  createV092ServerOnlyYouTubePrivateUploadExecutor
} from "../src/uploads/youtube/v092ServerOnlyYouTubePrivateUploadExecutor";
import type { V092PrivateUploadRequestResolver } from "../src/uploads/youtube/v092PrivateUploadExecutorBoundary";
import {
  runV084PrivateUploadPilotExecution
} from "../src/uploads/youtube/v084PrivateUploadExecutionInvocationRuntime";

const FULL_VIDEO_ID = "v092FullVideoIdMustNotLeak";
const FULL_CHANNEL_ID = `UC${"9".repeat(22)}`;
const RAW_AFFILIATE_URL = ["https://link.coupang.com", "a", "v092-hidden"].join("/");
const RAW_COUPANG_URL = ["https://www.coupang.com", "vp", "products", "992000001"].join("/");
const FORBIDDEN_REPORT_PATTERN = new RegExp([
  FULL_VIDEO_ID,
  FULL_CHANNEL_ID,
  RAW_AFFILIATE_URL,
  RAW_COUPANG_URL,
  "COUPANG_SECRET_KEY",
  "YOUTUBE_CLIENT_SECRET",
  "refresh_token",
  "access_token",
  "client_secret",
  "Authorization",
  "Bearer",
  "HmacSHA256",
  "signature="
].map(escapeRegExp).join("|"), "i");

describe("v092 server-only YouTube private upload executor boundary", () => {
  test("defines the real executor only behind a server-only module", async () => {
    const executorSource = await readFile(
      "src/uploads/youtube/v092ServerOnlyYouTubePrivateUploadExecutor.ts",
      "utf8"
    );
    const runtimeSource = await readFile(
      "src/uploads/youtube/v084PrivateUploadExecutionInvocationRuntime.ts",
      "utf8"
    );
    const serverWiringSource = await readFile(
      "src/uploads/youtube/v084PrivateUploadExecutionInvocationServer.ts",
      "utf8"
    );
    const purePlannerSource = await readFile(
      "src/uploads/youtube/v084PrivateUploadExecutionInvocation.ts",
      "utf8"
    );

    expect(executorSource).toMatch(/import\s+"server-only";/);
    expect(executorSource).toContain("ServerYouTubeUploadAdapter");
    expect(executorSource).toContain("createV092ServerOnlyYouTubePrivateUploadExecutor");
    expect(runtimeSource).toContain("createV092NoUploadPrivateExecutorPlaceholder");
    expect(runtimeSource).not.toContain("v092ServerOnlyYouTubePrivateUploadExecutor");
    expect(serverWiringSource).toMatch(/import\s+"server-only";/);
    expect(serverWiringSource).toContain("createV092ServerOnlyYouTubePrivateUploadExecutor");
    expect(purePlannerSource).not.toContain("v092ServerOnlyYouTubePrivateUploadExecutor");
    expect(purePlannerSource).not.toContain("ServerYouTubeUploadAdapter");
  });

  test("runtime injects the no-upload executor boundary and no longer reports executor-not-injected", async () => {
    const result = await runV084PrivateUploadPilotExecution(readyRuntimeRequest());

    expect(result.status).toBe("blocked");
    expect(result.v083AdapterInvoked).toBe(true);
    expect(result.v083AdapterMode).toBe("real_candidate");
    expect(result.v081Blockers).not.toContain("BLOCKED_V083_REAL_UPLOAD_EXECUTOR_NOT_INJECTED");
    expect(result.v081Blockers).toContain("BLOCKED_V081_UPLOAD_PACKAGE_MISSING");
    expect(result.videosInsertCalled).toBe(false);
    expect(result.videosInsertTotalCount).toBe(0);
    expect(result.commentThreadsInsertCalled).toBe(false);
    expect(result.uploadResultEvidence.present).toBe(false);
    expect(result.uploadResultStoreItem).toBeNull();
    expect(result.uploadResultStoreReport).toBeNull();
    expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });

  test("server-only executor blocks before adapter upload when request resolver is missing", async () => {
    const executor = createV092ServerOnlyYouTubePrivateUploadExecutor();
    const result = await executor(v081AdapterRequest());

    expect(result.status).toBe("BLOCKED");
    expect(result.blocker).toBe("BLOCKED_V081_UPLOAD_PACKAGE_MISSING");
    expect(result.videosInsertCalled).toBe(false);
    expect(result.videosInsertTotalCount).toBe(0);
    expect(result.commentThreadsInsertCalled).toBe(false);
    expect(result.fakeSuccess).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });

  test("incomplete upload adapter evidence remains blocked and does not create fake success", async () => {
    const executor = createV092ServerOnlyYouTubePrivateUploadExecutor({
      uploadRequestResolver: readyUploadRequestResolver(),
      uploadAdapter: new FakeYouTubeUploadAdapter({
        youtubeVideoId: null,
        succeeded: true,
        youtubeUploadExecuted: true
      })
    });
    const result = await executor(v081AdapterRequest());

    expect(result.status).toBe("BLOCKED");
    expect(result.blocker).toBe("BLOCKED_V083_ADAPTER_UPLOAD_EVIDENCE_INCOMPLETE");
    expect(result.videosInsertCalled).toBe(true);
    expect(result.videosInsertTotalCount).toBe(1);
    expect(result.commentThreadsInsertCalled).toBe(false);
    expect(result.fakeSuccess).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });

  test("adapter success without upload execution evidence remains blocked", async () => {
    const executor = createV092ServerOnlyYouTubePrivateUploadExecutor({
      uploadRequestResolver: readyUploadRequestResolver(),
      uploadAdapter: new FakeYouTubeUploadAdapter({
        youtubeVideoId: FULL_VIDEO_ID,
        succeeded: true,
        youtubeUploadExecuted: false
      })
    });
    const result = await executor(v081AdapterRequest());

    expect(result.status).toBe("BLOCKED");
    expect(result.blocker).toBe("BLOCKED_V083_ADAPTER_UPLOAD_EVIDENCE_INCOMPLETE");
    expect(result.videosInsertCalled).toBe(false);
    expect(result.videosInsertTotalCount).toBe(0);
    expect(result.commentThreadsInsertCalled).toBe(false);
    expect(result.fakeSuccess).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });

  test("complete test adapter evidence opens only the sanitized V081/V076 evidence path", async () => {
    const executor = createV092ServerOnlyYouTubePrivateUploadExecutor({
      uploadRequestResolver: readyUploadRequestResolver(),
      uploadAdapter: new FakeYouTubeUploadAdapter({
        youtubeVideoId: FULL_VIDEO_ID,
        succeeded: true,
        youtubeUploadExecuted: true
      }),
      now: () => "2026-07-06T00:00:00.000Z"
    });
    const result = await executeV081PrivateUploadPilot(makeV081Request(), {
      adapter: {
        mode: "real_candidate",
        uploadPrivatePilot: executor
      }
    });
    const serialized = JSON.stringify(result);

    expect(result.status).toBe("private_upload_completed");
    expect(result.adapterMode).toBe("real_candidate");
    expect(result.videosInsertCalled).toBe(true);
    expect(result.videosInsertTotalCount).toBe(1);
    expect(result.commentThreadsInsertCalled).toBe(false);
    expect(result.uploadResultEvidence.present).toBe(true);
    expect(result.uploadResultEvidence.youtubeVideoIdHashPrefix).toHaveLength(10);
    expect(result.uploadResultEvidence.channelIdHashPrefix).toHaveLength(10);
    expect(result.uploadResultStoreItem?.rawVideoIdStored).toBe(false);
    expect(result.uploadResultStoreItem?.rawChannelIdStored).toBe(false);
    expect(result.uploadResultStoreReport?.raw_video_ids_printed).toBe(false);
    expect(result.uploadResultStoreReport?.raw_channel_ids_printed).toBe(false);
    expect(serialized).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });
});

function readyRuntimeRequest() {
  return {
    mode: "private_upload_pilot_invocation" as const,
    dryRun: false,
    serverOnlyContext: true,
    v083AdapterAvailable: true,
    v088ResolverStatus: "bound" as const,
    v087BinderStatus: "ready_for_fresh_approval" as const,
    v085BinderStatus: "ready_for_fresh_approval" as const,
    queueItemId: "queue-v092-father",
    uploadPackageId: "pkg-v092-father",
    channelKey: "father_jobs" as const,
    visibility: "private" as const,
    maxItems: 1,
    approvalPhrase: APPROVE_YOUTUBE_PRIVATE_UPLOAD_PILOT_1_ITEM_NO_COMMENT,
    commentAutomationAllowed: false,
    schedulerExecutionAllowed: false,
    generatedAt: "2026-07-06T00:00:00.000Z",
    videoAssetHashPrefix: "videoasset",
    readiness: {
      v081PilotReady: true,
      v082RuntimeAdapterReady: true,
      tokenProviderReady: true,
      uploadScopeReady: true,
      videoAssetReady: true,
      uploadPackageReady: true,
      duplicateGuardReady: true,
      disclosureGuardReady: true,
      affiliateEvidenceReady: true,
      targetChannelEvidenceReady: true,
      metadataReady: true,
      quotaReady: true
    }
  };
}

function v081AdapterRequest() {
  return {
    uploadPackageId: "pkg-v092-father",
    queueItemId: "queue-v092-father",
    channelKey: "father_jobs" as const,
    visibility: "private" as const,
    maxItems: 1 as const,
    videoAssetHashPrefix: "videoasset",
    generatedAt: "2026-07-06T00:00:00.000Z"
  };
}

function makeV081Request() {
  return {
    uploadPackageId: "pkg-v092-father",
    queueItemId: "queue-v092-father",
    channelKey: "father_jobs" as const,
    visibility: "private" as const,
    approvalPhrase: APPROVE_YOUTUBE_PRIVATE_UPLOAD_PILOT_1_ITEM_NO_COMMENT,
    commentAutomationAllowed: false,
    schedulerExecutionAllowed: false,
    maxItems: 1,
    targetChannelId: FULL_CHANNEL_ID,
    rawCoupangUrl: RAW_COUPANG_URL,
    selectedAffiliateUrl: RAW_AFFILIATE_URL,
    videoAssetHashPrefix: "videoasset",
    generatedAt: "2026-07-06T00:00:00.000Z",
    readiness: {
      oauthReady: true,
      tokenProviderReady: true,
      videoAssetReady: true,
      uploadPackageReady: true,
      affiliateUrlEvidenceReady: true,
      coupangDisclosureReady: true,
      duplicateGuardReady: true,
      targetChannelReady: true,
      metadataReady: true,
      quotaReady: true
    }
  };
}

function readyUploadRequestResolver(): V092PrivateUploadRequestResolver {
  return async () => ({
    uploadRequest: {
      provider: "youtube",
      candidate_id: "candidate-v092",
      prepared_video_asset: {
        asset_id: "asset-v092",
        signed_url: "https://assets.example.test/v092.mp4",
        prepared_video_asset_url: "https://assets.example.test/v092.mp4",
        mime_type: "video/mp4",
        provider: "signed_url",
        server_accessible: true
      },
      video_path_or_url: "https://assets.example.test/v092.mp4",
      title: "v092 private pilot",
      description: "v092 private pilot description",
      tags: ["v092"],
      category_id: "26",
      visibility: "private",
      execution_intent: "private_execute",
      disclosure_text: "쿠팡 파트너스 활동 고지",
      selected_affiliate_url: RAW_AFFILIATE_URL,
      pinned_comment_template: "masked comment",
      on_screen_cta_text: "masked cta",
      made_for_kids: false,
      self_declared_made_for_kids: false
    },
    targetChannelId: FULL_CHANNEL_ID
  });
}

class FakeYouTubeUploadAdapter implements YouTubeUploadAdapter {
  constructor(
    private readonly result: {
      youtubeVideoId: string | null;
      succeeded: boolean;
      youtubeUploadExecuted: boolean;
    }
  ) {}

  async upload(request: YouTubeUploadRequest): Promise<YouTubeUploadResult> {
    expect(request.visibility).toBe("private");
    return {
      provider: "youtube",
      attempted: true,
      succeeded: this.result.succeeded,
      youtube_video_id: this.result.youtubeVideoId ?? undefined,
      visibility: "private",
      safe_message: this.result.succeeded ? "test adapter completed" : "test adapter blocked",
      blocked_reasons: this.result.succeeded ? [] : ["test_adapter_blocked"],
      side_effects: {
        external_api_called: this.result.youtubeUploadExecuted,
        youtube_upload_executed: this.result.youtubeUploadExecuted,
        uploaded: this.result.succeeded,
        db_written: false,
        r2_uploaded: false,
        queue_created: false,
        worker_job_created: false,
        platform_upload_triggered: this.result.youtubeUploadExecuted,
        public_upload_enabled: false
      },
      approval_required: true
    };
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
