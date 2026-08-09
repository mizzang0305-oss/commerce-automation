import { resolve } from "node:path";
import { firstOperationStatus } from "../../src/lib/daily69-first-operation";

void firstOperationStatus(resolve(requiredRoot())).then(({ status }) => {
  process.stdout.write(`${JSON.stringify({ event: "daily69_first_operation_status", ...status })}\n`);
}).catch((error: unknown) => { process.stderr.write(`${JSON.stringify({ event: "daily69_first_operation_status_failed", safeError: safeError(error), SAFE_TO_UPLOAD: false })}\n`); process.exitCode = 1; });

function requiredRoot() { const index = process.argv.indexOf("--queue-root"); const value = index >= 0 ? process.argv[index + 1] : process.env.QUEUE_SCHEDULER_ROOT; if (!value) throw new Error("FIRST_OPERATION_QUEUE_ROOT_MISSING"); return value; }
function safeError(error: unknown) { const value = error instanceof Error ? error.message : String(error); return /^[A-Z0-9_:-]+$/u.test(value) ? value : "FIRST_OPERATION_STATUS_FAILED"; }
