import { mkdir, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { evaluateV143ReusableCreativePolicy } from "../../src/lib/uploads/videoAssets/v143ReusableCreativePolicy";
import { buildPopGroupCaptions } from "../../src/lib/video-automation/captionIntegration";
import { generateDeterministicCreativeCandidates } from "../../src/lib/video-automation/creativeCandidates";
import { selectTopPassingCreative } from "../../src/lib/video-automation/creativeSelection";
import { buildLocalQaStatus, evaluateHookUsageLayout } from "../../src/lib/video-automation/layoutCollision";
import { bestKoreanSubstringSimilarity, koreanTextSimilarity, runFasterWhisper, runJsonProcess } from "../../src/lib/video-automation/localRuntime";
import { loadApprovedProductFixtures } from "../../src/lib/video-automation/productFixtures";
import { validateProductVideoInput } from "../../src/lib/video-automation/productInput";
import { buildKoreanProductNarration } from "../../src/lib/video-automation/ttsNormalization";
import { createLocalWhisperXProcess, PersistentWhisperXProvider } from "../../src/lib/video-automation/whisperxPersistentProvider";
import type { CaptionCueV1 } from "../../src/lib/video-automation/types";

const USAGE_LABEL = "연출된 사용 예시";

async function main(): Promise<void> {
  const required = {
    assetRoot: process.env.VIDEO_AUTOMATION_ASSET_ROOT ?? "",
    python: process.env.VIDEO_AUTOMATION_PYTHON ?? "",
    ttsCommand: process.env.VIDEO_AUTOMATION_TTS_COMMAND ?? "",
    asrPython: process.env.VIDEO_AUTOMATION_ASR_PYTHON ?? "",
    asrScript: process.env.VIDEO_AUTOMATION_ASR_SCRIPT ?? "",
    asrModel: process.env.VIDEO_AUTOMATION_ASR_MODEL ?? ""
  };
  if (Object.values(required).some((value) => !value.trim())) throw new Error("VIDEO_AUTOMATION_LOCAL_RUNTIME_NOT_CONFIGURED");

  const runId = `run-${new Date().toISOString().replace(/[-:TZ.]/gu, "").slice(0, 14)}`;
  const outputRoot = resolve("data", "video-automation", runId);
  const ownerReviewRoot = join(outputRoot, "owner-review");
  const mediaBridge = resolve("tools", "video-automation", "local_media_bridge.py");
  const whisperService = resolve("tools", "video-automation", "whisperx_jsonl_service.py");
  await mkdir(ownerReviewRoot, { recursive: true });

  const readiness = Object.fromEntries(Object.keys(required).map((key) => [key, Boolean(required[key as keyof typeof required])]));
  console.log(JSON.stringify({ event: "local_runtime_readiness", configured: readiness, products: 3, llmRequests: 0, externalApiRequests: 0, SAFE_TO_UPLOAD: false }));

  const products = loadApprovedProductFixtures(required.assetRoot, runId);
  for (const [index, input] of products.entries()) {
    const asset = input.product.realUseAsset;
    if (!asset || asset.ownerReviewStatus !== "pass") throw new Error("OWNER_REVIEWED_REAL_USE_ASSET_REQUIRED");
    await stat(asset.sourcePath);
    await stat(asset.reviewEvidencePath);
    const prepared = await runJsonProcess(required.python, [mediaBridge], {
      operation: "prepare_reviewed_asset", source_path: asset.sourcePath,
      target_dir: join(ownerReviewRoot, `product-${String(index + 1).padStart(3, "0")}`, "source-frames")
    }, 180_000);
    if (prepared.status !== "success" || !Array.isArray(prepared.image_paths) || prepared.image_paths.length < 5) throw new Error("OWNER_REVIEWED_FRAME_EXTRACTION_FAILED");
    input.product.imagePaths = prepared.image_paths.map(String);
  }

  const runStarted = performance.now();
  const preparedVoice = new Map<string, { audioPath: string; audioDuration: number; similarity: number; recognizedAnchors: string[]; ttsSeconds: number; asrSeconds: number }>();
  for (const [index, input] of products.entries()) {
    const itemRoot = join(ownerReviewRoot, `product-${String(index + 1).padStart(3, "0")}`);
    validateProductVideoInput(input);
    await Promise.all(input.product.imagePaths.map((path) => stat(path)));
    const selection = selectTopPassingCreative(input.product.productKey, generateDeterministicCreativeCandidates(input));
    const selected = selection.candidates.find((candidate) => candidate.selected)?.candidate;
    if (!selected) throw new Error("CREATIVE_SELECTION_FAILED");
    const narration = buildKoreanProductNarration({ canonicalProductName: input.product.canonicalProductName, hook: selected.hook, script: selected.script });
    let started = performance.now();
    const tts = await runJsonProcess(required.python, [mediaBridge], { operation: "tts", text: narration, target: join(itemRoot, "tts.wav"), command: required.ttsCommand }, 660_000);
    if (tts.status !== "success") throw new Error("TTS_FAILED");
    const ttsSeconds = secondsSince(started);
    const audioPath = String(tts.output);
    started = performance.now();
    const asr = await runFasterWhisper({ pythonExe: required.asrPython, scriptPath: required.asrScript, modelPath: required.asrModel, audioPath, outputPath: join(itemRoot, "asr-provider.json") });
    const similarity = koreanTextSimilarity(narration, asr.transcript);
    const recognizedAnchors = input.product.anchors.filter((anchor) => asr.transcript.includes(anchor));
    const productIdentitySimilarity = bestKoreanSubstringSimilarity(input.product.canonicalProductName, asr.transcript);
    const asrArtifact = { provider: "faster-whisper", transcript: asr.transcript, similarity, threshold: 0.82, recognizedAnchors, contextAnchorMinimum: 2, productIdentitySimilarity, productIdentityThreshold: 0.65, passed: similarity >= 0.82 && recognizedAnchors.length >= 2 && productIdentitySimilarity >= 0.65 };
    await safeWrite(join(itemRoot, "asr.json"), asrArtifact);
    if (!asrArtifact.passed) throw new Error("ASR_FAILED");
    preparedVoice.set(input.product.productKey, { audioPath, audioDuration: Number(tts.duration_seconds), similarity, recognizedAnchors, ttsSeconds, asrSeconds: secondsSince(started) });
  }

  const whisper = new PersistentWhisperXProvider(() => createLocalWhisperXProcess(required.python, whisperService, {
    ...process.env, HF_HOME: process.env.VIDEO_AUTOMATION_HF_HOME, TORCH_HOME: process.env.VIDEO_AUTOMATION_TORCH_HOME
  }), 300_000);
  const modelLoadSeconds = await whisper.start();
  const items: Array<Record<string, unknown>> = [];

  try {
    for (const [index, input] of products.entries()) {
      const itemStarted = performance.now();
      const itemRoot = join(ownerReviewRoot, `product-${String(index + 1).padStart(3, "0")}`);
      const stageSeconds: Record<string, number> = {};
      try {
        validateProductVideoInput(input);
        await safeWrite(join(itemRoot, "product.json"), input);
        let started = performance.now();
        const candidates = generateDeterministicCreativeCandidates(input);
        stageSeconds.creative_generation = secondsSince(started);
        await safeWrite(join(itemRoot, "creative-candidates.json"), { productKey: input.product.productKey, candidates, llmRequests: 0 });
        started = performance.now();
        const selection = selectTopPassingCreative(input.product.productKey, candidates);
        stageSeconds.scoring = secondsSince(started);
        await safeWrite(join(itemRoot, "creative-selection.json"), selection);
        const selectedEntry = selection.candidates.find((candidate) => candidate.selected);
        if (!selectedEntry) throw new Error("CREATIVE_SELECTION_FAILED");
        const selected = selectedEntry.candidate;
        const voice = preparedVoice.get(input.product.productKey);
        if (!voice) throw new Error("VOICE_PREPARATION_FAILED");
        stageSeconds.tts = voice.ttsSeconds;
        stageSeconds.asr = voice.asrSeconds;

        started = performance.now();
        const alignment = await whisper.align(voice.audioPath);
        if (alignment.status !== "success" || !alignment.words?.length || (alignment.aligned_ratio ?? 0) < 0.95) throw new Error("WHISPERX_ALIGNMENT_FAILED");
        const words = normalizeWordTimeline(alignment.words);
        await safeWrite(join(itemRoot, "whisperx.json"), { ...alignment, words });
        stageSeconds.alignment = secondsSince(started);
        const captions = buildPopGroupCaptions(words);
        const captionQaPassed = captions.length > 0 && captions.every((cue, cueIndex) => cue.words.length <= 4 && cue.start >= 0 && cue.end > cue.start && cue.start >= (captions[cueIndex - 1]?.end ?? 0) && cue.text.length <= 18);
        if (!captionQaPassed) throw new Error("VIDEO_AUTOMATION_CAPTION_TIMELINE_INVALID");
        await safeWrite(join(itemRoot, "captions.json"), { mode: "POP_GROUP", maxWordsPerCue: 4, cues: captions });

        const realUseAsset = input.product.realUseAsset;
        const visualGate = await runJsonProcess(required.python, [mediaBridge], { operation: "visual_gate", image_paths: input.product.imagePaths, real_use_asset: realUseAsset }, 120_000);
        if (visualGate.gate_pass !== true) throw new Error("VISUAL_EVIDENCE_GATE_FAILED");
        const v143 = evaluateV143ReusableCreativePolicy({ hook_font_px: 104, hook_max_lines: 2, hook_visible_within_seconds: 0, hook_high_contrast: true, real_usage_scene_present: true, usage_source_role: "generic_usage_example", usage_label_present: true, exact_product_identity_claim: false, exact_product_identity_verified: false, actor_nationality_verified: false, product_identity_binding_verified: true, tts_provider_approved: true, tts_language: "ko", tts_speed_multiplier: 1.2, tts_delivery_style: "brisk_confident_sales", safe_to_upload: false, safe_to_public_upload: false });
        if (!v143.passed) throw new Error("V143_CREATIVE_POLICY_FAILED");

        const tsLayout = evaluateHookUsageLayout({ hook: selected.hook, usageLabel: USAGE_LABEL });
        if (!tsLayout.passed) throw new Error(tsLayout.blockers[0]);
        const layoutPlan = await runJsonProcess(required.python, [mediaBridge], { operation: "layout_plan", hook: selected.hook, usage_label: USAGE_LABEL }, 60_000);
        if (layoutPlan.passed !== true) throw new Error(String((layoutPlan.blockers as string[])[0]));
        await safeWrite(join(itemRoot, "render-plan.json"), { selectedCandidateId: selected.id, hook: selected.hook, script: selected.script, captions, visualGate, v143, layoutPlan, realUseAsset, productIdentityBound: true, SAFE_TO_UPLOAD: false });

        started = performance.now();
        const outputPath = join(itemRoot, "output.mp4");
        const render = await runJsonProcess(required.python, [mediaBridge], { operation: "render", output: outputPath, audio_path: voice.audioPath, image_paths: input.product.imagePaths, captions, hook: selected.hook, title: input.product.canonicalProductName, usage_label: USAGE_LABEL, layout_plan: layoutPlan }, 900_000);
        if (render.status !== "success") throw new Error("RENDER_FAILED");
        await Promise.all([stat(String(render.hook_text_file)), stat(String(render.usage_label_text_file))]);
        stageSeconds.render = secondsSince(started);
        started = performance.now();
        const probe = await runJsonProcess(required.python, [mediaBridge], { operation: "inspect", output: render.output, layout_plan: layoutPlan, first_frame: join(itemRoot, "first-frame.jpg"), contact_sheet: join(itemRoot, "contact-sheet.jpg") }, 120_000);
        const qaBlockers = buildQaBlockers({ probe, audioDuration: voice.audioDuration, similarity: voice.similarity, recognizedAnchorCount: voice.recognizedAnchors.length, alignedRatio: alignment.aligned_ratio ?? 0, captions, visualGate, v143Passed: v143.passed, layoutPlan });
        const qaStatus = buildLocalQaStatus({ technicalQaPassed: qaBlockers.length === 0, captionQaPassed, layoutQaPassed: layoutPlan.passed === true && layoutPlan.collision === false && (probe.actual_frame_layout as Record<string, unknown>)?.collision === false, visualEvidencePassed: visualGate.gate_pass === true });
        const ownerReviewReady = qaStatus.technicalQaPassed && qaStatus.captionQaPassed && qaStatus.layoutQaPassed && qaStatus.visualEvidencePassed;
        const qa = { ...qaStatus, ownerReviewReady, blockers: qaBlockers, ffprobe: probe, visualGate, v143, layoutPlan, owner_review_required: true, SAFE_TO_UPLOAD: false, SAFE_TO_PUBLIC_UPLOAD: false };
        await safeWrite(join(itemRoot, "qa.json"), qa);
        stageSeconds.qa = secondsSince(started);
        if (!ownerReviewReady || qaStatus.publishQualityPassed) throw new Error("QA_FAILED");
        const item = {
          productKey: input.product.productKey, canonicalProductName: input.product.canonicalProductName, selectedCandidate: selected.id, selectedHook: selected.hook, creativeScore: selectedEntry.score.totalScore,
          candidateScores: selection.candidates.map((entry) => ({ id: entry.candidate.id, angle: entry.candidate.angle, score: entry.score.totalScore, passed: entry.score.passed, blockers: entry.score.blockers, rank: entry.rank, selected: entry.selected })),
          realUseAsset, realUseEvidenceReady: true, ttsProvider: "local_command", asrSimilarity: voice.similarity, recognizedAnchors: voice.recognizedAnchors, whisperxAlignedRatio: alignment.aligned_ratio, whisperxProcessingSeconds: alignment.processing_seconds,
          captionMode: "POP_GROUP", captionCues: captions.length, allCaptionCuesMaxFourWords: true, renderDuration: probe.duration_seconds, renderSeconds: stageSeconds.render,
          hookUsageGapPx: layoutPlan.actual_gap_px, hookUsageCollision: false, technicalQaPassed: qaStatus.technicalQaPassed, captionQaPassed: qaStatus.captionQaPassed, layoutQaPassed: qaStatus.layoutQaPassed, visualEvidencePassed: qaStatus.visualEvidencePassed,
          ownerReviewStatus: "pending", publishQualityPassed: false, ownerReviewReady: true, outputPath: String(render.output), firstFramePath: String(probe.first_frame_path), contactSheetPath: String(probe.contact_sheet_path),
          stageSeconds, totalSeconds: secondsSince(itemStarted), status: "READY_FOR_OWNER_REVIEW", SAFE_TO_UPLOAD: false, SAFE_TO_PUBLIC_UPLOAD: false
        };
        items.push(item);
        await safeWrite(join(itemRoot, "summary.json"), item);
      } catch (error) {
        items.push({ productKey: input.product.productKey, canonicalProductName: input.product.canonicalProductName, status: "FAILED", safeError: safeError(error), ownerReviewStatus: "pending", publishQualityPassed: false, stageSeconds, totalSeconds: secondsSince(itemStarted), SAFE_TO_UPLOAD: false });
      }
    }
  } finally {
    await whisper.close();
  }

  const completed = items.filter((item) => item.status === "READY_FOR_OWNER_REVIEW").length;
  const reviewedAssets = products.filter((input) => input.product.realUseAsset?.ownerReviewStatus === "pass").length;
  const decision = completed === 3 && reviewedAssets === 3 ? "PRODUCT_TO_VIDEO_AUTOMATION_V1_LOCAL_PROVEN_3_OF_3_NO_UPLOAD" : completed > 0 ? "PRODUCT_TO_VIDEO_AUTOMATION_V1_PARTIAL" : "PRODUCT_TO_VIDEO_AUTOMATION_V1_BLOCKED";
  const manifest = { runId, startedAt: new Date(Date.now() - (performance.now() - runStarted)).toISOString(), completedAt: new Date().toISOString(), decision, productsRequested: 3, productsCompleted: completed, productsFailed: 3 - completed, ownerReviewedRealUseAssets: reviewedAssets, technicalAutomationReady: completed === 3, ownerReviewReady: completed === 3, publishReady: false, scorerVersion: "video-lab-creative-score-v2", whisperx: { enabled: true, persistent: true, version: "3.8.6", model: "tiny", device: "cpu", computeType: "int8", modelLoadSeconds, processStarts: 1, requests: whisper.requestCount }, safety: safety(), items, totalSeconds: secondsSince(runStarted) };
  await safeWrite(join(outputRoot, "run-manifest.json"), manifest);
  await safeWrite(join(outputRoot, "owner-review-summary.json"), { runId, decision, technicalAutomationReady: completed === 3, ownerReviewReady: completed === 3, publishReady: false, ownerReviewStatus: "pending", publishQualityPassed: false, items, safety: safety() });
  await writeFile(join(ownerReviewRoot, "OWNER_REVIEW.md"), buildReviewMarkdown(runId, items), "utf8");
  console.log(JSON.stringify({ event: "product_to_video_completed", runId, outputRoot, decision, completed, failed: 3 - completed, ownerReviewedRealUseAssets: reviewedAssets, whisperxProcessStarts: 1, whisperxRequests: whisper.requestCount, SAFE_TO_UPLOAD: false, SAFE_TO_PUBLIC_UPLOAD: false }));
  if (completed !== 3 || reviewedAssets !== 3) process.exitCode = 2;
}

void main().catch((error: unknown) => { console.error(JSON.stringify({ event: "product_to_video_failed", safeError: safeError(error), SAFE_TO_UPLOAD: false })); process.exitCode = 1; });

function normalizeWordTimeline(words: Array<{ word: string; start: number; end: number; confidence: number | null }>) { let previousEnd = 0; return words.map((word) => { const start = Math.max(previousEnd, word.start); const end = Math.max(start + 0.01, word.end); previousEnd = end; return { ...word, start, end }; }); }
function buildQaBlockers(input: { probe: Record<string, unknown>; audioDuration: number; similarity: number; recognizedAnchorCount: number; alignedRatio: number; captions: CaptionCueV1[]; visualGate: Record<string, unknown>; v143Passed: boolean; layoutPlan: Record<string, unknown> }): string[] {
  const blockers: string[] = [];
  if (input.probe.video_codec !== "h264" || input.probe.audio_codec !== "aac" || input.probe.width !== 1080 || input.probe.height !== 1920 || input.probe.frame_rate !== "30/1" || input.probe.video_stream !== true || input.probe.audio_stream !== true || Number(input.probe.file_size) <= 0) blockers.push("MEDIA_FORMAT_QA_FAILED");
  if (Math.abs(Number(input.probe.duration_seconds) - input.audioDuration) > 0.35) blockers.push("AUDIO_DURATION_MISMATCH");
  if (input.similarity < 0.82) blockers.push("ASR_SIMILARITY_TOO_LOW");
  if (input.recognizedAnchorCount < 2) blockers.push("PRODUCT_ANCHORS_MISSING");
  if (input.alignedRatio < 0.95) blockers.push("WHISPERX_ALIGNED_RATIO_TOO_LOW");
  if (!input.captions.length || input.captions[input.captions.length - 1].end > Number(input.probe.duration_seconds) + 0.35) blockers.push("CAPTION_TIMELINE_INVALID");
  if (input.visualGate.gate_pass !== true) blockers.push("VISUAL_EVIDENCE_GATE_FAILED");
  if (!input.v143Passed) blockers.push("V143_CREATIVE_POLICY_FAILED");
  if (input.layoutPlan.passed !== true || input.layoutPlan.collision !== false || (input.probe.actual_frame_layout as Record<string, unknown>)?.collision !== false) blockers.push("VIDEO_LAYOUT_HOOK_USAGE_COLLISION");
  return blockers;
}
async function safeWrite(path: string, value: unknown): Promise<void> { await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function secondsSince(started: number): number { return Math.round((performance.now() - started) / 10) / 100; }
function safeError(error: unknown): string { const message = error instanceof Error ? error.message : "VIDEO_AUTOMATION_FAILED"; return /^[A-Z0-9_:-]+$/u.test(message) ? message : "VIDEO_AUTOMATION_FAILED"; }
function safety() { return { SAFE_TO_UPLOAD: false, SAFE_TO_PUBLIC_UPLOAD: false, YOUTUBE_AUTO_UPLOAD: false, PUBLIC_UPLOAD: false, UNLISTED_UPLOAD: false, TIKTOK_AUTO_UPLOAD: false, THREADS_AUTO_POST: false, COMMENT_AUTOMATION: false, DB_WRITE: 0, PRODUCTION_DEPLOY: 0, SCHEDULER_CHANGE: 0, PLATFORM_UPLOAD: 0 }; }
function buildReviewMarkdown(id: string, values: Array<Record<string, unknown>>): string { return [`# Product-to-Video Owner Review`, ``, `Run: ${id}`, ``, `Upload: disabled`, `Owner Review: PENDING`, `Publish Ready: false`, ``, ...values.flatMap((item, index) => [`## ${index + 1}. ${String(item.canonicalProductName)}`, ``, `- Product: ${String(item.canonicalProductName)}`, `- Selected Hook: ${String(item.selectedHook ?? "-")}`, `- Creative Score: ${String(item.creativeScore ?? "-")}`, `- Video path: ${String(item.outputPath ?? "-")}`, `- First-frame path: ${String(item.firstFramePath ?? "-")}`, `- Contact sheet: ${String(item.contactSheetPath ?? "-")}`, `- ASR similarity: ${String(item.asrSimilarity ?? "-")}`, `- WhisperX aligned ratio: ${String(item.whisperxAlignedRatio ?? "-")}`, `- Caption cue count: ${String(item.captionCues ?? "-")}`, `- Hook/usage gap: ${String(item.hookUsageGapPx ?? "-")} px`, `- Technical QA: ${String(item.technicalQaPassed ?? false)}`, `- Layout QA: ${String(item.layoutQaPassed ?? false)}`, `- Real-use evidence: ${String(item.realUseEvidenceReady ?? false)} (${String((item.realUseAsset as Record<string, unknown> | undefined)?.identityType ?? "-")})`, `- Owner Review: PENDING`, `- Publish Quality: false`, ``])].join("\n"); }
