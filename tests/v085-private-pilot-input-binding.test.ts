import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { CHANNEL_KEYS, type ChannelKey } from "../src/uploads/multi-channel/channelProfiles";
import { V057_CORRECTED_REUPLOAD_EXPECTED_PRODUCTS } from "../src/uploads/multi-channel/v057CorrectedReuploadProductSource";
import { V057_REUPLOAD_ASSET_PROFILE } from "../src/uploads/multi-channel/v057ReuploadAssetBinding";
import {
  buildV085PrivatePilotInputBinding
} from "../src/uploads/youtube/v085PrivatePilotInputBinding";

const TARGET_CHANNEL_IDS: Record<ChannelKey, string> = {
  father_jobs: `UC${"A".repeat(22)}`,
  neoman_moleulgeol: `UC${"B".repeat(22)}`,
  lets_buy: `UC${"C".repeat(22)}`
};

const RAW_COUPANG_URLS: Record<ChannelKey, string> = {
  father_jobs: ["https://www.coupang.com", "vp", "products", "885000001"].join("/"),
  neoman_moleulgeol: ["https://www.coupang.com", "vp", "products", "885000002"].join("/"),
  lets_buy: ["https://www.coupang.com", "vp", "products", "885000003"].join("/")
};

const AFFILIATE_URLS: Record<ChannelKey, string> = {
  father_jobs: ["https://link.coupang.com", "a", "v085-father"].join("/"),
  neoman_moleulgeol: ["https://link.coupang.com", "a", "v085-neoman"].join("/"),
  lets_buy: ["https://link.coupang.com", "a", "v085-lets"].join("/")
};

const TOKEN_PATH = path.join(os.tmpdir(), "commerce-v085-youtube-token.json");
const FORBIDDEN_REPORT_PATTERN = new RegExp([
  ...Object.values(TARGET_CHANNEL_IDS),
  ...Object.values(RAW_COUPANG_URLS),
  ...Object.values(AFFILIATE_URLS),
  TOKEN_PATH,
  "refresh-token-v085",
  "access-token-v085",
  "client_secret",
  "Authorization",
  "Bearer",
  "HmacSHA256",
  "signature="
].map(escapeRegExp).join("|"), "i");

describe("v085 private pilot input binding preflight", () => {
  test("blocks when queue item, upload package, and runtime readiness inputs are missing", async () => {
    const cwd = await makeCwd();
    try {
      const result = await buildV085PrivatePilotInputBinding({
        cwd,
        env: {}
      });

      expect(result.status).toBe("blocked");
      expect(result.blockers).toEqual(expect.arrayContaining([
        "BLOCKED_V085_QUEUE_ITEM_ID_MISSING",
        "BLOCKED_V085_UPLOAD_PACKAGE_ID_MISSING",
        "BLOCKED_V085_RUNTIME_READY_MISSING"
      ]));
      expect(result.nextRequiredEnv).toEqual({
        V084_QUEUE_ITEM_ID: "missing",
        V084_UPLOAD_PACKAGE_ID: "missing",
        V084_RUNTIME_READY: "missing"
      });
      expect(result.v084Plan.status).toBe("blocked");
      expect(result.v084Plan.videosInsertCalled).toBe(false);
      expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("resolves one private pilot target and reports ready_for_fresh_approval without executing upload", async () => {
    const cwd = await makeCwd();
    try {
      await writeReadyInputs(cwd);
      await writeTokenFile();

      const result = await buildV085PrivatePilotInputBinding({
        cwd,
        env: readyEnv(),
        channelKey: "father_jobs"
      });
      const serialized = JSON.stringify(result);

      expect(result.status).toBe("ready_for_fresh_approval");
      expect(result.mode).toBe("private_pilot_input_binding_no_upload");
      expect(result.queueItemIdPresent).toBe(true);
      expect(result.uploadPackageIdPresent).toBe(true);
      expect(result.runtimeReady).toBe(true);
      expect(result.videoAssetReady).toBe(true);
      expect(result.affiliateEvidenceReady).toBe(true);
      expect(result.disclosureEvidenceReady).toBe(true);
      expect(result.duplicateGuardReady).toBe(true);
      expect(result.targetChannelEvidenceReady).toBe(true);
      expect(result.tokenProviderReady).toBe(true);
      expect(result.uploadScopeReady).toBe(true);
      expect(result.nextRequiredEnv).toEqual({
        V084_QUEUE_ITEM_ID: "present",
        V084_UPLOAD_PACKAGE_ID: "present",
        V084_RUNTIME_READY: "ready"
      });
      expect(result.boundV084Env).toMatchObject({
        V084_RUNTIME_READY: "true",
        V084_CHANNEL_KEY: "father_jobs",
        V084_VISIBILITY: "private",
        V084_MAX_ITEMS: "1"
      });
      expect(result.v084Plan.status).toBe("blocked");
      expect(result.v084Plan.blockers).toContain("BLOCKED_V084_FRESH_APPROVAL_REQUIRED");
      expect(result.approvalForwardedToV084Plan).toBe(false);
      expect(result.ambientApprovalStripped).toBe(true);
      expect(result.v084Plan.videosInsertCalled).toBe(false);
      expect(result.v084Plan.commentThreadsInsertCalled).toBe(false);
      expect(result.videosInsertCalled).toBe(false);
      expect(result.commentThreadsInsertCalled).toBe(false);
      expect(result.redactionProof).toEqual({
        rawUrlsPrinted: false,
        rawVideoIdsPrinted: false,
        rawChannelIdsPrinted: false,
        secretsPrinted: false,
        fakeSuccess: false
      });
      expect(serialized).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
      await rm(TOKEN_PATH, { force: true });
    }
  });

  test.each([
    ["affiliate", { selected_affiliate_url: "" }, "BLOCKED_V085_AFFILIATE_EVIDENCE_NOT_READY"],
    ["disclosure", {}, "BLOCKED_V085_DISCLOSURE_EVIDENCE_NOT_READY"]
  ])("blocks when %s evidence is not ready", async (_name, queueOverride, expectedBlocker) => {
    const cwd = await makeCwd();
    try {
      await writeReadyInputs(cwd, {
        queueOverrides: {
          father_jobs: queueOverride
        },
        contentOverrides: {
          father_jobs: queueOverride
        },
        disclosureOverrides: {
          father_jobs: _name === "disclosure"
            ? {
              descriptionDisclosurePresent: false,
              commentDisclosurePresent: false
            }
            : undefined
        }
      });
      await writeTokenFile();

      const result = await buildV085PrivatePilotInputBinding({
        cwd,
        env: readyEnv(),
        channelKey: "father_jobs",
        disclosureOverrides: _name === "disclosure"
          ? {
            father_jobs: {
              descriptionDisclosurePresent: false,
              commentDisclosurePresent: false
            }
          }
          : undefined
      });

      expect(result.status).toBe("blocked");
      expect(result.blockers).toContain(expectedBlocker);
      expect(result.videosInsertCalled).toBe(false);
      expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
      await rm(TOKEN_PATH, { force: true });
    }
  });

  test("blocks when upload package has path/hash evidence but the video file is missing", async () => {
    const cwd = await makeCwd();
    try {
      await writeReadyInputs(cwd, {
        skipVideo: "father_jobs"
      });
      await writeTokenFile();

      const result = await buildV085PrivatePilotInputBinding({
        cwd,
        env: readyEnv(),
        channelKey: "father_jobs"
      });

      expect(result.status).toBe("blocked");
      expect(result.videoAssetReady).toBe(false);
      expect(result.videoAssetFileExists).toBe(false);
      expect(result.videoAssetFileReadable).toBe(false);
      expect(result.blockers).toEqual(expect.arrayContaining([
        "BLOCKED_V085_VIDEO_ASSET_FILE_NOT_FOUND",
        "BLOCKED_V085_VIDEO_ASSET_EVIDENCE_INCOMPLETE",
        "BLOCKED_V085_RUNTIME_READY_MISSING"
      ]));
      expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
      expect(JSON.stringify(result)).not.toContain("corrected-preview-v057.mp4");
    } finally {
      await rm(cwd, { recursive: true, force: true });
      await rm(TOKEN_PATH, { force: true });
    }
  });

  test("blocks when upload package video evidence points at an unreadable file target", async () => {
    const cwd = await makeCwd();
    try {
      await writeReadyInputs(cwd, {
        videoAsDirectory: "father_jobs"
      });
      await writeTokenFile();

      const result = await buildV085PrivatePilotInputBinding({
        cwd,
        env: readyEnv(),
        channelKey: "father_jobs"
      });

      expect(result.status).toBe("blocked");
      expect(result.videoAssetReady).toBe(false);
      expect(result.videoAssetFileExists).toBe(true);
      expect(result.videoAssetFileReadable).toBe(false);
      expect(result.blockers).toEqual(expect.arrayContaining([
        "BLOCKED_V085_VIDEO_ASSET_FILE_UNREADABLE",
        "BLOCKED_V085_VIDEO_ASSET_EVIDENCE_INCOMPLETE",
        "BLOCKED_V085_RUNTIME_READY_MISSING"
      ]));
      expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
      expect(JSON.stringify(result)).not.toContain("corrected-preview-v057.mp4");
    } finally {
      await rm(cwd, { recursive: true, force: true });
      await rm(TOKEN_PATH, { force: true });
    }
  });

  test("does not fall back to another channel package when requested channel package is missing", async () => {
    const cwd = await makeCwd();
    try {
      await writeReadyInputs(cwd, {
        skipSource: "father_jobs"
      });
      await writeTokenFile();

      const result = await buildV085PrivatePilotInputBinding({
        cwd,
        env: readyEnv(),
        channelKey: "father_jobs"
      });

      expect(result.status).toBe("blocked");
      expect(result.selectedChannelPackagePresent).toBe(false);
      expect(result.channelPackageMatchesRequest).toBe(false);
      expect(result.boundV084Env.V084_CHANNEL_KEY).toBe("father_jobs");
      expect(result.queueItemIdPresent).toBe(false);
      expect(result.uploadPackageIdPresent).toBe(false);
      expect(result.blockers).toEqual(expect.arrayContaining([
        "BLOCKED_V085_SELECTED_CHANNEL_PACKAGE_MISSING",
        "BLOCKED_V085_CHANNEL_PACKAGE_MISMATCH"
      ]));
      expect(result.status).not.toBe("ready_for_fresh_approval");
      expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
      await rm(TOKEN_PATH, { force: true });
    }
  });

  test("strips ambient V084 approval before nested plan", async () => {
    const cwd = await makeCwd();
    try {
      await writeReadyInputs(cwd);
      await writeTokenFile();

      const result = await buildV085PrivatePilotInputBinding({
        cwd,
        env: {
          ...readyEnv(),
          V084_PRIVATE_UPLOAD_APPROVAL_PHRASE: "APPROVE_YOUTUBE_PRIVATE_UPLOAD_PILOT_1_ITEM_NO_COMMENT"
        },
        channelKey: "father_jobs"
      });

      expect(result.status).toBe("ready_for_fresh_approval");
      expect(result.approvalForwardedToV084Plan).toBe(false);
      expect(result.ambientApprovalStripped).toBe(true);
      expect(result.v084Plan.approvalAccepted).toBe(false);
      expect(result.v084Plan.blockers).toContain("BLOCKED_V084_FRESH_APPROVAL_REQUIRED");
      expect(result.v084Plan.status).toBe("blocked");
      expect(result.v084Plan.videosInsertCalled).toBe(false);
      expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
      await rm(TOKEN_PATH, { force: true });
    }
  });

  test("blocks when token provider or upload scope is not ready", async () => {
    const cwd = await makeCwd();
    try {
      await writeReadyInputs(cwd);
      await writeTokenFile({ scopes: ["https://www.googleapis.com/auth/youtube.readonly"] });

      const result = await buildV085PrivatePilotInputBinding({
        cwd,
        env: readyEnv(),
        channelKey: "father_jobs"
      });

      expect(result.status).toBe("blocked");
      expect(result.tokenProviderReady).toBe(true);
      expect(result.uploadScopeReady).toBe(false);
      expect(result.blockers).toContain("BLOCKED_V085_UPLOAD_SCOPE_NOT_READY");
      expect(result.blockers).toContain("BLOCKED_V085_RUNTIME_READY_MISSING");
      expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
      await rm(TOKEN_PATH, { force: true });
    }
  });

  test("package script prints sanitized no-upload input binding report", async () => {
    const cwd = await makeCwd();
    try {
      await writeReadyInputs(cwd);
      await writeTokenFile();
      const npmCli = process.env.npm_execpath;
      expect(npmCli).toBeTruthy();

      const output = execFileSync(process.execPath, [
        npmCli as string,
        "run",
        "upload:v085:private-pilot:bind-inputs",
        "--silent"
      ], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          ...readyEnv(),
          V085_CWD: cwd
        }
      });
      const parsed = JSON.parse(output);

      expect(parsed.status).toBe("ready_for_fresh_approval");
      expect(parsed.mode).toBe("private_pilot_input_binding_no_upload");
      expect(parsed.videosInsertCalled).toBe(false);
      expect(parsed.commentThreadsInsertCalled).toBe(false);
      expect(output).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
      await rm(TOKEN_PATH, { force: true });
    }
  });

  test("package script loads readiness env from V085_CWD .env.local", async () => {
    const cwd = await makeCwd();
    try {
      await writeReadyInputs(cwd);
      await writeTokenFile();
      await writeEnvLocal(cwd, readyEnv());
      const npmCli = process.env.npm_execpath;
      expect(npmCli).toBeTruthy();

      const output = execFileSync(process.execPath, [
        npmCli as string,
        "run",
        "upload:v085:private-pilot:bind-inputs",
        "--silent"
      ], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          V085_CWD: cwd,
          V084_CHANNEL_KEY: "father_jobs"
        }
      });
      const parsed = JSON.parse(output);

      expect(parsed.status).toBe("ready_for_fresh_approval");
      expect(parsed.targetChannelEvidenceReady).toBe(true);
      expect(parsed.quotaReady).toBe(true);
      expect(parsed.videosInsertCalled).toBe(false);
      expect(parsed.commentThreadsInsertCalled).toBe(false);
      expect(output).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
      await rm(TOKEN_PATH, { force: true });
    }
  });
});

async function makeCwd() {
  return mkdtemp(path.join(os.tmpdir(), "commerce-v085-"));
}

async function writeReadyInputs(cwd: string, options: {
  queueOverrides?: Partial<Record<ChannelKey, Record<string, unknown>>>;
  contentOverrides?: Partial<Record<ChannelKey, Record<string, unknown>>>;
  skipSource?: ChannelKey;
  skipVideo?: ChannelKey;
  videoAsDirectory?: ChannelKey;
  disclosureOverrides?: Partial<Record<ChannelKey, {
    descriptionDisclosurePresent?: boolean;
    commentDisclosurePresent?: boolean;
  } | undefined>>;
} = {}) {
  for (const channelKey of CHANNEL_KEYS) {
    const channelDir = path.join(cwd, "commerce-assets", "review", "v057", channelKey);
    await mkdir(channelDir, { recursive: true });
    if (options.videoAsDirectory === channelKey) {
      await mkdir(path.join(channelDir, "corrected-preview-v057.mp4"));
    } else if (options.skipVideo !== channelKey) {
      await writeFile(path.join(channelDir, "corrected-preview-v057.mp4"), `fake-v085-${channelKey}-mp4`, "utf8");
    }
    await writeFile(path.join(channelDir, "first-frame-v057.jpg"), `fake-v085-${channelKey}-jpg`, "utf8");
  }

  await mkdir(path.join(cwd, "data"), { recursive: true });
  const sourceChannels = CHANNEL_KEYS.filter((channelKey) => channelKey !== options.skipSource);
  await writeFile(path.join(cwd, "data", "queue.json"), `${JSON.stringify(sourceChannels.map((channelKey, index) => ({
    id: `queue-v085-${channelKey}`,
    channelKey,
    assetProfile: V057_REUPLOAD_ASSET_PROFILE,
    product_name: V057_CORRECTED_REUPLOAD_EXPECTED_PRODUCTS[channelKey],
    raw_coupang_url: RAW_COUPANG_URLS[channelKey],
    selected_affiliate_url: AFFILIATE_URLS[channelKey],
    updated_at: "2026-07-05T00:00:00.000Z",
    priority: index + 1,
    ...options.queueOverrides?.[channelKey]
  })), null, 2)}\n`, "utf8");
  await writeFile(path.join(cwd, "data", "contents.json"), `${JSON.stringify(sourceChannels.map((channelKey) => ({
    id: `content-v085-${channelKey}`,
    product_queue_id: `queue-v085-${channelKey}`,
    channelKey,
    assetProfile: V057_REUPLOAD_ASSET_PROFILE,
    product_name: V057_CORRECTED_REUPLOAD_EXPECTED_PRODUCTS[channelKey],
    raw_coupang_url: RAW_COUPANG_URLS[channelKey],
    selected_affiliate_url: AFFILIATE_URLS[channelKey],
    title: `v085 title ${channelKey}`,
    description: `v085 description ${channelKey}`,
    updated_at: "2026-07-05T00:00:00.000Z",
    ...options.contentOverrides?.[channelKey]
  })), null, 2)}\n`, "utf8");
}

async function writeTokenFile(options: { scopes?: string[] } = {}) {
  await writeFile(TOKEN_PATH, `${JSON.stringify({
    access_token: "access-token-v085",
    refresh_token: "refresh-token-v085",
    scopes: options.scopes ?? ["https://www.googleapis.com/auth/youtube.upload"]
  }, null, 2)}\n`, "utf8");
}

async function writeEnvLocal(cwd: string, env: NodeJS.ProcessEnv) {
  await writeFile(
    path.join(cwd, ".env.local"),
    Object.entries(env)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n") + "\n",
    "utf8"
  );
}

function readyEnv(): NodeJS.ProcessEnv {
  return {
    V051_UPLOAD_ASSET_PROFILE: V057_REUPLOAD_ASSET_PROFILE,
    YOUTUBE_FATHER_JOBS_CHANNEL_ID: TARGET_CHANNEL_IDS.father_jobs,
    YOUTUBE_NEOMAN_MOLEULGEOL_CHANNEL_ID: TARGET_CHANNEL_IDS.neoman_moleulgeol,
    YOUTUBE_LETS_BUY_CHANNEL_ID: TARGET_CHANNEL_IDS.lets_buy,
    YOUTUBE_CLIENT_ID: "client-id-present",
    YOUTUBE_CLIENT_SECRET: "client-secret-present",
    YOUTUBE_TOKEN_PROVIDER_MODE: "local_file",
    YOUTUBE_LOCAL_TOKEN_FILE_PATH: TOKEN_PATH,
    YOUTUBE_QUOTA_READY: "true"
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
