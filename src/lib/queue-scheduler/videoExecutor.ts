import { spawn } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { adaptLiveProductToVideoInput, resolveExactProductReference, resolveOwnerReviewedUsageEvidence } from "@/lib/live-product-video";
import { generateDeterministicCreativeCandidates } from "@/lib/video-automation/creativeCandidates";
import { rankCreativeCandidates } from "@/lib/video-lab/creativeRanker";
import type { LocalQueueItem } from "./types";

export type QueueVideoResult = { queueId: string; productKey: string; passed: boolean; errorCode: string; finalVideo: string; reviewPath: string; creativeScore: number; videoQualityScore: number; retryable: boolean };

export async function executeQueueVideoBatch(input: { items: LocalQueueItem[]; runId: string; root: string }): Promise<QueueVideoResult[]> {
  if (input.items.length < 1 || input.items.length > 3) throw new Error("QUEUE_VIDEO_ONE_TO_THREE_ITEMS_REQUIRED");
  const runtime = runtimeConfig();
  const runRoot = join(input.root, "artifacts", input.runId);
  await mkdir(runRoot, { recursive: true });
  const prepared = [];
  const orderedItems = orderQueueItemsForCreativeDiversity(input.items);
  for (const [index, item] of orderedItems.entries()) {
    const itemRoot = join(runRoot, `queue-${String(index + 1).padStart(3, "0")}`);
    const usage = await resolveOwnerReviewedUsageEvidence({ candidate: item.candidate, assetRoot: runtime.assetRoot });
    if (!usage) throw new Error("USAGE_EVIDENCE_NOT_AVAILABLE");
    const reference = await resolveExactProductReference({ candidate: item.candidate, outputDir: join(itemRoot, "product-reference"), pythonExe: runtime.python, visualQaScript: resolve("tools", "video-automation", "visual_qa.py") });
    prepared.push({ queueId: item.id, productKey: item.productKey, input: adaptLiveProductToVideoInput({ candidate: item.candidate, exactReference: reference, usageEvidence: usage, runId: input.runId }) });
  }
  const manifestPath = join(runRoot, "video-inputs.json");
  await writeFile(manifestPath, `${JSON.stringify({ version: "queue-video-input-v1", queueBindings: prepared.map(({ queueId, productKey }) => ({ queueId, productKey })), products: prepared.map((value) => value.input), SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 }, null, 2)}\n`, "utf8");
  const videoRunId = `${input.runId}-video`;
  await spawnProcess(process.execPath, ["--import", "tsx", "scripts/video-automation/run-autonomous-video-review-v2.ts"], { ...process.env, LIVE_PRODUCT_VIDEO_INPUT_MANIFEST: manifestPath, VIDEO_AUTOMATION_RUN_ID: videoRunId, VIDEO_AUTOMATION_V2_MODE: "batch" }, 3_600_000);
  const videoRoot = resolve("data", "video-automation", videoRunId);
  const manifest = JSON.parse(await readFile(join(videoRoot, "run-manifest.json"), "utf8")) as { items?: Array<Record<string, unknown>> };
  const results: QueueVideoResult[] = [];
  for (const binding of prepared) {
    const item = (manifest.items ?? []).find((value) => value.productKey === binding.productKey);
    if (!item || item.productKey !== binding.productKey) { results.push(failed(binding, "QUEUE_PRODUCT_BINDING_MISMATCH", false)); continue; }
    if (item.machineQaPassed !== true || typeof item.finalVideo !== "string") { const blocker = Array.isArray(item.blockers) ? String(item.blockers[0] ?? "VIDEO_AUTO_QA_FAILED") : "VIDEO_AUTO_QA_FAILED"; results.push(failed(binding, safeCode(blocker), isRetryable(blocker))); continue; }
    const media = await inspectMedia(item.finalVideo);
    if (!media.passed) { results.push(failed(binding, media.errorCode, false)); continue; }
    results.push({ queueId: binding.queueId, productKey: binding.productKey, passed: true, errorCode: "", finalVideo: resolve(item.finalVideo), reviewPath: join(videoRoot, "run-manifest.json"), creativeScore: Number(item.creativeScore ?? 0), videoQualityScore: Number(item.score ?? 0), retryable: false });
  }
  await writeFile(join(runRoot, "batch-result.json"), `${JSON.stringify({ runId: input.runId, videoRunId, results, codexScheduledVisualReview: "unavailable", SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 }, null, 2)}\n`, "utf8");
  return results;
}

function runtimeConfig() { const value = { assetRoot: process.env.VIDEO_AUTOMATION_ASSET_ROOT?.trim() ?? "", python: process.env.VIDEO_AUTOMATION_PYTHON?.trim() ?? "", ttsCommand: process.env.VIDEO_AUTOMATION_TTS_COMMAND?.trim() ?? "", asrPython: process.env.VIDEO_AUTOMATION_ASR_PYTHON?.trim() ?? "", asrScript: process.env.VIDEO_AUTOMATION_ASR_SCRIPT?.trim() ?? "", asrModel: process.env.VIDEO_AUTOMATION_ASR_MODEL?.trim() ?? "" }; if (Object.values(value).some((entry) => !entry)) throw new Error("VIDEO_AUTOMATION_LOCAL_RUNTIME_NOT_CONFIGURED"); return value; }
async function spawnProcess(command: string, args: string[], env: NodeJS.ProcessEnv, timeoutMs: number): Promise<void> { await new Promise<void>((resolvePromise, reject) => { const child = spawn(command, args, { cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"] }); let stderr = ""; const timer = setTimeout(() => { child.kill(); reject(new Error("VIDEO_BATCH_TIMEOUT")); }, timeoutMs); child.stderr.on("data", (chunk: Buffer) => { if (stderr.length < 8192) stderr += chunk.toString("utf8"); }); child.once("error", reject); child.once("close", (code) => { clearTimeout(timer); if (code === 0 || code === 2) { resolvePromise(); return; } const match = stderr.match(/"safeError"\s*:\s*"([A-Z0-9_:-]+)"/u); reject(new Error(match?.[1] ?? (stderr.includes("NOT_CONFIGURED") ? "VIDEO_AUTOMATION_LOCAL_RUNTIME_NOT_CONFIGURED" : "VIDEO_BATCH_SUBPROCESS_FAILED"))); }); }); }
async function inspectMedia(path: string): Promise<{ passed: boolean; errorCode: string }> { await stat(path); const output = await capture("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,codec_type,width,height", "-of", "json", path], 60_000); const json = JSON.parse(output) as { streams?: Array<{ codec_name?: string; codec_type?: string; width?: number; height?: number }> }; const video = json.streams?.find((stream) => stream.codec_type === "video"); const audio = json.streams?.find((stream) => stream.codec_type === "audio"); if (!video || video.codec_name !== "h264" || video.width !== 1080 || video.height !== 1920) return { passed: false, errorCode: "FFPROBE_VIDEO_PROFILE_FAILED" }; if (!audio || audio.codec_name !== "aac") return { passed: false, errorCode: "FFPROBE_AUDIO_PROFILE_FAILED" }; return { passed: true, errorCode: "" }; }
async function capture(command: string, args: string[], timeoutMs: number): Promise<string> { return new Promise((resolvePromise, reject) => { const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] }); let stdout = ""; const timer = setTimeout(() => { child.kill(); reject(new Error("FFPROBE_TIMEOUT")); }, timeoutMs); child.stdout.on("data", (chunk: Buffer) => { if (stdout.length < 65536) stdout += chunk.toString("utf8"); }); child.once("error", reject); child.once("close", (code) => { clearTimeout(timer); if (code === 0) resolvePromise(stdout); else reject(new Error("FFPROBE_FAILED")); }); }); }
function failed(binding: { queueId: string; productKey: string }, errorCode: string, retryable: boolean): QueueVideoResult { return { queueId: binding.queueId, productKey: binding.productKey, passed: false, errorCode, finalVideo: "", reviewPath: "", creativeScore: 0, videoQualityScore: 0, retryable }; }
function safeCode(value: string) { return /^[A-Z0-9_:-]+$/u.test(value) ? value : "VIDEO_AUTO_QA_FAILED"; }
function isRetryable(code: string) { return /TEMPORARY|TIMEOUT|SUBPROCESS|FILESYSTEM|EACCES|EBUSY/u.test(code); }
function passingCreativeCount(item: LocalQueueItem) { const candidate = item.candidate; return rankCreativeCandidates(generateDeterministicCreativeCandidates({ runId: "queue-preflight", product: { productKey: candidate.productKey, rawProductName: candidate.rawProductName, canonicalProductName: candidate.canonicalProductName, aliases: candidate.productAliases, anchors: candidate.productAnchors, category: candidate.categoryPath || candidate.category, imagePaths: [] }, creative: { candidateCount: 3, language: "ko" }, mode: "local_review_only" })).filter((entry) => entry.score.passed).length; }
export function orderQueueItemsForCreativeDiversity(items: LocalQueueItem[]) { return [...items].sort((a, b) => passingCreativeCount(a) - passingCreativeCount(b) || a.queueRank - b.queueRank); }
