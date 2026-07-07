import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { CHANNEL_KEYS, type ChannelKey } from "../src/uploads/multi-channel/channelProfiles";
import { V057_CORRECTED_REUPLOAD_EXPECTED_PRODUCTS } from "../src/uploads/multi-channel/v057CorrectedReuploadProductSource";
import { V057_REUPLOAD_ASSET_PROFILE } from "../src/uploads/multi-channel/v057ReuploadAssetBinding";
import {
  buildV084PrivateUploadPilotInvocationRequestFromEnv,
  buildV084PrivateUploadPilotInvocationFromEnv
} from "../src/uploads/youtube/v084PrivateUploadExecutionInvocation";
import {
  DEFAULT_V095_PRIVATE_PILOT_EXECUTION_CONTEXT_RELATIVE_PATH,
  prepareV095PrivatePilotExecutionContext
} from "../src/uploads/youtube/v095PrivatePilotExecutionContext";

const CHANNEL: ChannelKey = "father_jobs";
const RAW_COUPANG_URL = ["https://www.coupang.com", "vp", "products", "995000001"].join("/");
const AFFILIATE_URL = ["https://link.coupang.com", "a", "v095-father"].join("/");
const TARGET_CHANNEL_ID = `UC${"5".repeat(22)}`;
const TOKEN_PATH = path.join(os.tmpdir(), "commerce-v095-youtube-token.json");
const DISCLOSURE_TEXT = "\uC774 \uD3EC\uC2A4\uD305\uC740 \uCFE0\uD321 \uD30C\uD2B8\uB108\uC2A4 \uD65C\uB3D9\uC758 \uC77C\uD658\uC73C\uB85C, \uC774\uC5D0 \uB530\uB978 \uC77C\uC815\uC561\uC758 \uC218\uC218\uB8CC\uB97C \uC81C\uACF5\uBC1B\uC2B5\uB2C8\uB2E4.";
const PRIVATE_APPROVAL_PHRASE = ["APPROVE_YOUTUBE_PRIVATE_UPLOAD", "PILOT_1_ITEM_NO_COMMENT"].join("_");
const FORBIDDEN_PATTERN = new RegExp([
  RAW_COUPANG_URL,
  AFFILIATE_URL,
  TARGET_CHANNEL_ID,
  TOKEN_PATH,
  "access-token-v095",
  "refresh-token-v095",
  PRIVATE_APPROVAL_PHRASE,
  "client_secret",
  "Authorization",
  "Bearer",
  "HmacSHA256",
  "signature="
].map(escapeRegExp).join("|"), "i");

describe("v095 private pilot execution context bridge", () => {
  test("prepares a protected local context with sanitized fields only", async () => {
    const cwd = await makeCwd();
    try {
      const manifestPath = await writeReadyInputs(cwd);
      await writeTokenFile();

      const result = await prepareV095PrivatePilotExecutionContext({
        cwd,
        env: readyEnv(manifestPath),
        now: () => "2026-07-07T00:00:00.000Z"
      });
      const contextPath = path.join(cwd, DEFAULT_V095_PRIVATE_PILOT_EXECUTION_CONTEXT_RELATIVE_PATH);
      const context = JSON.parse(await readFile(contextPath, "utf8"));
      const serialized = JSON.stringify({ result, context });

      expect(result.status).toBe("context_ready");
      expect(result.localContextWritten).toBe(true);
      expect(result.contextPathLabel).toBe(DEFAULT_V095_PRIVATE_PILOT_EXECUTION_CONTEXT_RELATIVE_PATH);
      expect(context.version).toBe("v095");
      expect(context.channelKey).toBe(CHANNEL);
      expect(context.v088ResolverStatus).toBe("bound");
      expect(context.v087BinderStatus).toBe("ready_for_fresh_approval");
      expect(context.v085BinderStatus).toBe("ready_for_fresh_approval");
      expect(context.visibility).toBe("private");
      expect(context.maxItems).toBe(1);
      expect(context.readiness.runtimeReady).toBe(true);
      expect(context.readiness.targetChannelEvidenceReady).toBe(true);
      expect(context).not.toHaveProperty("approvalPhrase");
      expect(context).not.toHaveProperty("rawCoupangUrl");
      expect(context).not.toHaveProperty("selectedAffiliateUrl");
      expect(result.videosInsertCalled).toBe(false);
      expect(result.commentThreadsInsertCalled).toBe(false);
      expect(serialized).not.toMatch(FORBIDDEN_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
      await rm(TOKEN_PATH, { force: true });
    }
  });

  test("V084 plan loads V095 context and leaves only fresh approval required", async () => {
    const cwd = await makeCwd();
    try {
      const manifestPath = await writeReadyInputs(cwd);
      await writeTokenFile();
      await prepareV095PrivatePilotExecutionContext({
        cwd,
        env: readyEnv(manifestPath),
        now: () => "2026-07-07T00:00:00.000Z"
      });

      const result = await buildV084PrivateUploadPilotInvocationFromEnv({
        dryRun: true,
        env: {
          V095_CWD: cwd,
          V084_PRIVATE_PILOT_EXECUTION_CONTEXT_PATH: path.join(cwd, DEFAULT_V095_PRIVATE_PILOT_EXECUTION_CONTEXT_RELATIVE_PATH),
          V084_NOW_ISO: "2026-07-07T00:01:00.000Z"
        }
      });

      expect(result.status).toBe("blocked");
      expect(result.blockers).toEqual(["BLOCKED_V084_FRESH_APPROVAL_REQUIRED"]);
      expect(result.v088ResolverBound).toBe(true);
      expect(result.v087BinderReady).toBe(true);
      expect(result.v085BinderReady).toBe(true);
      expect(result.queueItemIdPresent).toBe(true);
      expect(result.uploadPackageIdPresent).toBe(true);
      expect(result.requestedVisibility).toBe("private");
      expect(result.requestedMaxItems).toBe(1);
      expect(result.videosInsertCalled).toBe(false);
      expect(result.commentThreadsInsertCalled).toBe(false);
      expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
      await rm(TOKEN_PATH, { force: true });
    }
  });

  test("context-backed V084 request generation preserves ids, statuses, and readiness for execute runtime", async () => {
    const cwd = await makeCwd();
    try {
      const manifestPath = await writeReadyInputs(cwd);
      await writeTokenFile();
      await prepareV095PrivatePilotExecutionContext({
        cwd,
        env: readyEnv(manifestPath),
        now: () => "2026-07-07T00:00:00.000Z"
      });
      const contextPath = path.join(cwd, DEFAULT_V095_PRIVATE_PILOT_EXECUTION_CONTEXT_RELATIVE_PATH);
      const context = JSON.parse(await readFile(contextPath, "utf8"));

      const request = await buildV084PrivateUploadPilotInvocationRequestFromEnv({
        dryRun: false,
        env: {
          V095_CWD: cwd,
          V084_PRIVATE_PILOT_EXECUTION_CONTEXT_PATH: contextPath,
          V084_NOW_ISO: "2026-07-07T00:01:00.000Z",
          V084_PRIVATE_UPLOAD_APPROVAL_PHRASE: PRIVATE_APPROVAL_PHRASE
        }
      });
      const serialized = JSON.stringify({
        ...request,
        approvalPhrase: request.approvalPhrase ? "<runtime-env-only>" : null
      });

      expect(request.dryRun).toBe(false);
      expect(request.queueItemId).toBe(context.queueItemId);
      expect(request.uploadPackageId).toBe(context.uploadPackageId);
      expect(request.channelKey).toBe(CHANNEL);
      expect(request.v088ResolverStatus).toBe("bound");
      expect(request.v087BinderStatus).toBe("ready_for_fresh_approval");
      expect(request.v085BinderStatus).toBe("ready_for_fresh_approval");
      expect(request.visibility).toBe("private");
      expect(request.maxItems).toBe(1);
      expect(Object.values(request.readiness).every(Boolean)).toBe(true);
      expect(request.approvalPhrase).toBe(PRIVATE_APPROVAL_PHRASE);
      expect(serialized).not.toMatch(FORBIDDEN_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
      await rm(TOKEN_PATH, { force: true });
    }
  });

  test("prepare command uses canonical protected manifest when explicit manifest env is absent", async () => {
    const cwd = await makeCwd();
    try {
      const manifestPath = await writeReadyInputs(cwd);
      await writeTokenFile();
      const env = readyEnv(manifestPath);
      delete env.V087_PRODUCT_SOURCE_MANIFEST_PATH;
      delete env.V088_PRODUCT_SOURCE_MANIFEST_PATH;

      const result = await prepareV095PrivatePilotExecutionContext({
        cwd,
        env,
        now: () => "2026-07-07T00:00:00.000Z"
      });

      expect(result.status).toBe("context_ready");
      expect(result.localContextWritten).toBe(true);
      expect(result.v087BinderStatus).toBe("ready_for_fresh_approval");
      expect(result.v085BinderStatus).toBe("ready_for_fresh_approval");
      expect(result.blockers).toEqual([]);
      expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
      await rm(TOKEN_PATH, { force: true });
    }
  });

  test("prepare blocks context paths outside the protected root and does not write", async () => {
    const cwd = await makeCwd();
    try {
      const manifestPath = await writeReadyInputs(cwd);
      await writeTokenFile();
      const outsidePath = path.join(cwd, "outside-context.local.json");

      const result = await prepareV095PrivatePilotExecutionContext({
        cwd,
        env: readyEnv(manifestPath),
        contextPath: outsidePath,
        now: () => "2026-07-07T00:00:00.000Z"
      });

      await expect(readFile(outsidePath, "utf8")).rejects.toThrow();
      expect(result.status).toBe("blocked");
      expect(result.localContextWritten).toBe(false);
      expect(result.blockers).toContain("BLOCKED_V095_CONTEXT_PATH_UNSAFE");
      expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
      await rm(TOKEN_PATH, { force: true });
    }
  });

  test("prepare blocks path traversal context paths and does not write", async () => {
    const cwd = await makeCwd();
    try {
      const manifestPath = await writeReadyInputs(cwd);
      await writeTokenFile();

      const result = await prepareV095PrivatePilotExecutionContext({
        cwd,
        env: readyEnv(manifestPath),
        contextPath: path.join("commerce-assets", "review", "v057", "father_jobs", "..", "outside.local.json"),
        now: () => "2026-07-07T00:00:00.000Z"
      });

      expect(result.status).toBe("blocked");
      expect(result.localContextWritten).toBe(false);
      expect(result.blockers).toContain("BLOCKED_V095_CONTEXT_PATH_UNSAFE");
      expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
      await rm(TOKEN_PATH, { force: true });
    }
  });

  test("missing context keeps existing V084 blockers", async () => {
    const cwd = await makeCwd();
    const result = await buildV084PrivateUploadPilotInvocationFromEnv({
      dryRun: true,
      env: {
        V095_CWD: cwd,
        V084_PRIVATE_PILOT_EXECUTION_CONTEXT_PATH: path.join(cwd, DEFAULT_V095_PRIVATE_PILOT_EXECUTION_CONTEXT_RELATIVE_PATH)
      }
    });

    expect(result.status).toBe("blocked");
    expect(result.blockers).toEqual(expect.arrayContaining([
      "BLOCKED_V084_FRESH_APPROVAL_REQUIRED",
      "BLOCKED_V084_V088_RESOLVER_NOT_BOUND",
      "BLOCKED_V084_V087_BINDER_NOT_READY",
      "BLOCKED_V084_V085_BINDER_NOT_READY",
      "BLOCKED_V084_UPLOAD_PACKAGE_REQUIRED",
      "BLOCKED_V084_QUEUE_ITEM_REQUIRED",
      "BLOCKED_V084_READINESS_NOT_READY"
    ]));
    expect(result.videosInsertCalled).toBe(false);
    await rm(cwd, { recursive: true, force: true });
  });

  test("load blocks context paths outside the protected root before reading", async () => {
    const cwd = await makeCwd();
    try {
      const outsidePath = path.join(cwd, "outside-v095-context.json");
      await writeFile(outsidePath, `${JSON.stringify({
        version: "v095",
        channelKey: CHANNEL,
        queueItemId: "queue-v095-father",
        uploadPackageId: "pkg-v095-father",
        v088ResolverStatus: "bound",
        v087BinderStatus: "ready_for_fresh_approval",
        v085BinderStatus: "ready_for_fresh_approval",
        visibility: "private",
        maxItems: 1,
        readiness: readyReadiness(),
        contextCreatedAt: "2026-07-07T00:00:00.000Z",
        contextExpiresAt: "2026-07-07T00:30:00.000Z"
      }, null, 2)}\n`, "utf8");

      const result = await buildV084PrivateUploadPilotInvocationFromEnv({
        dryRun: true,
        env: {
          V095_CWD: cwd,
          V084_PRIVATE_PILOT_EXECUTION_CONTEXT_PATH: outsidePath
        }
      });

      expect(result.status).toBe("blocked");
      expect(result.blockers).toContain("BLOCKED_V084_EXECUTION_CONTEXT_PATH_UNSAFE");
      expect(result.videosInsertCalled).toBe(false);
      expect(result.commentThreadsInsertCalled).toBe(false);
      expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("stale context blocks before execution readiness", async () => {
    const cwd = await makeCwd();
    try {
      const manifestPath = await writeReadyInputs(cwd);
      await writeTokenFile();
      await prepareV095PrivatePilotExecutionContext({
        cwd,
        env: readyEnv(manifestPath),
        now: () => "2026-07-07T00:00:00.000Z",
        ttlMs: 1
      });

      const result = await buildV084PrivateUploadPilotInvocationFromEnv({
        dryRun: true,
        env: {
          V095_CWD: cwd,
          V084_PRIVATE_PILOT_EXECUTION_CONTEXT_PATH: path.join(cwd, DEFAULT_V095_PRIVATE_PILOT_EXECUTION_CONTEXT_RELATIVE_PATH),
          V084_NOW_ISO: "2026-07-07T00:00:01.000Z"
        }
      });

      expect(result.status).toBe("blocked");
      expect(result.blockers).toContain("BLOCKED_V084_EXECUTION_CONTEXT_STALE");
      expect(result.videosInsertCalled).toBe(false);
      expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
      await rm(TOKEN_PATH, { force: true });
    }
  });

  test("env and context conflicts fail closed", async () => {
    const cwd = await makeCwd();
    try {
      const manifestPath = await writeReadyInputs(cwd);
      await writeTokenFile();
      await prepareV095PrivatePilotExecutionContext({
        cwd,
        env: readyEnv(manifestPath),
        now: () => "2026-07-07T00:00:00.000Z"
      });

      const result = await buildV084PrivateUploadPilotInvocationFromEnv({
        dryRun: true,
        env: {
          V095_CWD: cwd,
          V084_PRIVATE_PILOT_EXECUTION_CONTEXT_PATH: path.join(cwd, DEFAULT_V095_PRIVATE_PILOT_EXECUTION_CONTEXT_RELATIVE_PATH),
          V084_CHANNEL_KEY: "lets_buy",
          V084_QUEUE_ITEM_ID: "other-queue"
        }
      });

      expect(result.status).toBe("blocked");
      expect(result.blockers).toContain("BLOCKED_V084_EXECUTION_CONTEXT_CONFLICT");
      expect(result.channelKey).toBe(CHANNEL);
      expect(result.videosInsertCalled).toBe(false);
      expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
      await rm(TOKEN_PATH, { force: true });
    }
  });

  test("raw evidence or approval phrase inside context blocks as unsafe", async () => {
    const cwd = await makeCwd();
    try {
      const contextPath = path.join(cwd, DEFAULT_V095_PRIVATE_PILOT_EXECUTION_CONTEXT_RELATIVE_PATH);
      await mkdir(path.dirname(contextPath), { recursive: true });
      await writeFile(contextPath, `${JSON.stringify({
        version: "v095",
        channelKey: CHANNEL,
        queueItemId: "queue-v095-father",
        uploadPackageId: "pkg-v095-father",
        v088ResolverStatus: "bound",
        v087BinderStatus: "ready_for_fresh_approval",
        v085BinderStatus: "ready_for_fresh_approval",
        visibility: "private",
        maxItems: 1,
        readiness: readyReadiness(),
        approvalPhrase: PRIVATE_APPROVAL_PHRASE,
        rawCoupangUrl: RAW_COUPANG_URL,
        contextCreatedAt: "2026-07-07T00:00:00.000Z",
        contextExpiresAt: "2026-07-07T00:30:00.000Z"
      }, null, 2)}\n`, "utf8");

      const result = await buildV084PrivateUploadPilotInvocationFromEnv({
        dryRun: true,
        env: {
          V095_CWD: cwd,
          V084_PRIVATE_PILOT_EXECUTION_CONTEXT_PATH: contextPath,
          V084_NOW_ISO: "2026-07-07T00:01:00.000Z"
        }
      });

      expect(result.status).toBe("blocked");
      expect(result.blockers).toContain("BLOCKED_V084_EXECUTION_CONTEXT_UNSAFE");
      expect(result.videosInsertCalled).toBe(false);
      expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("preflight package command prepares context and returns only fresh approval blocker", async () => {
    const cwd = await makeCwd();
    try {
      const manifestPath = await writeReadyInputs(cwd);
      await writeTokenFile();
      const npmCli = process.env.npm_execpath;

      expect(npmCli).toBeTruthy();

      const output = execFileSync(process.execPath, [
        npmCli as string,
        "run",
        "upload:v095:preflight-private-pilot",
        "--silent"
      ], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          ...readyEnv(manifestPath),
          V095_CWD: cwd,
          V084_PRIVATE_UPLOAD_APPROVAL_PHRASE: PRIVATE_APPROVAL_PHRASE
        }
      });
      const parsed = JSON.parse(output);

      expect(parsed.version).toBe("v095");
      expect(parsed.status).toBe("ready_for_fresh_approval");
      expect(parsed.context.localContextWritten).toBe(true);
      expect(parsed.v084Plan.blockers).toEqual(["BLOCKED_V084_FRESH_APPROVAL_REQUIRED"]);
      expect(parsed.v084Plan.approvalAccepted).toBe(false);
      expect(parsed.uploadExecuteCalled).toBe(false);
      expect(parsed.videosInsertCalled).toBe(false);
      expect(parsed.commentThreadsInsertCalled).toBe(false);
      expect(output).not.toMatch(FORBIDDEN_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
      await rm(TOKEN_PATH, { force: true });
    }
  });

  test("package.json exposes V095 no-upload scripts and not execute", async () => {
    const pkg = JSON.parse(await readFile("package.json", "utf8"));

    expect(pkg.scripts["upload:v095:prepare-execution-context"]).toBe(
      "tsx scripts/uploads/prepare-v095-private-pilot-execution-context.ts"
    );
    expect(pkg.scripts["upload:v095:preflight-private-pilot"]).toBe(
      "tsx scripts/uploads/run-v095-private-pilot-preflight.ts"
    );
    expect(pkg.scripts["upload:v095:private-pilot:execute"]).toBeUndefined();
  });
});

async function makeCwd() {
  return mkdtemp(path.join(os.tmpdir(), "commerce-v095-"));
}

async function writeReadyInputs(cwd: string) {
  for (const channelKey of CHANNEL_KEYS) {
    const channelDir = path.join(cwd, "commerce-assets", "review", "v057", channelKey);
    await mkdir(channelDir, { recursive: true });
    await writeFile(path.join(channelDir, "corrected-preview-v057.mp4"), `fake-v095-${channelKey}-mp4`, "utf8");
    await writeFile(path.join(channelDir, "first-frame-v057.jpg"), `fake-v095-${channelKey}-jpg`, "utf8");
  }

  await mkdir(path.join(cwd, "data"), { recursive: true });
  await writeFile(path.join(cwd, "data", "queue.json"), `${JSON.stringify(CHANNEL_KEYS.map((channelKey, index) => ({
    id: `queue-v095-${channelKey}`,
    channelKey,
    assetProfile: V057_REUPLOAD_ASSET_PROFILE,
    product_name: V057_CORRECTED_REUPLOAD_EXPECTED_PRODUCTS[channelKey],
    raw_coupang_url: RAW_COUPANG_URL,
    selected_affiliate_url: AFFILIATE_URL,
    updated_at: "2026-07-07T00:00:00.000Z",
    priority: index + 1
  })), null, 2)}\n`, "utf8");
  await writeFile(path.join(cwd, "data", "contents.json"), `${JSON.stringify(CHANNEL_KEYS.map((channelKey) => ({
    id: `content-v095-${channelKey}`,
    product_queue_id: `queue-v095-${channelKey}`,
    channelKey,
    assetProfile: V057_REUPLOAD_ASSET_PROFILE,
    product_name: V057_CORRECTED_REUPLOAD_EXPECTED_PRODUCTS[channelKey],
    raw_coupang_url: RAW_COUPANG_URL,
    selected_affiliate_url: AFFILIATE_URL,
    title: `v095 title ${channelKey}`,
    description: `v095 description ${channelKey}`,
    updated_at: "2026-07-07T00:00:00.000Z"
  })), null, 2)}\n`, "utf8");

  const reviewDir = path.join(cwd, "commerce-assets", "review", "v057", CHANNEL);
  const manifestPath = path.join(reviewDir, "product-source-v057.local.json");
  await writeFile(manifestPath, `${JSON.stringify({
    sourceVersion: "v095-test",
    productSourceId: `source-v095-${CHANNEL}`,
    queueItemId: `queue-v095-${CHANNEL}`,
    uploadPackageId: `pkg-v095-${CHANNEL}`,
    channelKey: CHANNEL,
    productName: V057_CORRECTED_REUPLOAD_EXPECTED_PRODUCTS[CHANNEL],
    rawCoupangUrl: RAW_COUPANG_URL,
    selectedAffiliateUrl: AFFILIATE_URL,
    coupangPartnersDisclosureText: DISCLOSURE_TEXT,
    videoAssetPath: path.join(reviewDir, "corrected-preview-v057.mp4"),
    firstFramePath: path.join(reviewDir, "first-frame-v057.jpg"),
    duplicateGuardKey: `dup-v095-${CHANNEL}`,
    targetChannelKey: CHANNEL
  }, null, 2)}\n`, "utf8");
  return manifestPath;
}

async function writeTokenFile() {
  await writeFile(TOKEN_PATH, `${JSON.stringify({
    access_token: "access-token-v095",
    refresh_token: "refresh-token-v095",
    scopes: ["https://www.googleapis.com/auth/youtube.upload"]
  }, null, 2)}\n`, "utf8");
}

function readyEnv(manifestPath: string): NodeJS.ProcessEnv {
  return {
    V051_UPLOAD_ASSET_PROFILE: V057_REUPLOAD_ASSET_PROFILE,
    V084_CHANNEL_KEY: CHANNEL,
    V087_PRODUCT_SOURCE_MANIFEST_PATH: manifestPath,
    V088_PRODUCT_SOURCE_MANIFEST_PATH: manifestPath,
    COUPANG_PARTNERS_ACCESS_KEY: "access-key-present",
    COUPANG_PARTNERS_SECRET_KEY: "secret-key-present",
    COUPANG_PARTNERS_CUSTOMER_ID: "customer-present",
    YOUTUBE_FATHER_JOBS_CHANNEL_ID: TARGET_CHANNEL_ID,
    YOUTUBE_NEOMAN_MOLEULGEOL_CHANNEL_ID: `UC${"6".repeat(22)}`,
    YOUTUBE_LETS_BUY_CHANNEL_ID: `UC${"7".repeat(22)}`,
    YOUTUBE_CLIENT_ID: "client-id-present",
    YOUTUBE_CLIENT_SECRET: "client-secret-present",
    YOUTUBE_TOKEN_PROVIDER_MODE: "local_file",
    YOUTUBE_LOCAL_TOKEN_FILE_PATH: TOKEN_PATH,
    YOUTUBE_QUOTA_READY: "true"
  };
}

function readyReadiness() {
  return {
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
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
