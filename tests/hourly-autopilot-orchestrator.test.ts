import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import {
  DEFAULT_V019_FAIL_REASONS,
  createDefaultAutopilotState,
  evaluateAutopilotSafety,
  evaluatePrivateUploadGate
} from "../scripts/autopilot/autopilot-safety-gates";
import {
  decideNextAutopilotAction,
  resolveV019FailureNextAction
} from "../scripts/autopilot/decide-next-action";
import {
  acquireHourlyLock,
  releaseHourlyLock
} from "../scripts/autopilot/hourly-runner";
import {
  appendAutopilotEvent,
  renderAutopilotReport
} from "../scripts/autopilot/autopilot-report";
import {
  getAutopilotPaths,
  readAutopilotState
} from "../scripts/autopilot/read-autopilot-state";
import {
  writeAutopilotState
} from "../scripts/autopilot/write-autopilot-state";

async function makeCwd(prefix: string) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("hourly autopilot orchestrator", () => {
  test("initializes the v019 failure state and recommends v020 real motion work", () => {
    const state = createDefaultAutopilotState();

    expect(state).toMatchObject({
      version: 1,
      current_phase: "INIT",
      current_candidate_id: "candidate-3c4f2ee364ba5b07",
      current_review_version: "v019",
      latest_human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
      next_recommended_action: "BUILD_V020_REAL_MOTION_REVIEW",
      private_upload_allowed: false,
      public_upload_blocked: true,
      unlisted_upload_blocked: true,
      youtube_insert_count_this_run: 0
    });
    expect(state.latest_fail_reasons).toEqual(DEFAULT_V019_FAIL_REASONS);
  });

  test("blocks staged protected files and public or unlisted visibility before any action", () => {
    const protectedSafety = evaluateAutopilotSafety({
      gitStatusShort: [
        "A  .env.local",
        "A  commerce-assets/review/video.mp4",
        "A  AGENTS.md",
        "M  scripts/autopilot/hourly-runner.ts"
      ].join("\n"),
      requestedVisibility: "private"
    });
    const publicSafety = evaluateAutopilotSafety({
      gitStatusShort: "",
      requestedVisibility: "public"
    });
    const unlistedSafety = evaluateAutopilotSafety({
      gitStatusShort: "",
      requestedVisibility: "unlisted"
    });

    expect(protectedSafety.safe).toBe(false);
    expect(protectedSafety.blockedReasons).toEqual([
      "ENV_LOCAL_STAGED",
      "COMMERCE_ASSETS_STAGED",
      "AGENTS_STAGED"
    ]);
    expect(publicSafety.blockedReasons).toContain("PUBLIC_UPLOAD_BLOCKED");
    expect(unlistedSafety.blockedReasons).toContain("UNLISTED_UPLOAD_BLOCKED");
  });

  test("maps v019 card or no-motion failures to the v020 real motion action", () => {
    expect(resolveV019FailureNextAction([
      "VIDEO_LOOKS_LIKE_TEXT_READING_CARD"
    ])).toBe("BUILD_V020_REAL_MOTION_REVIEW");
    expect(resolveV019FailureNextAction([
      "NO_REAL_IN_SCENE_MOTION"
    ])).toBe("BUILD_V020_REAL_MOTION_REVIEW");
    expect(resolveV019FailureNextAction([
      "SLIDESHOW_CARD_FEELING"
    ])).toBe("BUILD_V020_REAL_MOTION_REVIEW");
  });

  test("stops at pending human review when a review console exists", async () => {
    const cwd = await makeCwd("commerce-autopilot-pending-");
    const reviewRoot = path.join(cwd, "commerce-assets", "review", "candidate-3c4f2ee364ba5b07", "v020");
    await mkdir(reviewRoot, { recursive: true });
    await writeFile(path.join(reviewRoot, "review-console.html"), "<html></html>", "utf8");
    await writeFile(path.join(reviewRoot, "human-review-decision.json"), JSON.stringify({
      candidate_id: "candidate-3c4f2ee364ba5b07",
      version: "v020",
      human_review_status: "PENDING_HUMAN_REVIEW",
      private_upload_allowed: false,
      requires_fresh_upload_approval: true
    }), "utf8");

    const decision = await decideNextAutopilotAction({
      cwd,
      state: createDefaultAutopilotState({
        current_review_version: "v020",
        latest_human_review_status: "PENDING_HUMAN_REVIEW"
      }),
      gitStatusShort: ""
    });

    expect(decision).toMatchObject({
      phase: "WAITING_HUMAN_REVIEW",
      nextAction: "WAIT_FOR_OWNER_REVIEW",
      shouldStop: true,
      privateUploadAttempted: false,
      videosInsertAllowed: false
    });
  });

  test("blocks owner PASS without fresh upload approval and allows only one private preflight when approved", async () => {
    const cwd = await makeCwd("commerce-autopilot-pass-");
    const state = createDefaultAutopilotState({
      current_review_version: "v020",
      latest_human_review_status: "PASS_LOCAL_HUMAN_REVIEW",
      private_upload_allowed: true
    });

    const withoutApproval = await decideNextAutopilotAction({
      cwd,
      state,
      gitStatusShort: "",
      reviewDecision: {
        human_review_status: "PASS_LOCAL_HUMAN_REVIEW",
        private_upload_allowed: true,
        requires_fresh_upload_approval: true
      }
    });
    const uploadGate = evaluatePrivateUploadGate({
      state,
      reviewDecision: {
        human_review_status: "PASS_LOCAL_HUMAN_REVIEW",
        private_upload_allowed: true
      },
      uploadApproval: {
        approval_phrase: "APPROVE_AUTOPILOT_PRIVATE_UPLOAD_ON_OWNER_PASS",
        allowed_visibility: "private",
        max_uploads_per_run: 1,
        max_uploads_per_day: 1,
        expires_at: "2099-12-31T23:59:59+09:00"
      },
      requestedVisibility: "private"
    });

    expect(withoutApproval).toMatchObject({
      phase: "READY_FOR_PRIVATE_UPLOAD",
      shouldStop: true,
      videosInsertAllowed: false,
      safetyStopReason: "FRESH_UPLOAD_APPROVAL_REQUIRED"
    });
    expect(uploadGate).toMatchObject({
      allowed: true,
      maxVideosInsertThisRun: 1,
      visibility: "private"
    });
  });

  test("forbids duplicate upload and retry after an external YouTube call", () => {
    const duplicate = evaluatePrivateUploadGate({
      state: createDefaultAutopilotState({
        private_upload_allowed: true,
        last_youtube_video_id: "existing-private-id"
      }),
      reviewDecision: {
        human_review_status: "PASS_LOCAL_HUMAN_REVIEW",
        private_upload_allowed: true
      },
      uploadApproval: {
        approval_phrase: "APPROVE_AUTOPILOT_PRIVATE_UPLOAD_ON_OWNER_PASS",
        allowed_visibility: "private",
        max_uploads_per_run: 1
      },
      requestedVisibility: "private"
    });
    const retry = evaluatePrivateUploadGate({
      state: createDefaultAutopilotState({
        private_upload_allowed: true,
        youtube_insert_count_this_run: 1
      }),
      reviewDecision: {
        human_review_status: "PASS_LOCAL_HUMAN_REVIEW",
        private_upload_allowed: true
      },
      uploadApproval: {
        approval_phrase: "APPROVE_AUTOPILOT_PRIVATE_UPLOAD_ON_OWNER_PASS",
        allowed_visibility: "private",
        max_uploads_per_run: 1
      },
      requestedVisibility: "private"
    });

    expect(duplicate.allowed).toBe(false);
    expect(duplicate.blockedReasons).toContain("DUPLICATE_UPLOAD_RISK");
    expect(retry.allowed).toBe(false);
    expect(retry.blockedReasons).toContain("YOUTUBE_RETRY_AFTER_EXTERNAL_CALL_BLOCKED");
  });

  test("persists state, markdown report, and jsonl events without committing runtime artifacts", async () => {
    const cwd = await makeCwd("commerce-autopilot-state-");
    const state = createDefaultAutopilotState({
      current_phase: "WAITING_HUMAN_REVIEW",
      current_review_version: "v020",
      latest_human_review_status: "PENDING_HUMAN_REVIEW"
    });
    const paths = getAutopilotPaths(cwd);
    const decision = {
      phase: "WAITING_HUMAN_REVIEW" as const,
      nextAction: "WAIT_FOR_OWNER_REVIEW",
      shouldStop: true,
      privateUploadAttempted: false,
      videosInsertAllowed: false,
      blockedReasons: []
    };

    await writeAutopilotState(cwd, state);
    await appendAutopilotEvent(cwd, {
      event_type: "decision",
      phase: decision.phase,
      next_action: decision.nextAction
    });
    await writeFile(paths.reportPath, renderAutopilotReport({ state, decision }), "utf8");

    const loaded = await readAutopilotState(cwd);
    const eventText = await readFile(paths.eventsPath, "utf8");
    const reportText = await readFile(paths.reportPath, "utf8");

    expect(loaded.current_phase).toBe("WAITING_HUMAN_REVIEW");
    expect(eventText).toContain("\"event_type\":\"decision\"");
    expect(reportText).toContain("WAITING_HUMAN_REVIEW");
    expect(reportText).not.toContain("http://");
    expect(reportText).not.toContain("Authorization");
  });

  test("bootstraps from the latest local review decision when state.json does not exist", async () => {
    const cwd = await makeCwd("commerce-autopilot-bootstrap-");
    const reviewRoot = path.join(cwd, "commerce-assets", "review", "candidate-3c4f2ee364ba5b07", "v020");
    await mkdir(reviewRoot, { recursive: true });
    await writeFile(path.join(reviewRoot, "human-review-decision.json"), JSON.stringify({
      candidate_id: "candidate-3c4f2ee364ba5b07",
      version: "v020",
      human_review_status: "PENDING_HUMAN_REVIEW",
      private_upload_allowed: false,
      requires_fresh_upload_approval: true
    }), "utf8");

    const state = await readAutopilotState(cwd);

    expect(state).toMatchObject({
      current_review_version: "v020",
      latest_human_review_status: "PENDING_HUMAN_REVIEW",
      private_upload_allowed: false,
      next_recommended_action: "WAIT_FOR_OWNER_REVIEW"
    });
  });

  test("uses a 90 minute lock and recovers stale lock files", async () => {
    const cwd = await makeCwd("commerce-autopilot-lock-");

    const first = await acquireHourlyLock(cwd, { now: new Date("2026-06-27T00:00:00.000Z") });
    const second = await acquireHourlyLock(cwd, { now: new Date("2026-06-27T00:30:00.000Z") });
    const stale = await acquireHourlyLock(cwd, { now: new Date("2026-06-27T02:00:01.000Z") });

    expect(first.acquired).toBe(true);
    expect(second).toMatchObject({
      acquired: false,
      blockedReason: "HOURLY_AUTOPILOT_LOCK_ACTIVE"
    });
    expect(stale).toMatchObject({
      acquired: true,
      staleRecovered: true
    });

    await releaseHourlyLock(cwd);
    await expect(stat(getAutopilotPaths(cwd).lockPath)).rejects.toThrow();
  });
});
