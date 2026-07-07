import crypto from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { DEFAULT_YOUTUBE_PRODUCT_DISCLOSURE_TEXT } from "../src/lib/uploads/youtube";
import type { PreparedVideoAssetRef } from "../src/lib/uploads/youtube/uploadAssetContract";
import type { V073UploadPackage } from "../src/uploads/multi-channel/v073UploadPackage";
import { V057_REUPLOAD_ASSET_PROFILE } from "../src/uploads/multi-channel/v057ReuploadAssetBinding";
import {
  DEFAULT_V095_PRIVATE_PILOT_EXECUTION_CONTEXT_RELATIVE_PATH
} from "../src/uploads/youtube/v095PrivatePilotExecutionContext";
import {
  buildV099PreparedAssetEvidenceDryRun,
  bindV099PreparedVideoAssetEvidence
} from "../src/uploads/youtube/v099PreparedAssetEvidenceBinding";
import { PASSING_SHORTS_CONTENT_QUALITY } from "./fixtures/youtubeShortsContentQuality";

const FULL_CHANNEL_ID = `UC${"6".repeat(22)}`;
const RAW_AFFILIATE_URL = ["https://link.coupang.com", "a", "v099-hidden"].join("/");
const RAW_COUPANG_URL = ["https://www.coupang.com", "vp", "products", "999000001"].join("/");
const RAW_SIGNED_URL = "https://asset-bridge.example.test/private/v099.mp4?signature=secret";
const RAW_PREPARED_URL = "https://asset-bridge.example.test/private/v099-prepared.mp4?token=secret";
const RAW_LOCAL_PATH = "C:\\Users\\LOVE\\MyProjects\\commerce-automation\\commerce-assets\\review\\v057\\father_jobs\\corrected-preview-v057.mp4";
const PRIVATE_APPROVAL_PHRASE = ["APPROVE_YOUTUBE_PRIVATE_UPLOAD", "PILOT_1_ITEM_NO_COMMENT"].join("_");
const FORBIDDEN_REPORT_PATTERN = new RegExp([
  FULL_CHANNEL_ID,
  RAW_AFFILIATE_URL,
  RAW_COUPANG_URL,
  RAW_SIGNED_URL,
  RAW_PREPARED_URL,
  RAW_LOCAL_PATH.replace(/\\/g, "\\\\"),
  PRIVATE_APPROVAL_PHRASE,
  "COUPANG_SECRET_KEY",
  "YOUTUBE_CLIENT_SECRET",
  "refresh_token",
  "access_token",
  "client_secret",
  "Authorization",
  "Bearer",
  "HmacSHA256",
  "signature=",
  "token=secret"
].map(escapeRegExp).join("|"), "i");

describe("v099 prepared asset evidence binding no-upload", () => {
  test("keeps runtime dry-run blocked when only local MP4 evidence exists", async () => {
    const cwd = await writeContextBackedCwd();
    try {
      const report = await buildV099PreparedAssetEvidenceDryRun({
        cwd,
        env: readyEnv(),
        loadUploadPackages: async () => [readyUploadPackage()]
      });

      expect(report.version).toBe("v099");
      expect(report.mode).toBe("prepared_asset_evidence_binding_no_upload");
      expect(report.status).toBe("blocked");
      expect(report.contextFound).toBe(true);
      expect(report.packageFound).toBe(true);
      expect(report.videoAssetEvidencePresent).toBe(true);
      expect(report.preparedAssetEvidencePresent).toBe(false);
      expect(report.preparedAssetUploadableUrlPresent).toBe(false);
      expect(report.uploadRequestBuilt).toBe(false);
      expect(report.resolverBlocker).toBe("BLOCKED_V081_VIDEO_ASSET_MISSING");
      expect(report.videosInsertCalled).toBe(false);
      expect(report.commentThreadsInsertCalled).toBe(false);
      expect(report.SAFE_TO_UPLOAD).toBe(false);
      expect(report.SAFE_TO_PUBLIC_UPLOAD).toBe(false);
      expect(JSON.stringify(report)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("binds injected HTTPS prepared_video_asset_url evidence without printing raw URLs", async () => {
    const cwd = await writeContextBackedCwd();
    try {
      const report = await buildV099PreparedAssetEvidenceDryRun({
        cwd,
        env: readyEnv(),
        loadUploadPackages: async () => [readyUploadPackage()],
        preparedVideoAssetRefs: {
          father_jobs: preparedVideoAssetRef({
            provider: "external_https",
            prepared_video_asset_url: RAW_PREPARED_URL,
            signed_url: null
          })
        }
      });

      expect(report.status).toBe("prepared_asset_evidence_ready");
      expect(report.preparedAssetEvidencePresent).toBe(true);
      expect(report.preparedAssetServerAccessible).toBe(true);
      expect(report.preparedAssetUploadableUrlPresent).toBe(true);
      expect(report.preparedAssetExpired).toBe(false);
      expect(report.preparedAssetProviderLabel).toBe("external_https");
      expect(report.preparedAssetHashPrefix).toBe("videoasset");
      expect(report.uploadRequestBuilt).toBe(true);
      expect(report.resolverBlocker).toBeNull();
      expect(report.videosInsertCalled).toBe(false);
      expect(report.commentThreadsInsertCalled).toBe(false);
      expect(JSON.stringify(report)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("binds injected HTTPS signed_url evidence without upload mutation", async () => {
    const cwd = await writeContextBackedCwd();
    try {
      const report = await buildV099PreparedAssetEvidenceDryRun({
        cwd,
        env: readyEnv(),
        loadUploadPackages: async () => [readyUploadPackage()],
        preparedVideoAssetRefs: {
          father_jobs: preparedVideoAssetRef({
            provider: "signed_https",
            prepared_video_asset_url: null,
            signed_url: RAW_SIGNED_URL
          })
        }
      });

      expect(report.status).toBe("prepared_asset_evidence_ready");
      expect(report.preparedAssetProviderLabel).toBe("signed_https");
      expect(report.preparedAssetUploadableUrlPresent).toBe(true);
      expect(report.uploadRequestBuilt).toBe(true);
      expect(report.videosInsertTotalCount).toBe(0);
      expect(report.commentThreadsInsertCalled).toBe(false);
      expect(JSON.stringify(report)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test.each([
    ["storage key only", { storage_key: "private/v099.mp4", signed_url: null, prepared_video_asset_url: null }],
    ["server accessible without HTTPS URL", { signed_url: null, prepared_video_asset_url: null }],
    ["non HTTPS URL", { signed_url: null, prepared_video_asset_url: "http://asset-bridge.example.test/v099.mp4" }],
    ["expired signed URL", { expires_at: "2020-01-01T00:00:00.000Z" }],
    ["missing asset id", { asset_id: "" }],
    ["missing mime type", { mime_type: "video/quicktime" as "video/mp4" }],
    ["local path URL", { signed_url: RAW_LOCAL_PATH, prepared_video_asset_url: null }]
  ])("blocks prepared asset evidence when %s", (_label, overrides) => {
    const result = bindV099PreparedVideoAssetEvidence({
      preparedVideoAssetRef: preparedVideoAssetRef(overrides),
      videoAssetHashPrefix: "videoasset"
    });

    expect(result.ready).toBe(false);
    expect(result.preparedAsset).toBeNull();
    expect(result.blocker).toBe("BLOCKED_V081_VIDEO_ASSET_MISSING");
    expect(result.raw_urls_printed).toBe(false);
    expect(result.raw_file_paths_printed).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });

  test("package.json exposes the V099 no-upload prepared asset dry-run command", async () => {
    const pkg = JSON.parse(await readFile("package.json", "utf8"));

    expect(pkg.scripts["upload:v099:prepared-asset-dry-run"]).toBe(
      "tsx scripts/uploads/dry-run-v099-prepared-asset-evidence.ts"
    );
  });
});

function readyEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    V051_UPLOAD_ASSET_PROFILE: V057_REUPLOAD_ASSET_PROFILE,
    YOUTUBE_FATHER_JOBS_CHANNEL_ID: FULL_CHANNEL_ID,
    ...overrides
  };
}

async function writeContextBackedCwd() {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "commerce-v099-"));
  const contextPath = path.join(cwd, DEFAULT_V095_PRIVATE_PILOT_EXECUTION_CONTEXT_RELATIVE_PATH);
  await mkdir(path.dirname(contextPath), { recursive: true });
  await writeFile(contextPath, `${JSON.stringify({
    version: "v095",
    channelKey: "father_jobs",
    queueItemId: "queue-v099-father",
    uploadPackageId: "pkg-v099-father",
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
    videoAssetHashPrefix: "videoasset",
    targetChannelHashPrefix: "targethash",
    generatedAt: "2026-07-08T00:00:00.000Z",
    contextCreatedAt: "2026-07-08T00:00:00.000Z",
    contextExpiresAt: "2099-01-01T00:00:00.000Z"
  }, null, 2)}\n`, "utf8");
  return cwd;
}

function readyUploadPackage(overrides: Partial<V073UploadPackage> = {}): V073UploadPackage & {
  shortsContentQuality: unknown;
} {
  const base: V073UploadPackage & { shortsContentQuality: unknown } = {
    packageId: "pkg-v099-father",
    queueItemId: "queue-v099-father",
    generatedContentId: "generated-v099-father",
    channelKey: "father_jobs",
    assetProfile: V057_REUPLOAD_ASSET_PROFILE,
    productSource: {
      rawCoupangUrl: RAW_COUPANG_URL,
      productName: "v099 product",
      sourceKind: "trusted_upstream_manifest",
      sourceEvidenceHash: "sourcehashv099",
      runtimeSourceApproved: true
    },
    deeplink: {
      selectedAffiliateUrl: RAW_AFFILIATE_URL,
      source: "deeplink",
      status: "ready",
      sanitizedEvidence: {
        affiliateUrlPresent: true,
        affiliateUrlPrinted: false,
        affiliateHashPrefix: "affiliate"
      }
    },
    videoAsset: {
      path: "commerce-assets/review/v057/father_jobs/corrected-preview-v057.mp4",
      basename: "corrected-preview-v057.mp4",
      hashEvidence: "videoasset",
      firstFramePath: "commerce-assets/review/v057/father_jobs/first-frame-v057.jpg",
      firstFrameBasename: "first-frame-v057.jpg",
      firstFrameHashEvidence: "firstframe",
      duration: null,
      resolution: null
    },
    youtubeMetadata: {
      title: "v099 private pilot",
      description: `v099 package.\n\n${DEFAULT_YOUTUBE_PRODUCT_DISCLOSURE_TEXT}`,
      tags: ["v099"],
      categoryId: "26",
      defaultLanguage: "ko",
      defaultAudioLanguage: "ko"
    },
    youtubeAdvancedSettings: {
      privacyStatus: "public",
      selfDeclaredMadeForKids: false,
      containsSyntheticMedia: true,
      paidProductPlacementDetails: {
        hasPaidProductPlacement: true
      },
      license: "youtube",
      embeddable: true,
      publicStatsViewable: true,
      defaultLanguage: "ko",
      defaultAudioLanguage: "ko"
    },
    commentPackage: {
      commentText: `${DEFAULT_YOUTUBE_PRODUCT_DISCLOSURE_TEXT}\n\nmasked comment`,
      affiliateUrlRequiredBeforeExecution: true,
      coupangPartnersDisclosurePresent: true
    },
    targetChannel: {
      channelKey: "father_jobs",
      channelIdHashPrefix: hashPrefix(FULL_CHANNEL_ID),
      formatValid: true,
      rawChannelIdPrinted: false
    },
    duplicateGuard: {
      ready: true,
      duplicateUploadRisk: false,
      signature: "duplicate-v099"
    },
    quotaGuard: {
      ready: true,
      publicUploadExecutionDisabled: true
    },
    approvalGate: {
      freshApprovalRequired: true,
      approvalPresent: false,
      publicUploadExecutionDisabled: true
    },
    resultStore: {
      status: "placeholder",
      rawUrlsStored: false,
      secretsStored: false
    },
    shortsContentQuality: PASSING_SHORTS_CONTENT_QUALITY
  };

  return {
    ...base,
    ...overrides
  };
}

function preparedVideoAssetRef(overrides: Partial<PreparedVideoAssetRef> = {}): PreparedVideoAssetRef {
  return {
    asset_id: "asset-v099-prepared",
    signed_url: RAW_SIGNED_URL,
    prepared_video_asset_url: RAW_PREPARED_URL,
    mime_type: "video/mp4",
    checksum_sha256: "videoasset",
    expires_at: "2099-01-01T00:00:00.000Z",
    provider: "signed_https",
    server_accessible: true,
    ...overrides
  };
}

function hashPrefix(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 10);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
