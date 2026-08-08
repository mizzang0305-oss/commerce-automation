import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { rankCreativeCandidates } from "../../src/lib/video-lab/creativeRanker";
import { evaluateV143ReusableCreativePolicy } from "../../src/lib/uploads/videoAssets/v143ReusableCreativePolicy";
import { buildPopGroupCaptions, restoreKnownCaptionTokens } from "../../src/lib/video-automation/captionIntegration";
import { generateDeterministicCreativeCandidates } from "../../src/lib/video-automation/creativeCandidates";
import { evaluateHookUsageLayout } from "../../src/lib/video-automation/layoutCollision";
import { bestKoreanSubstringSimilarity, koreanTextSimilarity, runFasterWhisper, runJsonProcess } from "../../src/lib/video-automation/localRuntime";
import { loadApprovedProductFixtures } from "../../src/lib/video-automation/productFixtures";
import { validateProductVideoInput } from "../../src/lib/video-automation/productInput";
import { evaluateAutomatedVideoQuality } from "../../src/lib/video-automation/qa/automatedVideoQuality";
import { AUTONOMOUS_VIDEO_REVIEW_FLAGS } from "../../src/lib/video-automation/qa/config";
import { classifyHookFamily, selectDistinctHookCandidate } from "../../src/lib/video-automation/qa/hookDiversity";
import type { AutomatedReviewInput, AutomatedVideoReview, HookFamily, VisualQaMeasurements } from "../../src/lib/video-automation/qa/types";
import { buildDeterministicRepairPlan, LEGACY_INITIAL_PROFILE, V2_PROVEN_PROFILE, type RenderRepairProfile } from "../../src/lib/video-automation/repair/repairPlan";
import { buildKoreanProductNarration } from "../../src/lib/video-automation/ttsNormalization";
import { createLocalWhisperXProcess, PersistentWhisperXProvider } from "../../src/lib/video-automation/whisperxPersistentProvider";

const USAGE_LABEL = "연출된 사용 예시";
const PREFERRED_HOOK_FAMILY: Record<string, HookFamily> = {
  "v057-lets-buy-cable-organizer": "CHECKLIST",
  "v057-father-jobs-car-cup-organizer": "QUESTION",
  "v057-neoman-folding-drying-rack": "SPACE"
};

async function main(): Promise<void> {
  const mode = process.env.VIDEO_AUTOMATION_V2_MODE === "reference" ? "reference" : "batch";
  const required = {
    assetRoot: process.env.VIDEO_AUTOMATION_ASSET_ROOT ?? "",
    python: process.env.VIDEO_AUTOMATION_PYTHON ?? "",
    ttsCommand: process.env.VIDEO_AUTOMATION_TTS_COMMAND ?? "",
    asrPython: process.env.VIDEO_AUTOMATION_ASR_PYTHON ?? "",
    asrScript: process.env.VIDEO_AUTOMATION_ASR_SCRIPT ?? "",
    asrModel: process.env.VIDEO_AUTOMATION_ASR_MODEL ?? ""
  };
  if (Object.values(required).some((value) => !value.trim())) throw new Error("VIDEO_AUTOMATION_LOCAL_RUNTIME_NOT_CONFIGURED");
  const liveInputManifest = process.env.LIVE_PRODUCT_VIDEO_INPUT_MANIFEST?.trim() ?? "";
  const runId = process.env.VIDEO_AUTOMATION_RUN_ID?.trim() || `run-v2-${new Date().toISOString().replace(/[-:TZ.]/gu, "").slice(0, 14)}`;
  const outputRoot = resolve("data", "video-automation", runId);
  const mediaBridge = resolve("tools", "video-automation", "local_media_bridge.py");
  const visualQaBridge = resolve("tools", "video-automation", "visual_qa.py");
  const whisperService = resolve("tools", "video-automation", "whisperx_jsonl_service.py");
  const audioPauseRepair = resolve("tools", "video-automation", "audio_pause_repair.py");
  await mkdir(outputRoot, { recursive: true });
  const allProducts = liveInputManifest
    ? await loadLiveProductInputs(liveInputManifest, runId)
    : loadApprovedProductFixtures(required.assetRoot, runId);
  const cable = allProducts.find((input) => input.product.productKey.includes("cable-organizer"));
  if (!liveInputManifest && !cable) throw new Error("REFERENCE_CABLE_PRODUCT_REQUIRED");
  const products = liveInputManifest
    ? allProducts
    : mode === "reference" ? [cable!] : [cable!, ...allProducts.filter((input) => input !== cable)];
  console.log(JSON.stringify({ event: "autonomous_video_v2_start", mode, products: products.length, liveProductInputs: Boolean(liveInputManifest), configured: Object.fromEntries(Object.entries(required).map(([key, value]) => [key, Boolean(value)])), ...AUTONOMOUS_VIDEO_REVIEW_FLAGS }));

  const usedFamilies = new Set<HookFamily>();
  const selectedByProduct = new Map<string, ReturnType<typeof rankCreativeCandidates>[number]>();
  for (const input of products) {
    const ranked = rankCreativeCandidates(generateDeterministicCreativeCandidates(input));
    const selected = selectDistinctHookCandidate(ranked, usedFamilies, PREFERRED_HOOK_FAMILY[input.product.productKey]);
    if (!selected) continue;
    const family = classifyHookFamily(selected.candidate.hook);
    usedFamilies.add(family);
    selectedByProduct.set(input.product.productKey, selected);
  }

  const startedAt = new Date().toISOString();
  const runStarted = performance.now();
  const items: Array<Record<string, unknown>> = [];
  const prepared = new Map<string, PreparedProduct>();
  for (const [index, input] of products.entries()) {
    const productRoot = join(outputRoot, `product-${String(index + 1).padStart(3, "0")}`);
    await mkdir(productRoot, { recursive: true });
    try {
    const asset = input.product.realUseAsset;
    if (!asset || asset.ownerReviewStatus !== "pass" || asset.identityType !== "generic_usage_example") throw new Error("OWNER_REVIEWED_GENERIC_USE_ASSET_REQUIRED");
    await Promise.all([stat(asset.sourcePath), stat(asset.reviewEvidencePath)]);
    const frames = await runJsonProcess(required.python, [mediaBridge], { operation: "prepare_reviewed_asset", source_path: asset.sourcePath, target_dir: join(productRoot, "source-frames") }, 180_000);
    if (frames.status !== "success" || !Array.isArray(frames.image_paths) || frames.image_paths.length < 5) throw new Error("OWNER_REVIEWED_FRAME_EXTRACTION_FAILED");
    const genericImagePaths = frames.image_paths.map(String);
    const exactReference = input.product.exactProductReference;
    if (exactReference) await stat(exactReference.localPath);
    input.product.imagePaths = exactReference ? [exactReference.localPath, ...genericImagePaths] : genericImagePaths;
    validateProductVideoInput(input);
    const selected = selectedByProduct.get(input.product.productKey);
    if (!selected) throw new Error("CREATIVE_SELECTION_FAILED");
    const narration = buildKoreanProductNarration({ canonicalProductName: input.product.canonicalProductName, hook: selected.candidate.hook, script: selected.candidate.script });
    const voiceRoot = join(productRoot, "voice");
    await mkdir(voiceRoot, { recursive: true });
    const voice = await synthesizeAndValidateVoice({ required, mediaBridge, audioPauseRepair, voiceRoot, narration, canonicalProductName: input.product.canonicalProductName, anchors: input.product.anchors });
    prepared.set(input.product.productKey, { input, productRoot, selected, narration, audioPath: voice.audioPath, audioDuration: voice.audioDuration, asrTranscript: voice.asrTranscript, asrPassed: true, similarity: voice.similarity, recognizedAnchors: voice.recognizedAnchors, coreAnchorSimilarity: voice.coreAnchorSimilarity, ttsSeconds: voice.ttsSeconds, asrSeconds: voice.asrSeconds, audioRepair: voice.audioRepair, asrAttempts: voice.asrAttempts, asrRecovered: voice.asrRecovered, genericImagePaths });
    } catch (error) {
      items.push(blockedItem(input.product.productKey, error));
    }
  }

  const whisper = new PersistentWhisperXProvider(() => createLocalWhisperXProcess(required.python, whisperService, { ...process.env, HF_HOME: process.env.VIDEO_AUTOMATION_HF_HOME, TORCH_HOME: process.env.VIDEO_AUTOMATION_TORCH_HOME }), 300_000);
  const modelLoadSeconds = await whisper.start();
  try {
    for (const input of products) {
      const itemStarted = performance.now();
      const value = prepared.get(input.product.productKey);
      if (!value) continue;
      try {
      const alignment = await whisper.align(value.audioPath, value.asrTranscript);
      if (alignment.status !== "success" || alignment.transcript_source !== "provided_local_asr" || !alignment.words?.length || (alignment.aligned_ratio ?? 0) < 0.95) throw new Error("WHISPERX_ALIGNMENT_FAILED");
      const words = restoreKnownCaptionTokens(normalizeWordTimeline(alignment.words), [input.product.canonicalProductName, ...input.product.aliases, ...input.product.anchors]);
      await writeJson(join(value.productRoot, "whisperx.json"), { ...alignment, words, rawPathsInReport: false, externalApiCalled: false, uploadAttempted: false });
      const captions = buildPopGroupCaptions(words);
      if (captions.some((cue) => cue.words.length > 4)) throw new Error("CAPTION_SAFE_TIMELINE_FAILED");
      await writeJson(join(value.productRoot, "captions.json"), { mode: "POP_GROUP", animation: "pop", maxWordsPerCue: 4, maxEmphasisWordsPerCue: 1, cues: captions });
      const visualGate = await runJsonProcess(required.python, [mediaBridge], { operation: "visual_gate", image_paths: value.genericImagePaths, real_use_asset: input.product.realUseAsset }, 120_000);
      if (visualGate.gate_pass !== true || visualGate.identity_type !== "generic_usage_example" || Number(visualGate.exact_product_scene_count) !== 0) throw new Error("VISUAL_EVIDENCE_GATE_FAILED");
      const v143 = evaluateV143ReusableCreativePolicy({ hook_font_px: 104, hook_max_lines: 2, hook_visible_within_seconds: 0, hook_high_contrast: true, real_usage_scene_present: true, usage_source_role: "generic_usage_example", usage_label_present: true, exact_product_identity_claim: false, exact_product_identity_verified: false, actor_nationality_verified: false, product_identity_binding_verified: true, tts_provider_approved: true, tts_language: "ko", tts_speed_multiplier: 1.2, tts_delivery_style: "brisk_confident_sales", safe_to_upload: false, safe_to_public_upload: false });
      if (!v143.passed) throw new Error("V143_CREATIVE_POLICY_FAILED");
      const layout = evaluateHookUsageLayout({ hook: value.selected.candidate.hook, usageLabel: USAGE_LABEL });
      if (!layout.passed) throw new Error(layout.blockers[0]);
      const bridgeLayout = await runJsonProcess(required.python, [mediaBridge], { operation: "layout_plan", hook: value.selected.candidate.hook, usage_label: USAGE_LABEL }, 60_000);
      if (bridgeLayout.passed !== true) throw new Error(String((bridgeLayout.blockers as string[])[0]));
      await writeJson(join(value.productRoot, "render-plan.json"), { candidateId: value.selected.candidate.id, selectedHook: value.selected.candidate.hook, hookFamily: classifyHookFamily(value.selected.candidate.hook), captions, visualGate, v143, layout: bridgeLayout, identityType: "mixed_reference_and_generic_usage", exactProductReference: input.product.exactProductReference ? { ...input.product.exactProductReference, localPathPresent: true } : null, genericUsageEvidence: input.product.realUseAsset ? { assetId: input.product.realUseAsset.assetId, identityType: input.product.realUseAsset.identityType, ownerReviewStatus: input.product.realUseAsset.ownerReviewStatus } : null, disclosureText: input.product.disclosureText ?? "", sourceProvenance: input.product.sourceProvenance ?? null, exactProductUseClaimed: false, productIdentityBound: true, ...AUTONOMOUS_VIDEO_REVIEW_FLAGS });

      let profile: RenderRepairProfile = !liveInputManifest && input.product.productKey.includes("cable-organizer") ? LEGACY_INITIAL_PROFILE : V2_PROVEN_PROFILE;
      let chosen: { review: AutomatedVideoReview; input: AutomatedReviewInput; outputPath: string } | null = null;
      const repairs: unknown[] = [];
      for (let cycle = 0; cycle < 3; cycle += 1) {
        const attempt = cycle === 0 ? "initial" : cycle === 1 ? "repair-1" : "repair-2";
        const attemptRoot = join(value.productRoot, attempt);
        await mkdir(attemptRoot, { recursive: true });
        const outputPath = join(attemptRoot, "output.mp4");
        const renderOperation = profile.motionPreset === "static" ? "render" : "render_v2";
        const renderStarted = performance.now();
        const render = await runJsonProcess(required.python, [mediaBridge], {
          operation: renderOperation, output: outputPath, audio_path: value.audioPath, image_paths: input.product.imagePaths,
          scene_roles: input.product.exactProductReference ? ["product_reference", ...value.genericImagePaths.map(() => "generic_usage_example")] : value.genericImagePaths.map(() => "generic_usage_example"),
          captions, hook: value.selected.candidate.hook, title: input.product.canonicalProductName, usage_label: USAGE_LABEL,
          layout_plan: bridgeLayout, caption_font_px: profile.captionFontPx, caption_animation: profile.captionAnimation,
          primary_visual_width_ratio: profile.primaryVisualWidthRatio, canvas_fill_ratio: profile.canvasFillRatio
        }, 900_000);
        if (render.status !== "success") throw new Error("RENDER_FAILED");
        const measurements = await runJsonProcess(required.python, [visualQaBridge], { operation: "analyze", video_path: outputPath, output_dir: join(attemptRoot, "visual-qa"), canvas_fill_ratio: profile.canvasFillRatio }, 420_000) as unknown as VisualQaMeasurements & { status: string };
        if (measurements.status !== "success") throw new Error("VISUAL_QA_FAILED");
        const reviewInput: AutomatedReviewInput = {
          productKey: input.product.productKey, attempt, selectedHook: value.selected.candidate.hook, hookFamily: classifyHookFamily(value.selected.candidate.hook), measurements,
          asrPassed: value.asrPassed, alignedRatio: alignment.aligned_ratio ?? 0, layoutCollision: layout.collision,
          captionTimelinePassed: true, captionMaxWords: Math.max(...captions.map((cue) => cue.words.length)), captionFontPx: profile.captionFontPx,
          captionAnimation: profile.captionAnimation, primaryVisualWidthRatio: profile.primaryVisualWidthRatio, genericUsage: true, genericOverclaim: false,
          productIdentityBound: true, productAnchorCount: value.recognizedAnchors.length, hookFamilyUniqueInBatch: true,
          usageLabelFullOnce: profile.usageLabelMode === "full_then_abbreviated", usageLabelAbbreviatedAfterIntro: profile.usageLabelMode === "full_then_abbreviated",
          hookVisibleAtSeconds: 0, hookFontPx: 104, hookHighContrast: true
        };
        const review = evaluateAutomatedVideoQuality(reviewInput);
        await writeJson(join(attemptRoot, "review-input.json"), reviewInput);
        await writeJson(join(attemptRoot, "automated-review.json"), { ...review, renderSeconds: elapsed(renderStarted), repairCycle: cycle, visualReviewExecuted: review.visualReview.visualReviewExecuted });
        if (review.machineQaPassed) { chosen = { review, input: reviewInput, outputPath }; break; }
        if (cycle >= 2) break;
        const repair = buildDeterministicRepairPlan({ cycle: (cycle + 1) as 1 | 2, blockers: review.blockers, signals: review.signals, current: profile });
        repairs.push(repair); profile = repair.profile;
        await writeJson(join(attemptRoot, "repair-plan.json"), repair);
      }
      if (!chosen) {
        items.push({ productKey: input.product.productKey, status: "AUTO_QA_BLOCKED", finalAutomatedQaPassed: false, humanOwnerReviewStatus: "not_requested", publishReady: false });
        continue;
      }
      const finalRoot = join(value.productRoot, "final");
      await mkdir(finalRoot, { recursive: true });
      const finalVideo = join(finalRoot, "output.mp4");
      await copyFile(chosen.outputPath, finalVideo);
      const finalMeasurements = { ...chosen.input.measurements,
        firstFramePath: join(finalRoot, "first-frame.jpg"),
        firstThreeSecondsContactSheetPath: join(finalRoot, "first-3-seconds-contact-sheet.jpg"),
        contactSheetPath: join(finalRoot, "contact-sheet.jpg")
      };
      await Promise.all([
        copyFile(chosen.input.measurements.firstFramePath, finalMeasurements.firstFramePath),
        copyFile(chosen.input.measurements.firstThreeSecondsContactSheetPath, finalMeasurements.firstThreeSecondsContactSheetPath),
        copyFile(chosen.input.measurements.contactSheetPath, finalMeasurements.contactSheetPath)
      ]);
      const finalInput: AutomatedReviewInput = { ...chosen.input, attempt: "final", measurements: finalMeasurements };
      const finalReview = evaluateAutomatedVideoQuality(finalInput);
      await writeJson(join(finalRoot, "review-input.json"), finalInput);
      await writeJson(join(finalRoot, "automated-review.json"), finalReview);
      const summary = { productKey: input.product.productKey, canonicalProductName: input.product.canonicalProductName, status: "AWAITING_CODEX_VISUAL_REVIEW", selectedHook: value.selected.candidate.hook, hookFamily: classifyHookFamily(value.selected.candidate.hook), creativeScore: value.selected.score.totalScore, asrSimilarity: value.similarity, recognizedAnchors: value.recognizedAnchors, coreAnchor: input.product.anchors[0], coreAnchorSimilarity: value.coreAnchorSimilarity, asrAttempts: value.asrAttempts, asrRecovered: value.asrRecovered, audioRepair: value.audioRepair, whisperxAlignedRatio: alignment.aligned_ratio, score: finalReview.score, machineQaPassed: finalReview.machineQaPassed, finalAutomatedQaPassed: false, visualReviewExecuted: false, repairs, exactProductReference: Boolean(input.product.exactProductReference), genericUsageEvidence: Boolean(input.product.realUseAsset), exactProductUse: false, overclaim: false, sourceProvider: input.product.sourceProvenance?.sourceProvider ?? null, sourceRequestId: input.product.sourceProvenance?.sourceRequestId ?? null, finalVideo, firstFramePath: finalMeasurements.firstFramePath, firstThreeSecondsContactSheetPath: finalMeasurements.firstThreeSecondsContactSheetPath, contactSheetPath: finalMeasurements.contactSheetPath, qaOverheadSeconds: finalMeasurements.qaOverheadSeconds, totalSeconds: elapsed(itemStarted), humanOwnerReviewStatus: "not_requested", publishReady: false, ...AUTONOMOUS_VIDEO_REVIEW_FLAGS };
      items.push(summary);
      await writeJson(join(value.productRoot, "summary.json"), summary);
      } catch (error) {
        items.push(blockedItem(input.product.productKey, error));
      }
    }
  } finally { await whisper.close(); }

  const machinePassed = items.filter((item) => item.machineQaPassed === true).length;
  const manifest = { version: "autonomous-video-review-v2", runId, mode, startedAt, completedAt: new Date().toISOString(), decision: "AUTONOMOUS_VIDEO_QA_V2_AWAITING_CODEX_VISUAL_REVIEW", productsRequested: products.length, machineQaPassed: machinePassed, visualReviewExecuted: false, finalAutomatedQaPassed: 0, humanOwnerReviewStatus: "not_requested", publishReady: false, hookFamilies: [...usedFamilies], whisperx: { persistent: true, modelLoadSeconds, processStarts: 1, requests: whisper.requestCount }, items, totalSeconds: elapsed(runStarted), ...AUTONOMOUS_VIDEO_REVIEW_FLAGS };
  await writeJson(join(outputRoot, "run-manifest.json"), manifest);
  console.log(JSON.stringify({ event: "autonomous_video_v2_machine_review_complete", outputRoot, mode, machinePassed, products: products.length, decision: manifest.decision, visualReviewExecuted: false, SAFE_TO_UPLOAD: false }));
  if (machinePassed !== products.length) process.exitCode = 2;
}

type PreparedProduct = {
  input: ReturnType<typeof loadApprovedProductFixtures>[number]; productRoot: string;
  selected: ReturnType<typeof rankCreativeCandidates>[number]; narration: string; audioPath: string; audioDuration: number; asrTranscript: string;
  asrPassed: boolean; similarity: number; recognizedAnchors: string[]; coreAnchorSimilarity: number; ttsSeconds: number; asrSeconds: number;
  audioRepair: Record<string, unknown>; asrAttempts: number; asrRecovered: boolean;
  genericImagePaths: string[];
};

async function loadLiveProductInputs(path: string, runId: string): Promise<ReturnType<typeof loadApprovedProductFixtures>> {
  const value = JSON.parse(await readFile(resolve(path), "utf8")) as { products?: unknown };
  if (!Array.isArray(value.products) || value.products.length < 1 || value.products.length > 3) throw new Error("LIVE_PRODUCT_VIDEO_ONE_TO_THREE_INPUTS_REQUIRED");
  return value.products.map((entry) => {
    const product = entry as ReturnType<typeof loadApprovedProductFixtures>[number];
    return { ...product, runId };
  });
}

function normalizeWordTimeline(words: Array<{ word: string; start: number; end: number; confidence: number | null }>) { let previousEnd = 0; return words.map((word) => { const start = Math.max(previousEnd, word.start); const end = Math.max(start + 0.01, word.end); previousEnd = end; return { ...word, start, end }; }); }
function compactKorean(value: string): string { return value.toLowerCase().replace(/[^가-힣a-z0-9]/gu, ""); }
async function synthesizeAndValidateVoice(input: {
  required: { python: string; ttsCommand: string; asrPython: string; asrScript: string; asrModel: string };
  mediaBridge: string; audioPauseRepair: string; voiceRoot: string; narration: string; canonicalProductName: string; anchors: string[];
}) {
  const started = performance.now();
  let ttsSeconds = 0; let asrSeconds = 0;
  let final: Awaited<ReturnType<typeof prepareVoiceAttempt>> | null = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const ttsStarted = performance.now();
    const value = await prepareVoiceAttempt(input, attempt);
    ttsSeconds += elapsed(ttsStarted) - value.asrSeconds;
    asrSeconds += value.asrSeconds;
    final = value;
    if (value.passed) break;
  }
  if (!final?.passed) throw new Error("ASR_FAILED_AFTER_REPAIR");
  await writeJson(join(input.voiceRoot, "asr.json"), { provider: "faster-whisper", rawTranscript: final.transcript, similarity: final.similarity, threshold: 0.82, recognizedAnchors: final.recognizedAnchors, contextAnchorMinimum: 2, identitySimilarity: final.identitySimilarity, identityThreshold: 0.65, coreAnchor: input.anchors[0], coreAnchorSimilarity: final.coreAnchorSimilarity, coreAnchorThreshold: 0.65, passed: true, attempts: final.attempt, recovered: final.attempt > 1, externalApiCalled: false, uploadAttempted: false });
  return { audioPath: final.audioPath, audioDuration: final.audioDuration, asrTranscript: final.transcript, similarity: final.similarity, recognizedAnchors: final.recognizedAnchors, coreAnchorSimilarity: final.coreAnchorSimilarity, audioRepair: final.audioRepair, asrAttempts: final.attempt, asrRecovered: final.attempt > 1, ttsSeconds: Math.round(ttsSeconds * 100) / 100, asrSeconds: Math.round(asrSeconds * 100) / 100, totalSeconds: elapsed(started) };
}

async function prepareVoiceAttempt(input: Parameters<typeof synthesizeAndValidateVoice>[0], attempt: number) {
  const suffix = attempt === 1 ? "" : "-recovery";
  const tts = await runJsonProcess(input.required.python, [input.mediaBridge], { operation: "tts", text: input.narration, target: join(input.voiceRoot, `tts${suffix}.wav`), command: input.required.ttsCommand }, 660_000);
  if (tts.status !== "success") throw new Error("TTS_FAILED");
  const repairedPath = join(input.voiceRoot, `tts${suffix}-repaired.wav`);
  const audioRepair = await runJsonProcess(input.required.python, [input.audioPauseRepair], { source_path: String(tts.output), output_path: repairedPath, threshold_ms: 700, target_ms: 500, minimum_ms: 300 }, 120_000);
  if (audioRepair.status !== "success") throw new Error("AUDIO_PAUSE_REPAIR_FAILED");
  await writeJson(join(input.voiceRoot, `audio-repair${suffix}.json`), audioRepair);
  const audioPath = repairedPath;
  const asrStarted = performance.now();
  const asr = await runFasterWhisper({ pythonExe: input.required.asrPython, scriptPath: input.required.asrScript, modelPath: input.required.asrModel, audioPath, outputPath: join(input.voiceRoot, `asr-provider${suffix}.json`) });
  const asrSeconds = elapsed(asrStarted);
  const similarity = koreanTextSimilarity(input.narration, asr.transcript);
  const compactTranscript = compactKorean(asr.transcript);
  const recognizedAnchors = input.anchors.filter((anchor) => compactTranscript.includes(compactKorean(anchor)));
  const identitySimilarity = bestKoreanSubstringSimilarity(input.canonicalProductName, asr.transcript);
  const coreAnchorSimilarity = bestKoreanSubstringSimilarity(input.anchors[0], asr.transcript);
  const passed = similarity >= 0.82 && recognizedAnchors.length >= 2 && identitySimilarity >= 0.65 && coreAnchorSimilarity >= 0.65;
  return { attempt, audioPath, audioDuration: Number(audioRepair.durationAfterSeconds ?? tts.duration_seconds), audioRepair, transcript: asr.transcript, similarity, recognizedAnchors, identitySimilarity, coreAnchorSimilarity, passed, asrSeconds };
}
function blockedItem(productKey: string, error: unknown): Record<string, unknown> {
  const blocker = error instanceof Error && /^[A-Z0-9_:-]+$/u.test(error.message) ? error.message : "VIDEO_AUTOMATION_REJECTED_PRODUCT";
  return { productKey, status: "VIDEO_AUTOMATION_REJECTED_PRODUCT", machineQaPassed: false, finalAutomatedQaPassed: false, blockers: [blocker], humanOwnerReviewStatus: "not_requested", publishReady: false, ...AUTONOMOUS_VIDEO_REVIEW_FLAGS };
}
async function writeJson(path: string, value: unknown): Promise<void> { await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function elapsed(started: number): number { return Math.round((performance.now() - started) / 10) / 100; }
void main().catch((error: unknown) => { const message = error instanceof Error && /^[A-Z0-9_:-]+$/u.test(error.message) ? error.message : "AUTONOMOUS_VIDEO_REVIEW_V2_FAILED"; console.error(JSON.stringify({ event: "autonomous_video_v2_failed", safeError: message, SAFE_TO_UPLOAD: false })); process.exitCode = 1; });
