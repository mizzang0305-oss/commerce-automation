import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { armFirstOperation, nextKstDate } from "../../src/lib/daily69-first-operation";
import { acquireStrictProcessLock } from "../../src/lib/queue-scheduler/lock";

async function main() {
  const sourceRoot = resolve(requiredArg("--source-root"));
  const expectedGitHead = requiredArg("--expected-head");
  const exec = promisify(execFile);
  const actualGitHead = (await exec("git", ["rev-parse", "HEAD"], { cwd: process.cwd(), windowsHide: true })).stdout.trim();
  if (actualGitHead !== expectedGitHead) throw new Error("RUNTIME_GIT_HEAD_MISMATCH");
  const dirty = (await exec("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: process.cwd(), windowsHide: true })).stdout.trim();
  if (dirty) throw new Error("RUNTIME_GIT_WORKTREE_NOT_CLEAN");
  const operationBase = resolve(requiredArg("--operation-base"));
  const operationDate = optionalArg("--operation-date") ?? nextKstDate(new Date());
  const attemptNumber = optionalIntegerArg("--attempt-number") ?? 1;
  const namespace = optionalArg("--namespace") ?? (attemptNumber === 1 ? `operation-${operationDate}` : `operation-${operationDate}-attempt-${attemptNumber}`);
  const release = await acquireStrictProcessLock(resolve(operationBase, ".locks", `${namespace}.lock`), `first-operation-arm-${process.pid}`);
  try {
    const result = await armFirstOperation({
      sourceRoot,
      operationBase,
      expectedGitHead,
      assetBoundaryRoot: resolve(optionalArg("--asset-boundary-root") ?? sourceRoot),
      usageMaterializationAssetRoot: resolve(requiredArg("--usage-asset-root")),
      now: new Date(),
      operationDate,
      namespace: optionalArg("--namespace"),
      attemptNumber,
      previousAttemptNamespace: optionalArg("--previous-attempt-namespace")
    });
    process.stdout.write(`${JSON.stringify({ event: "daily69_first_operation_armed", decision: result.manifest.decision, operationDate: result.manifest.operationDate, namespace: result.manifest.namespace, prevalidatedReady: 9, scheduled: 60, batches: 20, idempotent: result.idempotent, SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 })}\n`);
  } finally { await release(); }
}

function requiredArg(name: string) { const index = process.argv.indexOf(name); const value = index >= 0 ? process.argv[index + 1] : ""; if (!value) throw new Error(`MISSING_ARGUMENT_${name.replace(/^-+/u, "").toUpperCase()}`); return value; }
function optionalArg(name: string) { const index = process.argv.indexOf(name); const value = index >= 0 ? process.argv[index + 1] : ""; return value || undefined; }
function optionalIntegerArg(name: string) { const value = optionalArg(name); if (!value) return undefined; const parsed = Number(value); if (!Number.isInteger(parsed)) throw new Error(`INVALID_ARGUMENT_${name.replace(/^-+/u, "").toUpperCase()}`); return parsed; }
void main().catch((error: unknown) => { process.stderr.write(`${JSON.stringify({ event: "daily69_first_operation_arm_failed", safeError: safeError(error), SAFE_TO_UPLOAD: false })}\n`); process.exitCode = 1; });
function safeError(error: unknown) { const value = error instanceof Error ? error.message : String(error); return /^[A-Z0-9_:-]+$/u.test(value) ? value : "FIRST_OPERATION_ARM_FAILED"; }
