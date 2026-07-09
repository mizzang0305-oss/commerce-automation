import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import type { PreparedVideoAssetRef } from "../src/lib/uploads/youtube/uploadAssetContract";
import { DEFAULT_YOUTUBE_PRODUCT_DISCLOSURE_TEXT } from "../src/lib/uploads/youtube";
import type { ProductQueueItem } from "../src/types/automation";
import type { ChannelKey } from "../src/uploads/multi-channel/channelProfiles";
import { V057_REUPLOAD_ASSET_PROFILE } from "../src/uploads/multi-channel/v057ReuploadAssetBinding";
import type { V073UploadPackage } from "../src/uploads/multi-channel/v073UploadPackage";
import {
  buildV106UploadPackageEvidenceReport,
  type V106UploadPackageEvidenceReport
} from "../src/automation/uploadPackageEvidenceProbe";

const RAW_AFFILIATE_URL = "https://link.coupang.com/a/v106-hidden-affiliate";
const RAW_COUPANG_URL = "https://www.coupang.com/vp/products/v106-hidden-product";
const RAW_SIGNED_URL = "https://asset-bridge.example.test/private/v106.mp4?signature=secret";
const RAW_PREPARED_URL = "https://asset-bridge.example.test/private/v106-prepared.mp4?token=secret";
const RAW_LOCAL_PATH =
  "C:\\Users\\LOVE\\MyProjects\\commerce-automation\\commerce-assets\\review\\v057\\father_jobs\\corrected-preview-v057.mp4";
const FULL_CHANNEL_ID = `UC${"5".repeat(22)}`;
const FULL_VIDEO_ID = "v106FULLVIDEOID";
const FORBIDDEN_REPORT_PATTERN = new RegExp(
  [
    RAW_AFFILIATE_URL,
    RAW_COUPANG_URL,
    RAW_SIGNED_URL,
    RAW_PREPARED_URL,
    RAW_LOCAL_PATH.replace(/\\/g, "\\\\"),
    FULL_CHANNEL_ID,
    FULL_VIDEO_ID,
    "Authorization",
    "Bearer",
    "HmacSHA256",
    "client_secret",
    "token=secret",
    "signature=secret",
    "signed_url",
    "prepared_video_asset_url",
    "api_key="
  ].map(escapeRegExp).join("|"),
  "i"
);

describe("v106 upload package affiliate and asset evidence no-upload", () => {
  test("blocks when V105 cannot resolve a queue item", async () => {
    const report = await buildV106UploadPackageEvidenceReport({
      queueItems: [],
      uploadPackages: []
    });

    expect(report.FINAL_STATUS).toBe("BLOCKED_V105_NO_QUEUE_ITEM_FOR_NEXT_BATCH_NO_UPLOAD");
    expect(report.selectedItemFound).toBe(false);
    expect(report.uploadPackageFound).toBe(false);
    expect(report.currentBlocker).toBe("BLOCKED_V105_NO_QUEUE_ITEM_FOR_NEXT_BATCH_NO_UPLOAD");
    expectNoSideEffects(report);
  });

  test("selects the V105 queue item and blocks when upload package is missing", async () => {
    const queue = queueItem();
    const report = await buildV106UploadPackageEvidenceReport({
      queueItems: [queue],
      uploadPackages: [],
      now: "2026-07-09T00:00:00.000Z"
    });

    expect(report.FINAL_STATUS).toBe("BLOCKED_V106_UPLOAD_PACKAGE_MISSING_NO_UPLOAD");
    expect(report.selectedItemFound).toBe(true);
    expect(report.selectedItemShortId).toBe(hashPrefix(queue.id));
    expect(report.selectedQueueStatus).toBe("manual_review");
    expect(report.selectedManualReviewStatus).toBe("not_ready");
    expect(report.uploadPackageFound).toBe(false);
    expect(report.packageChannelMatches).toBe(false);
    expect(report.packageQueueItemMatches).toBe(false);
    expectNoSideEffects(report);
  });

  test("blocks when package exists but affiliate or disclosure evidence is missing", async () => {
    const queue = queueItem();
    const report = await buildV106UploadPackageEvidenceReport({
      queueItems: [queue],
      uploadPackages: [
        uploadPackage({
          queueItemId: queue.id,
          affiliateReady: false,
          disclosureReady: false
        })
      ],
      now: "2026-07-09T00:00:00.000Z"
    });

    expect(report.FINAL_STATUS).toBe("BLOCKED_V106_AFFILIATE_OR_DISCLOSURE_EVIDENCE_MISSING_NO_UPLOAD");
    expect(report.uploadPackageFound).toBe(true);
    expect(report.packageChannelMatches).toBe(true);
    expect(report.packageQueueItemMatches).toBe(true);
    expect(report.affiliateEvidencePresent).toBe(false);
    expect(report.coupangDisclosurePresent).toBe(false);
    expectNoSideEffects(report);
  });

  test("blocks when package exists but prepared HTTPS asset evidence is missing", async () => {
    const queue = queueItem();
    const report = await buildV106UploadPackageEvidenceReport({
      queueItems: [queue],
      uploadPackages: [uploadPackage({ queueItemId: queue.id })],
      now: "2026-07-09T00:00:00.000Z"
    });

    expect(report.FINAL_STATUS).toBe("BLOCKED_V081_VIDEO_ASSET_MISSING_NO_UPLOAD");
    expect(report.videoAssetEvidencePresent).toBe(true);
    expect(report.videoAssetHashPrefix).toBe("videoasset");
    expect(report.firstFrameEvidencePresent).toBe(true);
    expect(report.firstFrameHashPrefix).toBe("firstframe");
    expect(report.preparedHttpsAssetEvidencePresent).toBe(false);
    expect(report.preparedAssetServerAccessible).toBe(false);
    expect(report.preparedAssetHashPrefix).toBe("videoasset");
    expectNoSideEffects(report);
  });

  test("reports success only when package, affiliate, disclosure, and prepared asset evidence are present", async () => {
    const queue = queueItem();
    const report = await buildV106UploadPackageEvidenceReport({
      queueItems: [queue],
      uploadPackages: [uploadPackage({ queueItemId: queue.id })],
      preparedVideoAssetRefs: {
        father_jobs: preparedVideoAssetRef()
      },
      now: "2026-07-09T00:00:00.000Z"
    });

    expect(report.FINAL_STATUS).toBe("SUCCESS_V106_UPLOAD_PACKAGE_EVIDENCE_READY_NO_UPLOAD");
    expect(report.currentBlocker).toBeNull();
    expect(report.uploadPackageFound).toBe(true);
    expect(report.packageHashPrefix).toBe(hashPrefix(`pkg-${queue.id}`));
    expect(report.titlePresent).toBe(true);
    expect(report.descriptionPresent).toBe(true);
    expect(report.tagsPresent).toBe(true);
    expect(report.categoryIdPresent).toBe(true);
    expect(report.coupangDisclosurePresent).toBe(true);
    expect(report.affiliateEvidencePresent).toBe(true);
    expect(report.affiliateEvidenceHashPrefix).toBe("affiliate");
    expect(report.preparedHttpsAssetEvidencePresent).toBe(true);
    expect(report.preparedAssetServerAccessible).toBe(true);
    expect(report.SAFE_TO_UPLOAD).toBe(false);
    expect(report.SAFE_TO_PUBLIC_UPLOAD).toBe(false);
    expectNoSideEffects(report);
  });

  test("blocks execute mode fail-closed without webhook or upload mutation", async () => {
    const queue = queueItem();
    const report = await buildV106UploadPackageEvidenceReport({
      mode: "execute",
      queueItems: [queue],
      uploadPackages: [uploadPackage({ queueItemId: queue.id })],
      preparedVideoAssetRefs: {
        father_jobs: preparedVideoAssetRef()
      }
    });

    expect(report.FINAL_STATUS).toBe("BLOCKED_V106_EXECUTE_NOT_APPROVED_NO_UPLOAD");
    expect(report.currentBlocker).toBe("BLOCKED_V106_EXECUTE_NOT_APPROVED_NO_UPLOAD");
    expect(report.uploadPackageFound).toBe(false);
    expectNoSideEffects(report);
  });

  test("package.json exposes the V106 no-upload evidence command", async () => {
    const pkg = JSON.parse(await readFile("package.json", "utf8"));

    expect(pkg.scripts["automation:v106:upload-package-evidence"]).toBe(
      "tsx scripts/automation/run-v106-upload-package-evidence.ts"
    );
  });
});

function queueItem(overrides: Partial<ProductQueueItem> = {}): ProductQueueItem {
  const id = overrides.id ?? "queue-v106-father-jobs";
  return {
    id,
    channelKey: overrides.channelKey ?? "father_jobs",
    queue_date: "2026-07-09",
    queue_rank: overrides.queue_rank ?? 1,
    upload_slot: 1,
    scheduled_at: overrides.scheduled_at ?? "2026-07-09T00:00:00.000Z",
    keyword: "car storage",
    theme: "first video",
    product_name: "vehicle cup holder organizer",
    category_path: "car/storage",
    price_now_text: "",
    thumbnail_url: "",
    raw_coupang_url: RAW_COUPANG_URL,
    selected_affiliate_url: RAW_AFFILIATE_URL,
    product_score: 90,
    score_reason: "safe fixture",
    video_angle: "safe fixture",
    queue_status: overrides.queue_status ?? "manual_review",
    video_url: "",
    video_snapshot_url: "",
    blog_draft_url: "",
    youtube_upload_status: "not_ready",
    tiktok_upload_status: "not_ready",
    threads_post_status: "not_ready",
    manual_review_status: overrides.manual_review_status ?? "not_ready",
    error_message: "",
    created_at: "2026-07-09T00:00:00.000Z",
    updated_at: "2026-07-09T00:00:00.000Z",
    ...overrides
  };
}

function uploadPackage(input: {
  queueItemId: string;
  channelKey?: ChannelKey;
  affiliateReady?: boolean;
  disclosureReady?: boolean;
  videoReady?: boolean;
  firstFrameReady?: boolean;
  title?: string;
  description?: string;
  tags?: string[];
  categoryId?: "26" | "";
}): V073UploadPackage {
  const channelKey = input.channelKey ?? "father_jobs";
  const affiliateReady = input.affiliateReady ?? true;
  const disclosureReady = input.disclosureReady ?? true;
  const videoReady = input.videoReady ?? true;
  const firstFrameReady = input.firstFrameReady ?? true;
  const title = input.title ?? "v106 private pilot evidence";
  const description = input.description ??
    (disclosureReady
      ? `v106 package.\n\n${DEFAULT_YOUTUBE_PRODUCT_DISCLOSURE_TEXT}`
      : "v106 package without commerce disclosure evidence");
  const tags = input.tags ?? ["v106", "shorts"];
  const categoryId = input.categoryId ?? "26";

  return {
    packageId: `pkg-${input.queueItemId}`,
    queueItemId: input.queueItemId,
    generatedContentId: "generated-v106",
    channelKey,
    assetProfile: V057_REUPLOAD_ASSET_PROFILE,
    productSource: {
      rawCoupangUrl: RAW_COUPANG_URL,
      productName: "vehicle cup holder organizer",
      sourceKind: "product_queue_item_generated_content_pair",
      sourceEvidenceHash: "sourcehashv106",
      runtimeSourceApproved: true
    },
    deeplink: {
      selectedAffiliateUrl: affiliateReady ? RAW_AFFILIATE_URL : null,
      source: "deeplink",
      status: affiliateReady ? "ready" : "pending",
      sanitizedEvidence: {
        affiliateUrlPresent: affiliateReady,
        affiliateUrlPrinted: false,
        affiliateHashPrefix: affiliateReady ? "affiliate" : null
      }
    },
    videoAsset: {
      path: RAW_LOCAL_PATH,
      basename: videoReady ? "corrected-preview-v057.mp4" : "",
      hashEvidence: videoReady ? "videoasset" : "",
      firstFramePath: "hidden-first-frame.jpg",
      firstFrameBasename: firstFrameReady ? "first-frame-v057.jpg" : "",
      firstFrameHashEvidence: firstFrameReady ? "firstframe" : "",
      duration: null,
      resolution: null
    },
    youtubeMetadata: {
      title,
      description,
      tags,
      categoryId: categoryId as "26",
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
      commentText: disclosureReady
        ? `${DEFAULT_YOUTUBE_PRODUCT_DISCLOSURE_TEXT}\n\nmasked ${RAW_AFFILIATE_URL}`
        : `masked ${RAW_AFFILIATE_URL}`,
      affiliateUrlRequiredBeforeExecution: true,
      coupangPartnersDisclosurePresent: disclosureReady
    },
    targetChannel: {
      channelKey,
      channelIdHashPrefix: hashPrefix(FULL_CHANNEL_ID),
      formatValid: true,
      rawChannelIdPrinted: false
    },
    duplicateGuard: {
      ready: true,
      duplicateUploadRisk: false,
      signature: "duplicate-v106"
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
}

function preparedVideoAssetRef(): PreparedVideoAssetRef {
  return {
    asset_id: "prepared-v106",
    signed_url: RAW_SIGNED_URL,
    prepared_video_asset_url: RAW_PREPARED_URL,
    mime_type: "video/mp4",
    size_bytes: 1024,
    checksum_sha256: "videoassetprepared",
    expires_at: "2099-01-01T00:00:00.000Z",
    provider: "signed_https",
    server_accessible: true
  };
}

function expectNoSideEffects(report: V106UploadPackageEvidenceReport) {
  expect(report.uploadExecutionAllowed).toBe(false);
  expect(report.videosInsertCalled).toBe(false);
  expect(report.videosInsertTotalCount).toBe(0);
  expect(report.commentThreadsInsertCalled).toBe(false);
  expect(report.n8nWebhookCalled).toBe(false);
  expect(report.schedulerExecutionCalled).toBe(false);
  expect(report.DB_write).toBe(false);
  expect(report.Supabase_write).toBe(false);
  expect(report.R2_upload).toBe(false);
  expect(report.storage_write).toBe(false);
  expect(report.rawAffiliateUrlPrinted).toBe(false);
  expect(report.rawCoupangUrlPrinted).toBe(false);
  expect(report.raw_urls_printed).toBe(false);
  expect(report.raw_file_paths_printed).toBe(false);
  expect(report.raw_video_ids_printed).toBe(false);
  expect(report.raw_channel_ids_printed).toBe(false);
  expect(report.secrets_printed).toBe(false);
  expect(report.fake_success).toBe(false);
  expect(report.SAFE_TO_UPLOAD).toBe(false);
  expect(report.SAFE_TO_PUBLIC_UPLOAD).toBe(false);
  expect(JSON.stringify(report)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
}

function hashPrefix(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 10);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
