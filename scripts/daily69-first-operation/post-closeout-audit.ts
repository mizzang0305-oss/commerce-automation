import { resolve } from "node:path";
import { recomputePostCloseout } from "../../src/lib/daily69-first-operation/postCloseout";

async function main() {
  const report = await recomputePostCloseout(resolve(requiredRoot()));
  process.stdout.write(`${JSON.stringify({ event: "daily69_post_closeout_audit", completion: report.completion, matrix: report.matrix, SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 })}\n`);
  if (report.completion !== "PASS") process.exitCode = report.completion === "PENDING" ? 2 : 3;
}

function requiredRoot() {
  const index = process.argv.indexOf("--queue-root");
  const value = index >= 0 ? process.argv[index + 1] : process.env.QUEUE_SCHEDULER_ROOT;
  if (!value) throw new Error("FIRST_OPERATION_QUEUE_ROOT_MISSING");
  return value;
}

function safeError(error: unknown) {
  const value = error instanceof Error ? error.message : String(error);
  return /^[A-Z0-9_:-]+$/u.test(value) ? value : "DAILY69_POST_CLOSEOUT_AUDIT_FAILED";
}

void main().catch((error: unknown) => {
  process.stderr.write(`${JSON.stringify({ event: "daily69_post_closeout_audit_failed", safeError: safeError(error), SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 })}\n`);
  process.exitCode = 3;
});
