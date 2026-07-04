import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import { buildV076UploadResultStoreItem } from "../src/uploads/youtube/v076UploadResultStore";
import {
  buildV077AutopilotSchedulerPlan,
  type V077AutopilotSchedulerInput
} from "../src/uploads/youtube/v077AutopilotScheduler";
import {
  buildV078DashboardControlPanel,
  buildV078DashboardControlReport,
  handleV078DashboardControlAction
} from "../src/uploads/youtube/v078DashboardControl";

const FULL_VIDEO_ID = "v078FullVideoId";
const FULL_CHANNEL_ID = `UC${"9".repeat(22)}`;
const RAW_AFFILIATE_URL = ["https://link.coupang.com", "a", "v078-hidden"].join("/");
const RAW_COUPANG_URL = ["https://www.coupang.com", "vp", "products", "878000001"].join("/");
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

describe("v078 dashboard control scaffold", () => {
  test("builds scaffold-only dashboard controls with SAFE_TO_UPLOAD=false", () => {
    const panel = buildV078DashboardControlPanel({
      generatedAt: "2026-07-05T00:10:00.000Z",
      schedulerPlan: makeSchedulerPlan()
    });

    expect(panel).toMatchObject({
      version: "v078",
      title: "Autopilot Scheduler: Scaffold Only",
      mode: "scaffold_only",
      SAFE_TO_UPLOAD: false,
      safeToUpload: false,
      safeToComment: false,
      schedulerEnabled: false,
      uploadExecutionEnabled: false,
      commentExecutionEnabled: false,
      approvalRequired: true,
      fake_success: false
    });
    expect(panel.statusLabels).toEqual(expect.arrayContaining([
      "Autopilot Scheduler: Scaffold Only",
      "SAFE_TO_UPLOAD=false",
      "실제 업로드/댓글 실행 비활성화",
      "승인 전 실행 불가"
    ]));
    expect(panel.sections).toEqual(expect.arrayContaining(["차단 사유", "다음 후보"]));
  });

  test("renders upload, comment, and scheduler readiness cards with blocked buttons", () => {
    const panel = buildV078DashboardControlPanel({
      generatedAt: "2026-07-05T00:10:00.000Z",
      schedulerPlan: makeSchedulerPlan()
    });

    expect(panel.cards.map((card) => card.kind)).toEqual([
      "upload_readiness",
      "comment_readiness",
      "scheduler_readiness"
    ]);
    for (const action of panel.actions) {
      expect(action.enabled).toBe(false);
      expect(action.state).toBe("blocked");
      expect(action.scaffoldOnly).toBe(true);
    }
  });

  test("dashboard mutation action returns a blocked response without calling upload or comment APIs", () => {
    const response = handleV078DashboardControlAction({
      action: "upload",
      mutationAttempted: true
    });

    expect(response).toMatchObject({
      version: "v078",
      status: "BLOCKED",
      blocker: "BLOCKED_V078_DASHBOARD_MUTATION_ATTEMPT",
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
      fake_success: false
    });
  });

  test("dashboard report is sanitized and never exposes raw evidence", () => {
    const panel = buildV078DashboardControlPanel({
      generatedAt: "2026-07-05T00:10:00.000Z",
      schedulerPlan: makeSchedulerPlan()
    });
    const report = buildV078DashboardControlReport(panel);
    const serialized = JSON.stringify(report);

    expect(report).toMatchObject({
      version: "v078",
      FINAL_STATUS: "BLOCKED_V078_DASHBOARD_CONTROL_SCAFFOLD_ONLY",
      SAFE_TO_UPLOAD: false,
      raw_urls_printed: false,
      raw_video_ids_printed: false,
      raw_channel_ids_printed: false,
      secrets_printed: false,
      fake_success: false
    });
    expect(serialized).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });

  test("shows scheduler candidate counts, next eligible time, and blockers", () => {
    const panel = buildV078DashboardControlPanel({
      generatedAt: "2026-07-05T00:10:00.000Z",
      schedulerPlan: makeSchedulerPlan()
    });

    expect(panel.summary).toMatchObject({
      candidateCount: 1,
      blockedCount: 1,
      nextEligibleAt: "2026-07-05T01:00:00.000Z"
    });
    expect(panel.blockers).toContain("BLOCKED_V077_SAFE_TO_UPLOAD_FALSE");
    expect(panel.candidates[0]).toMatchObject({
      queueItemId: "queue-v078-father",
      intendedAction: "upload_prepare",
      readinessStatus: "blocked",
      sanitizedReason: "blocked: scaffold-only scheduler never executes actions"
    });
    expect(JSON.stringify(panel.candidates[0])).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });

  test("missing upload result evidence blocker is visible for comment readiness", () => {
    const panel = buildV078DashboardControlPanel({
      generatedAt: "2026-07-05T00:10:00.000Z",
      schedulerPlan: makeSchedulerPlan({
        candidates: [
          makeSchedulerCandidateInput({
            intendedAction: "comment_prepare",
            uploadResultStoreItem: null
          })
        ]
      })
    });

    expect(panel.blockers).toContain("BLOCKED_V077_UPLOAD_RESULT_EVIDENCE_MISSING");
    expect(panel.cards.find((card) => card.kind === "comment_readiness")?.blockers)
      .toContain("BLOCKED_V077_UPLOAD_RESULT_EVIDENCE_MISSING");
  });

  test("TASK.md records T008 dashboard scaffold work and keeps SAFE_TO_UPLOAD=false", async () => {
    const task = await readFile("TASK.md", "utf8");

    expect(task).toContain("### T008 - V078 Dashboard Control");
    expect(task).toMatch(/### T008 - V078 Dashboard Control[\s\S]*Status: `(IN_PROGRESS|PR_OPEN|DONE)`/);
    expect(task).toContain("`SAFE_TO_UPLOAD=false`");
  });
});

function makeSchedulerPlan(overrides: Partial<V077AutopilotSchedulerInput> = {}) {
  return buildV077AutopilotSchedulerPlan({
    schedulerPlanId: "scheduler-v078-panel",
    generatedAt: "2026-07-05T00:00:00.000Z",
    enabled: true,
    uploadFeatureEnabled: true,
    commentFeatureEnabled: true,
    approvalPresent: false,
    publicVisibilityApproved: false,
    candidates: [makeSchedulerCandidateInput()],
    ...overrides
  });
}

function makeSchedulerCandidateInput(
  overrides: Partial<V077AutopilotSchedulerInput["candidates"][number]> = {}
): V077AutopilotSchedulerInput["candidates"][number] {
  return {
    queueItemId: "queue-v078-father",
    uploadPackageId: "pkg-v078-father",
    channelKey: "father_jobs",
    platform: "youtube",
    intendedAction: "upload_prepare",
    nextEligibleAt: "2026-07-05T01:00:00.000Z",
    affiliateUrlPresent: true,
    affiliateUrlHashPrefix: "affhash078",
    coupangDisclosurePresent: true,
    targetChannelEvidencePresent: true,
    targetChannelHashPrefix: "channel078",
    duplicateGuardSatisfied: true,
    uploadPackageReady: true,
    commentPackageReady: true,
    uploadResultStoreItem: buildV076UploadResultStoreItem({
      uploadResultId: "upload-result-v078-father",
      uploadPackageId: "pkg-v078-father",
      queueItemId: "queue-v078-father",
      channelKey: "father_jobs",
      platform: "youtube",
      visibility: "public",
      uploadedAt: "2026-07-05T00:05:00.000Z",
      youtubeVideoId: FULL_VIDEO_ID,
      channelId: FULL_CHANNEL_ID,
      targetChannelVerified: true,
      duplicateGuardPassed: true,
      publicUploadPackageReady: true,
      createdAt: "2026-07-05T00:06:00.000Z",
      updatedAt: "2026-07-05T00:06:00.000Z"
    }),
    ...overrides
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
