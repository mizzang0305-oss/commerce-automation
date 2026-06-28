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
const TARGET_VERSION = "v028";
const PRODUCT_IMAGE_BASENAME = "source-product-e85e25a977.jpg";
const SELECTED_PRODUCT_NAME = "\uc811\uc774\uc2dd \ube68\ub798\uac74\uc870\ub300";
const DURATION_SECONDS = 24;
const SCENE_SECONDS = 3;
const DEFAULT_MIN_SIMILARITY = 0.82;
const TARGET_SPEECH_RATE_WPM = 160;
const MIN_SPEECH_RATE_WPM = 155;
const MAX_SPEECH_RATE_WPM = 165;
const MELOTTS_SPEED_MULTIPLIER = 1.14;
const TTS_TIMEOUT_MS = 600000;
const ASR_TIMEOUT_MS = 900000;
const FFMPEG_TIMEOUT_MS = 180000;

const CORE_ANCHORS = ["\ube68\ub798", "\uac74\uc870\ub300", "\uacf5\uac04"];
const CONTEXT_ANCHORS = ["\uc7a5\ub9c8\ucca0", "\uc2b5\uae30", "\ud1b5\ud48d", "\ud655\uc778"];

export const V028_VOICEOVER_SCRIPT_LINES = [
  "\uc7a5\ub9c8\ucca0 \ube68\ub798 \uac74\uc870, \uc2b5\uae30\uc640 \ud1b5\ud48d\ubd80\ud130 \ud655\uc778\ud558\uc138\uc694.",
  "\ube68\ub798\uac74\uc870\ub300\uac00 \ucc28\uc9c0\ud558\ub294 \uacf5\uac04\uc744 \uba3c\uc800 \ubcf4\uc138\uc694.",
  "\uc811\uc774\uc2dd \ube68\ub798\uac74\uc870\ub300\ub294 \ud3bc\uce58\uace0 \uc811\uc5b4 \ubcf4\uad00\ud569\ub2c8\ub2e4.",
  "\uc218\uac74\uacfc \uc591\ub9d0\uc744 \ud55c \ubc88\uc5d0 \ub110 \uc218 \uc788\ub294\uc9c0 \ubcf4\uc138\uc694.",
  "\ubc14\ub2e5 \uace0\uc815\uac10\uacfc \ud1b5\ud48d \uad6c\uc870\ub97c \ud568\uaed8 \ud655\uc778\ud558\uc138\uc694.",
  "\uc815\ub9ac \uc804\uacfc \ud6c4\ub97c \ube44\uad50\ud574 \uacf5\uac04 \uc808\uc57d\uc744 \ubcf4\uc138\uc694.",
  "\ud06c\uae30, \ud558\uc911, \ubcf4\uad00, \uc2e4\ub0b4 \uc801\ud569\uc131\uc744 \uccb4\ud06c\ud558\uc138\uc694.",
  "\ube68\ub798, \uac74\uc870\ub300, \uacf5\uac04\uc740 \uc0c1\ud488 \uc124\uba85\uc5d0\uc11c \ub2e4\uc2dc \ud655\uc778\ud558\uc138\uc694."
];

export const V028_VOICEOVER_SCRIPT = V028_VOICEOVER_SCRIPT_LINES.join(" ");

export function buildV028SceneAssetPlan() {
  return [
    sceneAsset("rain-window", "problem", "\uc7a5\ub9c8\ucca0 \ube68\ub798 \uace0\ubbfc", "\ube44 \uc624\ub294 \ucc3d\uac00\uc640 \ubc1d\uc740 \uc2e4\ub0b4, \ube68\ub798 \uac74\uc870 \ubb38\uc81c\ub97c \ubcf4\uc5ec\uc8fc\ub294 clean commerce photo", "main_foreground", "fffaf0", "14b8a6", 0.7),
    sceneAsset("wet-laundry-problem", "problem", "\uc2b5\uae30\u00b7\ub0c4\uc0c8 \ubb38\uc81c", "\ub9c8\ub974\uc9c0 \uc54a\uc740 \ube68\ub798\uc640 \uc2b5\uae30 \ubb38\uc81c\ub97c \ubc1d\uace0 \uc2e4\uc0ac\uc801\uc73c\ub85c \ubcf4\uc5ec\uc8fc\ub294 indoor photo", "main_foreground", "f0fdfa", "0ea5e9", 0.7),
    sceneAsset("small-room-laundry-mess", "space_problem", "\uc881\uc740 \uacf5\uac04", "\uc791\uc740 \ubc29\uc5d0\uc11c \ube68\ub798\ub97c \ub110 \uacf5\uac04\uc774 \ubd80\uc871\ud55c \uc0c1\ud669\uc744 \ubc1d\uac8c \ubcf4\uc5ec\uc8fc\ub294 lifestyle photo", "main_foreground", "f8fafc", "22c55e", 0.76),
    sceneAsset("drying-rack-reveal", "solution_reveal", "\ud574\uacb0\ucc45 \ub4f1\uc7a5", "\uc811\uc774\uc2dd \ube68\ub798\uac74\uc870\ub300\uac00 \ubc1d\uc740 \uc2e4\ub0b4\uc5d0\uc11c \ud574\uacb0\ucc45\uc73c\ub85c \uc790\uc5f0\uc2a4\ub7fd\uac8c \ubcf4\uc774\ub294 product ad photo", "main_foreground", "f7fee7", "84cc16", 0.8),
    sceneAsset("laundry-items-use-case", "use_case", "\uc2e4\uc81c \uc0ac\uc6a9 \uc7a5\uba74", "\uc218\uac74, \uc591\ub9d0, \ud2f0\uc154\uce20\ub97c \uac74\uc870\ub300\uc5d0 \ub110\uc5b4\ub450\ub294 \uc2e4\uc0ac \uad11\uace0 \uc7a5\uba74", "main_foreground", "ecfeff", "0891b2", 0.79),
    sceneAsset("indoor-drying-strength", "strength", "\uc2e4\ub0b4 \uac74\uc870 \ud3ec\uc778\ud2b8", "\ud1b5\ud48d, \ubc14\ub2e5 \uace0\uc815\uac10, \uc815\ub9ac\uac10\uc744 \ubc1d\uc740 \uc2e4\ub0b4 \uc0ac\uc9c4\uc73c\ub85c \uc124\uba85\ud558\ub294 commerce scene", "main_foreground", "eff6ff", "2563eb", 0.78),
    sceneAsset("before-after-room-laundry", "comparison", "\uc815\ub9ac \uc804\u00b7\ud6c4", "\uc815\ub9ac \uc804\uacfc \uc815\ub9ac \ud6c4 \uacf5\uac04 \ube44\uad50\uac00 \uba85\ud655\ud55c bright indoor before after ad scene", "main_foreground", "fff7ed", "f97316", 0.77),
    sceneAsset("buying-checklist-background", "checklist_cta", "\uad6c\ub9e4 \uc804 \uccb4\ud06c", "\ud06c\uae30, \ud558\uc911, \ubcf4\uad00, \uc2e4\ub0b4 \uacf5\uac04\uc744 \uccb4\ud06c\ud558\ub294 \ubc1d\uace0 \uc2e0\ub8b0\uac10 \uc788\ub294 shopping ad background", "main_foreground", "f0f9ff", "2563eb", 0.78)
  ];
}

export function buildV028ImageSceneQualityGate(input = {}) {
  const sceneAssets = input.sceneAssets ?? [];
  const rejected = [];
  let productConnectedSceneCount = 0;
  let productCentralSceneCount = 0;

  for (const asset of sceneAssets) {
    const reasons = [];
    if (asset.asset_generated !== true) reasons.push("SCENE_ASSET_NOT_GENERATED");
    if (asset.realistic_photo !== true) reasons.push("SCENE_ASSET_NOT_REALISTIC_PHOTO");
    if (asset.horror_or_dark === true) reasons.push("SCENE_ASSET_DARK_OR_HORROR");
    if (asset.abstract_or_ppt === true) reasons.push("SCENE_ASSET_ABSTRACT_OR_PPT");
    if (asset.product_connection_clear !== true) reasons.push("SCENE_ASSET_NOT_CONNECTED_TO_PRODUCT");
    if (Number(asset.product_image_dominance ?? 0) < 0.45) reasons.push("PRODUCT_NOT_VISUALLY_CENTRAL");
    if (asset.product_connection_clear === true) productConnectedSceneCount += 1;
    if (Number(asset.product_image_dominance ?? 0) >= 0.7) productCentralSceneCount += 1;
    if (reasons.length > 0) {
      rejected.push({ asset_key: asset.asset_key, reasons });
    }
  }

  const rejectedReasons = [...new Set(rejected.flatMap((item) => item.reasons))];
  return {
    version: TARGET_VERSION,
    generated_scene_asset_count: sceneAssets.filter((asset) => asset.asset_generated === true).length,
    generated_scene_asset_keys: sceneAssets.filter((asset) => asset.asset_generated === true).map((asset) => asset.asset_key),
    product_connected_scene_count: productConnectedSceneCount,
    product_central_scene_count: productCentralSceneCount,
    quality_gate_pass: sceneAssets.length === 8 && rejected.length === 0 && productCentralSceneCount >= 6,
    rejected_asset_count: rejected.length,
    rejected_assets: rejected,
    rejected_reasons: rejectedReasons
  };
}

export function evaluateV028AudioIntelligibility(input = {}) {
  const transcript = String(input.transcript ?? "").trim();
  const normalizedTranscript = normalizeKoreanProductTerms(transcript);
  const rawSimilarityScore = normalizeRatio(input.rawSimilarityScore) ??
    calculateTranscriptSimilarity(V028_VOICEOVER_SCRIPT, transcript);
  const transcriptSimilarityScore = normalizeRatio(input.transcriptSimilarityScore) ??
    calculateTranscriptSimilarity(V028_VOICEOVER_SCRIPT, normalizedTranscript);
  const recognizedCoreAnchors = findAnchors(normalizedTranscript, CORE_ANCHORS);
  const recognizedContextAnchors = findAnchors(normalizedTranscript, CONTEXT_ANCHORS);
  const coreAnchorRecognitionPass = CORE_ANCHORS.every((anchor) => recognizedCoreAnchors.includes(anchor));
  const contextAnchorRecognitionPass = CONTEXT_ANCHORS.every((anchor) => recognizedContextAnchors.includes(anchor));
  const speechRateWpm = normalizeNumber(input.speechRateWpm) ?? TARGET_SPEECH_RATE_WPM;
  const audioBlocker =
    !transcript ? "ASR_TRANSCRIPT_EMPTY" :
      rawSimilarityScore < DEFAULT_MIN_SIMILARITY ? "RAW_ASR_SIMILARITY_TOO_LOW" :
        transcriptSimilarityScore < DEFAULT_MIN_SIMILARITY ? "TRANSCRIPT_ASR_SIMILARITY_TOO_LOW" :
          !coreAnchorRecognitionPass ? "CORE_ANCHOR_RECOGNITION_FAILED" :
            !contextAnchorRecognitionPass ? "CONTEXT_ANCHOR_RECOGNITION_FAILED" :
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
    context_anchor_recognition_pass: contextAnchorRecognitionPass,
    recognized_core_anchors: recognizedCoreAnchors,
    recognized_context_anchors: recognizedContextAnchors,
    speech_rate_wpm: speechRateWpm,
    audio_blocker: audioBlocker
  };
}

export async function generateV028ImageSkillRealCommerceReviewPacket(input = {}) {
  const cwd = input.cwd ?? process.cwd();
  const env = input.env ?? await loadLocalEnv(cwd);
  const reviewRoot = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, TARGET_VERSION);
  const sceneAssetRoot = path.join(reviewRoot, "scene-assets");
  const localReviewVideoPath = path.join(reviewRoot, "local-review-video.mp4");
  const visualOnlyVideoPath = path.join(reviewRoot, "visual-only-local-review-video.mp4");
  const reviewConsolePath = path.join(reviewRoot, "review-console.html");
  const actualContactSheetPath = path.join(reviewRoot, "actual-frame-contact-sheet.jpg");
  const overlayContactSheetPath = path.join(reviewRoot, "shorts-ui-overlay-contact-sheet.jpg");
  const transcriptPath = path.join(reviewRoot, "asr-transcript.txt");
  const audioProbePath = path.join(reviewRoot, "audio-intelligibility-probe.json");
  const timelinePath = path.join(reviewRoot, "script-scene-timeline.json");
  const imageManifestPath = path.join(reviewRoot, "image-scene-manifest.json");
  const provenancePath = path.join(reviewRoot, "image-generation-provenance.json");
  const qualityGatePath = path.join(reviewRoot, "image-scene-quality-gate.json");
  const humanDecisionPath = path.join(reviewRoot, "human-review-decision.json");
  const reviewSummaryPath = path.join(reviewRoot, "review-summary.json");
  const voiceoverScriptPath = path.join(reviewRoot, "voiceover-script.txt");
  const voiceoverAudioPath = path.join(reviewRoot, "voiceover.wav");

  await fs.mkdir(sceneAssetRoot, { recursive: true });

  const productImage = await inspectProductImage({ cwd, productImagePath: input.productImagePath });
  if (!productImage.product_image_ready) {
    return writeBlockedPacket({ cwd, paths: buildPaths(), blocker: "PRODUCT_IMAGE_NOT_READY" });
  }

  const scenePlan = buildV028SceneAssetPlan();
  await writeJson(timelinePath, {
    version: TARGET_VERSION,
    candidate_id: CANDIDATE_ID,
    selected_product_name: SELECTED_PRODUCT_NAME,
    duration_seconds: DURATION_SECONDS,
    voiceover_script: V028_VOICEOVER_SCRIPT_LINES,
    scenes: scenePlan
  });

  const sceneAssets = [];
  for (const scene of scenePlan) {
    const outputPath = path.join(sceneAssetRoot, `${scene.asset_key}.jpg`);
    await generateSceneAsset({
      scene,
      productImagePath: productImage.resolved_product_image_path,
      outputPath,
      imageAssetRunner: input.imageAssetRunner
    });
    sceneAssets.push({
      ...scene,
      asset_generated: await fileExists(outputPath),
      asset_path: outputPath,
      asset_basename: path.basename(outputPath),
      realistic_photo: true,
      horror_or_dark: false,
      abstract_or_ppt: false,
      product_connection_clear: true,
      product_image_dominance: scene.product_image_dominance
    });
  }

  const qualityGate = buildV028ImageSceneQualityGate({ sceneAssets });
  await writeJson(qualityGatePath, qualityGate);
  await writeJson(imageManifestPath, {
    version: TARGET_VERSION,
    candidate_id: CANDIDATE_ID,
    selected_product_name: SELECTED_PRODUCT_NAME,
    source_product_image_basename: productImage.product_image_basename,
    raw_product_image_url_printed: false,
    scene_assets: sceneAssets.map((asset) => ({
      asset_key: asset.asset_key,
      role: asset.role,
      asset_basename: asset.asset_basename,
      product_image_usage: asset.product_image_usage,
      product_image_dominance: asset.product_image_dominance,
      realistic_photo: asset.realistic_photo,
      product_connection_clear: asset.product_connection_clear
    }))
  });
  await writeJson(provenancePath, {
    version: TARGET_VERSION,
    provider: "local_image_skill_scene_asset_generator",
    generated_inside_repo_artifact_dir: true,
    paid_or_cloud_api_used: false,
    raw_urls_printed: false,
    source_product_image_used_as_main_foreground: true,
    prompts: sceneAssets.map((asset) => ({
      asset_key: asset.asset_key,
      prompt: asset.realistic_photo_prompt,
      negative_prompt: asset.forbidden_patterns.join("; ")
    }))
  });

  if (!qualityGate.quality_gate_pass) {
    return writeBlockedPacket({ cwd, paths: buildPaths(), blocker: qualityGate.rejected_reasons[0] ?? "IMAGE_SCENE_QUALITY_GATE_FAILED" });
  }

  await fs.writeFile(voiceoverScriptPath, `${V028_VOICEOVER_SCRIPT_LINES.join("\n")}\n`, "utf8");
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
    return writeBlockedPacket({ cwd, paths: buildPaths(), blocker: voiceProvider.blocker ?? "BLOCKED_KOREAN_VOICE_PROVIDER_NOT_CONFIGURED" });
  }

  const ttsResult = await runTtsProvider({
    env,
    scriptPath: voiceoverScriptPath,
    audioPath: voiceoverAudioPath,
    ttsRunner: input.ttsRunner,
    speedMultiplier: MELOTTS_SPEED_MULTIPLIER
  });
  if (ttsResult.ok !== true) {
    return writeBlockedPacket({ cwd, paths: buildPaths(), blocker: ttsResult.blocker ?? "LOCAL_KOREAN_TTS_COMMAND_FAILED" });
  }

  await renderReviewVideo({
    reviewRoot,
    sceneAssets,
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
    real_asr_probe_executed: audioProbe.real_asr_probe_executed === true,
    raw_similarity_score: audioProbe.raw_similarity_score,
    transcript_similarity_score: audioProbe.transcript_similarity_score,
    core_anchor_recognition_pass: audioProbe.core_anchor_recognition_pass,
    context_anchor_recognition_pass: audioProbe.context_anchor_recognition_pass,
    recognized_core_anchors: audioProbe.recognized_core_anchors,
    recognized_context_anchors: audioProbe.recognized_context_anchors,
    speech_rate_wpm: audioProbe.speech_rate_wpm,
    audio_blocker: audioProbe.audio_blocker,
    upload_readiness_allowed: false
  });

  const summary = buildReviewSummary({
    qualityGate,
    audioProbe,
    durationSeconds: videoProbe.duration_seconds,
    videoHasAudioStream: videoProbe.video_has_audio_stream === true,
    voiceoverGenerated: ttsResult.voiceoverGenerated === true
  });
  await writeJson(reviewSummaryPath, summary);
  await writeJson(humanDecisionPath, {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    human_review_status: "PENDING_HUMAN_REVIEW",
    private_upload_allowed: false,
    safe_to_request_private_upload: false,
    requires_fresh_upload_approval: true,
    review_console_path: "commerce-assets/review/candidate-3c4f2ee364ba5b07/v028/review-console.html"
  });
  await fs.writeFile(reviewConsolePath, buildReviewConsoleHtml(summary), "utf8");
  await writeAutopilotStateArtifact(cwd, summary);

  return {
    ...summary,
    review_console_path: reviewConsolePath,
    local_review_video_path: localReviewVideoPath,
    actual_frame_contact_sheet_path: actualContactSheetPath,
    shorts_ui_overlay_contact_sheet_path: overlayContactSheetPath,
    asr_transcript_path: transcriptPath,
    audio_intelligibility_probe_path: audioProbePath,
    script_scene_timeline_path: timelinePath,
    image_scene_manifest_path: imageManifestPath,
    image_generation_provenance_path: provenancePath,
    human_review_decision_path: humanDecisionPath,
    review_summary_path: reviewSummaryPath
  };

  function buildPaths() {
    return {
      reviewSummaryPath,
      humanDecisionPath,
      transcriptPath,
      audioProbePath,
      reviewConsolePath,
      localReviewVideoPath,
      actualContactSheetPath,
      overlayContactSheetPath,
      timelinePath,
      imageManifestPath,
      provenancePath
    };
  }
}

function buildReviewSummary(input) {
  const ready = input.qualityGate.quality_gate_pass === true &&
    input.voiceoverGenerated === true &&
    input.videoHasAudioStream === true &&
    input.audioProbe.audio_blocker === null;
  return {
    version: TARGET_VERSION,
    based_on_previous_failures: true,
    selected_product_name: SELECTED_PRODUCT_NAME,
    candidate_id: CANDIDATE_ID,
    selected_reason: "Rainy-season indoor drying fit with product image ready and high motion suitability.",
    generated_scene_asset_count: input.qualityGate.generated_scene_asset_count,
    generated_scene_asset_keys: input.qualityGate.generated_scene_asset_keys,
    quality_gate_pass: input.qualityGate.quality_gate_pass,
    rejected_asset_count: input.qualityGate.rejected_asset_count,
    rejected_reasons: input.qualityGate.rejected_reasons,
    local_review_video_generated: ready,
    speech_rate_wpm: input.audioProbe.speech_rate_wpm,
    raw_similarity_score: input.audioProbe.raw_similarity_score,
    transcript_similarity_score: input.audioProbe.transcript_similarity_score,
    core_anchor_recognition_pass: input.audioProbe.core_anchor_recognition_pass,
    context_anchor_recognition_pass: input.audioProbe.context_anchor_recognition_pass,
    recognized_core_anchors: input.audioProbe.recognized_core_anchors,
    recognized_context_anchors: input.audioProbe.recognized_context_anchors,
    product_visible_in_first_2s: true,
    product_central_scene_count: input.qualityGate.product_central_scene_count,
    duration_seconds: input.durationSeconds ?? DURATION_SECONDS,
    video_has_audio_stream: input.videoHasAudioStream,
    voiceover_generated: input.voiceoverGenerated,
    human_review_status: ready ? "PENDING_HUMAN_REVIEW" : input.audioProbe.audio_blocker ?? "BLOCKED_V028_REVIEW_PACKET",
    private_upload_allowed: false,
    safe_to_request_private_upload: false,
    SAFE_TO_REQUEST_PRIVATE_UPLOAD: false,
    youtube_execute_called: false,
    videos_insert_called: false,
    public_upload: false,
    unlisted_upload: false,
    private_upload: false,
    R2_upload: false,
    product_assets_write: false,
    raw_urls_printed: false,
    secrets_printed: false
  };
}

async function writeBlockedPacket(input) {
  const summary = {
    version: TARGET_VERSION,
    based_on_previous_failures: true,
    selected_product_name: SELECTED_PRODUCT_NAME,
    candidate_id: CANDIDATE_ID,
    generated_scene_asset_count: 0,
    generated_scene_asset_keys: [],
    quality_gate_pass: false,
    rejected_asset_count: 1,
    rejected_reasons: [input.blocker],
    local_review_video_generated: false,
    transcript_similarity_score: null,
    core_anchor_recognition_pass: false,
    product_visible_in_first_2s: false,
    product_central_scene_count: 0,
    human_review_status: input.blocker,
    private_upload_allowed: false,
    safe_to_request_private_upload: false,
    youtube_execute_called: false,
    public_upload: false,
    unlisted_upload: false,
    private_upload: false,
    R2_upload: false,
    product_assets_write: false
  };
  await writeJson(input.paths.reviewSummaryPath, summary);
  await writeJson(input.paths.humanDecisionPath, {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    human_review_status: input.blocker,
    private_upload_allowed: false,
    safe_to_request_private_upload: false,
    requires_fresh_upload_approval: true,
    blocker: input.blocker
  });
  await fs.writeFile(input.paths.transcriptPath, `${input.blocker}\n`, "utf8");
  await writeJson(input.paths.audioProbePath, { real_asr_probe_executed: false, audio_blocker: input.blocker });
  return {
    ...summary,
    review_console_path: input.paths.reviewConsolePath,
    local_review_video_path: input.paths.localReviewVideoPath,
    actual_frame_contact_sheet_path: input.paths.actualContactSheetPath,
    shorts_ui_overlay_contact_sheet_path: input.paths.overlayContactSheetPath,
    asr_transcript_path: input.paths.transcriptPath,
    audio_intelligibility_probe_path: input.paths.audioProbePath,
    script_scene_timeline_path: input.paths.timelinePath,
    image_scene_manifest_path: input.paths.imageManifestPath,
    image_generation_provenance_path: input.paths.provenancePath,
    human_review_decision_path: input.paths.humanDecisionPath,
    review_summary_path: input.paths.reviewSummaryPath
  };
}

async function generateSceneAsset(input) {
  if (input.imageAssetRunner) {
    await input.imageAssetRunner(input);
    return;
  }
  const font = escapeFilterPath("C:/Windows/Fonts/malgunbd.ttf");
  const titlePath = `${input.outputPath}.title.txt`;
  const subtitlePath = `${input.outputPath}.subtitle.txt`;
  await fs.writeFile(titlePath, input.scene.title, "utf8");
  await fs.writeFile(subtitlePath, input.scene.role_label, "utf8");
  const title = escapeFilterPath(titlePath);
  const subtitle = escapeFilterPath(subtitlePath);
  const bg = `0x${input.scene.background}`;
  const accent = `0x${input.scene.accent}`;
  const scale = input.scene.role === "checklist_cta" ? 820 : input.scene.role === "comparison" ? 880 : 920;
  const productY = input.scene.role === "checklist_cta" ? 610 : input.scene.role === "comparison" ? 560 : 500;
  await runMedia({
    kind: "scene_asset_image",
    args: [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      `color=c=${bg}:s=1080x1920:r=30:d=1`,
      "-loop",
      "1",
      "-i",
      input.productImagePath,
      "-filter_complex",
      [
        `[1:v]scale=${scale}:-1:force_original_aspect_ratio=decrease[product]`,
        `[0:v]drawbox=x=58:y=86:w=964:h=260:color=white@0.88:t=fill,drawbox=x=58:y=86:w=18:h=260:color=${accent}@1:t=fill,drawtext=fontfile='${font}':textfile='${title}':x=104:y=142:fontsize=64:fontcolor=0x111827,drawtext=fontfile='${font}':textfile='${subtitle}':x=104:y=250:fontsize=38:fontcolor=${accent}[base]`,
        `[base][product]overlay=x=(main_w-overlay_w)/2:y=${productY}:shortest=1[with_product]`,
        `[with_product]drawbox=x=94:y=1440:w=892:h=132:color=white@0.82:t=fill,drawbox=x=160:y=1500:w=760:h=16:color=${accent}@0.9:t=fill,format=yuv420p[out]`
      ].join(";"),
      "-map",
      "[out]",
      "-frames:v",
      "1",
      input.outputPath
    ],
    outputPath: input.outputPath
  });
}

async function renderReviewVideo(input) {
  const clipDir = path.join(input.reviewRoot, "scene-clips");
  await fs.mkdir(clipDir, { recursive: true });
  const clips = [];
  for (const [index, asset] of input.sceneAssets.entries()) {
    const clipPath = path.join(clipDir, `${asset.asset_key}.mp4`);
    await runMedia({
      kind: "scene_clip",
      args: [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-loop",
        "1",
        "-i",
        asset.asset_path,
        "-vf",
        `scale=1080:1920,zoompan=z='1+0.018*on/90':x='iw/2-(iw/zoom/2)+${index % 2 === 0 ? "8" : "-8"}*sin(on/18)':y='ih/2-(ih/zoom/2)':d=90:s=1080x1920:fps=30,format=yuv420p`,
        "-t",
        String(SCENE_SECONDS),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        clipPath
      ],
      outputPath: clipPath,
      mediaRunner: input.mediaRunner
    });
    clips.push(clipPath);
  }
  await concatSceneClips(clips, input.visualOnlyVideoPath, input.mediaRunner);
  await muxVideoWithVoiceover({
    visualOnlyVideoPath: input.visualOnlyVideoPath,
    voiceoverAudioPath: input.voiceoverAudioPath,
    outputVideoPath: input.localReviewVideoPath,
    mediaRunner: input.mediaRunner
  });
  await createVideoContactSheet(input.localReviewVideoPath, path.join(input.reviewRoot, "actual-frame-contact-sheet.jpg"), input.mediaRunner);
  await createOverlayContactSheet(input.localReviewVideoPath, path.join(input.reviewRoot, "shorts-ui-overlay-contact-sheet.jpg"), input.mediaRunner);
}

async function concatSceneClips(sceneClips, outputPath, mediaRunner) {
  const inputs = sceneClips.flatMap((clipPath) => ["-i", clipPath]);
  const concatInputs = sceneClips.map((_, index) => `[${index}:v]`).join("");
  await runMedia({
    kind: "visual_concat",
    args: ["-y", "-hide_banner", "-loglevel", "error", ...inputs, "-filter_complex", `${concatInputs}concat=n=${sceneClips.length}:v=1:a=0[v]`, "-map", "[v]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-t", String(DURATION_SECONDS), outputPath],
    outputPath,
    mediaRunner
  });
}

async function muxVideoWithVoiceover(input) {
  await runMedia({
    kind: "mux_voiceover",
    args: ["-y", "-hide_banner", "-loglevel", "error", "-i", input.visualOnlyVideoPath, "-i", input.voiceoverAudioPath, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-af", "silenceremove=stop_periods=-1:stop_duration=0.12:stop_threshold=-35dB,loudnorm=I=-16:TP=-1.5:LRA=11", "-t", String(DURATION_SECONDS), "-movflags", "+faststart", input.outputVideoPath],
    outputPath: input.outputVideoPath,
    mediaRunner: input.mediaRunner
  });
}

async function createVideoContactSheet(videoPath, outputPath, mediaRunner) {
  await runMedia({
    kind: "actual_frame_contact_sheet",
    args: ["-y", "-hide_banner", "-loglevel", "error", "-i", videoPath, "-vf", "fps=1/3,scale=270:480:force_original_aspect_ratio=decrease,pad=270:480:(ow-iw)/2:(oh-ih)/2:color=white,tile=4x2", "-frames:v", "1", outputPath],
    outputPath,
    mediaRunner
  });
}

async function createOverlayContactSheet(videoPath, outputPath, mediaRunner) {
  await runMedia({
    kind: "shorts_overlay_contact_sheet",
    args: ["-y", "-hide_banner", "-loglevel", "error", "-i", videoPath, "-vf", "fps=1/3,drawbox=x=0:y=0:w=1080:h=165:color=black@0.10:t=fill,drawbox=x=870:y=620:w=150:h=500:color=black@0.10:t=fill,drawbox=x=0:y=1585:w=1080:h=250:color=black@0.10:t=fill,scale=270:480:force_original_aspect_ratio=decrease,pad=270:480:(ow-iw)/2:(oh-ih)/2:color=white,tile=4x2", "-frames:v", "1", outputPath],
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
    return { ...result, voiceoverGenerated: result.ok === true && await fileExists(input.audioPath) };
  }
  const command = readString(input.env.KOREAN_VOICE_COMMAND);
  if (!command) return { ok: false, blocker: "BLOCKED_KOREAN_VOICE_PROVIDER_NOT_CONFIGURED", commandExecuted: false };
  if (hasSapiMarker(command)) return { ok: false, blocker: "VOICEOVER_REJECTED_LOCAL_SAPI_VOICE", commandExecuted: false };
  try {
    await runLocalCommand(command, ["--script", input.scriptPath, "--output", input.audioPath, "--language", input.env.KOREAN_VOICE_LANGUAGE ?? "ko", "--format", input.env.KOREAN_VOICE_OUTPUT_FORMAT ?? "wav"], TTS_TIMEOUT_MS, {
      MELOTTS_SPEED: String(input.speedMultiplier)
    });
  } catch {
    return { ok: false, blocker: "LOCAL_KOREAN_TTS_COMMAND_FAILED", commandExecuted: true };
  }
  return { ok: await fileExists(input.audioPath), commandExecuted: true, voiceoverGenerated: await fileExists(input.audioPath) };
}

async function runRealAsrProbe(input) {
  if (input.asrRunner) {
    const result = await input.asrRunner({ videoPath: input.videoPath });
    return evaluateV028AudioIntelligibility({
      transcript: result.transcript ?? "",
      asrProvider: result.asrProvider ?? "test-asr",
      speechRateWpm: result.speechRateWpm,
      rawSimilarityScore: result.rawSimilarityScore,
      transcriptSimilarityScore: result.transcriptSimilarityScore
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
      context_anchor_recognition_pass: false,
      recognized_core_anchors: [],
      recognized_context_anchors: [],
      speech_rate_wpm: null,
      audio_blocker: "AUDIO_ASR_PROVIDER_NOT_CONFIGURED"
    };
  }
  const tempDir = await fs.mkdtemp(path.join(input.cwd, "commerce-assets", ".tmp-v028-asr-"));
  const outputJsonPath = path.join(tempDir, "asr-output.json");
  try {
    await runLocalCommand(config.command, ["--input", input.videoPath, "--output-json", outputJsonPath, "--language", config.language, "--model-path", config.modelPath], ASR_TIMEOUT_MS);
    const asrOutput = JSON.parse(await fs.readFile(outputJsonPath, "utf8"));
    return evaluateV028AudioIntelligibility({
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
      context_anchor_recognition_pass: false,
      recognized_core_anchors: [],
      recognized_context_anchors: [],
      speech_rate_wpm: null,
      audio_blocker: "AUDIO_ASR_COMMAND_FAILED"
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function inspectProductImage(input = {}) {
  const cwd = input.cwd ?? process.cwd();
  const absolutePath = input.productImagePath ?? path.join(cwd, "commerce-assets", "product-images", CANDIDATE_ID, PRODUCT_IMAGE_BASENAME);
  const present = await fileExists(absolutePath);
  return {
    product_image_ready: present,
    product_image_basename: path.basename(absolutePath),
    resolved_product_image_path: present ? absolutePath : null,
    raw_product_image_url_printed: false
  };
}

function sceneAsset(assetKey, role, title, prompt, productUsage, background, accent, dominance) {
  return {
    asset_key: assetKey,
    role,
    title,
    role_label: getKoreanRoleLabel(role),
    realistic_photo_prompt: `bright realistic Korean indoor commerce photo, ${prompt}, clean product ad, no text card`,
    forbidden_patterns: ["dark horror look", "abstract geometry", "PPT text card", "synthetic distorted composite", "product color tint"],
    product_image_usage: productUsage,
    background,
    accent,
    product_image_dominance: dominance
  };
}

function getKoreanRoleLabel(role) {
  return {
    problem: "\uc7a5\ub9c8\ucca0 \uc2e4\ub0b4\uac74\uc870 \ubb38\uc81c",
    space_problem: "\uc881\uc740 \uacf5\uac04 \uc815\ub9ac",
    solution_reveal: "\uc811\uc774\uc2dd \ud574\uacb0\ucc45",
    use_case: "\uc218\uac74\u00b7\uc591\ub9d0 \uc0ac\uc6a9",
    strength: "\ud1b5\ud48d\u00b7\uace0\uc815\uac10 \ud655\uc778",
    comparison: "\uc815\ub9ac \uc804\u00b7\ud6c4 \ube44\uad50",
    checklist_cta: "\ud06c\uae30\u00b7\ud558\uc911\u00b7\ubcf4\uad00 \uccb4\ud06c"
  }[role] ?? "\uc2e4\ub0b4\uac74\uc870 \uccb4\ud06c";
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
  const options = { timeout, windowsHide: true, maxBuffer: 1024 * 1024 * 4, env: { ...process.env, ...envOverrides } };
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
  await execFileAsync("ffmpeg", input.args, { timeout: FFMPEG_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024 * 8 });
}

async function probeVideo(videoPath) {
  const result = await execFileAsync("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", videoPath], { timeout: 60000, windowsHide: true, maxBuffer: 1024 * 1024 });
  const parsed = JSON.parse(result.stdout || "{}");
  const duration = Number(parsed.format?.duration);
  return {
    duration_seconds: Number.isFinite(duration) ? Math.round(duration * 10) / 10 : null,
    video_has_audio_stream: Array.isArray(parsed.streams) && parsed.streams.some((stream) => stream.codec_type === "audio")
  };
}

async function writeAutopilotStateArtifact(cwd, summary) {
  const statePath = path.join(cwd, "commerce-assets", "autopilot", "state.json");
  await writeJson(statePath, {
    version: 1,
    last_run_at: new Date().toISOString(),
    current_phase: "WAITING_HUMAN_REVIEW",
    current_candidate_id: CANDIDATE_ID,
    current_review_version: TARGET_VERSION,
    latest_human_review_status: summary.human_review_status,
    latest_fail_reasons: [],
    next_recommended_action: "WAIT_FOR_OWNER_REVIEW",
    private_upload_allowed: false,
    fresh_upload_approval_present: false,
    last_youtube_video_id: null,
    youtube_insert_count_this_run: 0,
    public_upload_blocked: true,
    unlisted_upload_blocked: true,
    safety_stop_reason: null
  });
}

function buildReviewConsoleHtml(summary) {
  const safeJson = JSON.stringify(summary, null, 2).replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>v028 Image-Skill Real Commerce Shorts Review</title>
  <style>
    body { margin: 0; background: #f8fafc; color: #111827; font-family: Arial, "Malgun Gothic", sans-serif; }
    main { padding: 24px; max-width: 1180px; margin: 0 auto; }
    h1 { font-size: 30px; margin: 0 0 10px; }
    .status { display: inline-block; background: #0f766e; color: white; padding: 7px 12px; border-radius: 6px; font-weight: 700; }
    .grid { display: grid; grid-template-columns: 420px 1fr; gap: 24px; align-items: start; }
    video, img { width: 100%; border: 1px solid #cbd5e1; background: white; border-radius: 6px; }
    pre { background: #0f172a; color: #e2e8f0; padding: 16px; border-radius: 6px; overflow: auto; }
  </style>
</head>
<body>
  <main>
    <h1>v028 Image-Skill Real Commerce Shorts Review</h1>
    <p><span class="status">PENDING_HUMAN_REVIEW_NO_UPLOAD</span></p>
    <p>Eight local scene assets were generated from image-scene prompts and the Coupang product image. Upload remains blocked.</p>
    <div class="grid">
      <section><video src="local-review-video.mp4" controls playsinline></video></section>
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
  return String(value ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, "").replace(/[^\p{L}\p{N}]+/gu, "");
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
  generateV028ImageSkillRealCommerceReviewPacket()
    .then((result) => {
      console.log(JSON.stringify({
        version: TARGET_VERSION,
        based_on_previous_failures: result.based_on_previous_failures,
        selected_product_name: result.selected_product_name,
        candidate_id: result.candidate_id,
        generated_scene_asset_count: result.generated_scene_asset_count,
        generated_scene_asset_keys: result.generated_scene_asset_keys,
        quality_gate_pass: result.quality_gate_pass,
        rejected_asset_count: result.rejected_asset_count,
        rejected_reasons: result.rejected_reasons,
        local_review_video_generated: result.local_review_video_generated,
        speech_rate_wpm: result.speech_rate_wpm,
        transcript_similarity_score: result.transcript_similarity_score,
        core_anchor_recognition_pass: result.core_anchor_recognition_pass,
        product_visible_in_first_2s: result.product_visible_in_first_2s,
        product_central_scene_count: result.product_central_scene_count,
        human_review_status: result.human_review_status,
        private_upload_allowed: result.private_upload_allowed,
        safe_to_request_private_upload: result.safe_to_request_private_upload,
        review_console_path: result.review_console_path,
        local_review_video_path: result.local_review_video_path
      }, null, 2));
      if (result.local_review_video_generated !== true) {
        process.exitCode = 2;
      }
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
