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
  buildV097UploadPackageResolutionDryRun
} from "../src/uploads/youtube/v097UploadPackageResolutionBridge";
import {
  DEFAULT_V095_PRIVATE_PILOT_EXECUTION_CONTEXT_RELATIVE_PATH
} from "../src/uploads/youtube/v095PrivatePilotExecutionContext";
import { PASSING_SHORTS_CONTENT_QUALITY } from "./fixtures/youtubeShortsContentQuality";

const FULL_CHANNEL_ID = `UC${"7".repeat(22)}`;
const RAW_AFFILIATE_URL = ["https://link.coupang.com", "a", "v097-hidden"].join("/");
const RAW_COUPANG_URL = ["https://www.coupang.com", "vp", "products", "997000001"].join("/");
const RAW_SIGNED_VIDEO_ASSET_URL = ["https://asset-bridge.example.test", "private", "v097-hidden.mp4?signature=secret"].join("/");
const PRIVATE_APPROVAL_PHRASE = ["APPROVE_YOUTUBE_PRIVATE_UPLOAD", "PILOT_1_ITEM_NO_COMMENT"].join("_");
const FORBIDDEN_REPORT_PATTERN = new RegExp([
  FULL_CHANNEL_ID,
  RAW_AFFILIATE_URL,
  RAW_COUPANG_URL,
  RAW_SIGNED_VIDEO_ASSET_URL,
  PRIVATE_APPROVAL_PHRASE,
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

describe("v097 upload package resolution bridge no-upload dry run", () => {
  test("resolves a context-backed V084 uploadPackageId to the same V094 package object", async () => {
    const cwd = await writeContextBackedCwd();
    try {
      const report = await buildV097UploadPackageResolutionDryRun({
        cwd,
        env: readyEnv(),
        loadUploadPackages: async () => [readyUploadPackage()],
        preparedVideoAssetRefs: {
          father_jobs: preparedVideoAssetRef()
        }
      });

      expect(report.status).toBe("package_resolution_ready");
      expect(report.contextFound).toBe(true);
      expect(report.contextLoaded).toBe(true);
      expect(report.contextPathSafe).toBe(true);
      expect(report.v084UploadPackageIdPresent).toBe(true);
      expect(report.v084QueueItemIdPresent).toBe(true);
      expect(report.v081UploadPackageIdPresent).toBe(true);
      expect(report.v081QueueItemIdPresent).toBe(true);
      expect(report.resolverPackageFound).toBe(true);
      expect(report.videoAssetEvidencePresent).toBe(true);
      expect(report.preparedAssetEvidencePresent).toBe(true);
      expect(report.preparedAssetServerAccessible).toBe(true);
      expect(report.preparedAssetUploadableUrlPresent).toBe(true);
      expect(report.resolverUploadRequestBuilt).toBe(true);
      expect(report.resolverBlocker).toBeNull();
      expect(report.packageCount).toBe(1);
      expect(report.packageIdMatch).toBe(true);
      expect(report.queueItemIdMatch).toBe(true);
      expect(report.channelKeyMatch).toBe(true);
      expect(report.uploadAssetProfileLabel).toBe(V057_REUPLOAD_ASSET_PROFILE);
      expect(report.uploadExecuteCalled).toBe(false);
      expect(report.videosInsertCalled).toBe(false);
      expect(report.videosInsertTotalCount).toBe(0);
      expect(report.commentThreadsInsertCalled).toBe(false);
      expect(report.approvalPhraseStored).toBe(false);
      expect(JSON.stringify(report)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("keeps local-only MP4 evidence blocked until a server-accessible prepared asset ref is bound", async () => {
    const cwd = await writeContextBackedCwd();
    try {
      const report = await buildV097UploadPackageResolutionDryRun({
        cwd,
        env: readyEnv(),
        loadUploadPackages: async () => [readyUploadPackage()]
      });

      expect(report.status).toBe("blocked");
      expect(report.resolverPackageFound).toBe(true);
      expect(report.videoAssetEvidencePresent).toBe(true);
      expect(report.preparedAssetEvidencePresent).toBe(false);
      expect(report.preparedAssetServerAccessible).toBe(false);
      expect(report.preparedAssetUploadableUrlPresent).toBe(false);
      expect(report.resolverUploadRequestBuilt).toBe(false);
      expect(report.resolverBlocker).toBe("BLOCKED_V081_VIDEO_ASSET_MISSING");
      expect(report.videosInsertCalled).toBe(false);
      expect(report.commentThreadsInsertCalled).toBe(false);
      expect(JSON.stringify(report)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test.each([
    ["server_accessible false", { server_accessible: false }, true],
    ["missing server URL", { signed_url: null, prepared_video_asset_url: null }, false],
    ["expired server URL", { expires_at: "2020-01-01T00:00:00.000Z" }, true],
    ["storage_key only", { signed_url: null, prepared_video_asset_url: null, storage_key: "private/v097.mp4" }, false],
    [
      "r2 storage_key only",
      {
        signed_url: null,
        prepared_video_asset_url: null,
        storage_key: "private/v097-r2.mp4",
        provider: "r2" as const
      },
      false
    ],
    [
      "supabase_storage storage_key only",
      {
        signed_url: null,
        prepared_video_asset_url: null,
        storage_key: "private/v097-supabase.mp4",
        provider: "supabase_storage" as const
      },
      false
    ],
    [
      "non-HTTPS prepared URL",
      {
        signed_url: null,
        prepared_video_asset_url: "http://asset-bridge.example.test/private/v097.mp4"
      },
      false
    ]
  ])("blocks prepared video asset evidence when %s", async (_label, assetOverrides, uploadableUrlPresent) => {
    const cwd = await writeContextBackedCwd();
    try {
      const report = await buildV097UploadPackageResolutionDryRun({
        cwd,
        env: readyEnv(),
        loadUploadPackages: async () => [readyUploadPackage()],
        preparedVideoAssetRefs: {
          father_jobs: preparedVideoAssetRef(assetOverrides)
        }
      });

      expect(report.status).toBe("blocked");
      expect(report.videoAssetEvidencePresent).toBe(true);
      expect(report.preparedAssetEvidencePresent).toBe(true);
      expect(report.preparedAssetServerAccessible).toBe(assetOverrides.server_accessible === false ? false : true);
      expect(report.preparedAssetUploadableUrlPresent).toBe(uploadableUrlPresent);
      expect(report.resolverUploadRequestBuilt).toBe(false);
      expect(report.resolverBlocker).toBe("BLOCKED_V081_VIDEO_ASSET_MISSING");
      expect(report.videosInsertCalled).toBe(false);
      expect(report.commentThreadsInsertCalled).toBe(false);
      expect(JSON.stringify(report)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("accepts a prepared ref when only signed_url is an uploadable HTTPS URL", async () => {
    const cwd = await writeContextBackedCwd();
    try {
      const report = await buildV097UploadPackageResolutionDryRun({
        cwd,
        env: readyEnv(),
        loadUploadPackages: async () => [readyUploadPackage()],
        preparedVideoAssetRefs: {
          father_jobs: preparedVideoAssetRef({
            prepared_video_asset_url: null,
            signed_url: RAW_SIGNED_VIDEO_ASSET_URL
          })
        }
      });

      expect(report.status).toBe("package_resolution_ready");
      expect(report.preparedAssetEvidencePresent).toBe(true);
      expect(report.preparedAssetServerAccessible).toBe(true);
      expect(report.preparedAssetUploadableUrlPresent).toBe(true);
      expect(report.resolverUploadRequestBuilt).toBe(true);
      expect(report.videosInsertCalled).toBe(false);
      expect(report.commentThreadsInsertCalled).toBe(false);
      expect(JSON.stringify(report)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("reports sanitized package id mismatch instead of hiding it as a generic missing package", async () => {
    const cwd = await writeContextBackedCwd();
    try {
      const report = await buildV097UploadPackageResolutionDryRun({
        cwd,
        env: readyEnv(),
        loadUploadPackages: async () => [readyUploadPackage({ packageId: "pkg-v097-other" })],
        preparedVideoAssetRefs: {
          father_jobs: preparedVideoAssetRef()
        }
      });

      expect(report.status).toBe("blocked");
      expect(report.resolverPackageFound).toBe(false);
      expect(report.resolverUploadRequestBuilt).toBe(false);
      expect(report.resolverBlocker).toBe("BLOCKED_V081_UPLOAD_PACKAGE_MISSING");
      expect(report.packageCount).toBe(1);
      expect(report.packageIdMatch).toBe(false);
      expect(report.queueItemIdMatch).toBe(true);
      expect(report.channelKeyMatch).toBe(true);
      expect(report.videosInsertCalled).toBe(false);
      expect(report.commentThreadsInsertCalled).toBe(false);
      expect(JSON.stringify(report)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("preserves explicit uploadAssetProfile into V094 package resolution diagnostics", async () => {
    const cwd = await writeContextBackedCwd();
    try {
      const report = await buildV097UploadPackageResolutionDryRun({
        cwd,
        env: readyEnv({ V051_UPLOAD_ASSET_PROFILE: V057_REUPLOAD_ASSET_PROFILE }),
        loadUploadPackages: async () => [readyUploadPackage()],
        preparedVideoAssetRefs: {
          father_jobs: preparedVideoAssetRef()
        }
      });

      expect(report.uploadAssetProfileLabel).toBe(V057_REUPLOAD_ASSET_PROFILE);
      expect(report.resolverUploadRequestBuilt).toBe(true);
      expect(report.preparedAssetUploadableUrlPresent).toBe(true);
      expect(report.videosInsertCalled).toBe(false);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("package.json exposes the V097 no-upload package resolution dry-run command", async () => {
    const pkg = JSON.parse(await readFile("package.json", "utf8"));

    expect(pkg.scripts["upload:v097:package-resolution-dry-run"]).toBe(
      "tsx scripts/uploads/dry-run-v097-upload-package-resolution.ts"
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
  const cwd = await mkdtemp(path.join(os.tmpdir(), "commerce-v097-"));
  const contextPath = path.join(cwd, DEFAULT_V095_PRIVATE_PILOT_EXECUTION_CONTEXT_RELATIVE_PATH);
  await mkdir(path.dirname(contextPath), { recursive: true });
  await writeFile(contextPath, `${JSON.stringify({
    version: "v095",
    channelKey: "father_jobs",
    queueItemId: "queue-v097-father",
    uploadPackageId: "pkg-v097-father",
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
    generatedAt: "2026-07-07T00:00:00.000Z",
    contextCreatedAt: "2026-07-07T00:00:00.000Z",
    contextExpiresAt: "2099-01-01T00:00:00.000Z"
  }, null, 2)}\n`, "utf8");
  return cwd;
}

function readyUploadPackage(overrides: Partial<V073UploadPackage> = {}): V073UploadPackage & {
  shortsContentQuality: unknown;
} {
  const base: V073UploadPackage & { shortsContentQuality: unknown } = {
    packageId: "pkg-v097-father",
    queueItemId: "queue-v097-father",
    generatedContentId: "generated-v097-father",
    channelKey: "father_jobs",
    assetProfile: V057_REUPLOAD_ASSET_PROFILE,
    productSource: {
      rawCoupangUrl: RAW_COUPANG_URL,
      productName: "v097 product",
      sourceKind: "trusted_upstream_manifest",
      sourceEvidenceHash: "sourcehashv097",
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
      title: "v097 private pilot",
      description: `v097 package.\n\n${DEFAULT_YOUTUBE_PRODUCT_DISCLOSURE_TEXT}`,
      tags: ["v097"],
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
      signature: "duplicate-v097"
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
    asset_id: "asset-v097-prepared",
    signed_url: RAW_SIGNED_VIDEO_ASSET_URL,
    prepared_video_asset_url: RAW_SIGNED_VIDEO_ASSET_URL,
    mime_type: "video/mp4",
    checksum_sha256: "videoasset",
    expires_at: "2099-01-01T00:00:00.000Z",
    provider: "signed_url",
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
