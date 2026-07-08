import { describe, expect, test } from "vitest";

import type { ProductQueueItem } from "../src/types/automation";
import type { PreparedVideoAssetRef } from "../src/lib/uploads/youtube/uploadAssetContract";
import type { ChannelKey } from "../src/uploads/multi-channel/channelProfiles";
import type { V073UploadPackage } from "../src/uploads/multi-channel/v073UploadPackage";
import {
  buildV102FirstVideoSettingsPreflight,
  selectV102FirstVideoCandidate
} from "../src/uploads/youtube/v102FirstVideoSettingsPreflight";
import { V057_REUPLOAD_ASSET_PROFILE } from "../src/uploads/multi-channel/v057ReuploadAssetBinding";
import { PASSING_SHORTS_CONTENT_QUALITY } from "./fixtures/youtubeShortsContentQuality";

const RAW_AFFILIATE_URL = "https://link.coupang.com/a/v102-hidden-affiliate";
const RAW_COUPANG_URL = "https://www.coupang.com/vp/products/v102-hidden-product";
const RAW_SIGNED_URL = "https://asset-bridge.example.test/private/v102.mp4?signature=secret";
const RAW_LOCAL_PATH =
  "C:\\Users\\LOVE\\MyProjects\\commerce-automation\\commerce-assets\\review\\v057\\father_jobs\\corrected-preview-v057.mp4";
const FULL_VIDEO_ID = "abc123FULLVIDEOID";
const FULL_CHANNEL_ID = `UC${"9".repeat(22)}`;
const FULL_QUEUE_ID = "queue-v102-father-jobs-full-id-must-not-print";
const FORBIDDEN_REPORT_PATTERN = new RegExp(
  [
    RAW_AFFILIATE_URL,
    RAW_COUPANG_URL,
    RAW_SIGNED_URL,
    RAW_LOCAL_PATH.replace(/\\/g, "\\\\"),
    FULL_VIDEO_ID,
    FULL_CHANNEL_ID,
    FULL_QUEUE_ID,
    "Authorization",
    "Bearer",
    "HmacSHA256",
    "client_secret",
    "token=secret",
    "signature=secret"
  ].map(escapeRegExp).join("|"),
  "i"
);

describe("v102 first video settings preflight no-upload", () => {
  test("selects one due scheduled item for the selected channel and reports prepared asset blocker without raw evidence", async () => {
    const queueItems = [
      queueItem({ id: "queue-v102-skipped", channelKey: "father_jobs", queue_rank: 1, queue_status: "skipped" }),
      queueItem({ id: FULL_QUEUE_ID, channelKey: "father_jobs", queue_rank: 2, queue_status: "scheduled" }),
      queueItem({ id: "queue-v102-other", channelKey: "lets_buy", queue_rank: 1, queue_status: "scheduled" }),
      queueItem({ id: "queue-v102-second", channelKey: "father_jobs", queue_rank: 3, queue_status: "scheduled" })
    ];

    const report = await buildV102FirstVideoSettingsPreflight({
      selectedChannelKey: "father_jobs",
      queueItems,
      uploadPackages: [uploadPackage({ queueItemId: FULL_QUEUE_ID, preparedReady: false })],
      now: () => "2026-07-08T00:00:00.000Z"
    });

    expect(report.version).toBe("v102");
    expect(report.mode).toBe("first_video_settings_preflight_no_upload");
    expect(report.FINAL_STATUS).toBe("BLOCKED_V081_VIDEO_ASSET_MISSING_NO_UPLOAD");
    expect(report.selectedItemFound).toBe(true);
    expect(report.selectedChannelKey).toBe("father_jobs");
    expect(report.selectedItemShortId).toMatch(/^[a-f0-9]{10}$/);
    expect(report.selectedItemShortId).not.toBe(FULL_QUEUE_ID);
    expect(report.selectedItem?.queue_rank).toBe(2);
    expect(report.selectedItem?.queue_status).toBe("scheduled");
    expect(report.videoSettingsReady).toBe(false);
    expect(report.commentSettingsReady).toBe(true);
    expect(report.disclosureReady).toBe(true);
    expect(report.affiliateEvidenceReady).toBe(true);
    expect(report.preparedAssetReady).toBe(false);
    expect(report.currentBlocker).toBe("BLOCKED_V081_VIDEO_ASSET_MISSING_NO_UPLOAD");
    expect(report.videoSettings.visibilityLocked).toBe("private");
    expect(report.videoSettings.publicUploadAllowed).toBe(false);
    expect(report.videoSettings.unlistedUploadAllowed).toBe(false);
    expect(report.commentSettings.commentAutomationEnabled).toBe(false);
    expect(report.uploadExecuteCalled).toBe(false);
    expect(report.videosInsertCalled).toBe(false);
    expect(report.videosInsertTotalCount).toBe(0);
    expect(report.commentThreadsInsertCalled).toBe(false);
    expect(report.schedulerExecutionCalled).toBe(false);
    expect(report.SAFE_TO_UPLOAD).toBe(false);
    expect(report.SAFE_TO_PUBLIC_UPLOAD).toBe(false);
    expect(JSON.stringify(report)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });

  test("falls back from scheduled to ready_for_manual_upload and becomes ready only with prepared HTTPS evidence", async () => {
    const queueItems = [
      queueItem({ id: "queue-v102-hold", channelKey: "father_jobs", queue_rank: 1, queue_status: "hold" }),
      queueItem({ id: FULL_QUEUE_ID, channelKey: "father_jobs", queue_rank: 4, queue_status: "ready_for_manual_upload" })
    ];

    const report = await buildV102FirstVideoSettingsPreflight({
      selectedChannelKey: "father_jobs",
      queueItems,
      uploadPackages: [uploadPackage({ queueItemId: FULL_QUEUE_ID, preparedReady: true })],
      preparedVideoAssetRefs: {
        father_jobs: preparedVideoAssetRef()
      },
      now: () => "2026-07-08T00:00:00.000Z"
    });

    expect(report.FINAL_STATUS).toBe("SUCCESS_V102_FIRST_VIDEO_SETTINGS_PREFLIGHT_READY_NO_UPLOAD_NO_COMMENT");
    expect(report.selectedItem?.queue_status).toBe("ready_for_manual_upload");
    expect(report.videoSettingsReady).toBe(true);
    expect(report.commentSettingsReady).toBe(true);
    expect(report.preparedAssetReady).toBe(true);
    expect(report.currentBlocker).toBeNull();
    expect(report.videoSettings.serverAccessible).toBe(true);
    expect(report.videoSettings.preparedHttpsAssetEvidencePresent).toBe(true);
    expect(report.commentSettings.rawAffiliateUrlPrinted).toBe(false);
    expect(report.raw_urls_printed).toBe(false);
    expect(report.raw_file_paths_printed).toBe(false);
    expect(report.raw_video_ids_printed).toBe(false);
    expect(report.raw_channel_ids_printed).toBe(false);
    expect(report.secrets_printed).toBe(false);
    expect(report.fake_success).toBe(false);
    expect(JSON.stringify(report)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });

  test("blocks when no first video candidate exists for the selected channel", async () => {
    const report = await buildV102FirstVideoSettingsPreflight({
      selectedChannelKey: "father_jobs",
      queueItems: [
        queueItem({ id: "queue-v102-other", channelKey: "lets_buy", queue_rank: 1, queue_status: "scheduled" }),
        queueItem({ id: "queue-v102-error", channelKey: "father_jobs", queue_rank: 2, queue_status: "error" })
      ],
      uploadPackages: []
    });

    expect(report.FINAL_STATUS).toBe("BLOCKED_NO_FIRST_VIDEO_CANDIDATE_NO_UPLOAD");
    expect(report.selectedItemFound).toBe(false);
    expect(report.selectedItemShortId).toBeNull();
    expect(report.currentBlocker).toBe("BLOCKED_NO_FIRST_VIDEO_CANDIDATE_NO_UPLOAD");
    expect(report.uploadExecuteCalled).toBe(false);
    expect(report.videosInsertCalled).toBe(false);
    expect(report.commentThreadsInsertCalled).toBe(false);
    expect(JSON.stringify(report)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });

  test("candidate selector uses only one item and follows scheduled, manual-ready, review fallback order", () => {
    const now = new Date("2026-07-08T00:00:00.000Z");
    const scheduled = queueItem({ id: "scheduled-lowest-rank", channelKey: "father_jobs", queue_rank: 5, queue_status: "scheduled" });
    const manualReady = queueItem({ id: "manual-ready-lower-rank", channelKey: "father_jobs", queue_rank: 1, queue_status: "ready_for_manual_upload" });
    const review = queueItem({ id: "manual-review-lower-rank", channelKey: "father_jobs", queue_rank: 0, queue_status: "manual_review" });

    expect(selectV102FirstVideoCandidate([manualReady, scheduled, review], "father_jobs", now)?.id).toBe(scheduled.id);
    expect(selectV102FirstVideoCandidate([manualReady, review], "father_jobs", now)?.id).toBe(manualReady.id);
    expect(selectV102FirstVideoCandidate([review], "father_jobs", now)?.id).toBe(review.id);
  });
});

function queueItem(overrides: Partial<ProductQueueItem> = {}): ProductQueueItem {
  return {
    id: overrides.id ?? "queue-v102-default",
    channelKey: overrides.channelKey ?? "father_jobs",
    queue_date: "2026-07-08",
    queue_rank: overrides.queue_rank ?? 1,
    upload_slot: 1,
    scheduled_at: overrides.scheduled_at ?? "2026-07-07T00:00:00.000Z",
    keyword: "car storage",
    theme: "first video settings",
    product_name: "vehicle cup holder organizer",
    category_path: "car/storage",
    price_now_text: "hidden",
    thumbnail_url: "",
    raw_coupang_url: RAW_COUPANG_URL,
    selected_affiliate_url: RAW_AFFILIATE_URL,
    product_score: 90,
    score_reason: "fixture",
    video_angle: "fixture",
    queue_status: overrides.queue_status ?? "scheduled",
    video_url: "",
    video_snapshot_url: "",
    blog_draft_url: "",
    youtube_upload_status: "ready_to_upload",
    tiktok_upload_status: "not_ready",
    threads_post_status: "not_ready",
    manual_review_status: overrides.manual_review_status ?? "ready_for_review",
    error_message: "",
    created_at: "2026-07-07T00:00:00.000Z",
    updated_at: "2026-07-07T00:00:00.000Z",
    ...overrides
  };
}

function uploadPackage(input: {
  queueItemId: string;
  channelKey?: ChannelKey;
  preparedReady: boolean;
}): V073UploadPackage {
  const channelKey = input.channelKey ?? "father_jobs";
  return {
    packageId: `pkg-${input.queueItemId}`,
    queueItemId: input.queueItemId,
    generatedContentId: "generated-v102",
    channelKey,
    assetProfile: V057_REUPLOAD_ASSET_PROFILE,
    productSource: {
      rawCoupangUrl: RAW_COUPANG_URL,
      productName: "vehicle cup holder organizer",
      sourceKind: "product_queue_item_generated_content_pair",
      sourceEvidenceHash: "sourcehashprefix",
      runtimeSourceApproved: true
    },
    deeplink: {
      selectedAffiliateUrl: RAW_AFFILIATE_URL,
      source: "deeplink",
      status: "ready",
      sanitizedEvidence: {
        affiliateUrlPresent: true,
        affiliateUrlPrinted: false,
        affiliateHashPrefix: "affiliateh"
      }
    },
    videoAsset: {
      path: RAW_LOCAL_PATH,
      basename: "corrected-preview-v057.mp4",
      hashEvidence: "videoasset",
      firstFramePath: "hidden-first-frame.jpg",
      firstFrameBasename: "first-frame-v057.jpg",
      firstFrameHashEvidence: "firstframe",
      duration: null,
      resolution: null
    },
    youtubeMetadata: {
      title: "Practical check - vehicle cup holder organizer #shorts",
      description:
        "Vehicle storage check.\n\nCoupang Partners disclosure: this video may earn commission from qualifying purchases.",
      tags: ["shorts", "car", "storage"],
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
      commentText: `Coupang Partners disclosure: this comment may earn commission. ${RAW_AFFILIATE_URL}`,
      affiliateUrlRequiredBeforeExecution: true,
      coupangPartnersDisclosurePresent: true
    },
    targetChannel: {
      channelKey,
      channelIdHashPrefix: "targethash",
      formatValid: true,
      rawChannelIdPrinted: false
    },
    duplicateGuard: {
      ready: true,
      duplicateUploadRisk: false,
      signature: "dupsig"
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
    shortsContentQuality: PASSING_SHORTS_CONTENT_QUALITY,
    preparedAssetReady: input.preparedReady
  } as V073UploadPackage & {
    shortsContentQuality: typeof PASSING_SHORTS_CONTENT_QUALITY;
    preparedAssetReady: boolean;
  };
}

function preparedVideoAssetRef(): PreparedVideoAssetRef {
  return {
    asset_id: "prepared-v102",
    provider: "signed_https",
    mime_type: "video/mp4",
    size_bytes: 1024,
    checksum_sha256: "videoassetprepared",
    prepared_video_asset_url: null,
    signed_url: RAW_SIGNED_URL,
    storage_key: null,
    expires_at: "2030-01-01T00:00:00.000Z",
    server_accessible: true
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
