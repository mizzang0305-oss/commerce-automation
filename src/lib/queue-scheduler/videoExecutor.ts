import { spawn } from "node:child_process";
import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { adaptLiveProductToVideoInput, resolveExactProductReference } from "@/lib/live-product-video";
import { generateDeterministicCreativeCandidates } from "@/lib/video-automation/creativeCandidates";
import { rankCreativeCandidates } from "@/lib/video-lab/creativeRanker";
import { materializeAllocatedUsageEvidence } from "./allocatedUsageEvidence";
import { CODEX_VISUAL_EVIDENCE_ROLES, executeAuthenticatedCodexReview, type CodexReviewExecution, type CodexReviewProvenance, type CodexUsageEvidenceProvenance } from "./codexCliReviewExecutor";
import { sha256File } from "./mediaEvidence";
import { createCodexVisualEvidenceBinding } from "./visualEvidenceBinding";
import type { LocalQueueItem } from "./types";

export type QueueVideoResult = { queueId: string; productKey: string; passed: boolean; errorCode: string; finalVideo: string; reviewPath: string; creativeScore: number; videoQualityScore: number; retryable: boolean; machineQaFinishedAt?: string; codexReview?: CodexReviewExecution; usageEvidenceProvenance?: CodexUsageEvidenceProvenance };

export async function prepareQueueVideoItemsIndependently<T>(input: {
  items: LocalQueueItem[];
  prepareItem: (item: LocalQueueItem, index: number) => Promise<T>;
}) {
  const prepared: Array<{ item: LocalQueueItem; value: T }> = [];
  const failures: QueueVideoResult[] = [];
  for (const [index, item] of input.items.entries()) {
    try {
      prepared.push({ item, value: await input.prepareItem(item, index) });
    } catch (error) {
      const code = safeCode(error instanceof Error ? error.message : String(error));
      failures.push(failed({ queueId: item.id, productKey: item.productKey }, code, isRetryable(code)));
    }
  }
  return { prepared, failures };
}

export function bindPreparedItemsToManifestOrder<T extends { productKey: string }, U extends Record<string, unknown>>(prepared: T[], manifestItems: U[]) {
  const preparedByProductKey = new Map(prepared.map((binding) => [binding.productKey, binding]));
  const manifestProductKeys = manifestItems.map((item) => typeof item.productKey === "string" ? item.productKey : "");
  if (manifestItems.length !== prepared.length
    || preparedByProductKey.size !== prepared.length
    || new Set(manifestProductKeys).size !== manifestItems.length
    || manifestProductKeys.some((productKey) => !preparedByProductKey.has(productKey))) throw new Error("QUEUE_PRODUCT_BINDING_MISMATCH");
  return manifestItems.map((item, itemIndex) => ({ binding: preparedByProductKey.get(manifestProductKeys[itemIndex]!)!, item, itemIndex }));
}

export async function executeQueueVideoBatch(input: {
  items: LocalQueueItem[];
  runId: string;
  root: string;
  selectedRegistryPath?: string;
  reviewExecutor?: typeof executeAuthenticatedCodexReview;
  reviewContext?: {
    provenance: Exclude<CodexReviewProvenance, "diagnostic">;
    operationNamespace: string;
    originOperationNamespace?: string;
    regenerationCount?: number;
  };
}): Promise<QueueVideoResult[]> {
  if (input.items.length < 1 || input.items.length > 3) throw new Error("QUEUE_VIDEO_ONE_TO_THREE_ITEMS_REQUIRED");
  const runtime = runtimeConfig();
  const runRoot = join(input.root, "artifacts", input.runId);
  await mkdir(runRoot, { recursive: true });
  const orderedItems = orderQueueItemsForCreativeDiversity(input.items);
  const isolated = await prepareQueueVideoItemsIndependently({ items: orderedItems, prepareItem: async (item, index) => {
    const itemRoot = join(runRoot, `queue-${String(index + 1).padStart(3, "0")}`);
    if (!item.usageEvidenceAllocation) throw new Error("USAGE_EVIDENCE_ALLOCATION_REQUIRED");
    const usage = await materializeAllocatedUsageEvidence({
      candidate: item.candidate,
      productKey: item.productKey,
      allocation: item.usageEvidenceAllocation,
      selectedRegistryPath: resolve(input.selectedRegistryPath ?? join(input.root, "selected-registry.json")),
      assetRoot: runtime.assetRoot,
      outputDir: join(itemRoot, "allocated-usage"),
    });
    const reference = await resolveExactProductReference({ candidate: item.candidate, outputDir: join(itemRoot, "product-reference"), pythonExe: runtime.python, visualQaScript: resolve("tools", "video-automation", "visual_qa.py") });
    return {
      queueId: item.id,
      slotId: item.slotId,
      productKey: item.productKey,
      productReferencePath: reference.localPath,
      usageEvidenceProvenance: {
        identityType: "generic_usage_example" as const,
        sourceType: "allocated_sanitized_scene_pack" as const,
        productKey: item.productKey,
        useCase: item.usageEvidenceAllocation.useCase,
        packId: item.usageEvidenceAllocation.packId,
        assetIds: [...item.usageEvidenceAllocation.assetIds],
        sequenceFingerprint: item.usageEvidenceAllocation.sequenceFingerprint,
        registrySha256: usage.provenance.registrySha256,
        allocationSha256: usage.provenance.allocationSha256,
        rendererSpecSha256: usage.provenance.rendererSpecSha256,
        sourceImageSha256s: [...usage.provenance.sourceImageSha256s],
        materializedUsagePath: usage.sourcePath,
        materializedUsageSha256: usage.provenance.outputSha256,
        materializationManifestPath: usage.reviewEvidencePath,
        materializationManifestSha256: usage.reviewEvidenceSha256,
        exactProductUseClaimed: false as const,
      },
      input: adaptLiveProductToVideoInput({ candidate: item.candidate, exactReference: reference, usageEvidence: usage, runId: input.runId }),
    };
  } });
  const prepared = isolated.prepared.map((entry) => entry.value);
  const byQueueId = new Map(isolated.failures.map((result) => [result.queueId, result]));
  const videoRunId = prepared.length > 0 ? `${input.runId}-video` : null;

  if (prepared.length > 0 && videoRunId) {
    const videoInputManifestPath = join(runRoot, "video-inputs.json");
    await writeFile(videoInputManifestPath, `${JSON.stringify({ version: "queue-video-input-v1", queueBindings: prepared.map(({ queueId, productKey }) => ({ queueId, productKey })), products: prepared.map((value) => value.input), SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 }, null, 2)}\n`, "utf8");
    const videoRoot = join(runRoot, "video-automation", videoRunId);
    try {
      await spawnProcess(process.execPath, ["--import", "tsx", "scripts/video-automation/run-autonomous-video-review-v2.ts"], { ...process.env, LIVE_PRODUCT_VIDEO_INPUT_MANIFEST: videoInputManifestPath, VIDEO_AUTOMATION_RUN_ID: videoRunId, VIDEO_AUTOMATION_OUTPUT_ROOT: videoRoot, VIDEO_AUTOMATION_V2_MODE: "batch" }, 3_600_000);
      const runManifestPath = join(videoRoot, "run-manifest.json");
      const manifest = JSON.parse(await readFile(runManifestPath, "utf8")) as { completedAt?: string; items?: Array<Record<string, unknown>> };
      const manifestItems = manifest.items ?? [];
      for (const { binding, item, itemIndex } of bindPreparedItemsToManifestOrder(prepared, manifestItems)) {
        if (item.machineQaPassed !== true || typeof item.finalVideo !== "string") { const blocker = Array.isArray(item.blockers) ? String(item.blockers[0] ?? "VIDEO_AUTO_QA_FAILED") : "VIDEO_AUTO_QA_FAILED"; byQueueId.set(binding.queueId, failed(binding, safeCode(blocker), isRetryable(blocker))); continue; }
        try {
          const productBoundary = await realpath(join(videoRoot, `product-${String(itemIndex + 1).padStart(3, "0")}`, "final"));
          const finalVideo = await containedFile(productBoundary, item.finalVideo, "VIDEO_OUTPUT_PATH_OUTSIDE_PRODUCT_ROOT");
          const visualEvidencePaths = await Promise.all([
            item.firstFramePath,
            item.firstThreeSecondsContactSheetPath,
            item.contactSheetPath,
          ].map((value) => containedFile(productBoundary, typeof value === "string" ? value : "", "VIDEO_VISUAL_EVIDENCE_PATH_OUTSIDE_PRODUCT_ROOT")));
          const media = await inspectMedia(finalVideo);
          if (!media.passed) { byQueueId.set(binding.queueId, failed(binding, media.errorCode, false)); continue; }
          const visualBinding = await createCodexVisualEvidenceBinding({
            productKey: binding.productKey,
            videoPath: finalVideo,
            productReferencePath: binding.productReferencePath,
            visualEvidencePaths,
            visualEvidenceRoles: CODEX_VISUAL_EVIDENCE_ROLES,
            derivation: "native_final_artifacts",
            outputPath: join(dirname(finalVideo), "codex-visual-evidence-binding.json"),
          });
          const finalReviewArtifact = join(videoRoot, `product-${String(itemIndex + 1).padStart(3, "0")}`, "final", "codex-review-source.json");
          const codexReview = await (input.reviewExecutor ?? executeAuthenticatedCodexReview)({
            queueId: binding.queueId,
            slotId: binding.slotId,
            productKey: binding.productKey,
            productName: binding.input.product.canonicalProductName,
            videoPath: finalVideo,
            machineQaSourceArtifact: runManifestPath,
            finalReviewArtifact,
            productReferencePath: binding.productReferencePath,
            visualEvidencePaths,
            visualEvidenceRoles: [...CODEX_VISUAL_EVIDENCE_ROLES],
            visualEvidenceBindingPath: visualBinding.path,
            usageEvidenceProvenance: binding.usageEvidenceProvenance,
            receiptRoot: join(input.root, "codex-review-executor"),
            provenance: input.reviewContext?.provenance ?? "natural",
            operationNamespace: input.reviewContext?.operationNamespace ?? basenameSafe(input.root),
            regenerationCount: input.reviewContext?.regenerationCount ?? Math.max(0, (input.items.find((entry) => entry.id === binding.queueId)?.attemptCount ?? 1) - 1),
            ...(input.reviewContext?.originOperationNamespace ? {
              originOperationNamespace: input.reviewContext.originOperationNamespace,
              originQueueId: binding.queueId,
              originVideoSha256: media.sha256,
            } : {}),
          });
          byQueueId.set(binding.queueId, {
            queueId: binding.queueId,
            productKey: binding.productKey,
            passed: true,
            errorCode: "",
            finalVideo,
            reviewPath: codexReview.evidence?.sourceReviewArtifact ?? runManifestPath,
            creativeScore: Number(item.creativeScore ?? 0),
            videoQualityScore: Number(item.score ?? 0),
            retryable: false,
            machineQaFinishedAt: validDate(manifest.completedAt) ? manifest.completedAt : new Date().toISOString(),
            codexReview,
            usageEvidenceProvenance: binding.usageEvidenceProvenance,
          });
        } catch (error) {
          const code = safeCode(error instanceof Error ? error.message : String(error));
          byQueueId.set(binding.queueId, failed(binding, code, isRetryable(code)));
        }
      }
    } catch (error) {
      const code = safeCode(error instanceof Error ? error.message : String(error));
      for (const binding of prepared) byQueueId.set(binding.queueId, failed(binding, code, isRetryable(code)));
    }
  }
  const results = orderedItems.map((item) => byQueueId.get(item.id) ?? failed({ queueId: item.id, productKey: item.productKey }, "QUEUE_ITEM_RESULT_MISSING", false));
  await writeFile(join(runRoot, "batch-result.json"), `${JSON.stringify({ runId: input.runId, videoRunId, results, codexScheduledVisualReview: "authenticated_codex_cli", SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 }, null, 2)}\n`, "utf8");
  return results;
}

function runtimeConfig() { const value = { assetRoot: process.env.VIDEO_AUTOMATION_ASSET_ROOT?.trim() ?? "", python: process.env.VIDEO_AUTOMATION_PYTHON?.trim() ?? "", ttsCommand: process.env.VIDEO_AUTOMATION_TTS_COMMAND?.trim() ?? "", asrPython: process.env.VIDEO_AUTOMATION_ASR_PYTHON?.trim() ?? "", asrScript: process.env.VIDEO_AUTOMATION_ASR_SCRIPT?.trim() ?? "", asrModel: process.env.VIDEO_AUTOMATION_ASR_MODEL?.trim() ?? "" }; if (Object.values(value).some((entry) => !entry)) throw new Error("VIDEO_AUTOMATION_LOCAL_RUNTIME_NOT_CONFIGURED"); return value; }
async function containedFile(root: string, path: string, code: string): Promise<string> { try { const canonical = await realpath(resolve(path)); const fromRoot = relative(root, canonical); const parentPrefix = `..${process.platform === "win32" ? "\\" : "/"}`; if (!fromRoot || fromRoot === ".." || fromRoot.startsWith(parentPrefix) || isAbsolute(fromRoot) || !(await stat(canonical)).isFile()) throw new Error(code); return canonical; } catch (error) { if (error instanceof Error && error.message === code) throw error; throw new Error(code); } }
async function spawnProcess(command: string, args: string[], env: NodeJS.ProcessEnv, timeoutMs: number): Promise<void> { await new Promise<void>((resolvePromise, reject) => { const child = spawn(command, args, { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] }); let stderr = ""; const timer = setTimeout(() => { child.kill(); reject(new Error("VIDEO_BATCH_TIMEOUT")); }, timeoutMs); child.stderr.on("data", (chunk: Buffer) => { if (stderr.length < 8192) stderr += chunk.toString("utf8"); }); child.once("error", reject); child.once("close", (code) => { clearTimeout(timer); if (code === 0 || code === 2) { resolvePromise(); return; } const match = stderr.match(/"safeError"\s*:\s*"([A-Z0-9_:-]+)"/u); reject(new Error(match?.[1] ?? (stderr.includes("NOT_CONFIGURED") ? "VIDEO_AUTOMATION_LOCAL_RUNTIME_NOT_CONFIGURED" : "VIDEO_BATCH_SUBPROCESS_FAILED"))); }); }); }
async function inspectMedia(path: string): Promise<{ passed: boolean; errorCode: string; sha256: string }> { await stat(path); const output = await capture("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,codec_type,width,height", "-of", "json", path], 60_000); const json = JSON.parse(output) as { streams?: Array<{ codec_name?: string; codec_type?: string; width?: number; height?: number }> }; const video = json.streams?.find((stream) => stream.codec_type === "video"); const audio = json.streams?.find((stream) => stream.codec_type === "audio"); if (!video || video.codec_name !== "h264" || video.width !== 1080 || video.height !== 1920) return { passed: false, errorCode: "FFPROBE_VIDEO_PROFILE_FAILED", sha256: "" }; if (!audio || audio.codec_name !== "aac") return { passed: false, errorCode: "FFPROBE_AUDIO_PROFILE_FAILED", sha256: "" }; return { passed: true, errorCode: "", sha256: await sha256File(path) }; }
async function capture(command: string, args: string[], timeoutMs: number): Promise<string> { return new Promise((resolvePromise, reject) => { const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] }); let stdout = ""; const timer = setTimeout(() => { child.kill(); reject(new Error("FFPROBE_TIMEOUT")); }, timeoutMs); child.stdout.on("data", (chunk: Buffer) => { if (stdout.length < 65536) stdout += chunk.toString("utf8"); }); child.once("error", reject); child.once("close", (code) => { clearTimeout(timer); if (code === 0) resolvePromise(stdout); else reject(new Error("FFPROBE_FAILED")); }); }); }
function failed(binding: { queueId: string; productKey: string }, errorCode: string, retryable: boolean): QueueVideoResult { return { queueId: binding.queueId, productKey: binding.productKey, passed: false, errorCode, finalVideo: "", reviewPath: "", creativeScore: 0, videoQualityScore: 0, retryable }; }
function safeCode(value: string) { return /^[A-Z0-9_:-]+$/u.test(value) ? value : "VIDEO_AUTO_QA_FAILED"; }
function isRetryable(code: string) { return /TEMPORARY|TIMEOUT|SUBPROCESS|FILESYSTEM|EACCES|EBUSY/u.test(code); }
function basenameSafe(path: string) { const normalized = resolve(path); return normalized.slice(Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\")) + 1); }
function validDate(value: unknown): value is string { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function passingCreativeCount(item: LocalQueueItem) { const candidate = item.candidate; return rankCreativeCandidates(generateDeterministicCreativeCandidates({ runId: "queue-preflight", product: { productKey: candidate.productKey, rawProductName: candidate.rawProductName, canonicalProductName: candidate.canonicalProductName, aliases: candidate.productAliases, anchors: candidate.productAnchors, category: candidate.categoryPath || candidate.category, imagePaths: [] }, creative: { candidateCount: 3, language: "ko" }, mode: "local_review_only" })).filter((entry) => entry.score.passed).length; }
export function orderQueueItemsForCreativeDiversity(items: LocalQueueItem[]) { return [...items].sort((a, b) => passingCreativeCount(a) - passingCreativeCount(b) || a.queueRank - b.queueRank); }
