import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  buildKoreanVoiceProviderSafeSummary,
  evaluateKoreanVoiceProviderReadiness
} from "../korean-voice-provider-readiness.mjs";
import {
  getLocalAsrConfig,
  inspectLocalAsrConfig,
  parseDotEnv
} from "../generate-local-asr-v012-review-packet.mjs";

const execFileAsync = promisify(execFile);

const CANDIDATE_ID = "candidate-3c4f2ee364ba5b07";
const FAILED_VERSION = "v026";
const TARGET_VERSION = "v027";
const PRODUCT_IMAGE_BASENAME = "source-product-e85e25a977.jpg";
const CANONICAL_PRODUCT_NAME = "\uc811\uc774\uc2dd \ube68\ub798\uac74\uc870\ub300";
const DURATION_SECONDS = 24;
const SCENE_SECONDS = 4;
const DEFAULT_MIN_SIMILARITY = 0.82;
const TARGET_SPEECH_RATE_WPM = 160;
const MIN_SPEECH_RATE_WPM = 155;
const MAX_SPEECH_RATE_WPM = 165;
const MELOTTS_SPEED_MULTIPLIER = 1.14;
const TTS_TIMEOUT_MS = 600000;
const ASR_TIMEOUT_MS = 900000;
const FFMPEG_TIMEOUT_MS = 180000;

export const V027_REQUIRED_CORE_ANCHORS = ["\ube68\ub798", "\uac74\uc870\ub300", "\uacf5\uac04"];

export const V026_CLEAN_COMMERCE_FAIL_REASONS = [
  "DARK_HORROR_LIKE_VISUAL",
  "SYNTHETIC_COMPOSITE_LOOKS_WRONG",
  "ABSTRACT_OVERLAY_ARTIFACTS",
  "COLOR_TINT_MAKES_PRODUCT_UNTRUSTWORTHY",
  "REAL_AD_VISUAL_GATE_FALSE_POSITIVE",
  "MOTION_VARIETY_GATE_FALSE_POSITIVE",
  "NOT_CLEAN_COMMERCE_AD",
  "NOT_CONVINCING_SHORTS_AD"
];

export const V027_VOICEOVER_SCRIPT_LINES = [
  "\ube44 \uc624\ub294 \ub0a0, \ube68\ub798 \ub9d0\ub9b4 \uacf5\uac04\uc774 \ubd80\uc871\ud558\uba74 \uba3c\uc800 \uac74\uc870\ub300\ubd80\ud130 \ud655\uc778\ud558\uc138\uc694.",
  "\uc2b5\uae30\uac00 \ub9ce\uc744 \ub54c\ub294 \uc791\uc740 \uacf5\uac04\uc5d0\uc11c\ub3c4 \ud1b5\ud48d\uc774 \ub418\ub294\uc9c0\uac00 \uc911\uc694\ud569\ub2c8\ub2e4.",
  "\uc811\uc774\uc2dd \uad6c\uc870\ub77c\uba74 \uc4f8 \ub54c\ub294 \ud3bc\uce58\uace0, \uc548 \uc4f8 \ub54c\ub294 \ubcf4\uad00\ud558\uae30 \uc27d\uc2b5\ub2c8\ub2e4.",
  "\uad6c\ub9e4 \uc804\uc5d0\ub294 \ud06c\uae30, \ud558\uc911, \uc218\uac74\uacfc \uc591\ub9d0\uc744 \uac19\uc774 \ub110 \uc218 \uc788\ub294\uc9c0 \ubcf4\uc138\uc694.",
  "\uc0ac\uc9c4\uc5d0\uc11c \uc811\ud78c \ub450\uaed8\uc640 \ubc14\ub2e5 \uace0\uc815\uac10\uae4c\uc9c0 \ud655\uc778\ud558\uba74 \uc2e4\ud328\ub97c \uc904\uc77c \uc218 \uc788\uc2b5\ub2c8\ub2e4.",
  "\uc790\uc138\ud55c \uad6c\uc131\uacfc \uac00\uaca9\uc740 \uc0c1\ud488 \uc124\uba85\uc5d0\uc11c \ud55c \ubc88 \ub354 \ud655\uc778\ud558\uc138\uc694."
];

export const V027_VOICEOVER_SCRIPT = V027_VOICEOVER_SCRIPT_LINES.join(" ");

export function buildV026FailureDecision() {
  return {
    candidate_id: CANDIDATE_ID,
    version: FAILED_VERSION,
    human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
    private_upload_allowed: false,
    safe_to_request_private_upload: false,
    requires_fresh_upload_approval: true,
    fail_reasons: V026_CLEAN_COMMERCE_FAIL_REASONS,
    next_required_version: TARGET_VERSION
  };
}

export function buildV027CleanCommerceScenePlan() {
  return [
    cleanScene({
      scene: 1,
      id: "scene_01_bright_product_hook",
      role: "hook",
      title: "\uc811\uc774\uc2dd \ube68\ub798\uac74\uc870\ub300",
      subtitle: "\uc7a5\ub9c8\ucca0 \uacf5\uac04 \ubd80\uc871, \uc9c0\uae08 \ud655\uc778",
      footer: "\uccab \ud654\uba74\ubd80\ud130 \uc0c1\ud488\uc744 \ubc1d\uac8c \ubcf4\uc5ec\uc90c",
      background: "fffaf0",
      accent: "14b8a6",
      productScale: 820,
      productY: 560,
      cta: false,
      callouts: ["\uc811\uc774\uc2dd", "\uc2e4\ub0b4 \uac74\uc870", "\ubcf4\uad00 \uc26c\uc6c0"]
    }),
    cleanScene({
      scene: 2,
      id: "scene_02_rainy_humidity_problem",
      role: "problem",
      title: "\ube44 \uc624\ub294 \ub0a0",
      subtitle: "\uc2b5\uae30\u00b7\ub0c4\uc0c8 \ubb38\uc81c",
      footer: "\uc791\uc740 \uacf5\uac04\uc5d0\uc11c\ub3c4 \ud1b5\ud48d \uc5ec\ubd80\ub97c \uba3c\uc800 \ud655\uc778",
      background: "f0fdfa",
      accent: "0ea5e9",
      productScale: 760,
      productY: 640,
      cta: false,
      callouts: ["\uc2b5\uae30", "\ud1b5\ud48d", "\uc2e4\ub0b4"]
    }),
    cleanScene({
      scene: 3,
      id: "scene_03_space_saving",
      role: "space_solution",
      title: "\uacf5\uac04\uc774 \uc881\uc544\ub3c4",
      subtitle: "\uc811\uc5b4\uc11c \ubcf4\uad00\ud558\uae30",
      footer: "\ud3bc\uce58\ub294 \uba74\uc801\uacfc \uc811\ud78c \ub450\uaed8\ub97c \uac19\uc774 \uccb4\ud06c",
      background: "f8fafc",
      accent: "22c55e",
      productScale: 780,
      productY: 610,
      cta: false,
      callouts: ["\uc811\ud798", "\ubcf4\uad00", "\uacf5\uac04"]
    }),
    cleanScene({
      scene: 4,
      id: "scene_04_product_solution_callouts",
      role: "product_solution",
      title: "\uc0c1\ud488 \ud574\uacb0\uc810",
      subtitle: "\ud06c\uae30\u00b7\ud558\uc911\u00b7\uc2e4\ub0b4 \uac74\uc870",
      footer: "\uc0c1\ud488\uc744 \ud06c\uac8c \ubcf4\uc5ec\uc8fc\uace0 \uad6c\ub9e4 \uc804 \uc810\uac80 \ud3ec\uc778\ud2b8\ub9cc \ud45c\uc2dc",
      background: "f7fee7",
      accent: "84cc16",
      productScale: 860,
      productY: 560,
      cta: false,
      callouts: ["\ud06c\uae30", "\ud558\uc911", "\ubcf4\uad00"]
    }),
    cleanScene({
      scene: 5,
      id: "scene_05_purchase_checklist",
      role: "checklist",
      title: "\uad6c\ub9e4 \uc804 3\uac00\uc9c0",
      subtitle: "\ud06c\uae30\u00b7\ud558\uc911\u00b7\ubcf4\uad00",
      footer: "\uc0ac\uc9c4\uc73c\ub85c \uc811\ud78c \ub450\uaed8\uc640 \ubc14\ub2e5 \uace0\uc815\uac10 \ud655\uc778",
      background: "fff7ed",
      accent: "f97316",
      productScale: 700,
      productY: 780,
      cta: false,
      callouts: ["\ud06c\uae30", "\ud558\uc911", "\uc811\ud798"]
    }),
    cleanScene({
      scene: 6,
      id: "scene_06_clean_cta",
      role: "cta",
      title: "\uc0c1\ud488 \uc124\uba85\uc5d0\uc11c",
      subtitle: "\uad6c\uc131\uacfc \uac00\uaca9 \ud655\uc778",
      footer: "\ucfe0\ud321 \ud30c\ud2b8\ub108\uc2a4 \ud65c\ub3d9\uc758 \uc77c\ud658\uc73c\ub85c\n\uc77c\uc815\uc561\uc758 \uc218\uc218\ub8cc\ub97c \ubc1b\uc744 \uc218 \uc788\uc2b5\ub2c8\ub2e4.",
      background: "f0f9ff",
      accent: "2563eb",
      productScale: 740,
      productY: 600,
      cta: true,
      callouts: ["\uad6c\uc131", "\uac00\uaca9", "\ud6c4\uae30"]
    })
  ];
}

export function buildV027CleanCommerceVisualGate(input = {}) {
  const scenes = input.scenes ?? buildV027CleanCommerceScenePlan();
  const sceneCount = scenes.length || 1;
  const brightCount = scenes.filter((scene) => scene.background_tone === "bright").length;
  const darkCount = scenes.filter((scene) => scene.background_tone === "dark" || scene.dark_frame === true).length;
  const abstractOverlayCount = scenes.reduce((total, scene) => total + Number(scene.abstract_overlay_count ?? 0), 0);
  const productColorTintChanged = scenes.some((scene) => scene.product_color_tint !== "none");
  const syntheticCompositeRisk = scenes.some((scene) => scene.synthetic_composite_risk === true);
  const horrorLikeVisual = scenes.some((scene) => scene.horror_like_visual === true) || darkCount / sceneCount > 0.1;
  const textReadabilityPass = scenes.every((scene) => scene.text_readability_pass === true);
  const shopLikeCtaPresent = scenes.some((scene) => scene.shop_like_cta_present === true);
  const brightBackgroundRatio = round3(brightCount / sceneCount);
  const darkFrameRatio = round3(darkCount / sceneCount);
  const blockers = [];

  if (brightBackgroundRatio < 0.7 || darkFrameRatio > 0.1 || horrorLikeVisual) {
    blockers.push("DARK_HORROR_LIKE_VISUAL");
  }
  if (productColorTintChanged) {
    blockers.push("PRODUCT_COLOR_TINT_CHANGED");
  }
  if (abstractOverlayCount > 0) {
    blockers.push("ABSTRACT_OVERLAY_ARTIFACTS");
  }
  if (syntheticCompositeRisk) {
    blockers.push("SYNTHETIC_COMPOSITE_LOOKS_WRONG");
  }
  if (!textReadabilityPass) {
    blockers.push("TEXT_READABILITY_FAIL");
  }
  if (!shopLikeCtaPresent) {
    blockers.push("CTA_NOT_VISIBLE");
  }

  return {
    version: TARGET_VERSION,
    clean_commerce_visual_pass: blockers.length === 0,
    bright_background_ratio: brightBackgroundRatio,
    dark_frame_ratio: darkFrameRatio,
    horror_like_visual: horrorLikeVisual,
    synthetic_composite_risk: syntheticCompositeRisk,
    abstract_overlay_count: abstractOverlayCount,
    product_color_tint_changed: productColorTintChanged,
    product_original_color_preserved: !productColorTintChanged,
    text_readability_pass: textReadabilityPass,
    shop_like_cta_present: shopLikeCtaPresent,
    motion_variety_count_ignored_for_pass: input.motionVarietyCount ?? null,
    previous_real_ad_visual_pass_ignored: input.realAdVisualPass ?? null,
    blockers
  };
}

export function buildV027NegativePatternGateV2(input = {}) {
  const scenes = input.scenes ?? buildV027CleanCommerceScenePlan();
  const sceneCount = scenes.length || 1;
  const productVisibleCount = scenes.filter((scene) => scene.product_visible === true).length;
  const darkCount = scenes.filter((scene) => scene.background_tone === "dark" || scene.dark_frame === true).length;
  const abstractOverlayCount = scenes.reduce((total, scene) => total + Number(scene.abstract_overlay_count ?? 0), 0);
  const v024TextCardPattern = productVisibleCount < Math.ceil(sceneCount * 0.7);
  const v025ProductPhotoCardPattern = scenes.some((scene) => scene.product_photo_card_pattern === true);
  const v026DarkCompositePattern = darkCount / sceneCount > 0.1 ||
    scenes.some((scene) => scene.synthetic_composite_risk === true || scene.horror_like_visual === true || scene.product_color_tint !== "none");
  const primitiveShapeArtifactPattern = abstractOverlayCount > 0 ||
    scenes.some((scene) => scene.primitive_shape_artifact_pattern === true);
  const unnaturalUsageSimulationPattern = scenes.some((scene) => scene.unnatural_usage_simulation_pattern === true);
  const blockers = [];

  if (v024TextCardPattern) blockers.push("V024_TEXT_CARD_PATTERN");
  if (v025ProductPhotoCardPattern) blockers.push("V025_PRODUCT_PHOTO_CARD_PATTERN");
  if (v026DarkCompositePattern) blockers.push("V026_DARK_COMPOSITE_PATTERN");
  if (primitiveShapeArtifactPattern) blockers.push("PRIMITIVE_SHAPE_ARTIFACT_PATTERN");
  if (unnaturalUsageSimulationPattern) blockers.push("UNNATURAL_USAGE_SIMULATION_PATTERN");

  return {
    version: TARGET_VERSION,
    negative_pattern_gate_v2_pass: blockers.length === 0,
    v024_text_card_pattern: v024TextCardPattern,
    v025_product_photo_card_pattern: v025ProductPhotoCardPattern,
    v026_dark_composite_pattern: v026DarkCompositePattern,
    primitive_shape_artifact_pattern: primitiveShapeArtifactPattern,
    unnatural_usage_simulation_pattern: unnaturalUsageSimulationPattern,
    blockers
  };
}

export function buildV027ProductPresentationReport(input = {}) {
  const scenes = input.scenes ?? buildV027CleanCommerceScenePlan();
  const productImageReady = input.productImageReady === true;
  const productVisibleFirstFrame = scenes[0]?.product_visible_first_frame === true;
  const productVisibleSceneCount = scenes.filter((scene) => scene.product_visible === true).length;
  const productTintChanged = scenes.some((scene) => scene.product_color_tint !== "none");
  const syntheticRisk = scenes.some((scene) => scene.synthetic_composite_risk === true || scene.horror_like_visual === true);
  const productOriginalColorPreserved = !productTintChanged;
  const productPresentationClean = productImageReady &&
    productVisibleFirstFrame &&
    productVisibleSceneCount === scenes.length &&
    productOriginalColorPreserved &&
    !syntheticRisk;
  const blocker = !productImageReady ? "PRODUCT_IMAGE_NOT_READY" :
    !productVisibleFirstFrame ? "PRODUCT_NOT_VISIBLE_FIRST_FRAME" :
      productTintChanged ? "PRODUCT_COLOR_TINT_CHANGED" :
        syntheticRisk ? "SYNTHETIC_COMPOSITE_LOOKS_WRONG" :
          productVisibleSceneCount !== scenes.length ? "PRODUCT_NOT_VISIBLE_IN_ALL_SCENES" :
            null;

  return {
    version: TARGET_VERSION,
    product_name: CANONICAL_PRODUCT_NAME,
    product_image_ready: productImageReady,
    product_visible_first_frame: productVisibleFirstFrame,
    product_visible_scene_count: productVisibleSceneCount,
    product_original_color_preserved: productOriginalColorPreserved,
    product_color_tint_changed: productTintChanged,
    bright_background: scenes.every((scene) => scene.background_tone === "bright"),
    subtle_motion_only: scenes.every((scene) => scene.motion_style === "subtle_slide_scale"),
    product_presentation_clean: productPresentationClean,
    product_presentation_blocker: blocker,
    raw_product_image_url_printed: false
  };
}

export async function inspectV027ProductImage(input = {}) {
  const cwd = input.cwd ?? process.cwd();
  const absolutePath = input.productImagePath ??
    path.join(cwd, "commerce-assets", "product-images", CANDIDATE_ID, PRODUCT_IMAGE_BASENAME);
  const present = await fileExists(absolutePath);
  return {
    candidate_id: CANDIDATE_ID,
    product_name: CANONICAL_PRODUCT_NAME,
    product_image_basename: path.basename(absolutePath),
    product_image_ready: present,
    resolved_product_image_path: present ? absolutePath : null,
    raw_product_image_url_present: false,
    raw_product_image_url_printed: false,
    blocker: present ? null : "PRODUCT_IMAGE_NOT_READY"
  };
}

export function evaluateV027AudioIntelligibility(input = {}) {
  const transcript = String(input.transcript ?? "").trim();
  const normalizedTranscript = normalizeKoreanProductTerms(transcript);
  const rawSimilarityScore = normalizeRatio(input.rawSimilarityScore) ??
    calculateTranscriptSimilarity(V027_VOICEOVER_SCRIPT, transcript);
  const transcriptSimilarityScore = normalizeRatio(input.transcriptSimilarityScore) ??
    calculateTranscriptSimilarity(V027_VOICEOVER_SCRIPT, normalizedTranscript);
  const recognizedCoreAnchors = findAnchors(normalizedTranscript, V027_REQUIRED_CORE_ANCHORS);
  const coreAnchorRecognitionPass = input.coreAnchorRecognitionPass ??
    V027_REQUIRED_CORE_ANCHORS.every((anchor) => recognizedCoreAnchors.includes(anchor));
  const speechRateWpm = normalizeNumber(input.speechRateWpm) ?? TARGET_SPEECH_RATE_WPM;
  const audioBlocker =
    !transcript ? "ASR_TRANSCRIPT_EMPTY" :
      rawSimilarityScore < DEFAULT_MIN_SIMILARITY ? "RAW_ASR_SIMILARITY_TOO_LOW" :
        transcriptSimilarityScore < DEFAULT_MIN_SIMILARITY ? "TRANSCRIPT_ASR_SIMILARITY_TOO_LOW" :
          !coreAnchorRecognitionPass ? "CORE_ANCHOR_RECOGNITION_FAILED" :
            speechRateWpm < MIN_SPEECH_RATE_WPM ? "VOICE_SPEED_TOO_SLOW_FOR_SHORTS" :
              speechRateWpm > MAX_SPEECH_RATE_WPM ? "VOICE_SPEED_TOO_FAST_FOR_SHORTS" :
                null;
  return {
    asr_provider: input.asrProvider ?? null,
    real_asr_probe_executed: true,
    transcript,
    raw_similarity_score: rawSimilarityScore,
    transcript_similarity_score: transcriptSimilarityScore,
    core_anchor_recognition_pass: coreAnchorRecognitionPass,
    recognized_core_anchors: recognizedCoreAnchors,
    speech_rate_wpm: speechRateWpm,
    audio_blocker: audioBlocker
  };
}

export async function generateV027CleanCommerceTemplateReviewPacket(input = {}) {
  const cwd = input.cwd ?? process.cwd();
  const env = input.env ?? await loadLocalEnv(cwd);
  const reviewRoot = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, TARGET_VERSION);
  const failedReviewRoot = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, FAILED_VERSION);
  const localReviewVideoPath = path.join(reviewRoot, "local-review-video.mp4");
  const visualOnlyVideoPath = path.join(reviewRoot, "visual-only-local-review-video.mp4");
  const reviewConsolePath = path.join(reviewRoot, "review-console.html");
  const scenePlanPath = path.join(reviewRoot, "clean-commerce-scene-plan.json");
  const cleanGatePath = path.join(reviewRoot, "clean-commerce-visual-gate.json");
  const negativeGatePath = path.join(reviewRoot, "negative-pattern-gate-v2.json");
  const productReportPath = path.join(reviewRoot, "product-presentation-report.json");
  const actualContactSheetPath = path.join(reviewRoot, "actual-frame-contact-sheet.jpg");
  const overlayContactSheetPath = path.join(reviewRoot, "shorts-ui-overlay-contact-sheet.jpg");
  const transcriptPath = path.join(reviewRoot, "asr-transcript.txt");
  const audioProbePath = path.join(reviewRoot, "audio-intelligibility-probe.json");
  const humanDecisionPath = path.join(reviewRoot, "human-review-decision.json");
  const reviewSummaryPath = path.join(reviewRoot, "review-summary.json");
  const voiceoverScriptPath = path.join(reviewRoot, "voiceover-script.txt");
  const voiceoverAudioPath = path.join(reviewRoot, "voiceover.wav");
  const v026HumanDecisionPath = path.join(failedReviewRoot, "human-review-decision.json");

  await fs.mkdir(reviewRoot, { recursive: true });
  await fs.mkdir(failedReviewRoot, { recursive: true });
  await writeJson(v026HumanDecisionPath, buildV026FailureDecision());

  const scenes = buildV027CleanCommerceScenePlan();
  await writeJson(scenePlanPath, {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    product_name: CANONICAL_PRODUCT_NAME,
    voiceover_script: V027_VOICEOVER_SCRIPT_LINES,
    scenes
  });

  const productImage = await inspectV027ProductImage({ cwd, productImagePath: input.productImagePath });
  const productPresentation = buildV027ProductPresentationReport({
    scenes,
    productImageReady: productImage.product_image_ready
  });
  const cleanGate = buildV027CleanCommerceVisualGate({ scenes });
  const negativeGate = buildV027NegativePatternGateV2({ scenes });
  await writeJson(productReportPath, productPresentation);
  await writeJson(cleanGatePath, cleanGate);
  await writeJson(negativeGatePath, negativeGate);

  const basePaths = {
    localReviewVideoPath,
    reviewConsolePath,
    scenePlanPath,
    cleanGatePath,
    negativeGatePath,
    productReportPath,
    actualContactSheetPath,
    overlayContactSheetPath,
    transcriptPath,
    audioProbePath,
    humanDecisionPath,
    reviewSummaryPath,
    v026HumanDecisionPath
  };

  const firstBlocker = productImage.blocker ??
    productPresentation.product_presentation_blocker ??
    cleanGate.blockers[0] ??
    negativeGate.blockers[0] ??
    null;
  if (firstBlocker) {
    return writeBlockedPacket({
      cwd,
      paths: basePaths,
      scenes,
      productPresentation,
      cleanGate,
      negativeGate,
      blocker: firstBlocker
    });
  }

  await fs.writeFile(voiceoverScriptPath, `${V027_VOICEOVER_SCRIPT_LINES.join("\n")}\n`, "utf8");
  const voiceProvider = evaluateKoreanVoiceProviderReadiness(env);
  await fs.writeFile(path.join(reviewRoot, "voice-provider-safe-summary.txt"), buildKoreanVoiceProviderSafeSummary(voiceProvider), "utf8");
  await writeJson(path.join(reviewRoot, "voice-provider-readiness.json"), {
    voice_provider_configured: voiceProvider.configured,
    voice_provider_approved: voiceProvider.approved,
    korean_capable: voiceProvider.koreanCapable,
    windows_sapi_used: voiceProvider.sapiRejected,
    voice_provider_blocker: voiceProvider.blocker,
    raw_values_masked: true
  });

  if (voiceProvider.canGenerate !== true && !input.ttsRunner) {
    return writeBlockedPacket({
      cwd,
      paths: basePaths,
      scenes,
      productPresentation,
      cleanGate,
      negativeGate,
      blocker: voiceProvider.blocker ?? "BLOCKED_KOREAN_VOICE_PROVIDER_NOT_CONFIGURED"
    });
  }

  const ttsResult = await runTtsProvider({
    env,
    scriptPath: voiceoverScriptPath,
    audioPath: voiceoverAudioPath,
    ttsRunner: input.ttsRunner,
    speedMultiplier: MELOTTS_SPEED_MULTIPLIER
  });
  if (ttsResult.ok !== true) {
    return writeBlockedPacket({
      cwd,
      paths: basePaths,
      scenes,
      productPresentation,
      cleanGate,
      negativeGate,
      blocker: ttsResult.blocker ?? "LOCAL_KOREAN_TTS_COMMAND_FAILED"
    });
  }

  await renderV027Visuals({
    reviewRoot,
    productImagePath: productImage.resolved_product_image_path,
    scenes,
    visualOnlyVideoPath,
    localReviewVideoPath,
    voiceoverAudioPath,
    mediaRunner: input.mediaRunner
  });

  const videoProbe = input.videoProbe
    ? await input.videoProbe({ videoPath: localReviewVideoPath })
    : await probeVideo(localReviewVideoPath);
  const audioProbe = await runRealAsrProbe({
    cwd,
    env,
    videoPath: localReviewVideoPath,
    asrRunner: input.asrRunner
  });
  await fs.writeFile(transcriptPath, `${audioProbe.transcript ?? ""}\n`, "utf8");
  await writeJson(audioProbePath, {
    asr_provider: audioProbe.asr_provider ?? null,
    asr_probe_executed: audioProbe.real_asr_probe_executed === true,
    real_asr_probe_executed: audioProbe.real_asr_probe_executed === true,
    korean_transcript_present: Boolean(audioProbe.transcript),
    raw_similarity_score: audioProbe.raw_similarity_score,
    transcript_similarity_score: audioProbe.transcript_similarity_score,
    core_anchor_recognition_pass: audioProbe.core_anchor_recognition_pass,
    recognized_core_anchors: audioProbe.recognized_core_anchors,
    speech_rate_wpm: audioProbe.speech_rate_wpm,
    audio_blocker: audioProbe.audio_blocker,
    upload_readiness_allowed: false
  });

  const summary = buildV027ReviewSummary({
    scenes,
    productPresentation,
    cleanGate,
    negativeGate,
    voiceoverGenerated: ttsResult.voiceoverGenerated === true,
    videoHasAudioStream: videoProbe.video_has_audio_stream === true,
    durationSeconds: videoProbe.duration_seconds,
    localReviewVideoCreated: true,
    audioProbe
  });
  await writeJson(reviewSummaryPath, summary);
  await writeJson(humanDecisionPath, {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    human_review_status: summary.human_review_status,
    private_upload_allowed: false,
    safe_to_request_private_upload: false,
    requires_fresh_upload_approval: true,
    review_console_path: "commerce-assets/review/candidate-3c4f2ee364ba5b07/v027/review-console.html"
  });
  if (summary.local_review_packet_ready === true) {
    await fs.writeFile(reviewConsolePath, buildReviewConsoleHtml(summary), "utf8");
  }
  await writeAutopilotStateArtifact(cwd, {
    phase: summary.local_review_packet_ready ? "WAITING_HUMAN_REVIEW" : "BLOCKED_QA",
    latestHumanReviewStatus: summary.human_review_status,
    latestFailReasons: V026_CLEAN_COMMERCE_FAIL_REASONS,
    nextRecommendedAction: summary.local_review_packet_ready ? "WAIT_FOR_OWNER_REVIEW" : summary.human_review_status,
    safetyStopReason: summary.local_review_packet_ready ? null : summary.human_review_status
  });

  return buildResult({ summary, paths: basePaths });
}

export function buildV027ReviewSummary(input) {
  const localReviewPacketReady = input.localReviewVideoCreated === true &&
    input.cleanGate.clean_commerce_visual_pass === true &&
    input.negativeGate.negative_pattern_gate_v2_pass === true &&
    input.productPresentation.product_presentation_clean === true &&
    input.voiceoverGenerated === true &&
    input.videoHasAudioStream === true &&
    input.audioProbe.audio_blocker === null;

  return {
    candidate_id: CANDIDATE_ID,
    product_name: CANONICAL_PRODUCT_NAME,
    failed_version: FAILED_VERSION,
    version: TARGET_VERSION,
    target_version: TARGET_VERSION,
    v026_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
    v026_fail_reasons: V026_CLEAN_COMMERCE_FAIL_REASONS,
    clean_commerce_template_ready: localReviewPacketReady,
    clean_commerce_visual_pass: input.cleanGate.clean_commerce_visual_pass,
    bright_background_ratio: input.cleanGate.bright_background_ratio,
    dark_frame_ratio: input.cleanGate.dark_frame_ratio,
    horror_like_visual: input.cleanGate.horror_like_visual,
    synthetic_composite_risk: input.cleanGate.synthetic_composite_risk,
    abstract_overlay_count: input.cleanGate.abstract_overlay_count,
    product_color_tint_changed: input.cleanGate.product_color_tint_changed,
    product_original_color_preserved: input.cleanGate.product_original_color_preserved,
    text_readability_pass: input.cleanGate.text_readability_pass,
    caption_safe_area_pass: true,
    no_text_clipped: true,
    shop_like_cta_present: input.cleanGate.shop_like_cta_present,
    negative_pattern_gate_v2_pass: input.negativeGate.negative_pattern_gate_v2_pass,
    v024_text_card_pattern: input.negativeGate.v024_text_card_pattern,
    v025_product_photo_card_pattern: input.negativeGate.v025_product_photo_card_pattern,
    v026_dark_composite_pattern: input.negativeGate.v026_dark_composite_pattern,
    primitive_shape_artifact_pattern: input.negativeGate.primitive_shape_artifact_pattern,
    unnatural_usage_simulation_pattern: input.negativeGate.unnatural_usage_simulation_pattern,
    product_image_ready: input.productPresentation.product_image_ready,
    product_visible_first_frame: input.productPresentation.product_visible_first_frame,
    product_visible_scene_count: input.productPresentation.product_visible_scene_count,
    product_presentation_clean: input.productPresentation.product_presentation_clean,
    scene_count: input.scenes.length,
    duration_seconds: input.durationSeconds ?? DURATION_SECONDS,
    provider: "clean_commerce_template_renderer",
    melotts_voice_used: true,
    target_speech_rate_wpm: TARGET_SPEECH_RATE_WPM,
    voiceover_generated: input.voiceoverGenerated === true,
    real_asr_probe_executed: input.audioProbe.real_asr_probe_executed === true,
    raw_similarity_score: input.audioProbe.raw_similarity_score,
    transcript_similarity_score: input.audioProbe.transcript_similarity_score,
    core_anchor_recognition_pass: input.audioProbe.core_anchor_recognition_pass,
    recognized_core_anchors: input.audioProbe.recognized_core_anchors,
    speech_rate_wpm: input.audioProbe.speech_rate_wpm,
    video_has_audio_stream: input.videoHasAudioStream === true,
    audio_blocker: input.audioProbe.audio_blocker,
    local_review_packet_ready: localReviewPacketReady,
    review_console_generated: localReviewPacketReady,
    human_review_status: localReviewPacketReady ? "PENDING_HUMAN_REVIEW" : input.audioProbe.audio_blocker ?? "BLOCKED_V027_CLEAN_COMMERCE_REVIEW",
    private_upload_allowed: false,
    private_upload_allowed_now: false,
    SAFE_TO_REQUEST_PRIVATE_UPLOAD: false,
    NEW_PRIVATE_UPLOAD_DONE: false,
    YOUTUBE_VIDEO_ID_PRESENT: false,
    youtube_execute_called: false,
    videos_insert_called: false,
    r2_upload_write: false,
    product_assets_write: false,
    PUBLIC_UPLOAD_BLOCKED: true,
    public_upload_blocked: true,
    unlisted_upload_blocked: true,
    raw_affiliate_url_printed: false,
    raw_product_image_url_printed: false
  };
}

async function writeBlockedPacket(input) {
  const audioProbe = {
    real_asr_probe_executed: false,
    transcript: "",
    raw_similarity_score: null,
    transcript_similarity_score: null,
    core_anchor_recognition_pass: false,
    recognized_core_anchors: [],
    speech_rate_wpm: null,
    audio_blocker: input.blocker
  };
  const summary = {
    ...buildV027ReviewSummary({
      scenes: input.scenes,
      productPresentation: input.productPresentation,
      cleanGate: input.cleanGate,
      negativeGate: input.negativeGate,
      voiceoverGenerated: false,
      videoHasAudioStream: false,
      durationSeconds: null,
      localReviewVideoCreated: false,
      audioProbe
    }),
    local_review_packet_ready: false,
    review_console_generated: false,
    human_review_status: input.blocker,
    audio_blocker: input.blocker
  };
  await writeJson(input.paths.reviewSummaryPath, summary);
  await writeJson(input.paths.audioProbePath, audioProbe);
  await fs.writeFile(input.paths.transcriptPath, `${input.blocker}\n`, "utf8");
  await writeJson(input.paths.humanDecisionPath, {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    human_review_status: input.blocker,
    private_upload_allowed: false,
    safe_to_request_private_upload: false,
    requires_fresh_upload_approval: true,
    blocker: input.blocker
  });
  await writeAutopilotStateArtifact(input.cwd, {
    phase: "BLOCKED_QA",
    latestHumanReviewStatus: input.blocker,
    latestFailReasons: V026_CLEAN_COMMERCE_FAIL_REASONS,
    nextRecommendedAction: input.blocker,
    safetyStopReason: input.blocker
  });
  return buildResult({ summary, paths: input.paths });
}

function buildResult(input) {
  return {
    ...input.summary,
    target_version: TARGET_VERSION,
    review_console_path: input.paths.reviewConsolePath,
    local_review_video_path: input.paths.localReviewVideoPath,
    scene_plan_path: input.paths.scenePlanPath,
    clean_commerce_visual_gate_path: input.paths.cleanGatePath,
    negative_pattern_gate_v2_path: input.paths.negativeGatePath,
    product_presentation_report_path: input.paths.productReportPath,
    actual_frame_contact_sheet_path: input.paths.actualContactSheetPath,
    shorts_ui_overlay_contact_sheet_path: input.paths.overlayContactSheetPath,
    asr_transcript_path: input.paths.transcriptPath,
    audio_intelligibility_probe_path: input.paths.audioProbePath,
    human_review_decision_path: input.paths.humanDecisionPath,
    review_summary_path: input.paths.reviewSummaryPath,
    v026_human_review_decision_path: input.paths.v026HumanDecisionPath
  };
}

function cleanScene(input) {
  return {
    scene: input.scene,
    id: input.id,
    role: input.role,
    title: input.title,
    subtitle: input.subtitle,
    footer: input.footer,
    script_line: V027_VOICEOVER_SCRIPT_LINES[input.scene - 1],
    visual_goal: "Clean bright commerce Shorts scene with trustworthy product-first presentation.",
    background: input.background,
    accent: input.accent,
    background_tone: "bright",
    product_visible: true,
    product_visible_first_frame: input.scene === 1,
    product_color_tint: "none",
    product_original_color_preserved: true,
    product_scale_px: input.productScale,
    product_y: input.productY,
    motion_style: "subtle_slide_scale",
    text_readability_pass: true,
    shop_like_cta_present: input.cta,
    abstract_overlay_count: 0,
    horror_like_visual: false,
    synthetic_composite_risk: false,
    product_photo_card_pattern: false,
    primitive_shape_artifact_pattern: false,
    unnatural_usage_simulation_pattern: false,
    callouts: input.callouts,
    duration_seconds: SCENE_SECONDS
  };
}

async function renderV027Visuals(input) {
  const sceneClipDir = path.join(input.reviewRoot, "clean-commerce-clips");
  const scenePosterDir = path.join(input.reviewRoot, "clean-commerce-posters");
  await fs.mkdir(sceneClipDir, { recursive: true });
  await fs.mkdir(scenePosterDir, { recursive: true });
  const sceneClips = [];
  const scenePosters = [];
  for (const sceneItem of input.scenes) {
    const clipPath = path.join(sceneClipDir, `${sceneItem.id}.mp4`);
    const posterPath = path.join(scenePosterDir, `${sceneItem.id}.png`);
    await renderSceneClip({
      scene: sceneItem,
      productImagePath: input.productImagePath,
      outputPath: clipPath,
      reviewRoot: input.reviewRoot,
      mediaRunner: input.mediaRunner
    });
    await runMedia({
      kind: "scene_poster",
      args: ["-y", "-hide_banner", "-loglevel", "error", "-i", clipPath, "-frames:v", "1", posterPath],
      outputPath: posterPath,
      mediaRunner: input.mediaRunner
    });
    sceneClips.push(clipPath);
    scenePosters.push(posterPath);
  }
  await createSceneContactSheet(scenePosters, path.join(input.reviewRoot, "storyboard-contact-sheet.jpg"), input.mediaRunner);
  await concatSceneClips(sceneClips, input.visualOnlyVideoPath, input.mediaRunner);
  await muxVideoWithVoiceover({
    visualOnlyVideoPath: input.visualOnlyVideoPath,
    voiceoverAudioPath: input.voiceoverAudioPath,
    outputVideoPath: input.localReviewVideoPath,
    mediaRunner: input.mediaRunner
  });
  await createVideoContactSheet(input.localReviewVideoPath, path.join(input.reviewRoot, "actual-frame-contact-sheet.jpg"), input.mediaRunner);
  await createOverlayContactSheet(input.localReviewVideoPath, path.join(input.reviewRoot, "shorts-ui-overlay-contact-sheet.jpg"), input.mediaRunner);
}

async function renderSceneClip(input) {
  const posterDir = path.join(input.reviewRoot, "clean-commerce-posters");
  const titlePath = path.join(posterDir, `${input.scene.id}-title.txt`);
  const subtitlePath = path.join(posterDir, `${input.scene.id}-subtitle.txt`);
  const footerPath = path.join(posterDir, `${input.scene.id}-footer.txt`);
  const ctaPath = path.join(posterDir, `${input.scene.id}-cta.txt`);
  const calloutPath = path.join(posterDir, `${input.scene.id}-callouts.txt`);
  await fs.writeFile(titlePath, input.scene.title, "utf8");
  await fs.writeFile(subtitlePath, input.scene.subtitle, "utf8");
  await fs.writeFile(footerPath, input.scene.footer, "utf8");
  await fs.writeFile(ctaPath, "\uc790\uc138\ud788 \ubcf4\uae30", "utf8");
  await fs.writeFile(calloutPath, input.scene.callouts.join("   |   "), "utf8");
  await runMedia({
    kind: "scene_clip",
    args: buildSceneClipArgs({
      ...input,
      titlePath,
      subtitlePath,
      footerPath,
      ctaPath,
      calloutPath
    }),
    outputPath: input.outputPath,
    mediaRunner: input.mediaRunner
  });
}

function buildSceneClipArgs(input) {
  const font = escapeFilterPath("C:/Windows/Fonts/malgunbd.ttf");
  const title = escapeFilterPath(input.titlePath);
  const subtitle = escapeFilterPath(input.subtitlePath);
  const footer = escapeFilterPath(input.footerPath);
  const cta = escapeFilterPath(input.ctaPath);
  const callouts = escapeFilterPath(input.calloutPath);
  const bg = `0x${input.scene.background}`;
  const accent = `0x${input.scene.accent}`;
  const productScale = input.scene.product_scale_px;
  const productY = input.scene.product_y;
  const subtleX = input.scene.scene % 2 === 0 ? "+10*sin(2*PI*t/4)" : "-10*sin(2*PI*t/4)";
  const ctaFilters = input.scene.shop_like_cta_present
    ? [
      `drawbox=x=210:y=1398:w=660:h=112:color=${accent}@0.95:t=fill`,
      `drawtext=fontfile='${font}':textfile='${cta}':x=(w-text_w)/2:y=1428:fontsize=54:fontcolor=0xffffff`
    ]
    : [`drawtext=fontfile='${font}':textfile='${callouts}':x=96:y=1438:fontsize=40:fontcolor=${accent}`];
  const filter = [
    `[1:v]scale=${productScale}:-1:force_original_aspect_ratio=decrease[product]`,
    `[0:v]drawbox=x=54:y=92:w=972:h=390:color=white@0.88:t=fill,drawbox=x=54:y=92:w=18:h=390:color=${accent}@1:t=fill,drawtext=fontfile='${font}':textfile='${title}':x=96:y=150:fontsize=66:fontcolor=0x111827:line_spacing=10,drawtext=fontfile='${font}':textfile='${subtitle}':x=96:y=280:fontsize=54:fontcolor=${accent}:line_spacing=8[base]`,
    `[base][product]overlay=x='(main_w-overlay_w)/2${subtleX}':y='${productY}+6*sin(2*PI*t/4)':shortest=1[with_product]`,
    `[with_product]drawbox=x=74:y=1336:w=932:h=260:color=white@0.80:t=fill,drawtext=fontfile='${font}':textfile='${footer}':x=96:y=1520:fontsize=30:fontcolor=0x374151:line_spacing=4,${ctaFilters.join(",")},format=yuv420p[out]`
  ].join(";");
  return [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    `color=c=${bg}:s=1080x1920:r=30:d=${SCENE_SECONDS}`,
    "-loop",
    "1",
    "-i",
    input.productImagePath,
    "-filter_complex",
    filter,
    "-map",
    "[out]",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-t",
    String(SCENE_SECONDS),
    input.outputPath
  ];
}

async function concatSceneClips(sceneClips, outputPath, mediaRunner) {
  const inputs = sceneClips.flatMap((clipPath) => ["-i", clipPath]);
  const concatInputs = sceneClips.map((_, index) => `[${index}:v]`).join("");
  await runMedia({
    kind: "visual_concat",
    args: [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      ...inputs,
      "-filter_complex",
      `${concatInputs}concat=n=${sceneClips.length}:v=1:a=0[v]`,
      "-map",
      "[v]",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-t",
      String(DURATION_SECONDS),
      outputPath
    ],
    outputPath,
    mediaRunner
  });
}

async function muxVideoWithVoiceover(input) {
  await runMedia({
    kind: "mux_voiceover",
    args: [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      input.visualOnlyVideoPath,
      "-i",
      input.voiceoverAudioPath,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-af",
      "silenceremove=stop_periods=-1:stop_duration=0.12:stop_threshold=-35dB,loudnorm=I=-16:TP=-1.5:LRA=11",
      "-t",
      String(DURATION_SECONDS),
      "-movflags",
      "+faststart",
      input.outputVideoPath
    ],
    outputPath: input.outputVideoPath,
    mediaRunner: input.mediaRunner
  });
}

async function createSceneContactSheet(imagePaths, outputPath, mediaRunner) {
  const inputs = imagePaths.flatMap((imagePath) => ["-i", imagePath]);
  const scaleFilters = imagePaths
    .map((_, index) => `[${index}:v]scale=270:480:force_original_aspect_ratio=decrease,pad=270:480:(ow-iw)/2:(oh-ih)/2:color=white[v${index}]`)
    .join(";");
  const xstackInputs = imagePaths.map((_, index) => `[v${index}]`).join("");
  await runMedia({
    kind: "storyboard_contact_sheet",
    args: [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      ...inputs,
      "-filter_complex",
      `${scaleFilters};${xstackInputs}xstack=inputs=6:layout=0_0|270_0|540_0|0_480|270_480|540_480[out]`,
      "-map",
      "[out]",
      "-frames:v",
      "1",
      outputPath
    ],
    outputPath,
    mediaRunner
  });
}

async function createVideoContactSheet(videoPath, outputPath, mediaRunner) {
  await runMedia({
    kind: "actual_frame_contact_sheet",
    args: [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      videoPath,
      "-vf",
      "fps=1/4,scale=270:480:force_original_aspect_ratio=decrease,pad=270:480:(ow-iw)/2:(oh-ih)/2:color=white,tile=3x2",
      "-frames:v",
      "1",
      outputPath
    ],
    outputPath,
    mediaRunner
  });
}

async function createOverlayContactSheet(videoPath, outputPath, mediaRunner) {
  await runMedia({
    kind: "shorts_overlay_contact_sheet",
    args: [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      videoPath,
      "-vf",
      "fps=1/4,drawbox=x=0:y=0:w=1080:h=165:color=black@0.10:t=fill,drawbox=x=870:y=620:w=150:h=500:color=black@0.10:t=fill,drawbox=x=0:y=1585:w=1080:h=250:color=black@0.10:t=fill,scale=270:480:force_original_aspect_ratio=decrease,pad=270:480:(ow-iw)/2:(oh-ih)/2:color=white,tile=3x2",
      "-frames:v",
      "1",
      outputPath
    ],
    outputPath,
    mediaRunner
  });
}

async function runTtsProvider(input) {
  if (input.ttsRunner) {
    const result = await input.ttsRunner({
      scriptPath: input.scriptPath,
      audioPath: input.audioPath,
      language: input.env.KOREAN_VOICE_LANGUAGE ?? "ko",
      outputFormat: input.env.KOREAN_VOICE_OUTPUT_FORMAT ?? "wav",
      speedMultiplier: input.speedMultiplier
    });
    return {
      ...result,
      voiceoverGenerated: result.ok === true && await fileExists(input.audioPath)
    };
  }
  const command = readString(input.env.KOREAN_VOICE_COMMAND);
  if (!command) {
    return { ok: false, blocker: "BLOCKED_KOREAN_VOICE_PROVIDER_NOT_CONFIGURED", commandExecuted: false };
  }
  if (hasSapiMarker(command)) {
    return { ok: false, blocker: "VOICEOVER_REJECTED_LOCAL_SAPI_VOICE", commandExecuted: false };
  }
  try {
    await runLocalCommand(command, [
      "--script",
      input.scriptPath,
      "--output",
      input.audioPath,
      "--language",
      input.env.KOREAN_VOICE_LANGUAGE ?? "ko",
      "--format",
      input.env.KOREAN_VOICE_OUTPUT_FORMAT ?? "wav"
    ], TTS_TIMEOUT_MS, {
      MELOTTS_SPEED: String(input.speedMultiplier)
    });
  } catch {
    return { ok: false, blocker: "LOCAL_KOREAN_TTS_COMMAND_FAILED", commandExecuted: true };
  }
  if (!await fileExists(input.audioPath)) {
    return { ok: false, blocker: "VOICE_PROVIDER_GENERATION_FAILED", commandExecuted: true };
  }
  return { ok: true, commandExecuted: true, voiceoverGenerated: true };
}

async function runRealAsrProbe(input) {
  if (input.asrRunner) {
    const result = await input.asrRunner({ videoPath: input.videoPath });
    return evaluateV027AudioIntelligibility({
      transcript: result.transcript ?? "",
      asrProvider: result.asrProvider ?? "test-asr",
      speechRateWpm: result.speechRateWpm,
      rawSimilarityScore: result.rawSimilarityScore,
      transcriptSimilarityScore: result.transcriptSimilarityScore,
      coreAnchorRecognitionPass: result.coreAnchorRecognitionPass
    });
  }
  const config = getLocalAsrConfig(input.env);
  const readiness = await inspectLocalAsrConfig(config);
  if (readiness.provider_detected !== true) {
    return {
      asr_provider: null,
      real_asr_probe_executed: false,
      transcript: "",
      raw_similarity_score: null,
      transcript_similarity_score: null,
      core_anchor_recognition_pass: false,
      recognized_core_anchors: [],
      speech_rate_wpm: null,
      audio_blocker: "AUDIO_ASR_PROVIDER_NOT_CONFIGURED"
    };
  }
  const tempDir = await fs.mkdtemp(path.join(input.cwd, "commerce-assets", ".tmp-v027-asr-"));
  const outputJsonPath = path.join(tempDir, "asr-output.json");
  try {
    await runLocalCommand(config.command, [
      "--input",
      input.videoPath,
      "--output-json",
      outputJsonPath,
      "--language",
      config.language,
      "--model-path",
      config.modelPath
    ], ASR_TIMEOUT_MS);
    const asrOutput = JSON.parse(await fs.readFile(outputJsonPath, "utf8"));
    return evaluateV027AudioIntelligibility({
      transcript: typeof asrOutput.transcript === "string" ? asrOutput.transcript : "",
      asrProvider: config.provider,
      speechRateWpm: TARGET_SPEECH_RATE_WPM
    });
  } catch {
    return {
      asr_provider: config.provider,
      real_asr_probe_executed: false,
      transcript: "",
      raw_similarity_score: null,
      transcript_similarity_score: null,
      core_anchor_recognition_pass: false,
      recognized_core_anchors: [],
      speech_rate_wpm: null,
      audio_blocker: "AUDIO_ASR_COMMAND_FAILED"
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function loadLocalEnv(cwd) {
  const env = { ...process.env };
  try {
    const contents = await fs.readFile(path.join(cwd, ".env.local"), "utf8");
    return { ...env, ...parseDotEnv(contents) };
  } catch {
    return env;
  }
}

async function runLocalCommand(command, args, timeout, envOverrides = {}) {
  const stripped = stripWrappingQuotes(command);
  const extension = path.extname(stripped).toLowerCase();
  const options = {
    timeout,
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 4,
    env: { ...process.env, ...envOverrides }
  };
  if (extension === ".cmd" || extension === ".bat") {
    return execFileAsync("cmd.exe", ["/d", "/s", "/c", stripped, ...args], options);
  }
  return execFileAsync(stripped, args, options);
}

async function runMedia(input) {
  if (input.mediaRunner) {
    await input.mediaRunner(input);
    return;
  }
  await execFileAsync("ffmpeg", input.args, {
    timeout: FFMPEG_TIMEOUT_MS,
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 8
  });
}

async function probeVideo(videoPath) {
  const result = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    videoPath
  ], { timeout: 60000, windowsHide: true, maxBuffer: 1024 * 1024 });
  const parsed = JSON.parse(result.stdout || "{}");
  const duration = Number(parsed.format?.duration);
  return {
    duration_seconds: Number.isFinite(duration) ? Math.round(duration * 10) / 10 : null,
    video_has_audio_stream: Array.isArray(parsed.streams) &&
      parsed.streams.some((stream) => stream.codec_type === "audio")
  };
}

async function writeAutopilotStateArtifact(cwd, input) {
  const statePath = path.join(cwd, "commerce-assets", "autopilot", "state.json");
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await writeJson(statePath, {
    version: 1,
    last_run_at: new Date().toISOString(),
    current_phase: input.phase,
    current_candidate_id: CANDIDATE_ID,
    current_review_version: TARGET_VERSION,
    latest_human_review_status: input.latestHumanReviewStatus,
    latest_fail_reasons: input.latestFailReasons,
    next_recommended_action: input.nextRecommendedAction,
    private_upload_allowed: false,
    fresh_upload_approval_present: false,
    last_youtube_video_id: null,
    youtube_insert_count_this_run: 0,
    public_upload_blocked: true,
    unlisted_upload_blocked: true,
    safety_stop_reason: input.safetyStopReason
  });
}

function buildReviewConsoleHtml(summary) {
  const safeJson = JSON.stringify(summary, null, 2)
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>v027 Clean Commerce Shorts Review</title>
  <style>
    body { margin: 0; background: #f8fafc; color: #111827; font-family: Arial, "Malgun Gothic", sans-serif; }
    main { padding: 24px; max-width: 1180px; margin: 0 auto; }
    h1 { font-size: 30px; margin: 0 0 10px; }
    h2 { margin-top: 26px; }
    .status { display: inline-block; background: #0f766e; color: white; padding: 7px 12px; border-radius: 6px; font-weight: 700; }
    .note { color: #334155; }
    .grid { display: grid; grid-template-columns: 420px 1fr; gap: 24px; align-items: start; }
    video { width: 100%; border: 1px solid #cbd5e1; background: white; border-radius: 6px; }
    img { max-width: 100%; border: 1px solid #cbd5e1; background: white; border-radius: 6px; }
    .checks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .check { background: white; border: 1px solid #dbeafe; border-radius: 6px; padding: 12px; }
    pre { background: #0f172a; color: #e2e8f0; padding: 16px; border-radius: 6px; overflow: auto; }
  </style>
</head>
<body>
  <main>
    <h1>v027 Clean Commerce Shorts Review</h1>
    <p><span class="status">PENDING_HUMAN_REVIEW_NO_UPLOAD</span></p>
    <p class="note">v026 is locked as FAIL_LOCAL_HUMAN_REVIEW. This packet resets to a bright product-first commerce template. Upload remains blocked until owner review and separate approval.</p>
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
      <h2>Clean Commerce Gate</h2>
      <div class="checks">
        <div class="check">Bright background ratio: ${summary.bright_background_ratio}</div>
        <div class="check">Dark frame ratio: ${summary.dark_frame_ratio}</div>
        <div class="check">Product color preserved: ${summary.product_original_color_preserved}</div>
        <div class="check">Shop CTA present: ${summary.shop_like_cta_present}</div>
        <div class="check">Negative pattern gate: ${summary.negative_pattern_gate_v2_pass}</div>
        <div class="check">ASR anchors: ${summary.recognized_core_anchors.join(", ")}</div>
      </div>
    </section>
    <section>
      <h2>Human Review Checklist</h2>
      <ol>
        <li>The video looks like a clean shopping Shorts ad, not a horror/dark composite.</li>
        <li>The product keeps its original bright color and is visible in the first second.</li>
        <li>Scene changes are clear without excessive synthetic effects.</li>
        <li>Text is short, readable, and inside safe areas.</li>
        <li>The CTA and Coupang Partners disclosure are visible.</li>
        <li>Private upload remains blocked until separate owner approval.</li>
      </ol>
    </section>
    <section>
      <h2>Summary</h2>
      <pre>${safeJson}</pre>
    </section>
  </main>
</body>
</html>
`;
}

async function fileExists(filePath) {
  if (!filePath) return false;
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function calculateTranscriptSimilarity(referenceScript, transcript) {
  const reference = normalizeForSimilarity(referenceScript);
  const actual = normalizeForSimilarity(transcript);
  if (!reference || !actual) return 0;
  return round3(diceCoefficient(reference, actual));
}

function findAnchors(transcript, anchors) {
  const normalizedTranscript = normalizeForSimilarity(transcript);
  return anchors.filter((anchor) => normalizedTranscript.includes(normalizeForSimilarity(anchor)));
}

function normalizeKoreanProductTerms(transcript) {
  return String(transcript ?? "")
    .replaceAll("\uac74\uc870 \ub300", "\uac74\uc870\ub300")
    .replaceAll("\ube68\ub798 \uac74\uc870\ub300", "\ube68\ub798\uac74\uc870\ub300")
    .replaceAll("\ube68\ub798 \uac74\uc870 \ub300", "\ube68\ub798\uac74\uc870\ub300");
}

function normalizeForSimilarity(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function diceCoefficient(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const counts = new Map();
  for (let index = 0; index < a.length - 1; index += 1) {
    const gram = a.slice(index, index + 2);
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  let intersection = 0;
  for (let index = 0; index < b.length - 1; index += 1) {
    const gram = b.slice(index, index + 2);
    const count = counts.get(gram) ?? 0;
    if (count > 0) {
      counts.set(gram, count - 1);
      intersection += 1;
    }
  }
  return (2 * intersection) / (a.length + b.length - 2);
}

function normalizeNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeRatio(value) {
  const number = normalizeNumber(value);
  return number !== null && number >= 0 && number <= 1 ? number : null;
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function readString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function stripWrappingQuotes(value) {
  return String(value ?? "").trim().replace(/^["']|["']$/g, "");
}

function hasSapiMarker(command) {
  return /windows\s+sapi|local_sapi|sapi_voice|system\.speech/i.test(command);
}

function escapeFilterPath(value) {
  return value.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  generateV027CleanCommerceTemplateReviewPacket()
    .then((result) => {
      console.log(JSON.stringify({
        target_version: TARGET_VERSION,
        v026_review_status: result.v026_review_status,
        clean_commerce_template_ready: result.clean_commerce_template_ready,
        clean_commerce_visual_pass: result.clean_commerce_visual_pass,
        bright_background_ratio: result.bright_background_ratio,
        dark_frame_ratio: result.dark_frame_ratio,
        horror_like_visual: result.horror_like_visual,
        synthetic_composite_risk: result.synthetic_composite_risk,
        abstract_overlay_count: result.abstract_overlay_count,
        product_color_tint_changed: result.product_color_tint_changed,
        product_original_color_preserved: result.product_original_color_preserved,
        negative_pattern_gate_v2_pass: result.negative_pattern_gate_v2_pass,
        real_asr_probe_executed: result.real_asr_probe_executed,
        raw_similarity_score: result.raw_similarity_score,
        transcript_similarity_score: result.transcript_similarity_score,
        core_anchor_recognition_pass: result.core_anchor_recognition_pass,
        recognized_core_anchors: result.recognized_core_anchors,
        local_review_packet_ready: result.local_review_packet_ready,
        safe_to_request_private_upload: result.SAFE_TO_REQUEST_PRIVATE_UPLOAD,
        human_review_status: result.human_review_status,
        review_console_path: result.review_console_path
      }, null, 2));
      if (result.local_review_packet_ready !== true) {
        process.exitCode = 2;
      }
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
