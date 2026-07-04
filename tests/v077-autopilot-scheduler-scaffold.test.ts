import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import { buildV076UploadResultStoreItem } from "../src/uploads/youtube/v076UploadResultStore";
import {
  buildV077AutopilotSchedulerPlan,
  buildV077AutopilotSchedulerReport
} from "../src/uploads/youtube/v077AutopilotScheduler";

const FULL_VIDEO_ID = "v077FullVideoId";
const FULL_CHANNEL_ID = `UC${"8".repeat(22)}`;
const RAW_AFFILIATE_URL = ["https://link.coupang.com", "a", "v077-hidden"].join("/");
const RAW_COUPANG_URL = ["https://www.coupang.com", "vp", "products", "877000001"].join("/");
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

describe("v077 autopilot scheduler scaffold", () => {
  test("defaults to disabled scaffold-only scheduling with SAFE_TO_UPLOAD=false", () => {
    const plan = buildV077AutopilotSchedulerPlan({
      schedulerPlanId: "scheduler-v077-default",
      generatedAt: "2026-07-04T14:00:00.000Z",
      candidates: [makeCandidate()]
    });

    expect(plan).toMatchObject({
      schedulerPlanId: "scheduler-v077-default",
      mode: "scaffold_only",
      enabled: false,
      safeToUpload: false,
      safeToComment: false,
      approvalRequired: true,
      candidateCount: 1,
      blockedCount: 1,
      uploadActionCalled: false,
      commentActionCalled: false,
      videos_insert_called: false,
      commentThreads_insert_called: false,
      fake_success: false
    });
    expect(plan.blockers).toContain("BLOCKED_V077_SCHEDULER_DISABLED");
    expect(plan.blockers).toContain("BLOCKED_V077_SAFE_TO_UPLOAD_FALSE");
    expect(plan.candidates[0].readinessStatus).toBe("blocked");
  });

  test("SAFE_TO_UPLOAD=false blocks upload and comment candidates even with ready evidence", () => {
    const plan = buildV077AutopilotSchedulerPlan({
      schedulerPlanId: "scheduler-v077-safe-false",
      generatedAt: "2026-07-04T14:00:00.000Z",
      enabled: true,
      uploadFeatureEnabled: true,
      commentFeatureEnabled: true,
      approvalPresent: true,
      publicVisibilityApproved: true,
      candidates: [
        makeCandidate({ intendedAction: "upload_prepare" }),
        makeCandidate({ intendedAction: "comment_prepare" })
      ]
    });

    expect(plan.safeToUpload).toBe(false);
    expect(plan.blockedCount).toBe(2);
    for (const candidate of plan.candidates) {
      expect(candidate.readinessStatus).toBe("blocked");
      expect(candidate.blockers).toContain("BLOCKED_V077_SAFE_TO_UPLOAD_FALSE");
      expect(candidate.blockers).toContain("BLOCKED_V077_REAL_ADAPTER_DISABLED");
    }
  });

  test("comment_prepare is blocked when upload result evidence is missing", () => {
    const plan = buildV077AutopilotSchedulerPlan({
      schedulerPlanId: "scheduler-v077-missing-upload-result",
      generatedAt: "2026-07-04T14:00:00.000Z",
      enabled: true,
      uploadFeatureEnabled: true,
      commentFeatureEnabled: true,
      approvalPresent: true,
      publicVisibilityApproved: true,
      candidates: [
        makeCandidate({
          intendedAction: "comment_prepare",
          uploadResultStoreItem: null
        })
      ]
    });

    expect(plan.candidates[0].blockers).toContain("BLOCKED_V077_UPLOAD_RESULT_EVIDENCE_MISSING");
    expect(plan.candidates[0].evidencePresent.uploadResultEvidence).toBe(false);
    expect(plan.candidates[0].readinessStatus).toBe("blocked");
  });

  test("missing affiliate URL, disclosure, target channel evidence, approval, and duplicate guard block candidates", () => {
    const plan = buildV077AutopilotSchedulerPlan({
      schedulerPlanId: "scheduler-v077-readiness-blockers",
      generatedAt: "2026-07-04T14:00:00.000Z",
      enabled: true,
      uploadFeatureEnabled: true,
      commentFeatureEnabled: true,
      approvalPresent: false,
      publicVisibilityApproved: false,
      candidates: [
        makeCandidate({
          affiliateUrlPresent: false,
          affiliateUrlHashPrefix: null,
          coupangDisclosurePresent: false,
          targetChannelEvidencePresent: false,
          duplicateGuardSatisfied: false
        })
      ]
    });

    expect(plan.candidates[0].blockers).toEqual(expect.arrayContaining([
      "BLOCKED_V077_APPROVAL_MISSING",
      "BLOCKED_V077_PUBLIC_VISIBILITY_NOT_APPROVED",
      "BLOCKED_V077_AFFILIATE_URL_MISSING",
      "BLOCKED_V077_COUPANG_DISCLOSURE_MISSING",
      "BLOCKED_V077_TARGET_CHANNEL_EVIDENCE_MISSING",
      "BLOCKED_V077_DUPLICATE_GUARD_NOT_SATISFIED"
    ]));
  });

  test("mutation attempts are blocked and reports stay sanitized", () => {
    const plan = buildV077AutopilotSchedulerPlan({
      schedulerPlanId: "scheduler-v077-mutation-attempt",
      generatedAt: "2026-07-04T14:00:00.000Z",
      enabled: true,
      uploadFeatureEnabled: true,
      commentFeatureEnabled: true,
      approvalPresent: true,
      publicVisibilityApproved: true,
      mutationAttempted: true,
      candidates: [makeCandidate()]
    });
    const report = buildV077AutopilotSchedulerReport(plan);
    const serialized = JSON.stringify(report);

    expect(plan.blockers).toContain("BLOCKED_V077_MUTATION_ATTEMPT_BLOCKED");
    expect(report).toMatchObject({
      version: "v077",
      FINAL_STATUS: "BLOCKED_V077_AUTOPILOT_SCHEDULER_SCAFFOLD_ONLY",
      SAFE_TO_UPLOAD: false,
      safeToUpload: false,
      uploadActionCalled: false,
      commentActionCalled: false,
      videos_insert_called: false,
      commentThreads_insert_called: false,
      comment_create_update_delete_called: false,
      visibility_changed: false,
      R2_upload: false,
      DB_write: false,
      product_assets_write: false,
      raw_urls_printed: false,
      raw_video_ids_printed: false,
      raw_channel_ids_printed: false,
      secrets_printed: false,
      fake_success: false
    });
    expect(serialized).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });

  test("fully ready fixture remains scaffold-only and cannot execute adapters", () => {
    const plan = buildV077AutopilotSchedulerPlan({
      schedulerPlanId: "scheduler-v077-ready-fixture",
      generatedAt: "2026-07-04T14:00:00.000Z",
      enabled: true,
      uploadFeatureEnabled: true,
      commentFeatureEnabled: true,
      approvalPresent: true,
      publicVisibilityApproved: true,
      candidates: [
        makeCandidate({
          intendedAction: "upload_prepare",
          uploadResultStoreItem: buildV076UploadResultStoreItem(makeUploadResultStoreInput())
        })
      ]
    });

    expect(plan.candidates[0].readinessStatus).toBe("blocked");
    expect(plan.candidates[0].sanitizedReason).toContain("scaffold-only");
    expect(plan.candidates[0].blockers).toContain("BLOCKED_V077_SAFE_TO_UPLOAD_FALSE");
    expect(plan.candidates[0].blockers).toContain("BLOCKED_V077_REAL_ADAPTER_DISABLED");
    expect(plan.uploadActionCalled).toBe(false);
    expect(plan.commentActionCalled).toBe(false);
    expect(plan.fake_success).toBe(false);
  });

  test("TASK.md records T007 scheduler scaffold work and keeps SAFE_TO_UPLOAD=false", async () => {
    const task = await readFile("TASK.md", "utf8");

    expect(task).toContain("### T007 - V077 Autopilot Scheduler");
    expect(task).toMatch(/### T007 - V077 Autopilot Scheduler[\s\S]*Status: `(IN_PROGRESS|PR_OPEN|DONE)`/);
    expect(task).toContain("`SAFE_TO_UPLOAD=false`");
  });
});

function makeCandidate(overrides: Partial<Parameters<typeof buildV077AutopilotSchedulerPlan>[0]["candidates"][number]> = {}) {
  return {
    queueItemId: "queue-v077-father",
    uploadPackageId: "pkg-v077-father",
    channelKey: "father_jobs" as const,
    platform: "youtube" as const,
    intendedAction: "upload_prepare" as const,
    nextEligibleAt: "2026-07-04T15:00:00.000Z",
    affiliateUrlPresent: true,
    affiliateUrlHashPrefix: "affhash077",
    coupangDisclosurePresent: true,
    targetChannelEvidencePresent: true,
    targetChannelHashPrefix: "channel077",
    duplicateGuardSatisfied: true,
    uploadPackageReady: true,
    commentPackageReady: true,
    uploadResultStoreItem: buildV076UploadResultStoreItem(makeUploadResultStoreInput()),
    ...overrides
  };
}

function makeUploadResultStoreInput(overrides: Partial<Parameters<typeof buildV076UploadResultStoreItem>[0]> = {}) {
  return {
    uploadResultId: "upload-result-v077-father",
    uploadPackageId: "pkg-v077-father",
    queueItemId: "queue-v077-father",
    channelKey: "father_jobs" as const,
    platform: "youtube" as const,
    visibility: "public" as const,
    uploadedAt: "2026-07-04T14:10:00.000Z",
    youtubeVideoId: FULL_VIDEO_ID,
    channelId: FULL_CHANNEL_ID,
    targetChannelVerified: true,
    duplicateGuardPassed: true,
    publicUploadPackageReady: true,
    createdAt: "2026-07-04T14:11:00.000Z",
    updatedAt: "2026-07-04T14:11:00.000Z",
    ...overrides
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
