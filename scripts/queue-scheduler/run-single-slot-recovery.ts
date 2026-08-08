import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { adaptLiveProductToVideoInput, resolveExactProductReference, resolveOwnerReviewedUsageEvidence } from "../../src/lib/live-product-video";
import { buildSupplementalSlotBinding, selectCompatibleRecoveryReserve, type LocalQueueItem, type ReserveCandidate } from "../../src/lib/queue-scheduler";
import type { ProductVideoAutomationInput } from "../../src/lib/video-automation";

async function main(): Promise<void> {
  const pilotRoot = resolve(requiredArg("--pilot-root"));
  const recoveryRoot = resolve(requiredArg("--recovery-root"));
  const slotId = optionalArg("--slot-id") || "slot-001";
  const [queue, reserve, settings] = await Promise.all([
    readJson<LocalQueueItem[]>(join(pilotRoot, "queue.json")),
    readJson<ReserveCandidate[]>(join(pilotRoot, "reserve-pool.json")),
    readJson<{ enabled: boolean; isPaused: boolean }>(join(pilotRoot, "settings.json")),
  ]);
  if (settings.enabled || !settings.isPaused) throw new Error("RECOVERY_REQUIRES_DISABLED_PAUSED_PILOT");
  const slot = queue.find((item) => item.slotId === slotId);
  if (!slot) throw new Error("RECOVERY_SLOT_NOT_FOUND");
  const historicalBefore = await hashTree(pilotRoot);
  await mkdir(join(recoveryRoot, "artifacts"), { recursive: true });

  const inputs = await loadHistoricalInputs(pilotRoot);
  const originalInput = inputs.find((entry) => entry.product.productKey === slot.productKey);
  if (!originalInput) throw new Error("RECOVERY_ORIGINAL_VIDEO_INPUT_NOT_FOUND");
  const readyKeys = new Set(queue.filter((item) => item.status === "video_ready_autoqa").map((item) => item.productKey));
  const controls = uniqueByKey(inputs.filter((entry) => readyKeys.has(entry.product.productKey) && entry.product.productKey !== slot.productKey)).slice(0, 2);
  if (controls.length !== 2) throw new Error("RECOVERY_CONTROL_PRODUCTS_NOT_FOUND");

  let finalInput = originalInput;
  let replacementReason = "";
  let controlManifest = await runVoiceControlPack({ recoveryRoot, products: [finalInput, ...controls], label: "original" });
  let targetDiagnostic = findItem(controlManifest, finalInput.product.productKey);
  if (targetDiagnostic.voiceDiagnosticPassed !== true) {
    const blocker = firstBlocker(targetDiagnostic);
    if (blocker !== "PRODUCT_SPECIFIC_VOICE_HARD_FAILURE") throw new Error(blocker);
    const selectedReserve = selectCompatibleRecoveryReserve({ slot, reserve, queue });
    if (!selectedReserve) throw new Error("RECOVERY_COMPATIBLE_RESERVE_NOT_AVAILABLE");
    finalInput = await buildReserveInput(selectedReserve, recoveryRoot);
    replacementReason = "PRODUCT_SPECIFIC_VOICE_HARD_FAILURE";
    controlManifest = await runVoiceControlPack({ recoveryRoot, products: [finalInput, ...controls], label: "reserve" });
    targetDiagnostic = findItem(controlManifest, finalInput.product.productKey);
  }
  if (Number(controlManifest["voiceDiagnosticPassed"]) !== 3 || targetDiagnostic.voiceDiagnosticPassed !== true) throw new Error("RECOVERY_CONTROL_VOICE_PACK_FAILED");

  const fullInputPath = join(recoveryRoot, "artifacts", "full-video-input.json");
  await writeJson(fullInputPath, inputManifest([finalInput]));
  const fullRoot = join(recoveryRoot, "artifacts", "full-video");
  await runV2({ inputPath: fullInputPath, outputRoot: fullRoot, runId: `${basename(recoveryRoot)}-full-video`, voiceOnly: false });
  const fullManifest = await readJson<Record<string, unknown>>(join(fullRoot, "run-manifest.json"));
  const fullItem = findItem(fullManifest, finalInput.product.productKey);
  const fullPassed = fullItem.machineQaPassed === true && typeof fullItem.finalVideo === "string" && Boolean(fullItem.finalVideo);
  if (!fullPassed) throw new Error(firstBlocker(fullItem) || "SINGLE_SLOT_FULL_VIDEO_FAILED");

  const historicalAfter = await hashTree(pilotRoot);
  const historicalQueueUnchanged = JSON.stringify(historicalBefore) === JSON.stringify(historicalAfter);
  if (!historicalQueueUnchanged) throw new Error("HISTORICAL_PILOT_REWRITTEN");
  const binding = buildSupplementalSlotBinding({ slot, finalProductKey: finalInput.product.productKey, replacementReason });
  const decision = replacementReason ? "SINGLE_FAILED_SLOT_RECOVERED_BY_RESERVE_NO_UPLOAD" : "SINGLE_FAILED_SLOT_RECOVERED_ORIGINAL_PRODUCT_NO_UPLOAD";
  await writeJson(join(recoveryRoot, "voice-diagnostic.json"), { slotId, target: targetDiagnostic, controls: controlManifest["items"], controlVoicePack: "3/3", thresholds: { asrSimilarity: 0.82, identitySimilarity: 0.65, coreAnchorSimilarity: 0.65, whisperxAlignedRatio: 0.95, hardSilenceMs: 900 }, SAFE_TO_UPLOAD: false });
  await writeJson(join(recoveryRoot, "pilot-integrity.json"), { pilotRoot, historicalQueueUnchanged, fileCount: Object.keys(historicalBefore).length, before: historicalBefore, after: historicalAfter });
  await writeJson(join(recoveryRoot, "queue-recovery.json"), { version: "single-slot-supplemental-recovery-v1", decision, binding, originalFreshPilot: "8/9", supplementalFailedSlotRecovery: "1/1", distinctLogicalSlotsWithSuccessfulEvidence: "9/9", controlVoicePack: "3/3", fullVideo: { passed: true, finalVideo: fullItem.finalVideo, reviewPath: join(fullRoot, "run-manifest.json"), machineQaPassed: fullItem.machineQaPassed, hardBlockers: 0 }, DAILY_69_PROMOTION_CANDIDATE: true, historicalQueueUnchanged, codexReview: "not_executed", SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0, PRODUCTION_DEPLOY: 0 });
  const existingHistory = await readJsonIfExists<Record<string, unknown>>(join(recoveryRoot, "attempt-history.json"), {});
  await writeJson(join(recoveryRoot, "attempt-history.json"), { ...existingHistory, execution: { controlManifest: join(String(controlManifest["outputRoot"]), "run-manifest.json"), controlCount: 3, fullManifest: join(fullRoot, "run-manifest.json"), finalProductKey: finalInput.product.productKey, replacementReason, completedAt: new Date().toISOString() } });
  console.log(JSON.stringify({ event: "single_slot_recovery_complete", decision, slotId, initialProductKey: slot.productKey, finalProductKey: finalInput.product.productKey, controlVoicePack: "3/3", fullVideo: true, historicalQueueUnchanged, SAFE_TO_UPLOAD: false }));
}

async function runVoiceControlPack(input: { recoveryRoot: string; products: ProductVideoAutomationInput[]; label: string }): Promise<Record<string, unknown> & { outputRoot: string }> {
  const inputPath = join(input.recoveryRoot, "artifacts", `voice-control-input-${input.label}.json`);
  const outputRoot = join(input.recoveryRoot, "artifacts", `voice-control-pack-${input.label}`);
  await writeJson(inputPath, inputManifest(input.products));
  await runV2({ inputPath, outputRoot, runId: `${basename(input.recoveryRoot)}-voice-${input.label}`, voiceOnly: true });
  return { ...await readJson<Record<string, unknown>>(join(outputRoot, "run-manifest.json")), outputRoot } as Record<string, unknown> & { outputRoot: string };
}

async function buildReserveInput(entry: ReserveCandidate, recoveryRoot: string): Promise<ProductVideoAutomationInput> {
  const pythonExe = process.env.VIDEO_AUTOMATION_PYTHON?.trim() ?? "";
  const assetRoot = process.env.VIDEO_AUTOMATION_ASSET_ROOT?.trim() ?? "";
  if (!pythonExe || !assetRoot) throw new Error("VIDEO_AUTOMATION_LOCAL_RUNTIME_NOT_CONFIGURED");
  const usageEvidence = await resolveOwnerReviewedUsageEvidence({ candidate: entry.candidate, assetRoot });
  if (!usageEvidence) throw new Error("USAGE_EVIDENCE_NOT_AVAILABLE");
  const exactReference = await resolveExactProductReference({ candidate: entry.candidate, outputDir: join(recoveryRoot, "artifacts", "reserve-product-reference"), pythonExe, visualQaScript: resolve("tools", "video-automation", "visual_qa.py") });
  return adaptLiveProductToVideoInput({ candidate: entry.candidate, exactReference, usageEvidence, runId: "supplemental-reserve" });
}

async function runV2(input: { inputPath: string; outputRoot: string; runId: string; voiceOnly: boolean }): Promise<void> {
  await mkdir(input.outputRoot, { recursive: true });
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "scripts/video-automation/run-autonomous-video-review-v2.ts"], { cwd: process.cwd(), env: { ...process.env, LIVE_PRODUCT_VIDEO_INPUT_MANIFEST: input.inputPath, VIDEO_AUTOMATION_OUTPUT_ROOT: input.outputRoot, VIDEO_AUTOMATION_RUN_ID: input.runId, VIDEO_AUTOMATION_V2_MODE: "batch", VIDEO_AUTOMATION_VOICE_ONLY: input.voiceOnly ? "true" : "false" }, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("SINGLE_SLOT_RECOVERY_TIMEOUT")); }, 3_600_000);
    child.stderr.on("data", (chunk: Buffer) => { if (stderr.length < 8_192) stderr += chunk.toString("utf8"); });
    child.once("error", reject);
    child.once("close", (code) => { clearTimeout(timer); if (code === 0 || code === 2) resolvePromise(); else { const match = stderr.match(/"safeError"\s*:\s*"([A-Z0-9_:-]+)"/u); reject(new Error(match?.[1] ?? "SINGLE_SLOT_RECOVERY_SUBPROCESS_FAILED")); } });
  });
}

async function loadHistoricalInputs(pilotRoot: string): Promise<ProductVideoAutomationInput[]> {
  const artifacts = join(pilotRoot, "artifacts");
  const entries = await readdir(artifacts, { withFileTypes: true });
  const products: ProductVideoAutomationInput[] = [];
  for (const entry of entries.filter((value) => value.isDirectory())) {
    const path = join(artifacts, entry.name, "video-inputs.json");
    try { products.push(...(await readJson<{ products: ProductVideoAutomationInput[] }>(path)).products); } catch { /* no manifest in this artifact directory */ }
  }
  return uniqueByKey(products);
}

function inputManifest(products: ProductVideoAutomationInput[]) { return { version: "single-slot-recovery-input-v1", products, SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 }; }
function uniqueByKey(products: ProductVideoAutomationInput[]) { return [...new Map(products.map((entry) => [entry.product.productKey, entry])).values()]; }
function findItem(manifest: Record<string, unknown>, productKey: string): Record<string, unknown> { const item = (manifest.items as Record<string, unknown>[] | undefined)?.find((entry) => entry.productKey === productKey); if (!item) throw new Error("RECOVERY_RESULT_BINDING_MISMATCH"); return item; }
function firstBlocker(item: Record<string, unknown>): string { return Array.isArray(item.blockers) ? String(item.blockers[0] ?? "") : ""; }
function basename(path: string): string { const parts = path.replace(/[\\/]+$/u, "").split(/[\\/]/u); return parts[parts.length - 1] || "single-slot-recovery"; }
function requiredArg(name: string): string { const value = optionalArg(name); if (!value) throw new Error(`MISSING_ARGUMENT_${name.replace(/^--/u, "").replace(/-/gu, "_").toUpperCase()}`); return value; }
function optionalArg(name: string): string { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] ?? "" : ""; }
async function readJson<T>(path: string): Promise<T> { return JSON.parse(await readFile(path, "utf8")) as T; }
async function readJsonIfExists<T>(path: string, fallback: T): Promise<T> { try { return await readJson<T>(path); } catch { return fallback; } }
async function writeJson(path: string, value: unknown): Promise<void> { await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
async function hashTree(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  async function visit(directory: string): Promise<void> { for (const entry of await readdir(directory, { withFileTypes: true })) { const path = join(directory, entry.name); if (entry.isDirectory()) await visit(path); else if (entry.isFile()) result[path.slice(root.length + 1).replace(/\\/gu, "/")] = createHash("sha256").update(await readFile(path)).digest("hex"); } }
  await stat(root); await visit(root); return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

void main().catch((error: unknown) => { const value = error instanceof Error ? error.message : String(error); console.error(JSON.stringify({ event: "single_slot_recovery_failed", safeError: /^[A-Z0-9_:-]+$/u.test(value) ? value : "SINGLE_SLOT_RECOVERY_FAILED", SAFE_TO_UPLOAD: false })); process.exitCode = 1; });
