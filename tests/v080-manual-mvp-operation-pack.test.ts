import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import { buildV079NoUploadDryRunReport } from "../src/uploads/youtube/v079NoUploadDryRun";
import {
  buildV080ManualMvpOperationReport,
  type V080RequiredOperatorCheck
} from "../src/uploads/youtube/v080ManualMvpOperationPack";

const FULL_VIDEO_ID = "v080FullVideoId";
const FULL_CHANNEL_ID = `UC${"2".repeat(22)}`;
const RAW_AFFILIATE_URL = ["https://link.coupang.com", "a", "v080-hidden"].join("/");
const RAW_COUPANG_URL = ["https://www.coupang.com", "vp", "products", "880000001"].join("/");
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

const REQUIRED_CHECKS: V080RequiredOperatorCheck[] = [
  "coupang_partners_disclosure_check",
  "affiliate_url_presence_check",
  "video_or_video_output_presence_check",
  "blog_draft_presence_check",
  "product_name_price_thumbnail_integrity_check",
  "prohibited_product_check",
  "duplicate_upload_check",
  "youtube_title_description_pinned_comment_manual_review",
  "operator_manual_upload_only",
  "post_upload_state_requires_separate_approval"
];

describe("v080 manual MVP operation pack", () => {
  test("builds manual MVP operation report while keeping automation execution disabled", () => {
    const report = buildV080ManualMvpOperationReport(makeInput());

    expect(report).toMatchObject({
      version: "v080",
      reportId: "manual-mvp-v080-default",
      mode: "manual_mvp_operation_pack",
      safeToUpload: false,
      publicUploadApproval: "missing",
      automationExecutionAllowed: false,
      manualOperationAllowed: true,
      noUploadDryRunPassed: true,
      dashboardControlReady: true,
      schedulerScaffoldReady: true,
      uploadResultStoreReady: true,
      commentWriterScaffoldReady: true,
      fake_success: false
    });
  });

  test("release gate blocks public upload, comment automation, and scheduler execution", () => {
    const report = buildV080ManualMvpOperationReport(makeInput());

    expect(report.releaseGate).toEqual({
      noUploadMvpReady: true,
      publicUploadBlocked: true,
      commentAutomationBlocked: true,
      schedulerExecutionBlocked: true
    });
    expect(report.blockers).toEqual(expect.arrayContaining([
      "BLOCKED_V080_SAFE_TO_UPLOAD_FALSE",
      "BLOCKED_V080_PUBLIC_UPLOAD_APPROVAL_MISSING",
      "BLOCKED_V080_COMMENT_AUTOMATION_APPROVAL_MISSING",
      "BLOCKED_V080_SCHEDULER_EXECUTION_APPROVAL_MISSING",
      "BLOCKED_V080_REAL_ADAPTER_DISABLED",
      "BLOCKED_V080_MUTATION_ATTEMPT_BLOCKED",
      "BLOCKED_V080_N8N_LIVE_EXECUTION_NOT_APPROVED",
      "BLOCKED_V080_SECRETS_NOT_EXPOSED_BY_DESIGN"
    ]));
  });

  test("includes the required operator checklist and manual-only steps", () => {
    const report = buildV080ManualMvpOperationReport(makeInput());

    expect(report.requiredOperatorChecks).toEqual(REQUIRED_CHECKS);
    expect(report.manualSteps.map((step) => step.stepId)).toEqual([
      "review_today_generation_readiness",
      "review_queue_item_readiness",
      "review_content_outputs",
      "confirm_automation_blocked",
      "review_manual_upload_candidates",
      "confirm_disclosure_and_affiliate_evidence",
      "operator_performs_manual_upload",
      "keep_post_upload_state_blocked_until_fresh_approval"
    ]);
    expect(report.manualSteps.every((step) => step.automationActionAllowed === false)).toBe(true);
  });

  test("does not expose raw URLs, full IDs, secrets, or fake success", () => {
    const report = buildV080ManualMvpOperationReport(makeInput());
    const serialized = JSON.stringify(report);

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
    expect(serialized).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });

  test("never calls upload, comment, scheduler, webhook, R2, DB, or product asset mutations", () => {
    const report = buildV080ManualMvpOperationReport(makeInput());

    expect(report.youtube_execute_called).toBe(false);
    expect(report.videos_insert_called).toBe(false);
    expect(report.commentThreads_insert_called).toBe(false);
    expect(report.comment_create_update_delete_called).toBe(false);
    expect(report.visibility_changed).toBe(false);
    expect(report.scheduler_auto_execution_called).toBe(false);
    expect(report.n8n_webhook_called).toBe(false);
    expect(report.R2_upload).toBe(false);
    expect(report.DB_write).toBe(false);
    expect(report.product_assets_write).toBe(false);
  });

  test("keeps no-upload MVP not ready when the V079 dry run did not pass", () => {
    const report = buildV080ManualMvpOperationReport({
      reportId: "manual-mvp-v080-blocked",
      generatedAt: "2026-07-05T03:00:00.000Z",
      noUploadDryRunReport: {
        ...makeV079Report(),
        FINAL_STATUS: "BLOCKED_TEST" as "NO_UPLOAD_DRY_RUN_COMPLETED",
        connections: {
          uploadPackageToCommentPackage: false,
          uploadResultStoreToCommentEvidenceGate: false,
          uploadResultStoreToScheduler: false,
          schedulerToDashboard: false
        }
      }
    });

    expect(report.noUploadDryRunPassed).toBe(false);
    expect(report.releaseGate.noUploadMvpReady).toBe(false);
    expect(report.blockers).toContain("BLOCKED_V080_NO_UPLOAD_DRY_RUN_NOT_PASSED");
  });

  test("TASK.md records T010 manual MVP operation pack and keeps SAFE_TO_UPLOAD=false", async () => {
    const task = await readFile("TASK.md", "utf8");

    expect(task).toContain("### T010 - V080 Manual MVP Operation Pack / Release Gate");
    expect(task).toMatch(/### T010 - V080 Manual MVP Operation Pack \/ Release Gate[\s\S]*Status: `(IN_PROGRESS|PR_OPEN|DONE)`/);
    expect(task).toContain("`SAFE_TO_UPLOAD=false`");
  });
});

function makeInput(overrides: Partial<Parameters<typeof buildV080ManualMvpOperationReport>[0]> = {}) {
  return {
    reportId: "manual-mvp-v080-default",
    generatedAt: "2026-07-05T03:00:00.000Z",
    noUploadDryRunReport: makeV079Report(),
    ...overrides
  };
}

function makeV079Report() {
  return buildV079NoUploadDryRunReport({
    dryRunId: "dry-run-v080-source",
    generatedAt: "2026-07-05T02:30:00.000Z",
    fixture: {
      queueItemId: "queue-v080-father",
      generatedContentId: "generated-v080-father",
      uploadPackageId: "pkg-v080-father",
      channelKey: "father_jobs",
      productName: "vehicle organizer fixture",
      rawCoupangUrl: RAW_COUPANG_URL,
      selectedAffiliateUrl: RAW_AFFILIATE_URL,
      youtubeVideoId: FULL_VIDEO_ID,
      targetChannelId: FULL_CHANNEL_ID,
      duplicateGuardSatisfied: true,
      nextEligibleAt: "2026-07-05T04:00:00.000Z"
    },
    fixtureMode: "fully_ready"
  });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
