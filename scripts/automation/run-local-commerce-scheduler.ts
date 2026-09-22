import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildCommercePocRunId,
  runCommerceAutomationPoc
} from "../../src/lib/orchestration/commercePocPipeline";
import {
  LOCAL_FAILED_SCHEDULE_RETRY_APPROVAL,
  runLocalCommerceSchedule
} from "../../src/lib/orchestration/localCommerceScheduler";

async function main() {
  const args = new Map(
    process.argv.slice(2).map((argument) => {
      const [key, ...rest] = argument.split("=");
      return [key.replace(/^--/, ""), rest.join("=")];
    })
  );
  const inputPath = args.get("input");
  const allowedHost = args.get("allowed-host");
  const requestedTarget = args.get("target") ?? "activepieces";
  const retryFailedApproval = args.get("retry-failed");

  if (!inputPath || !allowedHost) {
    throw new Error(
      "Usage: --input=<products.jsonl> --allowed-host=<host> [--target=activepieces|windmill] " +
      "[--scheduled-at=<ISO datetime>] [--max-attempts=1..5] [--retry-delay-ms=0..86400000] " +
      `[--retry-failed=${LOCAL_FAILED_SCHEDULE_RETRY_APPROVAL}]`
    );
  }
  if (requestedTarget !== "activepieces" && requestedTarget !== "windmill") {
    throw new Error("--target must be activepieces or windmill");
  }
  if (retryFailedApproval !== undefined && retryFailedApproval !== LOCAL_FAILED_SCHEDULE_RETRY_APPROVAL) {
    throw new Error(`--retry-failed must equal ${LOCAL_FAILED_SCHEDULE_RETRY_APPROVAL}`);
  }

  const inputContent = await readFile(resolve(inputPath), "utf8");
  const runId = buildCommercePocRunId({
    inputContent,
    allowedHost,
    target: requestedTarget
  });
  const products = inputContent
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown);
  const scheduledAt = args.get("scheduled-at") ?? new Date().toISOString();
  const maxAttempts = parseIntegerArg(args.get("max-attempts"), 3, "--max-attempts");
  const retryDelayMs = parseIntegerArg(args.get("retry-delay-ms"), 0, "--retry-delay-ms");

  const result = await runLocalCommerceSchedule({
    scheduleId: runId,
    batchId: runId,
    target: requestedTarget,
    scheduledAt,
    maxAttempts,
    retryDelayMs,
    retryFailedApproval,
    execute: () => runCommerceAutomationPoc({
      batchId: runId,
      requestId: runId,
      target: requestedTarget,
      now: new Date().toISOString(),
      products,
      sourcePolicy: {
        allowed_hosts: [allowedHost],
        authorization_basis: "public_page",
        forbidden_words: [],
        exaggeration_terms: []
      }
    })
  });

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exitCode = 1;
  }
}

function parseIntegerArg(value: string | undefined, fallback: number, label: string) {
  if (value === undefined) {
    return fallback;
  }
  if (!/^\d+$/.test(value)) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return Number(value);
}

void main();
