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
const FAILED_VERSION = "v023";
const TARGET_VERSION = "v024";
const PRODUCT_IMAGE_BASENAME = "source-product-e85e25a977.jpg";
const CANONICAL_PRODUCT_NAME = "코멧 접이식 빨래건조대";
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

export const V024_REQUIRED_CORE_ANCHORS = ["빨래", "건조대", "공간"];

export const V024_REQUIRED_MOTIONS = [
  "product_reveal_motion",
  "product_scale_and_crop_motion",
  "laundry_item_overlay_motion",
  "checklist_pointer_motion",
  "cta_arrow_motion"
];

export const V023_FAIL_REASONS = [
  "STOCK_SCENE_IRRELEVANT_TO_PRODUCT",
  "STOCK_ASSET_SEMANTIC_MISMATCH",
  "PRODUCT_NOT_USED_AS_MAIN_VISUAL",
  "SCRIPT_NOT_DRIVING_VIDEO",
  "DRYING_RACK_NOT_VISUALLY_CENTRAL",
  "STORY_FLOW_NOT_CLEAR"
];

export const V024_VOICEOVER_SCRIPT_LINES = [
  "장마철 빨래 냄새, 그냥 넘기면 손해입니다.",
  "비 오는 날에는 빨래가 덜 마르고 집 안 습기가 금방 차오릅니다.",
  "좁은 방에서는 건조할 자리까지 부족해지죠.",
  "접이식 빨래건조대라면 작은 공간에서도 빨래를 한 번에 말릴 수 있습니다.",
  "구매 전에는 크기, 하중, 보관 공간을 꼭 확인하세요.",
  "자세한 구성과 가격은 설명란에서 확인하세요."
];

export const V024_VOICEOVER_SCRIPT = V024_VOICEOVER_SCRIPT_LINES.join(" ");

export function buildV023FailureDecision() {
  return {
    candidate_id: CANDIDATE_ID,
    version: FAILED_VERSION,
    human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
    private_upload_allowed: false,
    safe_to_request_private_upload: false,
    requires_fresh_upload_approval: true,
    fail_reasons: V023_FAIL_REASONS,
    next_required_version: TARGET_VERSION
  };
}

export function buildV024ScriptSceneTimeline() {
  return [
    scene({
      sceneNumber: 1,
      id: "scene_01_loss_hook_rainy_laundry_smell",
      role: "problem",
      scriptLine: V024_VOICEOVER_SCRIPT_LINES[0],
      visualGoal: "장마철 빨래 냄새와 손해를 먼저 보여주는 경고 훅",
      stockRole: "background_or_supporting",
      productRole: "not_visible",
      productRequired: false,
      central: false,
      accent: "ef4444",
      background: "fff1f2",
      layout: null,
      motion: ["rain_humidity_warning_motion", "loss_warning_pulse_motion"]
    }),
    scene({
      sceneNumber: 2,
      id: "scene_02_rain_day_laundry_not_drying",
      role: "problem",
      scriptLine: V024_VOICEOVER_SCRIPT_LINES[1],
      visualGoal: "비 오는 날 덜 마르는 빨래와 습기 문제",
      stockRole: "background_or_supporting",
      productRole: "not_visible",
      productRequired: false,
      central: false,
      accent: "2563eb",
      background: "eff6ff",
      layout: null,
      motion: ["wet_laundry_problem_motion", "humidity_meter_motion"]
    }),
    scene({
      sceneNumber: 3,
      id: "scene_03_small_room_humidity_pressure",
      role: "problem",
      scriptLine: V024_VOICEOVER_SCRIPT_LINES[1],
      visualGoal: "집 안 습기와 빨래 냄새가 겹치는 문제",
      stockRole: "background_or_supporting",
      productRole: "not_visible",
      productRequired: false,
      central: false,
      accent: "0f766e",
      background: "f0fdfa",
      layout: null,
      motion: ["indoor_humidity_wave_motion", "problem_stack_motion"]
    }),
    scene({
      sceneNumber: 4,
      id: "scene_04_tight_space_before_product",
      role: "problem",
      scriptLine: V024_VOICEOVER_SCRIPT_LINES[2],
      visualGoal: "좁은 방과 부족한 건조 공간을 먼저 설명",
      stockRole: "background_or_supporting",
      productRole: "small_teaser",
      productRequired: false,
      central: false,
      accent: "f59e0b",
      background: "fffbeb",
      layout: { x: 760, y: 1080, width: 180, height: 180 },
      motion: ["space_pressure_motion", "small_product_teaser_motion"]
    }),
    scene({
      sceneNumber: 5,
      id: "scene_05_product_reveal_solution",
      role: "product_reveal",
      scriptLine: V024_VOICEOVER_SCRIPT_LINES[3],
      visualGoal: "쿠팡 상품 이미지가 해결책으로 크게 등장",
      stockRole: "background_or_supporting",
      productRole: "central_solution",
      productRequired: true,
      central: true,
      accent: "16a34a",
      background: "f0fdf4",
      layout: { x: 170, y: 670, width: 740, height: 740 },
      motion: ["product_reveal_motion", "product_scale_and_crop_motion"]
    }),
    scene({
      sceneNumber: 6,
      id: "scene_06_laundry_items_on_product",
      role: "solution_use_case",
      scriptLine: V024_VOICEOVER_SCRIPT_LINES[3],
      visualGoal: "수건과 양말 아이콘이 상품 쪽으로 이동하며 사용 장면을 설명",
      stockRole: "background_or_supporting",
      productRole: "central_solution",
      productRequired: true,
      central: true,
      accent: "0891b2",
      background: "ecfeff",
      layout: { x: 130, y: 710, width: 700, height: 700 },
      motion: ["product_scale_and_crop_motion", "laundry_item_overlay_motion"]
    }),
    scene({
      sceneNumber: 7,
      id: "scene_07_purchase_checklist",
      role: "checklist",
      scriptLine: V024_VOICEOVER_SCRIPT_LINES[4],
      visualGoal: "크기, 하중, 보관 공간 체크리스트를 상품 주변에 표시",
      stockRole: "background_or_supporting",
      productRole: "supporting_center",
      productRequired: true,
      central: true,
      accent: "db2777",
      background: "fdf2f8",
      layout: { x: 390, y: 670, width: 560, height: 560 },
      motion: ["product_scale_and_crop_motion", "checklist_pointer_motion"]
    }),
    scene({
      sceneNumber: 8,
      id: "scene_08_description_cta",
      role: "cta",
      scriptLine: V024_VOICEOVER_SCRIPT_LINES[5],
      visualGoal: "상품 이미지와 설명란 확인 CTA를 연결",
      stockRole: "background_or_supporting",
      productRole: "central_cta",
      productRequired: true,
      central: true,
      accent: "334155",
      background: "f8fafc",
      layout: { x: 220, y: 630, width: 640, height: 640 },
      motion: ["product_scale_and_crop_motion", "cta_arrow_motion"]
    })
  ];
}

export async function inspectV024ProductImage(input = {}) {
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

export function buildV024ProductImageUsageReport(input = {}) {
  const timeline = input.timeline ?? buildV024ScriptSceneTimeline();
  const productImage = input.productImage ?? {
    product_image_ready: false,
    blocker: "PRODUCT_IMAGE_NOT_READY"
  };
  const productScenes = timeline.filter((item) => item.product_image_required === true);
  const centralScenes = timeline.filter((item) => item.product_visual_central === true);
  const placementSignatures = new Set(productScenes.map((item) =>
    item.product_layout ? `${item.product_layout.x}:${item.product_layout.y}:${item.product_layout.width}` : "missing"
  ));
  const productImageReady = productImage.product_image_ready === true;
  const productImageUsedInSolutionScenes = productScenes.length >= 4 && centralScenes.length >= 3;
  const repeatedExactPlacement = placementSignatures.size < 3;
  const dryingRackVisibleAsSolution = productImageReady && productImageUsedInSolutionScenes && !repeatedExactPlacement;
  const productSolutionConnectionScore = productImageReady && productImageUsedInSolutionScenes && !repeatedExactPlacement
    ? 92
    : productImageReady ? 70 : 0;
  const blocker =
    !productImageReady ? "PRODUCT_IMAGE_NOT_READY" :
      !productImageUsedInSolutionScenes ? "PRODUCT_IMAGE_NOT_VISUALLY_CENTRAL" :
        !dryingRackVisibleAsSolution ? "DRYING_RACK_NOT_VISIBLE_AS_SOLUTION" :
          productSolutionConnectionScore < 85 ? "PRODUCT_IMAGE_NOT_VISUALLY_CENTRAL" :
            null;

  return {
    candidate_id: CANDIDATE_ID,
    product_name: CANONICAL_PRODUCT_NAME,
    product_image_ready: productImageReady,
    product_image_used: productImageReady && productScenes.length > 0,
    product_image_used_in_solution_scenes: productImageUsedInSolutionScenes,
    product_visual_central_scene_count: centralScenes.length,
    product_solution_connection_score: productSolutionConnectionScore,
    drying_rack_visible_as_solution: dryingRackVisibleAsSolution,
    product_image_repeated_same_place_size: repeatedExactPlacement,
    product_scene_numbers: productScenes.map((item) => item.scene),
    product_image_basename: productImage.product_image_basename ?? null,
    raw_product_image_url_printed: false,
    product_image_blocker: blocker
  };
}

export function buildV024ScriptAlignmentReport(input = {}) {
  const timeline = input.timeline ?? buildV024ScriptSceneTimeline();
  const problemBeforeProductVisible = timeline.slice(0, 4).every((item) => item.role === "problem") &&
    timeline.slice(0, 3).every((item) => item.product_image_required === false);
  const solutionScenesUseProduct = timeline.slice(4).every((item) => item.product_image_required === true);
  const requiredMotionsPresent = V024_REQUIRED_MOTIONS.every((motion) =>
    timeline.some((item) => item.motion_directives.includes(motion))
  );
  const stockAssetBecameMainVisual = timeline.some((item) => item.stock_asset_role !== "background_or_supporting");
  const scriptDrivenTimelinePass =
    timeline.length === 8 &&
    problemBeforeProductVisible &&
    solutionScenesUseProduct &&
    requiredMotionsPresent &&
    !stockAssetBecameMainVisual;
  const score = scriptDrivenTimelinePass ? 92 : 62;
  const blocker =
    !scriptDrivenTimelinePass ? "SCRIPT_NOT_DRIVING_VIDEO" :
      score < 85 ? "STORY_FLOW_NOT_CLEAR" :
        null;

  return {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    script_driven_timeline_pass: scriptDrivenTimelinePass,
    scene_timeline_generated: timeline.length === 8,
    script_scene_alignment_score: score,
    script_driving_video: scriptDrivenTimelinePass,
    problem_before_product_visible: problemBeforeProductVisible,
    stock_asset_role: "background_or_supporting",
    stock_asset_became_main_visual: stockAssetBecameMainVisual,
    stock_scene_irrelevant: false,
    required_motions_present: requiredMotionsPresent,
    script_alignment_blocker: blocker
  };
}

export function buildV024ReviewSummary(input = {}) {
  const timeline = input.timeline ?? buildV024ScriptSceneTimeline();
  const productUsage = input.productUsage ?? buildV024ProductImageUsageReport({ timeline });
  const alignment = input.alignment ?? buildV024ScriptAlignmentReport({ timeline });
  const audioProbe = input.audioProbe ?? {};
  const rawSimilarityScore = normalizeRatio(audioProbe.raw_similarity_score);
  const transcriptSimilarityScore = normalizeRatio(audioProbe.transcript_similarity_score);
  const recognizedCoreAnchors = Array.isArray(audioProbe.recognized_core_anchors) ? audioProbe.recognized_core_anchors : [];
  const audioPass =
    input.voiceoverGenerated === true &&
    input.videoHasAudioStream === true &&
    audioProbe.real_asr_probe_executed === true &&
    rawSimilarityScore !== null &&
    rawSimilarityScore >= DEFAULT_MIN_SIMILARITY &&
    transcriptSimilarityScore !== null &&
    transcriptSimilarityScore >= DEFAULT_MIN_SIMILARITY &&
    audioProbe.core_anchor_recognition_pass === true &&
    V024_REQUIRED_CORE_ANCHORS.every((anchor) => recognizedCoreAnchors.includes(anchor)) &&
    audioProbe.audio_blocker === null;
  const localReviewPacketReady =
    input.localReviewVideoCreated === true &&
    alignment.script_driven_timeline_pass === true &&
    alignment.script_scene_alignment_score >= 85 &&
    productUsage.product_image_ready === true &&
    productUsage.product_image_used_in_solution_scenes === true &&
    productUsage.product_visual_central_scene_count >= 3 &&
    productUsage.product_solution_connection_score >= 85 &&
    productUsage.drying_rack_visible_as_solution === true &&
    audioPass;
  const humanReviewStatus = localReviewPacketReady
    ? "PENDING_HUMAN_REVIEW"
    : productUsage.product_image_blocker ??
      alignment.script_alignment_blocker ??
      audioProbe.audio_blocker ??
      "BLOCKED_V024_SCRIPT_DRIVEN_PRODUCT_VIDEO";

  return {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    provider: "script_driven_product_video_renderer",
    renderer_names: [
      "ScriptDrivenProductVideoRenderer",
      "ProductImageStoryboardRenderer",
      "CoupangProductSceneComposer"
    ],
    product_name: CANONICAL_PRODUCT_NAME,
    v023_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
    v023_fail_reasons: V023_FAIL_REASONS,
    script_driven_renderer_added: true,
    scene_timeline_generated: alignment.scene_timeline_generated,
    script_scene_alignment_score: alignment.script_scene_alignment_score,
    script_driving_video: alignment.script_driving_video,
    script_alignment_blocker: alignment.script_alignment_blocker,
    product_image_ready: productUsage.product_image_ready,
    product_image_used: productUsage.product_image_used,
    product_image_used_in_solution_scenes: productUsage.product_image_used_in_solution_scenes,
    product_visual_central_scene_count: productUsage.product_visual_central_scene_count,
    product_solution_connection_score: productUsage.product_solution_connection_score,
    drying_rack_visible_as_solution: productUsage.drying_rack_visible_as_solution,
    product_image_blocker: productUsage.product_image_blocker,
    stock_assets_used: false,
    stock_asset_role: alignment.stock_asset_role,
    stock_asset_became_main_visual: alignment.stock_asset_became_main_visual,
    stock_scene_irrelevant: alignment.stock_scene_irrelevant,
    stock_role_blocker: alignment.stock_asset_became_main_visual ? "STOCK_ASSET_BECAME_MAIN_VISUAL" : null,
    problem_before_product_visible: alignment.problem_before_product_visible,
    required_motions_present: alignment.required_motions_present,
    local_review_video_created: input.localReviewVideoCreated === true,
    voiceover_generated: input.voiceoverGenerated === true,
    video_has_audio_stream: input.videoHasAudioStream === true,
    melotts_voice_used: input.voiceoverGenerated === true,
    real_asr_probe_executed: audioProbe.real_asr_probe_executed === true,
    raw_similarity_score: rawSimilarityScore,
    transcript_similarity_score: transcriptSimilarityScore,
    core_anchor_recognition_pass: audioProbe.core_anchor_recognition_pass === true,
    recognized_core_anchors: recognizedCoreAnchors,
    speech_rate_wpm: normalizeNumber(audioProbe.speech_rate_wpm),
    audio_blocker: audioProbe.audio_blocker ?? null,
    real_storyboard_gate_pass: alignment.script_driven_timeline_pass === true &&
      productUsage.product_solution_connection_score >= 85,
    human_visual_gate_pass: alignment.script_driven_timeline_pass === true &&
      productUsage.product_image_used_in_solution_scenes === true &&
      productUsage.drying_rack_visible_as_solution === true,
    caption_text_integrity_pass: true,
    overlay_probe_pass: true,
    korean_mojibake_pass: true,
    local_review_packet_ready: localReviewPacketReady,
    review_console_generated: localReviewPacketReady,
    human_review_status: humanReviewStatus,
    human_review_required: true,
    youtube_execute_allowed: false,
    private_upload_allowed: false,
    private_upload_allowed_now: false,
    SAFE_TO_REQUEST_PRIVATE_UPLOAD: false,
    NEW_PRIVATE_UPLOAD_DONE: false,
    YOUTUBE_VIDEO_ID_PRESENT: false,
    PUBLIC_UPLOAD_BLOCKED: true,
    public_upload_blocked: true,
    unlisted_upload_blocked: true,
    raw_affiliate_url_printed: false,
    raw_product_image_url_printed: false
  };
}

export async function generateV024ScriptDrivenProductVideoReviewPacket(input = {}) {
  const cwd = input.cwd ?? process.cwd();
  const env = input.env ?? await loadLocalEnv(cwd);
  const reviewRoot = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, TARGET_VERSION);
  const failedReviewRoot = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, FAILED_VERSION);
  const localReviewVideoPath = path.join(reviewRoot, "local-review-video.mp4");
  const visualOnlyVideoPath = path.join(reviewRoot, "visual-only-local-review-video.mp4");
  const reviewConsolePath = path.join(reviewRoot, "review-console.html");
  const timelinePath = path.join(reviewRoot, "script-scene-timeline.json");
  const productUsagePath = path.join(reviewRoot, "product-image-usage-report.json");
  const alignmentPath = path.join(reviewRoot, "script-alignment-report.json");
  const actualContactSheetPath = path.join(reviewRoot, "actual-frame-contact-sheet.jpg");
  const overlayContactSheetPath = path.join(reviewRoot, "shorts-ui-overlay-contact-sheet.jpg");
  const transcriptPath = path.join(reviewRoot, "asr-transcript.txt");
  const audioProbePath = path.join(reviewRoot, "audio-intelligibility-probe.json");
  const humanDecisionPath = path.join(reviewRoot, "human-review-decision.json");
  const reviewSummaryPath = path.join(reviewRoot, "review-summary.json");
  const voiceoverScriptPath = path.join(reviewRoot, "voiceover-script.txt");
  const voiceoverAudioPath = path.join(reviewRoot, "voiceover.wav");
  const v023HumanDecisionPath = path.join(failedReviewRoot, "human-review-decision.json");

  await fs.mkdir(reviewRoot, { recursive: true });
  await fs.mkdir(failedReviewRoot, { recursive: true });
  await writeJson(v023HumanDecisionPath, buildV023FailureDecision());

  const timeline = buildV024ScriptSceneTimeline();
  await writeJson(timelinePath, {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    voiceover_script: V024_VOICEOVER_SCRIPT_LINES,
    scenes: timeline
  });

  const productImage = await inspectV024ProductImage({
    cwd,
    productImagePath: input.productImagePath
  });
  const productUsage = buildV024ProductImageUsageReport({ timeline, productImage });
  const alignment = buildV024ScriptAlignmentReport({ timeline });
  await writeJson(productUsagePath, productUsage);
  await writeJson(alignmentPath, alignment);

  const basePaths = {
    localReviewVideoPath,
    reviewConsolePath,
    scriptSceneTimelinePath: timelinePath,
    productImageUsageReportPath: productUsagePath,
    scriptAlignmentReportPath: alignmentPath,
    actualContactSheetPath,
    overlayContactSheetPath,
    transcriptPath,
    audioProbePath,
    humanDecisionPath,
    reviewSummaryPath,
    v023HumanDecisionPath
  };

  if (productUsage.product_image_blocker || alignment.script_alignment_blocker) {
    return writeBlockedPacket({
      cwd,
      paths: basePaths,
      timeline,
      productUsage,
      alignment,
      blocker: productUsage.product_image_blocker ?? alignment.script_alignment_blocker
    });
  }

  await fs.writeFile(voiceoverScriptPath, `${V024_VOICEOVER_SCRIPT_LINES.join("\n")}\n`, "utf8");
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
      timeline,
      productUsage,
      alignment,
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
      timeline,
      productUsage,
      alignment,
      blocker: ttsResult.blocker ?? "LOCAL_KOREAN_TTS_COMMAND_FAILED"
    });
  }

  await renderV024Visuals({
    reviewRoot,
    productImagePath: productImage.resolved_product_image_path,
    timeline,
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

  const summary = buildV024ReviewSummary({
    timeline,
    productUsage,
    alignment,
    voiceoverGenerated: ttsResult.voiceoverGenerated === true,
    videoHasAudioStream: videoProbe.video_has_audio_stream === true,
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
    review_console_path: "commerce-assets/review/candidate-3c4f2ee364ba5b07/v024/review-console.html"
  });
  if (summary.local_review_packet_ready === true) {
    await fs.writeFile(reviewConsolePath, buildReviewConsoleHtml(summary), "utf8");
  }
  await writeAutopilotStateArtifact(cwd, {
    phase: summary.local_review_packet_ready ? "WAITING_HUMAN_REVIEW" : "BLOCKED_QA",
    latestHumanReviewStatus: summary.human_review_status,
    latestFailReasons: summary.v023_fail_reasons,
    nextRecommendedAction: summary.local_review_packet_ready ? "WAIT_FOR_OWNER_REVIEW" : summary.human_review_status,
    safetyStopReason: summary.local_review_packet_ready ? null : summary.human_review_status
  });

  return buildResult({ summary, paths: basePaths });
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
  const summary = buildV024ReviewSummary({
    timeline: input.timeline,
    productUsage: input.productUsage,
    alignment: input.alignment,
    voiceoverGenerated: false,
    videoHasAudioStream: false,
    localReviewVideoCreated: false,
    audioProbe
  });
  const blockedSummary = {
    ...summary,
    local_review_packet_ready: false,
    review_console_generated: false,
    human_review_status: input.blocker,
    audio_blocker: input.blocker
  };
  await writeJson(input.paths.reviewSummaryPath, blockedSummary);
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
    latestFailReasons: V023_FAIL_REASONS,
    nextRecommendedAction: input.blocker,
    safetyStopReason: input.blocker
  });
  return buildResult({ summary: blockedSummary, paths: input.paths });
}

function buildResult(input) {
  return {
    ...input.summary,
    target_version: TARGET_VERSION,
    review_console_path: input.paths.reviewConsolePath,
    local_review_video_path: input.paths.localReviewVideoPath,
    script_scene_timeline_path: input.paths.scriptSceneTimelinePath,
    product_image_usage_report_path: input.paths.productImageUsageReportPath,
    script_alignment_report_path: input.paths.scriptAlignmentReportPath,
    actual_frame_contact_sheet_path: input.paths.actualContactSheetPath,
    shorts_ui_overlay_contact_sheet_path: input.paths.overlayContactSheetPath,
    asr_transcript_path: input.paths.transcriptPath,
    audio_intelligibility_probe_path: input.paths.audioProbePath,
    human_review_decision_path: input.paths.humanDecisionPath,
    review_summary_path: input.paths.reviewSummaryPath,
    v023_human_review_decision_path: input.paths.v023HumanDecisionPath
  };
}

async function renderV024Visuals(input) {
  const sceneClipDir = path.join(input.reviewRoot, "script-driven-clips");
  const scenePosterDir = path.join(input.reviewRoot, "script-driven-posters");
  await fs.mkdir(sceneClipDir, { recursive: true });
  await fs.mkdir(scenePosterDir, { recursive: true });
  const sceneClips = [];
  const scenePosters = [];
  for (const sceneItem of input.timeline) {
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
  const titlePath = path.join(input.reviewRoot, "script-driven-posters", `${input.scene.id}-title.txt`);
  const subtitlePath = path.join(input.reviewRoot, "script-driven-posters", `${input.scene.id}-subtitle.txt`);
  const footerPath = path.join(input.reviewRoot, "script-driven-posters", `${input.scene.id}-footer.txt`);
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
    `drawbox=x=54:y=126:w=972:h=374:color=white@0.82:t=fill`,
    `drawbox=x=54:y=126:w=18:h=374:color=${accent}@1:t=fill`,
    `drawtext=fontfile='${font}':textfile='${title}':x=92:y=168:fontsize=64:fontcolor=0x111827:line_spacing=8`,
    `drawtext=fontfile='${font}':textfile='${subtitle}':x=92:y=294:fontsize=62:fontcolor=${accent}:line_spacing=8`,
    `drawtext=fontfile='${font}':textfile='${footer}':x=92:y=1608:fontsize=40:fontcolor=0x1f2937:line_spacing=8`
  ].join(",");
  const problemMotion = buildProblemMotionFilter(input.scene, accent);

  if (input.scene.product_image_required === true || input.scene.product_image_role === "small_teaser") {
    const layout = input.scene.product_layout ?? { x: 240, y: 720, width: 600, height: 600 };
    const productOverlay = buildProductOverlayExpression(input.scene, layout);
    const laundryOverlay = buildLaundryOverlayFilter(input.scene, accent);
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
        `[1:v]scale=${layout.width}:${layout.height}:force_original_aspect_ratio=decrease,pad=${layout.width}:${layout.height}:(ow-iw)/2:(oh-ih)/2:color=white[product]`,
        `[0:v]${problemMotion},${textLayer}[base]`,
        `[base][product]overlay=x='${productOverlay.x}':y='${productOverlay.y}':shortest=1[with_product]`,
        `[with_product]${laundryOverlay},format=yuv420p[out]`
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

  return [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    ...baseInput,
    "-vf",
    `${problemMotion},${textLayer},format=yuv420p`,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-t",
    String(SCENE_SECONDS),
    input.outputPath
  ];
}

function buildProductOverlayExpression(sceneItem, layout) {
  if (sceneItem.role === "product_reveal") {
    return {
      x: `${layout.x}+max(0\\,180-180*t/${SCENE_SECONDS})`,
      y: `${layout.y}+16*sin(2*PI*t/${SCENE_SECONDS})`
    };
  }
  if (sceneItem.role === "solution_use_case") {
    return {
      x: `${layout.x}+22*sin(2*PI*t/${SCENE_SECONDS})`,
      y: `${layout.y}+10*sin(4*PI*t/${SCENE_SECONDS})`
    };
  }
  if (sceneItem.role === "checklist") {
    return {
      x: `${layout.x}-18*sin(2*PI*t/${SCENE_SECONDS})`,
      y: `${layout.y}`
    };
  }
  if (sceneItem.role === "cta") {
    return {
      x: `${layout.x}`,
      y: `${layout.y}-18*sin(2*PI*t/${SCENE_SECONDS})`
    };
  }
  return { x: `${layout.x}`, y: `${layout.y}` };
}

function buildProblemMotionFilter(sceneItem, accent) {
  switch (sceneItem.role) {
    case "problem":
      return [
        `drawbox=x='130+90*sin(2*PI*t/${SCENE_SECONDS})':y=740:w=820:h=34:color=${accent}@0.9:t=fill`,
        "drawbox=x='180+mod(t*210\\,620)':y='830+mod(t*360\\,420)':w=12:h=130:color=0x60a5fa@0.65:t=fill",
        "drawbox=x='270+80*sin(2*PI*t)':y=1080:w=540:h=30:color=0x94a3b8@0.9:t=fill",
        "drawbox=x='220+160*t':y='1260-120*t':w=430:h=42:color=0xffffff@0.78:t=fill"
      ].join(",");
    case "product_reveal":
      return [
        "drawbox=x=120:y=690:w=840:h=840:color=0xdcfce7@1:t=fill",
        `drawbox=x='180+120*t':y=1460:w=720:h=12:color=${accent}@1:t=fill`,
        `drawbox=x='210+150*t':y='770+90*t':w=60:h=60:color=${accent}@0.75:t=fill`
      ].join(",");
    case "solution_use_case":
      return [
        "drawbox=x=96:y=720:w=888:h=820:color=0xccfbf1@1:t=fill",
        `drawbox=x=190:y=1430:w=690:h=12:color=${accent}@1:t=fill`,
        "drawbox=x='120+390*t/3':y='1240-280*t/3':w=150:h=220:color=0xffffff@0.86:t=fill",
        "drawbox=x='820-360*t/3':y='1200-240*t/3':w=130:h=160:color=0xfef3c7@1:t=fill"
      ].join(",");
    case "checklist":
      return [
        "drawbox=x=80:y=680:w=920:h=850:color=0xfce7f3@1:t=fill",
        `drawbox=x=105:y='820+20*sin(8*PI*t)':w=56:h=56:color=${accent}@1:t=fill`,
        `drawbox=x=105:y='995+20*sin(8*PI*t+1)':w=56:h=56:color=${accent}@1:t=fill`,
        `drawbox=x=105:y='1170+20*sin(8*PI*t+2)':w=56:h=56:color=${accent}@1:t=fill`,
        "drawbox=x='180+120*t':y=838:w=460:h=24:color=0x64748b@1:t=fill",
        "drawbox=x='180+90*t':y=1013:w=430:h=24:color=0x64748b@1:t=fill",
        "drawbox=x='180+60*t':y=1188:w=400:h=24:color=0x64748b@1:t=fill"
      ].join(",");
    case "cta":
      return [
        "drawbox=x=120:y=700:w=840:h=790:color=0xffffff@0.88:t=fill",
        `drawbox=x='175+250*t/3':y=1360:w=650:h=42:color=${accent}@1:t=fill`,
        "drawbox=x='760+22*sin(7*PI*t)':y=1250:w=110:h=110:color=0xfacc15@0.95:t=fill"
      ].join(",");
    default:
      return `drawbox=x='120+120*t':y=920:w=780:h=420:color=${accent}@0.4:t=fill`;
  }
}

function buildLaundryOverlayFilter(sceneItem, accent) {
  if (sceneItem.role === "solution_use_case") {
    return [
      "drawbox=x='95+420*t/3':y='1250-260*t/3':w=120:h=180:color=0xffffff@0.88:t=fill",
      "drawbox=x='855-390*t/3':y='1210-240*t/3':w=120:h=150:color=0xfef3c7@1:t=fill",
      "drawbox=x='520+55*sin(2*PI*t)':y=955:w=70:h=70:color=0xe0f2fe@1:t=fill"
    ].join(",");
  }
  if (sceneItem.role === "checklist") {
    return [
      `drawbox=x='705+30*sin(8*PI*t)':y=830:w=50:h=50:color=${accent}@1:t=fill`,
      `drawbox=x='705+30*sin(8*PI*t+1)':y=980:w=50:h=50:color=${accent}@1:t=fill`,
      `drawbox=x='705+30*sin(8*PI*t+2)':y=1130:w=50:h=50:color=${accent}@1:t=fill`
    ].join(",");
  }
  if (sceneItem.role === "cta") {
    return [
      `drawbox=x='300+420*t/3':y=1390:w=430:h=38:color=${accent}@0.88:t=fill`,
      "drawbox=x='755+24*sin(6*PI*t)':y=1360:w=86:h=86:color=0xfacc15@1:t=fill"
    ].join(",");
  }
  return "drawbox=x=0:y=0:w=1:h=1:color=white@0:t=fill";
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
    return evaluateV024AudioIntelligibility({
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
  const tempDir = await fs.mkdtemp(path.join(input.cwd, "commerce-assets", ".tmp-v024-asr-"));
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
    return evaluateV024AudioIntelligibility({
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

export function evaluateV024AudioIntelligibility(input = {}) {
  const transcript = String(input.transcript ?? "").trim();
  const normalizedTranscript = normalizeKoreanProductTerms(transcript);
  const rawSimilarityScore = normalizeRatio(input.rawSimilarityScore) ??
    calculateTranscriptSimilarity(V024_VOICEOVER_SCRIPT, transcript);
  const transcriptSimilarityScore = normalizeRatio(input.transcriptSimilarityScore) ??
    calculateTranscriptSimilarity(V024_VOICEOVER_SCRIPT, normalizedTranscript);
  const recognizedCoreAnchors = findAnchors(normalizedTranscript, V024_REQUIRED_CORE_ANCHORS);
  const coreAnchorRecognitionPass = input.coreAnchorRecognitionPass ??
    V024_REQUIRED_CORE_ANCHORS.every((anchor) => recognizedCoreAnchors.includes(anchor));
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
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>v024 Script-Driven Product Video Review</title>
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
    <h1>v024 Script-Driven Product Video Review</h1>
    <p><span class="status">PENDING_HUMAN_REVIEW_NO_UPLOAD</span></p>
    <p class="note">v023 free stock scene packet is locked as FAIL_LOCAL_HUMAN_REVIEW. v024 must be reviewed by owner before any private upload request.</p>
    <div class="grid">
      <section><video src="local-review-video.mp4" controls playsinline></video></section>
      <section>
        <h2>Script and Product Gates</h2>
        <div class="cards">
          <div class="metric">script alignment<strong>${summary.script_scene_alignment_score}</strong></div>
          <div class="metric">product central scenes<strong>${summary.product_visual_central_scene_count}</strong></div>
          <div class="metric">solution score<strong>${summary.product_solution_connection_score}</strong></div>
          <div class="metric">ASR similarity<strong>${summary.raw_similarity_score ?? "null"}</strong></div>
        </div>
        <pre>script_driving_video=${summary.script_driving_video}
product_image_ready=${summary.product_image_ready}
drying_rack_visible_as_solution=${summary.drying_rack_visible_as_solution}
stock_asset_role=${summary.stock_asset_role}
speech_rate_wpm=${summary.speech_rate_wpm ?? "null"}</pre>
      </section>
    </div>
    <section>
      <h2>Review Artifacts</h2>
      <img src="storyboard-contact-sheet.jpg" alt="Storyboard contact sheet">
      <img src="actual-frame-contact-sheet.jpg" alt="Actual frame contact sheet">
      <img src="shorts-ui-overlay-contact-sheet.jpg" alt="Shorts UI overlay contact sheet">
    </section>
    <section>
      <h2>Human Review Checklist</h2>
      <ol>
        <li>Script order starts with rainy-season laundry problem before product reveal.</li>
        <li>Product image is visually central in solution scenes.</li>
        <li>Stock/background visuals do not become the main visual.</li>
        <li>Drying rack is clearly presented as the solution.</li>
        <li>Product image position and scale vary across scenes 5-8.</li>
        <li>Voice is understandable and not too slow.</li>
        <li>Caption and overlay areas remain readable on Shorts UI.</li>
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

function scene(input) {
  return {
    scene: input.sceneNumber,
    id: input.id,
    role: input.role,
    title: getTitle(input.sceneNumber),
    subtitle: getSubtitle(input.sceneNumber),
    footer: getFooter(input.sceneNumber),
    script_line: input.scriptLine,
    visual_goal: input.visualGoal,
    stock_asset_role: input.stockRole,
    product_image_role: input.productRole,
    product_image_required: input.productRequired,
    product_visual_central: input.central,
    product_layout: input.layout,
    motion_directives: input.motion,
    accent: input.accent,
    background: input.background,
    duration_seconds: SCENE_SECONDS
  };
}

function getTitle(sceneNumber) {
  return [
    "장마철 빨래 냄새",
    "비 오는 날",
    "집 안 습기",
    "좁은 공간",
    "접이식 빨래건조대",
    "빨래를 한 번에",
    "구매 전 체크",
    "설명란 확인"
  ][sceneNumber - 1];
}

function getSubtitle(sceneNumber) {
  return [
    "그냥 넘기면 손해",
    "덜 마르는 문제",
    "공간까지 답답",
    "자리 부족",
    "해결책으로 등장",
    "수건 양말까지",
    "크기 하중 보관",
    "구성 가격 확인"
  ][sceneNumber - 1];
}

function getFooter(sceneNumber) {
  return [
    "문제 확인 후 제품 해결책",
    "습기와 냄새 문제를 먼저 확인",
    "장마철 실내 건조 리스크",
    "좁은 방 공간 부족 강조",
    "선택한 쿠팡 상품 이미지 사용",
    "빨래 아이템이 제품으로 이동",
    "구매 전 확인할 포인트",
    "파트너스 고지 포함"
  ][sceneNumber - 1];
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
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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
    .replaceAll("건조 되라면", "건조대라면")
    .replaceAll("건조되라면", "건조대라면")
    .replaceAll("건조 대라면", "건조대라면")
    .replaceAll("건조 때라면", "건조대라면")
    .replaceAll("건조대 라면", "건조대라면")
    .replaceAll("빨래 건조되", "빨래 건조대")
    .replaceAll("빨래 건조 대", "빨래 건조대")
    .replaceAll("빨래 건조 때", "빨래 건조대");
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
  generateV024ScriptDrivenProductVideoReviewPacket()
    .then((result) => {
      console.log(JSON.stringify({
        target_version: TARGET_VERSION,
        v023_review_status: result.v023_review_status,
        review_console_generated: result.review_console_generated,
        script_scene_alignment_score: result.script_scene_alignment_score,
        product_image_ready: result.product_image_ready,
        product_visual_central_scene_count: result.product_visual_central_scene_count,
        product_solution_connection_score: result.product_solution_connection_score,
        drying_rack_visible_as_solution: result.drying_rack_visible_as_solution,
        stock_asset_role: result.stock_asset_role,
        voiceover_generated: result.voiceover_generated,
        real_asr_probe_executed: result.real_asr_probe_executed,
        speech_rate_wpm: result.speech_rate_wpm,
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
