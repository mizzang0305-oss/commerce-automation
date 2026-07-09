import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import type { PreparedVideoAssetRef } from "../src/lib/uploads/youtube/uploadAssetContract";
import type { ProductQueueItem } from "../src/types/automation";
import {
  buildV108FirstVideoUploadPackageMaterializerReport,
  type V108FirstVideoUploadPackageMaterializerReport
} from "../src/automation/firstVideoUploadPackageMaterializer";
import { buildV107OwnerReviewFirstVideoSettingsTable } from "../src/automation/ownerReviewFirstVideoSettingsTable";

const RAW_AFFILIATE_URL = "https://link.coupang.com/a/v108-hidden-affiliate";
const RAW_COUPANG_URL = "https://www.coupang.com/vp/products/v108-hidden-product";
const RAW_SIGNED_URL = "https://asset-bridge.example.test/private/v108.mp4?signature=secret";
const RAW_PREPARED_URL = "https://asset-bridge.example.test/private/v108-prepared.mp4?token=secret";
const RAW_LOCAL_PATH =
  "C:\\Users\\LOVE\\MyProjects\\commerce-automation\\commerce-assets\\review\\v057\\father_jobs\\corrected-preview-v057.mp4";
const FULL_CHANNEL_ID = `UC${"8".repeat(22)}`;
const FULL_VIDEO_ID = "v108FULLVIDEOID";
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

describe("v108 first video upload package materializer no-upload", () => {
  test("blocks when V107 has no selected queue item", async () => {
    const report = await buildV108FirstVideoUploadPackageMaterializerReport({
      queueItems: [],
      uploadPackages: []
    });

    expect(report.FINAL_STATUS).toBe("BLOCKED_V108_NO_SELECTED_QUEUE_ITEM_NO_UPLOAD");
    expect(report.selectedItemFound).toBe(false);
    expect(report.packageMaterialized).toBe(false);
    expect(report.nextBlocker).toBe("BLOCKED_V108_NO_SELECTED_QUEUE_ITEM_NO_UPLOAD");
    expectNoSideEffects(report);
  });

  test("blocks when the V107 source item consistency gate reports mismatch", async () => {
    const selected = queueItem({ id: "queue-v108-selected" });
    const other = queueItem({ id: "queue-v108-other", queue_rank: 2 });
    const v107Report = await buildV107OwnerReviewFirstVideoSettingsTable({
      queueItems: [selected, other],
      uploadPackages: [],
      now: "2026-07-09T00:00:00.000Z"
    });
    const report = await buildV108FirstVideoUploadPackageMaterializerReport({
      queueItems: [selected, other],
      uploadPackages: [],
      v107Report: {
        ...v107Report,
        sourceItemConsistency: false,
        currentBlocker: "BLOCKED_V107_SOURCE_ITEM_MISMATCH_NO_UPLOAD",
        FINAL_STATUS: "BLOCKED_V107_SOURCE_ITEM_MISMATCH_NO_UPLOAD"
      },
      now: "2026-07-09T00:00:00.000Z"
    });

    expect(report.FINAL_STATUS).toBe("BLOCKED_V108_SOURCE_ITEM_MISMATCH_NO_UPLOAD");
    expect(report.packageMaterialized).toBe(false);
    expect(report.nextBlocker).toBe("BLOCKED_V108_SOURCE_ITEM_MISMATCH_NO_UPLOAD");
    expectNoSideEffects(report);
  });

  test("materializes a matching package skeleton and narrows blocker to affiliate or disclosure evidence", async () => {
    const queue = queueItem({ selected_affiliate_url: "" });
    const report = await buildV108FirstVideoUploadPackageMaterializerReport({
      queueItems: [queue],
      uploadPackages: [],
      now: "2026-07-09T00:00:00.000Z"
    });

    expect(report.FINAL_STATUS).toBe("BLOCKED_V108_AFFILIATE_OR_DISCLOSURE_MISSING_NO_UPLOAD");
    expect(report.selectedItemFound).toBe(true);
    expect(report.selectedItemShortId).toBe(hashPrefix(queue.id));
    expect(report.packageMaterialized).toBe(true);
    expect(report.packageHashPrefix).toBe(hashPrefix(`pkg-v108-${queue.id}`));
    expect(report.packageQueueItemMatches).toBe(true);
    expect(report.packageChannelMatches).toBe(true);
    expect(report.titlePresent).toBe(true);
    expect(report.descriptionPresent).toBe(true);
    expect(report.tagsPresent).toBe(true);
    expect(report.categoryIdPresent).toBe(true);
    expect(report.affiliateEvidencePresent).toBe(false);
    expect(report.nextBlocker).toBe("BLOCKED_V108_AFFILIATE_OR_DISCLOSURE_MISSING_NO_UPLOAD");
    expect(report.v106BeforeStatus).toBe("BLOCKED_V106_UPLOAD_PACKAGE_MISSING_NO_UPLOAD");
    expect(report.v106AfterStatus).toBe("BLOCKED_V106_AFFILIATE_OR_DISCLOSURE_EVIDENCE_MISSING_NO_UPLOAD");
    expectNoSideEffects(report);
  });

  test("narrows blocker to video asset evidence when package and affiliate evidence exist", async () => {
    const queue = queueItem();
    const report = await buildV108FirstVideoUploadPackageMaterializerReport({
      queueItems: [queue],
      uploadPackages: [],
      now: "2026-07-09T00:00:00.000Z"
    });

    expect(report.FINAL_STATUS).toBe("BLOCKED_V081_VIDEO_ASSET_MISSING_NO_UPLOAD");
    expect(report.packageMaterialized).toBe(true);
    expect(report.affiliateEvidencePresent).toBe(true);
    expect(report.coupangDisclosurePresent).toBe(true);
    expect(report.videoAssetEvidencePresent).toBe(true);
    expect(report.firstFrameEvidencePresent).toBe(true);
    expect(report.preparedHttpsAssetEvidencePresent).toBe(false);
    expect(report.preparedAssetUploadable).toBe(false);
    expect(report.nextBlocker).toBe("BLOCKED_V081_VIDEO_ASSET_MISSING_NO_UPLOAD");
    expect(report.v106AfterStatus).toBe("BLOCKED_V081_VIDEO_ASSET_MISSING_NO_UPLOAD");
    expectNoSideEffects(report);
  });

  test("reports success only when package, affiliate, disclosure, and prepared asset evidence are present", async () => {
    const queue = queueItem();
    const report = await buildV108FirstVideoUploadPackageMaterializerReport({
      queueItems: [queue],
      uploadPackages: [],
      preparedVideoAssetRefs: {
        father_jobs: preparedVideoAssetRef()
      },
      now: "2026-07-09T00:00:00.000Z"
    });

    expect(report.FINAL_STATUS).toBe("SUCCESS_V108_UPLOAD_PACKAGE_MATERIALIZED_NO_UPLOAD");
    expect(report.packageMaterialized).toBe(true);
    expect(report.affiliateEvidencePresent).toBe(true);
    expect(report.coupangDisclosurePresent).toBe(true);
    expect(report.videoAssetEvidencePresent).toBe(true);
    expect(report.firstFrameEvidencePresent).toBe(true);
    expect(report.preparedHttpsAssetEvidencePresent).toBe(true);
    expect(report.preparedAssetUploadable).toBe(true);
    expect(report.nextBlocker).toBeNull();
    expect(report.v106AfterStatus).toBe("SUCCESS_V106_UPLOAD_PACKAGE_EVIDENCE_READY_NO_UPLOAD");
    expect(report.SAFE_TO_UPLOAD).toBe(false);
    expect(report.SAFE_TO_PUBLIC_UPLOAD).toBe(false);
    expectNoSideEffects(report);
  });

  test("local_write and execute modes remain blocked in this PR", async () => {
    const localWrite = await buildV108FirstVideoUploadPackageMaterializerReport({
      mode: "local_write",
      queueItems: [queueItem()],
      uploadPackages: []
    });
    const execute = await buildV108FirstVideoUploadPackageMaterializerReport({
      mode: "execute",
      queueItems: [queueItem()],
      uploadPackages: []
    });

    expect(localWrite.FINAL_STATUS).toBe("BLOCKED_V108_LOCAL_WRITE_NOT_APPROVED_NO_UPLOAD");
    expect(localWrite.nextBlocker).toBe("BLOCKED_V108_LOCAL_WRITE_NOT_APPROVED_NO_UPLOAD");
    expect(execute.FINAL_STATUS).toBe("BLOCKED_V108_EXECUTE_NOT_APPROVED_NO_UPLOAD");
    expect(execute.nextBlocker).toBe("BLOCKED_V108_EXECUTE_NOT_APPROVED_NO_UPLOAD");
    expectNoSideEffects(localWrite);
    expectNoSideEffects(execute);
  });

  test("package.json exposes the V108 no-upload materializer command", async () => {
    const pkg = JSON.parse(await readFile("package.json", "utf8"));

    expect(pkg.scripts["automation:v108:first-video-upload-package-materializer"]).toBe(
      "tsx scripts/automation/run-v108-first-video-upload-package-materializer.ts"
    );
  });
});

function queueItem(overrides: Partial<ProductQueueItem> = {}): ProductQueueItem {
  const id = overrides.id ?? "queue-v108-father-jobs";
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

function preparedVideoAssetRef(overrides: Partial<PreparedVideoAssetRef> = {}): PreparedVideoAssetRef {
  return {
    asset_id: "prepared-v108",
    signed_url: RAW_SIGNED_URL,
    prepared_video_asset_url: RAW_PREPARED_URL,
    mime_type: "video/mp4",
    size_bytes: 1024,
    checksum_sha256: "videoassetv108prepared",
    expires_at: "2099-01-01T00:00:00.000Z",
    provider: "signed_https",
    server_accessible: true,
    ...overrides
  };
}

function expectNoSideEffects(report: V108FirstVideoUploadPackageMaterializerReport) {
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
