import { readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { atomicWriteJson } from "../../src/lib/queue-scheduler/atomicJson";
import { executeAuthenticatedCodexReview } from "../../src/lib/queue-scheduler/codexCliReviewExecutor";
import type { CodexReviewEvidenceV2, LocalQueueItem } from "../../src/lib/queue-scheduler/types";

async function main() {
  const sourceRoot = resolve(requiredArg("--source-root"));
  const targetNamespace = requiredArg("--target-namespace");
  const contactRoot = resolve(requiredArg("--contact-root"));
  const evidenceRoot = resolve(requiredArg("--evidence-root"));
  const outputPath = resolve(requiredArg("--output"));
  if (!/^operation-\d{4}-\d{2}-\d{2}(?:-attempt-\d+)?$/u.test(targetNamespace)) throw new Error("CARRY_FORWARD_TARGET_NAMESPACE_INVALID");
  const queue = JSON.parse(await readFile(join(sourceRoot, "queue.json"), "utf8")) as LocalQueueItem[];
  const ready = queue.filter((item) => item.status === "video_ready_autoqa" && item.reviewMetadata.codexReview === "pass")
    .sort((left, right) => left.queueRank - right.queueRank || left.id.localeCompare(right.id));
  if (ready.length !== 9) throw new Error("CARRY_FORWARD_EXACT_NINE_REQUIRED");
  const evidence: CodexReviewEvidenceV2[] = [];
  const results: Array<{ queueId: string; productKey: string; status: string; errorCode: string; receiptPath: string }> = [];
  for (const item of ready) {
    const contactSheet = join(contactRoot, `${item.slotId}-contact.jpg`);
    const result = await executeAuthenticatedCodexReview({
      operationNamespace: targetNamespace,
      queueId: item.id,
      productKey: item.productKey,
      videoPath: item.videoPath,
      machineQaSourceArtifact: item.reviewPath,
      finalReviewArtifact: item.reviewPath,
      visualEvidencePaths: [contactSheet],
      receiptRoot: evidenceRoot,
      provenance: "carry_forward_revalidation",
      regenerationCount: 0,
      originOperationNamespace: basename(sourceRoot),
      originQueueId: item.id,
      originVideoSha256: item.operationCarryover?.sourceVideoHash || await sha256File(item.videoPath),
    });
    results.push({ queueId: item.id, productKey: item.productKey, status: result.status, errorCode: result.errorCode, receiptPath: result.receiptPath });
    if (result.evidence) evidence.push(result.evidence);
  }
  const passed = results.filter((result) => result.status === "pass").length;
  const decision = passed === 9 && evidence.length === 9 ? "CARRY_FORWARD_CODEX_REVALIDATION_PASS" : "CARRY_FORWARD_CODEX_REVALIDATION_BLOCKED";
  await atomicWriteJson(outputPath, {
    schemaVersion: "daily69-carry-forward-codex-review-registry-v1",
    decision,
    targetNamespace,
    sourceNamespace: basename(sourceRoot),
    requested: ready.length,
    passed,
    evidence,
    results,
    SAFE_TO_UPLOAD: false,
    SAFE_TO_PUBLIC_UPLOAD: false,
    PLATFORM_UPLOAD: 0,
  });
  process.stdout.write(`${JSON.stringify({ event: "carry_forward_codex_revalidation_complete", decision, requested: ready.length, passed, evidence: evidence.length, SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 })}\n`);
  if (decision !== "CARRY_FORWARD_CODEX_REVALIDATION_PASS") process.exitCode = 2;
}

async function sha256File(path: string) {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(await readFile(path)).digest("hex");
}
function requiredArg(name: string) { const index = process.argv.indexOf(name); const value = index >= 0 ? process.argv[index + 1] : ""; if (!value) throw new Error(`MISSING_ARGUMENT_${name.replace(/^-+/u, "").toUpperCase()}`); return value; }
function safeError(error: unknown) { const value = error instanceof Error ? error.message : String(error); return /^[A-Z0-9_:-]+$/u.test(value) ? value : "CARRY_FORWARD_CODEX_REVALIDATION_FAILED"; }
void main().catch((error: unknown) => { process.stderr.write(`${JSON.stringify({ event: "carry_forward_codex_revalidation_failed", safeError: safeError(error), SAFE_TO_UPLOAD: false })}\n`); process.exitCode = 1; });
