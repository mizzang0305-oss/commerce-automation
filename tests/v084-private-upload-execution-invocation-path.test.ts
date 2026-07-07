import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import {
  APPROVE_YOUTUBE_PRIVATE_UPLOAD_PILOT_1_ITEM_NO_COMMENT
} from "../src/uploads/youtube/v081PrivateUploadPilot";
import {
  buildV084PrivateUploadPilotInvocation,
  buildV084PrivateUploadPilotInvocationFromEnv,
  type V084PrivateUploadPilotInvocationRequest
} from "../src/uploads/youtube/v084PrivateUploadExecutionInvocation";
import {
  runV084PrivateUploadPilotExecution
} from "../src/uploads/youtube/v084PrivateUploadExecutionInvocationRuntime";
import {
  DEFAULT_V095_PRIVATE_PILOT_EXECUTION_CONTEXT_RELATIVE_PATH
} from "../src/uploads/youtube/v095PrivatePilotExecutionContext";

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
  test("execute path reaches V081/V083 without keeping the V084 PR hard lock", async () => {
    const result = await runV084PrivateUploadPilotExecution(readyRequest({
      dryRun: false
    }));

    expect(result.status).toBe("blocked");
    expect(result.mode).toBe("private_upload_pilot_invocation");
    expect(result.v083AdapterInvoked).toBe(true);
    expect(result.v083AdapterMode).toBe("real_candidate");
    expect(result.blockers).not.toContain("BLOCKED_V084_REAL_EXECUTION_NOT_ALLOWED_IN_THIS_PR");
    expect(result.blockers).toContain("BLOCKED_V084_V081_EXECUTION_BLOCKED");
    expect(result.v081ResultStatus).toBe("blocked");
    expect(result.v081Blockers).not.toContain("BLOCKED_V083_REAL_UPLOAD_EXECUTOR_NOT_INJECTED");
    expect(result.v081Blockers).toContain("BLOCKED_V081_UPLOAD_PACKAGE_MISSING");
    expect(result.videosInsertCalled).toBe(false);
    expect(result.commentThreadsInsertCalled).toBe(false);
  });

  test("plan mode can become ready for private execution without importing or invoking V083", async () => {
    const result = await buildV084PrivateUploadPilotInvocation(readyRequest({
      dryRun: true
    }));

    expect(result.status).toBe("ready_for_private_execution");
    expect(result.dryRun).toBe(true);
    expect(result.executionAllowed).toBe(false);
    expect(result.approvalAccepted).toBe(true);
    expect(result.v083AdapterInvoked).toBe(false);
    expect(result.v083AdapterMode).toBeNull();
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

  test("blocks before adapter invocation when resolver or binder status evidence is missing", async () => {
    const result = await runV084PrivateUploadPilotExecution(readyRequest({
      dryRun: false,
      v088ResolverStatus: "missing",
      v087BinderStatus: "missing",
      v085BinderStatus: "blocked"
    }));

    expect(result.status).toBe("blocked");
    expect(result.blockers).toEqual(expect.arrayContaining([
      "BLOCKED_V084_V088_RESOLVER_NOT_BOUND",
      "BLOCKED_V084_V087_BINDER_NOT_READY",
      "BLOCKED_V084_V085_BINDER_NOT_READY"
    ]));
    expect(result.v083AdapterInvoked).toBe(false);
    expect(result.videosInsertCalled).toBe(false);
    expect(result.commentThreadsInsertCalled).toBe(false);
  });

  test("runtime wrapper gates resolver and binder evidence before adapter invocation", async () => {
    const runtimeSource = await readFile(
      "src/uploads/youtube/v084PrivateUploadExecutionInvocationRuntime.ts",
      "utf8"
    );

    expect(runtimeSource).toContain("normalizeRuntimeResolverBinderEvidence(request)");
    expect(runtimeSource).toContain("buildRuntimeResolverBinderBlockers(resolverBinderEvidence)");
    expect(runtimeSource.indexOf("buildRuntimeResolverBinderBlockers(resolverBinderEvidence)"))
      .toBeLessThan(runtimeSource.indexOf("executeV081PrivateUploadPilot("));
    expect(runtimeSource).toContain("request.v088ResolverStatus");
    expect(runtimeSource).toContain("request.v087BinderStatus");
    expect(runtimeSource).toContain("request.v085BinderStatus");
    expect(runtimeSource).toContain("BLOCKED_V084_V088_RESOLVER_NOT_BOUND");
    expect(runtimeSource).toContain("BLOCKED_V084_V087_BINDER_NOT_READY");
    expect(runtimeSource).toContain("BLOCKED_V084_V085_BINDER_NOT_READY");
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
    const cwd = await mkdtemp(path.join(os.tmpdir(), "commerce-v084-missing-"));
    const result = await buildV084PrivateUploadPilotInvocationFromEnv({
      env: { V095_CWD: cwd },
      dryRun: true
    });

    expect(result.status).toBe("blocked");
    expect(result.blockers).toEqual(expect.arrayContaining([
      "BLOCKED_V084_EXECUTION_CONTEXT_NOT_LOADED",
      "BLOCKED_V084_FRESH_APPROVAL_REQUIRED",
      "BLOCKED_V084_UPLOAD_PACKAGE_REQUIRED",
      "BLOCKED_V084_QUEUE_ITEM_REQUIRED",
      "BLOCKED_V084_READINESS_NOT_READY"
    ]));
    expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    await rm(cwd, { recursive: true, force: true });
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

  test("package plan command returns sanitized no-upload JSON from auto-loaded V095 context", async () => {
    const npmCli = process.env.npm_execpath;

    expect(npmCli).toBeTruthy();
    const cwd = await writeV095ExecutionContext();

    try {
      const output = execFileSync(process.execPath, [
        npmCli as string,
        "run",
        "upload:v084:private-pilot:plan",
        "--silent"
      ], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          V095_CWD: cwd,
          V084_PRIVATE_UPLOAD_APPROVAL_PHRASE: APPROVE_YOUTUBE_PRIVATE_UPLOAD_PILOT_1_ITEM_NO_COMMENT
        }
      });
      const parsed = JSON.parse(output);

      expect(parsed.mode).toBe("private_upload_pilot_invocation");
      expect(parsed.status).toBe("ready_for_private_execution");
      expect(parsed.dryRun).toBe(true);
      expect(parsed.queueItemIdPresent).toBe(true);
      expect(parsed.uploadPackageIdPresent).toBe(true);
      expect(parsed.v088ResolverBound).toBe(true);
      expect(parsed.v087BinderReady).toBe(true);
      expect(parsed.v085BinderReady).toBe(true);
      expect(parsed.videosInsertCalled).toBe(false);
      expect(parsed.commentThreadsInsertCalled).toBe(false);
      expect(output).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("runtime execute function reaches V081/V083 no-upload boundary without invoking package execute command", async () => {
    const result = await runV084PrivateUploadPilotExecution(readyRequest({
      dryRun: false
    }));

    expect(result.mode).toBe("private_upload_pilot_invocation");
    expect(result.status).toBe("blocked");
    expect(result.dryRun).toBe(false);
    expect(result.blockers).not.toContain("BLOCKED_V084_REAL_EXECUTION_NOT_ALLOWED_IN_THIS_PR");
    expect(result.blockers).toContain("BLOCKED_V084_V081_EXECUTION_BLOCKED");
    expect(result.v081Blockers).not.toContain("BLOCKED_V083_REAL_UPLOAD_EXECUTOR_NOT_INJECTED");
    expect(result.v081Blockers).toContain("BLOCKED_V081_UPLOAD_PACKAGE_MISSING");
    expect(result.videosInsertCalled).toBe(false);
    expect(result.commentThreadsInsertCalled).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });

  test("runtime execute function preserves unsafe automation blockers without invoking package execute command", async () => {
    const result = await runV084PrivateUploadPilotExecution(readyRequest({
      dryRun: false,
      commentAutomationAllowed: true,
      schedulerExecutionAllowed: true
    }));

    expect(result.status).toBe("blocked");
    expect(result.blockers).toContain("BLOCKED_V084_COMMENT_AUTOMATION_NOT_ALLOWED");
    expect(result.blockers).toContain("BLOCKED_V084_SCHEDULER_EXECUTION_NOT_ALLOWED");
    expect(result.v083AdapterInvoked).toBe(false);
    expect(result.videosInsertCalled).toBe(false);
    expect(result.commentThreadsInsertCalled).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });

  test("package plan command test uses a cross-platform npm executable", async () => {
    const testSource = await readFile("tests/v084-private-upload-execution-invocation-path.test.ts", "utf8");

    expect(testSource).toContain("process.execPath");
    expect(testSource).toContain("process.env.npm_execpath");
    expect(testSource).not.toContain(["cmd", ".exe"].join(""));
  });

  test("package execute command preserves V095 context through shared request generation", async () => {
    const scriptSource = await readFile("scripts/uploads/run-v084-private-upload-pilot.ts", "utf8");

    expect(scriptSource).toContain("buildV084PrivateUploadPilotInvocationRequestFromEnv");
    expect(scriptSource).toContain("runV084PrivateUploadPilotExecution(request)");
    expect(scriptSource).not.toContain("process.env.V084_QUEUE_ITEM_ID ??");
    expect(scriptSource).not.toContain("process.env.V084_UPLOAD_PACKAGE_ID ??");
    expect(scriptSource).not.toContain("readV088ResolverStatus");
    expect(scriptSource).not.toContain("readBinderStatus");
  });

  test("V084 pure invocation module does not bypass server-only V083 adapter guard", async () => {
    const invocationSource = await readFile("src/uploads/youtube/v084PrivateUploadExecutionInvocation.ts", "utf8");
    const serverSource = await readFile("src/uploads/youtube/v084PrivateUploadExecutionInvocationServer.ts", "utf8");
    const v083Wrapper = await readFile("src/uploads/youtube/v083RealPrivateUploadExecutionAdapter.ts", "utf8");

    expect(invocationSource).not.toContain("v083RealPrivateUploadExecutionAdapterCore");
    expect(invocationSource).not.toContain("v083RealPrivateUploadExecutionAdapter");
    expect(invocationSource).not.toContain("executeV081PrivateUploadPilot");
    expect(serverSource).toMatch(/import\s+"server-only";/);
    expect(serverSource).toContain("./v083RealPrivateUploadExecutionAdapter");
    expect(serverSource).not.toContain("./v083RealPrivateUploadExecutionAdapterCore");
    expect(v083Wrapper).toMatch(/import\s+"server-only";/);
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

  test("TASK.md records T014 DONE and keeps all upload surfaces blocked", async () => {
    const task = await readFile("TASK.md", "utf8");

    expect(task).toContain("### T014 - V084 Private Upload Execution Invocation Path");
    expect(task).toMatch(/### T014 - V084 Private Upload Execution Invocation Path[\s\S]*Status: `DONE`/);
    expect(task).toMatch(
      /Current blocker: `(V086_PRIVATE_UPLOAD_INPUT_BINDER_RUN_ON_MAIN_NO_UPLOAD|V085_PRIVATE_UPLOAD_PILOT_1_ITEM_EXECUTION_WAITING_FOR_FRESH_APPROVAL|PR_OPEN_T015_V085_PRIVATE_PILOT_INPUT_BINDING_REVIEW|PR_OPEN_T016_V087_AUTHORITATIVE_PRODUCT_SOURCE_BINDING_REVIEW|V088_RUN_V087_AND_V085_BINDERS_ON_MAIN_NO_UPLOAD|V089_PRIVATE_UPLOAD_PILOT_1_ITEM_EXECUTION_WAITING_FOR_FRESH_APPROVAL|PR_OPEN_T018_V090_UNLOCK_V084_PRIVATE_EXECUTE_GATE_NO_UPLOAD_REVIEW|PR_OPEN_T019_V091_UNLOCK_V083_REAL_PRIVATE_ADAPTER_EXECUTION_NO_UPLOAD_REVIEW|PR_OPEN_T020_V092_INJECT_SERVER_ONLY_YOUTUBE_PRIVATE_UPLOAD_EXECUTOR_NO_UPLOAD_REVIEW|PR_OPEN_T021_V094_BIND_UPLOAD_PACKAGE_TO_V081_SERVER_EXECUTOR_NO_UPLOAD_REVIEW|PR_OPEN_T022_V095_PRIVATE_PILOT_EXECUTION_CONTEXT_BRIDGE_NO_UPLOAD_REVIEW|PR_OPEN_T023_V096_FIX_V084_EXECUTE_CONTEXT_LOADING_NO_UPLOAD_REVIEW)`/
    );
    expect(task).toContain("PRIVATE_UPLOAD_PILOT_EXECUTION=BLOCKED_FRESH_APPROVAL_REQUIRED");
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
    v088ResolverStatus: "bound",
    v087BinderStatus: "ready_for_fresh_approval",
    v085BinderStatus: "ready_for_fresh_approval",
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

async function writeV095ExecutionContext() {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "commerce-v084-"));
  const contextPath = path.join(cwd, DEFAULT_V095_PRIVATE_PILOT_EXECUTION_CONTEXT_RELATIVE_PATH);
  await mkdir(path.dirname(contextPath), { recursive: true });
  await writeFile(contextPath, `${JSON.stringify({
    version: "v095",
    channelKey: "father_jobs",
    queueItemId: "queue-v084-script",
    uploadPackageId: "pkg-v084-script",
    v088ResolverStatus: "bound",
    v087BinderStatus: "ready_for_fresh_approval",
    v085BinderStatus: "ready_for_fresh_approval",
    visibility: "private",
    maxItems: 1,
    readiness: {
      runtimeReady: true,
      tokenProviderReady: true,
      uploadScopeReady: true,
      quotaReady: true,
      videoAssetReady: true,
      uploadPackageReady: true,
      affiliateEvidenceReady: true,
      disclosureEvidenceReady: true,
      duplicateGuardReady: true,
      targetChannelEvidenceReady: true,
      metadataReady: true
    },
    productSourceHashPrefix: "sourcehash",
    videoAssetHashPrefix: "videohash",
    targetChannelHashPrefix: "targethash",
    generatedAt: "2026-07-07T00:00:00.000Z",
    contextCreatedAt: "2026-07-07T00:00:00.000Z",
    contextExpiresAt: "2099-01-01T00:00:00.000Z"
  }, null, 2)}\n`, "utf8");
  return cwd;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
