import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildCommercePocRunId,
  runCommerceAutomationPoc
} from "../../src/lib/orchestration/commercePocPipeline";

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

  if (!inputPath || !allowedHost) {
    throw new Error("Usage: --input=<products.jsonl> --allowed-host=<host> [--target=activepieces|windmill]");
  }
  if (requestedTarget !== "activepieces" && requestedTarget !== "windmill") {
    throw new Error("--target must be activepieces or windmill");
  }

  const inputContent = await readFile(resolve(inputPath), "utf8");
  const now = new Date().toISOString();
  const runId = buildCommercePocRunId({
    inputContent,
    allowedHost,
    target: requestedTarget
  });
  const products = inputContent
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown);
  const result = await runCommerceAutomationPoc({
    batchId: runId,
    requestId: runId,
    target: requestedTarget,
    now,
    products,
    sourcePolicy: {
      allowed_hosts: [allowedHost],
      authorization_basis: "public_page",
      forbidden_words: [],
      exaggeration_terms: []
    }
  });

  console.log(JSON.stringify({
    ok: result.ok,
    collected: result.reviews.length,
    review_passed: result.orchestrator_payload.counts.review_passed,
    review_blocked: result.orchestrator_payload.counts.review_blocked,
    drafts_created: result.drafts.length,
    webhook_called: result.webhook_called,
    notification_sent: result.notification_sent,
    publish_attempted: result.publish_attempted,
    SAFE_TO_UPLOAD: result.SAFE_TO_UPLOAD,
    SAFE_TO_PUBLIC_UPLOAD: result.SAFE_TO_PUBLIC_UPLOAD
  }, null, 2));
}

void main();
