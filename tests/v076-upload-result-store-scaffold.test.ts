import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import { buildV075CommentSafetyGate } from "../src/uploads/youtube/v075CommentSafetyGate";
import {
  buildV076CommentWriterEvidenceGate,
  buildV076UploadResultStoreItem,
  buildV076UploadResultStoreSanitizedReport
} from "../src/uploads/youtube/v076UploadResultStore";

const FULL_VIDEO_ID = "v076FullVideoId";
const FULL_CHANNEL_ID = `UC${"7".repeat(22)}`;
const RAW_AFFILIATE_URL = ["https://link.coupang.com", "a", "v076-hidden"].join("/");
const RAW_COUPANG_URL = ["https://www.coupang.com", "vp", "products", "876000001"].join("/");
const FORBIDDEN_REPORT_PATTERN = new RegExp([
  FULL_VIDEO_ID,
  FULL_CHANNEL_ID,
  RAW_AFFILIATE_URL,
  RAW_COUPANG_URL,
  "COUPANG_SECRET_KEY",
  "refresh_token",
  "Authorization",
  "HmacSHA256",
  "signature="
].map(escapeRegExp).join("|"), "i");

describe("v076 upload result store scaffold", () => {
  test("stores only sanitized upload result evidence and never raw IDs or URLs", () => {
    const item = buildV076UploadResultStoreItem(makeStoreInput());
    const serialized = JSON.stringify(item);

    expect(item).toMatchObject({
      uploadResultId: "upload-result-v076-father",
      uploadPackageId: "pkg-v076-father",
      queueItemId: "queue-v076-father",
      channelKey: "father_jobs",
      platform: "youtube",
      visibility: "public",
      sanitizedStatus: "stored",
      rawVideoIdStored: false,
      rawChannelIdStored: false,
      rawUrlsStored: false,
      secretsStored: false,
      videos_insert_called: false,
      comment_create_update_delete_called: false,
      visibility_changed: false,
      R2_upload: false,
      DB_write: false,
      product_assets_write: false,
      fake_success: false
    });
    expect(item.youtubeVideoIdHashPrefix).toMatch(/^[a-f0-9]{10}$/);
    expect(item.channelIdHashPrefix).toMatch(/^[a-f0-9]{10}$/);
    expect(item.evidencePresent).toMatchObject({
      uploadResultId: true,
      queueItemId: true,
      uploadedAt: true,
      visibility: true,
      youtubeVideoIdHashPrefix: true,
      channelIdHashPrefix: true,
      targetChannelVerified: true,
      duplicateGuardPassed: true,
      publicUploadPackageReady: true
    });
    expect(serialized).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });

  test("sanitized report redacts raw evidence and records no mutation side effects", () => {
    const item = buildV076UploadResultStoreItem(makeStoreInput());
    const report = buildV076UploadResultStoreSanitizedReport(item);
    const serialized = JSON.stringify(report);

    expect(report).toMatchObject({
      version: "v076",
      FINAL_STATUS: "SUCCESS_V076_UPLOAD_RESULT_STORE_SCAFFOLD_READY_NO_UPLOAD",
      SAFE_TO_UPLOAD: false,
      safeToUpload: false,
      uploadResultStoreReady: true,
      sanitizedStatus: "stored",
      raw_urls_printed: false,
      raw_video_ids_printed: false,
      raw_channel_ids_printed: false,
      secrets_printed: false,
      videos_insert_called: false,
      comment_create_update_delete_called: false,
      visibility_changed: false,
      R2_upload: false,
      DB_write: false,
      product_assets_write: false,
      fake_success: false
    });
    expect(serialized).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });

  test("missing upload result store evidence keeps the v075 comment writer blocked", () => {
    const evidenceGate = buildV076CommentWriterEvidenceGate({
      uploadPackageId: "pkg-v076-father",
      channelKey: "father_jobs",
      storeItem: null
    });
    const commentGate = buildV075CommentSafetyGate({
      uploadResultPresent: evidenceGate.uploadResultStoreEvidencePresent,
      uploadResultStatus: evidenceGate.v075UploadResultStatus,
      youtubeVideoIdPresent: evidenceGate.youtubeVideoIdHashPrefixPresent,
      uploadVisibility: evidenceGate.v075UploadVisibility,
      affiliateUrlReady: true,
      coupangDisclosurePresent: true,
      commentTextReady: true,
      targetChannelVerified: evidenceGate.targetChannelVerified,
      duplicateGuardPassed: evidenceGate.duplicateGuardPassed,
      publicUploadPackageReady: evidenceGate.publicUploadPackageReady,
      commentFeatureEnabled: true,
      freshCommentApprovalPresent: true
    });

    expect(evidenceGate).toMatchObject({
      uploadResultStoreEvidencePresent: false,
      commentWriterBlocked: true,
      blocker: "BLOCKED_V076_UPLOAD_RESULT_STORE_MISSING",
      commentWriteAllowed: false,
      safeToUpload: false
    });
    expect(commentGate.ready).toBe(false);
    expect(commentGate.commentWriteAllowed).toBe(false);
    expect(commentGate.blockers).toContain("BLOCKED_V075_UPLOAD_RESULT_MISSING");
  });

  test("mismatched package or channel evidence does not unblock the comment writer", () => {
    const packageMismatch = buildV076CommentWriterEvidenceGate({
      uploadPackageId: "pkg-v076-other",
      channelKey: "father_jobs",
      storeItem: buildV076UploadResultStoreItem(makeStoreInput())
    });
    const channelMismatch = buildV076CommentWriterEvidenceGate({
      uploadPackageId: "pkg-v076-father",
      channelKey: "lets_buy",
      storeItem: buildV076UploadResultStoreItem(makeStoreInput())
    });

    for (const gate of [packageMismatch, channelMismatch]) {
      expect(gate.uploadResultStoreEvidencePresent).toBe(false);
      expect(gate.commentWriterBlocked).toBe(true);
      expect(gate.blocker).toBe("BLOCKED_V076_UPLOAD_RESULT_STORE_MISMATCH");
      expect(gate.rawVideoIdAvailable).toBe(false);
      expect(JSON.stringify(gate)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    }
  });

  test("non-public or incomplete evidence is stored as blocked or missing without fake success", () => {
    const privateItem = buildV076UploadResultStoreItem(makeStoreInput({
      visibility: "private"
    }));
    const missingVideoItem = buildV076UploadResultStoreItem(makeStoreInput({
      youtubeVideoId: null
    }));

    expect(privateItem.sanitizedStatus).toBe("blocked");
    expect(missingVideoItem.sanitizedStatus).toBe("missing");
    for (const item of [privateItem, missingVideoItem]) {
      expect(item.fake_success).toBe(false);
      expect(item.videos_insert_called).toBe(false);
      expect(item.comment_create_update_delete_called).toBe(false);
      expect(JSON.stringify(item)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    }
  });

  test("TASK.md records T006 scaffold work and keeps SAFE_TO_UPLOAD=false", async () => {
    const task = await readFile("TASK.md", "utf8");

    expect(task).toContain("### T006 - V076 Upload Result Store");
    expect(task).toMatch(/### T006 - V076 Upload Result Store[\s\S]*Status: `(IN_PROGRESS|PR_OPEN|DONE)`/);
    expect(task).toContain("`SAFE_TO_UPLOAD=false`");
  });
});

function makeStoreInput(overrides: Partial<Parameters<typeof buildV076UploadResultStoreItem>[0]> = {}) {
  return {
    uploadResultId: "upload-result-v076-father",
    uploadPackageId: "pkg-v076-father",
    queueItemId: "queue-v076-father",
    channelKey: "father_jobs" as const,
    platform: "youtube" as const,
    visibility: "public" as const,
    uploadedAt: "2026-07-04T13:30:00.000Z",
    youtubeVideoId: FULL_VIDEO_ID,
    channelId: FULL_CHANNEL_ID,
    targetChannelVerified: true,
    duplicateGuardPassed: true,
    publicUploadPackageReady: true,
    createdAt: "2026-07-04T13:31:00.000Z",
    updatedAt: "2026-07-04T13:31:00.000Z",
    ...overrides
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
