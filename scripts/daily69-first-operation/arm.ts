import { resolve } from "node:path";
import { armFirstOperation } from "../../src/lib/daily69-first-operation";

async function main() {
  const result = await armFirstOperation({
    sourceRoot: resolve(requiredArg("--source-root")),
    operationBase: resolve(requiredArg("--operation-base")),
    expectedGitHead: requiredArg("--expected-head"),
    assetBoundaryRoot: process.cwd(),
    now: new Date()
  });
  process.stdout.write(`${JSON.stringify({ event: "daily69_first_operation_armed", decision: result.manifest.decision, operationDate: result.manifest.operationDate, namespace: result.manifest.namespace, prevalidatedReady: 9, scheduled: 60, batches: 20, idempotent: result.idempotent, SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 })}\n`);
}

function requiredArg(name: string) { const index = process.argv.indexOf(name); const value = index >= 0 ? process.argv[index + 1] : ""; if (!value) throw new Error(`MISSING_ARGUMENT_${name.replace(/^-+/u, "").toUpperCase()}`); return value; }
void main().catch((error: unknown) => { process.stderr.write(`${JSON.stringify({ event: "daily69_first_operation_arm_failed", safeError: safeError(error), SAFE_TO_UPLOAD: false })}\n`); process.exitCode = 1; });
function safeError(error: unknown) { const value = error instanceof Error ? error.message : String(error); return /^[A-Z0-9_:-]+$/u.test(value) ? value : "FIRST_OPERATION_ARM_FAILED"; }
