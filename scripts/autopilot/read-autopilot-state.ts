import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  DEFAULT_CANDIDATE_ID,
  V020_REAL_SCENE_FAIL_REASONS,
  type AutopilotState,
  type HumanReviewDecision,
  type OwnerUploadApproval,
  createDefaultAutopilotState
} from "./autopilot-safety-gates";

const execFileAsync = promisify(execFile);

export type AutopilotPaths = {
  rootDir: string;
  statePath: string;
  reportPath: string;
  eventsPath: string;
  locksDir: string;
  lockPath: string;
  ownerApprovalPath: string;
};

export function getAutopilotPaths(cwd = process.cwd()): AutopilotPaths {
  const rootDir = path.join(cwd, "commerce-assets", "autopilot");
  const locksDir = path.join(rootDir, "locks");
  return {
    rootDir,
    statePath: path.join(rootDir, "state.json"),
    reportPath: path.join(rootDir, "last-run-report.md"),
    eventsPath: path.join(rootDir, "events.jsonl"),
    locksDir,
    lockPath: path.join(locksDir, "hourly.lock"),
    ownerApprovalPath: path.join(rootDir, "owner-upload-approval.json")
  };
}

export async function readAutopilotState(cwd = process.cwd()): Promise<AutopilotState> {
  const paths = getAutopilotPaths(cwd);
  const parsed = await readOptionalJson<Partial<AutopilotState>>(paths.statePath);
  if (parsed) {
    return createDefaultAutopilotState(parsed);
  }
  return bootstrapStateFromReviewArtifacts(cwd);
}

export async function readHumanReviewDecision(input: {
  cwd?: string;
  candidateId: string;
  version: string;
}): Promise<HumanReviewDecision | null> {
  const cwd = input.cwd ?? process.cwd();
  return readOptionalJson<HumanReviewDecision>(
    path.join(
      cwd,
      "commerce-assets",
      "review",
      input.candidateId,
      input.version,
      "human-review-decision.json"
    )
  );
}

export async function readOwnerUploadApproval(cwd = process.cwd()): Promise<OwnerUploadApproval | null> {
  return readOptionalJson<OwnerUploadApproval>(getAutopilotPaths(cwd).ownerApprovalPath);
}

export async function reviewConsoleExists(input: {
  cwd?: string;
  candidateId: string;
  version: string;
}): Promise<boolean> {
  const cwd = input.cwd ?? process.cwd();
  return fileExists(path.join(
    cwd,
    "commerce-assets",
    "review",
    input.candidateId,
    input.version,
    "review-console.html"
  ));
}

export async function readPackageJson(cwd = process.cwd()): Promise<Record<string, unknown>> {
  const packageJson = await readOptionalJson<Record<string, unknown>>(path.join(cwd, "package.json"));
  return packageJson ?? {};
}

export async function getGitStatusShort(cwd = process.cwd()): Promise<string> {
  try {
    const result = await execFileAsync("git", ["status", "--short"], {
      cwd,
      windowsHide: true,
      maxBuffer: 1024 * 1024
    });
    return result.stdout.trimEnd();
  } catch {
    return "";
  }
}

export function packageHasScript(packageJson: Record<string, unknown>, scriptName: string): boolean {
  const scripts = packageJson.scripts;
  return Boolean(
    scripts &&
    typeof scripts === "object" &&
    !Array.isArray(scripts) &&
    typeof (scripts as Record<string, unknown>)[scriptName] === "string"
  );
}

export async function readOptionalJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function bootstrapStateFromReviewArtifacts(cwd: string): Promise<AutopilotState> {
  const candidateRoot = path.join(cwd, "commerce-assets", "review", DEFAULT_CANDIDATE_ID);
  const versions = await readReviewVersions(candidateRoot);
  for (const version of versions) {
    const decision = await readOptionalJson<HumanReviewDecision>(
      path.join(candidateRoot, version, "human-review-decision.json")
    );
    if (!decision?.human_review_status) {
      continue;
    }
    const status = normalizeHumanReviewStatus(decision.human_review_status);
    const failReasons = Array.isArray(decision.fail_reasons) ? decision.fail_reasons : [];
    const nextAction = status === "PENDING_HUMAN_REVIEW"
      ? "WAIT_FOR_OWNER_REVIEW"
      : status === "PASS_LOCAL_HUMAN_REVIEW"
        ? "WAIT_FOR_FRESH_PRIVATE_UPLOAD_APPROVAL"
        : status === "FAIL_LOCAL_HUMAN_REVIEW"
          ? nextActionForFailedReview(decision.version ?? version, failReasons)
          : null;
    return createDefaultAutopilotState({
      current_phase: status === "PENDING_HUMAN_REVIEW" ? "WAITING_HUMAN_REVIEW" : "INIT",
      current_candidate_id: decision.candidate_id ?? DEFAULT_CANDIDATE_ID,
      current_review_version: decision.version ?? version,
      latest_human_review_status: status,
      latest_fail_reasons: failReasons,
      next_recommended_action: nextAction,
      private_upload_allowed: decision.private_upload_allowed === true
    });
  }
  return createDefaultAutopilotState();
}

function nextActionForFailedReview(version: string, failReasons: string[]): string {
  if (version === "v020" && failReasons.some((reason) =>
    (V020_REAL_SCENE_FAIL_REASONS as readonly string[]).includes(reason)
  )) {
    return "GENERATE_AUTO_REAL_SCENE_ASSETS";
  }
  return "BUILD_NEXT_REVIEW_PACKET";
}

async function readReviewVersions(candidateRoot: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(candidateRoot, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && /^v\d+$/i.test(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => Number(b.slice(1)) - Number(a.slice(1)));
  } catch {
    return [];
  }
}

function normalizeHumanReviewStatus(status: string): AutopilotState["latest_human_review_status"] {
  if (
    status === "PENDING_HUMAN_REVIEW" ||
    status === "PASS_LOCAL_HUMAN_REVIEW" ||
    status === "FAIL_LOCAL_HUMAN_REVIEW" ||
    status === "VOICE_PROVIDER_BLOCKED"
  ) {
    return status;
  }
  return "UNKNOWN";
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  readAutopilotState()
    .then((state) => {
      console.log(JSON.stringify({
        version: state.version,
        last_run_at: state.last_run_at,
        current_phase: state.current_phase,
        current_candidate_id: state.current_candidate_id,
        current_review_version: state.current_review_version,
        latest_human_review_status: state.latest_human_review_status,
        latest_fail_reasons: state.latest_fail_reasons,
        next_recommended_action: state.next_recommended_action,
        private_upload_allowed: state.private_upload_allowed,
        fresh_upload_approval_present: state.fresh_upload_approval_present,
        last_youtube_video_id_present: Boolean(state.last_youtube_video_id),
        youtube_insert_count_this_run: state.youtube_insert_count_this_run,
        public_upload_blocked: state.public_upload_blocked,
        unlisted_upload_blocked: state.unlisted_upload_blocked,
        safety_stop_reason: state.safety_stop_reason
      }, null, 2));
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
