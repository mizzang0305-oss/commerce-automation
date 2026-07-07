import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import {
  APPROVE_YOUTUBE_PRIVATE_UPLOAD_PILOT_1_ITEM_NO_COMMENT,
  executeV081PrivateUploadPilot,
  type V081PrivateUploadPilotRequest
} from "../src/uploads/youtube/v081PrivateUploadPilot";
import {
  buildV082PrivateUploadRuntimeAdapterReadiness,
  buildV082PrivateUploadRuntimeReadinessReport,
  type V082PrivateUploadRuntimeAdapterReadinessInput,
  type V082PrivateUploadTokenProviderReadiness
} from "../src/uploads/youtube/v082PrivateUploadRuntimeReadiness";
import {
  createV082PrivateUploadRuntimeAdapterFactory,
  createV082PrivateUploadRuntimeAdapterFactoryFromEnv
} from "../src/uploads/youtube/v082PrivateUploadRuntimeAdapter";

const FULL_VIDEO_ID = "v082FullVideoIdMustNotLeak";
const FULL_CHANNEL_ID = `UC${"2".repeat(22)}`;
const RAW_AFFILIATE_URL = ["https://link.coupang.com", "a", "v082-hidden"].join("/");
const RAW_COUPANG_URL = ["https://www.coupang.com", "vp", "products", "982000001"].join("/");
const FORBIDDEN_REPORT_PATTERN = new RegExp([
  FULL_VIDEO_ID,
  FULL_CHANNEL_ID,
  RAW_AFFILIATE_URL,
  RAW_COUPANG_URL,
  "COUPANG_SECRET_KEY",
  "YOUTUBE_CLIENT_SECRET",
  "refresh_token",
  "access_token",
  "Authorization",
  "Bearer",
  "HmacSHA256",
  "signature="
].map(escapeRegExp).join("|"), "i");

describe("v082 real runtime private pilot adapter injection", () => {
  test("default factory remains blocked and never enables upload mutation", async () => {
    const factory = createV082PrivateUploadRuntimeAdapterFactory();
    const adapterResult = await factory.adapter.uploadPrivatePilot({
      uploadPackageId: "pkg-v082",
      queueItemId: "queue-v082",
      channelKey: "father_jobs",
      visibility: "private",
      maxItems: 1,
      videoAssetHashPrefix: "asset",
      generatedAt: "2026-07-05T00:00:00.000Z"
    });

    expect(factory.readiness.adapterMode).toBe("blocked");
    expect(factory.adapter.mode).toBe("blocked");
    expect(factory.readiness.ready).toBe(false);
    expect(factory.readiness.blockers).toEqual(expect.arrayContaining([
      "BLOCKED_V082_YOUTUBE_OAUTH_NOT_CONFIGURED",
      "BLOCKED_V082_TOKEN_PROVIDER_NOT_CONFIGURED",
      "BLOCKED_V082_TOKEN_READINESS_PROVIDER_STATUS_REQUIRED",
      "BLOCKED_V082_TOKEN_NOT_READY",
      "BLOCKED_V082_VIDEO_ASSET_RESOLVER_NOT_CONFIGURED",
      "BLOCKED_V082_UPLOAD_PACKAGE_RESOLVER_NOT_CONFIGURED",
      "BLOCKED_V082_DUPLICATE_GUARD_NOT_CONFIGURED",
      "BLOCKED_V082_DISCLOSURE_GUARD_NOT_CONFIGURED"
    ]));
    expect(factory.readiness.canCallVideosInsert).toBe(false);
    expect(adapterResult.videosInsertCalled).toBe(false);
    expect(adapterResult.commentThreadsInsertCalled).toBe(false);
    expect(adapterResult.fakeSuccess).toBe(false);
  });

  test.each([
    ["serverOnlyContext", false, "BLOCKED_V082_SERVER_ONLY_CONTEXT_REQUIRED"],
    ["oauthConfigured", false, "BLOCKED_V082_YOUTUBE_OAUTH_NOT_CONFIGURED"],
    ["tokenProviderConfigured", false, "BLOCKED_V082_TOKEN_PROVIDER_NOT_CONFIGURED"],
    ["videoAssetResolverConfigured", false, "BLOCKED_V082_VIDEO_ASSET_RESOLVER_NOT_CONFIGURED"],
    ["uploadPackageResolverConfigured", false, "BLOCKED_V082_UPLOAD_PACKAGE_RESOLVER_NOT_CONFIGURED"],
    ["duplicateGuardConfigured", false, "BLOCKED_V082_DUPLICATE_GUARD_NOT_CONFIGURED"],
    ["disclosureGuardConfigured", false, "BLOCKED_V082_DISCLOSURE_GUARD_NOT_CONFIGURED"]
  ] as const)("blocks when %s is not ready", (field, value, blocker) => {
    const readiness = buildV082PrivateUploadRuntimeAdapterReadiness({
      ...readyInput(),
      [field]: value
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.adapterMode).toBe("blocked");
    expect(readiness.blockers).toContain(blocker);
    expect(readiness.canCallVideosInsert).toBe(false);
  });

  test("blocks when token file env exists but provider readiness status is missing", () => {
    const factory = createV082PrivateUploadRuntimeAdapterFactoryFromEnv({
      env: {
        YOUTUBE_CLIENT_ID: "client-id-that-must-not-leak",
        YOUTUBE_CLIENT_SECRET: "client-secret-that-must-not-leak",
        YOUTUBE_LOCAL_TOKEN_FILE_PATH: "C:/outside/token.json",
        YOUTUBE_TOKEN_PROVIDER_MODE: "local_file"
      } as NodeJS.ProcessEnv,
      tokenProviderReadiness: null,
      videoAssetResolverConfigured: true,
      uploadPackageResolverConfigured: true,
      duplicateGuardConfigured: true,
      disclosureGuardConfigured: true
    });
    const serialized = JSON.stringify(factory.readiness);

    expect(factory.readiness.ready).toBe(false);
    expect(factory.readiness.adapterMode).toBe("blocked");
    expect(factory.readiness.evidence.tokenProviderConfigured).toBe(true);
    expect(factory.readiness.evidence.tokenReadinessProviderStatusPresent).toBe(false);
    expect(factory.readiness.evidence.tokenReady).toBe(false);
    expect(factory.readiness.blockers).toEqual(expect.arrayContaining([
      "BLOCKED_V082_TOKEN_READINESS_PROVIDER_STATUS_REQUIRED",
      "BLOCKED_V082_TOKEN_NOT_READY"
    ]));
    expect(factory.adapter.mode).toBe("blocked");
    expect(serialized).not.toMatch(/client-id-that-must-not-leak|client-secret-that-must-not-leak|outside\/token|outside\\token/i);
  });

  test("does not derive tokenReady from token file env path alone", () => {
    const factory = createV082PrivateUploadRuntimeAdapterFactoryFromEnv({
      env: {
        YOUTUBE_CLIENT_ID: "client-id-that-must-not-leak",
        YOUTUBE_CLIENT_SECRET: "client-secret-that-must-not-leak",
        YOUTUBE_LOCAL_TOKEN_FILE_PATH: "C:/definitely-missing/token.json",
        YOUTUBE_TOKEN_PROVIDER_MODE: "local_file"
      } as NodeJS.ProcessEnv,
      videoAssetResolverConfigured: true,
      uploadPackageResolverConfigured: true,
      duplicateGuardConfigured: true,
      disclosureGuardConfigured: true
    });

    expect(factory.readiness.ready).toBe(false);
    expect(factory.readiness.adapterMode).toBe("blocked");
    expect(factory.readiness.evidence.tokenProviderConfigured).toBe(true);
    expect(factory.readiness.evidence.tokenReadinessProviderStatusPresent).toBe(true);
    expect(factory.readiness.evidence.tokenReady).toBe(false);
    expect(factory.readiness.evidence.tokenFileSafeAndReadable).toBe(false);
    expect(factory.readiness.blockers).toEqual(expect.arrayContaining([
      "BLOCKED_V082_TOKEN_PROVIDER_NOT_READY",
      "BLOCKED_V082_TOKEN_NOT_READY",
      "BLOCKED_V082_TOKEN_UPLOAD_SCOPE_NOT_READY",
      "BLOCKED_V082_TOKEN_FILE_UNSAFE_OR_UNREADABLE"
    ]));
    expect(factory.adapter.mode).toBe("blocked");
  });

  test.each([
    [
      "provider not ready",
      { providerReady: false },
      "BLOCKED_V082_TOKEN_PROVIDER_NOT_READY"
    ],
    [
      "token file missing",
      { providerReady: false, tokenReady: false, uploadScopeReady: false, tokenFileSafeAndReadable: false },
      "BLOCKED_V082_TOKEN_FILE_UNSAFE_OR_UNREADABLE"
    ],
    [
      "token file unreadable",
      { providerReady: false, tokenReady: false, uploadScopeReady: false, tokenFileSafeAndReadable: false },
      "BLOCKED_V082_TOKEN_FILE_UNSAFE_OR_UNREADABLE"
    ],
    [
      "token file inside repo",
      { providerReady: false, tokenReady: false, uploadScopeReady: false, tokenFileSafeAndReadable: false },
      "BLOCKED_V082_TOKEN_FILE_UNSAFE_OR_UNREADABLE"
    ],
    [
      "upload scope missing",
      { providerReady: false, tokenReady: true, uploadScopeReady: false, tokenFileSafeAndReadable: true },
      "BLOCKED_V082_TOKEN_UPLOAD_SCOPE_NOT_READY"
    ]
  ] as const)("blocks when token provider readiness reports %s", (_label, tokenReadinessOverride, blocker) => {
    const readiness = buildV082PrivateUploadRuntimeAdapterReadiness({
      ...readyInput({
        tokenProviderReadiness: tokenProviderReadiness(tokenReadinessOverride)
      })
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.adapterMode).toBe("blocked");
    expect(readiness.canCallVideosInsert).toBe(false);
    expect(readiness.blockers).toContain(blocker);
  });

  test.each([
    ["public" as const, "BLOCKED_V082_PUBLIC_UPLOAD_NOT_ALLOWED"],
    ["unlisted" as const, "BLOCKED_V082_UNLISTED_UPLOAD_NOT_ALLOWED"]
  ])("blocks %s visibility before adapter candidate creation", (requestedVisibility, blocker) => {
    const readiness = buildV082PrivateUploadRuntimeAdapterReadiness({
      ...readyInput(),
      requestedVisibility
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.allowedVisibility).toBe("private");
    expect(readiness.blockers).toContain(blocker);
    expect(readiness.canCallVideosInsert).toBe(false);
  });

  test("blocks comment automation and scheduler execution requests", () => {
    const readiness = buildV082PrivateUploadRuntimeAdapterReadiness({
      ...readyInput(),
      commentAutomationRequested: true,
      schedulerExecutionRequested: true
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.canCallCommentThreadsInsert).toBe(false);
    expect(readiness.blockers).toEqual(expect.arrayContaining([
      "BLOCKED_V082_COMMENT_AUTOMATION_NOT_ALLOWED",
      "BLOCKED_V082_SCHEDULER_EXECUTION_NOT_ALLOWED"
    ]));
  });

  test("all infrastructure readiness creates only a real candidate that still waits for fresh execution approval", async () => {
    const factory = createV082PrivateUploadRuntimeAdapterFactory({
      readinessInput: readyInput()
    });
    const report = buildV082PrivateUploadRuntimeReadinessReport(factory.readiness);
    const adapterResult = await factory.adapter.uploadPrivatePilot({
      uploadPackageId: "pkg-v082",
      queueItemId: "queue-v082",
      channelKey: "father_jobs",
      visibility: "private",
      maxItems: 1,
      videoAssetHashPrefix: "asset",
      generatedAt: "2026-07-05T00:00:00.000Z"
    });

    expect(factory.readiness.ready).toBe(true);
    expect(factory.readiness.adapterMode).toBe("real_candidate");
    expect(factory.readiness.canCallVideosInsert).toBe(true);
    expect(factory.readiness.executionAllowedInThisPr).toBe(false);
    expect(factory.readiness.requiresFreshExecutionApproval).toBe(true);
    expect(factory.readiness.freshApprovalReused).toBe(false);
    expect(report.FINAL_STATUS).toBe("READY_FOR_PRIVATE_PILOT_EXECUTION_APPROVAL");
    expect(report.FINAL_STATUS).not.toContain("SUCCESS");
    expect(report.videos_insert_called).toBe(false);
    expect(report.commentThreads_insert_called).toBe(false);
    expect(adapterResult.status).toBe("BLOCKED");
    expect(adapterResult.blocker).toBe("BLOCKED_V082_REAL_UPLOAD_EXECUTION_NOT_ALLOWED_IN_THIS_PR");
    expect(adapterResult.videosInsertCalled).toBe(false);
    expect(adapterResult.videosInsertTotalCount).toBe(0);
    expect(adapterResult.commentThreadsInsertCalled).toBe(false);
    expect(adapterResult.fakeSuccess).toBe(false);
  });

  test("injected V082 real candidate keeps V081 execution blocked without V076 evidence", async () => {
    const factory = createV082PrivateUploadRuntimeAdapterFactory({
      readinessInput: readyInput()
    });
    const result = await executeV081PrivateUploadPilot(makeV081Request(), {
      adapter: factory.adapter
    });

    expect(result.adapterMode).toBe("real_candidate");
    expect(result.status).toBe("blocked");
    expect(result.status).not.toBe("private_upload_completed");
    expect(result.blockers).toContain("BLOCKED_V082_REAL_UPLOAD_EXECUTION_NOT_ALLOWED_IN_THIS_PR");
    expect(result.videosInsertCalled).toBe(false);
    expect(result.videosInsertTotalCount).toBe(0);
    expect(result.commentThreadsInsertCalled).toBe(false);
    expect(result.uploadResultEvidence.present).toBe(false);
    expect(result.uploadResultStoreItem).toBeNull();
    expect(result.uploadResultStoreReport).toBeNull();
    expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });

  test("env factory requires provider-status token readiness and never exposes raw env values", () => {
    const factory = createV082PrivateUploadRuntimeAdapterFactoryFromEnv({
      env: {
        YOUTUBE_CLIENT_ID: "client-id-that-must-not-leak",
        YOUTUBE_CLIENT_SECRET: "client-secret-that-must-not-leak",
        YOUTUBE_LOCAL_TOKEN_FILE_PATH: "C:/outside/token.json",
        YOUTUBE_TOKEN_PROVIDER_MODE: "local_file"
      } as NodeJS.ProcessEnv,
      tokenProviderReadiness: tokenProviderReadiness(),
      videoAssetResolverConfigured: true,
      uploadPackageResolverConfigured: true,
      duplicateGuardConfigured: true,
      disclosureGuardConfigured: true
    });
    const serialized = JSON.stringify(factory.readiness);

    expect(factory.readiness.evidence).toMatchObject({
      oauthConfigured: true,
      tokenProviderConfigured: true,
      tokenReadinessProviderStatusPresent: true,
      tokenProviderReady: true,
      tokenReady: true,
      uploadScopeReady: true,
      tokenFileSafeAndReadable: true,
      videoAssetResolverConfigured: true,
      uploadPackageResolverConfigured: true,
      duplicateGuardConfigured: true,
      disclosureGuardConfigured: true
    });
    expect(serialized).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    expect(serialized).not.toMatch(/client-id-that-must-not-leak|client-secret-that-must-not-leak|outside\/token/i);
  });

  test("sanitized report never prints raw URLs, full IDs, secrets, tokens, or fake success", () => {
    const report = buildV082PrivateUploadRuntimeReadinessReport(
      buildV082PrivateUploadRuntimeAdapterReadiness(readyInput())
    );
    const serialized = JSON.stringify(report);

    expect(report.redactionProof).toEqual({
      rawUrlsPrinted: false,
      rawVideoIdsPrinted: false,
      rawChannelIdsPrinted: false,
      secretsPrinted: false,
      fakeSuccess: false
    });
    expect(report.raw_urls_printed).toBe(false);
    expect(report.raw_video_ids_printed).toBe(false);
    expect(report.raw_channel_ids_printed).toBe(false);
    expect(report.secrets_printed).toBe(false);
    expect(report.fake_success).toBe(false);
    expect(serialized).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });

  test("TASK.md records T012 DONE state and keeps all upload surfaces blocked", async () => {
    const task = await readFile("TASK.md", "utf8");

    expect(task).toContain("### T012 - V082 Real Runtime Private Pilot Adapter Injection");
    expect(task).toMatch(/### T012 - V082 Real Runtime Private Pilot Adapter Injection[\s\S]*Status: `DONE`/);
    expect(task).toMatch(
      /Current blocker: `(V086_PRIVATE_UPLOAD_INPUT_BINDER_RUN_ON_MAIN_NO_UPLOAD|V083_PRIVATE_UPLOAD_PILOT_EXECUTION_WAITING_FOR_FRESH_OWNER_APPROVAL|PR_OPEN_T013_V083_REAL_PRIVATE_UPLOAD_EXECUTION_ADAPTER_REVIEW|PR_OPEN_T014_V084_PRIVATE_UPLOAD_EXECUTION_INVOCATION_PATH_REVIEW|V085_PRIVATE_UPLOAD_PILOT_1_ITEM_EXECUTION_WAITING_FOR_FRESH_APPROVAL|PR_OPEN_T015_V085_PRIVATE_PILOT_INPUT_BINDING_REVIEW|PR_OPEN_T016_V087_AUTHORITATIVE_PRODUCT_SOURCE_BINDING_REVIEW|V088_RUN_V087_AND_V085_BINDERS_ON_MAIN_NO_UPLOAD|V089_PRIVATE_UPLOAD_PILOT_1_ITEM_EXECUTION_WAITING_FOR_FRESH_APPROVAL|PR_OPEN_T018_V090_UNLOCK_V084_PRIVATE_EXECUTE_GATE_NO_UPLOAD_REVIEW|PR_OPEN_T019_V091_UNLOCK_V083_REAL_PRIVATE_ADAPTER_EXECUTION_NO_UPLOAD_REVIEW|PR_OPEN_T020_V092_INJECT_SERVER_ONLY_YOUTUBE_PRIVATE_UPLOAD_EXECUTOR_NO_UPLOAD_REVIEW|PR_OPEN_T021_V094_BIND_UPLOAD_PACKAGE_TO_V081_SERVER_EXECUTOR_NO_UPLOAD_REVIEW|PR_OPEN_T022_V095_PRIVATE_PILOT_EXECUTION_CONTEXT_BRIDGE_NO_UPLOAD_REVIEW|PR_OPEN_T023_V096_FIX_V084_EXECUTE_CONTEXT_LOADING_NO_UPLOAD_REVIEW|PR_OPEN_T024_V097_UPLOAD_PACKAGE_RESOLUTION_BRIDGE_NO_UPLOAD_REVIEW|PR_OPEN_V100_CHANNEL_AUTOMATION_MVP_NO_UPLOAD_REVIEW)`/
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

  test("docs state that V082 is no-upload and requires a new approval after merge", async () => {
    const docs = await readFile("docs/commerce/v082_real_runtime_private_pilot_adapter_injection.md", "utf8");

    expect(docs).toContain("READY_FOR_PRIVATE_PILOT_EXECUTION_APPROVAL");
    expect(docs).toContain("No videos.insert is called by V082.");
    expect(docs).toContain("A new fresh owner approval is required after merge.");
    expect(docs).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });
});

function readyInput(
  overrides: Partial<V082PrivateUploadRuntimeAdapterReadinessInput> = {}
): V082PrivateUploadRuntimeAdapterReadinessInput {
  return {
    serverOnlyContext: true,
    oauthConfigured: true,
    tokenProviderConfigured: true,
    tokenProviderReadiness: tokenProviderReadiness(),
    videoAssetResolverConfigured: true,
    uploadPackageResolverConfigured: true,
    duplicateGuardConfigured: true,
    disclosureGuardConfigured: true,
    requestedVisibility: "private",
    commentAutomationRequested: false,
    schedulerExecutionRequested: false,
    maxItems: 1,
    realUploadExecutionRequested: false,
    ...overrides
  };
}

function tokenProviderReadiness(
  overrides: Partial<V082PrivateUploadTokenProviderReadiness> = {}
): V082PrivateUploadTokenProviderReadiness {
  return {
    providerReady: true,
    tokenReady: true,
    uploadScopeReady: true,
    tokenFileSafeAndReadable: true,
    ...overrides
  };
}

function makeV081Request(): V081PrivateUploadPilotRequest {
  return {
    queueItemId: "queue-v082-father",
    uploadPackageId: "pkg-v082-father",
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
