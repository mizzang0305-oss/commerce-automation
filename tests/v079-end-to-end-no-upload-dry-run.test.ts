import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import {
  buildV079NoUploadDryRunReport,
  type V079PipelineStageName
} from "../src/uploads/youtube/v079NoUploadDryRun";

const FULL_VIDEO_ID = "v079FullVideoId";
const FULL_CHANNEL_ID = `UC${"1".repeat(22)}`;
const RAW_AFFILIATE_URL = ["https://link.coupang.com", "a", "v079-hidden"].join("/");
const RAW_COUPANG_URL = ["https://www.coupang.com", "vp", "products", "879000001"].join("/");
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

const EXPECTED_STAGES: V079PipelineStageName[] = [
  "fixture_queue_item",
  "upload_package_scaffold",
  "upload_result_store_scaffold",
  "comment_package_scaffold",
  "comment_writer_evidence_gate",
  "autopilot_scheduler_scaffold",
  "dashboard_control_scaffold",
  "final_sanitized_report"
];

describe("v079 end-to-end no-upload dry run", () => {
  test("completes the full dry run with no external calls or mutations", () => {
    const report = buildV079NoUploadDryRunReport(makeInput());

    expect(report).toMatchObject({
      version: "v079",
      dryRunId: "dry-run-v079-default",
      mode: "no_upload_dry_run",
      fixtureOnly: true,
      safeToUpload: false,
      safeToComment: false,
      externalCallsAttempted: false,
      uploadMutationAttempted: false,
      commentMutationAttempted: false,
      schedulerExecutionAttempted: false,
      dashboardActionMutationAttempted: false,
      videos_insert_called: false,
      commentThreads_insert_called: false,
      comment_create_update_delete_called: false,
      visibility_changed: false,
      R2_upload: false,
      DB_write: false,
      product_assets_write: false,
      fake_success: false,
      finalDecision: "SCAFFOLD_ONLY_BLOCKED"
    });
    expect(report.pipelineStages.map((stage) => stage.stageName)).toEqual(EXPECTED_STAGES);
  });

  test("keeps required safety blockers visible across the dry-run pipeline", () => {
    const report = buildV079NoUploadDryRunReport(makeInput());

    expect(report.requiredBlockers).toEqual(expect.arrayContaining([
      "BLOCKED_V079_SAFE_TO_UPLOAD_FALSE",
      "BLOCKED_V079_UPLOAD_DISABLED",
      "BLOCKED_V079_COMMENT_DISABLED",
      "BLOCKED_V079_SCHEDULER_DISABLED",
      "BLOCKED_V079_FRESH_APPROVAL_MISSING",
      "BLOCKED_V079_REAL_ADAPTER_DISABLED",
      "BLOCKED_V079_MUTATION_ATTEMPT_BLOCKED",
      "BLOCKED_V079_PUBLIC_VISIBILITY_NOT_APPROVED",
      "BLOCKED_V079_DUPLICATE_GUARD_NOT_SATISFIED"
    ]));
    expect(report.pipelineStages.find((stage) => stage.stageName === "autopilot_scheduler_scaffold")?.blockers)
      .toContain("BLOCKED_V077_SAFE_TO_UPLOAD_FALSE");
    expect(report.pipelineStages.find((stage) => stage.stageName === "dashboard_control_scaffold")?.blockers)
      .toContain("BLOCKED_V078_DASHBOARD_CONTROL_SCAFFOLD_ONLY");
  });

  test("connects V075, V076, V077, and V078 scaffold evidence without exposing raw values", () => {
    const report = buildV079NoUploadDryRunReport(makeInput());
    const serialized = JSON.stringify(report);

    expect(report.connections).toMatchObject({
      uploadPackageToCommentPackage: true,
      uploadResultStoreToCommentEvidenceGate: true,
      uploadResultStoreToScheduler: true,
      schedulerToDashboard: true
    });
    expect(report.pipelineStages.find((stage) => stage.stageName === "comment_package_scaffold")?.evidencePresent)
      .toMatchObject({
        uploadPackage: true,
        affiliateUrl: true,
        coupangDisclosure: true
      });
    expect(serialized).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });

  test("redaction proof records no raw URLs, IDs, secrets, or fake success", () => {
    const report = buildV079NoUploadDryRunReport(makeInput());

    expect(report.redactionProof).toEqual({
      rawUrlsPrinted: false,
      rawVideoIdsPrinted: false,
      rawChannelIdsPrinted: false,
      secretsPrinted: false,
      fakeSuccess: false
    });
    expect(report.raw_urls_printed).toBe(false);
    expect(report.raw_video_ids_printed).toBe(false);
    expect(report.raw_channel_ids_printed).toBe(false);
    expect(report.secrets_printed).toBe(false);
  });

  test("fully ready fixture still does not execute upload, comment, scheduler, or dashboard actions", () => {
    const report = buildV079NoUploadDryRunReport(makeInput({
      fixtureMode: "fully_ready"
    }));

    expect(report.fixtureMode).toBe("fully_ready");
    expect(report.finalDecision).toBe("SCAFFOLD_ONLY_BLOCKED");
    expect(report.safeToUpload).toBe(false);
    expect(report.safeToComment).toBe(false);
    expect(report.externalCallsAttempted).toBe(false);
    expect(report.uploadMutationAttempted).toBe(false);
    expect(report.commentMutationAttempted).toBe(false);
    expect(report.schedulerExecutionAttempted).toBe(false);
    expect(report.dashboardActionMutationAttempted).toBe(false);
    expect(report.videos_insert_called).toBe(false);
    expect(report.commentThreads_insert_called).toBe(false);
    expect(report.fake_success).toBe(false);
    expect(report.requiredBlockers).toContain("BLOCKED_V079_SAFE_TO_UPLOAD_FALSE");
    expect(report.requiredBlockers).toContain("BLOCKED_V079_REAL_ADAPTER_DISABLED");
  });

  test("TASK.md records T009 dry-run work and keeps SAFE_TO_UPLOAD=false", async () => {
    const task = await readFile("TASK.md", "utf8");

    expect(task).toContain("### T009 - V079 End-to-End No-Upload Dry Run");
    expect(task).toMatch(/### T009 - V079 End-to-End No-Upload Dry Run[\s\S]*Status: `(IN_PROGRESS|PR_OPEN|DONE)`/);
    expect(task).toContain("`SAFE_TO_UPLOAD=false`");
  });
});

function makeInput(overrides: Partial<Parameters<typeof buildV079NoUploadDryRunReport>[0]> = {}) {
  return {
    dryRunId: "dry-run-v079-default",
    generatedAt: "2026-07-05T01:00:00.000Z",
    fixture: {
      queueItemId: "queue-v079-father",
      generatedContentId: "generated-v079-father",
      uploadPackageId: "pkg-v079-father",
      channelKey: "father_jobs" as const,
      productName: "차량용 컵홀더 정리함",
      rawCoupangUrl: RAW_COUPANG_URL,
      selectedAffiliateUrl: RAW_AFFILIATE_URL,
      youtubeVideoId: FULL_VIDEO_ID,
      targetChannelId: FULL_CHANNEL_ID,
      duplicateGuardSatisfied: false,
      nextEligibleAt: "2026-07-05T02:00:00.000Z"
    },
    ...overrides
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
