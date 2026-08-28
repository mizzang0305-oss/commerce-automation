import { spawn } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { adaptLiveProductToVideoInput, resolveExactProductReference, resolveOwnerReviewedUsageEvidence } from "@/lib/live-product-video";
import { generateDeterministicCreativeCandidates } from "@/lib/video-automation/creativeCandidates";
import { rankCreativeCandidates } from "@/lib/video-lab/creativeRanker";
import { executeAuthenticatedCodexReview, type CodexReviewExecution } from "./codexCliReviewExecutor";
import type { LocalQueueItem } from "./types";

export type QueueVideoResult = { queueId: string; productKey: string; passed: boolean; errorCode: string; finalVideo: string; reviewPath: string; creativeScore: number; videoQualityScore: number; retryable: boolean; machineQaFinishedAt?: string; codexReview?: CodexReviewExecution };

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

export async function executeQueueVideoBatch(input: { items: LocalQueueItem[]; runId: string; root: string; reviewExecutor?: typeof executeAuthenticatedCodexReview }): Promise<QueueVideoResult[]> {
  if (input.items.length < 1 || input.items.length > 3) throw new Error("QUEUE_VIDEO_ONE_TO_THREE_ITEMS_REQUIRED");
  const runtime = runtimeConfig();
  const runRoot = join(input.root, "artifacts", input.runId);
  await mkdir(runRoot, { recursive: true });
  const orderedItems = orderQueueItemsForCreativeDiversity(input.items);
  const isolated = await prepareQueueVideoItemsIndependently({ items: orderedItems, prepareItem: async (item, index) => {
    const itemRoot = join(runRoot, `queue-${String(index + 1).padStart(3, "0")}`);
    const usage = await resolveOwnerReviewedUsageEvidence({ candidate: item.candidate, assetRoot: runtime.assetRoot });
    if (!usage) throw new Error("USAGE_EVIDENCE_NOT_AVAILABLE");
    const reference = await resolveExactProductReference({ candidate: item.candidate, outputDir: join(itemRoot, "product-reference"), pythonExe: runtime.python, visualQaScript: resolve("tools", "video-automation", "visual_qa.py") });
    return { queueId: item.id, productKey: item.productKey, input: adaptLiveProductToVideoInput({ candidate: item.candidate, exactReference: reference, usageEvidence: usage, runId: input.runId }) };
  } });
  const prepared = isolated.prepared.map((entry) => entry.value);
  const byQueueId = new Map(isolated.failures.map((result) => [result.queueId, result]));
  const videoRunId = prepared.length > 0 ? `${input.runId}-video` : null;

  if (prepared.length > 0 && videoRunId) {
    const videoInputManifestPath = join(runRoot, "video-inputs.json");
    await writeFile(videoInputManifestPath, `${JSON.stringify({ version: "queue-video-input-v1", queueBindings: prepared.map(({ queueId, productKey }) => ({ queueId, productKey })), products: prepared.map((value) => value.input), SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 }, null, 2)}\n`, "utf8");
    const videoRoot = resolve("data", "video-automation", videoRunId);
    try {
      await spawnProcess(process.execPath, ["--import", "tsx", "scripts/video-automation/run-autonomous-video-review-v2.ts"], { ...process.env, LIVE_PRODUCT_VIDEO_INPUT_MANIFEST: videoInputManifestPath, VIDEO_AUTOMATION_RUN_ID: videoRunId, VIDEO_AUTOMATION_V2_MODE: "batch" }, 3_600_000);
      const runManifestPath = join(videoRoot, "run-manifest.json");
      const manifest = JSON.parse(await readFile(runManifestPath, "utf8")) as { completedAt?: string; items?: Array<Record<string, unknown>> };
      for (const binding of prepared) {
        const itemIndex = (manifest.items ?? []).findIndex((value) => value.productKey === binding.productKey);
        const item = itemIndex >= 0 ? manifest.items?.[itemIndex] : undefined;
        if (!item || item.productKey !== binding.productKey) { byQueueId.set(binding.queueId, failed(binding, "QUEUE_PRODUCT_BINDING_MISMATCH", false)); continue; }
        if (item.machineQaPassed !== true || typeof item.finalVideo !== "string") { const blocker = Array.isArray(item.blockers) ? String(item.blockers[0] ?? "VIDEO_AUTO_QA_FAILED") : "VIDEO_AUTO_QA_FAILED"; byQueueId.set(binding.queueId, failed(binding, safeCode(blocker), isRetryable(blocker))); continue; }
        try {
          const media = await inspectMedia(item.finalVideo);
          if (!media.passed) { byQueueId.set(binding.queueId, failed(binding, media.errorCode, false)); continue; }
          const visualEvidencePaths = [item.firstFramePath, item.firstThreeSecondsContactSheetPath, item.contactSheetPath]
            .filter((value): value is string => typeof value === "string" && value.length > 0);
          const finalReviewArtifact = join(videoRoot, `product-${String(itemIndex + 1).padStart(3, "0")}`, "final", "codex-review-source.json");
          const codexReview = await (input.reviewExecutor ?? executeAuthenticatedCodexReview)({
            operationNamespace: basenameSafe(input.root),
            queueId: binding.queueId,
            productKey: binding.productKey,
            videoPath: resolve(item.finalVideo),
            machineQaSourceArtifact: runManifestPath,
            finalReviewArtifact,
            visualEvidencePaths,
            receiptRoot: join(input.root, "codex-review-executor"),
            provenance: "natural",
            regenerationCount: Math.max(0, (input.items.find((entry) => entry.id === binding.queueId)?.attemptCount ?? 1) - 1),
          });
          byQueueId.set(binding.queueId, {
            queueId: binding.queueId,
            productKey: binding.productKey,
            passed: true,
            errorCode: "",
            finalVideo: resolve(item.finalVideo),
            reviewPath: codexReview.evidence?.sourceReviewArtifact ?? runManifestPath,
            creativeScore: Number(item.creativeScore ?? 0),
            videoQualityScore: Number(item.score ?? 0),
            retryable: false,
            machineQaFinishedAt: validDate(manifest.completedAt) ? manifest.completedAt : new Date().toISOString(),
            codexReview,
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
async function spawnProcess(command: string, args: string[], env: NodeJS.ProcessEnv, timeoutMs: number): Promise<void> { await new Promise<void>((resolvePromise, reject) => { const child = spawn(command, args, { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] }); let stderr = ""; const timer = setTimeout(() => { child.kill(); reject(new Error("VIDEO_BATCH_TIMEOUT")); }, timeoutMs); child.stderr.on("data", (chunk: Buffer) => { if (stderr.length < 8192) stderr += chunk.toString("utf8"); }); child.once("error", reject); child.once("close", (code) => { clearTimeout(timer); if (code === 0 || code === 2) { resolvePromise(); return; } const match = stderr.match(/"safeError"\s*:\s*"([A-Z0-9_:-]+)"/u); reject(new Error(match?.[1] ?? (stderr.includes("NOT_CONFIGURED") ? "VIDEO_AUTOMATION_LOCAL_RUNTIME_NOT_CONFIGURED" : "VIDEO_BATCH_SUBPROCESS_FAILED"))); }); }); }
async function inspectMedia(path: string): Promise<{ passed: boolean; errorCode: string }> { await stat(path); const output = await capture("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,codec_type,width,height", "-of", "json", path], 60_000); const json = JSON.parse(output) as { streams?: Array<{ codec_name?: string; codec_type?: string; width?: number; height?: number }> }; const video = json.streams?.find((stream) => stream.codec_type === "video"); const audio = json.streams?.find((stream) => stream.codec_type === "audio"); if (!video || video.codec_name !== "h264" || video.width !== 1080 || video.height !== 1920) return { passed: false, errorCode: "FFPROBE_VIDEO_PROFILE_FAILED" }; if (!audio || audio.codec_name !== "aac") return { passed: false, errorCode: "FFPROBE_AUDIO_PROFILE_FAILED" }; return { passed: true, errorCode: "" }; }
async function capture(command: string, args: string[], timeoutMs: number): Promise<string> { return new Promise((resolvePromise, reject) => { const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] }); let stdout = ""; const timer = setTimeout(() => { child.kill(); reject(new Error("FFPROBE_TIMEOUT")); }, timeoutMs); child.stdout.on("data", (chunk: Buffer) => { if (stdout.length < 65536) stdout += chunk.toString("utf8"); }); child.once("error", reject); child.once("close", (code) => { clearTimeout(timer); if (code === 0) resolvePromise(stdout); else reject(new Error("FFPROBE_FAILED")); }); }); }
function failed(binding: { queueId: string; productKey: string }, errorCode: string, retryable: boolean): QueueVideoResult { return { queueId: binding.queueId, productKey: binding.productKey, passed: false, errorCode, finalVideo: "", reviewPath: "", creativeScore: 0, videoQualityScore: 0, retryable }; }
function safeCode(value: string) { return /^[A-Z0-9_:-]+$/u.test(value) ? value : "VIDEO_AUTO_QA_FAILED"; }
function isRetryable(code: string) { return /TEMPORARY|TIMEOUT|SUBPROCESS|FILESYSTEM|EACCES|EBUSY/u.test(code); }
function basenameSafe(path: string) { const normalized = resolve(path); return normalized.slice(Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\")) + 1); }
function validDate(value: unknown): value is string { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function passingCreativeCount(item: LocalQueueItem) { const candidate = item.candidate; return rankCreativeCandidates(generateDeterministicCreativeCandidates({ runId: "queue-preflight", product: { productKey: candidate.productKey, rawProductName: candidate.rawProductName, canonicalProductName: candidate.canonicalProductName, aliases: candidate.productAliases, anchors: candidate.productAnchors, category: candidate.categoryPath || candidate.category, imagePaths: [] }, creative: { candidateCount: 3, language: "ko" }, mode: "local_review_only" })).filter((entry) => entry.score.passed).length; }
export function orderQueueItemsForCreativeDiversity(items: LocalQueueItem[]) { return [...items].sort((a, b) => passingCreativeCount(a) - passingCreativeCount(b) || a.queueRank - b.queueRank); }
