import { execFile } from "node:child_process";
import { statfs } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { firstOperationStatus, verifyFirstOperationMaterializationEligibility, verifySourceBundle } from "../../src/lib/daily69-first-operation";
import { NoUploadGoogleSheetsClient } from "../../src/lib/queue-control-integration";
import { inspectQueueVideoRuntime, kstDate } from "../../src/lib/queue-scheduler";
import { isDaily69CloseoutWindow } from "../../src/lib/daily69-first-operation/timing";
import { assertFirstOperationIdentity } from "../../src/lib/daily69-first-operation/operationIdentity";
import { readOperationCodexRuntime } from "../../src/lib/queue-scheduler/codexRuntimeBinding";

const exec = promisify(execFile);

async function main() {
  const operationRoot = resolve(requiredEnv("QUEUE_SCHEDULER_ROOT"));
  const sourceRoot = resolve(requiredEnv("FIRST_OPERATION_SOURCE_ROOT"));
  const snapshot = await firstOperationStatus(operationRoot);
  assertFirstOperationIdentity(snapshot.manifest);
  const actualHead = (await exec("git", ["rev-parse", "HEAD"], { cwd: process.cwd(), windowsHide: true })).stdout.trim();
  if (actualHead !== snapshot.manifest.expectedGitHead) throw new Error("RUNTIME_GIT_HEAD_MISMATCH");
  const dirty = (await exec("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: process.cwd(), windowsHide: true })).stdout.trim();
  if (dirty) throw new Error("RUNTIME_GIT_WORKTREE_NOT_CLEAN");
  const now = new Date();
  const dateAllowed = process.argv.includes("--closeout")
    ? isDaily69CloseoutWindow(snapshot.manifest.operationDate, now)
    : kstDate(now) === snapshot.manifest.operationDate;
  if (!process.argv.includes("--arming") && !dateAllowed) throw new Error("FIRST_OPERATION_DATE_NOT_ACTIVE");
  if (unsafeUploadFlagPresent(process.env)) throw new Error("UPLOAD_SAFETY_FLAG_BLOCKED");
  if (process.env.GOOGLE_DRIVE_VIDEO_FOLDER_ID?.trim()) throw new Error("DRIVE_SCOPE_MUST_REMAIN_DISABLED");
  await verifySourceBundle(sourceRoot, snapshot.manifest);
  if (snapshot.status.total !== 69 || snapshot.status.productBindingMismatches !== 0 || snapshot.status.duplicateRenders !== 0) throw new Error("FIRST_OPERATION_QUEUE_INVARIANT_FAILED");
  if (!snapshot.status.affiliateReadyForArm || snapshot.status.affiliateReady !== 69 || snapshot.status.affiliateMissing !== 0 || snapshot.status.affiliateInvalid !== 0) {
    throw new Error("DAILY69_AFFILIATE_READINESS_INCOMPLETE");
  }
  const materialization = await verifyFirstOperationMaterializationEligibility(operationRoot);
  const disk = await statfs(operationRoot);
  const freeGb = Math.round(Number(disk.bavail * disk.bsize) / 1024 / 1024 / 1024 * 100) / 100;
  if (freeGb < 20) throw new Error("DISK_SPACE_GUARD_BLOCKED");
  let runtimeReady = true;
  if (process.argv.includes("--runtime")) {
    await readOperationCodexRuntime(operationRoot, snapshot.manifest.namespace);
    runtimeReady = (await inspectQueueVideoRuntime({ diskSpace: true })).ready;
  }
  if (!runtimeReady) throw new Error("RUNTIME_PREFLIGHT_BLOCKED");
  let sheetsReady = true;
  if (process.argv.includes("--sheets")) { const metadata = await new NoUploadGoogleSheetsClient().metadata(); sheetsReady = Boolean(metadata.sheets?.length); }
  if (!sheetsReady) throw new Error("GOOGLE_SHEETS_READ_FAILED");
  process.stdout.write(`${JSON.stringify({ event: "daily69_first_operation_preflight", ready: true, gitHeadMatch: true, sourceProofMatch: true, queueCount: 69, affiliateReady: 69, affiliateMissing: 0, affiliateInvalid: 0, productBindingMismatch: 0, materialization, diskReady: true, freeGb, runtimeReady, sheetsReady, driveScope: false, SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 })}\n`);
}

function unsafeUploadFlagPresent(env: NodeJS.ProcessEnv) { return ["SAFE_TO_UPLOAD", "SAFE_TO_PUBLIC_UPLOAD", "YOUTUBE_AUTO_UPLOAD", "PUBLIC_UPLOAD", "UNLISTED_UPLOAD", "TIKTOK_AUTO_UPLOAD", "THREADS_AUTO_POST", "COMMENT_AUTOMATION", "GOOGLE_DRIVE_VIDEO_UPLOAD"].some((name) => env[name]?.trim().toLowerCase() === "true"); }
function requiredEnv(name: string) { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name}_MISSING`); return value; }
function safeError(error: unknown) { const value = error instanceof Error ? error.message : String(error); return /^[A-Z0-9_:-]+$/u.test(value) ? value : "FIRST_OPERATION_PREFLIGHT_FAILED"; }
void main().catch((error: unknown) => { process.stderr.write(`${JSON.stringify({ event: "daily69_first_operation_preflight_failed", safeError: safeError(error), claim: 0, SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 })}\n`); process.exitCode = 3; });
