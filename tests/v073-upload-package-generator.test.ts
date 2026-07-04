import crypto from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { CHANNEL_KEYS, type ChannelKey } from "../src/uploads/multi-channel/channelProfiles";
import { V057_CORRECTED_REUPLOAD_EXPECTED_PRODUCTS } from "../src/uploads/multi-channel/v057CorrectedReuploadProductSource";
import { V057_REUPLOAD_ASSET_PROFILE } from "../src/uploads/multi-channel/v057ReuploadAssetBinding";
import {
  generateV073UploadPackages,
  writeV073UploadPackageArtifacts
} from "../src/uploads/multi-channel/v073UploadPackageGenerator";

const RAW_COUPANG_URLS: Record<ChannelKey, string> = {
  father_jobs: ["https://www.coupang.com", "vp", "products", "873000001"].join("/"),
  neoman_moleulgeol: ["https://www.coupang.com", "vp", "products", "873000002"].join("/"),
  lets_buy: ["https://www.coupang.com", "vp", "products", "873000003"].join("/")
};

const AFFILIATE_URLS: Record<ChannelKey, string> = {
  father_jobs: ["https://link.coupang.com", "a", "v073-father"].join("/"),
  neoman_moleulgeol: ["https://link.coupang.com", "a", "v073-neoman"].join("/"),
  lets_buy: ["https://link.coupang.com", "a", "v073-lets"].join("/")
};

const TARGET_CHANNEL_IDS: Record<ChannelKey, string> = {
  father_jobs: `UC${"J".repeat(22)}`,
  neoman_moleulgeol: `UC${"K".repeat(22)}`,
  lets_buy: `UC${"L".repeat(22)}`
};

const TARGET_CHANNEL_ENV = {
  YOUTUBE_FATHER_JOBS_CHANNEL_ID: TARGET_CHANNEL_IDS.father_jobs,
  YOUTUBE_NEOMAN_MOLEULGEOL_CHANNEL_ID: TARGET_CHANNEL_IDS.neoman_moleulgeol,
  YOUTUBE_LETS_BUY_CHANNEL_ID: TARGET_CHANNEL_IDS.lets_buy
};

const FORBIDDEN_REPORT_PATTERN = new RegExp([
  "873000001",
  "873000002",
  "873000003",
  "v073-father",
  "v073-neoman",
  "v073-lets",
  ...Object.values(TARGET_CHANNEL_IDS),
  "Authorization",
  "HmacSHA256",
  "signature="
].map(escapeRegExp).join("|"), "i");

async function makeCwd() {
  return mkdtemp(path.join(os.tmpdir(), "commerce-v073-"));
}

async function writeV057Assets(cwd: string, options: {
  skipVideo?: ChannelKey;
  skipFirstFrame?: ChannelKey;
} = {}) {
  for (const channelKey of CHANNEL_KEYS) {
    const channelDir = path.join(cwd, "commerce-assets", "review", "v057", channelKey);
    await mkdir(channelDir, { recursive: true });
    if (options.skipVideo !== channelKey) {
      await writeFile(path.join(channelDir, "corrected-preview-v057.mp4"), `fake-v073-${channelKey}-mp4`, "utf8");
    }
    if (options.skipFirstFrame !== channelKey) {
      await writeFile(path.join(channelDir, "first-frame-v057.jpg"), `fake-v073-${channelKey}-jpg`, "utf8");
    }
  }
}

async function writeQueue(cwd: string, rows: Array<Record<string, unknown>>) {
  await mkdir(path.join(cwd, "data"), { recursive: true });
  await writeFile(path.join(cwd, "data", "queue.json"), `${JSON.stringify(rows, null, 2)}\n`, "utf8");
}

async function writeGeneratedContents(cwd: string, rows: Array<Record<string, unknown>>) {
  await mkdir(path.join(cwd, "data"), { recursive: true });
  await writeFile(path.join(cwd, "data", "contents.json"), `${JSON.stringify(rows, null, 2)}\n`, "utf8");
}

async function writeReviewPackageSources(cwd: string) {
  for (const channelKey of CHANNEL_KEYS) {
    const channelDir = path.join(cwd, "commerce-assets", "review", "v057", channelKey);
    await mkdir(channelDir, { recursive: true });
    await writeFile(path.join(channelDir, "product-source-v057.json"), JSON.stringify({
      packageId: `review-v073-${channelKey}`,
      sourceQueueItemId: `queue-v073-${channelKey}`,
      sourceGeneratedContentId: `content-v073-${channelKey}`,
      channelKey,
      assetProfile: V057_REUPLOAD_ASSET_PROFILE,
      productSourceKind: "v057_review_package_metadata",
      rawCoupangUrl: RAW_COUPANG_URLS[channelKey],
      productName: V057_CORRECTED_REUPLOAD_EXPECTED_PRODUCTS[channelKey],
      selectedAffiliateUrl: AFFILIATE_URLS[channelKey],
      sourceEvidenceHash: hash(`${channelKey}:${RAW_COUPANG_URLS[channelKey]}`),
      boundAt: "2026-07-04T00:00:00.000Z",
      runtimeSourceApproved: true,
      rawUrlsRedactedInReport: true
    }, null, 2), "utf8");
  }
}

function queueRows(overrides: Partial<Record<ChannelKey, Record<string, unknown>>> = {}) {
  return CHANNEL_KEYS.map((channelKey, index) => ({
    id: `queue-v073-${channelKey}`,
    channelKey,
    assetProfile: V057_REUPLOAD_ASSET_PROFILE,
    product_name: V057_CORRECTED_REUPLOAD_EXPECTED_PRODUCTS[channelKey],
    raw_coupang_url: RAW_COUPANG_URLS[channelKey],
    selected_affiliate_url: AFFILIATE_URLS[channelKey],
    updated_at: "2026-07-04T00:00:00.000Z",
    priority: index + 1,
    ...overrides[channelKey]
  }));
}

function generatedContentRows(overrides: Partial<Record<ChannelKey, Record<string, unknown>>> = {}) {
  return CHANNEL_KEYS.map((channelKey) => ({
    id: `content-v073-${channelKey}`,
    product_queue_id: `queue-v073-${channelKey}`,
    channelKey,
    assetProfile: V057_REUPLOAD_ASSET_PROFILE,
    product_name: V057_CORRECTED_REUPLOAD_EXPECTED_PRODUCTS[channelKey],
    raw_coupang_url: RAW_COUPANG_URLS[channelKey],
    selected_affiliate_url: AFFILIATE_URLS[channelKey],
    title: `v073 title ${channelKey}`,
    description: `v073 description ${channelKey}`,
    updated_at: "2026-07-04T00:00:00.000Z",
    ...overrides[channelKey]
  }));
}

async function writeReadyQueueAndContentInputs(cwd: string) {
  await writeV057Assets(cwd);
  await writeQueue(cwd, queueRows());
  await writeGeneratedContents(cwd, generatedContentRows());
}

describe("v073 upload package generator", () => {
  test("generates UploadPackages from ProductQueueItem and GeneratedContent pairs without upload side effects", async () => {
    const cwd = await makeCwd();
    try {
      await writeReadyQueueAndContentInputs(cwd);

      const result = await generateV073UploadPackages({
        cwd,
        env: TARGET_CHANNEL_ENV,
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE,
        now: "2026-07-04T00:00:00.000Z"
      });
      const reportText = JSON.stringify(result.report);

      expect(result.report.FINAL_STATUS).toBe("SUCCESS_V073_UPLOAD_PACKAGES_GENERATED_NO_UPLOAD");
      expect(result.report.upload_package_generator_ready).toBe(true);
      expect(result.report.upload_package_count).toBe(3);
      expect(result.report.safeToUpload).toBe(false);
      expect(result.packages.map((item) => item.channelKey)).toEqual(CHANNEL_KEYS);
      expect(result.packages.every((item) => item.productSource.sourceKind === "product_queue_item_generated_content_pair")).toBe(true);
      expect(result.packages.every((item) => item.productSource.rawCoupangUrl)).toBe(true);
      expect(result.packages.every((item) => item.deeplink.source === "deeplink")).toBe(true);
      expect(result.packages.every((item) => item.deeplink.selectedAffiliateUrl)).toBe(true);
      expect(result.packages.every((item) => item.youtubeAdvancedSettings.privacyStatus === "public")).toBe(true);
      expect(result.packages.every((item) => item.youtubeAdvancedSettings.containsSyntheticMedia === true)).toBe(true);
      expect(result.packages.every((item) => item.youtubeAdvancedSettings.paidProductPlacementDetails.hasPaidProductPlacement === true)).toBe(true);
      expect(result.packages.every((item) => item.commentPackage.coupangPartnersDisclosurePresent === true)).toBe(true);
      expect(result.packages.every((item) => item.targetChannel.formatValid === true)).toBe(true);
      expect(result.packages.every((item) => item.approvalGate.freshApprovalRequired === true)).toBe(true);
      expect(result.report.packages.every((item) => item.rawCoupangUrlPrinted === false)).toBe(true);
      expect(result.report.packages.every((item) => item.affiliateUrlPrinted === false)).toBe(true);
      expect(result.report.packages.every((item) => item.targetChannelReady === true)).toBe(true);
      expect(result.report.uploadExecutionCalled).toBe(false);
      expect(result.report.videos_insert_called).toBe(false);
      expect(result.report.comment_create_update_delete_called).toBe(false);
      expect(reportText).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("generates UploadPackages from ReviewPackageProductSourceManifest when queue and generated content are absent", async () => {
    const cwd = await makeCwd();
    try {
      await writeV057Assets(cwd);
      await writeReviewPackageSources(cwd);

      const result = await generateV073UploadPackages({
        cwd,
        env: TARGET_CHANNEL_ENV,
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE,
        now: "2026-07-04T00:00:00.000Z"
      });

      expect(result.report.FINAL_STATUS).toBe("SUCCESS_V073_UPLOAD_PACKAGES_GENERATED_NO_UPLOAD");
      expect(result.packages.every((item) => item.productSource.sourceKind === "v057_review_package_metadata")).toBe(true);
      expect(result.report.packages.every((item) => item.productSourceKind === "v057_review_package_metadata")).toBe(true);
      expect(JSON.stringify(result.report)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("blocks missing product source and raw Coupang URL without requesting manual URL input", async () => {
    const missingSource = await makeCwd();
    const missingRaw = await makeCwd();
    try {
      await writeV057Assets(missingSource);
      await writeV057Assets(missingRaw);
      await writeQueue(missingRaw, queueRows({
        father_jobs: { raw_coupang_url: "" }
      }));
      await writeGeneratedContents(missingRaw, generatedContentRows({
        father_jobs: { raw_coupang_url: "" }
      }));

      await expect(generateV073UploadPackages({
        cwd: missingSource,
        env: TARGET_CHANNEL_ENV,
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE
      })).resolves.toMatchObject({
        report: {
          FINAL_STATUS: "BLOCKED_V073_UPLOAD_PACKAGE_NOT_READY",
          blocker: "BLOCKED_V073_UPLOAD_PACKAGE_PRODUCT_SOURCE_MISSING",
          manualAffiliateUrlInputRequired: false,
          manualRawCoupangUrlInputRequired: false,
          raw_urls_printed: false
        }
      });

      await expect(generateV073UploadPackages({
        cwd: missingRaw,
        env: TARGET_CHANNEL_ENV,
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE
      })).resolves.toMatchObject({
        report: {
          FINAL_STATUS: "BLOCKED_V073_UPLOAD_PACKAGE_NOT_READY",
          blocker: "BLOCKED_V073_UPLOAD_PACKAGE_RAW_COUPANG_URL_MISSING",
          manualAffiliateUrlInputRequired: false,
          manualRawCoupangUrlInputRequired: false
        }
      });
    } finally {
      await rm(missingSource, { recursive: true, force: true });
      await rm(missingRaw, { recursive: true, force: true });
    }
  });

  test("blocks missing video asset, first frame, disclosure, and target channel", async () => {
    const missingVideo = await makeCwd();
    const missingFrame = await makeCwd();
    const missingDisclosure = await makeCwd();
    const missingTarget = await makeCwd();
    try {
      await writeV057Assets(missingVideo, { skipVideo: "father_jobs" });
      await writeQueue(missingVideo, queueRows());
      await writeGeneratedContents(missingVideo, generatedContentRows());
      await writeV057Assets(missingFrame, { skipFirstFrame: "father_jobs" });
      await writeQueue(missingFrame, queueRows());
      await writeGeneratedContents(missingFrame, generatedContentRows());
      await writeReadyQueueAndContentInputs(missingDisclosure);
      await writeReadyQueueAndContentInputs(missingTarget);

      await expect(generateV073UploadPackages({
        cwd: missingVideo,
        env: TARGET_CHANNEL_ENV,
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE
      })).resolves.toMatchObject({ report: { blocker: "BLOCKED_V073_UPLOAD_PACKAGE_VIDEO_ASSET_MISSING" } });

      await expect(generateV073UploadPackages({
        cwd: missingFrame,
        env: TARGET_CHANNEL_ENV,
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE
      })).resolves.toMatchObject({ report: { blocker: "BLOCKED_V073_UPLOAD_PACKAGE_FIRST_FRAME_MISSING" } });

      await expect(generateV073UploadPackages({
        cwd: missingDisclosure,
        env: TARGET_CHANNEL_ENV,
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE,
        disclosureOverrides: {
          father_jobs: { commentDisclosurePresent: false }
        }
      })).resolves.toMatchObject({ report: { blocker: "BLOCKED_V073_UPLOAD_PACKAGE_DISCLOSURE_MISSING" } });

      await expect(generateV073UploadPackages({
        cwd: missingTarget,
        env: {},
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE
      })).resolves.toMatchObject({ report: { blocker: "BLOCKED_V073_UPLOAD_PACKAGE_TARGET_CHANNEL_MISSING" } });
    } finally {
      await rm(missingVideo, { recursive: true, force: true });
      await rm(missingFrame, { recursive: true, force: true });
      await rm(missingDisclosure, { recursive: true, force: true });
      await rm(missingTarget, { recursive: true, force: true });
    }
  });

  test("marks Deeplink pending when selected affiliate URL is absent without requiring manual affiliate URL", async () => {
    const cwd = await makeCwd();
    try {
      await writeV057Assets(cwd);
      await writeQueue(cwd, queueRows({
        father_jobs: { selected_affiliate_url: "" },
        neoman_moleulgeol: { selected_affiliate_url: "" },
        lets_buy: { selected_affiliate_url: "" }
      }));
      await writeGeneratedContents(cwd, generatedContentRows({
        father_jobs: { selected_affiliate_url: "" },
        neoman_moleulgeol: { selected_affiliate_url: "" },
        lets_buy: { selected_affiliate_url: "" }
      }));

      const result = await generateV073UploadPackages({
        cwd,
        env: TARGET_CHANNEL_ENV,
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE
      });

      expect(result.report.blocker).toBe("BLOCKED_V073_UPLOAD_PACKAGE_DEEPLINK_PENDING");
      expect(result.report.manualAffiliateUrlInputRequired).toBe(false);
      expect(result.packages.every((item) => item.deeplink.selectedAffiliateUrl === null)).toBe(true);
      expect(result.packages.every((item) => item.deeplink.status === "pending")).toBe(true);
      expect(result.report.packages.every((item) => item.affiliateUrlPresent === false)).toBe(true);
      expect(JSON.stringify(result.report)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("writes sanitized artifacts and keeps TASK.md aligned with T003 in progress", async () => {
    const cwd = await makeCwd();
    try {
      await writeReadyQueueAndContentInputs(cwd);
      const result = await generateV073UploadPackages({
        cwd,
        env: TARGET_CHANNEL_ENV,
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE,
        now: "2026-07-04T00:00:00.000Z"
      });
      await writeV073UploadPackageArtifacts({ cwd, result });

      const reportPath = path.join(cwd, "commerce-assets", "review", "v073", "upload-package-report.json");
      await expect(stat(reportPath)).resolves.toMatchObject({ isFile: expect.any(Function) });
      const reportText = await readFile(reportPath, "utf8");
      expect(reportText).not.toMatch(FORBIDDEN_REPORT_PATTERN);
      expect(reportText).toContain("\"safeToUpload\": false");

      const task = await readFile(path.join(process.cwd(), "TASK.md"), "utf8");
      expect(task).toContain("### T003 - V073 Upload Package Generator");
      expect(task).toContain("Status: `IN_PROGRESS`");
      expect(task).toContain("`SAFE_TO_UPLOAD=false`");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});

function hash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
