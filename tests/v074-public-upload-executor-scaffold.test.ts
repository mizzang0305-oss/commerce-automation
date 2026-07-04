import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import type { ChannelKey } from "../src/uploads/multi-channel/channelProfiles";
import type {
  V073UploadPackage,
  V073UploadPackageBlocker,
  V073UploadPackageReport,
  V073UploadPackageReportItem
} from "../src/uploads/multi-channel/v073UploadPackage";
import { V057_REUPLOAD_ASSET_PROFILE } from "../src/uploads/multi-channel/v057ReuploadAssetBinding";
import {
  BlockedV074YouTubeUploadAdapter,
  createDefaultV074YouTubeUploadAdapter,
  MockV074YouTubeUploadAdapter
} from "../src/uploads/youtube/v074YouTubeUploadAdapter";
import { buildV074YouTubeAdvancedSettings } from "../src/uploads/youtube/v074YouTubeAdvancedSettings";
import {
  buildV074YouTubeUploadRequest,
  buildV074YouTubeUploadRequestSanitizedReport
} from "../src/uploads/youtube/v074YouTubeUploadRequestBuilder";
import {
  buildV074PublicUploadSafetyGate,
  type V074PublicUploadSafetyGateInput
} from "../src/uploads/youtube/v074PublicUploadSafetyGate";
import {
  buildV074UpstreamPackageReadinessFromV073Report,
  executeV074PublicUploadPreflight
} from "../src/uploads/youtube/v074PublicUploadExecutor";

const RAW_COUPANG_URL = ["https://www.coupang.com", "vp", "products", "874000001"].join("/");
const AFFILIATE_URL = ["https://link.coupang.com", "a", "v074-father"].join("/");
const FULL_CHANNEL_ID = `UC${"V".repeat(22)}`;
const FORBIDDEN_REPORT_PATTERN = new RegExp([
  "874000001",
  "www.coupang.com",
  "link.coupang.com",
  FULL_CHANNEL_ID,
  "COUPANG_SECRET_KEY",
  "refresh_token",
  "Authorization",
  "HmacSHA256",
  "signature="
].map(escapeRegExp).join("|"), "i");

describe("v074 public upload executor scaffold", () => {
  test("builds a YouTube public upload request from a V073 UploadPackage without upload side effects", () => {
    const uploadPackage = makeUploadPackage();

    const request = buildV074YouTubeUploadRequest(uploadPackage);
    const report = buildV074YouTubeUploadRequestSanitizedReport(request);

    expect(request.uploadPackageId).toBe(uploadPackage.packageId);
    expect(request.channelKey).toBe("father_jobs");
    expect(request.videoAssetRef.basename).toBe("corrected-preview-v057.mp4");
    expect(request.videoAssetRef.hashEvidence).toBe(uploadPackage.videoAsset.hashEvidence);
    expect(request.title).toBe(uploadPackage.youtubeMetadata.title);
    expect(request.description).toBe(uploadPackage.youtubeMetadata.description);
    expect(request.tags).toEqual(uploadPackage.youtubeMetadata.tags);
    expect(request.categoryId).toBe("26");
    expect(request.defaultLanguage).toBe("ko");
    expect(request.defaultAudioLanguage).toBe("ko");
    expect(request.advancedSettings).toEqual(buildV074YouTubeAdvancedSettings());
    expect(request.affiliateDisclosurePresent).toBe(true);
    expect(request.commentPackagePending).toBe(true);
    expect(request.duplicateGuardSignature).toBe(uploadPackage.duplicateGuard.signature);
    expect(request.quotaGuardReady).toBe(true);
    expect(request.approvalStatus).toEqual({
      freshApprovalRequired: true,
      approvalPresent: false
    });
    expect(report.safeToUpload).toBe(false);
    expect(report.uploadExecutionCalled).toBe(false);
    expect(report.videos_insert_called).toBe(false);
    expect(JSON.stringify(report)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });

  test("uses YouTube advanced settings required for public Korean paid promotion Shorts", () => {
    expect(buildV074YouTubeAdvancedSettings()).toEqual({
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
    });
  });

  test("blocks every unsafe readiness condition before upload execution can become ready", () => {
    const cases: Array<{
      name: string;
      patch: Partial<V074PublicUploadSafetyGateInput>;
      blocker: ReturnType<typeof buildV074PublicUploadSafetyGate>["blocker"];
    }> = [
      {
        name: "public upload feature disabled",
        patch: { publicUploadFeatureEnabled: false },
        blocker: "BLOCKED_V074_PUBLIC_UPLOAD_DISABLED"
      },
      {
        name: "approval missing",
        patch: { freshApprovalPresent: false },
        blocker: "BLOCKED_V074_PUBLIC_UPLOAD_APPROVAL_MISSING"
      },
      {
        name: "package not ready",
        patch: { uploadPackageReady: false },
        blocker: "BLOCKED_V074_UPLOAD_PACKAGE_NOT_READY"
      },
      {
        name: "product source not ready",
        patch: { productSourceReady: false },
        blocker: "BLOCKED_V074_UPLOAD_PACKAGE_NOT_READY"
      },
      {
        name: "deeplink not ready",
        patch: { deeplinkReady: false },
        blocker: "BLOCKED_V074_UPLOAD_PACKAGE_NOT_READY"
      },
      {
        name: "affiliate URL not ready",
        patch: { affiliateUrlReady: false },
        blocker: "BLOCKED_V074_UPLOAD_PACKAGE_NOT_READY"
      },
      {
        name: "video asset not ready",
        patch: { videoAssetReady: false },
        blocker: "BLOCKED_V074_VIDEO_ASSET_NOT_READY"
      },
      {
        name: "first frame not ready",
        patch: { firstFrameReady: false },
        blocker: "BLOCKED_V074_VIDEO_ASSET_NOT_READY"
      },
      {
        name: "metadata not ready",
        patch: { metadataReady: false },
        blocker: "BLOCKED_V074_METADATA_NOT_READY"
      },
      {
        name: "description disclosure not ready",
        patch: { descriptionDisclosureReady: false },
        blocker: "BLOCKED_V074_DISCLOSURE_NOT_READY"
      },
      {
        name: "comment disclosure not ready",
        patch: { commentDisclosureReady: false },
        blocker: "BLOCKED_V074_DISCLOSURE_NOT_READY"
      },
      {
        name: "target channel not verified",
        patch: { targetChannelVerified: false },
        blocker: "BLOCKED_V074_TARGET_CHANNEL_NOT_VERIFIED"
      },
      {
        name: "duplicate upload risk",
        patch: { duplicateUploadRisk: true },
        blocker: "BLOCKED_V074_DUPLICATE_UPLOAD_RISK"
      },
      {
        name: "quota not ready",
        patch: { quotaReady: false },
        blocker: "BLOCKED_V074_YOUTUBE_QUOTA_NOT_READY"
      },
      {
        name: "oauth not ready",
        patch: { oauthReady: false },
        blocker: "BLOCKED_V074_YOUTUBE_OAUTH_NOT_READY"
      }
    ];

    for (const testCase of cases) {
      expect(buildV074PublicUploadSafetyGate({
        ...readySafetyGateInput(),
        ...testCase.patch
      }), testCase.name).toMatchObject({
        ready: false,
        safeToUpload: false,
        blocker: testCase.blocker
      });
    }

    expect(buildV074PublicUploadSafetyGate(readySafetyGateInput())).toMatchObject({
      ready: true,
      safeToUpload: true,
      blocker: null
    });
  });

  test("keeps blocked and mock adapters free of real videos.insert mutation and fake success", async () => {
    const request = buildV074YouTubeUploadRequest(makeUploadPackage());
    const blockedAdapter = new BlockedV074YouTubeUploadAdapter();
    const mockAdapter = new MockV074YouTubeUploadAdapter();
    const defaultAdapter = createDefaultV074YouTubeUploadAdapter();

    await expect(blockedAdapter.upload(request)).resolves.toMatchObject({
      status: "BLOCKED",
      blocker: "BLOCKED_V074_REAL_YOUTUBE_MUTATION_FORBIDDEN",
      youtubeVideoId: null,
      videosInsertCalled: false,
      uploadExecutionCalled: false,
      fakeSuccess: false
    });
    await expect(mockAdapter.upload(request)).resolves.toMatchObject({
      status: "MOCK_ONLY",
      youtubeVideoId: null,
      videosInsertCalled: false,
      uploadExecutionCalled: false,
      fakeSuccess: false
    });
    expect(defaultAdapter.mode).toBe("blocked");
  });

  test("preflight report is sanitized, fail-closed, and never executes upload by default", async () => {
    const result = await executeV074PublicUploadPreflight({
      uploadPackage: makeUploadPackage()
    });
    const reportText = JSON.stringify(result.report);

    expect(result.report.FINAL_STATUS).toBe("BLOCKED_V074_PUBLIC_UPLOAD_EXECUTOR_NOT_READY");
    expect(result.report.blocker).toBe("BLOCKED_V074_PUBLIC_UPLOAD_DISABLED");
    expect(result.report.safeToUpload).toBe(false);
    expect(result.report.SAFE_TO_UPLOAD).toBe(false);
    expect(result.report.adapterMode).toBe("blocked");
    expect(result.report.uploadExecutionCalled).toBe(false);
    expect(result.report.youtube_execute_called).toBe(false);
    expect(result.report.videos_insert_called).toBe(false);
    expect(result.report.videos_insert_total_count).toBe(0);
    expect(result.report.comment_create_update_delete_called).toBe(false);
    expect(result.report.visibility_changed).toBe(false);
    expect(result.report.R2_upload).toBe(false);
    expect(result.report.DB_write).toBe(false);
    expect(result.report.product_assets_write).toBe(false);
    expect(result.report.raw_urls_printed).toBe(false);
    expect(result.report.raw_channel_ids_printed).toBe(false);
    expect(result.report.secrets_printed).toBe(false);
    expect(result.report.fake_success).toBe(false);
    expect(reportText).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });

  test("preserves V073 package blockers even when V074 readiness overrides are all ready", async () => {
    const uploadPackage = makeUploadPackage();
    const upstreamReadiness = buildV074UpstreamPackageReadinessFromV073Report({
      uploadPackage,
      report: makeV073Report(uploadPackage, {
        blocker: "BLOCKED_V073_UPLOAD_PACKAGE_VIDEO_ASSET_MISSING",
        item: {
          videoAssetPresent: false
        }
      })
    });

    const result = await executeV074PublicUploadPreflight({
      uploadPackage,
      upstreamPackageReadiness: upstreamReadiness,
      safetyOverrides: readySafetyGateInput()
    });
    const reportText = JSON.stringify(result.report);

    expect(result.safetyGate.ready).toBe(false);
    expect(result.safetyGate.blocker).toBe("BLOCKED_V074_UPLOAD_PACKAGE_NOT_READY");
    expect(result.report.blocker).toBe("BLOCKED_V074_UPLOAD_PACKAGE_NOT_READY");
    expect(result.report.upstreamPackageReady).toBe(false);
    expect(result.report.upstreamPackageBlocker).toBe("BLOCKED_V073_UPLOAD_PACKAGE_VIDEO_ASSET_MISSING");
    expect(result.report.safetyGateReady).toBe(false);
    expect(result.report.videos_insert_called).toBe(false);
    expect(reportText).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });

  test("requires explicit V073 report readiness before uploadPackageReady can be true", async () => {
    const result = await executeV074PublicUploadPreflight({
      uploadPackage: makeUploadPackage(),
      safetyOverrides: readySafetyGateInput()
    });

    expect(result.report.blocker).toBe("BLOCKED_V074_UPLOAD_PACKAGE_NOT_READY");
    expect(result.report.upstreamPackageReady).toBe(false);
    expect(result.report.upstreamPackageBlocker).toBe("BLOCKED_V073_UPLOAD_PACKAGE_READINESS_MISSING");
    expect(result.report.safeToUpload).toBe(false);
  });

  test("derives V074 package readiness only when V073 report and package item are fully ready", () => {
    const uploadPackage = makeUploadPackage();
    const ready = buildV074UpstreamPackageReadinessFromV073Report({
      uploadPackage,
      report: makeV073Report(uploadPackage)
    });
    const blockedCases: Array<{
      name: string;
      blocker: V073UploadPackageBlocker | null;
      item: Partial<V073UploadPackageReportItem>;
    }> = [
      {
        name: "product source missing",
        blocker: "BLOCKED_V073_UPLOAD_PACKAGE_PRODUCT_SOURCE_MISSING",
        item: { productSourcePresent: false }
      },
      {
        name: "first frame missing",
        blocker: "BLOCKED_V073_UPLOAD_PACKAGE_FIRST_FRAME_MISSING",
        item: { firstFramePresent: false }
      },
      {
        name: "target channel missing",
        blocker: "BLOCKED_V073_UPLOAD_PACKAGE_TARGET_CHANNEL_MISSING",
        item: { targetChannelReady: false }
      },
      {
        name: "duplicate guard not ready",
        blocker: "BLOCKED_V073_UPLOAD_PACKAGE_NOT_READY",
        item: { duplicateGuardReady: false }
      }
    ];

    expect(ready).toMatchObject({
      uploadPackageReady: true,
      blocker: null,
      productSourceReady: true,
      videoAssetReady: true,
      firstFrameReady: true,
      disclosureReady: true,
      targetChannelReady: true,
      duplicateUploadRisk: false
    });

    for (const testCase of blockedCases) {
      expect(buildV074UpstreamPackageReadinessFromV073Report({
        uploadPackage,
        report: makeV073Report(uploadPackage, {
          blocker: testCase.blocker,
          item: testCase.item
        })
      }), testCase.name).toMatchObject({
        uploadPackageReady: false,
        blocker: testCase.blocker ?? "BLOCKED_V073_UPLOAD_PACKAGE_NOT_READY"
      });
    }
  });

  test("TASK.md records T004 scaffold work and keeps SAFE_TO_UPLOAD=false", async () => {
    const task = await readFile("TASK.md", "utf8");

    expect(task).toContain("### T004 - V074 Public Upload Executor Scaffold");
    expect(task).toMatch(/### T004 - V074 Public Upload Executor Scaffold[\s\S]*Status: `(IN_PROGRESS|PR_OPEN)`/);
    expect(task).toContain("`SAFE_TO_UPLOAD=false`");
  });
});

function readySafetyGateInput(): V074PublicUploadSafetyGateInput {
  return {
    uploadPackageReady: true,
    productSourceReady: true,
    deeplinkReady: true,
    affiliateUrlReady: true,
    videoAssetReady: true,
    firstFrameReady: true,
    metadataReady: true,
    descriptionDisclosureReady: true,
    commentDisclosureReady: true,
    targetChannelVerified: true,
    duplicateUploadRisk: false,
    quotaReady: true,
    oauthReady: true,
    publicUploadFeatureEnabled: true,
    freshApprovalPresent: true
  };
}

function makeUploadPackage(overrides: Partial<V073UploadPackage> = {}): V073UploadPackage {
  const base: V073UploadPackage = {
    packageId: "pkg-v074-father-jobs",
    queueItemId: "queue-v074-father-jobs",
    generatedContentId: "content-v074-father-jobs",
    channelKey: "father_jobs" satisfies ChannelKey,
    assetProfile: V057_REUPLOAD_ASSET_PROFILE,
    productSource: {
      rawCoupangUrl: RAW_COUPANG_URL,
      productName: "차량용 컵홀더 정리함",
      sourceKind: "product_queue_item_generated_content_pair",
      sourceEvidenceHash: "sourcehash-v074",
      runtimeSourceApproved: true
    },
    deeplink: {
      selectedAffiliateUrl: AFFILIATE_URL,
      source: "deeplink",
      status: "ready",
      sanitizedEvidence: {
        affiliateUrlPresent: true,
        affiliateUrlPrinted: false,
        affiliateHashPrefix: "affhash074"
      }
    },
    videoAsset: {
      path: "commerce-assets/review/v057/father_jobs/corrected-preview-v057.mp4",
      basename: "corrected-preview-v057.mp4",
      hashEvidence: "videohash074",
      firstFramePath: "commerce-assets/review/v057/father_jobs/first-frame-v057.jpg",
      firstFrameBasename: "first-frame-v057.jpg",
      firstFrameHashEvidence: "framehash074",
      duration: null,
      resolution: null
    },
    youtubeMetadata: {
      title: "실용 체크 - 차량용 컵홀더 정리함 #shorts",
      description: "쿠팡파트너스 활동을 통해 일정액의 수수료를 제공받을 수 있습니다.",
      tags: ["father_jobs", "coupang", "shorts"],
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
      commentText: "쿠팡파트너스 활동을 통해 일정액의 수수료를 제공받을 수 있습니다.",
      affiliateUrlRequiredBeforeExecution: true,
      coupangPartnersDisclosurePresent: true
    },
    targetChannel: {
      channelKey: "father_jobs",
      channelIdHashPrefix: "channelhash",
      formatValid: true,
      rawChannelIdPrinted: false
    },
    duplicateGuard: {
      ready: true,
      duplicateUploadRisk: false,
      signature: "dupsig074"
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
    }
  };

  return {
    ...base,
    ...overrides
  };
}

function makeV073Report(
  uploadPackage: V073UploadPackage,
  overrides: {
    blocker?: V073UploadPackageBlocker | null;
    item?: Partial<V073UploadPackageReportItem>;
  } = {}
): V073UploadPackageReport {
  const blocker = overrides.blocker ?? null;
  const item: V073UploadPackageReportItem = {
    packageId: uploadPackage.packageId,
    channelKey: uploadPackage.channelKey,
    assetProfile: uploadPackage.assetProfile,
    productSourcePresent: true,
    productSourceKind: uploadPackage.productSource.sourceKind,
    productSourceHashPrefix: "sourcehash",
    rawCoupangUrlPresent: true,
    rawCoupangUrlPrinted: false,
    affiliateUrlPresent: true,
    affiliateUrlPrinted: false,
    videoAssetPresent: true,
    videoAssetHashPrefix: uploadPackage.videoAsset.hashEvidence,
    firstFramePresent: true,
    disclosureReady: true,
    targetChannelReady: true,
    targetChannelPresent: true,
    targetChannelFormatValid: true,
    targetChannelDuplicateDetected: false,
    targetChannelHashPrefix: uploadPackage.targetChannel.channelIdHashPrefix,
    duplicateGuardReady: true,
    approvalRequired: true,
    uploadExecutionCalled: false,
    safeToUpload: false,
    ...overrides.item
  };

  return {
    version: "v073",
    FINAL_STATUS: blocker === null
      ? "SUCCESS_V073_UPLOAD_PACKAGES_GENERATED_NO_UPLOAD"
      : "BLOCKED_V073_UPLOAD_PACKAGE_NOT_READY",
    SAFE_TO_UPLOAD: false,
    safeToUpload: false,
    selected_profile: uploadPackage.assetProfile,
    upload_package_generator_ready: blocker === null,
    upload_package_count: 1,
    blocker,
    manualAffiliateUrlInputRequired: false,
    manualRawCoupangUrlInputRequired: false,
    productionDefaultAffiliatePath: "coupang_deeplink",
    packages: [item],
    uploadExecutionCalled: false,
    youtube_execute_called: false,
    videos_insert_called: false,
    videos_insert_total_count: 0,
    comment_create_update_delete_called: false,
    visibility_changed: false,
    R2_upload: false,
    DB_write: false,
    product_assets_write: false,
    raw_urls_printed: false,
    raw_channel_ids_printed: false,
    secrets_printed: false,
    fake_success: false
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
