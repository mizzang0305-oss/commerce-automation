import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { type ChannelKey } from "../src/uploads/multi-channel/channelProfiles";
import { V057_CORRECTED_REUPLOAD_EXPECTED_PRODUCTS } from "../src/uploads/multi-channel/v057CorrectedReuploadProductSource";
import { V057_REUPLOAD_ASSET_PROFILE } from "../src/uploads/multi-channel/v057ReuploadAssetBinding";
import {
  buildV087AuthoritativeProductSourceBinding
} from "../src/uploads/youtube/v087AuthoritativeProductSourceBinding";

const CHANNEL: ChannelKey = "father_jobs";
const RAW_COUPANG_URL = ["https://www.coupang.com", "vp", "products", "987000001"].join("/");
const AFFILIATE_URL = ["https://link.coupang.com", "a", "v087-father"].join("/");
const TARGET_CHANNEL_ID = `UC${"7".repeat(22)}`;
const TOKEN_PATH = path.join(os.tmpdir(), "commerce-v087-youtube-token.json");
const FORBIDDEN_PATTERN = new RegExp([
  RAW_COUPANG_URL,
  AFFILIATE_URL,
  TARGET_CHANNEL_ID,
  TOKEN_PATH,
  "access-token-v087",
  "refresh-token-v087",
  "client_secret",
  "Authorization",
  "Bearer",
  "HmacSHA256",
  "signature="
].map(escapeRegExp).join("|"), "i");
const DISCLOSURE_TEXT = "\uC774 \uD3EC\uC2A4\uD305\uC740 \uCFE0\uD321 \uD30C\uD2B8\uB108\uC2A4 \uD65C\uB3D9\uC758 \uC77C\uD658\uC73C\uB85C, \uC774\uC5D0 \uB530\uB978 \uC77C\uC815\uC561\uC758 \uC218\uC218\uB8CC\uB97C \uC81C\uACF5\uBC1B\uC2B5\uB2C8\uB2E4.";

describe("v087 authoritative v057 product source binding", () => {
  test("blocks when manifest path is missing", async () => {
    const cwd = await makeCwd();
    try {
      const result = await buildV087AuthoritativeProductSourceBinding({
        cwd,
        env: {}
      });

      expect(result.status).toBe("blocked");
      expect(result.blockers).toContain("BLOCKED_V087_PRODUCT_SOURCE_MANIFEST_MISSING");
      expect(result.v084ExecuteCalled).toBe(false);
      expect(result.videosInsertCalled).toBe(false);
      expect(result.commentThreadsInsertCalled).toBe(false);
      expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test.each([
    ["productSourceId", "BLOCKED_V087_PRODUCT_SOURCE_ID_MISSING"],
    ["queueItemId", "BLOCKED_V087_QUEUE_ITEM_ID_MISSING"],
    ["uploadPackageId", "BLOCKED_V087_UPLOAD_PACKAGE_ID_MISSING"],
    ["channelKey", "BLOCKED_V087_CHANNEL_KEY_MISSING"],
    ["rawCoupangUrl", "BLOCKED_V087_RAW_COUPANG_URL_MISSING"],
    ["selectedAffiliateUrl", "BLOCKED_V087_AFFILIATE_URL_MISSING"],
    ["coupangPartnersDisclosureText", "BLOCKED_V087_DISCLOSURE_MISSING"],
    ["duplicateGuardKey", "BLOCKED_V087_DUPLICATE_GUARD_KEY_MISSING"],
    ["targetChannelKey", "BLOCKED_V087_TARGET_CHANNEL_KEY_MISSING"]
  ])("blocks when %s is missing", async (field, blocker) => {
    const cwd = await makeCwd();
    try {
      const manifestPath = await writeManifest(cwd, {
        [field]: ""
      });

      const result = await buildV087AuthoritativeProductSourceBinding({
        cwd,
        env: readyEnv(manifestPath)
      });

      expect(result.status).toBe("blocked");
      expect(result.blockers).toContain(blocker);
      expect(result.v084ExecuteCalled).toBe(false);
      expect(result.videosInsertCalled).toBe(false);
      expect(result.commentThreadsInsertCalled).toBe(false);
      expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
      await rm(TOKEN_PATH, { force: true });
    }
  });

  test("blocks when video asset file is missing", async () => {
    const cwd = await makeCwd();
    try {
      const manifestPath = await writeManifest(cwd, {}, { skipVideo: true });

      const result = await buildV087AuthoritativeProductSourceBinding({
        cwd,
        env: readyEnv(manifestPath)
      });

      expect(result.status).toBe("blocked");
      expect(result.blockers).toContain("BLOCKED_V087_VIDEO_ASSET_FILE_NOT_FOUND");
      expect(result.videoAssetEvidence.fileExists).toBe(false);
      expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
      await rm(TOKEN_PATH, { force: true });
    }
  });

  test("blocks when canonical first-frame file is missing", async () => {
    const cwd = await makeCwd();
    try {
      const manifestPath = await writeManifest(cwd, {}, { skipFirstFrame: true });

      const result = await buildV087AuthoritativeProductSourceBinding({
        cwd,
        env: readyEnv(manifestPath)
      });

      expect(result.status).toBe("blocked");
      expect(result.blockers).toContain("BLOCKED_V087_CANONICAL_FIRST_FRAME_FILE_NOT_FOUND");
      expect(result.blockers).toContain("BLOCKED_V087_FIRST_FRAME_EVIDENCE_INCOMPLETE");
      expect(result.firstFrameEvidence.fileExists).toBe(false);
      expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
      await rm(TOKEN_PATH, { force: true });
    }
  });

  test("blocks when firstFramePath points to a readable non-canonical file", async () => {
    const cwd = await makeCwd();
    try {
      const externalFirstFrame = path.join(cwd, "alternate-first-frame.jpg");
      await writeFile(externalFirstFrame, "readable-but-not-canonical", "utf8");
      const manifestPath = await writeManifest(cwd, {
        firstFramePath: externalFirstFrame
      });

      const result = await buildV087AuthoritativeProductSourceBinding({
        cwd,
        env: readyEnv(manifestPath)
      });
      const serialized = JSON.stringify(result);

      expect(result.status).toBe("blocked");
      expect(result.blockers).toContain("BLOCKED_V087_CANONICAL_FIRST_FRAME_PATH_MISMATCH");
      expect(result.blockers).toContain("BLOCKED_V087_FIRST_FRAME_EVIDENCE_INCOMPLETE");
      expect(result.firstFrameEvidence.canonicalPathMatches).toBe(false);
      expect(result.firstFrameEvidence.fileExists).toBe(true);
      expect(result.firstFrameEvidence.fileReadable).toBe(true);
      expect(serialized).not.toContain(externalFirstFrame);
      expect(serialized).not.toMatch(FORBIDDEN_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
      await rm(TOKEN_PATH, { force: true });
    }
  });

  test("blocks when canonical first-frame target is unreadable", async () => {
    const cwd = await makeCwd();
    try {
      const manifestPath = await writeManifest(cwd, {}, { firstFrameAsDirectory: true });

      const result = await buildV087AuthoritativeProductSourceBinding({
        cwd,
        env: readyEnv(manifestPath)
      });

      expect(result.status).toBe("blocked");
      expect(result.blockers).toContain("BLOCKED_V087_CANONICAL_FIRST_FRAME_FILE_UNREADABLE");
      expect(result.blockers).toContain("BLOCKED_V087_FIRST_FRAME_EVIDENCE_INCOMPLETE");
      expect(result.firstFrameEvidence.canonicalPathMatches).toBe(true);
      expect(result.firstFrameEvidence.fileExists).toBe(true);
      expect(result.firstFrameEvidence.fileReadable).toBe(false);
      expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
      await rm(TOKEN_PATH, { force: true });
    }
  });

  test("valid manifest writes local product source and produces V085 binder-ready evidence without execution", async () => {
    const cwd = await makeCwd();
    try {
      const manifestPath = await writeManifest(cwd);
      await writeTokenFile();

      const result = await buildV087AuthoritativeProductSourceBinding({
        cwd,
        env: readyEnv(manifestPath)
      });
      const serialized = JSON.stringify(result);

      expect(result.status).toBe("ready_for_fresh_approval");
      expect(result.productSourceBindingReady).toBe(true);
      expect(result.queueItemBindingReady).toBe(true);
      expect(result.uploadPackageBindingReady).toBe(true);
      expect(result.channelBindingReady).toBe(true);
      expect(result.affiliateEvidenceReady).toBe(true);
      expect(result.disclosureEvidenceReady).toBe(true);
      expect(result.duplicateGuardReady).toBe(true);
      expect(result.targetChannelEvidenceReady).toBe(true);
      expect(result.v085Binder.status).toBe("ready_for_fresh_approval");
      expect(result.v085Binder.runtimeReady).toBe(true);
      expect(result.v085Binder.approvalForwardedToV084Plan).toBe(false);
      expect(result.v085Binder.ambientApprovalStripped).toBe(true);
      expect(result.v085Binder.v084FreshApprovalRequired).toBe(true);
      expect(result.v084ExecuteCalled).toBe(false);
      expect(result.videosInsertCalled).toBe(false);
      expect(result.commentThreadsInsertCalled).toBe(false);
      expect(result.fake_success).toBe(false);
      expect(serialized).not.toMatch(FORBIDDEN_PATTERN);
      expect(serialized).not.toContain("corrected-preview-v057.mp4");
      expect(serialized).not.toContain("first-frame-v057.jpg");
    } finally {
      await rm(cwd, { recursive: true, force: true });
      await rm(TOKEN_PATH, { force: true });
    }
  });

  test("package script prints sanitized binding report and never executes V084", async () => {
    const cwd = await makeCwd();
    try {
      const manifestPath = await writeManifest(cwd);
      await writeTokenFile();
      const npmCli = process.env.npm_execpath;

      expect(npmCli).toBeTruthy();

      const output = execFileSync(process.execPath, [
        npmCli as string,
        "run",
        "upload:v087:bind-product-source",
        "--silent"
      ], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          ...readyEnv(manifestPath),
          V087_CWD: cwd,
          V084_PRIVATE_UPLOAD_APPROVAL_PHRASE: "APPROVE_YOUTUBE_PRIVATE_UPLOAD_PILOT_1_ITEM_NO_COMMENT"
        }
      });
      const parsed = JSON.parse(output);

      expect(parsed.status).toBe("ready_for_fresh_approval");
      expect(parsed.v085Binder.ambientApprovalStripped).toBe(true);
      expect(parsed.v084ExecuteCalled).toBe(false);
      expect(parsed.videosInsertCalled).toBe(false);
      expect(parsed.commentThreadsInsertCalled).toBe(false);
      expect(output).not.toMatch(FORBIDDEN_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
      await rm(TOKEN_PATH, { force: true });
    }
  });

  test("TASK.md records V087 PR-open blocker and keeps upload surfaces blocked", async () => {
    const task = await import("node:fs/promises").then((fs) => fs.readFile("TASK.md", "utf8"));

    expect(task).toContain("### T016 - V087 Authoritative V057 Product Source Binding");
    expect(task).toMatch(/### T016 - V087 Authoritative V057 Product Source Binding[\s\S]*Status: `(PR_OPEN|DONE)`/);
    expect(task).toMatch(
      /Current blocker: `(PR_OPEN_T016_V087_AUTHORITATIVE_PRODUCT_SOURCE_BINDING_REVIEW|V088_RUN_V087_AND_V085_BINDERS_ON_MAIN_NO_UPLOAD|V089_PRIVATE_UPLOAD_PILOT_1_ITEM_EXECUTION_WAITING_FOR_FRESH_APPROVAL|PR_OPEN_T018_V090_UNLOCK_V084_PRIVATE_EXECUTE_GATE_NO_UPLOAD_REVIEW|PR_OPEN_T019_V091_UNLOCK_V083_REAL_PRIVATE_ADAPTER_EXECUTION_NO_UPLOAD_REVIEW)`/
    );
    expect(task).toContain("PRIVATE_UPLOAD_PILOT_EXECUTION=BLOCKED_FRESH_APPROVAL_REQUIRED");
    expect(task).toContain("SAFE_TO_UPLOAD=false");
    expect(task).toContain("SAFE_TO_PUBLIC_UPLOAD=false");
  });
});

async function makeCwd() {
  return mkdtemp(path.join(os.tmpdir(), "commerce-v087-"));
}

async function writeManifest(
  cwd: string,
  overrides: Record<string, unknown> = {},
  options: { skipVideo?: boolean; skipFirstFrame?: boolean; firstFrameAsDirectory?: boolean } = {}
) {
  const reviewDir = path.join(cwd, "commerce-assets", "review", "v057", CHANNEL);
  await mkdir(reviewDir, { recursive: true });
  const videoPath = path.join(reviewDir, "corrected-preview-v057.mp4");
  const firstFramePath = path.join(reviewDir, "first-frame-v057.jpg");
  if (!options.skipVideo) await writeFile(videoPath, "fake-v087-mp4", "utf8");
  if (options.firstFrameAsDirectory) {
    await mkdir(firstFramePath, { recursive: true });
  } else if (!options.skipFirstFrame) {
    await writeFile(firstFramePath, "fake-v087-jpg", "utf8");
  }
  const manifestPath = path.join(cwd, "local-v087-product-source-manifest.json");
  await writeFile(manifestPath, `${JSON.stringify({
    sourceVersion: "v087-test",
    productSourceId: `source-v087-${CHANNEL}`,
    queueItemId: `queue-v087-${CHANNEL}`,
    uploadPackageId: `pkg-v087-${CHANNEL}`,
    channelKey: CHANNEL,
    productName: V057_CORRECTED_REUPLOAD_EXPECTED_PRODUCTS[CHANNEL],
    rawCoupangUrl: RAW_COUPANG_URL,
    selectedAffiliateUrl: AFFILIATE_URL,
    coupangPartnersDisclosureText: DISCLOSURE_TEXT,
    videoAssetPath: videoPath,
    firstFramePath,
    duplicateGuardKey: `dup-v087-${CHANNEL}`,
    targetChannelKey: CHANNEL,
    ...overrides
  }, null, 2)}\n`, "utf8");
  return manifestPath;
}

async function writeTokenFile() {
  await writeFile(TOKEN_PATH, `${JSON.stringify({
    access_token: "access-token-v087",
    refresh_token: "refresh-token-v087",
    scopes: ["https://www.googleapis.com/auth/youtube.upload"]
  }, null, 2)}\n`, "utf8");
}

function readyEnv(manifestPath: string): NodeJS.ProcessEnv {
  return {
    V087_PRODUCT_SOURCE_MANIFEST_PATH: manifestPath,
    V051_UPLOAD_ASSET_PROFILE: V057_REUPLOAD_ASSET_PROFILE,
    V084_CHANNEL_KEY: CHANNEL,
    YOUTUBE_FATHER_JOBS_CHANNEL_ID: TARGET_CHANNEL_ID,
    YOUTUBE_NEOMAN_MOLEULGEOL_CHANNEL_ID: `UC${"8".repeat(22)}`,
    YOUTUBE_LETS_BUY_CHANNEL_ID: `UC${"9".repeat(22)}`,
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
