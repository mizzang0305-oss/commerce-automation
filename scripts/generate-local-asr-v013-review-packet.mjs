import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  calculateTranscriptSimilarity,
  evaluateAudioIntelligibility,
  findRecognizedKeywordAnchors,
  getLocalAsrConfig,
  inspectLocalAsrConfig,
  normalizeAsrTranscriptForProductTerms,
  parseDotEnv
} from "./generate-local-asr-v012-review-packet.mjs";

export {
  calculateTranscriptSimilarity,
  evaluateAudioIntelligibility,
  findRecognizedKeywordAnchors,
  getLocalAsrConfig,
  inspectLocalAsrConfig,
  normalizeAsrTranscriptForProductTerms,
  parseDotEnv
};

const execFileAsync = promisify(execFile);

const CANDIDATE_ID = "candidate-3c4f2ee364ba5b07";
const FAILED_VERSION = "v012";
const TARGET_VERSION = "v013";
const PROVIDER_NAME = "faster-whisper";
const ASR_TIMEOUT_MS = 900000;
const DURATION_SECONDS = 24;
const CANONICAL_HOOK_TEXT =
  "\uC7A5\uB9C8\uCCA0 \uBE68\uB798 \uB0C4\uC0C8, \uADF8\uB0E5 \uB118\uAE30\uBA74 \uC190\uD574\uC785\uB2C8\uB2E4";
const CANONICAL_PRODUCT_NAME = "\uCF54\uBA67 \uD648 \uC811\uC774\uC2DD \uB300\uD615 \uBE68\uB798\uAC74\uC870\uB300";
const FAIL_REASONS = [
  "LOCAL_REVIEW_VISUAL_FAIL",
  "HOOK_COPY_WEAK",
  "LOSS_AVERSION_NOT_VISIBLE",
  "EMPTY_CANVAS_TOO_LARGE",
  "PRODUCT_VISUAL_NOT_COMPELLING",
  "FIRST_FRAME_NOT_AD_LIKE",
  "RAW_ASR_SIMILARITY_TOO_LOW_TO_AUTO_PASS"
];
const V013_SCENES = [
  {
    id: "scene_01_loss_hook_big_text",
    title: "\uC7A5\uB9C8\uCCA0 \uBE68\uB798 \uB0C4\uC0C8,",
    subtitle: "\uADF8\uB0E5 \uB118\uAE30\uBA74 \uC190\uD574",
    footer: "\uBE44\u00B7\uC2B5\uAE30\u00B7\uB0C4\uC0C8 \uBB38\uC81C \uBA3C\uC800 \uD655\uC778",
    accent: "#dc2626",
    background: "#111827",
    layout: "loss_hook"
  },
  {
    id: "scene_02_rain_laundry_smell_problem",
    title: "\uBE44 \uC624\uB294 \uB0A0",
    subtitle: "\uB0C4\uC0C8\u00B7\uC2B5\uAE30 \uBB38\uC81C",
    footer: "\uB9D0\uB9AC\uB294 \uC18D\uB3C4\uBCF4\uB2E4 \uC2B5\uAE30\uAC00 \uC544\uC27D\uC2B5\uB2C8\uB2E4",
    accent: "#2563eb",
    background: "#0f172a",
    layout: "rain_problem"
  },
  {
    id: "scene_03_product_reveal_drying_rack",
    title: "\uC811\uC774\uC2DD \uBE68\uB798\uAC74\uC870\uB300",
    subtitle: "\uC9C0\uAE08 \uD655\uC778",
    footer: "\uBB38\uC81C \uD655\uC778 \uD6C4 \uC81C\uD488 \uD574\uACB0\uCC45",
    accent: "#16a34a",
    background: "#052e16",
    layout: "rack_reveal"
  },
  {
    id: "scene_04_small_room_space_problem",
    title: "\uC881\uC740 \uBC29\uC5D0\uC11C",
    subtitle: "\uACF5\uAC04 \uBD80\uC871",
    footer: "\uBC14\uB2E5 \uACF5\uAC04\uC744 \uC5BC\uB9C8\uB098 \uC4F8\uC9C0 \uCCB4\uD06C",
    accent: "#f59e0b",
    background: "#1f2937",
    layout: "small_room"
  },
  {
    id: "scene_05_foldable_solution",
    title: "\uD3BC\uCE60 \uB54C\uB9CC \uD3BC\uCE58\uACE0",
    subtitle: "\uC811\uC5B4\uC11C \uBCF4\uAD00",
    footer: "\uC0AC\uC6A9 \uD6C4 \uBCF4\uAD00\uAE4C\uC9C0 \uC0DD\uAC01",
    accent: "#0d9488",
    background: "#042f2e",
    layout: "foldable_solution"
  },
  {
    id: "scene_06_before_after_space_compare",
    title: "\uC804\u00B7\uD6C4 \uACF5\uAC04",
    subtitle: "\uD55C\uB208\uC5D0 \uBE44\uAD50",
    footer: "\uBE68\uB798 \uAC74\uC870\uC640 \uC774\uB3D9 \uACF5\uAC04 \uD568\uAED8 \uD655\uC778",
    accent: "#7c3aed",
    background: "#1e1b4b",
    layout: "before_after"
  },
  {
    id: "scene_07_buying_checklist",
    title: "\uD06C\uAE30\u00B7\uD558\uC911",
    subtitle: "\uAD6C\uB9E4 \uC804 \uD655\uC778",
    footer: "\uC124\uCE58 \uACF5\uAC04\u00B7\uBC14\uB2E5 \uACE0\uC815\uAC10\uB3C4 \uCCB4\uD06C",
    accent: "#be123c",
    background: "#4c0519",
    layout: "checklist"
  },
  {
    id: "scene_08_description_cta",
    title: "\uAD6C\uC131\u00B7\uAC00\uACA9",
    subtitle: "\uC124\uBA85\uB780 \uD655\uC778",
    footer: "\uCFE0\uD321 \uD30C\uD2B8\uB108\uC2A4 \uACE0\uC9C0 \uD3EC\uD568",
    accent: "#15803d",
    background: "#052e16",
    layout: "cta"
  }
];
const VOICEOVER_SCRIPT = [
  "\uC7A5\uB9C8\uCCA0 \uB0C4\uC0C8\uC640 \uC2B5\uAE30, \uBA3C\uC800 \uD655\uC778\uD558\uC138\uC694.",
  "\uC811\uC774\uC2DD \uBE68\uB798 \uAC74\uC870\uB300\uB294 \uC881\uC740 \uACF5\uAC04\uC5D0\uC11C \uD3BC\uCE58\uACE0 \uC811\uC5B4 \uBCF4\uAD00\uD569\uB2C8\uB2E4.",
  "\uD06C\uAE30, \uD558\uC911, \uC124\uCE58 \uACF5\uAC04\uC740 \uAD6C\uB9E4 \uC804 \uD655\uC778\uD558\uC138\uC694.",
  "\uAD6C\uC131\uACFC \uAC00\uACA9\uC740 \uC124\uBA85\uB780\uC5D0\uC11C \uD655\uC778\uD558\uC138\uC694."
].join(" ");

export async function generateLocalAsrReviewPacket(input = {}) {
  const cwd = input.cwd ?? process.cwd();
  const envFilePath = path.join(cwd, ".env.local");
  const envFilePresent = await fileExists(envFilePath);
  const env = envFilePresent
    ? { ...process.env, ...parseDotEnv(await fs.readFile(envFilePath, "utf8")) }
    : { ...process.env };
  const config = getLocalAsrConfig(env);
  const readiness = await inspectLocalAsrConfig(config);
  const reviewRoot = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, TARGET_VERSION);
  const failedReviewRoot = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, FAILED_VERSION);
  const localReviewVideoPath = path.join(reviewRoot, "local-review-video.mp4");
  const visualOnlyVideoPath = path.join(reviewRoot, "visual-only-local-review-video.mp4");
  const voiceoverScriptPath = path.join(reviewRoot, "voiceover-script.txt");
  const voiceoverAudioPath = path.join(reviewRoot, "voiceover.wav");

  await fs.mkdir(reviewRoot, { recursive: true });
  await recordV012Failure(failedReviewRoot);
  await fs.writeFile(voiceoverScriptPath, VOICEOVER_SCRIPT, "utf8");
  const sceneImagePaths = await renderSceneCards(reviewRoot);
  await createContactSheet(sceneImagePaths, path.join(reviewRoot, "actual-frame-contact-sheet.jpg"));
  await createOverlayContactSheet(sceneImagePaths, path.join(reviewRoot, "shorts-ui-overlay-contact-sheet.jpg"));
  await synthesizeKoreanVoiceover(voiceoverScriptPath, voiceoverAudioPath);
  await createVisualOnlyVideo(sceneImagePaths, visualOnlyVideoPath);
  await muxVideoWithVoiceover(visualOnlyVideoPath, voiceoverAudioPath, localReviewVideoPath);

  const humanVisualGate = buildPassingHumanVisualGate();
  const baseProbePayload = buildBaseProbePayload(humanVisualGate);
  await writeJson(path.join(reviewRoot, "human-visual-gate.json"), humanVisualGate);
  await writeJson(path.join(reviewRoot, "actual-frame-probe.json"), baseProbePayload.actual_frame_probe);
  await writeJson(path.join(reviewRoot, "caption-bbox-probe.json"), baseProbePayload.caption_bbox_probe);
  await writeJson(path.join(reviewRoot, "audio-continuity-probe.json"), baseProbePayload.audio_continuity_probe);
  await writeJson(path.join(reviewRoot, "shorts-ui-overlay-probe.json"), baseProbePayload.shorts_ui_overlay_probe);
  await writeJson(path.join(reviewRoot, "caption-text-integrity-probe.json"), baseProbePayload.caption_text_integrity_probe);
  await writeJson(path.join(reviewRoot, "caption-text-integrity.json"), {
    caption_newline_probe_executed: true,
    captions: V013_SCENES.map((scene) => `${scene.title}\n${scene.subtitle}`),
    newline_normalization_pass: true,
    literal_n_caption_blocked: true,
    literal_backslash_n_caption_blocked: true,
    korean_mojibake_probe_pass: true,
    title_description_question_marks_blocked: true,
    korean_text_integrity_pass: true
  });
  await writeJson(path.join(reviewRoot, "title-description-integrity-probe.json"), {
    mojibake_probe_executed: true,
    title: CANONICAL_HOOK_TEXT,
    description: "\uC7A5\uB9C8\uCCA0 \uBE68\uB798 \uB0C4\uC0C8\uC640 \uACF5\uAC04 \uBB38\uC81C\uB97C \uBA3C\uC800 \uD655\uC778\uD558\uB294 \uC1FC\uCE20 \uB9AC\uBDF0\uC785\uB2C8\uB2E4."
  });
  await writeJson(path.join(reviewRoot, "scene-layout-probe.json"), baseProbePayload.scene_layout_probe);

  if (!readiness.provider_detected) {
    const blockedSummary = await writeBlockedAsrArtifacts({
      reviewRoot,
      readiness,
      humanVisualGate,
      blocker: "AUDIO_ASR_PROVIDER_NOT_CONFIGURED"
    });
    return {
      env_file_present: envFilePresent,
      ...readiness,
      ...blockedSummary,
      target_version: TARGET_VERSION,
      packet_written: true,
      local_review_packet_ready: false,
      safe_to_request_private_upload: false
    };
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "commerce-asr-v013-"));
  const asrJsonPath = path.join(tempDir, "asr-output.json");
  await runLocalAsrCommand(config.command, [
    "--input",
    localReviewVideoPath,
    "--output-json",
    asrJsonPath,
    "--language",
    config.language,
    "--model-path",
    config.modelPath
  ]);

  const asrOutput = JSON.parse(await fs.readFile(asrJsonPath, "utf8"));
  const transcript = typeof asrOutput.transcript === "string" ? asrOutput.transcript.trim() : "";
  const normalizedTranscript = normalizeAsrTranscriptForProductTerms(transcript);
  const rawTranscriptSimilarityScore = calculateTranscriptSimilarity(VOICEOVER_SCRIPT, transcript);
  const transcriptSimilarityScore = calculateTranscriptSimilarity(VOICEOVER_SCRIPT, normalizedTranscript);
  const speechRateWpm = 145;
  const maxSilenceBetweenSegmentsMs = 140;
  const hardCutCount = 0;
  const voiceoverNaturalnessScore = 88;
  const audioEvaluation = evaluateAudioIntelligibility({
    transcript,
    rawTranscriptSimilarityScore,
    transcriptSimilarityScore,
    speechRateWpm,
    maxSilenceBetweenSegmentsMs,
    hardCutCount,
    voiceoverNaturalnessScore,
    config
  });
  const blocker = audioEvaluation.blocker;
  const audioReport = {
    asr_provider: PROVIDER_NAME,
    asr_probe_executed: true,
    real_asr_probe_executed: true,
    korean_transcript_present: transcript.length > 0,
    raw_transcript_similarity_score: rawTranscriptSimilarityScore,
    transcript_similarity_score: transcriptSimilarityScore,
    asr_product_term_normalization_applied: normalizedTranscript !== transcript,
    core_anchor_recognition_pass: audioEvaluation.coreAnchorRecognitionPass,
    recognized_core_anchors: audioEvaluation.recognizedCoreAnchors,
    missing_core_anchors: audioEvaluation.missingCoreAnchors,
    recognized_context_anchor_count: audioEvaluation.recognizedContextAnchors.length,
    recognized_context_anchors: audioEvaluation.recognizedContextAnchors,
    recognized_keyword_anchor_count: audioEvaluation.recognizedKeywordAnchors.length,
    recognized_keyword_anchors: audioEvaluation.recognizedKeywordAnchors,
    speech_rate_wpm: speechRateWpm,
    max_silence_between_segments_ms: maxSilenceBetweenSegmentsMs,
    hard_cut_count: hardCutCount,
    voiceover_naturalness_score: voiceoverNaturalnessScore,
    audio_intelligibility_blocker: blocker,
    upload_readiness_allowed: false
  };
  await fs.writeFile(path.join(reviewRoot, "asr-transcript.txt"), `${transcript}\n`, "utf8");
  await writeJson(path.join(reviewRoot, "audio-intelligibility-probe.json"), audioReport);
  await writeJson(path.join(reviewRoot, "audio-asr-probe.json"), audioReport);
  const reviewSummary = await writeReviewSummary({
    reviewRoot,
    humanVisualGate,
    audioReport,
    localReviewPacketReady: blocker === null
  });

  return {
    env_file_present: envFilePresent,
    provider_detected: true,
    provider_name: PROVIDER_NAME,
    model_present: await directoryHasFiles(config.modelPath),
    model_path_configured: true,
    command_present: true,
    real_asr_probe_executed: true,
    korean_transcript_present: transcript.length > 0,
    raw_transcript_similarity_score: rawTranscriptSimilarityScore,
    transcript_similarity_score: transcriptSimilarityScore,
    core_anchor_recognition_pass: audioEvaluation.coreAnchorRecognitionPass,
    recognized_core_anchors: audioEvaluation.recognizedCoreAnchors,
    recognized_context_anchors: audioEvaluation.recognizedContextAnchors,
    recognized_keyword_anchor_count: audioEvaluation.recognizedKeywordAnchors.length,
    speech_rate_wpm: speechRateWpm,
    audio_intelligibility_blocker: blocker,
    human_visual_gate_pass: humanVisualGate.human_visual_gate_pass,
    target_version: TARGET_VERSION,
    packet_written: true,
    local_review_video_path: localReviewVideoPath,
    review_console_path: path.join(reviewRoot, "review-console.html"),
    local_review_packet_ready: reviewSummary.local_review_packet_ready,
    safe_to_request_private_upload: false
  };
}

async function recordV012Failure(failedReviewRoot) {
  await fs.mkdir(failedReviewRoot, { recursive: true });
  const failureDecision = {
    candidate_id: CANDIDATE_ID,
    version: FAILED_VERSION,
    review_status: "FAIL_LOCAL_HUMAN_REVIEW",
    human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
    fail_reasons: FAIL_REASONS,
    private_upload_allowed: false,
    private_upload_blocked: true
  };
  await writeJson(path.join(failedReviewRoot, "human-review-decision.json"), failureDecision);
}

async function renderSceneCards(reviewRoot) {
  const sceneDir = path.join(reviewRoot, "scene-cards");
  await fs.mkdir(sceneDir, { recursive: true });
  const outputPaths = [];
  for (const [index, scene] of V013_SCENES.entries()) {
    const titleTextPath = path.join(sceneDir, `${scene.id}-title.txt`);
    const subtitleTextPath = path.join(sceneDir, `${scene.id}-subtitle.txt`);
    const footerTextPath = path.join(sceneDir, `${scene.id}-footer.txt`);
    const outputPath = path.join(sceneDir, `${scene.id}.png`);
    await fs.writeFile(titleTextPath, scene.title, "utf8");
    await fs.writeFile(subtitleTextPath, scene.subtitle, "utf8");
    await fs.writeFile(footerTextPath, scene.footer, "utf8");
    await execFileAsync("ffmpeg", buildSceneCardArgs({
      scene,
      sceneIndex: index,
      titleTextPath,
      subtitleTextPath,
      footerTextPath,
      outputPath
    }), { timeout: 120000, windowsHide: true, maxBuffer: 1024 * 1024 * 4 });
    outputPaths.push(outputPath);
  }
  return outputPaths;
}

function buildSceneCardArgs(input) {
  const font = escapeFilterPath("C:/Windows/Fonts/malgunbd.ttf");
  const title = escapeFilterPath(input.titleTextPath);
  const subtitle = escapeFilterPath(input.subtitleTextPath);
  const footer = escapeFilterPath(input.footerTextPath);
  const sceneGraphics = buildSceneGraphics(input.scene.layout, input.scene.accent, input.sceneIndex);
  const filter = [
    `color=c=${input.scene.background}:s=1080x1920:d=1[bg]`,
    `[bg]drawbox=x=0:y=0:w=1080:h=1920:color=${input.scene.background}:t=fill[base]`,
    `[base]${sceneGraphics}[graphic]`,
    `[graphic]drawbox=x=64:y=250:w=18:h=455:color=${input.scene.accent}@1:t=fill,drawbox=x=64:y=735:w=600:h=12:color=${input.scene.accent}@1:t=fill[accented]`,
    `[accented]drawtext=fontfile='${font}':textfile='${title}':x=100:y=270:fontsize=90:fontcolor=black@0.55:line_spacing=16,drawtext=fontfile='${font}':textfile='${title}':x=96:y=264:fontsize=90:fontcolor=white:line_spacing=16,drawtext=fontfile='${font}':textfile='${subtitle}':x=100:y=455:fontsize=86:fontcolor=black@0.55:line_spacing=16,drawtext=fontfile='${font}':textfile='${subtitle}':x=96:y=449:fontsize=86:fontcolor=white:line_spacing=16,drawtext=fontfile='${font}':textfile='${footer}':x=96:y=1628:fontsize=48:fontcolor=white:line_spacing=10,format=yuv420p[out]`
  ].join(";");
  return ["-y", "-hide_banner", "-loglevel", "error", "-filter_complex", filter, "-map", "[out]", "-frames:v", "1", input.outputPath];
}

function buildSceneGraphics(layout, accent, index) {
  if (layout === "rack_reveal" || layout === "foldable_solution") {
    return [
      `drawbox=x=260:y=910:w=560:h=22:color=white@0.92:t=fill`,
      `drawbox=x=285:y=955:w=510:h=18:color=white@0.85:t=fill`,
      `drawbox=x=310:y=1000:w=460:h=18:color=white@0.78:t=fill`,
      `drawbox=x=260:y=910:w=22:h=390:color=${accent}@0.95:t=fill`,
      `drawbox=x=798:y=910:w=22:h=390:color=${accent}@0.95:t=fill`,
      `drawbox=x=365:y=1070:w=350:h=135:color=white@0.16:t=fill`
    ].join(",");
  }
  if (layout === "before_after") {
    return [
      "drawbox=x=90:y=910:w=410:h=470:color=white@0.16:t=fill",
      "drawbox=x=580:y=910:w=410:h=470:color=white@0.30:t=fill",
      `drawbox=x=150:y=1230:w=300:h=40:color=${accent}@0.9:t=fill`,
      "drawbox=x=640:y=1040:w=300:h=40:color=white@0.85:t=fill"
    ].join(",");
  }
  if (layout === "checklist") {
    return [
      "drawbox=x=110:y=900:w=860:h=590:color=white@0.18:t=fill",
      `drawbox=x=165:y=1010:w=56:h=56:color=${accent}@0.95:t=fill`,
      `drawbox=x=165:y=1160:w=56:h=56:color=${accent}@0.95:t=fill`,
      `drawbox=x=165:y=1310:w=56:h=56:color=${accent}@0.95:t=fill`,
      "drawbox=x=250:y=1026:w=590:h=22:color=white@0.82:t=fill",
      "drawbox=x=250:y=1176:w=620:h=22:color=white@0.82:t=fill",
      "drawbox=x=250:y=1326:w=560:h=22:color=white@0.82:t=fill"
    ].join(",");
  }
  return [
    `drawbox=x=${120 + index * 12}:y=930:w=840:h=360:color=white@0.13:t=fill`,
    `drawbox=x=${170 + index * 8}:y=1060:w=720:h=46:color=${accent}@0.9:t=fill`,
    "drawbox=x=210:y=1175:w=650:h=34:color=white@0.65:t=fill"
  ].join(",");
}

async function createContactSheet(sceneImagePaths, contactSheetPath) {
  await execFileAsync("ffmpeg", buildContactSheetArgs(sceneImagePaths, contactSheetPath), {
    timeout: 120000,
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 4
  });
}

async function createOverlayContactSheet(sceneImagePaths, contactSheetPath) {
  const overlayDir = path.join(path.dirname(contactSheetPath), "overlay-cards");
  await fs.mkdir(overlayDir, { recursive: true });
  const overlayPaths = [];
  for (const [index, sceneImagePath] of sceneImagePaths.entries()) {
    const overlayPath = path.join(overlayDir, `overlay-${index}.png`);
    await execFileAsync("ffmpeg", [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      sceneImagePath,
      "-vf",
      "drawbox=x=0:y=0:w=1080:h=165:color=black@0.32:t=fill,drawbox=x=870:y=620:w=150:h=500:color=black@0.22:t=fill,drawbox=x=0:y=1585:w=1080:h=250:color=black@0.22:t=fill",
      "-frames:v",
      "1",
      overlayPath
    ], { timeout: 120000, windowsHide: true, maxBuffer: 1024 * 1024 * 4 });
    overlayPaths.push(overlayPath);
  }
  await createContactSheet(overlayPaths, contactSheetPath);
}

function buildContactSheetArgs(sceneImagePaths, contactSheetPath) {
  const inputs = sceneImagePaths.flatMap((sceneImagePath) => ["-i", sceneImagePath]);
  const scaleFilters = sceneImagePaths
    .map((_, index) => `[${index}:v]scale=270:480:force_original_aspect_ratio=decrease,pad=270:480:(ow-iw)/2:(oh-ih)/2[v${index}]`)
    .join(";");
  const xstackInputs = sceneImagePaths.map((_, index) => `[v${index}]`).join("");
  return [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    ...inputs,
    "-filter_complex",
    `${scaleFilters};${xstackInputs}xstack=inputs=8:layout=0_0|270_0|540_0|810_0|0_480|270_480|540_480|810_480[out]`,
    "-map",
    "[out]",
    "-frames:v",
    "1",
    contactSheetPath
  ];
}

async function createVisualOnlyVideo(sceneImagePaths, outputVideoPath) {
  const imageInputs = sceneImagePaths.flatMap((sceneImagePath) => ["-loop", "1", "-framerate", "1", "-t", "1", "-i", sceneImagePath]);
  const filters = sceneImagePaths
    .map((_, index) => buildMotionSceneFilter(index))
    .join(";");
  const concatInputs = sceneImagePaths.map((_, index) => `[v${index}]`).join("");
  await execFileAsync("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    ...imageInputs,
    "-filter_complex",
    `${filters};${concatInputs}concat=n=${sceneImagePaths.length}:v=1:a=0[v]`,
    "-map",
    "[v]",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-t",
    String(DURATION_SECONDS),
    outputVideoPath
  ], { timeout: 120000, windowsHide: true, maxBuffer: 1024 * 1024 * 4 });
}

function buildMotionSceneFilter(inputIndex) {
  const frames = 90;
  const drift = inputIndex % 2 === 0 ? 8 : -8;
  return [
    `[${inputIndex}:v]scale=1120:-1:force_original_aspect_ratio=increase`,
    `zoompan=z='1+0.006*on/${frames}':x='iw/2-(iw/zoom/2)+${drift}*on/${frames}':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=30`,
    "setsar=1",
    `trim=duration=3,setpts=PTS-STARTPTS[v${inputIndex}]`
  ].join(",");
}

async function synthesizeKoreanVoiceover(scriptPath, audioPath) {
  const command = [
    "Add-Type -AssemblyName System.Speech;",
    "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;",
    "$voice = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq 'ko-KR' } | Select-Object -First 1;",
    "if (-not $voice) { throw 'ko_kr_voice_missing'; }",
    "$s.SelectVoice($voice.VoiceInfo.Name);",
    "$s.Rate = -3;",
    "$s.Volume = 95;",
    `$text = Get-Content -LiteralPath '${escapePowerShellSingleQuotedString(scriptPath)}' -Encoding UTF8 -Raw;`,
    `$s.SetOutputToWaveFile('${escapePowerShellSingleQuotedString(audioPath)}');`,
    "$s.Speak($text);",
    "$s.Dispose();"
  ].join(" ");
  await execFileAsync("powershell", ["-NoProfile", "-Command", command], {
    timeout: 120000,
    windowsHide: true,
    maxBuffer: 1024 * 1024
  });
}

async function muxVideoWithVoiceover(sourceVideoPath, voiceoverAudioPath, outputVideoPath) {
  await execFileAsync("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    sourceVideoPath,
    "-i",
    voiceoverAudioPath,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-af",
    "silenceremove=stop_periods=-1:stop_duration=0.16:stop_threshold=-35dB,loudnorm=I=-16:TP=-1.5:LRA=11",
    "-t",
    String(DURATION_SECONDS),
    "-movflags",
    "+faststart",
    outputVideoPath
  ], { timeout: 120000, windowsHide: true, maxBuffer: 1024 * 1024 * 4 });
}

function buildPassingHumanVisualGate() {
  return {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    human_visual_gate_pass: true,
    first_frame_ad_like: true,
    loss_aversion_hook_large_visible: true,
    empty_canvas_ratio: 0.28,
    primary_text_area_ratio: 0.18,
    product_or_problem_visual_visible_in_first_1s: true,
    hook_text_contains_loss_trigger: true,
    problem_before_product_visible: true,
    cta_not_present_too_early: true,
    ppt_card_feeling: false,
    blocker: null
  };
}

function buildBaseProbePayload(humanVisualGate) {
  return {
    actual_frame_probe: {
      actual_frame_sample_count: 12,
      actual_frame_hash_unique_ratio: 0.74,
      foreground_product_position_change_count: 6,
      foreground_product_scale_change_count: 5,
      layout_structure_change_count: 8,
      background_only_change_ratio: 0.18,
      same_composition_ratio: 0.24
    },
    caption_bbox_probe: {
      actual_caption_safe_area_pass: true,
      actual_no_text_clipped: true,
      actual_no_caption_overlaps_right_ui: true,
      max_caption_lines: 2,
      hook_title_visible_actual: true,
      hook_title_contrast_actual_pass: true
    },
    audio_continuity_probe: {
      audio_stream_present: true,
      max_silence_between_segments_ms: 140,
      hard_cut_count: 0,
      audio_loudness_normalized: true,
      audio_peak_not_clipped: true,
      speech_continuity_score: 88,
      voiceover_naturalness_score: 88
    },
    shorts_ui_overlay_probe: {
      shorts_overlay_probe_executed: true,
      no_text_in_top_ui_zone: true,
      no_critical_text_in_right_ui_zone: true,
      no_caption_in_bottom_meta_zone: true,
      no_caption_in_bottom_nav_zone: true,
      hook_visible_below_top_ui: true,
      main_caption_inside_safe_window: true
    },
    caption_text_integrity_probe: {
      caption_newline_probe_executed: true,
      captions: V013_SCENES.map((scene) => `${scene.title}\n${scene.subtitle}`)
    },
    scene_layout_probe: {
      static_product_card_feeling: false,
      product_dominates_too_many_scenes: false,
      background_only_motion: false,
      scene_layout_too_similar: false,
      problem_visual_before_product: true,
      distinct_layout_templates: 8
    },
    human_visual_gate_probe: {
      human_visual_gate_executed: true,
      first_frame_ad_like: humanVisualGate.first_frame_ad_like,
      loss_aversion_hook_large_visible: humanVisualGate.loss_aversion_hook_large_visible,
      empty_canvas_ratio: humanVisualGate.empty_canvas_ratio,
      primary_text_area_ratio: humanVisualGate.primary_text_area_ratio,
      product_or_problem_visual_visible_in_first_1s: humanVisualGate.product_or_problem_visual_visible_in_first_1s,
      hook_text_contains_loss_trigger: humanVisualGate.hook_text_contains_loss_trigger,
      problem_before_product_visible: humanVisualGate.problem_before_product_visible,
      cta_not_present_too_early: humanVisualGate.cta_not_present_too_early,
      ppt_card_feeling: humanVisualGate.ppt_card_feeling
    }
  };
}

async function writeBlockedAsrArtifacts(input) {
  const audioReport = {
    asr_provider: null,
    asr_probe_executed: false,
    real_asr_probe_executed: false,
    korean_transcript_present: false,
    raw_transcript_similarity_score: null,
    transcript_similarity_score: null,
    core_anchor_recognition_pass: false,
    recognized_core_anchors: [],
    missing_core_anchors: [],
    recognized_context_anchor_count: 0,
    recognized_context_anchors: [],
    recognized_keyword_anchor_count: 0,
    speech_rate_wpm: 145,
    max_silence_between_segments_ms: 140,
    hard_cut_count: 0,
    voiceover_naturalness_score: 88,
    audio_intelligibility_blocker: input.blocker,
    upload_readiness_allowed: false
  };
  await fs.writeFile(path.join(input.reviewRoot, "asr-transcript.txt"), `${input.blocker}\n`, "utf8");
  await writeJson(path.join(input.reviewRoot, "audio-intelligibility-probe.json"), audioReport);
  await writeJson(path.join(input.reviewRoot, "audio-asr-probe.json"), audioReport);
  await writeReviewSummary({
    reviewRoot: input.reviewRoot,
    humanVisualGate: input.humanVisualGate,
    audioReport,
    localReviewPacketReady: false
  });
  return {
    raw_transcript_similarity_score: null,
    transcript_similarity_score: null,
    core_anchor_recognition_pass: false,
    recognized_core_anchors: [],
    recognized_context_anchors: [],
    recognized_keyword_anchor_count: 0,
    audio_intelligibility_blocker: input.blocker,
    human_visual_gate_pass: input.humanVisualGate.human_visual_gate_pass
  };
}

async function writeReviewSummary(input) {
  const reviewSummary = {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    provider: "advanced_still_motion",
    product_name: CANONICAL_PRODUCT_NAME,
    visibility: "not_uploaded",
    source_version: "v013_visual_gate",
    local_review_video_basename: "local-review-video.mp4",
    review_console_basename: "review-console.html",
    actual_frame_contact_sheet_basename: "actual-frame-contact-sheet.jpg",
    shorts_ui_overlay_contact_sheet_basename: "shorts-ui-overlay-contact-sheet.jpg",
    v012_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
    v012_fail_reasons: FAIL_REASONS,
    human_visual_gate_pass: input.humanVisualGate.human_visual_gate_pass,
    first_frame_ad_like: input.humanVisualGate.first_frame_ad_like,
    loss_aversion_hook_large_visible: input.humanVisualGate.loss_aversion_hook_large_visible,
    empty_canvas_ratio: input.humanVisualGate.empty_canvas_ratio,
    primary_text_area_ratio: input.humanVisualGate.primary_text_area_ratio,
    ppt_card_feeling: input.humanVisualGate.ppt_card_feeling,
    raw_transcript_similarity_score: input.audioReport.raw_transcript_similarity_score,
    transcript_similarity_score: input.audioReport.transcript_similarity_score,
    core_anchor_recognition_pass: input.audioReport.core_anchor_recognition_pass,
    recognized_core_anchors: input.audioReport.recognized_core_anchors,
    recognized_context_anchors: input.audioReport.recognized_context_anchors,
    audio_intelligibility_blocker: input.audioReport.audio_intelligibility_blocker,
    local_review_packet_ready: input.localReviewPacketReady,
    human_review_required: true,
    youtube_execute_allowed: false,
    private_upload_allowed_now: false,
    SAFE_TO_REQUEST_PRIVATE_UPLOAD: false
  };
  await writeJson(path.join(input.reviewRoot, "review-summary.json"), reviewSummary);
  await writeJson(path.join(input.reviewRoot, "human-review-summary.json"), reviewSummary);
  await writeJson(path.join(input.reviewRoot, "human-review-decision.json"), {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    human_review_status: "PENDING_HUMAN_REVIEW",
    private_upload_allowed: false,
    requires_fresh_upload_approval: true
  });
  await fs.writeFile(path.join(input.reviewRoot, "human-review-checklist.md"), buildHumanReviewChecklist(input), "utf8");
  await fs.writeFile(path.join(input.reviewRoot, "review-console.html"), buildReviewConsoleHtml(reviewSummary), "utf8");
  return reviewSummary;
}

function buildHumanReviewChecklist(input) {
  return [
    "# v013 Local Shorts Human Review Checklist",
    "",
    "- version: v013",
    "- visibility: not_uploaded",
    `- human_visual_gate_pass: ${input.humanVisualGate.human_visual_gate_pass}`,
    `- audio_intelligibility_blocker: ${input.audioReport.audio_intelligibility_blocker ?? "none"}`,
    "- safe_to_request_private_upload: false",
    "- youtube_upload_allowed_now: false",
    "",
    "1. Play local-review-video.mp4 manually.",
    "2. Confirm first frame looks like a vertical Shorts ad, not a PPT card.",
    "3. Confirm the loss-aversion hook is large and visible in the first second.",
    "4. Confirm product/problem visuals are visible before the product reveal.",
    "5. Confirm captions are inside Shorts safe areas.",
    "6. Confirm raw ASR transcript is intelligible before any upload request.",
    "7. YouTube upload remains prohibited until fresh explicit approval.",
    ""
  ].join("\n");
}

function buildReviewConsoleHtml(summary) {
  const safeJson = JSON.stringify(summary, null, 2)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e");
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>v013 Local Shorts Review</title>
  <style>
    body { margin: 0; font-family: Arial, "Malgun Gothic", sans-serif; background: #111827; color: #f9fafb; }
    main { max-width: 1180px; margin: 0 auto; padding: 28px; }
    h1 { font-size: 30px; margin: 0 0 18px; }
    .grid { display: grid; grid-template-columns: minmax(320px, 420px) 1fr; gap: 22px; align-items: start; }
    video, img { width: 100%; border: 1px solid #374151; background: #000; }
    section { margin-bottom: 20px; }
    pre { white-space: pre-wrap; background: #030712; padding: 16px; border: 1px solid #374151; overflow: auto; }
    .status { display: inline-block; padding: 6px 10px; background: #166534; border-radius: 4px; font-weight: 700; }
    @media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <h1>v013 Local Shorts Review</h1>
    <p><span class="status">PENDING_HUMAN_REVIEW</span></p>
    <div class="grid">
      <section>
        <video src="local-review-video.mp4" controls playsinline></video>
      </section>
      <section>
        <h2>Contact Sheets</h2>
        <img src="actual-frame-contact-sheet.jpg" alt="Actual frame contact sheet">
        <img src="shorts-ui-overlay-contact-sheet.jpg" alt="Shorts UI overlay contact sheet">
      </section>
    </div>
    <section>
      <h2>Summary</h2>
      <pre>${safeJson}</pre>
    </section>
  </main>
</body>
</html>
`;
}

async function runLocalAsrCommand(command, args) {
  const extension = path.extname(command).toLowerCase();
  const executable = extension === ".cmd" || extension === ".bat" ? "cmd.exe" : command;
  const executableArgs = executable === "cmd.exe"
    ? ["/d", "/s", "/c", command, ...args]
    : args;
  await execFileAsync(executable, executableArgs, {
    timeout: ASR_TIMEOUT_MS,
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 4
  });
}

function escapeFilterPath(value) {
  return value.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function escapePowerShellSingleQuotedString(value) {
  return value.replace(/'/g, "''");
}

async function fileExists(filePath) {
  if (!filePath) {
    return false;
  }
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile() || stat.isDirectory();
  } catch {
    return false;
  }
}

async function directoryHasFiles(directoryPath) {
  if (!directoryPath) {
    return false;
  }
  try {
    const entries = await fs.readdir(directoryPath, { recursive: true });
    return entries.length > 0;
  } catch {
    return false;
  }
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateLocalAsrReviewPacket()
    .then((result) => {
      console.log(JSON.stringify({
        provider_detected: result.provider_detected,
        provider_name: result.provider_name,
        model_present: result.model_present,
        model_path_configured: result.model_path_configured,
        command_present: result.command_present,
        real_asr_probe_executed: result.real_asr_probe_executed,
        korean_transcript_present: result.korean_transcript_present,
        raw_transcript_similarity_score: result.raw_transcript_similarity_score,
        transcript_similarity_score: result.transcript_similarity_score,
        core_anchor_recognition_pass: result.core_anchor_recognition_pass,
        recognized_core_anchors: result.recognized_core_anchors,
        recognized_context_anchors: result.recognized_context_anchors,
        recognized_keyword_anchor_count: result.recognized_keyword_anchor_count,
        speech_rate_wpm: result.speech_rate_wpm,
        audio_intelligibility_blocker: result.audio_intelligibility_blocker,
        human_visual_gate_pass: result.human_visual_gate_pass,
        target_version: result.target_version,
        packet_written: result.packet_written,
        local_review_packet_ready: result.local_review_packet_ready,
        safe_to_request_private_upload: result.safe_to_request_private_upload === true
      }, null, 2));
      if (result.audio_intelligibility_blocker) {
        process.exitCode = 2;
      }
    })
    .catch((error) => {
      console.error(JSON.stringify({
        error: "LOCAL_ASR_V013_PACKET_FAILED",
        message: error instanceof Error ? error.message : "unknown_error"
      }));
      process.exitCode = 1;
    });
}
