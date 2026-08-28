import { readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { atomicWriteJson } from "../../src/lib/queue-scheduler/atomicJson";
import { LocalQueueRepository } from "../../src/lib/queue-scheduler/repository";
import type { CodexReviewEvidenceV2 } from "../../src/lib/queue-scheduler/types";

async function main() {
  const queueRoot = resolve(requiredArg("--queue-root"));
  const registryPath = resolve(requiredArg("--registry"));
  const registry = JSON.parse(await readFile(registryPath, "utf8")) as {
    schemaVersion?: unknown;
    decision?: unknown;
    targetNamespace?: unknown;
    evidence?: CodexReviewEvidenceV2[];
  };
  if (registry.schemaVersion !== "daily69-carry-forward-codex-review-registry-v1" || registry.decision !== "CARRY_FORWARD_CODEX_REVALIDATION_PASS"
    || registry.targetNamespace !== basename(queueRoot) || !Array.isArray(registry.evidence) || registry.evidence.length !== 9) {
    throw new Error("CARRY_FORWARD_CODEX_REVIEW_REGISTRY_INVALID");
  }
  const repository = new LocalQueueRepository(queueRoot);
  const items = await repository.items();
  const pending = items.filter((item) => item.operationCarryover && item.status === "video_ready_machine_qa" && item.reviewMetadata.codexReview === "not_executed");
  if (pending.length !== 9 || new Set(pending.map((item) => item.id)).size !== 9
    || pending.some((item) => !registry.evidence!.some((entry) => entry.queueId === item.id && entry.productKey === item.productKey))) {
    throw new Error("CARRY_FORWARD_CODEX_REVIEW_QUEUE_BINDING_INVALID");
  }
  const now = new Date();
  const updated = await repository.recordCodexVisualReviews({ reviews: registry.evidence, now });
  const manifestPath = join(queueRoot, "operation-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
  await atomicWriteJson(manifestPath, { ...manifest, verifiedReady: updated });
  process.stdout.write(`${JSON.stringify({ event: "carry_forward_codex_reviews_applied", updated, targetNamespace: basename(queueRoot), SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 })}\n`);
}

function requiredArg(name: string) { const index = process.argv.indexOf(name); const value = index >= 0 ? process.argv[index + 1] : ""; if (!value) throw new Error(`MISSING_ARGUMENT_${name.replace(/^-+/u, "").toUpperCase()}`); return value; }
function safeError(error: unknown) { const value = error instanceof Error ? error.message : String(error); return /^[A-Z0-9_:-]+$/u.test(value) ? value : "CARRY_FORWARD_CODEX_REVIEW_APPLY_FAILED"; }
void main().catch((error: unknown) => { process.stderr.write(`${JSON.stringify({ event: "carry_forward_codex_review_apply_failed", safeError: safeError(error), SAFE_TO_UPLOAD: false })}\n`); process.exitCode = 1; });
