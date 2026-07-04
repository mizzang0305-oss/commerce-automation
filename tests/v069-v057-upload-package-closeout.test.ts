import crypto from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";

import { CHANNEL_KEYS, type ChannelKey } from "../src/uploads/multi-channel/channelProfiles";
import { V057_CORRECTED_REUPLOAD_EXPECTED_PRODUCTS } from "../src/uploads/multi-channel/v057CorrectedReuploadProductSource";
import { V057_REUPLOAD_ASSET_PROFILE } from "../src/uploads/multi-channel/v057ReuploadAssetBinding";
import { buildV069UploadPackageReadiness } from "../src/uploads/multi-channel/v069UploadPackageReadiness";

const RAW_COUPANG_URLS: Record<ChannelKey, string> = {
  father_jobs: ["https://www.coupang.com", "vp", "products", "869000001"].join("/"),
  neoman_moleulgeol: ["https://www.coupang.com", "vp", "products", "869000002"].join("/"),
  lets_buy: ["https://www.coupang.com", "vp", "products", "869000003"].join("/")
};

const AFFILIATE_URLS: Record<ChannelKey, string> = {
  father_jobs: ["https://link.coupang.com", "a", "v069-father"].join("/"),
  neoman_moleulgeol: ["https://link.coupang.com", "a", "v069-neoman"].join("/"),
  lets_buy: ["https://link.coupang.com", "a", "v069-lets-buy"].join("/")
};

const COUPANG_ENV = {
  COUPANG_ACCESS_KEY: "v069-access-key",
  COUPANG_SECRET_KEY: "v069-secret-key"
};

const TARGET_CHANNEL_ENV = {
  YOUTUBE_FATHER_JOBS_CHANNEL_ID: "UC_father_jobs_v069_ready_123",
  YOUTUBE_NEOMAN_MOLEULGEOL_CHANNEL_ID: "UC_neoman_moleulgeol_v069_ready_456",
  YOUTUBE_LETS_BUY_CHANNEL_ID: "UC_lets_buy_v069_ready_789"
};

const FORBIDDEN_REPORT_PATTERN =
  /869000001|869000002|869000003|v069-father|v069-neoman|v069-lets-buy|v069-access-key|v069-secret-key|UC_father_jobs_v069_ready_123|UC_neoman_moleulgeol_v069_ready_456|UC_lets_buy_v069_ready_789|Authorization|signature=|HmacSHA256/i;

async function makeCwd() {
  return mkdtemp(path.join(os.tmpdir(), "commerce-v069-"));
}

async function writeV057Assets(cwd: string, options: {
  skipFirstFrame?: ChannelKey;
} = {}) {
  for (const channelKey of CHANNEL_KEYS) {
    const channelDir = path.join(cwd, "commerce-assets", "review", "v057", channelKey);
    await mkdir(channelDir, { recursive: true });
    await writeFile(path.join(channelDir, "corrected-preview-v057.mp4"), `fake-v069-${channelKey}-mp4`, "utf8");
    if (options.skipFirstFrame !== channelKey) {
      await writeFile(path.join(channelDir, "first-frame-v057.jpg"), `fake-v069-${channelKey}-jpg`, "utf8");
    }
  }
}

async function writeProductSources(cwd: string, overrides: Partial<Record<ChannelKey, Record<string, unknown>>> = {}) {
  for (const channelKey of CHANNEL_KEYS) {
    const channelDir = path.join(cwd, "commerce-assets", "review", "v057", channelKey);
    await mkdir(channelDir, { recursive: true });
    const rawCoupangUrl = RAW_COUPANG_URLS[channelKey];
    await writeFile(
      path.join(channelDir, "product-source-v057.json"),
      JSON.stringify({
        channelKey,
        assetProfile: V057_REUPLOAD_ASSET_PROFILE,
        productSourceKind: "v057_review_package_metadata",
        rawCoupangUrl,
        productName: V057_CORRECTED_REUPLOAD_EXPECTED_PRODUCTS[channelKey],
        sourceEvidenceHash: crypto.createHash("sha256").update(`${channelKey}:${rawCoupangUrl}`).digest("hex"),
        boundAt: "2026-07-04T00:00:00.000Z",
        ...overrides[channelKey]
      }, null, 2),
      "utf8"
    );
  }
}

async function writeMalformedProductSource(cwd: string, channelKey: ChannelKey) {
  const channelDir = path.join(cwd, "commerce-assets", "review", "v057", channelKey);
  await mkdir(channelDir, { recursive: true });
  await writeFile(path.join(channelDir, "product-source-v057.json"), "{ malformed product source json", "utf8");
}

function mockDeeplinkFetch(urls: Record<ChannelKey, string> = AFFILIATE_URLS, status = 200) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return {
        rCode: status >= 200 && status < 300 ? "0" : "500",
        data: CHANNEL_KEYS.map((channelKey) => ({
          originalUrl: RAW_COUPANG_URLS[channelKey],
          shortenUrl: urls[channelKey]
        }))
      };
    }
  })) as unknown as typeof fetch;
}

async function writeReadyInputs(cwd: string) {
  await writeV057Assets(cwd);
  await writeProductSources(cwd);
}

describe("v069 v057 upload package closeout readiness", () => {
  test("builds three no-upload packages and blocks only on missing fresh approval", async () => {
    const cwd = await makeCwd();
    try {
      await writeReadyInputs(cwd);
      const fetchImpl = mockDeeplinkFetch();

      const result = await buildV069UploadPackageReadiness({
        cwd,
        env: {
          ...COUPANG_ENV,
          ...TARGET_CHANNEL_ENV
        },
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE,
        fetchImpl
      });

      expect(result.package_builder_ready).toBe(true);
      expect(result.upload_package_ready).toBe(false);
      expect(result.blocker).toBe("V057_CORRECTED_REUPLOAD_APPROVAL_MISSING");
      expect(result.approval.fresh_approval_required).toBe(true);
      expect(result.packages.every((item) => item.package_ready)).toBe(true);
      expect(result.packages.map((item) => item.channelKey)).toEqual(CHANNEL_KEYS);
      expect(result.packages.every((item) => item.productSource.present && item.affiliateResolution.resolved)).toBe(true);
      expect(result.packages.every((item) => item.youtubeTarget.expectedChannelIdPresent)).toBe(true);
      expect(result.packages.every((item) => item.disclosure.containsSyntheticMedia)).toBe(true);
      expect(result.packages.every((item) => item.duplicateGuard.duplicate_upload_risk === false)).toBe(true);
      expect(result.videos_insert_called).toBe(false);
      expect(result.comment_create_update_delete_called).toBe(false);
      expect(result.raw_urls_printed).toBe(false);
      expect(result.secrets_printed).toBe(false);
      expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("missing asset profile blocks before package readiness", async () => {
    const cwd = await makeCwd();
    try {
      await writeReadyInputs(cwd);

      const result = await buildV069UploadPackageReadiness({
        cwd,
        env: {
          ...COUPANG_ENV,
          ...TARGET_CHANNEL_ENV
        },
        uploadAssetProfile: null,
        fetchImpl: mockDeeplinkFetch()
      });

      expect(result.upload_package_ready).toBe(false);
      expect(result.blocker).toBe("BLOCKED_REUPLOAD_ASSET_PROFILE_NOT_SELECTED");
      expect(result.videos_insert_called).toBe(false);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("missing product source blocks without asking for manual URL input", async () => {
    const cwd = await makeCwd();
    try {
      await writeV057Assets(cwd);

      const result = await buildV069UploadPackageReadiness({
        cwd,
        env: {
          ...COUPANG_ENV,
          ...TARGET_CHANNEL_ENV
        },
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE,
        fetchImpl: mockDeeplinkFetch()
      });

      expect(result.upload_package_ready).toBe(false);
      expect(result.blocker).toBe("BLOCKED_V069_UPLOAD_PACKAGE_PRODUCT_SOURCE_MISSING");
      expect(result.manual_affiliate_url_input_required).toBe(false);
      expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("malformed product source metadata blocks with sanitized evidence", async () => {
    const cwd = await makeCwd();
    try {
      await writeReadyInputs(cwd);
      await writeMalformedProductSource(cwd, "father_jobs");

      const result = await buildV069UploadPackageReadiness({
        cwd,
        env: {
          ...COUPANG_ENV,
          ...TARGET_CHANNEL_ENV
        },
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE,
        fetchImpl: mockDeeplinkFetch()
      });

      expect(result.upload_package_ready).toBe(false);
      expect(result.blocker).toBe("BLOCKED_V068_PRODUCT_SOURCE_METADATA_INVALID");
      expect(result.product_source.report.channels.find((channel) => channel.channel_key === "father_jobs")).toMatchObject({
        source_present: true,
        parse_valid: false,
        raw_urls_printed: false
      });
      expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("runtimeSourceApproved string values are rejected and boolean true is accepted for promoted fixtures", async () => {
    const rejected = await makeCwd();
    const accepted = await makeCwd();
    try {
      await writeV057Assets(rejected);
      await writeProductSources(rejected, {
        father_jobs: {
          productSourceKind: "code_fixture_promoted",
          runtimeSourceApproved: "true"
        }
      });
      await writeV057Assets(accepted);
      await writeProductSources(accepted, {
        father_jobs: {
          productSourceKind: "code_fixture_promoted",
          runtimeSourceApproved: true
        }
      });

      await expect(buildV069UploadPackageReadiness({
        cwd: rejected,
        env: {
          ...COUPANG_ENV,
          ...TARGET_CHANNEL_ENV
        },
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE,
        fetchImpl: mockDeeplinkFetch()
      })).resolves.toMatchObject({
        upload_package_ready: false,
        blocker: "BLOCKED_V068_RUNTIME_SOURCE_NOT_APPROVED"
      });

      const acceptedResult = await buildV069UploadPackageReadiness({
        cwd: accepted,
        env: {
          ...COUPANG_ENV,
          ...TARGET_CHANNEL_ENV
        },
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE,
        fetchImpl: mockDeeplinkFetch()
      });
      expect(acceptedResult.product_source.report.product_source_ready).toBe(true);
      expect(acceptedResult.packages.every((item) => item.package_ready)).toBe(true);
    } finally {
      await rm(rejected, { recursive: true, force: true });
      await rm(accepted, { recursive: true, force: true });
    }
  });

  test("target channel id, credentials, deeplink, affiliate, first frame, disclosure, and duplicate blockers fail closed", async () => {
    const missingTarget = await makeCwd();
    const missingCreds = await makeCwd();
    const deeplinkFailure = await makeCwd();
    const invalidAffiliate = await makeCwd();
    const missingFrame = await makeCwd();
    const missingDisclosure = await makeCwd();
    const duplicateRisk = await makeCwd();
    try {
      for (const cwd of [missingTarget, missingCreds, deeplinkFailure, invalidAffiliate, missingDisclosure, duplicateRisk]) {
        await writeReadyInputs(cwd);
      }
      await writeV057Assets(missingFrame, { skipFirstFrame: "lets_buy" });
      await writeProductSources(missingFrame);

      await expect(buildV069UploadPackageReadiness({
        cwd: missingTarget,
        env: COUPANG_ENV,
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE,
        fetchImpl: mockDeeplinkFetch()
      })).resolves.toMatchObject({ blocker: "BLOCKED_V057_RUNTIME_TARGET_CHANNEL_IDS_MISSING" });

      await expect(buildV069UploadPackageReadiness({
        cwd: missingCreds,
        env: TARGET_CHANNEL_ENV,
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE,
        fetchImpl: mockDeeplinkFetch()
      })).resolves.toMatchObject({ blocker: "BLOCKED_V066_COUPANG_API_CREDENTIALS_MISSING" });

      await expect(buildV069UploadPackageReadiness({
        cwd: deeplinkFailure,
        env: { ...COUPANG_ENV, ...TARGET_CHANNEL_ENV },
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE,
        fetchImpl: mockDeeplinkFetch(AFFILIATE_URLS, 500)
      })).resolves.toMatchObject({ blocker: "BLOCKED_V066_COUPANG_DEEPLINK_FAILED" });

      await expect(buildV069UploadPackageReadiness({
        cwd: invalidAffiliate,
        env: { ...COUPANG_ENV, ...TARGET_CHANNEL_ENV },
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE,
        fetchImpl: mockDeeplinkFetch({
          father_jobs: "https://not-coupang.invalid/father",
          neoman_moleulgeol: "https://not-coupang.invalid/neoman",
          lets_buy: "https://not-coupang.invalid/lets"
        })
      })).resolves.toMatchObject({ blocker: "BLOCKED_V057_AFFILIATE_URLS_INVALID" });

      await expect(buildV069UploadPackageReadiness({
        cwd: missingFrame,
        env: { ...COUPANG_ENV, ...TARGET_CHANNEL_ENV },
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE,
        fetchImpl: mockDeeplinkFetch()
      })).resolves.toMatchObject({ blocker: "BLOCKED_V057_FIRST_FRAME_MISSING" });

      await expect(buildV069UploadPackageReadiness({
        cwd: missingDisclosure,
        env: { ...COUPANG_ENV, ...TARGET_CHANNEL_ENV },
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE,
        fetchImpl: mockDeeplinkFetch(),
        disclosureOverrides: {
          lets_buy: { commentDisclosurePresent: false }
        }
      })).resolves.toMatchObject({ blocker: "BLOCKED_V069_DISCLOSURE_PREVIEW_MISSING" });

      await expect(buildV069UploadPackageReadiness({
        cwd: duplicateRisk,
        env: { ...COUPANG_ENV, ...TARGET_CHANNEL_ENV },
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE,
        fetchImpl: mockDeeplinkFetch(),
        duplicateUploadRiskOverride: true
      })).resolves.toMatchObject({ blocker: "DUPLICATE_UPLOAD_RISK" });
    } finally {
      await rm(missingTarget, { recursive: true, force: true });
      await rm(missingCreds, { recursive: true, force: true });
      await rm(deeplinkFailure, { recursive: true, force: true });
      await rm(invalidAffiliate, { recursive: true, force: true });
      await rm(missingFrame, { recursive: true, force: true });
      await rm(missingDisclosure, { recursive: true, force: true });
      await rm(duplicateRisk, { recursive: true, force: true });
    }
  });
});
