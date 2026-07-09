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
  buildV107OwnerReviewFirstVideoSettingsTable,
  type V107OwnerReviewFirstVideoSettingsTableReport
} from "../src/automation/ownerReviewFirstVideoSettingsTable";
import { buildV106UploadPackageEvidenceReport } from "../src/automation/uploadPackageEvidenceProbe";

const RAW_AFFILIATE_URL = "https://link.coupang.com/a/v107-hidden-affiliate";
const RAW_COUPANG_URL = "https://www.coupang.com/vp/products/v107-hidden-product";
const RAW_SIGNED_URL = "https://asset-bridge.example.test/private/v107.mp4?signature=secret";
const RAW_PREPARED_URL = "https://asset-bridge.example.test/private/v107-prepared.mp4?token=secret";
const RAW_LOCAL_PATH =
  "C:\\Users\\LOVE\\MyProjects\\commerce-automation\\commerce-assets\\review\\v057\\father_jobs\\corrected-preview-v057.mp4";
const FULL_CHANNEL_ID = `UC${"7".repeat(22)}`;
const FULL_VIDEO_ID = "v107FULLVIDEOID";
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

describe("v107 owner review first video settings table no-upload", () => {
  test("creates an owner review table when V105 selects a queue item but upload package is missing", async () => {
    const queue = queueItem();
    const report = await buildV107OwnerReviewFirstVideoSettingsTable({
      queueItems: [queue],
      uploadPackages: [],
      now: "2026-07-09T00:00:00.000Z"
    });

    expect(report.FINAL_STATUS).toBe("SUCCESS_V107_OWNER_REVIEW_TABLE_READY_NO_UPLOAD");
    expect(report.selectedChannelKey).toBe("father_jobs");
    expect(report.selectedItemFound).toBe(true);
    expect(report.selectedItemShortId).toBe(hashPrefix(queue.id));
    expect(report.plannedPayloadMode).toBe("generate_only");
    expect(report.uploadPackageFound).toBe(false);
    expect(report.v105Status).toBe("SUCCESS_V105_QUEUE_TO_GENERATE_ONLY_NEXT_BATCH_PLANNED_NO_UPLOAD");
    expect(report.v106Status).toBe("BLOCKED_V106_UPLOAD_PACKAGE_MISSING_NO_UPLOAD");
    expect(report.v102Status).toBe("BLOCKED_FIRST_VIDEO_SETTINGS_NOT_READY_NO_UPLOAD");
    expect(report.currentBlocker).toBe("BLOCKED_V106_UPLOAD_PACKAGE_MISSING_NO_UPLOAD");
    expect(report.ownerReviewRows.map((row) => row.label)).toEqual(expect.arrayContaining([
      "Upload package",
      "Prepared asset uploadable",
      "Current blocker",
      "Safe to upload",
      "Safe to public upload"
    ]));
    expect(rowByLabel(report, "Upload package")).toMatchObject({
      status: "missing",
      ownerAction: "Create or attach a matching upload package before upload readiness review."
    });
    expect(rowByLabel(report, "Safe to upload")).toMatchObject({
      status: "safe_disabled",
      valueSanitized: false
    });
    expect(report.ownerReviewMarkdownTable).toContain("| Upload package | missing |");
    expectNoSideEffects(report);
  });

  test("reports complete owner rows when V102, V105, and V106 evidence are present", async () => {
    const queue = queueItem({ queue_status: "ready_for_manual_upload", manual_review_status: "ready" });
    const report = await buildV107OwnerReviewFirstVideoSettingsTable({
      queueItems: [queue],
      uploadPackages: [uploadPackage({ queueItemId: queue.id })],
      preparedVideoAssetRefs: {
        father_jobs: preparedVideoAssetRef()
      },
      now: "2026-07-09T00:00:00.000Z"
    });

    expect(report.FINAL_STATUS).toBe("SUCCESS_V107_OWNER_REVIEW_TABLE_READY_NO_UPLOAD");
    expect(report.uploadPackageFound).toBe(true);
    expect(report.affiliateEvidencePresent).toBe(true);
    expect(report.coupangDisclosurePresent).toBe(true);
    expect(report.videoAssetEvidencePresent).toBe(true);
    expect(report.firstFrameEvidencePresent).toBe(true);
    expect(report.preparedHttpsAssetEvidencePresent).toBe(true);
    expect(report.preparedAssetBindingReady).toBe(true);
    expect(report.preparedAssetBridgeReady).toBe(true);
    expect(report.preparedAssetUploadable).toBe(true);
    expect(report.v102Status).toBe("SUCCESS_V102_FIRST_VIDEO_SETTINGS_PREFLIGHT_READY_NO_UPLOAD_NO_COMMENT");
    expect(report.v106Status).toBe("SUCCESS_V106_UPLOAD_PACKAGE_EVIDENCE_READY_NO_UPLOAD");
    expect(report.currentBlocker).toBeNull();
    expect(rowByLabel(report, "Prepared asset uploadable")).toMatchObject({
      status: "present",
      valueSanitized: true,
      blocker: null
    });
    expectNoSideEffects(report);
  });

  test("constrains V102 evidence to the V105 selected queue item when another manual review row sorts first", async () => {
    const selectedByV105 = queueItem({
      id: "queue-v107-selected-not-ready",
      queue_rank: 2,
      manual_review_status: "not_ready"
    });
    const wouldBeSelectedByV102 = queueItem({
      id: "queue-v107-other-ready",
      queue_rank: 1,
      manual_review_status: "ready",
      product_name: "wrong row product"
    });
    const report = await buildV107OwnerReviewFirstVideoSettingsTable({
      queueItems: [wouldBeSelectedByV102, selectedByV105],
      uploadPackages: [uploadPackage({ queueItemId: wouldBeSelectedByV102.id })],
      preparedVideoAssetRefs: {
        father_jobs: preparedVideoAssetRef()
      },
      now: "2026-07-09T00:00:00.000Z"
    });

    expect(report.selectedItemShortId).toBe(hashPrefix(selectedByV105.id));
    expect(report.v102SelectedItemShortId).toBe(hashPrefix(selectedByV105.id));
    expect(report.v106SelectedItemShortId).toBe(hashPrefix(selectedByV105.id));
    expect(report.v102InputConstrainedToSelectedItem).toBe(true);
    expect(report.v102SelectedItemMatchesV105).toBe(true);
    expect(report.v106SelectedItemMatchesV105).toBe(true);
    expect(report.sourceItemConsistency).toBe(true);
    expect(report.v102Status).toBe("BLOCKED_FIRST_VIDEO_SETTINGS_NOT_READY_NO_UPLOAD");
    expect(report.v106Status).toBe("BLOCKED_V106_UPLOAD_PACKAGE_MISSING_NO_UPLOAD");
    expect(report.FINAL_STATUS).toBe("SUCCESS_V107_OWNER_REVIEW_TABLE_READY_NO_UPLOAD");
    expect(rowByLabel(report, "Source item consistency")).toMatchObject({
      status: "present",
      valueSanitized: true,
      blocker: null
    });
    expectNoSideEffects(report);
  });

  test("blocks when a supplied V106 report is not tied to the V105 selected queue item", async () => {
    const selectedByV105 = queueItem({
      id: "queue-v107-v106-selected",
      queue_rank: 1,
      manual_review_status: "not_ready"
    });
    const otherItem = queueItem({
      id: "queue-v107-v106-other",
      queue_rank: 2,
      manual_review_status: "not_ready"
    });
    const v106Report = await buildV106UploadPackageEvidenceReport({
      queueItems: [selectedByV105],
      uploadPackages: [],
      now: "2026-07-09T00:00:00.000Z"
    });
    const report = await buildV107OwnerReviewFirstVideoSettingsTable({
      queueItems: [selectedByV105, otherItem],
      uploadPackages: [],
      v106Report: {
        ...v106Report,
        selectedItemShortId: hashPrefix(otherItem.id)
      },
      now: "2026-07-09T00:00:00.000Z"
    });

    expect(report.FINAL_STATUS).toBe("BLOCKED_V107_SOURCE_ITEM_MISMATCH_NO_UPLOAD");
    expect(report.currentBlocker).toBe("BLOCKED_V107_SOURCE_ITEM_MISMATCH_NO_UPLOAD");
    expect(report.selectedItemShortId).toBe(hashPrefix(selectedByV105.id));
    expect(report.v106SelectedItemShortId).toBe(hashPrefix(otherItem.id));
    expect(report.v102SelectedItemMatchesV105).toBe(true);
    expect(report.v106SelectedItemMatchesV105).toBe(false);
    expect(report.sourceItemConsistency).toBe(false);
    expect(rowByLabel(report, "Source item consistency")).toMatchObject({
      status: "blocked",
      valueSanitized: false,
      blocker: "BLOCKED_V107_SOURCE_ITEM_MISMATCH_NO_UPLOAD",
      ownerAction: "Keep V102, V105, and V106 tied to the same selected queue item."
    });
    expectNoSideEffects(report);
  });

  test("blocks when no queue item can be selected", async () => {
    const report = await buildV107OwnerReviewFirstVideoSettingsTable({
      queueItems: [],
      uploadPackages: []
    });

    expect(report.FINAL_STATUS).toBe("BLOCKED_V107_NO_SELECTED_QUEUE_ITEM_NO_UPLOAD");
    expect(report.selectedItemFound).toBe(false);
    expect(report.ownerReviewRows).toEqual([]);
    expect(report.ownerReviewMarkdownTable).toBe("");
    expect(report.currentBlocker).toBe("BLOCKED_V107_NO_SELECTED_QUEUE_ITEM_NO_UPLOAD");
    expectNoSideEffects(report);
  });

  test("execute mode is fail-closed and never calls upload, comment, n8n, scheduler, or storage", async () => {
    const report = await buildV107OwnerReviewFirstVideoSettingsTable({
      mode: "execute",
      queueItems: [queueItem()],
      uploadPackages: []
    });

    expect(report.FINAL_STATUS).toBe("BLOCKED_V107_EXECUTE_NOT_APPROVED_NO_UPLOAD");
    expect(report.currentBlocker).toBe("BLOCKED_V107_EXECUTE_NOT_APPROVED_NO_UPLOAD");
    expect(report.selectedItemFound).toBe(false);
    expectNoSideEffects(report);
  });

  test("package.json exposes the V107 no-upload owner review table command", async () => {
    const pkg = JSON.parse(await readFile("package.json", "utf8"));

    expect(pkg.scripts["automation:v107:owner-review-table"]).toBe(
      "tsx scripts/automation/run-v107-owner-review-table.ts"
    );
  });
});

function rowByLabel(report: V107OwnerReviewFirstVideoSettingsTableReport, label: string) {
  const row = report.ownerReviewRows.find((candidate) => candidate.label === label);
  expect(row).toBeTruthy();
  return row!;
}

function queueItem(overrides: Partial<ProductQueueItem> = {}): ProductQueueItem {
  const id = overrides.id ?? "queue-v107-father-jobs";
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
}): V073UploadPackage {
  const channelKey = input.channelKey ?? "father_jobs";
  const affiliateReady = input.affiliateReady ?? true;
  const disclosureReady = input.disclosureReady ?? true;
  return {
    packageId: `pkg-${input.queueItemId}`,
    queueItemId: input.queueItemId,
    generatedContentId: "generated-v107",
    channelKey,
    assetProfile: V057_REUPLOAD_ASSET_PROFILE,
    productSource: {
      rawCoupangUrl: RAW_COUPANG_URL,
      productName: "vehicle cup holder organizer",
      sourceKind: "product_queue_item_generated_content_pair",
      sourceEvidenceHash: "sourcehashv107",
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
      basename: "corrected-preview-v057.mp4",
      hashEvidence: "videoasset",
      firstFramePath: "hidden-first-frame.jpg",
      firstFrameBasename: "first-frame-v057.jpg",
      firstFrameHashEvidence: "firstframe",
      duration: null,
      resolution: null
    },
    youtubeMetadata: {
      title: "v107 owner review table",
      description: disclosureReady
        ? `v107 package.\n\n${DEFAULT_YOUTUBE_PRODUCT_DISCLOSURE_TEXT}`
        : "v107 package without disclosure",
      tags: ["v107", "shorts"],
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
      signature: "duplicate-v107"
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

function preparedVideoAssetRef(overrides: Partial<PreparedVideoAssetRef> = {}): PreparedVideoAssetRef {
  return {
    asset_id: "prepared-v107",
    signed_url: RAW_SIGNED_URL,
    prepared_video_asset_url: RAW_PREPARED_URL,
    mime_type: "video/mp4",
    size_bytes: 1024,
    checksum_sha256: "videoassetprepared",
    expires_at: "2099-01-01T00:00:00.000Z",
    provider: "signed_https",
    server_accessible: true,
    ...overrides
  };
}

function expectNoSideEffects(report: V107OwnerReviewFirstVideoSettingsTableReport) {
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
