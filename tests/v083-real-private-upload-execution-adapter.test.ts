import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import {
  APPROVE_YOUTUBE_PRIVATE_UPLOAD_PILOT_1_ITEM_NO_COMMENT,
  executeV081PrivateUploadPilot,
  MockV081PrivateUploadPilotAdapter,
  type V081PrivateUploadPilotAdapter,
  type V081PrivateUploadPilotAdapterResult,
  type V081PrivateUploadPilotRequest
} from "../src/uploads/youtube/v081PrivateUploadPilot";
import {
  APPROVE_BUILD_V083_REAL_PRIVATE_UPLOAD_EXECUTION_ADAPTER_NO_UPLOAD,
  createV083RealPrivateUploadExecutionAdapterFactory,
  type V083RealPrivateUploadExecutionAdapterFactoryInput
} from "../src/uploads/youtube/v083RealPrivateUploadExecutionAdapter";
import {
  buildV083PrivateUploadExecutionReadiness,
  buildV083PrivateUploadExecutionReadinessReport
} from "../src/uploads/youtube/v083PrivateUploadExecutionReadiness";

const FULL_VIDEO_ID = "v083FullVideoIdMustNotLeak";
const FULL_CHANNEL_ID = `UC${"3".repeat(22)}`;
const RAW_AFFILIATE_URL = ["https://link.coupang.com", "a", "v083-hidden"].join("/");
const RAW_COUPANG_URL = ["https://www.coupang.com", "vp", "products", "983000001"].join("/");
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

describe("v083 real private upload execution adapter no-upload wiring", () => {
  test("blocks when build approval phrase is missing", () => {
    const readiness = buildV083PrivateUploadExecutionReadiness(readyInput({
      buildApprovalPhrase: null
    }));

    expect(readiness.ready).toBe(false);
    expect(readiness.executableCandidate).toBe(false);
    expect(readiness.blockers).toContain("BLOCKED_V083_BUILD_APPROVAL_REQUIRED");
    expect(readiness.mutationSafety.videosInsertCalled).toBe(false);
  });

  test.each([
    ["serverOnlyContext", false, "BLOCKED_V083_SERVER_ONLY_CONTEXT_REQUIRED"],
    ["v081PilotReady", false, "BLOCKED_V083_V081_PILOT_NOT_READY"],
    ["v082RuntimeAdapterReady", false, "BLOCKED_V083_V082_RUNTIME_ADAPTER_NOT_READY"],
    ["tokenProviderReady", false, "BLOCKED_V083_TOKEN_PROVIDER_NOT_READY"],
    ["uploadScopeReady", false, "BLOCKED_V083_UPLOAD_SCOPE_NOT_READY"],
    ["videoAssetReady", false, "BLOCKED_V083_VIDEO_ASSET_NOT_READY"],
    ["uploadPackageReady", false, "BLOCKED_V083_UPLOAD_PACKAGE_NOT_READY"],
    ["duplicateGuardReady", false, "BLOCKED_V083_DUPLICATE_GUARD_NOT_READY"],
    ["disclosureGuardReady", false, "BLOCKED_V083_DISCLOSURE_GUARD_NOT_READY"],
    ["affiliateEvidenceReady", false, "BLOCKED_V083_AFFILIATE_EVIDENCE_NOT_READY"],
    ["targetChannelEvidenceReady", false, "BLOCKED_V083_TARGET_CHANNEL_EVIDENCE_NOT_READY"]
  ] as const)("blocks when %s is not ready", (field, value, blocker) => {
    const readiness = buildV083PrivateUploadExecutionReadiness({
      ...readyInput(),
      [field]: value
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.executableCandidate).toBe(false);
    expect(readiness.blockers).toContain(blocker);
    expect(readiness.executionAllowedInThisPr).toBe(false);
  });

  test.each([
    ["public" as const, "BLOCKED_V083_PUBLIC_UPLOAD_NOT_ALLOWED"],
    ["unlisted" as const, "BLOCKED_V083_UNLISTED_UPLOAD_NOT_ALLOWED"]
  ])("blocks %s visibility", (requestedVisibility, blocker) => {
    const readiness = buildV083PrivateUploadExecutionReadiness({
      ...readyInput(),
      requestedVisibility
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.allowedVisibility).toBe("private");
    expect(readiness.blockers).toContain(blocker);
  });

  test("blocks maxItems greater than one", () => {
    const readiness = buildV083PrivateUploadExecutionReadiness({
      ...readyInput(),
      maxItems: 2
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.maxItems).toBe(1);
    expect(readiness.requestedMaxItems).toBe(2);
    expect(readiness.blockers).toContain("BLOCKED_V083_MAX_ITEMS_MUST_BE_ONE");
  });

  test("blocks comment automation and scheduler execution requests", () => {
    const readiness = buildV083PrivateUploadExecutionReadiness({
      ...readyInput(),
      commentAutomationRequested: true,
      schedulerExecutionRequested: true
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.commentAutomationAllowed).toBe(false);
    expect(readiness.schedulerExecutionAllowed).toBe(false);
    expect(readiness.blockers).toEqual(expect.arrayContaining([
      "BLOCKED_V083_COMMENT_AUTOMATION_NOT_ALLOWED",
      "BLOCKED_V083_SCHEDULER_EXECUTION_NOT_ALLOWED"
    ]));
  });

  test("all readiness pass creates an executable candidate but requires an injected executor", async () => {
    const factory = createV083RealPrivateUploadExecutionAdapterFactory(readyInput());
    const report = buildV083PrivateUploadExecutionReadinessReport(factory.readiness);
    const adapterResult = await factory.adapter.uploadPrivatePilot({
      uploadPackageId: "pkg-v083",
      queueItemId: "queue-v083",
      channelKey: "father_jobs",
      visibility: "private",
      maxItems: 1,
      videoAssetHashPrefix: "asset",
      generatedAt: "2026-07-05T00:00:00.000Z"
    });

    expect(factory.readiness.ready).toBe(true);
    expect(factory.readiness.executableCandidate).toBe(true);
    expect(factory.readiness.executionAllowedInThisPr).toBe(false);
    expect(factory.adapter.mode).toBe("real_candidate");
    expect(report.FINAL_STATUS).toBe("READY_V083_REAL_PRIVATE_UPLOAD_EXECUTION_ADAPTER_NO_UPLOAD");
    expect(report.FINAL_STATUS).not.toContain("SUCCESS");
    expect(adapterResult.status).toBe("BLOCKED");
    expect(adapterResult.blocker).toBe("BLOCKED_V083_REAL_UPLOAD_EXECUTOR_NOT_INJECTED");
    expect(adapterResult.videosInsertCalled).toBe(false);
    expect(adapterResult.videosInsertTotalCount).toBe(0);
    expect(adapterResult.commentThreadsInsertCalled).toBe(false);
    expect(adapterResult.fakeSuccess).toBe(false);
  });

  test("injected V083 candidate keeps V081 execution blocked without V076 evidence", async () => {
    const factory = createV083RealPrivateUploadExecutionAdapterFactory(readyInput());
    const result = await executeV081PrivateUploadPilot(makeV081Request(), {
      adapter: factory.adapter
    });

    expect(result.adapterMode).toBe("real_candidate");
    expect(result.status).toBe("blocked");
    expect(result.status).not.toBe("private_upload_completed");
    expect(result.blockers).toContain("BLOCKED_V083_REAL_UPLOAD_EXECUTOR_NOT_INJECTED");
    expect(result.videosInsertCalled).toBe(false);
    expect(result.videosInsertTotalCount).toBe(0);
    expect(result.commentThreadsInsertCalled).toBe(false);
    expect(result.uploadResultEvidence.present).toBe(false);
    expect(result.uploadResultStoreItem).toBeNull();
    expect(result.uploadResultStoreReport).toBeNull();
    expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });

  test("V083 adapter delegates to an injected no-upload executor without calling videos.insert", async () => {
    let executorCalled = false;
    const factory = createV083RealPrivateUploadExecutionAdapterFactory({
      ...readyInput(),
      uploadExecutor: async () => {
        executorCalled = true;
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
    });
    const result = await factory.adapter.uploadPrivatePilot({
      uploadPackageId: "pkg-v083",
      queueItemId: "queue-v083",
      channelKey: "father_jobs",
      visibility: "private",
      maxItems: 1,
      videoAssetHashPrefix: "asset",
      generatedAt: "2026-07-05T00:00:00.000Z"
    });

    expect(executorCalled).toBe(true);
    expect(result.blocker).toBe("BLOCKED_V083_REAL_UPLOAD_EXECUTOR_NOT_INJECTED");
    expect(result.videosInsertCalled).toBe(false);
    expect(result.videosInsertTotalCount).toBe(0);
    expect(result.commentThreadsInsertCalled).toBe(false);
  });

  test("does not export a constructor-capable V083 adapter class outside the factory", async () => {
    const coreSource = await readFile(
      "src/uploads/youtube/v083RealPrivateUploadExecutionAdapterCore.ts",
      "utf8"
    );
    const serverOnlyEntrypoint = await readFile(
      "src/uploads/youtube/v083RealPrivateUploadExecutionAdapter.ts",
      "utf8"
    );

    expect(coreSource).not.toContain("export class V083RealPrivateUploadExecutionAdapter");
    expect(serverOnlyEntrypoint).not.toContain("V083RealPrivateUploadExecutionAdapter,");
    expect(serverOnlyEntrypoint).toContain("createV083RealPrivateUploadExecutionAdapterFactory");
  });

  test("factory does not call injected executor when readiness is false", async () => {
    let executorCalled = false;
    const factory = createV083RealPrivateUploadExecutionAdapterFactory({
      ...readyInput({ tokenProviderReady: false }),
      uploadExecutor: async () => {
        executorCalled = true;
        return {
          status: "MOCK_ONLY",
          blocker: null,
          youtubeVideoId: FULL_VIDEO_ID,
          channelId: FULL_CHANNEL_ID,
          uploadedAt: "2026-07-05T00:00:00.000Z",
          videosInsertCalled: true,
          videosInsertTotalCount: 1,
          commentThreadsInsertCalled: false,
          fakeSuccess: false,
          rawUrlsPrinted: false,
          rawVideoIdsPrinted: false,
          rawChannelIdsPrinted: false,
          secretsPrinted: false
        };
      }
    });

    const result = await factory.adapter.uploadPrivatePilot({
      uploadPackageId: "pkg-v083",
      queueItemId: "queue-v083",
      channelKey: "father_jobs",
      visibility: "private",
      maxItems: 1,
      videoAssetHashPrefix: "asset",
      generatedAt: "2026-07-05T00:00:00.000Z"
    });

    expect(factory.readiness.ready).toBe(false);
    expect(factory.adapter.mode).toBe("blocked");
    expect(executorCalled).toBe(false);
    expect(result.videosInsertCalled).toBe(false);
    expect(result.commentThreadsInsertCalled).toBe(false);
  });

  test.each([
    ["youtubeVideoId missing", { youtubeVideoId: null, channelId: FULL_CHANNEL_ID, uploadedAt: "2026-07-05T00:00:00.000Z" }],
    ["channelId missing", { youtubeVideoId: FULL_VIDEO_ID, channelId: null, uploadedAt: "2026-07-05T00:00:00.000Z" }],
    ["uploadedAt missing", { youtubeVideoId: FULL_VIDEO_ID, channelId: FULL_CHANNEL_ID, uploadedAt: null }]
  ])("V081/V083 flow never completes when adapter evidence is incomplete: %s", async (_label, evidence) => {
    const result = await executeV081PrivateUploadPilot(makeV081Request(), {
      adapter: new IncompleteEvidenceV083Adapter(evidence)
    });

    expect(result.status).toBe("blocked");
    expect(result.status).not.toBe("private_upload_completed");
    expect(result.videosInsertCalled).toBe(true);
    expect(result.videosInsertTotalCount).toBe(1);
    expect(result.blockers).toContain("BLOCKED_V081_ADAPTER_UPLOAD_EVIDENCE_INCOMPLETE");
    expect(result.uploadResultEvidence.present).toBe(false);
    expect(result.uploadResultStoreItem).toBeNull();
    expect(result.uploadResultStoreReport).toBeNull();
    expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });

  test("complete adapter evidence only creates sanitized V076 evidence through V081", async () => {
    const result = await executeV081PrivateUploadPilot(makeV081Request(), {
      adapter: new MockV081PrivateUploadPilotAdapter({
        youtubeVideoId: FULL_VIDEO_ID,
        channelId: FULL_CHANNEL_ID,
        uploadedAt: "2026-07-05T00:00:00.000Z"
      })
    });
    const serialized = JSON.stringify(result);

    expect(result.status).toBe("private_upload_completed");
    expect(result.uploadResultEvidence.present).toBe(true);
    expect(result.uploadResultEvidence.youtubeVideoIdHashPrefix).toHaveLength(10);
    expect(result.uploadResultEvidence.channelIdHashPrefix).toHaveLength(10);
    expect(result.uploadResultStoreItem?.rawVideoIdStored).toBe(false);
    expect(result.uploadResultStoreItem?.rawChannelIdStored).toBe(false);
    expect(result.uploadResultStoreReport?.raw_video_ids_printed).toBe(false);
    expect(result.uploadResultStoreReport?.raw_channel_ids_printed).toBe(false);
    expect(serialized).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });

  test("sanitized V083 report never prints raw URLs, full IDs, tokens, secrets, or fake success", () => {
    const report = buildV083PrivateUploadExecutionReadinessReport(
      buildV083PrivateUploadExecutionReadiness(readyInput())
    );
    const serialized = JSON.stringify(report);

    expect(report.redactionProof).toEqual({
      rawUrlsPrinted: false,
      rawVideoIdsPrinted: false,
      rawChannelIdsPrinted: false,
      secretsPrinted: false,
      fakeSuccess: false
    });
    expect(report.mutationSafety).toEqual({
      videosInsertCalled: false,
      commentThreadsInsertCalled: false,
      visibilityChanged: false,
      schedulerExecuted: false
    });
    expect(serialized).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });

  test("TASK.md records T013 and keeps public upload blocked", async () => {
    const task = await readFile("TASK.md", "utf8");

    expect(task).toContain("### T013 - V083 Real Private Upload Execution Adapter");
    expect(task).toMatch(/### T013 - V083 Real Private Upload Execution Adapter[\s\S]*Status: `(PR_OPEN|DONE)`/);
    expect(task).toMatch(
      /Current blocker: `(V086_PRIVATE_UPLOAD_INPUT_BINDER_RUN_ON_MAIN_NO_UPLOAD|PR_OPEN_T013_V083_REAL_PRIVATE_UPLOAD_EXECUTION_ADAPTER_REVIEW|PR_OPEN_T014_V084_PRIVATE_UPLOAD_EXECUTION_INVOCATION_PATH_REVIEW|V085_PRIVATE_UPLOAD_PILOT_1_ITEM_EXECUTION_WAITING_FOR_FRESH_APPROVAL|PR_OPEN_T015_V085_PRIVATE_PILOT_INPUT_BINDING_REVIEW|PR_OPEN_T016_V087_AUTHORITATIVE_PRODUCT_SOURCE_BINDING_REVIEW|V088_RUN_V087_AND_V085_BINDERS_ON_MAIN_NO_UPLOAD|V089_PRIVATE_UPLOAD_PILOT_1_ITEM_EXECUTION_WAITING_FOR_FRESH_APPROVAL|PR_OPEN_T018_V090_UNLOCK_V084_PRIVATE_EXECUTE_GATE_NO_UPLOAD_REVIEW|PR_OPEN_T019_V091_UNLOCK_V083_REAL_PRIVATE_ADAPTER_EXECUTION_NO_UPLOAD_REVIEW|PR_OPEN_T020_V092_INJECT_SERVER_ONLY_YOUTUBE_PRIVATE_UPLOAD_EXECUTOR_NO_UPLOAD_REVIEW|PR_OPEN_T021_V094_BIND_UPLOAD_PACKAGE_TO_V081_SERVER_EXECUTOR_NO_UPLOAD_REVIEW|PR_OPEN_T022_V095_PRIVATE_PILOT_EXECUTION_CONTEXT_BRIDGE_NO_UPLOAD_REVIEW|PR_OPEN_T023_V096_FIX_V084_EXECUTE_CONTEXT_LOADING_NO_UPLOAD_REVIEW|PR_OPEN_T024_V097_UPLOAD_PACKAGE_RESOLUTION_BRIDGE_NO_UPLOAD_REVIEW|PR_OPEN_T025_V098_SERVER_ACCESSIBLE_VIDEO_ASSET_BRIDGE_NO_UPLOAD_REVIEW|PR_OPEN_T026_V099_PREPARED_ASSET_EVIDENCE_BINDING_NO_UPLOAD_REVIEW|PR_OPEN_V100_CHANNEL_AUTOMATION_MVP_NO_UPLOAD_REVIEW|PR_OPEN_V105_QUEUE_TO_GENERATE_ONLY_NEXT_BATCH_NO_UPLOAD_REVIEW|PR_OPEN_V107_OWNER_REVIEW_FIRST_VIDEO_SETTINGS_TABLE_NO_UPLOAD_REVIEW|PR_OPEN_V108_FIRST_VIDEO_UPLOAD_PACKAGE_MATERIALIZER_NO_UPLOAD_REVIEW)`/
    );
    expect(task).toMatch(
      /PRIVATE_UPLOAD_PILOT_EXECUTION=BLOCKED_FRESH_APPROVAL_REQUIRED(_AFTER_MERGE)?/
    );
    expect(task).toContain("SAFE_TO_UPLOAD=false");
    expect(task).toContain("SAFE_TO_PUBLIC_UPLOAD=false");
    expect(task).toContain("PUBLIC_UPLOAD=BLOCKED");
    expect(task).toContain("COMMENT_AUTOMATION=BLOCKED");
    expect(task).toContain("SCHEDULER_EXECUTION=BLOCKED");
  });

  test("docs state that V083 is no-upload wiring and needs fresh approval after merge", async () => {
    const docs = await readFile("docs/commerce/v083_real_private_upload_execution_adapter.md", "utf8");

    expect(docs).toContain("V083/V091 is not an upload execution PR.");
    expect(docs).toContain("No videos.insert is called by V083 tests or readiness checks.");
    expect(docs).toContain("A new fresh owner approval is required after merge.");
    expect(docs).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });
});

function readyInput(
  overrides: Partial<V083RealPrivateUploadExecutionAdapterFactoryInput> = {}
): V083RealPrivateUploadExecutionAdapterFactoryInput {
  return {
    buildApprovalPhrase: APPROVE_BUILD_V083_REAL_PRIVATE_UPLOAD_EXECUTION_ADAPTER_NO_UPLOAD,
    serverOnlyContext: true,
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
    requestedVisibility: "private",
    maxItems: 1,
    commentAutomationRequested: false,
    schedulerExecutionRequested: false,
    ...overrides
  };
}

function makeV081Request(): V081PrivateUploadPilotRequest {
  return {
    queueItemId: "queue-v083-father",
    uploadPackageId: "pkg-v083-father",
    channelKey: "father_jobs",
    visibility: "private",
    approvalPhrase: APPROVE_YOUTUBE_PRIVATE_UPLOAD_PILOT_1_ITEM_NO_COMMENT,
    commentAutomationAllowed: false,
    schedulerExecutionAllowed: false,
    maxItems: 1,
    targetChannelId: FULL_CHANNEL_ID,
    rawCoupangUrl: RAW_COUPANG_URL,
    selectedAffiliateUrl: RAW_AFFILIATE_URL,
    videoAssetHashPrefix: "videoasset",
    generatedAt: "2026-07-05T00:00:00.000Z",
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

class IncompleteEvidenceV083Adapter implements V081PrivateUploadPilotAdapter {
  readonly mode = "real_candidate" as const;

  constructor(
    private readonly evidence: Pick<
      V081PrivateUploadPilotAdapterResult,
      "youtubeVideoId" | "channelId" | "uploadedAt"
    >
  ) {}

  async uploadPrivatePilot(): Promise<V081PrivateUploadPilotAdapterResult> {
    return {
      status: "BLOCKED",
      blocker: null,
      youtubeVideoId: this.evidence.youtubeVideoId,
      channelId: this.evidence.channelId,
      uploadedAt: this.evidence.uploadedAt,
      videosInsertCalled: true,
      videosInsertTotalCount: 1,
      commentThreadsInsertCalled: false,
      fakeSuccess: false,
      rawUrlsPrinted: false,
      rawVideoIdsPrinted: false,
      rawChannelIdsPrinted: false,
      secretsPrinted: false
    };
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
