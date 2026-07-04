import crypto from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";

import { CHANNEL_KEYS, type ChannelKey } from "../src/uploads/multi-channel/channelProfiles";
import {
  V057_CORRECTED_REUPLOAD_EXPECTED_PRODUCTS
} from "../src/uploads/multi-channel/v057CorrectedReuploadProductSource";
import { V057_REUPLOAD_ASSET_PROFILE } from "../src/uploads/multi-channel/v057ReuploadAssetBinding";
import {
  buildReviewPackageProductSourceManifest,
  scanV071V057OrphanPackageRecovery,
  writeReviewPackageProductSourceManifest
} from "../src/uploads/multi-channel/v071UpstreamProductSourceBinding";
import { materializeV057ProductSourceMetadata } from "../src/uploads/multi-channel/v057ProductSourceMaterializer";
import { buildV069UploadPackageReadiness } from "../src/uploads/multi-channel/v069UploadPackageReadiness";

const RAW_COUPANG_URLS: Record<ChannelKey, string> = {
  father_jobs: ["https://www.coupang.com", "vp", "products", "871000001"].join("/"),
  neoman_moleulgeol: ["https://www.coupang.com", "vp", "products", "871000002"].join("/"),
  lets_buy: ["https://www.coupang.com", "vp", "products", "871000003"].join("/")
};

const AFFILIATE_URLS: Record<ChannelKey, string> = {
  father_jobs: ["https://link.coupang.com", "a", "v071-father"].join("/"),
  neoman_moleulgeol: ["https://link.coupang.com", "a", "v071-neoman"].join("/"),
  lets_buy: ["https://link.coupang.com", "a", "v071-lets-buy"].join("/")
};

const TARGET_CHANNEL_ENV = {
  YOUTUBE_FATHER_JOBS_CHANNEL_ID: `UC${"G".repeat(22)}`,
  YOUTUBE_NEOMAN_MOLEULGEOL_CHANNEL_ID: `UC${"H".repeat(22)}`,
  YOUTUBE_LETS_BUY_CHANNEL_ID: `UC${"I".repeat(22)}`
};

const COUPANG_ENV = {
  COUPANG_ACCESS_KEY: "v071-access",
  COUPANG_SECRET_KEY: "v071-secret"
};

const FORBIDDEN_REPORT_PATTERN = new RegExp([
  "871000001",
  "871000002",
  "871000003",
  "v071-father",
  "v071-neoman",
  "v071-lets-buy",
  "v071-access",
  "v071-secret",
  ...Object.values(TARGET_CHANNEL_ENV),
  "Authorization",
  "HmacSHA256",
  "signature="
].map(escapeRegExp).join("|"), "i");

async function makeCwd() {
  return mkdtemp(path.join(os.tmpdir(), "commerce-v071-"));
}

async function writeV057Assets(cwd: string) {
  for (const channelKey of CHANNEL_KEYS) {
    const channelDir = path.join(cwd, "commerce-assets", "review", "v057", channelKey);
    await mkdir(channelDir, { recursive: true });
    await writeFile(path.join(channelDir, "corrected-preview-v057.mp4"), `fake-v071-${channelKey}-mp4`, "utf8");
    await writeFile(path.join(channelDir, "first-frame-v057.jpg"), `fake-v071-${channelKey}-jpg`, "utf8");
  }
}

async function writeQueue(cwd: string) {
  await mkdir(path.join(cwd, "data"), { recursive: true });
  await writeFile(path.join(cwd, "data", "queue.json"), JSON.stringify(CHANNEL_KEYS.map((channelKey) => ({
    channelKey,
    assetProfile: V057_REUPLOAD_ASSET_PROFILE,
    product_name: V057_CORRECTED_REUPLOAD_EXPECTED_PRODUCTS[channelKey],
    raw_coupang_url: ["https://www.coupang.com", "vp", "products", `queue-${channelKey}`].join("/"),
    updated_at: "2026-07-04T00:00:00.000Z"
  })), null, 2), "utf8");
}

async function writeReviewPackageManifests(cwd: string) {
  for (const channelKey of CHANNEL_KEYS) {
    const rawCoupangUrl = RAW_COUPANG_URLS[channelKey];
    const manifest = buildReviewPackageProductSourceManifest({
      packageId: `v057-package-${channelKey}`,
      sourceQueueItemId: `queue-${channelKey}`,
      sourceGeneratedContentId: `content-${channelKey}`,
      channelKey,
      assetProfile: V057_REUPLOAD_ASSET_PROFILE,
      rawCoupangUrl,
      productName: V057_CORRECTED_REUPLOAD_EXPECTED_PRODUCTS[channelKey],
      selectedAffiliateUrl: AFFILIATE_URLS[channelKey],
      createdAt: "2026-07-04T00:00:00.000Z"
    });
    await writeReviewPackageProductSourceManifest({ cwd, manifest });
  }
}

function mockDeeplinkFetch() {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        rCode: "0",
        data: CHANNEL_KEYS.map((channelKey) => ({
          originalUrl: RAW_COUPANG_URLS[channelKey],
          shortenUrl: AFFILIATE_URLS[channelKey]
        }))
      };
    }
  })) as unknown as typeof fetch;
}

describe("v071 upstream product source binding", () => {
  test("creates review package product-source manifests that V070 prioritizes over fallback data", async () => {
    const cwd = await makeCwd();
    try {
      await writeV057Assets(cwd);
      await writeQueue(cwd);
      await writeReviewPackageManifests(cwd);

      const report = await materializeV057ProductSourceMetadata({
        cwd,
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE,
        now: "2026-07-04T00:00:00.000Z"
      });

      expect(report.FINAL_STATUS).toBe("SUCCESS_V070_V057_PRODUCT_SOURCE_MATERIALIZED_NO_UPLOAD");
      expect(report.channels.every((channel) => channel.source_kind === "v057_review_package_metadata")).toBe(true);
      expect(report.channels.every((channel) => channel.runtime_source_approved === true)).toBe(true);
      expect(JSON.stringify(report)).not.toMatch(FORBIDDEN_REPORT_PATTERN);

      for (const channelKey of CHANNEL_KEYS) {
        const manifestPath = path.join(cwd, "commerce-assets", "review", "v057", channelKey, "product-source-v057.json");
        await expect(stat(manifestPath)).resolves.toMatchObject({ isFile: expect.any(Function) });
        const payload = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
        expect(payload).toMatchObject({
          packageId: `v057-package-${channelKey}`,
          channelKey,
          assetProfile: V057_REUPLOAD_ASSET_PROFILE,
          productSourceKind: "v057_review_package_metadata",
          runtimeSourceApproved: true,
          rawUrlsRedactedInReport: true
        });
        expect(payload.sourceEvidenceHash).toBe(
          crypto.createHash("sha256").update(`${channelKey}:${RAW_COUPANG_URLS[channelKey]}`).digest("hex")
        );
      }
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("review package manifest clears the V069 product-source blocker before fresh approval", async () => {
    const cwd = await makeCwd();
    try {
      await writeV057Assets(cwd);
      await writeReviewPackageManifests(cwd);

      const readiness = await buildV069UploadPackageReadiness({
        cwd,
        env: {
          ...COUPANG_ENV,
          ...TARGET_CHANNEL_ENV
        },
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE,
        fetchImpl: mockDeeplinkFetch()
      });

      expect(readiness.product_source.raw_coupang_url_source_bound).toBe(true);
      expect(readiness.affiliate_bridge?.affiliate_url_bridge_ready).toBe(true);
      expect(readiness.packages.every((item) => item.productSource.present)).toBe(true);
      expect(readiness.blocker).toBe("V057_CORRECTED_REUPLOAD_APPROVAL_MISSING");
      expect(JSON.stringify(readiness)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("current-style v057 assets without product source remain an orphan package and fail closed", async () => {
    const cwd = await makeCwd();
    try {
      await writeV057Assets(cwd);

      const report = await scanV071V057OrphanPackageRecovery({
        cwd,
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE
      });

      expect(report.FINAL_STATUS).toBe("BLOCKED_V071_V057_ORPHAN_PACKAGE_SOURCE_UNRECOVERABLE");
      expect(report.orphan_package_detected).toBe(true);
      expect(report.product_source_recovered).toBe(false);
      expect(report.channels.every((channel) => channel.video_asset_present)).toBe(true);
      expect(report.channels.every((channel) => channel.product_source_present === false)).toBe(true);
      expect(JSON.stringify(report)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("rejects malformed or non-boolean runtime source approvals for review package manifests", async () => {
    expect(() => buildReviewPackageProductSourceManifest({
      packageId: "v057-package-father_jobs",
      sourceQueueItemId: "queue-father_jobs",
      sourceGeneratedContentId: "content-father_jobs",
      channelKey: "father_jobs",
      assetProfile: V057_REUPLOAD_ASSET_PROFILE,
      rawCoupangUrl: RAW_COUPANG_URLS.father_jobs,
      productName: V057_CORRECTED_REUPLOAD_EXPECTED_PRODUCTS.father_jobs,
      createdAt: "2026-07-04T00:00:00.000Z",
      runtimeSourceApproved: "true" as unknown as true
    })).toThrow(/runtimeSourceApproved/);

    expect(() => buildReviewPackageProductSourceManifest({
      packageId: "v057-package-father_jobs",
      channelKey: "father_jobs",
      assetProfile: V057_REUPLOAD_ASSET_PROFILE,
      rawCoupangUrl: "",
      productName: V057_CORRECTED_REUPLOAD_EXPECTED_PRODUCTS.father_jobs,
      createdAt: "2026-07-04T00:00:00.000Z"
    })).toThrow(/rawCoupangUrl/);
  });
});

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
