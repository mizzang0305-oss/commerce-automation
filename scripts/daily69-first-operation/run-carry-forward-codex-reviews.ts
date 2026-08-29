import { execFile } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { resolveExactProductReference } from "../../src/lib/live-product-video";
import { atomicWriteJson } from "../../src/lib/queue-scheduler/atomicJson";
import { CODEX_VISUAL_EVIDENCE_ROLES, executeAuthenticatedCodexReview, type CodexUsageEvidenceProvenance } from "../../src/lib/queue-scheduler/codexCliReviewExecutor";
import { assertCodexReviewEvidence } from "../../src/lib/queue-scheduler/codexReviewEvidence";
import { createCodexVisualEvidenceBinding } from "../../src/lib/queue-scheduler/visualEvidenceBinding";
import type { CodexReviewEvidenceV2, LocalQueueItem } from "../../src/lib/queue-scheduler/types";

async function main() {
  const sourceRoot = resolve(requiredArg("--source-root"));
  const targetNamespace = requiredArg("--target-namespace");
  const evidenceRoot = resolve(requiredArg("--evidence-root"));
  const outputPath = resolve(requiredArg("--output"));
  const existingRegistryPath = optionalArg("--existing-registry");
  assertNoUploadEnvironment(process.env);
  if (!/^operation-\d{4}-\d{2}-\d{2}(?:-attempt-\d+)?$/u.test(targetNamespace)) throw new Error("CARRY_FORWARD_TARGET_NAMESPACE_INVALID");
  const queue = JSON.parse(await readFile(join(sourceRoot, "queue.json"), "utf8")) as LocalQueueItem[];
  const ready = queue.filter((item) => item.status === "video_ready_autoqa" && item.reviewMetadata.codexReview === "pass")
    .sort((left, right) => left.queueRank - right.queueRank || left.id.localeCompare(right.id));
  if (ready.length !== 9) throw new Error("CARRY_FORWARD_EXACT_NINE_REQUIRED");
  const evidence: CodexReviewEvidenceV2[] = [];
  const results: Array<{ slotId: string; queueId: string; productKey: string; status: string; errorCode: string; receiptPath: string }> = [];
  const existingEvidence = existingRegistryPath
    ? await readExistingEvidence(resolve(existingRegistryPath), targetNamespace)
    : [];
  for (const item of ready) {
    const reusable = existingEvidence.find((entry) => entry.queueId === item.id && entry.productKey === item.productKey);
    if (reusable && item.operationCarryover) {
      try {
        await assertCodexReviewEvidence({ evidence: reusable, item, queueRoot: join(dirname(sourceRoot), targetNamespace), now: new Date() });
        if (reusable.reviewResult !== "pass" || reusable.hardBlockers.length !== 0) throw new Error("CARRY_FORWARD_EXISTING_EVIDENCE_NOT_PASS");
        evidence.push(reusable);
        results.push({ slotId: item.slotId, queueId: item.id, productKey: item.productKey, status: "pass", errorCode: "", receiptPath: reusable.reviewReceiptPath });
        continue;
      } catch {
        // Invalid or stale prior evidence is never promoted; this item receives one fresh bounded review below.
      }
    }
    const prepared = await prepareFreshVisualInputs(item, evidenceRoot);
    const originVideoSha256 = item.operationCarryover?.originVideoSha256 || item.operationCarryover?.sourceVideoHash || await sha256File(item.videoPath);
    const usageEvidenceProvenance = item.operationCarryover
      ? await readReceiptUsageProvenance(reusable?.reviewReceiptPath)
      : {
        identityType: "generic_usage_example" as const,
        sourceType: "historical_machine_qa_attested_generic_usage" as const,
        productKey: item.productKey,
        machineQaArtifactSha256: await sha256File(item.reviewPath),
        reviewedVideoSha256: await sha256File(item.videoPath),
        exactProductUseClaimed: false as const,
      };
    const result = await executeAuthenticatedCodexReview({
      operationNamespace: targetNamespace,
      slotId: item.slotId,
      queueId: item.id,
      productKey: item.productKey,
      productName: item.canonicalProductName,
      videoPath: item.videoPath,
      machineQaSourceArtifact: item.reviewPath,
      finalReviewArtifact: item.reviewPath,
      productReferencePath: prepared.productReferencePath,
      visualEvidencePaths: prepared.visualEvidencePaths,
      visualEvidenceRoles: [...CODEX_VISUAL_EVIDENCE_ROLES],
      visualEvidenceBindingPath: prepared.visualEvidenceBindingPath,
      usageEvidenceProvenance,
      receiptRoot: evidenceRoot,
      provenance: "carry_forward_revalidation",
      regenerationCount: item.operationCarryover?.regenerationCount ?? 0,
      originOperationNamespace: item.operationCarryover?.originOperationNamespace || basename(sourceRoot),
      originQueueId: item.operationCarryover?.originQueueId || item.id,
      originVideoSha256,
    });
    results.push({ slotId: item.slotId, queueId: item.id, productKey: item.productKey, status: result.status, errorCode: result.errorCode, receiptPath: result.receiptPath });
    if (result.evidence) evidence.push(result.evidence);
  }
  for (const item of ready) {
    const exact = evidence.find((entry) => entry.queueId === item.id && entry.productKey === item.productKey);
    if (!exact) throw new Error("CARRY_FORWARD_EXACT_EVIDENCE_MISSING");
    await assertCodexReviewEvidence({ evidence: exact, item, queueRoot: join(dirname(sourceRoot), targetNamespace), now: new Date() });
  }
  const passed = results.filter((result) => result.status === "pass").length;
  const decision = passed === 9 && evidence.length === 9 ? "CARRY_FORWARD_CODEX_REVALIDATION_PASS" : "CARRY_FORWARD_CODEX_REVALIDATION_BLOCKED";
  const exactBindings = await Promise.all(evidence.map(readExactReceiptBinding));
  await atomicWriteJson(outputPath, {
    schemaVersion: "daily69-carry-forward-codex-review-registry-v1",
    decision,
    targetNamespace,
    sourceNamespace: basename(sourceRoot),
    requested: ready.length,
    passed,
    evidence,
    exactBindings,
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
function optionalArg(name: string) { const index = process.argv.indexOf(name); const value = index >= 0 ? process.argv[index + 1] : ""; return value || undefined; }
async function readExistingEvidence(path: string, targetNamespace: string) {
  const registry = JSON.parse(await readFile(path, "utf8")) as { targetNamespace?: unknown; evidence?: CodexReviewEvidenceV2[] };
  if (registry.targetNamespace !== targetNamespace || !Array.isArray(registry.evidence)) throw new Error("CARRY_FORWARD_EXISTING_REGISTRY_INVALID");
  return registry.evidence;
}
async function readReceiptUsageProvenance(path?: string): Promise<CodexUsageEvidenceProvenance> {
  if (!path) throw new Error("CARRY_FORWARD_ALLOCATED_USAGE_PROVENANCE_REQUIRED");
  const receipt = JSON.parse(await readFile(path, "utf8")) as { usageEvidenceProvenance?: CodexUsageEvidenceProvenance };
  if (!receipt.usageEvidenceProvenance) throw new Error("CARRY_FORWARD_ALLOCATED_USAGE_PROVENANCE_REQUIRED");
  return receipt.usageEvidenceProvenance;
}
async function readExactReceiptBinding(evidence: CodexReviewEvidenceV2) {
  const receipt = JSON.parse(await readFile(evidence.reviewReceiptPath, "utf8")) as Record<string, unknown>;
  return {
    queueId: evidence.queueId,
    productKey: evidence.productKey,
    videoSha256: evidence.videoSha256,
    productReference: receipt.productReference,
    visualEvidence: receipt.visualEvidence,
    visualEvidenceBindingSha256: receipt.visualEvidenceBindingSha256,
    usageEvidenceProvenance: receipt.usageEvidenceProvenance,
    machineQaSourceSha256: receipt.machineQaSourceSha256,
  };
}
const execFileAsync = promisify(execFile);
async function prepareFreshVisualInputs(item: LocalQueueItem, evidenceRoot: string) {
  const slotRoot = join(evidenceRoot, "fresh-visual-inputs", item.slotId);
  await mkdir(slotRoot, { recursive: true });
  const visualEvidencePaths = [
    join(slotRoot, "first-frame.jpg"),
    join(slotRoot, "first-3-seconds-contact-sheet.jpg"),
    join(slotRoot, "contact-sheet.jpg"),
  ];
  const ffmpegCommon = { encoding: "utf8" as const, maxBuffer: 4 * 1024 * 1024, shell: false, timeout: 180_000, windowsHide: true };
  await execFileAsync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-ss", "0", "-i", resolve(item.videoPath), "-frames:v", "1", visualEvidencePaths[0]], ffmpegCommon);
  await execFileAsync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-t", "3", "-i", resolve(item.videoPath), "-vf", "fps=1,scale=360:-1,tile=3x1", "-frames:v", "1", visualEvidencePaths[1]], ffmpegCommon);
  await execFileAsync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", resolve(item.videoPath), "-vf", "fps=1/3,scale=360:-1,tile=3x3", "-frames:v", "1", visualEvidencePaths[2]], ffmpegCommon);
  const pythonExe = process.env.VIDEO_AUTOMATION_PYTHON?.trim();
  if (!pythonExe) throw new Error("VIDEO_AUTOMATION_LOCAL_RUNTIME_NOT_CONFIGURED");
  const reference = await resolveExactProductReference({ candidate: item.candidate, outputDir: join(slotRoot, "product-reference"), pythonExe, visualQaScript: resolve("tools", "video-automation", "visual_qa.py") });
  const binding = await createCodexVisualEvidenceBinding({
    productKey: item.productKey,
    videoPath: item.videoPath,
    productReferencePath: reference.localPath,
    visualEvidencePaths,
    visualEvidenceRoles: CODEX_VISUAL_EVIDENCE_ROLES,
    derivation: "ffmpeg_derived_from_immutable_video",
    outputPath: join(slotRoot, "codex-visual-evidence-binding.json"),
  });
  return { productReferencePath: reference.localPath, visualEvidencePaths, visualEvidenceBindingPath: binding.path };
}
function safeError(error: unknown) { const value = error instanceof Error ? error.message : String(error); return /^[A-Z0-9_:-]+$/u.test(value) ? value : "CARRY_FORWARD_CODEX_REVALIDATION_FAILED"; }
function assertNoUploadEnvironment(env: NodeJS.ProcessEnv) { if (["SAFE_TO_UPLOAD", "SAFE_TO_PUBLIC_UPLOAD", "YOUTUBE_AUTO_UPLOAD", "PUBLIC_UPLOAD", "UNLISTED_UPLOAD", "TIKTOK_AUTO_UPLOAD", "THREADS_AUTO_POST", "COMMENT_AUTOMATION", "GOOGLE_DRIVE_VIDEO_UPLOAD"].some((name) => env[name]?.trim().toLowerCase() === "true")) throw new Error("UPLOAD_SAFETY_FLAG_BLOCKED"); }
void main().catch((error: unknown) => { process.stderr.write(`${JSON.stringify({ event: "carry_forward_codex_revalidation_failed", safeError: safeError(error), SAFE_TO_UPLOAD: false })}\n`); process.exitCode = 1; });
