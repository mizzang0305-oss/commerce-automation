import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import {
  APPROVE_YOUTUBE_PRIVATE_UPLOAD_PILOT_1_ITEM_NO_COMMENT
} from "../src/uploads/youtube/v081PrivateUploadPilot";
import {
  buildV084PrivateUploadPilotInvocation,
  buildV084PrivateUploadPilotInvocationFromEnv,
  type V084PrivateUploadPilotInvocationRequest
} from "../src/uploads/youtube/v084PrivateUploadExecutionInvocation";

const FULL_VIDEO_ID = "v084FullVideoIdMustNotLeak";
const FULL_CHANNEL_ID = `UC${"4".repeat(22)}`;
const RAW_AFFILIATE_URL = ["https://link.coupang.com", "a", "v084-hidden"].join("/");
const RAW_COUPANG_URL = ["https://www.coupang.com", "vp", "products", "984000001"].join("/");
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

describe("v084 private upload execution invocation path", () => {
  test("invocation path references the V083 adapter and blocks real execution in this PR", async () => {
    const result = await buildV084PrivateUploadPilotInvocation(readyRequest({
      dryRun: false
    }));

    expect(result.status).toBe("blocked");
    expect(result.mode).toBe("private_upload_pilot_invocation");
    expect(result.v083AdapterInvoked).toBe(true);
    expect(result.v083AdapterMode).toBe("real_candidate");
    expect(result.blockers).toContain("BLOCKED_V084_REAL_EXECUTION_NOT_ALLOWED_IN_THIS_PR");
    expect(result.v081ResultStatus).toBe("blocked");
    expect(result.v081Blockers).toContain("BLOCKED_V083_REAL_UPLOAD_EXECUTION_NOT_ALLOWED_IN_THIS_PR");
    expect(result.videosInsertCalled).toBe(false);
    expect(result.commentThreadsInsertCalled).toBe(false);
  });

  test("plan mode can become ready for private execution without calling videos.insert", async () => {
    const result = await buildV084PrivateUploadPilotInvocation(readyRequest({
      dryRun: true
    }));

    expect(result.status).toBe("ready_for_private_execution");
    expect(result.dryRun).toBe(true);
    expect(result.executionAllowed).toBe(false);
    expect(result.approvalAccepted).toBe(true);
    expect(result.v083AdapterInvoked).toBe(true);
    expect(result.videosInsertCalled).toBe(false);
    expect(result.commentThreadsInsertCalled).toBe(false);
    expect(result.blockers).toEqual([]);
  });

  test("blocks when approval phrase is missing", async () => {
    const result = await buildV084PrivateUploadPilotInvocation(readyRequest({
      approvalPhrase: null
    }));

    expect(result.status).toBe("blocked");
    expect(result.approvalAccepted).toBe(false);
    expect(result.blockers).toContain("BLOCKED_V084_FRESH_APPROVAL_REQUIRED");
    expect(result.videosInsertCalled).toBe(false);
  });

  test("blocks stale approval phrase separately from missing approval", async () => {
    const result = await buildV084PrivateUploadPilotInvocation(readyRequest({
      approvalPhrase: "APPROVE_BUILD_V083_REAL_PRIVATE_UPLOAD_EXECUTION_ADAPTER_NO_UPLOAD"
    }));

    expect(result.status).toBe("blocked");
    expect(result.approvalAccepted).toBe(false);
    expect(result.blockers).toContain("BLOCKED_V084_STALE_APPROVAL_REJECTED");
    expect(result.blockers).not.toContain("BLOCKED_V084_FRESH_APPROVAL_REQUIRED");
  });

  test.each([
    ["public" as const, "BLOCKED_V084_PUBLIC_UPLOAD_NOT_ALLOWED"],
    ["unlisted" as const, "BLOCKED_V084_UNLISTED_UPLOAD_NOT_ALLOWED"]
  ])("blocks %s visibility", async (visibility, blocker) => {
    const result = await buildV084PrivateUploadPilotInvocation(readyRequest({
      visibility
    }));

    expect(result.status).toBe("blocked");
    expect(result.visibility).toBe("private");
    expect(result.requestedVisibility).toBe(visibility);
    expect(result.blockers).toEqual(expect.arrayContaining([
      "BLOCKED_V084_VISIBILITY_MUST_BE_PRIVATE",
      blocker
    ]));
  });

  test("blocks maxItems greater than one", async () => {
    const result = await buildV084PrivateUploadPilotInvocation(readyRequest({
      maxItems: 2
    }));

    expect(result.status).toBe("blocked");
    expect(result.maxItems).toBe(1);
    expect(result.requestedMaxItems).toBe(2);
    expect(result.blockers).toContain("BLOCKED_V084_MAX_ITEMS_MUST_BE_ONE");
  });

  test("blocks comment automation and scheduler execution requests", async () => {
    const result = await buildV084PrivateUploadPilotInvocation(readyRequest({
      commentAutomationAllowed: true,
      schedulerExecutionAllowed: true
    }));

    expect(result.status).toBe("blocked");
    expect(result.commentAutomationAllowed).toBe(false);
    expect(result.schedulerExecutionAllowed).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      "BLOCKED_V084_COMMENT_AUTOMATION_NOT_ALLOWED",
      "BLOCKED_V084_SCHEDULER_EXECUTION_NOT_ALLOWED"
    ]));
  });

  test("blocks missing queue item and upload package identifiers", async () => {
    const result = await buildV084PrivateUploadPilotInvocation(readyRequest({
      queueItemId: "",
      uploadPackageId: ""
    }));

    expect(result.status).toBe("blocked");
    expect(result.blockers).toEqual(expect.arrayContaining([
      "BLOCKED_V084_QUEUE_ITEM_REQUIRED",
      "BLOCKED_V084_UPLOAD_PACKAGE_REQUIRED"
    ]));
  });

  test("blocks when V083 adapter is unavailable or readiness is not ready", async () => {
    const result = await buildV084PrivateUploadPilotInvocation(readyRequest({
      v083AdapterAvailable: false,
      readiness: {
        ...readyReadiness(),
        videoAssetReady: false
      }
    }));

    expect(result.status).toBe("blocked");
    expect(result.v083AdapterInvoked).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      "BLOCKED_V084_V083_ADAPTER_NOT_AVAILABLE",
      "BLOCKED_V084_READINESS_NOT_READY"
    ]));
  });

  test("blocks unsafe report requests before invocation", async () => {
    const result = await buildV084PrivateUploadPilotInvocation(readyRequest({
      unsafeReportRequested: true
    }));

    expect(result.status).toBe("blocked");
    expect(result.blockers).toContain("BLOCKED_V084_UNSAFE_REPORT_REQUESTED");
    expect(result.v083AdapterInvoked).toBe(false);
  });

  test("from-env builder fails closed without env approval or runtime evidence", async () => {
    const result = await buildV084PrivateUploadPilotInvocationFromEnv({
      env: {},
      dryRun: true
    });

    expect(result.status).toBe("blocked");
    expect(result.blockers).toEqual(expect.arrayContaining([
      "BLOCKED_V084_FRESH_APPROVAL_REQUIRED",
      "BLOCKED_V084_UPLOAD_PACKAGE_REQUIRED",
      "BLOCKED_V084_QUEUE_ITEM_REQUIRED",
      "BLOCKED_V084_READINESS_NOT_READY"
    ]));
    expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });

  test("sanitized report never prints raw URLs, full IDs, tokens, secrets, or fake success", async () => {
    const result = await buildV084PrivateUploadPilotInvocation(readyRequest());
    const serialized = JSON.stringify(result);

    expect(result.redactionProof).toEqual({
      rawUrlsPrinted: false,
      rawVideoIdsPrinted: false,
      rawChannelIdsPrinted: false,
      secretsPrinted: false,
      fakeSuccess: false
    });
    expect(result.uploadResultEvidence.present).toBe(false);
    expect(result.uploadResultStoreItem).toBeNull();
    expect(result.uploadResultStoreReport).toBeNull();
    expect(serialized).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });

  test("package plan command returns sanitized no-upload JSON", () => {
    const output = execFileSync("cmd.exe", [
      "/d",
      "/s",
      "/c",
      "npm run upload:v084:private-pilot:plan --silent"
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        V084_PRIVATE_UPLOAD_APPROVAL_PHRASE: APPROVE_YOUTUBE_PRIVATE_UPLOAD_PILOT_1_ITEM_NO_COMMENT,
        V084_QUEUE_ITEM_ID: "queue-v084-script",
        V084_UPLOAD_PACKAGE_ID: "pkg-v084-script",
        V084_RUNTIME_READY: "true"
      }
    });
    const parsed = JSON.parse(output);

    expect(parsed.mode).toBe("private_upload_pilot_invocation");
    expect(parsed.status).toBe("ready_for_private_execution");
    expect(parsed.dryRun).toBe(true);
    expect(parsed.videosInsertCalled).toBe(false);
    expect(parsed.commentThreadsInsertCalled).toBe(false);
    expect(output).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });

  test("package.json exposes plan and execute scripts", async () => {
    const pkg = JSON.parse(await readFile("package.json", "utf8"));

    expect(pkg.scripts["upload:v084:private-pilot:plan"]).toBe(
      "tsx scripts/uploads/run-v084-private-upload-pilot.ts --plan"
    );
    expect(pkg.scripts["upload:v084:private-pilot:execute"]).toBe(
      "tsx scripts/uploads/run-v084-private-upload-pilot.ts --execute"
    );
  });

  test("TASK.md records T014 PR_OPEN and keeps all upload surfaces blocked", async () => {
    const task = await readFile("TASK.md", "utf8");

    expect(task).toContain("### T014 - V084 Private Upload Execution Invocation Path");
    expect(task).toMatch(/### T014 - V084 Private Upload Execution Invocation Path[\s\S]*Status: `PR_OPEN`/);
    expect(task).toContain("Current blocker: `PR_OPEN_T014_V084_PRIVATE_UPLOAD_EXECUTION_INVOCATION_PATH_REVIEW`");
    expect(task).toContain("PRIVATE_UPLOAD_PILOT_EXECUTION=BLOCKED_FRESH_APPROVAL_REQUIRED_AFTER_MERGE");
    expect(task).toContain("SAFE_TO_UPLOAD=false");
    expect(task).toContain("SAFE_TO_PUBLIC_UPLOAD=false");
    expect(task).toContain("PUBLIC_UPLOAD=BLOCKED");
    expect(task).toContain("COMMENT_AUTOMATION=BLOCKED");
    expect(task).toContain("SCHEDULER_EXECUTION=BLOCKED");
  });

  test("docs state that V084 is an invocation path but not an upload PR", async () => {
    const docs = await readFile("docs/commerce/v084_private_upload_execution_invocation_path.md", "utf8");

    expect(docs).toContain("V084 adds the invocation path.");
    expect(docs).toContain("V084 is not a real upload execution PR.");
    expect(docs).toContain("No videos.insert is called by V084 tests or plan commands.");
    expect(docs).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });
});

function readyRequest(
  overrides: Partial<V084PrivateUploadPilotInvocationRequest> = {}
): V084PrivateUploadPilotInvocationRequest {
  return {
    mode: "private_upload_pilot_invocation",
    dryRun: true,
    serverOnlyContext: true,
    v083AdapterAvailable: true,
    queueItemId: "queue-v084-father",
    uploadPackageId: "pkg-v084-father",
    channelKey: "father_jobs",
    visibility: "private",
    maxItems: 1,
    approvalPhrase: APPROVE_YOUTUBE_PRIVATE_UPLOAD_PILOT_1_ITEM_NO_COMMENT,
    commentAutomationAllowed: false,
    schedulerExecutionAllowed: false,
    generatedAt: "2026-07-05T00:00:00.000Z",
    videoAssetHashPrefix: "videoasset",
    readiness: readyReadiness(),
    ...overrides
  };
}

function readyReadiness() {
  return {
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
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
