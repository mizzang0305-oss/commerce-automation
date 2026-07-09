import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import type { ProductQueueItem } from "../src/types/automation";
import {
  buildV109ProductSourceAffiliateEvidenceReport,
  type V109ProductSourceAffiliateEvidenceReport
} from "../src/automation/productSourceAffiliateEvidenceBinder";
import { buildV107OwnerReviewFirstVideoSettingsTable } from "../src/automation/ownerReviewFirstVideoSettingsTable";

const RAW_COUPANG_URL = "https://www.coupang.com/vp/products/v109-hidden-product";
const RAW_AFFILIATE_URL = "https://link.coupang.com/a/v109-hidden-affiliate";
const RAW_SIGNED_URL = "https://asset-bridge.example.test/v109.mp4?signature=secret";
const RAW_LOCAL_PATH =
  "C:\\Users\\LOVE\\MyProjects\\commerce-automation\\commerce-assets\\review\\v057\\father_jobs\\corrected-preview-v057.mp4";
const FULL_CHANNEL_ID = `UC${"9".repeat(22)}`;
const FULL_VIDEO_ID = "v109FULLVIDEOID";
const FORBIDDEN_REPORT_PATTERN = new RegExp(
  [
    RAW_COUPANG_URL,
    RAW_AFFILIATE_URL,
    RAW_SIGNED_URL,
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

describe("v109 product source and affiliate evidence binding no-upload", () => {
  test("blocks when V107 has no selected queue item", async () => {
    const report = await buildV109ProductSourceAffiliateEvidenceReport({
      queueItems: [],
      uploadPackages: []
    });

    expect(report.FINAL_STATUS).toBe("BLOCKED_V109_NO_SELECTED_QUEUE_ITEM_NO_UPLOAD");
    expect(report.selectedItemFound).toBe(false);
    expect(report.nextBlocker).toBe("BLOCKED_V109_NO_SELECTED_QUEUE_ITEM_NO_UPLOAD");
    expectNoSideEffects(report);
  });

  test("blocks when the V107 source item consistency gate reports mismatch", async () => {
    const selected = queueItem();
    const v107Report = await buildV107OwnerReviewFirstVideoSettingsTable({
      queueItems: [selected],
      uploadPackages: [],
      now: "2026-07-10T00:00:00.000Z"
    });
    const report = await buildV109ProductSourceAffiliateEvidenceReport({
      queueItems: [selected],
      uploadPackages: [],
      v107Report: {
        ...v107Report,
        FINAL_STATUS: "BLOCKED_V107_SOURCE_ITEM_MISMATCH_NO_UPLOAD",
        currentBlocker: "BLOCKED_V107_SOURCE_ITEM_MISMATCH_NO_UPLOAD",
        sourceItemConsistency: false
      },
      now: "2026-07-10T00:00:00.000Z"
    });

    expect(report.FINAL_STATUS).toBe("BLOCKED_V109_SOURCE_ITEM_MISMATCH_NO_UPLOAD");
    expect(report.selectedItemFound).toBe(true);
    expect(report.sourceItemConsistency).toBe(false);
    expect(report.queuePatchPlanned).toBe(false);
    expect(report.queuePatchApplied).toBe(false);
    expectNoSideEffects(report);
  });

  test("blocks missing or non-Coupang product source evidence", async () => {
    const empty = await buildV109ProductSourceAffiliateEvidenceReport({
      queueItems: [queueItem({ raw_coupang_url: "" })],
      uploadPackages: [],
      now: "2026-07-10T00:00:00.000Z"
    });
    const invalid = await buildV109ProductSourceAffiliateEvidenceReport({
      queueItems: [queueItem({ raw_coupang_url: "https://example.com/not-coupang" })],
      uploadPackages: [],
      now: "2026-07-10T00:00:00.000Z"
    });

    expect(empty.FINAL_STATUS).toBe("BLOCKED_V109_PRODUCT_SOURCE_EVIDENCE_MISSING_NO_UPLOAD");
    expect(empty.productSourceEvidencePresent).toBe(false);
    expect(empty.productSourceApproved).toBe(false);
    expect(empty.productSourceHashPrefix).toBeNull();
    expect(invalid.FINAL_STATUS).toBe("BLOCKED_V109_PRODUCT_SOURCE_EVIDENCE_MISSING_NO_UPLOAD");
    expect(invalid.productSourceEvidencePresent).toBe(false);
    expect(invalid.productSourceApproved).toBe(false);
    expectNoSideEffects(empty);
    expectNoSideEffects(invalid);
  });

  test("blocks missing or invalid affiliate evidence after valid product source", async () => {
    const missing = await buildV109ProductSourceAffiliateEvidenceReport({
      queueItems: [queueItem({ selected_affiliate_url: "" })],
      uploadPackages: [],
      now: "2026-07-10T00:00:00.000Z"
    });
    const invalid = await buildV109ProductSourceAffiliateEvidenceReport({
      queueItems: [queueItem({ selected_affiliate_url: "https://example.com/not-affiliate" })],
      uploadPackages: [],
      now: "2026-07-10T00:00:00.000Z"
    });

    expect(missing.productSourceEvidencePresent).toBe(true);
    expect(missing.productSourceApproved).toBe(true);
    expect(missing.productSourceHashPrefix).toBe(hashPrefix(RAW_COUPANG_URL));
    expect(missing.FINAL_STATUS).toBe("BLOCKED_V109_AFFILIATE_EVIDENCE_MISSING_NO_UPLOAD");
    expect(missing.affiliateEvidencePresent).toBe(false);
    expect(invalid.FINAL_STATUS).toBe("BLOCKED_V109_AFFILIATE_EVIDENCE_MISSING_NO_UPLOAD");
    expect(invalid.affiliateEvidencePresent).toBe(false);
    expectNoSideEffects(missing);
    expectNoSideEffects(invalid);
  });

  test("blocks when disclosure evidence is missing", async () => {
    const report = await buildV109ProductSourceAffiliateEvidenceReport({
      queueItems: [queueItem()],
      uploadPackages: [],
      now: "2026-07-10T00:00:00.000Z"
    });

    expect(report.productSourceEvidencePresent).toBe(true);
    expect(report.affiliateEvidencePresent).toBe(true);
    expect(report.affiliateHashPrefix).toBe(hashPrefix(RAW_AFFILIATE_URL));
    expect(report.disclosureEvidencePresent).toBe(false);
    expect(report.FINAL_STATUS).toBe("BLOCKED_V109_DISCLOSURE_EVIDENCE_MISSING_NO_UPLOAD");
    expectNoSideEffects(report);
  });

  test("fixture evidence plans a memory-only patch for the selected item and advances V108", async () => {
    const selected = queueItem({
      raw_coupang_url: "",
      selected_affiliate_url: ""
    });
    const other = queueItem({
      id: "queue-v109-other",
      queue_rank: 2,
      raw_coupang_url: "",
      selected_affiliate_url: ""
    });
    const report = await buildV109ProductSourceAffiliateEvidenceReport({
      env: {
        ...process.env,
        V109_DRY_RUN_USE_FIXTURE_EVIDENCE: "true"
      },
      queueItems: [selected, other],
      uploadPackages: [],
      now: "2026-07-10T00:00:00.000Z"
    });

    expect(report.FINAL_STATUS).toBe("SUCCESS_V109_PRODUCT_AND_AFFILIATE_EVIDENCE_READY_NO_UPLOAD");
    expect(report.selectedItemFound).toBe(true);
    expect(report.selectedItemShortId).toBe(hashPrefix(selected.id));
    expect(report.productSourceEvidencePresent).toBe(true);
    expect(report.productSourceApproved).toBe(true);
    expect(report.productSourcePatchPlanned).toBe(true);
    expect(report.affiliateEvidencePresent).toBe(true);
    expect(report.affiliatePatchPlanned).toBe(true);
    expect(report.disclosureEvidencePresent).toBe(true);
    expect(report.disclosurePatchPlanned).toBe(true);
    expect(report.queuePatchPlanned).toBe(true);
    expect(report.queuePatchApplied).toBe(false);
    expect(report.patchedQueueItemShortId).toBe(hashPrefix(selected.id));
    expect(report.v108BeforeStatus).toBe("BLOCKED_V108_PRODUCT_SOURCE_MISSING_NO_UPLOAD");
    expect(report.v108AfterStatus).toBe("BLOCKED_V081_VIDEO_ASSET_MISSING_NO_UPLOAD");
    expect(report.nextBlocker).toBe("BLOCKED_V081_VIDEO_ASSET_MISSING_NO_UPLOAD");
    expectNoSideEffects(report);
  });

  test("local_write and execute modes remain blocked", async () => {
    const localWrite = await buildV109ProductSourceAffiliateEvidenceReport({
      mode: "local_write",
      queueItems: [queueItem()]
    });
    const execute = await buildV109ProductSourceAffiliateEvidenceReport({
      mode: "execute",
      queueItems: [queueItem()]
    });

    expect(localWrite.FINAL_STATUS).toBe("BLOCKED_V109_LOCAL_WRITE_NOT_APPROVED_NO_UPLOAD");
    expect(execute.FINAL_STATUS).toBe("BLOCKED_V109_EXECUTE_NOT_APPROVED_NO_UPLOAD");
    expect(localWrite.queuePatchApplied).toBe(false);
    expect(execute.queuePatchApplied).toBe(false);
    expectNoSideEffects(localWrite);
    expectNoSideEffects(execute);
  });

  test("package.json exposes the V109 no-upload evidence binder command", async () => {
    const pkg = JSON.parse(await readFile("package.json", "utf8"));

    expect(pkg.scripts["automation:v109:product-source-affiliate-evidence"]).toBe(
      "tsx scripts/automation/run-v109-product-source-affiliate-evidence.ts"
    );
  });
});

function queueItem(overrides: Partial<ProductQueueItem> = {}): ProductQueueItem {
  const id = overrides.id ?? "queue-v109-father-jobs";
  return {
    id,
    channelKey: overrides.channelKey ?? "father_jobs",
    queue_date: "2026-07-10",
    queue_rank: overrides.queue_rank ?? 1,
    upload_slot: 1,
    scheduled_at: overrides.scheduled_at ?? "2026-07-10T00:00:00.000Z",
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
    created_at: "2026-07-10T00:00:00.000Z",
    updated_at: "2026-07-10T00:00:00.000Z",
    ...overrides
  };
}

function expectNoSideEffects(report: V109ProductSourceAffiliateEvidenceReport) {
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
