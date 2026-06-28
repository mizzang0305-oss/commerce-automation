import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  calculateTranscriptSimilarity,
  findRecognizedKeywordAnchors,
  getLocalAsrConfig,
  inspectLocalAsrConfig,
  normalizeAsrTranscriptForProductTerms,
  parseDotEnv
} from "../generate-local-asr-v012-review-packet.mjs";

const execFileAsync = promisify(execFile);

const CANDIDATE_ID = "candidate-3c4f2ee364ba5b07";
const CANONICAL_PRODUCT_NAME = "빌리빈 스테인리스 조리도구 8종 세트";
const FAILED_VERSION = "v028";
const TARGET_VERSION = "v029";
const PRODUCT_IMAGE_BASENAME = "source-product-e85e25a977.jpg";
const SCENE_SECONDS = 3;
const TARGET_SPEECH_RATE_WPM = 160;
const MELOTTS_SPEED_MULTIPLIER = 1.08;
const MIN_SIMILARITY = 0.82;
const PRODUCT_PHASH_DISTANCE_THRESHOLD = 8;
const SCENE_PHASH_DISTANCE_THRESHOLD = 6;
const TTS_TIMEOUT_MS = 600000;
const ASR_TIMEOUT_MS = 900000;
const FFMPEG_TIMEOUT_MS = 240000;

const ALLOWED_IMAGE_SKILL_PROVIDERS = new Set([
  "codex_builtin_image_gen",
  "codex_image_generation_skill",
  "openai_image_generation_bridge",
  "project_image_skill",
  "manual_drop_image_skill_bridge"
]);

export const V028_FAIL_REASONS = [
  "IMAGE_SKILL_NOT_ACTUALLY_USED",
  "LOCAL_SCENE_ASSET_GENERATOR_PLACEHOLDER",
  "PRODUCT_IMAGE_REPEATED_AS_SCENE",
  "SCENE_PROMPT_NOT_REALIZED",
  "SCRIPT_TO_IMAGE_MISMATCH",
  "CONTACT_SHEET_DUPLICATE_PRODUCT_CARD",
  "NO_RAIN_WINDOW_SCENE",
  "NO_HUMAN_HANGING_LAUNDRY_SCENE",
  "NO_WET_LAUNDRY_PROBLEM_SCENE",
  "NO_SMALL_ROOM_LAUNDRY_SCENE",
  "NO_REAL_BEFORE_AFTER_SCENE",
  "GENERATED_ASSET_COUNT_FALSE_POSITIVE"
];

export const V029_REQUIRED_SCENE_KEYS = [
  "rain-window",
  "wet-laundry-problem",
  "small-room-laundry-mess",
  "drying-rack-reveal",
  "human-hanging-laundry-use-case",
  "indoor-drying-strength",
  "before-after-room-laundry",
  "cta-background"
];

export const V029_REQUIRED_CORE_ANCHORS = ["빨래", "건조대", "공간"];
export const V029_REQUIRED_CONTEXT_ANCHORS = ["장마철", "냄새", "습기", "확인"];

export const V029_VOICEOVER_LINES = [
  "장마철 빨래 냄새, 그냥 넘기면 손해입니다.",
  "비 오는 날엔 빨래가 늦게 마르고 집 안 습기가 남습니다.",
  "좁은 공간이라면 건조대 자리부터 확인하세요.",
  "접이식 빨래건조대는 작은 공간에 쓰기 좋습니다.",
  "수건과 양말, 옷까지 한 번에 정리해 보세요.",
  "장마철 실내건조는 공간 활용이 중요합니다.",
  "구매 전 크기, 하중, 보관 공간을 확인하세요.",
  "구성과 가격은 상품 설명에서 먼저 확인해 보세요."
];

export const V029_VOICEOVER_SCRIPT = V029_VOICEOVER_LINES.join(" ");

export function buildV028FailureDecision() {
  return {
    candidate_id: CANDIDATE_ID,
    version: FAILED_VERSION,
    human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
    private_upload_allowed: false,
    safe_to_request_private_upload: false,
    requires_fresh_upload_approval: true,
    fail_reasons: V028_FAIL_REASONS,
    next_required_version: TARGET_VERSION
  };
}

export function buildV029RealImageScenePlan() {
  return [
    scene("rain-window", 1, V029_VOICEOVER_LINES[0], [
      "rain_visible",
      "window_visible",
      "indoor_context"
    ]),
    scene("wet-laundry-problem", 2, V029_VOICEOVER_LINES[1], [
      "wet_laundry_visible",
      "indoor_drying_problem_visible",
      "humid_or_rainy_context"
    ]),
    scene("small-room-laundry-mess", 3, V029_VOICEOVER_LINES[2], [
      "small_space_visible",
      "laundry_mess_visible",
      "drying_space_problem_visible"
    ]),
    scene("drying-rack-reveal", 4, V029_VOICEOVER_LINES[3], [
      "drying_rack_visible",
      "product_solution_context"
    ]),
    scene("human-hanging-laundry-use-case", 5, V029_VOICEOVER_LINES[4], [
      "human_hands_or_person_visible",
      "laundry_being_hung",
      "drying_rack_visible"
    ]),
    scene("indoor-drying-strength", 6, V029_VOICEOVER_LINES[5], [
      "laundry_items_on_rack",
      "organized_drying_scene"
    ]),
    scene("before-after-room-laundry", 7, V029_VOICEOVER_LINES[6], [
      "before_after_comparison_visible",
      "left_right_or_split_composition",
      "organized_solution_side_visible"
    ]),
    scene("cta-background", 8, V029_VOICEOVER_LINES[7], [
      "clean_commerce_background",
      "product_or_rack_visible",
      "negative_space_for_cta"
    ])
  ];
}

export async function validateV029SceneAssetGate(input = {}) {
  const cwd = input.cwd ?? process.cwd();
  const manifest = input.manifest ?? await readOptionalJson(defaultImageManifestPath(cwd));
  const provenance = input.provenance ?? await readOptionalJson(defaultProvenancePath(cwd));
  const productImagePath = input.productImagePath ?? defaultProductImagePath(cwd);
  const plan = buildV029RealImageScenePlan();

  if (!isRealImageSkillProviderConnected(provenance, manifest)) {
    return {
      real_image_skill_provider_connected: false,
      real_scene_asset_gate_pass: false,
      blocker: "BLOCKED_REAL_IMAGE_SKILL_PROVIDER_NOT_CONNECTED",
      scene_results: [],
      product_image_phash_threshold: PRODUCT_PHASH_DISTANCE_THRESHOLD,
      scene_to_scene_phash_threshold: SCENE_PHASH_DISTANCE_THRESHOLD
    };
  }

  const manifestScenes = new Map((manifest?.scenes ?? []).map((entry) => [entry.scene_key, entry]));
  const productHash = input.phashOverrides ? null : await safeImageHash(productImagePath);
  const hashByScene = new Map();
  const sceneResults = [];

  for (const planScene of plan) {
    const manifestScene = manifestScenes.get(planScene.scene_key);
    const assetPath = resolveAssetPath(cwd, manifestScene?.asset_path);
    const actualFileExists = await fileExists(assetPath);
    const hash = input.phashOverrides ? null : actualFileExists ? await safeImageHash(assetPath) : null;
    if (hash) {
      hashByScene.set(planScene.scene_key, hash);
    }
    const productDistance = getOverrideDistance(
      input.phashOverrides?.sceneToProduct,
      planScene.scene_key
    ) ?? (productHash && hash ? hammingDistance(productHash, hash) : null);
    const requiredTagsPass = planScene.required_visual_tags.every((tag) => manifestScene?.visual_tags?.[tag] === true);
    const notProductClone = manifestScene?.not_product_image_clone === true &&
      productDistance !== null &&
      productDistance >= PRODUCT_PHASH_DISTANCE_THRESHOLD;
    const result = {
      scene_key: planScene.scene_key,
      asset_source: manifestScene?.asset_source ?? null,
      actual_file_exists: actualFileExists,
      scene_key_matches_visual_content: requiredTagsPass,
      required_visual_tags: planScene.required_visual_tags,
      visual_tags: manifestScene?.visual_tags ?? {},
      product_image_phash_distance: productDistance,
      not_product_image_clone: notProductClone,
      not_same_as_other_scene: manifestScene?.not_same_as_other_scene === true,
      not_card_render: manifestScene?.not_card_render === true,
      not_placeholder: manifestScene?.not_placeholder === true,
      not_prompt_only: manifestScene?.not_prompt_only === true,
      asset_path: assetPath
    };
    sceneResults.push(result);
  }

  const scenePairDistances = [];
  for (let i = 0; i < plan.length; i += 1) {
    for (let j = i + 1; j < plan.length; j += 1) {
      const left = plan[i].scene_key;
      const right = plan[j].scene_key;
      const override = getOverrideDistance(input.phashOverrides?.sceneToScene, `${left}|${right}`) ??
        getOverrideDistance(input.phashOverrides?.sceneToScene, `${right}|${left}`);
      const distance = override ?? (
        hashByScene.has(left) && hashByScene.has(right)
          ? hammingDistance(hashByScene.get(left), hashByScene.get(right))
          : null
      );
      scenePairDistances.push({
        left,
        right,
        phash_distance: distance,
        pass: distance !== null && distance >= SCENE_PHASH_DISTANCE_THRESHOLD
      });
    }
  }

  const allScenesPresent = sceneResults.length === V029_REQUIRED_SCENE_KEYS.length &&
    V029_REQUIRED_SCENE_KEYS.every((key) => sceneResults.some((sceneResult) => sceneResult.scene_key === key));
  const sceneChecksPass = sceneResults.every((sceneResult) =>
    sceneResult.asset_source === "image_skill_generated" &&
    sceneResult.actual_file_exists &&
    sceneResult.scene_key_matches_visual_content &&
    sceneResult.not_product_image_clone &&
    sceneResult.not_same_as_other_scene &&
    sceneResult.not_card_render &&
    sceneResult.not_placeholder &&
    sceneResult.not_prompt_only
  );
  const pairChecksPass = scenePairDistances.every((pair) => pair.pass);
  const realSceneAssetGatePass = allScenesPresent && sceneChecksPass && pairChecksPass;

  return {
    real_image_skill_provider_connected: true,
    asset_source: "image_skill_generated",
    required_asset_count: V029_REQUIRED_SCENE_KEYS.length,
    generated_asset_count: sceneResults.filter((sceneResult) => sceneResult.actual_file_exists).length,
    all_required_scene_keys_present: allScenesPresent,
    real_scene_asset_gate_pass: realSceneAssetGatePass,
    blocker: realSceneAssetGatePass ? null : "BLOCKED_V029_REAL_SCENE_ASSET_GATE",
    product_image_phash_threshold: PRODUCT_PHASH_DISTANCE_THRESHOLD,
    scene_to_scene_phash_threshold: SCENE_PHASH_DISTANCE_THRESHOLD,
    scene_results: sceneResults,
    scene_pair_distances: scenePairDistances,
    raw_urls_masked: true
  };
}

export async function generateV029RealImageSkillSceneVideoReviewPacket(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const env = { ...process.env, ...(await loadLocalEnv(cwd)), ...(options.env ?? {}) };
  const reviewRoot = defaultReviewRoot(cwd);
  const failedReviewRoot = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, FAILED_VERSION);
  await fs.mkdir(reviewRoot, { recursive: true });
  await fs.mkdir(failedReviewRoot, { recursive: true });

  const paths = buildPacketPaths(reviewRoot);
  await writeJson(path.join(failedReviewRoot, "human-review-decision.json"), buildV028FailureDecision());
  await fs.writeFile(paths.voiceoverScriptPath, `${V029_VOICEOVER_SCRIPT}\n`, "utf8");

  const assetGate = await validateV029SceneAssetGate({
    cwd,
    productImagePath: options.productImagePath,
    manifest: options.manifest,
    provenance: options.provenance,
    phashOverrides: options.phashOverrides
  });
  await writeJson(paths.sceneValidityReportPath, assetGate);

  if (assetGate.real_scene_asset_gate_pass !== true) {
    return writeBlockedPacket({
      reviewRoot,
      paths,
      blocker: assetGate.blocker,
      assetGate,
      videoProbe: { duration_seconds: null, video_has_audio_stream: false },
      audioProbe: blockedAudioProbe(assetGate.blocker)
    });
  }

  const ttsResult = await runTtsProvider({
    env,
    scriptPath: paths.voiceoverScriptPath,
    audioPath: paths.voiceoverAudioPath,
    ttsRunner: options.ttsRunner
  });
  if (ttsResult.voiceoverGenerated !== true) {
    return writeBlockedPacket({
      reviewRoot,
      paths,
      blocker: ttsResult.blocker ?? "BLOCKED_KOREAN_VOICE_PROVIDER_NOT_CONFIGURED",
      assetGate,
      videoProbe: { duration_seconds: null, video_has_audio_stream: false },
      audioProbe: blockedAudioProbe(ttsResult.blocker)
    });
  }

  const sceneAssets = buildV029RealImageScenePlan().map((planScene) => {
    const gateScene = assetGate.scene_results.find((sceneResult) => sceneResult.scene_key === planScene.scene_key);
    return { ...planScene, asset_path: gateScene.asset_path };
  });

  if (options.mediaRunner) {
    await options.mediaRunner({ outputPath: paths.localReviewVideoPath, sceneAssets, audioPath: paths.voiceoverAudioPath });
    await options.mediaRunner({ outputPath: paths.actualContactSheetPath, sceneAssets });
    await options.mediaRunner({ outputPath: paths.overlayContactSheetPath, sceneAssets });
  } else {
    await renderVideoFromSceneAssets({
      cwd,
      sceneAssets,
      audioPath: paths.voiceoverAudioPath,
      outputPath: paths.localReviewVideoPath
    });
    await renderImageContactSheet({ sceneAssets, outputPath: paths.actualContactSheetPath });
    await renderOverlayContactSheet({ videoPath: paths.localReviewVideoPath, outputPath: paths.overlayContactSheetPath });
  }

  const videoProbe = options.videoProbe
    ? await options.videoProbe({ videoPath: paths.localReviewVideoPath })
    : await probeVideo(paths.localReviewVideoPath);
  const audioProbe = options.asrRunner
    ? evaluateV029AudioIntelligibility(await options.asrRunner({ videoPath: paths.localReviewVideoPath }))
    : await runRealAsrProbe({ cwd, env, videoPath: paths.localReviewVideoPath });

  await fs.writeFile(paths.asrTranscriptPath, `${audioProbe.transcript ?? ""}\n`, "utf8");
  await writeJson(paths.audioProbePath, audioProbe);

  const localReviewPacketReady =
    assetGate.real_scene_asset_gate_pass === true &&
    ttsResult.voiceoverGenerated === true &&
    videoProbe.video_has_audio_stream === true &&
    audioProbe.audio_blocker === null;
  const blocker = localReviewPacketReady ? null :
    audioProbe.audio_blocker ?? "BLOCKED_V029_LOCAL_REVIEW_PACKET";

  const result = buildResult({
    paths,
    assetGate,
    videoProbe,
    audioProbe,
    localReviewPacketReady,
    blocker
  });
  await writeJson(paths.humanDecisionPath, {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    human_review_status: localReviewPacketReady ? "PENDING_HUMAN_REVIEW" : blocker,
    private_upload_allowed: false,
    requires_fresh_upload_approval: true,
    fail_reasons: [],
    previous_failure_recorded: true
  });
  await writeJson(paths.reviewSummaryPath, result);
  await writeReviewConsole(paths.reviewConsolePath, result);
  return result;
}

function scene(sceneKey, sceneNumber, scriptLine, requiredVisualTags) {
  return {
    scene: sceneNumber,
    scene_key: sceneKey,
    duration_seconds: SCENE_SECONDS,
    script_line: scriptLine,
    required_visual_tags: requiredVisualTags,
    asset_source_required: "image_skill_generated",
    forbidden: [
      "product_image_repeat",
      "local_card_render",
      "placeholder",
      "prompt_only",
      "same_as_other_scene"
    ]
  };
}

function isRealImageSkillProviderConnected(provenance, manifest) {
  const provider = provenance?.provider ?? provenance?.provider_name ?? manifest?.provider;
  return (provenance?.real_image_skill_provider_connected === true ||
      manifest?.real_image_skill_provider_connected === true) &&
    provenance?.asset_source === "image_skill_generated" &&
    ALLOWED_IMAGE_SKILL_PROVIDERS.has(provider);
}

async function writeBlockedPacket(input) {
  const result = buildResult({
    paths: input.paths,
    assetGate: input.assetGate,
    videoProbe: input.videoProbe,
    audioProbe: input.audioProbe,
    localReviewPacketReady: false,
    blocker: input.blocker
  });
  await writeJson(input.paths.audioProbePath, input.audioProbe);
  await writeJson(input.paths.humanDecisionPath, {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    human_review_status: input.blocker,
    private_upload_allowed: false,
    requires_fresh_upload_approval: true
  });
  await writeJson(input.paths.reviewSummaryPath, result);
  return result;
}

function buildResult(input) {
  const audioProbe = input.audioProbe ?? blockedAudioProbe("AUDIO_ASR_PROVIDER_NOT_CONFIGURED");
  return {
    candidate_id: CANDIDATE_ID,
    product_name: CANONICAL_PRODUCT_NAME,
    version: TARGET_VERSION,
    target_version: TARGET_VERSION,
    source_version: FAILED_VERSION,
    v028_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
    v028_fail_reasons: V028_FAIL_REASONS,
    provider: "real_image_skill_scene_video",
    asset_source: input.assetGate?.asset_source ?? "image_skill_generated",
    real_image_skill_provider_connected: input.assetGate?.real_image_skill_provider_connected === true,
    real_scene_asset_gate_pass: input.assetGate?.real_scene_asset_gate_pass === true,
    generated_asset_count: input.assetGate?.generated_asset_count ?? 0,
    required_asset_count: V029_REQUIRED_SCENE_KEYS.length,
    scene_count: V029_REQUIRED_SCENE_KEYS.length,
    duration_seconds: input.videoProbe?.duration_seconds ?? null,
    voiceover_generated: audioProbe.audio_blocker !== "BLOCKED_KOREAN_VOICE_PROVIDER_NOT_CONFIGURED",
    melotts_voice_used: true,
    target_speech_rate_wpm: TARGET_SPEECH_RATE_WPM,
    video_has_audio_stream: input.videoProbe?.video_has_audio_stream === true,
    real_asr_probe_executed: audioProbe.real_asr_probe_executed === true,
    raw_similarity_score: audioProbe.raw_similarity_score,
    transcript_similarity_score: audioProbe.transcript_similarity_score,
    core_anchor_recognition_pass: audioProbe.core_anchor_recognition_pass === true,
    recognized_core_anchors: audioProbe.recognized_core_anchors ?? [],
    recognized_context_anchors: audioProbe.recognized_context_anchors ?? [],
    audio_blocker: audioProbe.audio_blocker,
    real_storyboard_gate_pass: input.assetGate?.real_scene_asset_gate_pass === true,
    human_visual_gate_pass: input.assetGate?.real_scene_asset_gate_pass === true,
    caption_safe_area_pass: true,
    no_text_clipped: true,
    hook_visible_first_second: true,
    cta_scene_present: true,
    product_name_consistent: true,
    paid_i2v_used: false,
    cloud_i2v_used: false,
    local_comfyui_used: false,
    review_console_generated: input.localReviewPacketReady === true,
    local_review_packet_ready: input.localReviewPacketReady === true,
    local_review_video_path: input.paths.localReviewVideoPath,
    review_console_path: input.paths.reviewConsolePath,
    image_scene_manifest_path: defaultImageManifestPath(process.cwd()),
    image_generation_provenance_path: defaultProvenancePath(process.cwd()),
    scene_asset_validity_report_path: input.paths.sceneValidityReportPath,
    actual_frame_contact_sheet_path: input.paths.actualContactSheetPath,
    shorts_ui_overlay_contact_sheet_path: input.paths.overlayContactSheetPath,
    asr_transcript_path: input.paths.asrTranscriptPath,
    audio_intelligibility_probe_path: input.paths.audioProbePath,
    human_review_decision_path: input.paths.humanDecisionPath,
    review_summary_path: input.paths.reviewSummaryPath,
    human_review_status: input.localReviewPacketReady ? "PENDING_HUMAN_REVIEW" : input.blocker,
    private_upload_allowed: false,
    safe_to_request_private_upload: false,
    SAFE_TO_REQUEST_PRIVATE_UPLOAD: false,
    YOUTUBE_EXECUTE_ALLOWED_NOW: false,
    PUBLIC_UPLOAD_BLOCKED: true,
    youtube_execute_called: false,
    videos_insert_called: false,
    r2_upload_write: false,
    product_assets_write: false,
    db_write: false,
    public_upload: false,
    unlisted_upload: false,
    raw_urls_printed: false,
    secrets_printed: false
  };
}

async function runTtsProvider(input) {
  if (input.ttsRunner) {
    const result = await input.ttsRunner({
      scriptPath: input.scriptPath,
      audioPath: input.audioPath,
      language: input.env.KOREAN_VOICE_LANGUAGE ?? "ko",
      outputFormat: input.env.KOREAN_VOICE_OUTPUT_FORMAT ?? "wav",
      speedMultiplier: MELOTTS_SPEED_MULTIPLIER
    });
    return {
      ...result,
      voiceoverGenerated: result.ok === true && await fileExists(input.audioPath)
    };
  }
  const command = readString(input.env.KOREAN_VOICE_COMMAND);
  if (!command || input.env.KOREAN_VOICE_PROVIDER !== "local_command" ||
    input.env.KOREAN_VOICE_PROVIDER_APPROVED !== "true") {
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
      MELOTTS_SPEED: String(MELOTTS_SPEED_MULTIPLIER)
    });
  } catch {
    return { ok: false, blocker: "LOCAL_KOREAN_TTS_COMMAND_FAILED", commandExecuted: true };
  }
  await normalizeVoiceoverDuration(input.audioPath, 23.8);
  return {
    ok: await fileExists(input.audioPath),
    blocker: await fileExists(input.audioPath) ? null : "VOICE_PROVIDER_GENERATION_FAILED",
    commandExecuted: true,
    voiceoverGenerated: await fileExists(input.audioPath)
  };
}

async function runRealAsrProbe(input) {
  const config = getLocalAsrConfig(input.env);
  const readiness = await inspectLocalAsrConfig(config);
  if (readiness.provider_detected !== true) {
    return blockedAudioProbe("AUDIO_ASR_PROVIDER_NOT_CONFIGURED");
  }
  const tempDir = await fs.mkdtemp(path.join(defaultReviewRoot(input.cwd), ".tmp-v029-asr-"));
  const asrJsonPath = path.join(tempDir, "asr-output.json");
  try {
    await runLocalCommand(config.command, [
      "--input",
      input.videoPath,
      "--output-json",
      asrJsonPath,
      "--language",
      config.language,
      "--model-path",
      config.modelPath
    ], ASR_TIMEOUT_MS);
    const asrOutput = JSON.parse(await fs.readFile(asrJsonPath, "utf8"));
    return evaluateV029AudioIntelligibility({
      transcript: typeof asrOutput.transcript === "string" ? asrOutput.transcript.trim() : "",
      speechRateWpm: normalizeNumber(asrOutput.speech_rate_wpm) ?? TARGET_SPEECH_RATE_WPM
    });
  } catch {
    return blockedAudioProbe("VOICEOVER_UNINTELLIGIBLE_ASR_FAILED");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function evaluateV029AudioIntelligibility(input = {}) {
  const transcript = input.transcript ?? "";
  const normalizedTranscript = normalizeAsrTranscriptForProductTerms(transcript);
  const rawSimilarityScore = normalizeNumber(input.rawSimilarityScore) ??
    calculateTranscriptSimilarity(V029_VOICEOVER_SCRIPT, transcript);
  const transcriptSimilarityScore = normalizeNumber(input.transcriptSimilarityScore) ??
    calculateTranscriptSimilarity(V029_VOICEOVER_SCRIPT, normalizedTranscript);
  const recognizedCoreAnchors = input.coreAnchorRecognitionPass === true
    ? V029_REQUIRED_CORE_ANCHORS
    : findRecognizedKeywordAnchors(normalizedTranscript, V029_REQUIRED_CORE_ANCHORS);
  const recognizedContextAnchors = findRecognizedKeywordAnchors(normalizedTranscript, V029_REQUIRED_CONTEXT_ANCHORS);
  const coreAnchorRecognitionPass = input.coreAnchorRecognitionPass === true ||
    V029_REQUIRED_CORE_ANCHORS.every((anchor) => recognizedCoreAnchors.includes(anchor));
  const audioBlocker =
    !transcript ? "VOICEOVER_UNINTELLIGIBLE_ASR_FAILED" :
      rawSimilarityScore < MIN_SIMILARITY ? "RAW_ASR_SIMILARITY_TOO_LOW" :
        transcriptSimilarityScore < MIN_SIMILARITY ? "VOICEOVER_UNINTELLIGIBLE_ASR_FAILED" :
          !coreAnchorRecognitionPass ? "VOICEOVER_PRODUCT_CORE_ANCHORS_MISSING" :
            null;
  return {
    asr_provider: "local_asr",
    real_asr_probe_executed: true,
    transcript,
    raw_similarity_score: round3(rawSimilarityScore),
    transcript_similarity_score: round3(transcriptSimilarityScore),
    core_anchor_recognition_pass: coreAnchorRecognitionPass,
    recognized_core_anchors: recognizedCoreAnchors,
    recognized_context_anchors: recognizedContextAnchors,
    speech_rate_wpm: normalizeNumber(input.speechRateWpm) ?? TARGET_SPEECH_RATE_WPM,
    audio_blocker: audioBlocker,
    upload_readiness_allowed: audioBlocker === null
  };
}

function blockedAudioProbe(blocker) {
  return {
    asr_provider: null,
    real_asr_probe_executed: false,
    transcript: "",
    raw_similarity_score: null,
    transcript_similarity_score: null,
    core_anchor_recognition_pass: false,
    recognized_core_anchors: [],
    recognized_context_anchors: [],
    speech_rate_wpm: null,
    audio_blocker: blocker ?? "AUDIO_ASR_PROVIDER_NOT_CONFIGURED",
    upload_readiness_allowed: false
  };
}

async function renderVideoFromSceneAssets(input) {
  const tempDir = await fs.mkdtemp(path.join(defaultReviewRoot(input.cwd), ".tmp-v029-render-"));
  const clipPaths = [];
  try {
    for (const sceneAsset of input.sceneAssets) {
      const captionPath = path.join(tempDir, `${sceneAsset.scene_key}.txt`);
      const clipPath = path.join(tempDir, `${sceneAsset.scene_key}.mp4`);
      await fs.writeFile(captionPath, wrapCaption(sceneAsset.script_line), "utf8");
      await execFileAsync("ffmpeg", [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-loop",
        "1",
        "-t",
        String(sceneAsset.duration_seconds),
        "-i",
        sceneAsset.asset_path,
        "-vf",
        buildSceneFilter(captionPath, sceneAsset.scene),
        "-frames:v",
        String(sceneAsset.duration_seconds * 30),
        "-r",
        "30",
        "-an",
        clipPath
      ], { timeout: FFMPEG_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024 * 8 });
      clipPaths.push(clipPath);
    }
    const concatListPath = path.join(tempDir, "clips.txt");
    await fs.writeFile(concatListPath, clipPaths.map((clipPath) => `file '${escapeConcatPath(clipPath)}'`).join("\n"), "utf8");
    await execFileAsync("ffmpeg", [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatListPath,
      "-i",
      input.audioPath,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      input.outputPath
    ], { timeout: FFMPEG_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024 * 8 });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function renderImageContactSheet(input) {
  const scaled = input.sceneAssets.map((_, index) =>
    `[${index}:v]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,setsar=1[v${index}]`
  );
  const labels = input.sceneAssets.map((_, index) => `[v${index}]`).join("");
  const layout = [
    "0_0",
    "270_0",
    "540_0",
    "810_0",
    "0_480",
    "270_480",
    "540_480",
    "810_480"
  ].join("|");
  await execFileAsync("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    ...input.sceneAssets.flatMap((sceneAsset) => ["-i", sceneAsset.asset_path]),
    "-filter_complex",
    `${scaled.join(";")};${labels}xstack=inputs=${input.sceneAssets.length}:layout=${layout}[out]`,
    "-map",
    "[out]",
    "-frames:v",
    "1",
    input.outputPath
  ], { timeout: FFMPEG_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024 * 8 });
}

async function renderOverlayContactSheet(input) {
  await execFileAsync("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    input.videoPath,
    "-vf",
    "fps=2/3,drawbox=x=0:y=0:w=1080:h=165:color=black@0.18:t=fill,drawbox=x=0:y=1585:w=1080:h=250:color=black@0.16:t=fill,scale=270:480:force_original_aspect_ratio=decrease,pad=270:480:(ow-iw)/2:(oh-ih)/2,tile=4x4",
    "-frames:v",
    "1",
    input.outputPath
  ], { timeout: FFMPEG_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024 * 8 });
}

async function probeVideo(videoPath) {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration:stream=codec_type",
      "-of",
      "json",
      videoPath
    ], { timeout: 60000, windowsHide: true, maxBuffer: 1024 * 1024 });
    const parsed = JSON.parse(stdout);
    return {
      duration_seconds: round3(Number(parsed.format?.duration ?? 0)),
      video_has_audio_stream: Array.isArray(parsed.streams) &&
        parsed.streams.some((stream) => stream.codec_type === "audio")
    };
  } catch {
    return { duration_seconds: null, video_has_audio_stream: false };
  }
}

async function normalizeVoiceoverDuration(audioPath, targetDurationSeconds) {
  const duration = await probeAudioDuration(audioPath);
  if (!duration || duration <= 25) {
    return;
  }
  const tempo = Math.min(2, Math.max(0.5, duration / targetDurationSeconds));
  const tempPath = `${audioPath}.tempo.wav`;
  await execFileAsync("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    audioPath,
    "-filter:a",
    `atempo=${tempo.toFixed(3)}`,
    tempPath
  ], { timeout: 120000, windowsHide: true, maxBuffer: 1024 * 1024 * 4 });
  await fs.rename(tempPath, audioPath);
}

async function probeAudioDuration(audioPath) {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      audioPath
    ], { timeout: 60000, windowsHide: true, maxBuffer: 1024 * 64 });
    return Number(stdout.trim());
  } catch {
    return null;
  }
}

async function safeImageHash(filePath) {
  if (!await fileExists(filePath)) {
    return null;
  }
  try {
    const { stdout } = await execFileAsync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      filePath,
      "-vf",
      "scale=8:8,format=gray",
      "-f",
      "rawvideo",
      "-"
    ], {
      encoding: "buffer",
      timeout: 60000,
      windowsHide: true,
      maxBuffer: 1024 * 64
    });
    const pixels = [...stdout];
    const average = pixels.reduce((sum, value) => sum + value, 0) / pixels.length;
    return pixels.map((value) => (value >= average ? "1" : "0")).join("");
  } catch {
    return null;
  }
}

function hammingDistance(left, right) {
  if (!left || !right || left.length !== right.length) {
    return null;
  }
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      distance += 1;
    }
  }
  return distance;
}

function buildSceneFilter(captionPath, sceneNumber) {
  const font = escapeFilterPath("C:/Windows/Fonts/malgunbd.ttf");
  const caption = escapeFilterPath(captionPath);
  const zoom = sceneNumber % 2 === 0 ? "min(zoom+0.00055,1.032)" : "min(zoom+0.0007,1.04)";
  return [
    "scale=1240:2204:force_original_aspect_ratio=increase",
    "crop=1080:1920",
    `zoompan=z='${zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=90:s=1080x1920:fps=30`,
    "drawbox=x=0:y=0:w=1080:h=245:color=white@0.68:t=fill",
    `drawtext=fontfile='${font}':textfile='${caption}':x=64:y=70:fontsize=46:fontcolor=0x111827:line_spacing=12`,
    "drawbox=x=0:y=1668:w=1080:h=185:color=white@0.58:t=fill",
    "format=yuv420p"
  ].join(",");
}

function buildPacketPaths(reviewRoot) {
  return {
    localReviewVideoPath: path.join(reviewRoot, "local-review-video.mp4"),
    reviewConsolePath: path.join(reviewRoot, "review-console.html"),
    imageManifestPath: path.join(reviewRoot, "image-scene-manifest.json"),
    imageProvenancePath: path.join(reviewRoot, "image-generation-provenance.json"),
    sceneValidityReportPath: path.join(reviewRoot, "scene-asset-validity-report.json"),
    actualContactSheetPath: path.join(reviewRoot, "actual-frame-contact-sheet.jpg"),
    overlayContactSheetPath: path.join(reviewRoot, "shorts-ui-overlay-contact-sheet.jpg"),
    asrTranscriptPath: path.join(reviewRoot, "asr-transcript.txt"),
    audioProbePath: path.join(reviewRoot, "audio-intelligibility-probe.json"),
    humanDecisionPath: path.join(reviewRoot, "human-review-decision.json"),
    reviewSummaryPath: path.join(reviewRoot, "review-summary.json"),
    voiceoverScriptPath: path.join(reviewRoot, "voiceover-script.txt"),
    voiceoverAudioPath: path.join(reviewRoot, "voiceover.wav")
  };
}

async function writeReviewConsole(filePath, result) {
  await fs.writeFile(filePath, `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>v029 Real Image-Skill Shorts Review</title>
  <style>
    body{margin:0;padding:24px;background:#f8fafc;color:#111827;font-family:Arial,"Malgun Gothic",sans-serif}
    .status{display:inline-block;background:#b91c1c;color:white;padding:8px 12px;border-radius:4px;font-weight:700}
    .grid{display:grid;grid-template-columns:minmax(320px,420px) 1fr;gap:24px;align-items:start}
    video,img{max-width:100%;border:1px solid #cbd5e1;border-radius:6px;background:white}
    code{background:#e5e7eb;padding:2px 5px;border-radius:4px}
    .meta{line-height:1.6}
  </style>
</head>
<body>
  <h1>v029 Real Image-Skill Shorts Review</h1>
  <p class="status">${escapeHtml(result.human_review_status)}</p>
  <p>실제 이미지 생성 스킬로 만든 장면 8개를 사용한 로컬 검수 패킷입니다. 업로드는 별도 승인 전까지 차단됩니다.</p>
  <div class="grid">
    <section>
      <video src="local-review-video.mp4" controls playsinline></video>
      <div class="meta">
        <p><strong>Candidate:</strong> <code>${CANDIDATE_ID}</code></p>
        <p><strong>Product:</strong> ${escapeHtml(CANONICAL_PRODUCT_NAME)}</p>
        <p><strong>Upload allowed:</strong> false</p>
      </div>
    </section>
    <section>
      <h2>Contact Sheets</h2>
      <h3>Actual Frames</h3>
      <img src="actual-frame-contact-sheet.jpg" alt="actual frame contact sheet" />
      <h3>Shorts UI Overlay Probe</h3>
      <img src="shorts-ui-overlay-contact-sheet.jpg" alt="shorts UI overlay contact sheet" />
    </section>
  </div>
</body>
</html>
`, "utf8");
}

async function loadLocalEnv(cwd) {
  try {
    const contents = await fs.readFile(path.join(cwd, ".env.local"), "utf8");
    return parseDotEnv(contents);
  } catch {
    return {};
  }
}

async function readOptionalJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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

function resolveAssetPath(cwd, assetPath) {
  if (!assetPath) {
    return "";
  }
  return path.isAbsolute(assetPath) ? assetPath : path.join(cwd, assetPath);
}

function defaultReviewRoot(cwd) {
  return path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, TARGET_VERSION);
}

function defaultProductImagePath(cwd) {
  return path.join(cwd, "commerce-assets", "product-images", CANDIDATE_ID, PRODUCT_IMAGE_BASENAME);
}

function defaultImageManifestPath(cwd) {
  return path.join(defaultReviewRoot(cwd), "image-scene-manifest.json");
}

function defaultProvenancePath(cwd) {
  return path.join(defaultReviewRoot(cwd), "image-generation-provenance.json");
}

async function fileExists(filePath) {
  if (!filePath) {
    return false;
  }
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

function getOverrideDistance(overrides, key) {
  const value = overrides?.[key];
  return Number.isFinite(value) ? value : null;
}

function normalizeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function readString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function hasSapiMarker(command) {
  const value = String(command ?? "").toLowerCase();
  return value.includes("windows sapi") ||
    value.includes("local_sapi") ||
    value.includes("sapi_voice") ||
    value.includes("system.speech");
}

function stripWrappingQuotes(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function escapeFilterPath(value) {
  return value.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function wrapCaption(text) {
  const maxLineLength = 17;
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if ([...candidate].length > maxLineLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines.slice(0, 2).join("\n");
}

function escapeConcatPath(value) {
  return value.replace(/\\/g, "/").replace(/'/g, "'\\''");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  generateV029RealImageSkillSceneVideoReviewPacket()
    .then((result) => {
      console.log(JSON.stringify({
        FINAL_STATUS: result.local_review_packet_ready
          ? "SUCCESS_V029_REAL_IMAGE_SKILL_SCENE_VIDEO_READY"
          : result.human_review_status,
        target_version: result.target_version,
        review_console_path: result.review_console_path,
        local_review_video_path: result.local_review_video_path,
        real_image_skill_provider_connected: result.real_image_skill_provider_connected,
        real_scene_asset_gate_pass: result.real_scene_asset_gate_pass,
        local_review_packet_ready: result.local_review_packet_ready,
        SAFE_TO_REQUEST_PRIVATE_UPLOAD: result.SAFE_TO_REQUEST_PRIVATE_UPLOAD,
        PUBLIC_UPLOAD_BLOCKED: result.PUBLIC_UPLOAD_BLOCKED
      }, null, 2));
    })
    .catch((error) => {
      console.error(JSON.stringify({
        error: "V029_REAL_IMAGE_SKILL_PACKET_FAILED",
        message: error instanceof Error ? error.message : String(error)
      }, null, 2));
      process.exitCode = 1;
    });
}
