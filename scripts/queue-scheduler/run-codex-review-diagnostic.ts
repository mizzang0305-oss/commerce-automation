import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { atomicWriteJson } from "../../src/lib/queue-scheduler/atomicJson";
import { executeAuthenticatedCodexReview, type CodexReviewRequest } from "../../src/lib/queue-scheduler/codexCliReviewExecutor";

async function main() {
  const requestPath = resolve(requiredArg("--request"));
  const outputPath = resolve(requiredArg("--output"));
  const request = JSON.parse(await readFile(requestPath, "utf8")) as CodexReviewRequest;
  if (request.provenance !== "diagnostic") throw new Error("CODEX_REVIEW_DIAGNOSTIC_PROVENANCE_REQUIRED");
  const result = await executeAuthenticatedCodexReview(request);
  await atomicWriteJson(outputPath, {
    schemaVersion: "queue-codex-review-diagnostic-v1",
    provenance: "diagnostic",
    status: result.status,
    errorCode: result.errorCode,
    attempts: result.attempts,
    deduplicated: result.deduplicated,
    receiptPath: result.receiptPath,
    promotionEvidenceCreated: Boolean(result.evidence),
    SAFE_TO_UPLOAD: false,
    SAFE_TO_PUBLIC_UPLOAD: false,
    PLATFORM_UPLOAD: 0,
  });
  process.stdout.write(`${JSON.stringify({ event: "codex_review_diagnostic_complete", status: result.status, errorCode: result.errorCode, attempts: result.attempts, promotionEvidenceCreated: Boolean(result.evidence), SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 })}\n`);
  if (result.status === "error") process.exitCode = 1;
}

function requiredArg(name: string) { const index = process.argv.indexOf(name); const value = index >= 0 ? process.argv[index + 1] : ""; if (!value) throw new Error(`MISSING_ARGUMENT_${name.replace(/^-+/u, "").toUpperCase()}`); return value; }
function safeError(error: unknown) { const value = error instanceof Error ? error.message : String(error); return /^[A-Z0-9_:-]+$/u.test(value) ? value : "CODEX_REVIEW_DIAGNOSTIC_FAILED"; }
void main().catch((error: unknown) => { process.stderr.write(`${JSON.stringify({ event: "codex_review_diagnostic_failed", safeError: safeError(error), SAFE_TO_UPLOAD: false })}\n`); process.exitCode = 1; });
