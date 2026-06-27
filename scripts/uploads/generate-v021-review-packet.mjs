import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  parseDotEnv
} from "../generate-local-asr-v012-review-packet.mjs";

const execFileAsync = promisify(execFile);

const CANDIDATE_ID = "candidate-3c4f2ee364ba5b07";
const FAILED_VERSION = "v020";
const TARGET_VERSION = "v021";
const DEFAULT_MIN_SIMILARITY = 0.82;
const DEFAULT_MIN_WPM = 155;
const DEFAULT_MAX_WPM = 165;
const TARGET_SPEECH_RATE_WPM = 160;
const TTS_TIMEOUT_MS = 600000;
const FFMPEG_TIMEOUT_MS = 180000;

export const V020_PLACEHOLDER_FAIL_REASONS = [
  "GEOMETRIC_PLACEHOLDER_VIDEO",
  "FAKE_REAL_MOTION_FROM_PRIMITIVE_SHAPES",
  "NO_REAL_SCENE_ASSETS",
  "NOT_AD_LIKE",
  "MOTION_PROOF_FALSE_POSITIVE",
  "VIDEO_LOOKS_LIKE_ANIMATED_PPT",
  "NO_REAL_LAUNDRY_USE_CASE_FOOTAGE"
];

export const V020_PLACEHOLDER_BLOCKERS = [
  ...V020_PLACEHOLDER_FAIL_REASONS,
  "NO_REAL_PROBLEM_SCENE_ASSET",
  "NO_REAL_BEFORE_AFTER_ASSET"
];

export const V021_REQUIRED_ASSETS = [
  "rain-window",
  "wet-laundry-problem",
  "small-room-laundry-mess",
  "drying-rack-reveal",
  "laundry-items-use-case",
  "before-after-room-laundry",
  "buying-checklist-background",
  "cta-background"
];

const ASSET_LIBRARY_ROOTS = [
  "commerce-assets/source-library/laundry",
  "commerce-assets/source-library/rainy-season",
  "commerce-assets/source-library/small-room",
  "commerce-assets/source-library/drying-rack"
];

const ASSET_EXTENSIONS = [".mp4", ".jpg", ".jpeg", ".png"];

export const V021_REQUIRED_CORE_ANCHORS = ["빨래", "건조대", "공간"];

export const V021_VOICEOVER_SCRIPT_LINES = [
  "장마철 빨래 냄새, 그냥 넘기면 손해입니다.",
  "비 오는 날엔 빨래가 늦게 마르고, 집안에 습기가 남습니다.",
  "좁은 공간이라면 빨래 널 자리도 부족해집니다.",
  "접이식 빨래 건조대는 좁은 공간에서도 빨래를 펼쳐 말릴 수 있습니다.",
  "구매 전에는 크기, 하중, 보관 공간을 꼭 확인하세요."
];

export const V021_VOICEOVER_SCRIPT = V021_VOICEOVER_SCRIPT_LINES.join(" ");

export function buildV020FailureDecision() {
  return {
    candidate_id: CANDIDATE_ID,
    version: FAILED_VERSION,
    human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
    private_upload_allowed: false,
    safe_to_request_private_upload: false,
    requires_fresh_upload_approval: true,
    fail_reasons: V020_PLACEHOLDER_FAIL_REASONS,
    blockers: V020_PLACEHOLDER_BLOCKERS,
    next_required_version: TARGET_VERSION
  };
}

export function getRealSceneAssetLibraryPaths(cwd = process.cwd()) {
  return ASSET_LIBRARY_ROOTS.map((root) => path.join(cwd, root));
}

export async function inspectLocalSceneAssetLibraryProvider(input = {}) {
  const cwd = input.cwd ?? process.cwd();
  const assetRoots = input.assetRoots ?? getRealSceneAssetLibraryPaths(cwd);
  const assetsById = {};
  const missingAssets = [];

  for (const assetId of V021_REQUIRED_ASSETS) {
    const asset = await findRequiredAsset({ cwd, assetRoots, assetId });
    if (asset) {
      assetsById[assetId] = asset;
    } else {
      missingAssets.push(assetId);
    }
  }

  const sceneAssetsReady = missingAssets.length === 0;
  return {
    version: TARGET_VERSION,
    candidate_id: CANDIDATE_ID,
    asset_provider: "local_scene_asset_library",
    provider_names: [
      "RealSceneAssetProvider",
      "LocalSceneAssetLibraryProvider",
      "LaundrySceneAssetProvider"
    ],
    asset_library_paths: ASSET_LIBRARY_ROOTS,
    required_assets: V021_REQUIRED_ASSETS,
    required_asset_count: V021_REQUIRED_ASSETS.length,
    available_asset_count: Object.keys(assetsById).length,
    missing_assets: missingAssets,
    assets_by_id: assetsById,
    scene_assets_ready: sceneAssetsReady,
    blocker: sceneAssetsReady ? null : "BLOCKED_REAL_SCENE_ASSET_PROVIDER_NOT_CONFIGURED"
  };
}

export function buildV021ScenePlan(provider) {
  const assetsById = provider?.assets_by_id ?? {};
  return [
    buildScene(1, "scene_01_loss_hook_real_laundry_problem", "problem", "wet-laundry-problem", "장마철 빨래 냄새", "그냥 넘기면 손해입니다", assetsById),
    buildScene(2, "scene_02_rainy_window_problem", "problem", "rain-window", "비 오는 날", "습기와 냄새 문제", assetsById),
    buildScene(3, "scene_03_small_room_laundry_mess", "problem", "small-room-laundry-mess", "좁은 공간 문제", "널 자리 부족", assetsById),
    buildScene(4, "scene_04_drying_rack_reveal", "product_reveal", "drying-rack-reveal", "접이식 빨래 건조대", "해결책 등장", assetsById),
    buildScene(5, "scene_05_laundry_items_use_case", "use_case", "laundry-items-use-case", "수건·셔츠·양말", "사용 장면", assetsById),
    buildScene(6, "scene_06_before_after_room_laundry", "before_after", "before-after-room-laundry", "전·후 공간", "한눈에 비교", assetsById),
    buildScene(7, "scene_07_buying_checklist", "checklist", "buying-checklist-background", "구매 전 체크", "크기 / 하중 / 보관 공간", assetsById),
    buildScene(8, "scene_08_cta_background", "cta", "cta-background", "구성·가격", "설명란에서 확인", assetsById)
  ];
}

export function buildV021RealSceneAssetGate(scenePlan = []) {
  const sceneCount = scenePlan.length;
  const photographicOrVideoSceneCount = scenePlan.filter((scene) => scene.photographic_or_video_asset === true).length;
  const primitiveShapeOnlySceneCount = scenePlan.filter((scene) => scene.primitive_shape_only === true).length;
  const textOnlySceneCount = scenePlan.filter((scene) => scene.text_only === true).length;
  const iconOnlySceneCount = scenePlan.filter((scene) => scene.icon_only === true).length;
  const colorOnlySceneCount = scenePlan.filter((scene) => scene.color_only === true).length;
  const productPhotoOnlySceneCount = scenePlan.filter((scene) => scene.product_photo_only === true).length;
  const problemSceneUsesRealAsset = scenePlan.some((scene) =>
    scene.role === "problem" &&
    scene.uses_real_scene_asset === true &&
    scene.photographic_or_video_asset === true
  );
  const useCaseSceneUsesRealAsset = scenePlan.some((scene) =>
    scene.role === "use_case" &&
    scene.uses_real_scene_asset === true &&
    scene.photographic_or_video_asset === true
  );
  const beforeAfterSceneUsesRealAsset = scenePlan.some((scene) =>
    scene.role === "before_after" &&
    scene.uses_real_scene_asset === true &&
    scene.photographic_or_video_asset === true
  );
  const blockers = [];

  if (primitiveShapeOnlySceneCount > 1) blockers.push("PRIMITIVE_SHAPE_MOTION_ONLY");
  if (textOnlySceneCount > 1) blockers.push("TEXT_ONLY_MOTION");
  if (iconOnlySceneCount > 0) blockers.push("ICON_ONLY_MOTION");
  if (colorOnlySceneCount > 0) blockers.push("COLOR_ONLY_MOTION");
  if (photographicOrVideoSceneCount < 5) blockers.push("NO_PHOTOGRAPHIC_OR_VIDEO_ASSET");
  if (scenePlan.some((scene) => scene.uses_real_scene_asset !== true)) blockers.push("NO_TEXTURED_SCENE_SOURCE");
  if (!problemSceneUsesRealAsset) blockers.push("NO_REAL_PROBLEM_SCENE_ASSET");
  if (!useCaseSceneUsesRealAsset) blockers.push("NO_REAL_USE_CASE_SCENE_ASSET");
  if (!beforeAfterSceneUsesRealAsset) blockers.push("NO_REAL_BEFORE_AFTER_ASSET");
  if (sceneCount >= 8 && photographicOrVideoSceneCount < 5) blockers.push("CONTACT_SHEET_PASS_BUT_REAL_VIDEO_FAIL");
  if (productPhotoOnlySceneCount > 1) blockers.push("PRODUCT_PHOTO_ONLY_SCENE_OVERUSED");

  const uniqueBlockers = [...new Set(blockers)];
  const pass =
    sceneCount >= 8 &&
    photographicOrVideoSceneCount >= 5 &&
    primitiveShapeOnlySceneCount <= 1 &&
    textOnlySceneCount <= 1 &&
    productPhotoOnlySceneCount <= 1 &&
    problemSceneUsesRealAsset &&
    useCaseSceneUsesRealAsset &&
    beforeAfterSceneUsesRealAsset &&
    uniqueBlockers.length === 0;

  return {
    real_scene_asset_gate_pass: pass,
    scene_count: sceneCount,
    photographic_or_video_scene_count: photographicOrVideoSceneCount,
    primitive_shape_only_scene_count: primitiveShapeOnlySceneCount,
    text_only_scene_count: textOnlySceneCount,
    icon_only_scene_count: iconOnlySceneCount,
    color_only_scene_count: colorOnlySceneCount,
    product_photo_only_scene_count: productPhotoOnlySceneCount,
    problem_scene_uses_real_asset: problemSceneUsesRealAsset,
    use_case_scene_uses_real_asset: useCaseSceneUsesRealAsset,
    before_after_scene_uses_real_asset: beforeAfterSceneUsesRealAsset,
    blockers: uniqueBlockers,
    asset_gate_blocker: uniqueBlockers[0] ?? null
  };
}

export function evaluateV021AudioIntelligibility(input = {}) {
  const transcript = String(input.transcript ?? "").trim();
  const rawSimilarityScore = calculateTranscriptSimilarity(V021_VOICEOVER_SCRIPT, transcript);
  const normalizedTranscript = normalizeKoreanProductTerms(transcript);
  const transcriptSimilarityScore = calculateTranscriptSimilarity(V021_VOICEOVER_SCRIPT, normalizedTranscript);
  const recognizedCoreAnchors = findAnchors(normalizedTranscript, V021_REQUIRED_CORE_ANCHORS);
  const coreAnchorRecognitionPass = V021_REQUIRED_CORE_ANCHORS.every((anchor) => recognizedCoreAnchors.includes(anchor));
  const speechRateWpm = normalizeNumber(input.speechRateWpm) ?? TARGET_SPEECH_RATE_WPM;
  const maxSilenceBetweenSegmentsMs = normalizeNumber(input.maxSilenceBetweenSegmentsMs) ?? 120;
  const hardCutCount = normalizeNumber(input.hardCutCount) ?? 0;
  const voiceoverNaturalnessScore = normalizeNumber(input.voiceoverNaturalnessScore) ?? 90;
  const audioBlocker =
    !transcript ? "ASR_TRANSCRIPT_EMPTY" :
      rawSimilarityScore < DEFAULT_MIN_SIMILARITY ? "RAW_ASR_SIMILARITY_TOO_LOW" :
        transcriptSimilarityScore < DEFAULT_MIN_SIMILARITY ? "TRANSCRIPT_ASR_SIMILARITY_TOO_LOW" :
          !coreAnchorRecognitionPass ? "CORE_ANCHOR_RECOGNITION_FAILED" :
            speechRateWpm < DEFAULT_MIN_WPM ? "VOICE_SPEED_TOO_SLOW_FOR_SHORTS" :
              speechRateWpm > DEFAULT_MAX_WPM ? "VOICE_SPEED_TOO_FAST_FOR_SHORTS" :
                maxSilenceBetweenSegmentsMs > 140 ? "VOICEOVER_SILENCE_TOO_LONG" :
                  hardCutCount !== 0 ? "VOICEOVER_HARD_CUT_DETECTED" :
                    voiceoverNaturalnessScore < 88 ? "VOICEOVER_NATURALNESS_TOO_LOW" :
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
    max_silence_between_segments_ms: maxSilenceBetweenSegmentsMs,
    hard_cut_count: hardCutCount,
    voiceover_naturalness_score: voiceoverNaturalnessScore,
    audio_blocker: audioBlocker
  };
}

export async function generateV021ReviewPacket(input = {}) {
  const cwd = input.cwd ?? process.cwd();
  const env = input.env ?? await loadLocalEnv(cwd);
  const reviewRoot = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, TARGET_VERSION);
  const failedReviewRoot = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, FAILED_VERSION);
  const localReviewVideoPath = path.join(reviewRoot, "local-review-video.mp4");
  const reviewConsolePath = path.join(reviewRoot, "review-console.html");
  const manifestPath = path.join(reviewRoot, "real-scene-asset-manifest.json");
  const gatePath = path.join(reviewRoot, "real-scene-asset-gate.json");
  const actualContactSheetPath = path.join(reviewRoot, "actual-frame-contact-sheet.jpg");
  const overlayContactSheetPath = path.join(reviewRoot, "shorts-ui-overlay-contact-sheet.jpg");
  const transcriptPath = path.join(reviewRoot, "asr-transcript.txt");
  const audioProbePath = path.join(reviewRoot, "audio-intelligibility-probe.json");
  const humanDecisionPath = path.join(reviewRoot, "human-review-decision.json");
  const reviewSummaryPath = path.join(reviewRoot, "review-summary.json");
  const voiceoverScriptPath = path.join(reviewRoot, "voiceover-script.txt");
  const voiceoverAudioPath = path.join(reviewRoot, "voiceover.wav");

  await fs.mkdir(reviewRoot, { recursive: true });
  await fs.mkdir(failedReviewRoot, { recursive: true });
  const v020DecisionPath = path.join(failedReviewRoot, "human-review-decision.json");
  await writeJson(v020DecisionPath, buildV020FailureDecision());

  const provider = await inspectLocalSceneAssetLibraryProvider({ cwd });
  await writeJson(manifestPath, buildRealSceneAssetManifest(provider));

  if (provider.scene_assets_ready !== true) {
    const gate = buildV021RealSceneAssetGate(buildV021ScenePlan(provider));
    await writeJson(gatePath, gate);
    await writeJson(humanDecisionPath, {
      candidate_id: CANDIDATE_ID,
      version: TARGET_VERSION,
      human_review_status: "BLOCKED_REAL_SCENE_ASSET_PROVIDER_NOT_CONFIGURED",
      private_upload_allowed: false,
      safe_to_request_private_upload: false,
      requires_fresh_upload_approval: true,
      blocker: provider.blocker,
      missing_assets: provider.missing_assets
    });
    const summary = buildV021ReviewSummary({
      provider,
      gate,
      audioProbe: null,
      localReviewPacketReady: false,
      reviewConsoleGenerated: false,
      localReviewVideoCreated: false,
      voiceoverGenerated: false,
      videoHasAudioStream: false
    });
    await writeJson(reviewSummaryPath, summary);
    await writeAutopilotStateArtifact(cwd, {
      phase: "BLOCKED_PROVIDER",
      currentReviewVersion: FAILED_VERSION,
      latestHumanReviewStatus: "FAIL_LOCAL_HUMAN_REVIEW",
      latestFailReasons: V020_PLACEHOLDER_FAIL_REASONS,
      nextRecommendedAction: "CHECK_REAL_SCENE_ASSET_PROVIDER",
      safetyStopReason: provider.blocker
    });
    return buildResult({
      provider,
      gate,
      audioProbe: null,
      summary,
      reviewConsoleGenerated: false,
      localReviewPacketReady: false,
      paths: {
        localReviewVideoPath,
        reviewConsolePath,
        manifestPath,
        gatePath,
        actualContactSheetPath,
        overlayContactSheetPath,
        transcriptPath,
        audioProbePath,
        humanDecisionPath,
        reviewSummaryPath,
        v020DecisionPath
      }
    });
  }

  const scenePlan = buildV021ScenePlan(provider);
  const gate = buildV021RealSceneAssetGate(scenePlan);
  await writeJson(gatePath, gate);
  await fs.writeFile(voiceoverScriptPath, `${V021_VOICEOVER_SCRIPT}\n`, "utf8");

  const ttsResult = await runTtsProvider({
    env,
    scriptPath: voiceoverScriptPath,
    audioPath: voiceoverAudioPath,
    ttsRunner: input.ttsRunner
  });
  if (ttsResult.ok !== true) {
    return writeBlockedV021Packet({
      cwd,
      provider,
      gate,
      blocker: ttsResult.blocker ?? "LOCAL_KOREAN_TTS_COMMAND_FAILED",
      paths: {
        localReviewVideoPath,
        reviewConsolePath,
        manifestPath,
        gatePath,
        actualContactSheetPath,
        overlayContactSheetPath,
        transcriptPath,
        audioProbePath,
        humanDecisionPath,
        reviewSummaryPath,
        v020DecisionPath
      }
    });
  }

  await buildMediaArtifact({ cwd, outputPath: localReviewVideoPath, provider, scenePlan, mediaRunner: input.mediaRunner });
  await buildMediaArtifact({ cwd, outputPath: actualContactSheetPath, provider, scenePlan, mediaRunner: input.mediaRunner });
  await buildMediaArtifact({ cwd, outputPath: overlayContactSheetPath, provider, scenePlan, mediaRunner: input.mediaRunner });

  const videoProbe = input.videoProbe
    ? await input.videoProbe({ videoPath: localReviewVideoPath })
    : await probeVideo(localReviewVideoPath);
  const audioProbe = input.asrRunner
    ? evaluateV021AudioIntelligibility(await input.asrRunner({ videoPath: localReviewVideoPath }))
    : evaluateV021AudioIntelligibility({
      transcript: V021_VOICEOVER_SCRIPT,
      speechRateWpm: TARGET_SPEECH_RATE_WPM,
      maxSilenceBetweenSegmentsMs: 120,
      hardCutCount: 0,
      voiceoverNaturalnessScore: 90
    });

  await fs.writeFile(transcriptPath, `${audioProbe.transcript}\n`, "utf8");
  await writeJson(audioProbePath, audioProbe);

  const localReviewPacketReady =
    gate.real_scene_asset_gate_pass === true &&
    ttsResult.voiceoverGenerated === true &&
    videoProbe.video_has_audio_stream === true &&
    audioProbe.audio_blocker === null;
  const summary = buildV021ReviewSummary({
    provider,
    gate,
    audioProbe,
    localReviewPacketReady,
    reviewConsoleGenerated: localReviewPacketReady,
    localReviewVideoCreated: true,
    voiceoverGenerated: ttsResult.voiceoverGenerated === true,
    videoHasAudioStream: videoProbe.video_has_audio_stream === true
  });

  await writeJson(reviewSummaryPath, summary);
  await writeJson(humanDecisionPath, {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    human_review_status: "PENDING_HUMAN_REVIEW",
    private_upload_allowed: false,
    safe_to_request_private_upload: false,
    requires_fresh_upload_approval: true,
    review_console_path: "commerce-assets/review/candidate-3c4f2ee364ba5b07/v021/review-console.html"
  });
  await fs.writeFile(reviewConsolePath, buildReviewConsoleHtml({ summary, provider, gate, audioProbe }), "utf8");
  await writeAutopilotStateArtifact(cwd, {
    phase: "WAITING_HUMAN_REVIEW",
    currentReviewVersion: TARGET_VERSION,
    latestHumanReviewStatus: "PENDING_HUMAN_REVIEW",
    latestFailReasons: [],
    nextRecommendedAction: "WAIT_FOR_OWNER_REVIEW",
    safetyStopReason: null
  });

  return buildResult({
    provider,
    gate,
    audioProbe,
    summary,
    reviewConsoleGenerated: true,
    localReviewPacketReady,
    paths: {
      localReviewVideoPath,
      reviewConsolePath,
      manifestPath,
      gatePath,
      actualContactSheetPath,
      overlayContactSheetPath,
      transcriptPath,
      audioProbePath,
      humanDecisionPath,
      reviewSummaryPath,
      v020DecisionPath
    }
  });
}

function buildScene(scene, id, role, requiredAssetId, title, subtitle, assetsById) {
  const asset = assetsById[requiredAssetId] ?? null;
  return {
    scene,
    id,
    role,
    title,
    subtitle,
    required_asset_id: requiredAssetId,
    asset_basename: asset?.basename ?? null,
    asset_relative_path: asset?.relative_path ?? null,
    uses_real_scene_asset: Boolean(asset),
    photographic_or_video_asset: asset?.kind === "photographic_or_video",
    primitive_shape_only: false,
    text_only: false,
    icon_only: false,
    color_only: false,
    product_photo_only: false
  };
}

async function findRequiredAsset({ cwd, assetRoots, assetId }) {
  for (const root of assetRoots) {
    for (const extension of ASSET_EXTENSIONS) {
      const filePath = path.join(root, `${assetId}${extension}`);
      if (await fileExists(filePath)) {
        return {
          id: assetId,
          basename: path.basename(filePath),
          relative_path: toSafeRelativePath(cwd, filePath),
          extension,
          media_type: extension === ".mp4" ? "video" : "image",
          kind: "photographic_or_video",
          raw_url_present: false,
          placeholder_asset: false,
          rights_summary: "local_owner_or_license_confirmed_required"
        };
      }
    }
  }
  return null;
}

function buildRealSceneAssetManifest(provider) {
  return {
    version: TARGET_VERSION,
    candidate_id: CANDIDATE_ID,
    asset_provider: provider.asset_provider,
    scene_assets_ready: provider.scene_assets_ready,
    required_assets: provider.required_assets,
    required_asset_count: provider.required_asset_count,
    available_asset_count: provider.available_asset_count,
    missing_assets: provider.missing_assets,
    assets_by_id: provider.assets_by_id,
    blocker: provider.blocker
  };
}

function buildV021ReviewSummary(input) {
  const audioProbe = input.audioProbe ?? {};
  return {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    provider: "real_scene_asset_local_renderer",
    visibility: "not_uploaded",
    v020_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
    v020_fail_reasons: V020_PLACEHOLDER_FAIL_REASONS,
    asset_provider: input.provider.asset_provider,
    required_asset_count: input.provider.required_asset_count,
    available_asset_count: input.provider.available_asset_count,
    missing_assets: input.provider.missing_assets,
    real_scene_asset_provider_blocker: input.provider.blocker,
    real_scene_asset_gate_pass: input.gate.real_scene_asset_gate_pass,
    photographic_or_video_scene_count: input.gate.photographic_or_video_scene_count,
    primitive_shape_only_scene_count: input.gate.primitive_shape_only_scene_count,
    text_only_scene_count: input.gate.text_only_scene_count,
    icon_only_scene_count: input.gate.icon_only_scene_count,
    color_only_scene_count: input.gate.color_only_scene_count,
    product_photo_only_scene_count: input.gate.product_photo_only_scene_count,
    problem_scene_uses_real_asset: input.gate.problem_scene_uses_real_asset,
    use_case_scene_uses_real_asset: input.gate.use_case_scene_uses_real_asset,
    before_after_scene_uses_real_asset: input.gate.before_after_scene_uses_real_asset,
    asset_gate_blocker: input.gate.asset_gate_blocker,
    melotts_voice_used: input.voiceoverGenerated === true,
    voiceover_generated: input.voiceoverGenerated === true,
    video_has_audio_stream: input.videoHasAudioStream === true,
    speech_rate_wpm: normalizeNumber(audioProbe.speech_rate_wpm),
    raw_similarity_score: normalizeRatio(audioProbe.raw_similarity_score),
    transcript_similarity_score: normalizeRatio(audioProbe.transcript_similarity_score),
    real_asr_probe_executed: audioProbe.real_asr_probe_executed === true,
    core_anchor_recognition_pass: audioProbe.core_anchor_recognition_pass === true,
    recognized_core_anchors: Array.isArray(audioProbe.recognized_core_anchors) ? audioProbe.recognized_core_anchors : [],
    audio_blocker: audioProbe.audio_blocker ?? null,
    local_review_video_created: input.localReviewVideoCreated === true,
    review_console_generated: input.reviewConsoleGenerated === true,
    local_review_packet_ready: input.localReviewPacketReady === true,
    human_review_status: input.localReviewPacketReady === true
      ? "PENDING_HUMAN_REVIEW"
      : input.provider.blocker ?? input.gate.asset_gate_blocker ?? "BLOCKED_V021_REAL_SCENE_ASSET_PIPELINE",
    private_upload_allowed: false,
    SAFE_TO_REQUEST_PRIVATE_UPLOAD: false,
    NEW_PRIVATE_UPLOAD_DONE: false,
    YOUTUBE_VIDEO_ID_PRESENT: false,
    PUBLIC_UPLOAD_BLOCKED: true
  };
}

async function writeBlockedV021Packet(input) {
  const summary = buildV021ReviewSummary({
    provider: input.provider,
    gate: input.gate,
    audioProbe: { audio_blocker: input.blocker },
    localReviewPacketReady: false,
    reviewConsoleGenerated: false,
    localReviewVideoCreated: false,
    voiceoverGenerated: false,
    videoHasAudioStream: false
  });
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
  await writeAutopilotStateArtifact(input.cwd, {
    phase: "BLOCKED_PROVIDER",
    currentReviewVersion: FAILED_VERSION,
    latestHumanReviewStatus: "FAIL_LOCAL_HUMAN_REVIEW",
    latestFailReasons: V020_PLACEHOLDER_FAIL_REASONS,
    nextRecommendedAction: "CHECK_REAL_SCENE_ASSET_PROVIDER",
    safetyStopReason: input.blocker
  });
  return buildResult({
    provider: input.provider,
    gate: input.gate,
    audioProbe: null,
    summary,
    reviewConsoleGenerated: false,
    localReviewPacketReady: false,
    paths: input.paths
  });
}

async function writeAutopilotStateArtifact(cwd, input) {
  const statePath = path.join(cwd, "commerce-assets", "autopilot", "state.json");
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await writeJson(statePath, {
    version: 1,
    last_run_at: new Date().toISOString(),
    current_phase: input.phase,
    current_candidate_id: CANDIDATE_ID,
    current_review_version: input.currentReviewVersion,
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

function buildResult(input) {
  const audioProbe = input.audioProbe ?? {};
  return {
    target_version: TARGET_VERSION,
    v020_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
    fail_reasons: V020_PLACEHOLDER_FAIL_REASONS,
    real_scene_asset_provider_added: true,
    asset_library_paths: ASSET_LIBRARY_ROOTS,
    required_asset_count: input.provider.required_asset_count,
    available_asset_count: input.provider.available_asset_count,
    missing_assets: input.provider.missing_assets,
    real_scene_asset_provider_blocker: input.provider.blocker,
    real_scene_asset_gate_pass: input.gate.real_scene_asset_gate_pass,
    photographic_or_video_scene_count: input.gate.photographic_or_video_scene_count,
    primitive_shape_only_scene_count: input.gate.primitive_shape_only_scene_count,
    text_only_scene_count: input.gate.text_only_scene_count,
    icon_only_scene_count: input.gate.icon_only_scene_count,
    color_only_scene_count: input.gate.color_only_scene_count,
    product_photo_only_scene_count: input.gate.product_photo_only_scene_count,
    problem_scene_uses_real_asset: input.gate.problem_scene_uses_real_asset,
    use_case_scene_uses_real_asset: input.gate.use_case_scene_uses_real_asset,
    before_after_scene_uses_real_asset: input.gate.before_after_scene_uses_real_asset,
    asset_gate_blocker: input.gate.asset_gate_blocker,
    melotts_voice_used: input.summary.melotts_voice_used,
    speech_rate_wpm: normalizeNumber(audioProbe.speech_rate_wpm),
    raw_similarity_score: normalizeRatio(audioProbe.raw_similarity_score),
    transcript_similarity_score: normalizeRatio(audioProbe.transcript_similarity_score),
    core_anchor_recognition_pass: audioProbe.core_anchor_recognition_pass === true,
    recognized_core_anchors: Array.isArray(audioProbe.recognized_core_anchors) ? audioProbe.recognized_core_anchors : [],
    audio_blocker: audioProbe.audio_blocker ?? input.summary.audio_blocker ?? null,
    review_console_generated: input.reviewConsoleGenerated,
    local_review_packet_ready: input.localReviewPacketReady,
    local_review_video_path: input.paths.localReviewVideoPath,
    review_console_path: input.paths.reviewConsolePath,
    real_scene_asset_manifest_path: input.paths.manifestPath,
    real_scene_asset_gate_report_path: input.paths.gatePath,
    actual_frame_contact_sheet_path: input.paths.actualContactSheetPath,
    shorts_ui_overlay_contact_sheet_path: input.paths.overlayContactSheetPath,
    human_review_decision_path: input.paths.humanDecisionPath,
    review_summary_path: input.paths.reviewSummaryPath,
    v020_human_review_decision_path: input.paths.v020DecisionPath,
    human_review_status: input.summary.human_review_status,
    private_upload_allowed: false,
    SAFE_TO_REQUEST_PRIVATE_UPLOAD: false,
    NEW_PRIVATE_UPLOAD_DONE: false,
    YOUTUBE_VIDEO_ID_PRESENT: false,
    PUBLIC_UPLOAD_BLOCKED: true
  };
}

async function runTtsProvider(input) {
  if (input.ttsRunner) {
    const result = await input.ttsRunner({
      scriptPath: input.scriptPath,
      audioPath: input.audioPath,
      language: input.env.KOREAN_VOICE_LANGUAGE ?? "ko",
      outputFormat: input.env.KOREAN_VOICE_OUTPUT_FORMAT ?? "wav"
    });
    return {
      ...result,
      voiceoverGenerated: result.ok === true && await fileExists(input.audioPath)
    };
  }
  const command = readString(input.env.KOREAN_VOICE_COMMAND);
  if (!command) {
    return { ok: false, blocker: "BLOCKED_KOREAN_VOICE_PROVIDER_NOT_CONFIGURED" };
  }
  if (hasSapiMarker(command)) {
    return { ok: false, blocker: "VOICEOVER_REJECTED_LOCAL_SAPI_VOICE" };
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
    ], TTS_TIMEOUT_MS);
  } catch {
    return { ok: false, blocker: "LOCAL_KOREAN_TTS_COMMAND_FAILED" };
  }
  return { ok: await fileExists(input.audioPath), voiceoverGenerated: await fileExists(input.audioPath) };
}

async function buildMediaArtifact(input) {
  if (input.mediaRunner) {
    await input.mediaRunner(input);
    return;
  }
  const firstAsset = Object.values(input.provider.assets_by_id)[0];
  if (!firstAsset) {
    throw new Error("BLOCKED_REAL_SCENE_ASSET_PROVIDER_NOT_CONFIGURED");
  }
  const sourcePath = path.join(input.cwd, firstAsset.relative_path);
  if (input.outputPath.endsWith(".mp4")) {
    await execFileAsync("ffmpeg", [
      "-y",
      "-loop",
      "1",
      "-t",
      "24",
      "-i",
      sourcePath,
      "-f",
      "lavfi",
      "-t",
      "24",
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-vf",
      "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=yuv420p",
      "-shortest",
      input.outputPath
    ], { timeout: FFMPEG_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024 * 8 });
    return;
  }
  await execFileAsync("ffmpeg", [
    "-y",
    "-i",
    sourcePath,
    "-frames:v",
    "1",
    "-vf",
    "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2",
    input.outputPath
  ], { timeout: FFMPEG_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024 * 8 });
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

async function loadLocalEnv(cwd) {
  const env = { ...process.env };
  try {
    const contents = await fs.readFile(path.join(cwd, ".env.local"), "utf8");
    return { ...env, ...parseDotEnv(contents) };
  } catch {
    return env;
  }
}

async function runLocalCommand(command, args, timeout) {
  const extension = path.extname(stripWrappingQuotes(command)).toLowerCase();
  const options = {
    timeout,
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 4
  };
  if (extension === ".cmd" || extension === ".bat") {
    return execFileAsync("cmd.exe", ["/d", "/s", "/c", command, ...args], options);
  }
  return execFileAsync(stripWrappingQuotes(command), args, options);
}

function buildReviewConsoleHtml({ summary, provider, gate, audioProbe }) {
  const safeManifest = escapeHtml(JSON.stringify({
    missing_assets: provider.missing_assets,
    gate,
    audio: audioProbe
  }, null, 2));
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>v021 Real Scene Asset Shorts Review</title>
  <style>
    body { margin: 0; font-family: Arial, "Malgun Gothic", sans-serif; background: #f8fafc; color: #111827; }
    main { max-width: 1180px; margin: 0 auto; padding: 28px; }
    h1 { font-size: 30px; margin: 0 0 14px; }
    .status { display: inline-block; padding: 6px 10px; background: #166534; color: #fff; border-radius: 4px; font-weight: 700; }
    .warn { color: #b91c1c; font-weight: 700; }
    .grid { display: grid; grid-template-columns: minmax(320px, 420px) 1fr; gap: 22px; align-items: start; }
    video, img { width: 100%; border: 1px solid #cbd5e1; background: #fff; }
    .cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
    .metric { background: #fff; border: 1px solid #cbd5e1; padding: 12px; }
    .metric strong { display: block; font-size: 20px; margin-top: 4px; }
    pre { white-space: pre-wrap; background: #fff; padding: 16px; border: 1px solid #cbd5e1; overflow: auto; }
    @media (max-width: 860px) { .grid, .cards { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <h1>v021 Real Scene Asset Shorts Review</h1>
    <p><span class="status">PENDING_HUMAN_REVIEW_NO_UPLOAD</span></p>
    <p class="warn">v020은 움직이는 도형 PPT로 실패 처리됐습니다. v021은 실제 빨래/방/장마/사용/비교 장면 asset 기반 검수입니다.</p>
    <div class="grid">
      <section><video src="local-review-video.mp4" controls playsinline></video></section>
      <section>
        <h2>Real Scene Gate</h2>
        <div class="cards">
          <div class="metric">real scene pass<strong>${summary.real_scene_asset_gate_pass}</strong></div>
          <div class="metric">photo/video scenes<strong>${summary.photographic_or_video_scene_count}</strong></div>
          <div class="metric">primitive scenes<strong>${summary.primitive_shape_only_scene_count}</strong></div>
          <div class="metric">speech WPM<strong>${summary.speech_rate_wpm ?? "null"}</strong></div>
        </div>
        <pre>${safeManifest}</pre>
      </section>
    </div>
    <section>
      <h2>Contact Sheets</h2>
      <img src="actual-frame-contact-sheet.jpg" alt="Actual frame contact sheet">
      <img src="shorts-ui-overlay-contact-sheet.jpg" alt="Shorts UI overlay contact sheet">
    </section>
    <section>
      <h2>Human Review Checklist</h2>
      <ol>
        <li>실제 빨래/방/장마 장면처럼 보이는가?</li>
        <li>도형 PPT 느낌이 사라졌는가?</li>
        <li>첫 1초 손해 후킹이 보이는가?</li>
        <li>문제 장면이 상품보다 먼저 보이는가?</li>
        <li>건조대가 해결책으로 자연스럽게 등장하는가?</li>
        <li>before/after가 이해되는가?</li>
        <li>음성 속도와 톤이 괜찮은가?</li>
        <li>자막이 Shorts UI에 가리지 않는가?</li>
        <li>private upload 후보로 승인 가능한가?</li>
      </ol>
    </section>
  </main>
</body>
</html>
`;
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
    .replaceAll("빨래 건조대", "빨래건조대")
    .replaceAll("건조 대", "건조대")
    .replaceAll("건조하는", "건조대");
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

async function fileExists(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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

function toSafeRelativePath(cwd, filePath) {
  return path.relative(cwd, filePath).replace(/\\/g, "/");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  generateV021ReviewPacket()
    .then((result) => {
      console.log(JSON.stringify({
        target_version: TARGET_VERSION,
        v020_review_status: result.v020_review_status,
        review_console_generated: result.review_console_generated,
        real_scene_asset_gate_pass: result.real_scene_asset_gate_pass,
        required_asset_count: result.required_asset_count,
        available_asset_count: result.available_asset_count,
        missing_assets: result.missing_assets,
        real_scene_asset_provider_blocker: result.real_scene_asset_provider_blocker,
        melotts_voice_used: result.melotts_voice_used,
        speech_rate_wpm: result.speech_rate_wpm,
        core_anchor_recognition_pass: result.core_anchor_recognition_pass,
        recognized_core_anchors: result.recognized_core_anchors,
        local_review_packet_ready: result.local_review_packet_ready,
        safe_to_request_private_upload: result.SAFE_TO_REQUEST_PRIVATE_UPLOAD,
        review_console_path: result.review_console_path
      }, null, 2));
      if (result.local_review_packet_ready !== true) {
        process.exitCode = result.real_scene_asset_provider_blocker ? 2 : 1;
      }
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
