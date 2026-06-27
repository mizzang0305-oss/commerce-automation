import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  LOCK_TIMEOUT_MINUTES,
  NEXT_REVIEW_VERSION,
  type AutopilotState
} from "./autopilot-safety-gates";
import {
  type AutopilotDecision,
  applyDecisionToState,
  decideNextAutopilotAction
} from "./decide-next-action";
import {
  appendAutopilotEvent,
  writeAutopilotReport
} from "./autopilot-report";
import {
  getAutopilotPaths,
  readAutopilotState
} from "./read-autopilot-state";
import {
  ensureAutopilotDirs,
  writeAutopilotState
} from "./write-autopilot-state";

const execFileAsync = promisify(execFile);

export type LockResult = {
  acquired: boolean;
  blockedReason?: "HOURLY_AUTOPILOT_LOCK_ACTIVE";
  staleRecovered?: boolean;
  lockPath: string;
};

export type HourlyRunnerResult = {
  lock: LockResult;
  state: AutopilotState;
  decision: AutopilotDecision;
  reviewCommandExecuted: boolean;
  generatedReviewVersion: string | null;
  privateUploadAttempted: false;
  youtubeVideoIdPresent: false;
  reportPath: string | null;
};

export type CommandRunner = (input: {
  cwd: string;
  scriptName: string;
}) => Promise<{ ok: boolean; exitCode?: number; blocker?: string }>;

export async function acquireHourlyLock(cwd = process.cwd(), options: {
  now?: Date;
  timeoutMinutes?: number;
} = {}): Promise<LockResult> {
  const now = options.now ?? new Date();
  const timeoutMinutes = options.timeoutMinutes ?? LOCK_TIMEOUT_MINUTES;
  const paths = getAutopilotPaths(cwd);
  await ensureAutopilotDirs(cwd);

  const existing = await readLock(paths.lockPath);
  if (existing) {
    const ageMs = now.getTime() - new Date(existing.acquired_at).getTime();
    if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= timeoutMinutes * 60 * 1000) {
      return {
        acquired: false,
        blockedReason: "HOURLY_AUTOPILOT_LOCK_ACTIVE",
        lockPath: paths.lockPath
      };
    }
  }

  await fs.writeFile(paths.lockPath, `${JSON.stringify({
    acquired_at: now.toISOString(),
    pid: process.pid
  }, null, 2)}\n`, "utf8");

  return {
    acquired: true,
    staleRecovered: Boolean(existing),
    lockPath: paths.lockPath
  };
}

export async function releaseHourlyLock(cwd = process.cwd()): Promise<void> {
  await fs.rm(getAutopilotPaths(cwd).lockPath, { force: true });
}

export async function runHourlyAutopilot(input: {
  cwd?: string;
  commandRunner?: CommandRunner;
  now?: Date;
} = {}): Promise<HourlyRunnerResult> {
  const cwd = input.cwd ?? process.cwd();
  const now = input.now ?? new Date();
  const lock = await acquireHourlyLock(cwd, { now });
  if (!lock.acquired) {
    const state = await readAutopilotState(cwd);
    const decision: AutopilotDecision = {
      phase: "BLOCKED_SAFETY",
      nextAction: "WAIT_FOR_ACTIVE_HOURLY_LOCK",
      shouldStop: true,
      privateUploadAttempted: false,
      videosInsertAllowed: false,
      blockedReasons: [lock.blockedReason ?? "HOURLY_AUTOPILOT_LOCK_ACTIVE"],
      safetyStopReason: lock.blockedReason ?? "HOURLY_AUTOPILOT_LOCK_ACTIVE"
    };
    await appendAutopilotEvent(cwd, {
      event_type: "lock_blocked",
      phase: decision.phase,
      next_action: decision.nextAction,
      blocked_reasons: decision.blockedReasons
    });
    const reportPath = await writeAutopilotReport({ cwd, state, decision });
    return {
      lock,
      state,
      decision,
      reviewCommandExecuted: false,
      generatedReviewVersion: null,
      privateUploadAttempted: false,
      youtubeVideoIdPresent: false,
      reportPath
    };
  }

  let reportPath: string | null = null;
  try {
    const initialState = await readAutopilotState(cwd);
    let decision = await decideNextAutopilotAction({ cwd, state: initialState });
    let state = applyDecisionToState({ state: initialState, decision, now });
    let reviewCommandExecuted = false;
    let generatedReviewVersion: string | null = null;

    if (
      decision.nextAction === "BUILD_V020_REAL_MOTION_REVIEW" &&
      decision.reviewCommand &&
      decision.reviewCommandAvailable === true &&
      decision.shouldStop === false
    ) {
      const runner = input.commandRunner ?? runNpmScript;
      const commandResult = await runner({ cwd, scriptName: decision.reviewCommand });
      reviewCommandExecuted = commandResult.ok === true;
      if (commandResult.ok === true) {
        generatedReviewVersion = NEXT_REVIEW_VERSION;
        state = {
          ...state,
          current_phase: "WAITING_HUMAN_REVIEW",
          current_review_version: NEXT_REVIEW_VERSION,
          latest_human_review_status: "PENDING_HUMAN_REVIEW",
          latest_fail_reasons: [],
          next_recommended_action: "WAIT_FOR_OWNER_REVIEW",
          private_upload_allowed: false,
          safety_stop_reason: null
        };
        decision = {
          phase: "WAITING_HUMAN_REVIEW",
          nextAction: "WAIT_FOR_OWNER_REVIEW",
          shouldStop: true,
          privateUploadAttempted: false,
          videosInsertAllowed: false,
          blockedReasons: []
        };
      } else {
        state = {
          ...state,
          current_phase: "BLOCKED_QA",
          safety_stop_reason: commandResult.blocker ?? "REVIEW_PACKET_GENERATION_FAILED"
        };
        decision = {
          ...decision,
          phase: "BLOCKED_QA",
          shouldStop: true,
          blockedReasons: [commandResult.blocker ?? "REVIEW_PACKET_GENERATION_FAILED"],
          safetyStopReason: commandResult.blocker ?? "REVIEW_PACKET_GENERATION_FAILED"
        };
      }
    }

    if (
      decision.nextAction === "BUILD_V020_REAL_MOTION_REVIEW" &&
      decision.reviewCommand &&
      decision.reviewCommandAvailable !== true
    ) {
      state = {
        ...state,
        current_phase: "BLOCKED_PROVIDER",
        safety_stop_reason: "REVIEW_PACKET_COMMAND_MISSING"
      };
      decision = {
        ...decision,
        phase: "BLOCKED_PROVIDER",
        shouldStop: true,
        blockedReasons: ["REVIEW_PACKET_COMMAND_MISSING"],
        safetyStopReason: "REVIEW_PACKET_COMMAND_MISSING"
      };
    }

    await writeAutopilotState(cwd, state);
    await appendAutopilotEvent(cwd, {
      event_type: "hourly_run",
      phase: decision.phase,
      next_action: decision.nextAction,
      blocked_reasons: decision.blockedReasons,
      review_command_executed: reviewCommandExecuted,
      generated_review_version: generatedReviewVersion
    });
    reportPath = await writeAutopilotReport({ cwd, state, decision });

    return {
      lock,
      state,
      decision,
      reviewCommandExecuted,
      generatedReviewVersion,
      privateUploadAttempted: false,
      youtubeVideoIdPresent: false,
      reportPath
    };
  } catch (error) {
    await appendAutopilotEvent(cwd, {
      event_type: "hourly_run_error",
      phase: "BLOCKED_SAFETY",
      next_action: "MANUAL_REVIEW_REQUIRED",
      blocked_reasons: [error instanceof Error ? error.message : String(error)]
    });
    throw error;
  } finally {
    await releaseHourlyLock(cwd);
  }
}

async function runNpmScript(input: { cwd: string; scriptName: string }): Promise<{ ok: boolean; exitCode?: number; blocker?: string }> {
  try {
    await execFileAsync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", input.scriptName], {
      cwd: input.cwd,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 16,
      timeout: 900000
    });
    return { ok: true, exitCode: 0 };
  } catch (error) {
    const exitCode = typeof (error as { code?: unknown }).code === "number"
      ? (error as { code: number }).code
      : 1;
    return {
      ok: false,
      exitCode,
      blocker: "REVIEW_PACKET_GENERATION_FAILED"
    };
  }
}

async function readLock(lockPath: string): Promise<{ acquired_at: string; pid?: number } | null> {
  try {
    return JSON.parse(await fs.readFile(lockPath, "utf8")) as { acquired_at: string; pid?: number };
  } catch {
    return null;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runHourlyAutopilot()
    .then((result) => {
      console.log(JSON.stringify({
        hourly_run_executed: result.lock.acquired,
        phase: result.decision.phase,
        next_action: result.decision.nextAction,
        review_command_executed: result.reviewCommandExecuted,
        generated_review_version: result.generatedReviewVersion,
        private_upload_attempted: result.privateUploadAttempted,
        youtube_video_id_present: result.youtubeVideoIdPresent,
        report_path: result.reportPath
      }, null, 2));
      if (result.decision.phase === "BLOCKED_SAFETY") {
        process.exitCode = 2;
      }
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
