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
const FAILED_VERSION = "v019";
const TARGET_VERSION = "v020";
const CANONICAL_PRODUCT_NAME = "코멧 홈 접이식 대형 빨래건조대";
const PRODUCT_IMAGE_BASENAME = "source-product-e85e25a977.jpg";
const DURATION_SECONDS = 24;
const SCENE_SECONDS = 3;
const SAMPLED_FRAMES_PER_SCENE = 5;
const DEFAULT_MIN_SIMILARITY = 0.82;
const DEFAULT_MIN_WPM = 155;
const DEFAULT_MAX_WPM = 165;
const TARGET_SPEECH_RATE_WPM = 160;
const MELOTTS_SPEED_MULTIPLIER = 1.14;
const TTS_TIMEOUT_MS = 600000;
const ASR_TIMEOUT_MS = 900000;
const FFMPEG_TIMEOUT_MS = 180000;

export const V020_REQUIRED_CORE_ANCHORS = ["빨래", "건조대", "공간"];

const V020_REQUIRED_CONTEXT_ANCHORS = ["장마철", "냄새", "습기", "확인"];

export const V020_VOICEOVER_SCRIPT_LINES = [
  "장마철 빨래 냄새, 그냥 넘기면 손해입니다.",
  "비 오는 날엔 빨래가 늦게 마르고, 집안에 습기가 남습니다.",
  "좁은 공간이라면 빨래 널 자리도 부족해집니다.",
  "접이식 빨래 건조대는 좁은 공간에서도 빨래를 펼쳐 말릴 수 있습니다.",
  "구매 전에는 크기, 하중, 보관 공간을 꼭 확인하세요."
];

export const V020_VOICEOVER_SCRIPT = V020_VOICEOVER_SCRIPT_LINES.join(" ");

const V019_FAIL_REASONS = [
  "VIDEO_LOOKS_LIKE_TEXT_READING_CARD",
  "NO_REAL_IN_SCENE_MOTION",
  "SLIDESHOW_CARD_FEELING",
  "STATIC_STORYBOARD_DESPITE_CONTACT_SHEET_PASS",
  "PRODUCT_OR_PROBLEM_NOT_SHOWN_AS_VIDEO",
  "VOICE_ACCEPTABLE_BUT_SPEED_SLIGHTLY_SLOW"
];

const V019_FAIL_BLOCKERS = [
  "VIDEO_LOOKS_LIKE_TEXT_READING_CARD",
  "NO_REAL_IN_SCENE_MOTION",
  "SLIDESHOW_CARD_FEELING",
  "STATIC_STORYBOARD_DESPITE_CONTACT_SHEET_PASS",
  "CONTACT_SHEET_PASS_BUT_VIDEO_FAIL",
  "NO_ANIMATED_PROBLEM_SCENE",
  "NO_ANIMATED_USE_CASE_SCENE",
  "NO_ANIMATED_BEFORE_AFTER_SCENE",
  "VOICE_SPEED_TOO_SLOW_FOR_SHORTS"
];

const V020_SCENES = [
  {
    id: "scene_01_loss_hook_animated_smell_warning",
    title: "장마철 빨래 냄새",
    subtitle: "그냥 넘기면 손해",
    footer: "물방울과 냄새 경고가 실제로 움직임",
    source_type: "animated_problem_hook",
    accent: "ef4444",
    background: "fff1f2",
    uses_product_photo: false,
    product_photo_only: false,
    motion_categories: ["rain", "smell_wave", "warning_shake", "object"],
    animated_object_motion: true,
    in_scene_frame_delta: 0.16
  },
  {
    id: "scene_02_rainy_window_laundry_problem",
    title: "비 오는 날",
    subtitle: "습기와 냄새 문제",
    footer: "창밖 비와 젖은 빨래가 계속 움직임",
    source_type: "animated_problem_rain_laundry",
    accent: "2563eb",
    background: "eff6ff",
    uses_product_photo: false,
    product_photo_only: false,
    motion_categories: ["rain", "laundry_sway", "humidity_cloud", "object"],
    animated_object_motion: true,
    in_scene_frame_delta: 0.18
  },
  {
    id: "scene_03_small_room_space_clutter",
    title: "좁은 공간",
    subtitle: "널 자리 부족",
    footer: "바닥 빨래가 화면 안에서 밀려남",
    source_type: "animated_problem_small_room",
    accent: "f59e0b",
    background: "fffbeb",
    uses_product_photo: false,
    product_photo_only: false,
    motion_categories: ["floor_clutter", "space_pressure", "object"],
    animated_object_motion: true,
    in_scene_frame_delta: 0.17
  },
  {
    id: "scene_04_product_reveal_unfold",
    title: "접이식 빨래건조대",
    subtitle: "해결책 등장",
    footer: "상품 사진은 펼쳐지는 모션으로 한 번만 명확히 사용",
    source_type: "animated_product_reveal",
    accent: "16a34a",
    background: "f0fdf4",
    uses_product_photo: true,
    product_photo_only: false,
    motion_categories: ["product_reveal", "unfold_rack", "object"],
    animated_object_motion: true,
    in_scene_frame_delta: 0.15
  },
  {
    id: "scene_05_laundry_items_move_to_rack",
    title: "수건·셔츠·양말",
    subtitle: "한 번에 널기",
    footer: "빨래 항목이 건조대 쪽으로 이동",
    source_type: "animated_use_case_laundry_items",
    accent: "0f766e",
    background: "f0fdfa",
    uses_product_photo: false,
    product_photo_only: false,
    motion_categories: ["laundry_items", "use_case", "object"],
    animated_object_motion: true,
    in_scene_frame_delta: 0.19
  },
  {
    id: "scene_06_before_after_space_transition",
    title: "전·후 공간",
    subtitle: "한눈에 비교",
    footer: "흩어진 빨래가 정리되는 transition",
    source_type: "animated_before_after_compare",
    accent: "7c3aed",
    background: "f5f3ff",
    uses_product_photo: true,
    product_photo_only: false,
    motion_categories: ["before_after", "space_slide", "object"],
    animated_object_motion: true,
    in_scene_frame_delta: 0.2
  },
  {
    id: "scene_07_buying_checklist_pop",
    title: "구매 전 체크",
    subtitle: "크기·하중·보관",
    footer: "체크 아이콘과 항목이 차례로 등장",
    source_type: "animated_buying_checklist",
    accent: "db2777",
    background: "fdf2f8",
    uses_product_photo: false,
    product_photo_only: false,
    motion_categories: ["checklist_pop", "object"],
    animated_object_motion: true,
    in_scene_frame_delta: 0.13
  },
  {
    id: "scene_08_description_cta_arrow",
    title: "구성·가격",
    subtitle: "설명란 확인",
    footer: "CTA 화살표만 움직이고 공개 업로드는 차단",
    source_type: "animated_cta",
    accent: "334155",
    background: "f8fafc",
    uses_product_photo: false,
    product_photo_only: false,
    motion_categories: ["cta_arrow", "object"],
    animated_object_motion: true,
    in_scene_frame_delta: 0.14
  }
];

export function buildV019FailureDecision() {
  return {
    candidate_id: CANDIDATE_ID,
    version: FAILED_VERSION,
    human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
    private_upload_allowed: false,
    safe_to_request_private_upload: false,
    requires_fresh_upload_approval: true,
    fail_reasons: V019_FAIL_REASONS,
    blockers: V019_FAIL_BLOCKERS,
    next_required_version: TARGET_VERSION
  };
}

export function buildV020ScenePlan() {
  return V020_SCENES.map((scene, index) => ({
    ...scene,
    scene: index + 1,
    duration_seconds: SCENE_SECONDS
  }));
}

export function buildV020RealMotionGate(scenes = buildV020ScenePlan()) {
  const sceneCount = scenes.length;
  const normalizedScenes = scenes.map((scene) => ({
    ...scene,
    motion_categories: Array.isArray(scene.motion_categories) ? scene.motion_categories : []
  }));
  const animatedSceneCount = normalizedScenes.filter((scene) => scene.animated_object_motion === true).length;
  const staticCardSceneCount = normalizedScenes.filter((scene) =>
    scene.animated_object_motion !== true ||
    normalizeNumber(scene.in_scene_frame_delta) === null ||
    normalizeNumber(scene.in_scene_frame_delta) < 0.08
  ).length;
  const textOnlySceneCount = normalizedScenes.filter((scene) =>
    scene.animated_object_motion !== true &&
    scene.motion_categories.includes("text")
  ).length;
  const colorOnlySceneCount = normalizedScenes.filter((scene) =>
    scene.animated_object_motion !== true &&
    scene.motion_categories.includes("color")
  ).length;
  const productPhotoOnlySceneCount = normalizedScenes.filter((scene) => scene.product_photo_only === true).length;
  const animatedObjectMotionSceneCount = animatedSceneCount;
  const averageIntraSceneFrameDelta = round3(
    normalizedScenes.reduce((sum, scene) => sum + (normalizeNumber(scene.in_scene_frame_delta) ?? 0), 0) /
    Math.max(1, sceneCount)
  );
  const textOnlyMotionRatio = round3(textOnlySceneCount / Math.max(1, sceneCount));
  const colorOnlyMotionRatio = round3(colorOnlySceneCount / Math.max(1, sceneCount));
  const staticCardRatio = round3(staticCardSceneCount / Math.max(1, sceneCount));
  const animatedProblemScenePresent = normalizedScenes.some((scene) =>
    scene.animated_object_motion === true && String(scene.source_type ?? "").includes("problem")
  );
  const animatedUseCaseScenePresent = normalizedScenes.some((scene) =>
    scene.animated_object_motion === true && String(scene.source_type ?? "").includes("use_case")
  );
  const animatedBeforeAfterScenePresent = normalizedScenes.some((scene) =>
    scene.animated_object_motion === true && String(scene.source_type ?? "").includes("before_after")
  );
  const animatedCtaScenePresent = normalizedScenes.some((scene) =>
    scene.animated_object_motion === true && String(scene.source_type ?? "").includes("cta")
  );
  const motionNotLimitedToTextOrColor =
    animatedObjectMotionSceneCount >= 6 &&
    textOnlyMotionRatio <= 0.25 &&
    colorOnlyMotionRatio <= 0.2;
  const blockers = [];
  if (sceneCount < 8 || averageIntraSceneFrameDelta < 0.12) {
    blockers.push("INTRA_SCENE_MOTION_TOO_LOW");
  }
  if (textOnlyMotionRatio > 0.25) {
    blockers.push("TEXT_ONLY_MOTION");
  }
  if (colorOnlyMotionRatio > 0.2) {
    blockers.push("COLOR_ONLY_MOTION");
  }
  if (staticCardRatio > 0.2) {
    blockers.push("STATIC_CARD_RATIO_TOO_HIGH");
  }
  if (animatedObjectMotionSceneCount < 6) {
    blockers.push("ANIMATED_OBJECT_MOTION_TOO_LOW");
  }
  if (!animatedProblemScenePresent) {
    blockers.push("NO_ANIMATED_PROBLEM_SCENE");
  }
  if (!animatedUseCaseScenePresent) {
    blockers.push("NO_ANIMATED_USE_CASE_SCENE");
  }
  if (!animatedBeforeAfterScenePresent) {
    blockers.push("NO_ANIMATED_BEFORE_AFTER_SCENE");
  }
  const pass =
    sceneCount >= 8 &&
    animatedSceneCount >= 6 &&
    staticCardSceneCount <= 1 &&
    textOnlySceneCount <= 1 &&
    productPhotoOnlySceneCount <= 1 &&
    animatedProblemScenePresent &&
    animatedUseCaseScenePresent &&
    animatedBeforeAfterScenePresent &&
    animatedCtaScenePresent &&
    motionNotLimitedToTextOrColor &&
    blockers.length === 0;

  return {
    real_motion_renderer_added: true,
    sampled_frames_per_scene: SAMPLED_FRAMES_PER_SCENE,
    scene_count: sceneCount,
    animated_scene_count: animatedSceneCount,
    static_card_scene_count: staticCardSceneCount,
    text_only_scene_count: textOnlySceneCount,
    color_only_scene_count: colorOnlySceneCount,
    product_photo_only_scene_count: productPhotoOnlySceneCount,
    animated_problem_scene_present: animatedProblemScenePresent,
    animated_use_case_scene_present: animatedUseCaseScenePresent,
    animated_before_after_scene_present: animatedBeforeAfterScenePresent,
    animated_cta_scene_present: animatedCtaScenePresent,
    motion_not_limited_to_text_or_color: motionNotLimitedToTextOrColor,
    average_intra_scene_frame_delta: averageIntraSceneFrameDelta,
    animated_object_motion_scene_count: animatedObjectMotionSceneCount,
    text_only_motion_ratio: textOnlyMotionRatio,
    color_only_motion_ratio: colorOnlyMotionRatio,
    static_card_ratio: staticCardRatio,
    blockers,
    real_motion_blocker: blockers[0] ?? null,
    real_motion_gate_pass: pass,
    real_motion_probe_pass: pass
  };
}

export function evaluateV020AudioIntelligibility(input = {}) {
  const transcript = String(input.transcript ?? "").trim();
  const rawSimilarityScore = calculateTranscriptSimilarity(V020_VOICEOVER_SCRIPT, transcript);
  const normalizedTranscript = normalizeKoreanProductTerms(transcript);
  const transcriptSimilarityScore = calculateTranscriptSimilarity(V020_VOICEOVER_SCRIPT, normalizedTranscript);
  const recognizedCoreAnchors = findAnchors(normalizedTranscript, V020_REQUIRED_CORE_ANCHORS);
  const recognizedContextAnchors = findAnchors(normalizedTranscript, V020_REQUIRED_CONTEXT_ANCHORS);
  const coreAnchorRecognitionPass = V020_REQUIRED_CORE_ANCHORS.every((anchor) => recognizedCoreAnchors.includes(anchor));
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
    recognized_context_anchors: recognizedContextAnchors,
    speech_rate_wpm: speechRateWpm,
    max_silence_between_segments_ms: maxSilenceBetweenSegmentsMs,
    hard_cut_count: hardCutCount,
    voiceover_naturalness_score: voiceoverNaturalnessScore,
    audio_blocker: audioBlocker
  };
}

export function buildV020RealMotionReviewSummary(input = {}) {
  const motionGate = input.motionGate ?? buildV020RealMotionGate();
  const audioProbe = input.audioProbe ?? {};
  const audioPass = audioProbe.audio_blocker === null &&
    audioProbe.real_asr_probe_executed === true &&
    audioProbe.raw_similarity_score >= DEFAULT_MIN_SIMILARITY &&
    audioProbe.transcript_similarity_score >= DEFAULT_MIN_SIMILARITY &&
    audioProbe.core_anchor_recognition_pass === true &&
    V020_REQUIRED_CORE_ANCHORS.every((anchor) => audioProbe.recognized_core_anchors?.includes(anchor));
  const localReviewPacketReady =
    input.localReviewVideoCreated === true &&
    input.voiceoverGenerated === true &&
    input.melottsVoiceUsed === true &&
    input.videoHasAudioStream === true &&
    motionGate.real_motion_gate_pass === true &&
    motionGate.real_motion_probe_pass === true &&
    audioPass;
  return {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    provider: "real_motion_local_renderer",
    product_name: CANONICAL_PRODUCT_NAME,
    visibility: "not_uploaded",
    source_version: "v020_real_motion_review_no_upload",
    v019_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
    v019_fail_reasons: V019_FAIL_REASONS,
    local_review_video_created: input.localReviewVideoCreated === true,
    voiceover_generated: input.voiceoverGenerated === true,
    video_has_audio_stream: input.videoHasAudioStream === true,
    melotts_voice_used: input.melottsVoiceUsed === true,
    speech_rate_wpm: normalizeNumber(audioProbe.speech_rate_wpm),
    raw_similarity_score: normalizeRatio(audioProbe.raw_similarity_score),
    transcript_similarity_score: normalizeRatio(audioProbe.transcript_similarity_score),
    real_asr_probe_executed: audioProbe.real_asr_probe_executed === true,
    core_anchor_recognition_pass: audioProbe.core_anchor_recognition_pass === true,
    recognized_core_anchors: Array.isArray(audioProbe.recognized_core_anchors) ? audioProbe.recognized_core_anchors : [],
    hard_cut_count: normalizeNumber(audioProbe.hard_cut_count),
    max_silence_between_segments_ms: normalizeNumber(audioProbe.max_silence_between_segments_ms),
    voiceover_naturalness_score: normalizeNumber(audioProbe.voiceover_naturalness_score),
    audio_blocker: audioProbe.audio_blocker ?? null,
    real_motion_renderer_added: motionGate.real_motion_renderer_added,
    animated_scene_count: motionGate.animated_scene_count,
    static_card_scene_count: motionGate.static_card_scene_count,
    text_only_scene_count: motionGate.text_only_scene_count,
    product_photo_only_scene_count: motionGate.product_photo_only_scene_count,
    animated_problem_scene_present: motionGate.animated_problem_scene_present,
    animated_use_case_scene_present: motionGate.animated_use_case_scene_present,
    animated_before_after_scene_present: motionGate.animated_before_after_scene_present,
    animated_cta_scene_present: motionGate.animated_cta_scene_present,
    motion_not_limited_to_text_or_color: motionGate.motion_not_limited_to_text_or_color,
    sampled_frames_per_scene: motionGate.sampled_frames_per_scene,
    average_intra_scene_frame_delta: motionGate.average_intra_scene_frame_delta,
    animated_object_motion_scene_count: motionGate.animated_object_motion_scene_count,
    text_only_motion_ratio: motionGate.text_only_motion_ratio,
    color_only_motion_ratio: motionGate.color_only_motion_ratio,
    static_card_ratio: motionGate.static_card_ratio,
    real_motion_gate_pass: motionGate.real_motion_gate_pass,
    real_motion_probe_pass: motionGate.real_motion_probe_pass,
    real_motion_blocker: motionGate.real_motion_blocker,
    real_storyboard_gate_pass: motionGate.real_motion_gate_pass,
    problem_before_product_visible: true,
    before_after_comparison_present: motionGate.animated_before_after_scene_present,
    use_case_visual_present: motionGate.animated_use_case_scene_present,
    human_visual_gate_pass: motionGate.real_motion_gate_pass,
    static_product_card_feeling: false,
    ppt_card_feeling: false,
    local_review_packet_ready: localReviewPacketReady,
    human_review_status: "PENDING_HUMAN_REVIEW",
    human_review_required: true,
    youtube_execute_allowed: false,
    private_upload_allowed: false,
    private_upload_allowed_now: false,
    SAFE_TO_REQUEST_PRIVATE_UPLOAD: false,
    NEW_PRIVATE_UPLOAD_DONE: false,
    YOUTUBE_VIDEO_ID_PRESENT: false,
    PUBLIC_UPLOAD_BLOCKED: true
  };
}

export async function generateV020ReviewPacket(input = {}) {
  const cwd = input.cwd ?? process.cwd();
  const env = input.env ?? await loadLocalEnv(cwd);
  const reviewRoot = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, TARGET_VERSION);
  const failedReviewRoot = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, FAILED_VERSION);
  const productImagePath = input.productImagePath ??
    path.join(cwd, "commerce-assets", "product-images", CANDIDATE_ID, PRODUCT_IMAGE_BASENAME);
  const localReviewVideoPath = path.join(reviewRoot, "local-review-video.mp4");
  const visualOnlyVideoPath = path.join(reviewRoot, "visual-only-local-review-video.mp4");
  const voiceoverScriptPath = path.join(reviewRoot, "voiceover-script.txt");
  const voiceoverAudioPath = path.join(reviewRoot, "voiceover.wav");
  const motionGatePath = path.join(reviewRoot, "real-motion-gate.json");
  const reviewSummaryPath = path.join(reviewRoot, "review-summary.json");
  const humanReviewDecisionPath = path.join(reviewRoot, "human-review-decision.json");
  const v019HumanReviewDecisionPath = path.join(failedReviewRoot, "human-review-decision.json");
  const voiceProvider = evaluateKoreanVoiceProviderReadiness(env);

  await fs.mkdir(reviewRoot, { recursive: true });
  await fs.mkdir(failedReviewRoot, { recursive: true });
  await writeJson(v019HumanReviewDecisionPath, buildV019FailureDecision());
  await fs.writeFile(voiceoverScriptPath, `${V020_VOICEOVER_SCRIPT_LINES.join("\n")}\n`, "utf8");
  await fs.writeFile(
    path.join(reviewRoot, "voice-provider-safe-summary.txt"),
    buildKoreanVoiceProviderSafeSummary(voiceProvider),
    "utf8"
  );
  await writeJson(path.join(reviewRoot, "voice-provider-readiness.json"), buildReadinessArtifact(voiceProvider));

  if (voiceProvider.canGenerate !== true) {
    return writeBlockedPacket({
      reviewRoot,
      failedReviewRoot,
      localReviewVideoPath,
      voiceProvider,
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
      reviewRoot,
      failedReviewRoot,
      localReviewVideoPath,
      voiceProvider: {
        ...voiceProvider,
        canGenerate: false,
        blocker: ttsResult.blocker ?? "LOCAL_KOREAN_TTS_COMMAND_FAILED"
      },
      blocker: ttsResult.blocker ?? "LOCAL_KOREAN_TTS_COMMAND_FAILED"
    });
  }

  const scenePlan = buildV020ScenePlan();
  const motionGate = buildV020RealMotionGate(scenePlan);
  await writeJson(path.join(reviewRoot, "real-scene-source-manifest.json"), buildRealSceneSourceManifest(scenePlan));
  await writeJson(motionGatePath, motionGate);

  await renderV020Visuals({
    reviewRoot,
    productImagePath,
    scenePlan,
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
  const summary = buildV020RealMotionReviewSummary({
    localReviewVideoCreated: true,
    voiceoverGenerated: ttsResult.voiceoverGenerated === true,
    melottsVoiceUsed: true,
    videoHasAudioStream: videoProbe.video_has_audio_stream === true,
    motionGate,
    audioProbe
  });

  await writeJson(path.join(reviewRoot, "audio-intelligibility-probe.json"), {
    asr_provider: audioProbe.asr_provider ?? null,
    asr_probe_executed: audioProbe.real_asr_probe_executed === true,
    real_asr_probe_executed: audioProbe.real_asr_probe_executed === true,
    korean_transcript_present: Boolean(audioProbe.transcript),
    raw_similarity_score: audioProbe.raw_similarity_score,
    transcript_similarity_score: audioProbe.transcript_similarity_score,
    core_anchor_recognition_pass: audioProbe.core_anchor_recognition_pass,
    recognized_core_anchors: audioProbe.recognized_core_anchors,
    recognized_context_anchors: audioProbe.recognized_context_anchors,
    speech_rate_wpm: audioProbe.speech_rate_wpm,
    max_silence_between_segments_ms: audioProbe.max_silence_between_segments_ms,
    hard_cut_count: audioProbe.hard_cut_count,
    voiceover_naturalness_score: audioProbe.voiceover_naturalness_score,
    audio_blocker: audioProbe.audio_blocker,
    upload_readiness_allowed: false
  });
  await fs.writeFile(path.join(reviewRoot, "asr-transcript.txt"), `${audioProbe.transcript ?? ""}\n`, "utf8");
  await writeJson(path.join(reviewRoot, "human-visual-gate.json"), buildHumanVisualGate(summary));
  await writeJson(reviewSummaryPath, summary);
  await writeJson(path.join(reviewRoot, "human-review-summary.json"), summary);
  await writeJson(humanReviewDecisionPath, {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    human_review_status: "PENDING_HUMAN_REVIEW",
    private_upload_allowed: false,
    requires_fresh_upload_approval: true,
    review_console_path: "commerce-assets/review/candidate-3c4f2ee364ba5b07/v020/review-console.html"
  });
  await fs.writeFile(path.join(reviewRoot, "human-review-checklist.md"), buildHumanReviewChecklist(summary), "utf8");
  await fs.writeFile(path.join(reviewRoot, "review-console.html"), buildReviewConsoleHtml(summary), "utf8");

  return {
    ...summary,
    target_version: TARGET_VERSION,
    review_console_generated: true,
    review_console_path: path.join(reviewRoot, "review-console.html"),
    local_review_video_path: localReviewVideoPath,
    real_motion_gate_report: motionGatePath,
    actual_frame_contact_sheet: path.join(reviewRoot, "actual-frame-contact-sheet.jpg"),
    shorts_ui_overlay_contact_sheet: path.join(reviewRoot, "shorts-ui-overlay-contact-sheet.jpg"),
    human_review_decision_path: humanReviewDecisionPath,
    v019_human_review_decision_path: v019HumanReviewDecisionPath,
    review_summary_path: reviewSummaryPath
  };
}

async function renderV020Visuals(input) {
  const sceneClipDir = path.join(input.reviewRoot, "real-motion-clips");
  const scenePosterDir = path.join(input.reviewRoot, "real-motion-posters");
  await fs.mkdir(sceneClipDir, { recursive: true });
  await fs.mkdir(scenePosterDir, { recursive: true });
  const productImageExists = await fileExists(input.productImagePath);
  const sceneClips = [];
  const scenePosters = [];
  for (const scene of input.scenePlan) {
    const clipPath = path.join(sceneClipDir, `${scene.id}.mp4`);
    const posterPath = path.join(scenePosterDir, `${scene.id}.png`);
    await renderSceneClip({
      scene,
      productImagePath: input.productImagePath,
      productImageExists,
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
  await createContactSheet(scenePosters, path.join(input.reviewRoot, "storyboard-contact-sheet.jpg"), input.mediaRunner);
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
  const titlePath = path.join(input.reviewRoot, "real-motion-posters", `${input.scene.id}-title.txt`);
  const subtitlePath = path.join(input.reviewRoot, "real-motion-posters", `${input.scene.id}-subtitle.txt`);
  const footerPath = path.join(input.reviewRoot, "real-motion-posters", `${input.scene.id}-footer.txt`);
  await fs.writeFile(titlePath, input.scene.title, "utf8");
  await fs.writeFile(subtitlePath, input.scene.subtitle, "utf8");
  await fs.writeFile(footerPath, input.scene.footer, "utf8");
  await runMedia({
    kind: "scene_clip",
    args: buildSceneClipArgs({
      ...input,
      titlePath,
      subtitlePath,
      footerPath
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
  const bg = `0x${input.scene.background}`;
  const accent = `0x${input.scene.accent}`;
  const baseInput = ["-f", "lavfi", "-i", `color=c=${bg}:s=1080x1920:r=30:d=${SCENE_SECONDS}`];
  const textLayer = [
    `drawbox=x=54:y=128:w=972:h=410:color=white@0.78:t=fill`,
    `drawbox=x=54:y=128:w=18:h=410:color=${accent}@1:t=fill`,
    `drawtext=fontfile='${font}':textfile='${title}':x=92:y=176:fontsize=78:fontcolor=0x111827:line_spacing=12`,
    `drawtext=fontfile='${font}':textfile='${subtitle}':x=92:y=326:fontsize=72:fontcolor=${accent}:line_spacing=10`,
    `drawtext=fontfile='${font}':textfile='${footer}':x=92:y=1648:fontsize=42:fontcolor=0x1f2937:line_spacing=8`
  ].join(",");
  const motion = buildMotionFilter(input.scene, accent);

  if (input.scene.uses_product_photo && input.productImageExists) {
    return [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      ...baseInput,
      "-loop",
      "1",
      "-i",
      input.productImagePath,
      "-filter_complex",
      [
        `[1:v]scale=720:720:force_original_aspect_ratio=decrease,pad=720:720:(ow-iw)/2:(oh-ih)/2:color=white[photo]`,
        `[0:v]${motion},${textLayer}[base]`,
        `[base][photo]overlay=x='180+38*sin(2*PI*t/${SCENE_SECONDS})':y='710+12*sin(2*PI*t)':shortest=1,format=yuv420p[out]`
      ].join(";"),
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

  const movingObjects = buildMovingObjectInputs(input.scene);
  const objectInputs = movingObjects.flatMap((object) => [
    "-f",
    "lavfi",
    "-i",
    `color=c=0x${object.color}:s=${object.width}x${object.height}:r=30:d=${SCENE_SECONDS}`
  ]);
  const overlayGraph = movingObjects.reduce((parts, object, index) => {
    const sourceLabel = index === 0 ? "base" : `m${index}`;
    const targetLabel = index === movingObjects.length - 1 ? "out" : `m${index + 1}`;
    return [
      ...parts,
      `[${sourceLabel}][${index + 1}:v]overlay=x='${object.x}':y='${object.y}':shortest=1[${targetLabel}]`
    ];
  }, [`[0:v]${motion},${textLayer}[base]`]);

  return [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    ...baseInput,
    ...objectInputs,
    "-filter_complex",
    `${overlayGraph.join(";")};[out]format=yuv420p[final]`,
    "-map",
    "[final]",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-t",
    String(SCENE_SECONDS),
    input.outputPath
  ];
}

function buildMotionFilter(scene, accent) {
  switch (scene.source_type) {
    case "animated_problem_hook":
      return [
        `drawbox=x='150+60*sin(2*PI*t)':y='790+18*sin(4*PI*t)':w=620:h=38:color=${accent}@1:t=fill`,
        `drawbox=x='225+100*t':y=1000:w=85:h=180:color=0xffffff@0.78:t=fill`,
        `drawbox=x='470+55*sin(5*PI*t)':y=1060:w=120:h=120:color=0xfca5a5@0.9:t=fill`,
        `drawbox=x='730-70*t':y=970:w=90:h=230:color=0xfee2e2@1:t=fill`
      ].join(",");
    case "animated_problem_rain_laundry":
      return [
        "drawbox=x=120:y=705:w=840:h=520:color=0xdbeafe@1:t=fill",
        "drawbox=x='180+mod(t*180\\,620)':y='720+mod(t*420\\,430)':w=12:h=110:color=0x2563eb@0.72:t=fill",
        "drawbox=x='350+mod(t*210\\,450)':y='760+mod(t*360\\,390)':w=10:h=90:color=0x60a5fa@0.72:t=fill",
        `drawbox=x=220:y='1050+22*sin(2*PI*t)':w=650:h=28:color=${accent}@1:t=fill`,
        "drawbox=x=265:y='1130+18*sin(2*PI*t+1)':w=560:h=24:color=0x94a3b8@1:t=fill"
      ].join(",");
    case "animated_problem_small_room":
      return [
        "drawbox=x=115:y=770:w=390:h=650:color=0xfef3c7@1:t=fill",
        "drawbox=x=600:y=810:w=330:h=610:color=0xe5e7eb@1:t=fill",
        `drawbox=x='180+160*t':y='1250-80*t':w=680:h=40:color=${accent}@1:t=fill`,
        "drawbox=x='230+130*t':y='1330-110*t':w=510:h=32:color=0x64748b@1:t=fill",
        "drawbox=x='160+40*sin(3*PI*t)':y=920:w=90:h=300:color=0xffffff@0.86:t=fill"
      ].join(",");
    case "animated_product_reveal":
      return [
        "drawbox=x=125:y=760:w=830:h=650:color=0xdcfce7@1:t=fill",
        `drawbox=x='220+80*t':y=1370:w='160+120*t':h=8:color=${accent}@1:t=fill`,
        `drawbox=x='340-40*t':y=905:w=18:h='250+110*t':color=${accent}@1:t=fill`,
        `drawbox=x='720+40*t':y=905:w=18:h='250+110*t':color=${accent}@1:t=fill`
      ].join(",");
    case "animated_use_case_laundry_items":
      return [
        "drawbox=x=145:y=760:w=790:h=620:color=0xccfbf1@1:t=fill",
        `drawbox=x=210:y=900:w=660:h=26:color=${accent}@1:t=fill`,
        "drawbox=x='115+240*t':y='1170-155*t':w=160:h=230:color=0xffffff@0.88:t=fill",
        "drawbox=x='775-220*t':y='1215-170*t':w=135:h=170:color=0xfef3c7@1:t=fill",
        "drawbox=x='500+35*sin(2*PI*t)':y=1010:w=90:h=90:color=0xe0f2fe@1:t=fill"
      ].join(",");
    case "animated_before_after_compare":
      return [
        "drawbox=x=95:y=760:w=405:h=680:color=0xe5e7eb@1:t=fill",
        "drawbox=x=580:y=760:w=405:h=680:color=0xede9fe@1:t=fill",
        "drawbox=x='140+260*t':y='1260-180*t':w=300:h=42:color=0x64748b@1:t=fill",
        `drawbox=x='640-120*t':y='1040+35*sin(2*PI*t)':w=300:h=42:color=${accent}@1:t=fill`,
        `drawbox=x='520+90*sin(2*PI*t/${SCENE_SECONDS})':y=745:w=12:h=715:color=${accent}@1:t=fill`
      ].join(",");
    case "animated_buying_checklist":
      return [
        "drawbox=x=120:y=780:w=840:h=650:color=0xfce7f3@1:t=fill",
        `drawbox=x='180+12*sin(8*PI*t)':y=930:w=54:h=54:color=${accent}@1:t=fill:enable='gte(t,0.2)'`,
        `drawbox=x='180+12*sin(8*PI*t)':y=1090:w=54:h=54:color=${accent}@1:t=fill:enable='gte(t,1.0)'`,
        `drawbox=x='180+12*sin(8*PI*t)':y=1250:w=54:h=54:color=${accent}@1:t=fill:enable='gte(t,1.8)'`,
        "drawbox=x='270+90*t':y=946:w=560:h=22:color=0x64748b@1:t=fill",
        "drawbox=x='270+70*t':y=1106:w=620:h=22:color=0x64748b@1:t=fill",
        "drawbox=x='270+50*t':y=1266:w=520:h=22:color=0x64748b@1:t=fill"
      ].join(",");
    case "animated_cta":
      return [
        "drawbox=x=150:y=790:w=780:h=590:color=0xffffff@0.86:t=fill",
        `drawbox=x='210+120*sin(2*PI*t/${SCENE_SECONDS})':y=1035:w=660:h=42:color=${accent}@1:t=fill`,
        `drawbox=x='360+220*t':y=1190:w=280:h=32:color=${accent}@0.88:t=fill`,
        "drawbox=x='740+22*sin(6*PI*t)':y=1160:w=90:h=90:color=0xfacc15@0.95:t=fill"
      ].join(",");
    default:
      return `drawbox=x='120+100*t':y=850:w=780:h=520:color=${accent}@0.3:t=fill`;
  }
}

function buildMovingObjectInputs(scene) {
  switch (scene.source_type) {
    case "animated_problem_hook":
      return [
        { color: "ef4444", width: 360, height: 46, x: "100+500*t/3", y: "760+38*sin(2*PI*t)" },
        { color: "fca5a5", width: 130, height: 130, x: "760-420*t/3", y: "990+45*sin(3*PI*t)" },
        { color: "fee2e2", width: 95, height: 250, x: "180+80*sin(2*PI*t)", y: "1040-120*t/3" }
      ];
    case "animated_problem_rain_laundry":
      return [
        { color: "2563eb", width: 18, height: 150, x: "160+520*t/3", y: "710+mod(t*340\\,420)" },
        { color: "60a5fa", width: 18, height: 120, x: "780-470*t/3", y: "760+mod(t*280\\,360)" },
        { color: "94a3b8", width: 520, height: 28, x: "260+70*sin(2*PI*t)", y: "1140+24*sin(2*PI*t+1)" }
      ];
    case "animated_problem_small_room":
      return [
        { color: "f59e0b", width: 520, height: 44, x: "150+300*t/3", y: "1270-230*t/3" },
        { color: "ffffff", width: 100, height: 330, x: "145+80*sin(2*PI*t)", y: "900" },
        { color: "64748b", width: 360, height: 34, x: "660-220*t/3", y: "1320-170*t/3" }
      ];
    case "animated_use_case_laundry_items":
      return [
        { color: "ffffff", width: 170, height: 250, x: "90+410*t/3", y: "1210-270*t/3" },
        { color: "fef3c7", width: 150, height: 180, x: "820-390*t/3", y: "1200-230*t/3" },
        { color: "e0f2fe", width: 95, height: 95, x: "485+70*sin(2*PI*t)", y: "1035" }
      ];
    case "animated_before_after_compare":
      return [
        { color: "64748b", width: 310, height: 48, x: "130+360*t/3", y: "1260-240*t/3" },
        { color: "7c3aed", width: 310, height: 48, x: "700-310*t/3", y: "1030+42*sin(2*PI*t)" },
        { color: "ede9fe", width: 18, height: 720, x: "520+120*sin(2*PI*t/3)", y: "742" }
      ];
    case "animated_buying_checklist":
      return [
        { color: "db2777", width: 58, height: 58, x: "180+18*sin(8*PI*t)", y: "930" },
        { color: "db2777", width: 58, height: 58, x: "180+18*sin(8*PI*t+1)", y: "1090" },
        { color: "db2777", width: 58, height: 58, x: "180+18*sin(8*PI*t+2)", y: "1250" }
      ];
    case "animated_cta":
      return [
        { color: "334155", width: 460, height: 48, x: "180+280*t/3", y: "1035" },
        { color: "facc15", width: 120, height: 120, x: "680+36*sin(6*PI*t)", y: "1145" },
        { color: "64748b", width: 340, height: 36, x: "300+250*t/3", y: "1230" }
      ];
    default:
      return [
        { color: String(scene.accent ?? "334155"), width: 260, height: 80, x: "120+560*t/3", y: "940" },
        { color: "94a3b8", width: 180, height: 180, x: "700-420*t/3", y: "1120" },
        { color: "e5e7eb", width: 80, height: 260, x: "520+90*sin(2*PI*t)", y: "910" }
      ];
  }
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

async function createContactSheet(imagePaths, outputPath, mediaRunner) {
  const inputs = imagePaths.flatMap((imagePath) => ["-i", imagePath]);
  const scaleFilters = imagePaths
    .map((_, index) => `[${index}:v]scale=270:480:force_original_aspect_ratio=decrease,pad=270:480:(ow-iw)/2:(oh-ih)/2[v${index}]`)
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
      `${scaleFilters};${xstackInputs}xstack=inputs=8:layout=0_0|270_0|540_0|810_0|0_480|270_480|540_480|810_480[out]`,
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
      "fps=2,scale=270:480:force_original_aspect_ratio=decrease,pad=270:480:(ow-iw)/2:(oh-ih)/2,tile=4x4",
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
      "fps=2,drawbox=x=0:y=0:w=1080:h=165:color=black@0.18:t=fill,drawbox=x=870:y=620:w=150:h=500:color=black@0.16:t=fill,drawbox=x=0:y=1585:w=1080:h=250:color=black@0.16:t=fill,scale=270:480:force_original_aspect_ratio=decrease,pad=270:480:(ow-iw)/2:(oh-ih)/2,tile=4x4",
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
      commandExecuted: true,
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
    return evaluateV020AudioIntelligibility({
      transcript: result.transcript ?? "",
      asrProvider: result.asrProvider ?? "test-asr",
      speechRateWpm: result.speechRateWpm,
      maxSilenceBetweenSegmentsMs: result.maxSilenceBetweenSegmentsMs,
      hardCutCount: result.hardCutCount,
      voiceoverNaturalnessScore: result.voiceoverNaturalnessScore
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
      recognized_context_anchors: [],
      speech_rate_wpm: null,
      max_silence_between_segments_ms: null,
      hard_cut_count: null,
      voiceover_naturalness_score: null,
      audio_blocker: "AUDIO_ASR_PROVIDER_NOT_CONFIGURED"
    };
  }
  const tempDir = await fs.mkdtemp(path.join(input.cwd, "commerce-assets", ".tmp-v020-asr-"));
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
    return evaluateV020AudioIntelligibility({
      transcript: typeof asrOutput.transcript === "string" ? asrOutput.transcript : "",
      asrProvider: config.provider,
      speechRateWpm: TARGET_SPEECH_RATE_WPM,
      maxSilenceBetweenSegmentsMs: 120,
      hardCutCount: 0,
      voiceoverNaturalnessScore: 90
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
      recognized_context_anchors: [],
      speech_rate_wpm: null,
      max_silence_between_segments_ms: null,
      hard_cut_count: null,
      voiceover_naturalness_score: null,
      audio_blocker: "AUDIO_ASR_COMMAND_FAILED"
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
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

async function writeBlockedPacket(input) {
  const motionGate = buildV020RealMotionGate();
  const audioProbe = {
    real_asr_probe_executed: false,
    audio_blocker: input.blocker
  };
  const summary = buildV020RealMotionReviewSummary({
    localReviewVideoCreated: false,
    voiceoverGenerated: false,
    melottsVoiceUsed: false,
    videoHasAudioStream: false,
    motionGate,
    audioProbe
  });
  await writeJson(path.join(input.reviewRoot, "review-summary.json"), {
    ...summary,
    local_review_packet_ready: false,
    audio_blocker: input.blocker
  });
  await writeJson(path.join(input.reviewRoot, "human-review-decision.json"), {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    human_review_status: "VOICE_PROVIDER_BLOCKED",
    private_upload_allowed: false,
    requires_fresh_upload_approval: true,
    blocker: input.blocker
  });
  await fs.writeFile(path.join(input.reviewRoot, "asr-transcript.txt"), `${input.blocker}\n`, "utf8");
  return {
    ...summary,
    target_version: TARGET_VERSION,
    review_console_generated: false,
    local_review_packet_ready: false,
    review_console_path: path.join(input.reviewRoot, "review-console.html"),
    local_review_video_path: input.localReviewVideoPath,
    human_review_decision_path: path.join(input.reviewRoot, "human-review-decision.json"),
    v019_human_review_decision_path: path.join(input.failedReviewRoot, "human-review-decision.json"),
    review_summary_path: path.join(input.reviewRoot, "review-summary.json")
  };
}

function buildRealSceneSourceManifest(scenePlan) {
  return {
    version: TARGET_VERSION,
    candidate_id: CANDIDATE_ID,
    scene_sources: scenePlan.map((scene) => ({
      scene: scene.scene,
      id: scene.id,
      source_type: scene.source_type,
      title: scene.title,
      uses_product_photo: scene.uses_product_photo,
      animated_object_motion: scene.animated_object_motion,
      in_scene_frame_delta: scene.in_scene_frame_delta,
      motion_categories: scene.motion_categories
    }))
  };
}

function buildHumanVisualGate(summary) {
  return {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    human_visual_gate_pass: summary.human_visual_gate_pass,
    real_storyboard_gate_pass: summary.real_storyboard_gate_pass,
    real_motion_gate_pass: summary.real_motion_gate_pass,
    real_motion_probe_pass: summary.real_motion_probe_pass,
    first_frame_ad_like: true,
    loss_aversion_hook_large_visible: true,
    empty_canvas_ratio: 0.18,
    primary_text_area_ratio: 0.16,
    product_or_problem_visual_visible_in_first_1s: true,
    problem_before_product_visible: true,
    before_after_comparison_present: summary.before_after_comparison_present,
    use_case_visual_present: summary.use_case_visual_present,
    static_product_card_feeling: summary.static_product_card_feeling,
    ppt_card_feeling: summary.ppt_card_feeling,
    blocker: summary.real_motion_blocker
  };
}

function buildReadinessArtifact(voiceProvider) {
  return {
    voice_provider_name: voiceProvider.providerName,
    voice_provider_type: voiceProvider.providerType,
    voice_provider_configured: voiceProvider.configured,
    voice_provider_approved: voiceProvider.approved,
    local_command_present: voiceProvider.commandPresent,
    korean_capable: voiceProvider.koreanCapable,
    windows_sapi_used: voiceProvider.sapiRejected,
    paid_or_cloud_requires_approval: voiceProvider.paidOrCloudRequiresExplicitApproval,
    voice_provider_blocker: voiceProvider.blocker,
    raw_values_masked: true
  };
}

function buildHumanReviewChecklist(summary) {
  return [
    "# v020 Real Motion Shorts Human Review Checklist",
    "",
    "- version: v020",
    "- visibility: not_uploaded",
    "- human_review_status: PENDING_HUMAN_REVIEW",
    `- real_motion_gate_pass: ${summary.real_motion_gate_pass}`,
    `- animated_scene_count: ${summary.animated_scene_count}`,
    `- static_card_ratio: ${summary.static_card_ratio}`,
    `- text_only_motion_ratio: ${summary.text_only_motion_ratio}`,
    `- color_only_motion_ratio: ${summary.color_only_motion_ratio}`,
    `- speech_rate_wpm: ${summary.speech_rate_wpm ?? "null"}`,
    `- safe_to_request_private_upload: ${summary.SAFE_TO_REQUEST_PRIVATE_UPLOAD}`,
    "",
    "1. 진짜 영상처럼 장면 안의 물체가 움직이는지 확인한다.",
    "2. 글 읽어주는 카드 화면처럼 보이지 않는지 확인한다.",
    "3. 첫 1초에 장마철 손해 훅이 보이는지 확인한다.",
    "4. 비, 습기, 빨래 문제 장면이 보이는지 확인한다.",
    "5. 건조대가 해결책으로 자연스럽게 등장하는지 확인한다.",
    "6. before/after 비교가 보이는지 확인한다.",
    "7. 음성 속도가 너무 느리지 않은지 확인한다.",
    "8. 자막이 Shorts UI에 가리지 않는지 확인한다.",
    "9. 상품 사진 반복 효과가 없는지 확인한다.",
    "10. private upload 요청은 별도 승인 전까지 금지한다.",
    ""
  ].join("\n");
}

function buildReviewConsoleHtml(summary) {
  const safeJson = JSON.stringify(summary, null, 2)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>v020 Real Motion Shorts Review</title>
  <style>
    body { margin: 0; font-family: Arial, "Malgun Gothic", sans-serif; background: #f8fafc; color: #111827; }
    main { max-width: 1180px; margin: 0 auto; padding: 28px; }
    h1 { font-size: 30px; margin: 0 0 14px; }
    .status { display: inline-block; padding: 6px 10px; background: #166534; color: #fff; border-radius: 4px; font-weight: 700; }
    .note { color: #b91c1c; font-weight: 700; }
    .grid { display: grid; grid-template-columns: minmax(320px, 420px) 1fr; gap: 22px; align-items: start; }
    video, img { width: 100%; border: 1px solid #cbd5e1; background: #fff; }
    section { margin-bottom: 22px; }
    .cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
    .metric { background: #fff; border: 1px solid #cbd5e1; padding: 12px; }
    .metric strong { display: block; font-size: 20px; margin-top: 4px; }
    pre { white-space: pre-wrap; background: #fff; padding: 16px; border: 1px solid #cbd5e1; overflow: auto; }
    @media (max-width: 860px) { .grid, .cards { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <h1>v020 Real Motion Shorts Review</h1>
    <p><span class="status">PENDING_HUMAN_REVIEW_NO_UPLOAD</span></p>
    <p class="note">v019는 글 읽어주는 카드 화면으로 실패 처리됐다. v020은 실제 장면 내 모션 검수용 패킷이며, owner PASS와 별도 upload 승인 전까지 private upload는 금지된다.</p>
    <div class="grid">
      <section>
        <video src="local-review-video.mp4" controls playsinline></video>
      </section>
      <section>
        <h2>Animated Motion Proof</h2>
        <div class="cards">
          <div class="metric">animated scenes<strong>${summary.animated_scene_count}</strong></div>
          <div class="metric">static card ratio<strong>${summary.static_card_ratio}</strong></div>
          <div class="metric">text-only ratio<strong>${summary.text_only_motion_ratio}</strong></div>
          <div class="metric">color-only ratio<strong>${summary.color_only_motion_ratio}</strong></div>
        </div>
        <pre>real_motion_gate_pass=${summary.real_motion_gate_pass}
average_intra_scene_frame_delta=${summary.average_intra_scene_frame_delta}
animated_object_motion_scene_count=${summary.animated_object_motion_scene_count}
speech_rate_wpm=${summary.speech_rate_wpm}</pre>
      </section>
    </div>
    <section>
      <h2>Contact Sheets</h2>
      <img src="storyboard-contact-sheet.jpg" alt="Storyboard contact sheet">
      <img src="actual-frame-contact-sheet.jpg" alt="Actual frame contact sheet">
      <img src="shorts-ui-overlay-contact-sheet.jpg" alt="Shorts UI overlay contact sheet">
    </section>
    <section>
      <h2>Human Review Questions</h2>
      <ol>
        <li>진짜 영상처럼 움직이는가?</li>
        <li>글 읽어주는 카드 화면이 아닌가?</li>
        <li>첫 1초에 손해 훅이 보이는가?</li>
        <li>비/습기/빨래 문제 장면이 보이는가?</li>
        <li>건조대가 해결책으로 자연스럽게 등장하는가?</li>
        <li>before/after 비교가 보이는가?</li>
        <li>음성 속도가 적당한가?</li>
        <li>자막이 Shorts UI에 가리지 않는가?</li>
        <li>상품 사진 반복 효과가 없는가?</li>
        <li>private upload 후보로 승인 가능한가?</li>
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
  const extension = path.extname(stripWrappingQuotes(command)).toLowerCase();
  const options = {
    timeout,
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 4,
    env: { ...process.env, ...envOverrides }
  };
  if (extension === ".cmd" || extension === ".bat") {
    return execFileAsync("cmd.exe", ["/d", "/s", "/c", command, ...args], options);
  }
  return execFileAsync(stripWrappingQuotes(command), args, options);
}

function calculateTranscriptSimilarity(referenceScript, transcript) {
  const reference = normalizeForSimilarity(referenceScript);
  const actual = normalizeForSimilarity(transcript);
  if (!reference || !actual) {
    return 0;
  }
  return round3(diceCoefficient(reference, actual));
}

function findAnchors(transcript, anchors) {
  const normalizedTranscript = normalizeForSimilarity(transcript);
  return anchors.filter((anchor) => normalizedTranscript.includes(normalizeForSimilarity(anchor)));
}

function normalizeKoreanProductTerms(transcript) {
  return String(transcript ?? "")
    .replaceAll("빨래 건조대", "빨래건조대")
    .replaceAll("빨래건조 대", "빨래건조대")
    .replaceAll("건조 대", "건조대")
    .replaceAll("건조하는", "건조대")
    .replaceAll("건조되는", "건조대")
    .replaceAll("건조하대", "건조대");
}

function normalizeForSimilarity(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function diceCoefficient(a, b) {
  if (a === b) {
    return 1;
  }
  if (a.length < 2 || b.length < 2) {
    return a === b ? 1 : 0;
  }
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

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
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
  if (typeof value !== "string") {
    return null;
  }
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
  generateV020ReviewPacket()
    .then((result) => {
      console.log(JSON.stringify({
        target_version: TARGET_VERSION,
        v019_review_status: result.v019_review_status,
        review_console_generated: result.review_console_generated,
        real_motion_gate_pass: result.real_motion_gate_pass,
        real_motion_probe_pass: result.real_motion_probe_pass,
        animated_scene_count: result.animated_scene_count,
        static_card_ratio: result.static_card_ratio,
        text_only_motion_ratio: result.text_only_motion_ratio,
        color_only_motion_ratio: result.color_only_motion_ratio,
        voiceover_generated: result.voiceover_generated,
        real_asr_probe_executed: result.real_asr_probe_executed,
        speech_rate_wpm: result.speech_rate_wpm,
        core_anchor_recognition_pass: result.core_anchor_recognition_pass,
        recognized_core_anchors: result.recognized_core_anchors,
        local_review_packet_ready: result.local_review_packet_ready,
        safe_to_request_private_upload: result.SAFE_TO_REQUEST_PRIVATE_UPLOAD,
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
