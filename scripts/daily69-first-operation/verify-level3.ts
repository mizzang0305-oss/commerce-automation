import { resolve } from "node:path";
import { closeoutFirstOperation, firstOperationStatus } from "../../src/lib/daily69-first-operation";
import { validateLevel3Completion } from "../../src/lib/daily69-first-operation/level3";
import { collectLevel3CompletionInput } from "../../src/lib/daily69-first-operation/postCloseout";

async function main() {
  const operationRoot = resolve(requiredRoot());
  const result = process.argv.includes("--closeout")
    ? await closeoutFirstOperation(operationRoot)
    : await verify(operationRoot);
  process.stdout.write(`${JSON.stringify({ event: process.argv.includes("--closeout") ? "daily69_first_operation_closeout" : "daily69_level3_verified", ...result, SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 })}\n`);
  if (result.completion !== "PASS") process.exitCode = result.completion === "PENDING" ? 2 : 3;
}

async function verify(operationRoot: string) {
  const snapshot = await firstOperationStatus(operationRoot);
  const matrix = validateLevel3Completion(await collectLevel3CompletionInput(operationRoot, snapshot));
  return { completion: matrix.completion, matrix };
}

function requiredRoot() {
  const index = process.argv.indexOf("--queue-root");
  const value = index >= 0 ? process.argv[index + 1] : process.env.QUEUE_SCHEDULER_ROOT;
  if (!value) throw new Error("FIRST_OPERATION_QUEUE_ROOT_MISSING");
  return value;
}

function safeError(error: unknown) {
  const value = error instanceof Error ? error.message : String(error);
  return /^[A-Z0-9_:-]+$/u.test(value) ? value : "DAILY69_LEVEL3_VERIFY_FAILED";
}

void main().catch((error: unknown) => {
  process.stderr.write(`${JSON.stringify({ event: "daily69_level3_verify_failed", safeError: safeError(error), SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 })}\n`);
  process.exitCode = 3;
});
