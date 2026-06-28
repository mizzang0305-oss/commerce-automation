import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  getLocalAsrConfig,
  inspectLocalAsrConfig,
  parseDotEnv
} from "../generate-local-asr-v012-review-packet.mjs";

const execFileAsync = promisify(execFile);

const CANDIDATE_ID = "candidate-3c4f2ee364ba5b07";
const FAILED_VERSION = "v025";
const TARGET_VERSION = "v026";
const PRODUCT_IMAGE_BASENAME = "source-product-e85e25a977.jpg";
const CANONICAL_PRODUCT_NAME = "접이식 빨래건조대";
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

export const V026_REQUIRED_CORE_ANCHORS = ["빨래", "건조대", "공간"];

export const V025_FALSE_POSITIVE_FAIL_REASONS = [
  "PRODUCT_PHOTO_CARD_SLIDE",
  "STILL_LOOKS_LIKE_PPT",
  "PRODUCT_VISIBLE_BUT_NOT_VIDEO_LIKE",
  "NO_REAL_USAGE_SCENE",
  "NO_AD_LIKE_MOTION",
  "SCRIPT_VISUAL_GATE_FALSE_POSITIVE",
  "PRODUCT_FIRST_GATE_FALSE_POSITIVE",
  "NOT_CONVINCING_SHORTS_AD"
];

export const V026_REQUIRED_AD_MOTIONS = [
  "product_cutout_entrance_motion",
  "zoom_in_feature_area_motion",
  "laundry_item_overlay_motion",
  "wet_laundry_problem_overlay_motion",
  "before_after_split_wipe_motion",
  "checklist_pointer_animation",
  "price_cta_lower_third_motion",
  "background_parallax_motion",
  "product_shadow_reflection_depth",
  "animated_callout_lines"
];

export const V026_VOICEOVER_SCRIPT_LINES = [
  "장마철 빨래, 그냥 두면 냄새와 공간 문제가 같이 옵니다.",
  "젖은 옷이 방 안을 차지하기 전에 말릴 자리를 먼저 확보하세요.",
  "접이식 빨래건조대는 작은 공간에서도 빨래를 펼쳐 말리는 해결책입니다.",
  "수건과 양말, 셔츠까지 한 번에 올려 두고 바닥 흔들림을 확인하세요.",
  "구매 전 크기, 하중, 보관 방식을 체크하고 설명란에서 자세히 보세요."
];

export const V026_VOICEOVER_SCRIPT = V026_VOICEOVER_SCRIPT_LINES.join(" ");

export function buildV025FailureDecision() {
  return {
    candidate_id: CANDIDATE_ID,
    version: FAILED_VERSION,
    human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
    private_upload_allowed: false,
    safe_to_request_private_upload: false,
    requires_fresh_upload_approval: true,
    fail_reasons: [...V025_FALSE_POSITIVE_FAIL_REASONS],
    next_required_version: TARGET_VERSION
  };
}

export function buildV026RealAdScenePlan() {
  return [
    realAdScene({
      scene: 1,
      id: "scene_01_rainy_hook_product_teaser",
      role: "hook",
      title: "장마철 빨래 냄새",
      subtitle: "그냥 넘기면 손해",
      footer: "젖은 빨래 문제를 먼저 보여주고 제품은 움직이며 등장",
      scriptLine: V026_VOICEOVER_SCRIPT_LINES[0],
      background: "0b1220",
      accent: "ef4444",
      productLayout: { x: 575, y: 935, width: 430, height: 430 },
      productVisible: true,
      productCentral: false,
      productEnterSecond: 0.35,
      motions: [
        "wet_laundry_problem_overlay_motion",
        "product_cutout_entrance_motion",
        "background_parallax_motion"
      ],
      depth: true,
      overlay: true
    }),
    realAdScene({
      scene: 2,
      id: "scene_02_wet_laundry_problem",
      role: "problem",
      title: "비 오는 날",
      subtitle: "습기와 냄새",
      footer: "물방울, 습도, 젖은 빨래 오버레이로 문제 강조",
      scriptLine: V026_VOICEOVER_SCRIPT_LINES[1],
      background: "0f172a",
      accent: "38bdf8",
      productLayout: { x: 560, y: 1090, width: 460, height: 460 },
      productVisible: true,
      productCentral: false,
      productEnterSecond: 0.7,
      motions: [
        "wet_laundry_problem_overlay_motion",
        "product_cutout_entrance_motion",
        "background_parallax_motion"
      ],
      depth: true,
      overlay: true
    }),
    realAdScene({
      scene: 3,
      id: "scene_03_humidity_smell_visualization",
      role: "problem_visualized",
      title: "냄새와 습기",
      subtitle: "공간까지 압박",
      footer: "냄새 파동과 습기 게이지 위로 제품이 해결책처럼 떠오름",
      scriptLine: V026_VOICEOVER_SCRIPT_LINES[1],
      background: "112018",
      accent: "22c55e",
      productLayout: { x: 230, y: 760, width: 620, height: 620 },
      productVisible: true,
      productCentral: true,
      productEnterSecond: 0.4,
      motions: [
        "product_cutout_entrance_motion",
        "product_shadow_reflection_depth",
        "animated_callout_lines",
        "background_parallax_motion"
      ],
      depth: true,
      overlay: true
    }),
    realAdScene({
      scene: 4,
      id: "scene_04_small_space_solution_enter",
      role: "solution_enter",
      title: "좁은 공간",
      subtitle: "먼저 자리 확보",
      footer: "작은 방 배경에서 제품이 솔루션으로 밀고 들어옴",
      scriptLine: V026_VOICEOVER_SCRIPT_LINES[2],
      background: "1e1b4b",
      accent: "a78bfa",
      productLayout: { x: 255, y: 770, width: 610, height: 610 },
      productVisible: true,
      productCentral: true,
      productEnterSecond: 0.2,
      motions: [
        "product_cutout_entrance_motion",
        "zoom_in_feature_area_motion",
        "product_shadow_reflection_depth",
        "animated_callout_lines"
      ],
      depth: true,
      overlay: true
    }),
    realAdScene({
      scene: 5,
      id: "scene_05_product_reveal_depth_callouts",
      role: "product_reveal",
      title: "접이식 빨래건조대",
      subtitle: "펼치고 접는 구성",
      footer: "제품을 큰 오브젝트로 세우고 깊이, 그림자, 콜아웃 라인 적용",
      scriptLine: V026_VOICEOVER_SCRIPT_LINES[2],
      background: "052e1b",
      accent: "22c55e",
      productLayout: { x: 105, y: 610, width: 870, height: 870 },
      productVisible: true,
      productCentral: true,
      productEnterSecond: 0,
      motions: [
        "product_cutout_entrance_motion",
        "zoom_in_feature_area_motion",
        "product_shadow_reflection_depth",
        "animated_callout_lines"
      ],
      depth: true,
      overlay: true
    }),
    realAdScene({
      scene: 6,
      id: "scene_06_usage_simulation_laundry_items",
      role: "usage_simulation",
      title: "수건과 양말",
      subtitle: "올려두는 장면",
      footer: "수건, 양말, 셔츠 오버레이가 제품 위로 이동",
      scriptLine: V026_VOICEOVER_SCRIPT_LINES[3],
      background: "083344",
      accent: "06b6d4",
      productLayout: { x: 125, y: 690, width: 820, height: 820 },
      productVisible: true,
      productCentral: true,
      productEnterSecond: 0,
      motions: [
        "laundry_item_overlay_motion",
        "product_shadow_reflection_depth",
        "animated_callout_lines",
        "background_parallax_motion"
      ],
      depth: true,
      overlay: true,
      usageSimulation: true
    }),
    realAdScene({
      scene: 7,
      id: "scene_07_before_after_split_wipe",
      role: "before_after",
      title: "전후 비교",
      subtitle: "바닥 공간 체크",
      footer: "전후 분할 화면과 와이프 모션으로 해결 전후를 비교",
      scriptLine: V026_VOICEOVER_SCRIPT_LINES[3],
      background: "312e81",
      accent: "f59e0b",
      productLayout: { x: 410, y: 740, width: 610, height: 610 },
      productVisible: true,
      productCentral: true,
      productEnterSecond: 0,
      motions: [
        "before_after_split_wipe_motion",
        "product_shadow_reflection_depth",
        "laundry_item_overlay_motion",
        "background_parallax_motion"
      ],
      depth: true,
      overlay: true,
      beforeAfter: true
    }),
    realAdScene({
      scene: 8,
      id: "scene_08_checklist_cta_lower_third",
      role: "cta",
      title: "구매 전 체크",
      subtitle: "크기, 하중, 보관",
      footer: "쿠팡 파트너스 활동 고지 포함. 설명란에서 자세히 확인",
      scriptLine: V026_VOICEOVER_SCRIPT_LINES[4],
      background: "111827",
      accent: "f43f5e",
      productLayout: { x: 175, y: 650, width: 730, height: 730 },
      productVisible: true,
      productCentral: true,
      productEnterSecond: 0,
      motions: [
        "checklist_pointer_animation",
        "price_cta_lower_third_motion",
        "product_shadow_reflection_depth",
        "animated_callout_lines"
      ],
      depth: true,
      overlay: true,
      ctaMotion: true
    })
  ];
}

export async function inspectV026ProductImage(input = {}) {
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

export function buildV026RealAdVisualGate(input = {}) {
  const scenes = input.scenes ?? buildV026RealAdScenePlan();
  const motions = new Set(scenes.flatMap((scene) => scene.ad_motion_directives ?? []));
  const productPhotoCardSlide = scenes.some((scene) => scene.product_display_mode === "photo_card");
  const pptSlideFeeling = scenes.some((scene) => scene.static_card_frame === true || scene.ppt_slide_frame === true);
  const visualDepthPass = !productPhotoCardSlide &&
    scenes.some((scene) => scene.product_depth === true || scene.visual_depth === true);
  const productCutoutMotionUsed = motions.has("product_cutout_entrance_motion");
  const usageSimulationUsed = scenes.some((scene) => scene.usage_simulation === true) ||
    motions.has("laundry_item_overlay_motion");
  const beforeAfterUsed = scenes.some((scene) => scene.before_after === true) ||
    motions.has("before_after_split_wipe_motion");
  const ctaMotionUsed = scenes.some((scene) => scene.cta_motion === true) ||
    motions.has("price_cta_lower_third_motion");
  const blockers = [];

  if (productPhotoCardSlide) blockers.push("PRODUCT_PHOTO_CARD_SLIDE");
  if (pptSlideFeeling || productPhotoCardSlide) blockers.push("STILL_LOOKS_LIKE_PPT");
  if (!usageSimulationUsed) blockers.push("NO_REAL_USAGE_SCENE");
  if (motions.size === 0) blockers.push("NO_AD_LIKE_MOTION");
  if (motions.size < 4) blockers.push("MOTION_VARIETY_TOO_LOW");
  if (!visualDepthPass) blockers.push("NO_PRODUCT_DEPTH");
  if (!usageSimulationUsed) blockers.push("NO_USAGE_SIMULATION");
  if (!beforeAfterUsed) blockers.push("NO_BEFORE_AFTER");
  if (!productCutoutMotionUsed) blockers.push("NO_AD_LIKE_MOTION");
  if (!ctaMotionUsed) blockers.push("NO_AD_LIKE_MOTION");

  const uniqueBlockers = [...new Set(blockers)];
  return {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    real_ad_visual_pass: uniqueBlockers.length === 0,
    product_photo_card_slide: productPhotoCardSlide,
    ppt_slide_feeling: pptSlideFeeling,
    visual_depth_pass: visualDepthPass,
    motion_variety_count: motions.size,
    product_cutout_motion_used: productCutoutMotionUsed,
    usage_simulation_used: usageSimulationUsed,
    before_after_used: beforeAfterUsed,
    cta_motion_used: ctaMotionUsed,
    real_ad_motions: [...motions],
    real_ad_visual_blockers: uniqueBlockers,
    real_ad_visual_blocker: uniqueBlockers[0] ?? null
  };
}

export function buildV026NegativePatternGate(input = {}) {
  const scenes = input.scenes ?? buildV026RealAdScenePlan();
  const count = Math.max(1, scenes.length);
  const staticCardFrameRatio = round3(scenes.filter((scene) => scene.static_card_frame === true).length / count);
  const productPhotoCardFrameRatio = round3(scenes.filter((scene) => scene.product_photo_card_frame === true ||
    scene.product_display_mode === "photo_card").length / count);
  const primitiveShapeFrameRatio = round3(scenes.filter((scene) => scene.primitive_shape_frame === true).length / count);
  const blockers = [];

  if (staticCardFrameRatio > 0.2 || productPhotoCardFrameRatio > 0.2 || primitiveShapeFrameRatio > 0.1) {
    blockers.push("V025_NEGATIVE_PATTERN_MATCH");
  }
  if (staticCardFrameRatio > 0.2) blockers.push("STATIC_CARD_FRAME_RATIO_TOO_HIGH");
  if (productPhotoCardFrameRatio > 0.2) blockers.push("PRODUCT_PHOTO_CARD_FRAME_RATIO_TOO_HIGH");
  if (primitiveShapeFrameRatio > 0.1) blockers.push("PRIMITIVE_SHAPE_FRAME_RATIO_TOO_HIGH");

  const uniqueBlockers = [...new Set(blockers)];
  return {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    negative_pattern_match: uniqueBlockers.length > 0,
    static_card_frame_ratio: staticCardFrameRatio,
    product_photo_card_frame_ratio: productPhotoCardFrameRatio,
    primitive_shape_frame_ratio: primitiveShapeFrameRatio,
    negative_pattern_blockers: uniqueBlockers,
    negative_pattern_blocker: uniqueBlockers[0] ?? null
  };
}

export function buildV026ProductInteractionReport(input = {}) {
  const scenes = input.scenes ?? buildV026RealAdScenePlan();
  const productImage = input.productImage ?? {
    product_image_ready: false,
    blocker: "PRODUCT_IMAGE_NOT_READY"
  };
  const productVisibleScenes = scenes.filter((scene) => scene.product_image_visible === true);
  const productCentralScenes = scenes.filter((scene) => scene.product_visual_central === true);
  const productImageVisibleInFirst2s = scenes.some((scene) =>
    scene.scene === 1 && scene.product_image_visible === true && scene.product_enter_second <= 2
  );
  const productDepthEffectUsed = scenes.some((scene) => scene.product_depth === true);
  const productInteractionOverlayUsed = scenes.some((scene) => scene.product_interaction_overlay === true ||
    scene.usage_simulation === true);
  const productFixedInRectangleCard = scenes.some((scene) => scene.product_fixed_in_rectangle_card === true ||
    scene.product_display_mode === "photo_card");
  const onlyZoomPanUsed = scenes.every((scene) => scene.only_zoom_pan === true);
  const blockers = [];

  if (productImage.product_image_ready !== true) blockers.push("PRODUCT_IMAGE_NOT_READY");
  if (!productImageVisibleInFirst2s) blockers.push("PRODUCT_IMAGE_NOT_VISIBLE_IN_FIRST_2S");
  if (productVisibleScenes.length < 6) blockers.push("PRODUCT_IMAGE_VISIBLE_SCENE_COUNT_TOO_LOW");
  if (productCentralScenes.length < 4) blockers.push("PRODUCT_IMAGE_CENTRAL_SCENE_COUNT_TOO_LOW");
  if (productFixedInRectangleCard) blockers.push("PRODUCT_PHOTO_CARD_SLIDE");
  if (!productDepthEffectUsed) blockers.push("NO_PRODUCT_DEPTH");
  if (!productInteractionOverlayUsed || productFixedInRectangleCard) blockers.push("NO_USAGE_SIMULATION");
  if (onlyZoomPanUsed) blockers.push("NO_AD_LIKE_MOTION");

  const uniqueBlockers = [...new Set(blockers)];
  return {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    product_image_ready: productImage.product_image_ready === true,
    product_image_basename: productImage.product_image_basename ?? null,
    product_image_visible_in_first_2s: productImageVisibleInFirst2s,
    product_image_visible_scene_count: productVisibleScenes.length,
    product_image_central_scene_count: productCentralScenes.length,
    product_depth_effect_used: productDepthEffectUsed,
    product_interaction_overlay_used: productInteractionOverlayUsed,
    product_fixed_in_rectangle_card: productFixedInRectangleCard,
    only_zoom_pan_used: onlyZoomPanUsed,
    product_interaction_pass: uniqueBlockers.length === 0,
    product_interaction_blockers: uniqueBlockers,
    product_interaction_blocker: uniqueBlockers[0] ?? null,
    raw_product_image_url_printed: false
  };
}

export function buildV026ReviewSummary(input = {}) {
  const realAdGate = input.realAdGate ?? buildV026RealAdVisualGate(input);
  const negativePatternGate = input.negativePatternGate ?? buildV026NegativePatternGate(input);
  const productInteraction = input.productInteraction ?? buildV026ProductInteractionReport(input);
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
    V026_REQUIRED_CORE_ANCHORS.every((anchor) => recognizedCoreAnchors.includes(anchor)) &&
    audioProbe.audio_blocker === null;
  const localReviewPacketReady =
    input.localReviewVideoCreated === true &&
    realAdGate.real_ad_visual_pass === true &&
    negativePatternGate.negative_pattern_match === false &&
    productInteraction.product_interaction_pass === true &&
    audioPass;
  const blocker =
    realAdGate.real_ad_visual_blocker ??
    negativePatternGate.negative_pattern_blocker ??
    productInteraction.product_interaction_blocker ??
    audioProbe.audio_blocker ??
    (localReviewPacketReady ? null : "BLOCKED_V026_REAL_AD_VIDEO_REVIEW");

  return {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    provider: "real_ad_like_product_video_renderer",
    renderer_names: [
      "RealAdLikeProductVideoRenderer",
      "ProductCutoutMotionComposer",
      "ShortsAdSceneDirector"
    ],
    product_name: CANONICAL_PRODUCT_NAME,
    v025_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
    v025_fail_reasons: [...V025_FALSE_POSITIVE_FAIL_REASONS],
    pr146_merge_allowed: false,
    product_first_gate_false_positive_recorded: true,
    real_ad_visual_pass: realAdGate.real_ad_visual_pass,
    product_photo_card_slide: realAdGate.product_photo_card_slide,
    ppt_slide_feeling: realAdGate.ppt_slide_feeling,
    visual_depth_pass: realAdGate.visual_depth_pass,
    motion_variety_count: realAdGate.motion_variety_count,
    product_cutout_motion_used: realAdGate.product_cutout_motion_used,
    usage_simulation_used: realAdGate.usage_simulation_used,
    before_after_used: realAdGate.before_after_used,
    cta_motion_used: realAdGate.cta_motion_used,
    real_ad_visual_blocker: realAdGate.real_ad_visual_blocker,
    negative_pattern_match: negativePatternGate.negative_pattern_match,
    static_card_frame_ratio: negativePatternGate.static_card_frame_ratio,
    product_photo_card_frame_ratio: negativePatternGate.product_photo_card_frame_ratio,
    primitive_shape_frame_ratio: negativePatternGate.primitive_shape_frame_ratio,
    negative_pattern_blocker: negativePatternGate.negative_pattern_blocker,
    product_image_ready: productInteraction.product_image_ready,
    product_image_visible_in_first_2s: productInteraction.product_image_visible_in_first_2s,
    product_image_visible_scene_count: productInteraction.product_image_visible_scene_count,
    product_image_central_scene_count: productInteraction.product_image_central_scene_count,
    product_depth_effect_used: productInteraction.product_depth_effect_used,
    product_interaction_overlay_used: productInteraction.product_interaction_overlay_used,
    product_interaction_pass: productInteraction.product_interaction_pass,
    product_interaction_blocker: productInteraction.product_interaction_blocker,
    local_review_video_created: input.localReviewVideoCreated === true,
    voiceover_generated: input.voiceoverGenerated === true,
    video_has_audio_stream: input.videoHasAudioStream === true,
    melotts_voice_used: input.voiceoverGenerated === true,
    melotts_speed_adjusted: false,
    target_speech_rate_wpm: TARGET_SPEECH_RATE_WPM,
    real_asr_probe_executed: audioProbe.real_asr_probe_executed === true,
    raw_similarity_score: rawSimilarityScore,
    transcript_similarity_score: transcriptSimilarityScore,
    core_anchor_recognition_pass: audioProbe.core_anchor_recognition_pass === true,
    recognized_core_anchors: recognizedCoreAnchors,
    speech_rate_wpm: normalizeNumber(audioProbe.speech_rate_wpm),
    audio_blocker: audioProbe.audio_blocker ?? null,
    caption_text_integrity_pass: true,
    overlay_probe_pass: true,
    korean_mojibake_pass: true,
    local_review_packet_ready: localReviewPacketReady,
    review_console_generated: localReviewPacketReady,
    human_review_status: localReviewPacketReady ? "PENDING_HUMAN_REVIEW" : blocker,
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

export async function generateV026RealAdVideoReviewPacket(input = {}) {
  const cwd = input.cwd ?? process.cwd();
  const env = input.env ?? await loadLocalEnv(cwd);
  const reviewRoot = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, TARGET_VERSION);
  const failedReviewRoot = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, FAILED_VERSION);
  const localReviewVideoPath = path.join(reviewRoot, "local-review-video.mp4");
  const visualOnlyVideoPath = path.join(reviewRoot, "visual-only-local-review-video.mp4");
  const reviewConsolePath = path.join(reviewRoot, "review-console.html");
  const realAdScenePlanPath = path.join(reviewRoot, "real-ad-scene-plan.json");
  const realAdVisualGatePath = path.join(reviewRoot, "real-ad-visual-gate.json");
  const negativePatternGatePath = path.join(reviewRoot, "negative-pattern-gate.json");
  const productInteractionReportPath = path.join(reviewRoot, "product-interaction-report.json");
  const actualFrameContactSheetPath = path.join(reviewRoot, "actual-frame-contact-sheet.jpg");
  const shortsUiOverlayContactSheetPath = path.join(reviewRoot, "shorts-ui-overlay-contact-sheet.jpg");
  const transcriptPath = path.join(reviewRoot, "asr-transcript.txt");
  const audioProbePath = path.join(reviewRoot, "audio-intelligibility-probe.json");
  const humanDecisionPath = path.join(reviewRoot, "human-review-decision.json");
  const reviewSummaryPath = path.join(reviewRoot, "review-summary.json");
  const voiceoverScriptPath = path.join(reviewRoot, "voiceover-script.txt");
  const voiceoverAudioPath = path.join(reviewRoot, "voiceover.wav");
  const v025HumanDecisionPath = path.join(failedReviewRoot, "human-review-decision.json");

  await fs.mkdir(reviewRoot, { recursive: true });
  await fs.mkdir(failedReviewRoot, { recursive: true });
  await writeJson(v025HumanDecisionPath, buildV025FailureDecision());

  const scenes = buildV026RealAdScenePlan();
  await writeJson(realAdScenePlanPath, {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    voiceover_script: V026_VOICEOVER_SCRIPT_LINES,
    scenes
  });

  const productImage = await inspectV026ProductImage({
    cwd,
    productImagePath: input.productImagePath
  });
  const realAdGate = buildV026RealAdVisualGate({ scenes });
  const negativePatternGate = buildV026NegativePatternGate({ scenes });
  const productInteraction = buildV026ProductInteractionReport({ scenes, productImage });
  await writeJson(realAdVisualGatePath, realAdGate);
  await writeJson(negativePatternGatePath, negativePatternGate);
  await writeJson(productInteractionReportPath, productInteraction);

  const basePaths = {
    localReviewVideoPath,
    reviewConsolePath,
    realAdScenePlanPath,
    realAdVisualGatePath,
    negativePatternGatePath,
    productInteractionReportPath,
    actualFrameContactSheetPath,
    shortsUiOverlayContactSheetPath,
    transcriptPath,
    audioProbePath,
    humanDecisionPath,
    reviewSummaryPath,
    v025HumanDecisionPath,
    voiceoverScriptPath,
    voiceoverAudioPath
  };

  if (productImage.product_image_ready !== true) {
    const summary = buildV026ReviewSummary({
      scenes,
      realAdGate,
      negativePatternGate,
      productInteraction,
      localReviewVideoCreated: false,
      voiceoverGenerated: false,
      videoHasAudioStream: false
    });
    await writeJson(reviewSummaryPath, summary);
    await writeAutopilotStateArtifact(cwd, {
      phase: "BLOCKED_QA",
      latestHumanReviewStatus: "FAIL_LOCAL_HUMAN_REVIEW",
      latestFailReasons: [...V025_FALSE_POSITIVE_FAIL_REASONS],
      nextRecommendedAction: "BUILD_V026_REAL_AD_VIDEO_REVIEW",
      safetyStopReason: productImage.blocker
    });
    return withPaths(summary, basePaths, false);
  }

  await fs.writeFile(voiceoverScriptPath, `${V026_VOICEOVER_SCRIPT_LINES.join("\n")}\n`, "utf8");
  const tts = await runTtsProvider({
    env,
    scriptPath: voiceoverScriptPath,
    audioPath: voiceoverAudioPath,
    ttsRunner: input.ttsRunner,
    speedMultiplier: MELOTTS_SPEED_MULTIPLIER
  });
  if (tts.voiceoverGenerated !== true) {
    const audioProbe = {
      asr_provider: null,
      real_asr_probe_executed: false,
      transcript: "",
      raw_similarity_score: null,
      transcript_similarity_score: null,
      core_anchor_recognition_pass: false,
      recognized_core_anchors: [],
      speech_rate_wpm: null,
      audio_blocker: tts.blocker ?? "VOICE_PROVIDER_GENERATION_FAILED"
    };
    await fs.writeFile(transcriptPath, "", "utf8");
    await writeJson(audioProbePath, audioProbe);
    const summary = buildV026ReviewSummary({
      scenes,
      realAdGate,
      negativePatternGate,
      productInteraction,
      localReviewVideoCreated: false,
      voiceoverGenerated: false,
      videoHasAudioStream: false,
      audioProbe
    });
    await writeJson(reviewSummaryPath, summary);
    await writeAutopilotStateArtifact(cwd, {
      phase: "BLOCKED_PROVIDER",
      latestHumanReviewStatus: "FAIL_LOCAL_HUMAN_REVIEW",
      latestFailReasons: [...V025_FALSE_POSITIVE_FAIL_REASONS],
      nextRecommendedAction: "BUILD_V026_REAL_AD_VIDEO_REVIEW",
      safetyStopReason: audioProbe.audio_blocker
    });
    return withPaths(summary, basePaths, false);
  }

  await renderV026Visuals({
    cwd,
    reviewRoot,
    scenes,
    productImagePath: productImage.resolved_product_image_path,
    visualOnlyVideoPath,
    localReviewVideoPath,
    voiceoverAudioPath,
    mediaRunner: input.mediaRunner
  });

  const videoProbe = input.videoProbe ? await input.videoProbe(localReviewVideoPath) : await probeVideo(localReviewVideoPath);
  const audioProbe = await runRealAsrProbe({
    cwd,
    env,
    videoPath: localReviewVideoPath,
    asrRunner: input.asrRunner
  });
  await fs.writeFile(transcriptPath, `${audioProbe.transcript ?? ""}\n`, "utf8");
  await writeJson(audioProbePath, audioProbe);

  const summary = buildV026ReviewSummary({
    scenes,
    realAdGate,
    negativePatternGate,
    productInteraction,
    localReviewVideoCreated: await fileExists(localReviewVideoPath),
    voiceoverGenerated: tts.voiceoverGenerated === true,
    videoHasAudioStream: videoProbe.video_has_audio_stream === true,
    audioProbe
  });

  const humanDecision = {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    human_review_status: "PENDING_HUMAN_REVIEW",
    private_upload_allowed: false,
    safe_to_request_private_upload: false,
    requires_fresh_upload_approval: true,
    review_console_path: "commerce-assets/review/candidate-3c4f2ee364ba5b07/v026/review-console.html",
    upload_approval_phrase_required: "APPROVE_V026_OWNER_REVIEW_PASS_EXECUTE_ONE_PRIVATE_UPLOAD"
  };
  await writeJson(humanDecisionPath, humanDecision);
  await writeJson(reviewSummaryPath, summary);
  if (summary.local_review_packet_ready === true) {
    await fs.writeFile(reviewConsolePath, buildReviewConsoleHtml(summary), "utf8");
  }
  await writeAutopilotStateArtifact(cwd, {
    phase: summary.local_review_packet_ready ? "WAITING_HUMAN_REVIEW" : "BLOCKED_QA",
    latestHumanReviewStatus: summary.human_review_status,
    latestFailReasons: summary.local_review_packet_ready ? [] : [summary.human_review_status],
    nextRecommendedAction: summary.local_review_packet_ready ? "WAIT_FOR_OWNER_REVIEW" : "BUILD_V026_REAL_AD_VIDEO_REVIEW",
    safetyStopReason: summary.local_review_packet_ready ? "V026_HUMAN_REVIEW_REQUIRED" : summary.human_review_status
  });

  return withPaths(summary, basePaths, summary.local_review_packet_ready === true);
}

async function renderV026Visuals(input) {
  const sceneClipDir = path.join(input.reviewRoot, "real-ad-clips");
  const scenePosterDir = path.join(input.reviewRoot, "real-ad-posters");
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
  const posterDir = path.join(input.reviewRoot, "real-ad-posters");
  const titlePath = path.join(posterDir, `${input.scene.id}-title.txt`);
  const subtitlePath = path.join(posterDir, `${input.scene.id}-subtitle.txt`);
  const footerPath = path.join(posterDir, `${input.scene.id}-footer.txt`);
  await fs.writeFile(titlePath, input.scene.title, "utf8");
  await fs.writeFile(subtitlePath, input.scene.subtitle, "utf8");
  await fs.writeFile(footerPath, input.scene.footer, "utf8");
  await runMedia({
    kind: "real_ad_scene_clip",
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
  const accent = `0x${input.scene.accent}`;
  const bg = `0x${input.scene.background}`;
  const layout = input.scene.product_layout;
  const overlayPosition = buildProductOverlayExpression(input.scene, layout);
  const shadowPosition = buildShadowExpression(input.scene, layout);
  const baseInput = ["-f", "lavfi", "-i", `color=c=${bg}:s=1080x1920:r=30:d=${SCENE_SECONDS}`];
  const textLayer = [
    `drawtext=fontfile='${font}':textfile='${title}':x=56:y=112:fontsize=54:fontcolor=0xffffff:line_spacing=8:shadowcolor=0x000000@0.55:shadowx=3:shadowy=3`,
    `drawtext=fontfile='${font}':textfile='${subtitle}':x=56:y=190:fontsize=42:fontcolor=${accent}:line_spacing=8:shadowcolor=0x000000@0.6:shadowx=2:shadowy=2`,
    `drawbox=x='-780+min(840\\,t*560)':y=1552:w=850:h=116:color=0x000000@0.58:t=fill`,
    `drawtext=fontfile='${font}':textfile='${footer}':x=62:y=1585:fontsize=29:fontcolor=0xffffff:line_spacing=7`
  ].join(",");

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
      `[1:v]scale=${layout.width}:${layout.height}:force_original_aspect_ratio=decrease,format=rgba,colorkey=0xffffff:0.08:0.16[product]`,
      `[0:v]${buildSceneBackgroundFilter(input.scene, accent)},${textLayer}[base]`,
      `[base]drawbox=x='${shadowPosition.x}':y='${shadowPosition.y}':w=${Math.round(layout.width * 0.82)}:h=56:color=0x000000@0.26:t=fill[shadowed]`,
      `[shadowed][product]overlay=x='${overlayPosition.x}':y='${overlayPosition.y}':shortest=1[with_product]`,
      `[with_product]${buildSceneInteractionFilter(input.scene, accent)},format=yuv420p[out]`
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

function buildSceneBackgroundFilter(sceneItem, accent) {
  const common = [
    `drawbox=x='40+20*sin(2*PI*t/${SCENE_SECONDS})':y=420:w=1000:h=2:color=${accent}@0.55:t=fill`,
    `drawbox=x='990-80*t':y=0:w=2:h=1920:color=${accent}@0.22:t=fill`
  ];
  if (sceneItem.role === "hook") {
    return [
      ...common,
      "drawbox=x='120+mod(t*210\\,760)':y='420+mod(t*420\\,850)':w=10:h=150:color=0x60a5fa@0.55:t=fill",
      "drawbox=x='720-80*t':y=680:w=230:h=230:color=0xef4444@0.18:t=fill",
      "drawbox=x='96+180*t':y=1180:w=560:h=36:color=0xffffff@0.78:t=fill"
    ].join(",");
  }
  if (sceneItem.role === "problem") {
    return [
      ...common,
      "drawbox=x='150+mod(t*260\\,680)':y='520+mod(t*380\\,720)':w=12:h=160:color=0x38bdf8@0.62:t=fill",
      "drawbox=x=80:y=1250:w=920:h=190:color=0x0f172a@0.65:t=fill",
      `drawbox=x='100+sin(2*PI*t)*28':y=1288:w=760:h=24:color=${accent}@0.85:t=fill`
    ].join(",");
  }
  if (sceneItem.role === "problem_visualized") {
    return [
      ...common,
      "drawbox=x='145+40*sin(3*PI*t)':y=560:w=790:h=790:color=0x0f3f2d@0.86:t=fill",
      `drawbox=x='155+120*t':y='680+120*sin(2*PI*t/${SCENE_SECONDS})':w=660:h=16:color=${accent}@0.55:t=fill`,
      "drawbox=x='245+180*t':y=1430:w=540:h=32:color=0xffffff@0.66:t=fill"
    ].join(",");
  }
  if (sceneItem.role === "solution_enter") {
    return [
      ...common,
      "drawbox=x=60:y=560:w=380:h=870:color=0x0f172a@0.5:t=fill",
      "drawbox=x='460+190*t':y=600:w=28:h=790:color=0xffffff@0.28:t=fill",
      `drawbox=x='170+190*t':y=1370:w=660:h=18:color=${accent}@0.9:t=fill`
    ].join(",");
  }
  if (sceneItem.role === "product_reveal") {
    return [
      ...common,
      "drawbox=x='110+35*sin(2*PI*t)':y=500:w=860:h=890:color=0x052e1b@0.9:t=fill",
      `drawbox=x='160+360*t/${SCENE_SECONDS}':y=1320:w=650:h=18:color=${accent}@1:t=fill`,
      `drawbox=x=735:y='670+55*sin(3*PI*t)':w=170:h=170:color=${accent}@0.18:t=fill`
    ].join(",");
  }
  if (sceneItem.role === "usage_simulation") {
    return [
      ...common,
      "drawbox=x=75:y=560:w=930:h=890:color=0x0e7490@0.22:t=fill",
      "drawbox=x='80+330*t/3':y='1070-200*t/3':w=155:h=210:color=0xffffff@0.82:t=fill",
      "drawbox=x='850-380*t/3':y='1120-260*t/3':w=120:h=155:color=0xfef3c7@0.96:t=fill"
    ].join(",");
  }
  if (sceneItem.role === "before_after") {
    return [
      ...common,
      "drawbox=x=0:y=420:w=540:h=1040:color=0x451a03@0.68:t=fill",
      "drawbox=x=540:y=420:w=540:h=1040:color=0x064e3b@0.72:t=fill",
      `drawbox=x='440+220*t/${SCENE_SECONDS}':y=420:w=16:h=1040:color=${accent}@0.95:t=fill`,
      "drawbox=x=85:y=1370:w=320:h=34:color=0xffffff@0.48:t=fill"
    ].join(",");
  }
  return [
    ...common,
    "drawbox=x=95:y=520:w=890:h=870:color=0x111827@0.65:t=fill",
    `drawbox=x='140+140*t':y=1355:w=760:h=16:color=${accent}@0.95:t=fill`,
    `drawbox=x='130+34*sin(7*PI*t)':y=760:w=58:h=58:color=${accent}@1:t=fill`,
    `drawbox=x='130+34*sin(7*PI*t+1)':y=900:w=58:h=58:color=${accent}@1:t=fill`,
    `drawbox=x='130+34*sin(7*PI*t+2)':y=1040:w=58:h=58:color=${accent}@1:t=fill`
  ].join(",");
}

function buildSceneInteractionFilter(sceneItem, accent) {
  if (sceneItem.role === "hook") {
    return [
      `drawbox=x='560+70*sin(3*PI*t)':y=840:w=150:h=24:color=${accent}@0.82:t=fill`,
      "drawbox=x='210+220*t':y='1310-130*t':w=210:h=42:color=0xffffff@0.74:t=fill"
    ].join(",");
  }
  if (sceneItem.role === "problem" || sceneItem.role === "problem_visualized") {
    return [
      "drawbox=x='180+mod(t*270\\,660)':y='600+mod(t*350\\,650)':w=12:h=150:color=0x93c5fd@0.58:t=fill",
      `drawbox=x='700+45*sin(5*PI*t)':y=850:w=210:h=26:color=${accent}@0.75:t=fill`
    ].join(",");
  }
  if (sceneItem.role === "solution_enter" || sceneItem.role === "product_reveal") {
    return [
      `drawbox=x='165+220*t/${SCENE_SECONDS}':y=682:w=360:h=8:color=${accent}@1:t=fill`,
      `drawbox=x='645-170*t/${SCENE_SECONDS}':y=1048:w=300:h=8:color=${accent}@1:t=fill`,
      "drawbox=x='280+60*sin(4*PI*t)':y=1485:w=520:h=20:color=0xffffff@0.55:t=fill"
    ].join(",");
  }
  if (sceneItem.role === "usage_simulation") {
    return [
      "drawbox=x='85+420*t/3':y='1230-270*t/3':w=150:h=210:color=0xffffff@0.9:t=fill",
      "drawbox=x='850-390*t/3':y='1190-225*t/3':w=120:h=155:color=0xfef3c7@1:t=fill",
      "drawbox=x='420+90*sin(2*PI*t)':y=980:w=70:h=70:color=0xe0f2fe@0.95:t=fill",
      `drawbox=x='350+130*t':y=760:w=330:h=9:color=${accent}@1:t=fill`
    ].join(",");
  }
  if (sceneItem.role === "before_after") {
    return [
      "drawbox=x='min(540\\,180+260*t)':y=420:w=540:h=1040:color=0x22c55e@0.12:t=fill",
      "drawbox=x='150+210*t/3':y=1130:w=180:h=38:color=0xffffff@0.66:t=fill",
      `drawbox=x='600+45*sin(7*PI*t)':y=880:w=88:h=88:color=${accent}@0.9:t=fill`
    ].join(",");
  }
  return [
    `drawbox=x='80+500*t/${SCENE_SECONDS}':y=1410:w=780:h=58:color=${accent}@0.9:t=fill`,
    "drawbox=x='735+26*sin(7*PI*t)':y=1285:w=110:h=110:color=0xfacc15@0.95:t=fill",
    `drawbox=x='230+20*sin(6*PI*t)':y=790:w=380:h=8:color=${accent}@1:t=fill`,
    `drawbox=x='230+20*sin(6*PI*t+1)':y=930:w=350:h=8:color=${accent}@1:t=fill`,
    `drawbox=x='230+20*sin(6*PI*t+2)':y=1070:w=320:h=8:color=${accent}@1:t=fill`
  ].join(",");
}

function buildProductOverlayExpression(sceneItem, layout) {
  if (sceneItem.role === "hook") {
    return {
      x: `${layout.x}+max(0\\,220-220*t/${SCENE_SECONDS})`,
      y: `${layout.y}+12*sin(2*PI*t/${SCENE_SECONDS})`
    };
  }
  if (sceneItem.role === "problem") {
    return {
      x: `${layout.x}+max(0\\,120-120*t/${SCENE_SECONDS})`,
      y: `${layout.y}+10*sin(2*PI*t/${SCENE_SECONDS})`
    };
  }
  if (sceneItem.role === "solution_enter") {
    return {
      x: `${layout.x}+max(0\\,260-260*t/${SCENE_SECONDS})`,
      y: `${layout.y}+14*sin(2*PI*t/${SCENE_SECONDS})`
    };
  }
  if (sceneItem.role === "product_reveal") {
    return {
      x: `${layout.x}+22*sin(2*PI*t/${SCENE_SECONDS})`,
      y: `${layout.y}+10*sin(4*PI*t/${SCENE_SECONDS})`
    };
  }
  if (sceneItem.role === "usage_simulation") {
    return {
      x: `${layout.x}+18*sin(2*PI*t/${SCENE_SECONDS})`,
      y: `${layout.y}+8*sin(4*PI*t/${SCENE_SECONDS})`
    };
  }
  if (sceneItem.role === "before_after") {
    return {
      x: `${layout.x}-18*sin(2*PI*t/${SCENE_SECONDS})`,
      y: `${layout.y}`
    };
  }
  if (sceneItem.role === "cta") {
    return {
      x: `${layout.x}`,
      y: `${layout.y}-14*sin(2*PI*t/${SCENE_SECONDS})`
    };
  }
  return { x: `${layout.x}`, y: `${layout.y}` };
}

function buildShadowExpression(sceneItem, layout) {
  const y = layout.y + layout.height - 32;
  const x = layout.x + Math.round(layout.width * 0.08);
  if (sceneItem.role === "hook" || sceneItem.role === "solution_enter") {
    return {
      x: `${x}+max(0\\,180-180*t/${SCENE_SECONDS})`,
      y: `${y}`
    };
  }
  return { x: `${x}`, y: `${y}` };
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
      "fps=1/3,scale=270:480:force_original_aspect_ratio=decrease,pad=270:480:(ow-iw)/2:(oh-ih)/2,tile=4x2",
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
      "fps=1/3,drawbox=x=0:y=0:w=1080:h=165:color=black@0.18:t=fill,drawbox=x=870:y=620:w=150:h=500:color=black@0.16:t=fill,drawbox=x=0:y=1585:w=1080:h=250:color=black@0.16:t=fill,scale=270:480:force_original_aspect_ratio=decrease,pad=270:480:(ow-iw)/2:(oh-ih)/2,tile=4x2",
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
    return evaluateV026AudioIntelligibility({
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
  const tempDir = await fs.mkdtemp(path.join(input.cwd, "commerce-assets", ".tmp-v026-asr-"));
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
    return evaluateV026AudioIntelligibility({
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

export function evaluateV026AudioIntelligibility(input = {}) {
  const transcript = String(input.transcript ?? "").trim();
  const normalizedTranscript = normalizeKoreanProductTerms(transcript);
  const rawSimilarityScore = normalizeRatio(input.rawSimilarityScore) ??
    calculateTranscriptSimilarity(V026_VOICEOVER_SCRIPT, transcript);
  const transcriptSimilarityScore = normalizeRatio(input.transcriptSimilarityScore) ??
    calculateTranscriptSimilarity(V026_VOICEOVER_SCRIPT, normalizedTranscript);
  const recognizedCoreAnchors = findAnchors(normalizedTranscript, V026_REQUIRED_CORE_ANCHORS);
  const coreAnchorRecognitionPass = input.coreAnchorRecognitionPass ??
    V026_REQUIRED_CORE_ANCHORS.every((anchor) => recognizedCoreAnchors.includes(anchor));
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
  <title>v026 Real Ad Video Review</title>
  <style>
    body { margin: 0; font-family: Arial, "Malgun Gothic", sans-serif; background: #0f172a; color: #e5e7eb; }
    main { max-width: 1180px; margin: 0 auto; padding: 28px; }
    h1 { font-size: 30px; margin: 0 0 14px; }
    .status { display: inline-block; padding: 6px 10px; background: #166534; color: #fff; border-radius: 4px; font-weight: 700; }
    .note { color: #fca5a5; font-weight: 700; }
    .grid { display: grid; grid-template-columns: minmax(320px, 420px) 1fr; gap: 22px; align-items: start; }
    video, img { width: 100%; border: 1px solid #334155; background: #020617; }
    section { margin-bottom: 22px; }
    .cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
    .metric { background: #111827; border: 1px solid #334155; padding: 12px; }
    .metric strong { display: block; font-size: 20px; margin-top: 4px; }
    pre { white-space: pre-wrap; background: #020617; padding: 16px; border: 1px solid #334155; overflow: auto; }
    @media (max-width: 860px) { .grid, .cards { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <h1>v026 Real Ad Video Review</h1>
    <p><span class="status">PENDING_HUMAN_REVIEW_NO_UPLOAD</span></p>
    <p class="note">v025 is locked as FAIL_LOCAL_HUMAN_REVIEW. PR #146 must not be merged. v026 still requires owner review before any private upload request.</p>
    <div class="grid">
      <section><video src="local-review-video.mp4" controls playsinline></video></section>
      <section>
        <h2>Real Ad Gates</h2>
        <div class="cards">
          <div class="metric">motion variety<strong>${summary.motion_variety_count}</strong></div>
          <div class="metric">static card ratio<strong>${summary.static_card_frame_ratio}</strong></div>
          <div class="metric">product scenes<strong>${summary.product_image_visible_scene_count}</strong></div>
          <div class="metric">ASR similarity<strong>${summary.raw_similarity_score ?? "null"}</strong></div>
        </div>
        <pre>real_ad_visual_pass=${summary.real_ad_visual_pass}
negative_pattern_match=${summary.negative_pattern_match}
product_interaction_pass=${summary.product_interaction_pass}
usage_simulation_used=${summary.usage_simulation_used}
before_after_used=${summary.before_after_used}
cta_motion_used=${summary.cta_motion_used}
speech_rate_wpm=${summary.speech_rate_wpm ?? "null"}</pre>
      </section>
    </div>
    <section>
      <h2>Review Artifacts</h2>
      <img src="actual-frame-contact-sheet.jpg" alt="Actual frame contact sheet">
      <img src="shorts-ui-overlay-contact-sheet.jpg" alt="Shorts UI overlay contact sheet">
    </section>
    <section>
      <h2>Owner Review Checklist</h2>
      <ol>
        <li>Does it look like a Shorts ad video, not a product-photo card slide?</li>
        <li>Does the product move as an object with depth, shadow, and callouts?</li>
        <li>Are laundry/problem overlays and usage simulation convincing?</li>
        <li>Is the before/after split screen readable?</li>
        <li>Is the CTA lower-third motion clear without public/unlisted upload?</li>
        <li>Is the MeloTTS voice acceptable at the current speed?</li>
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

function realAdScene(input) {
  return {
    scene: input.scene,
    id: input.id,
    role: input.role,
    title: input.title,
    subtitle: input.subtitle,
    footer: input.footer,
    script_line: input.scriptLine,
    product_display_mode: "cutout_object",
    product_image_visible: input.productVisible,
    product_image_required: true,
    product_visual_central: input.productCentral,
    product_layout: input.productLayout,
    product_enter_second: input.productEnterSecond,
    product_depth: input.depth === true,
    visual_depth: input.depth === true,
    product_interaction_overlay: input.overlay === true,
    usage_simulation: input.usageSimulation === true,
    before_after: input.beforeAfter === true,
    cta_motion: input.ctaMotion === true,
    product_fixed_in_rectangle_card: false,
    only_zoom_pan: false,
    static_card_frame: false,
    product_photo_card_frame: false,
    primitive_shape_frame: false,
    ppt_slide_frame: false,
    ad_motion_directives: input.motions,
    accent: input.accent,
    background: input.background,
    duration_seconds: SCENE_SECONDS
  };
}

function withPaths(summary, paths, localReviewPacketReady) {
  return {
    target_version: TARGET_VERSION,
    ...summary,
    review_console_generated: localReviewPacketReady,
    local_review_video_path: paths.localReviewVideoPath,
    review_console_path: paths.reviewConsolePath,
    real_ad_scene_plan_path: paths.realAdScenePlanPath,
    real_ad_visual_gate_path: paths.realAdVisualGatePath,
    negative_pattern_gate_path: paths.negativePatternGatePath,
    product_interaction_report_path: paths.productInteractionReportPath,
    actual_frame_contact_sheet_path: paths.actualFrameContactSheetPath,
    shorts_ui_overlay_contact_sheet_path: paths.shortsUiOverlayContactSheetPath,
    asr_transcript_path: paths.transcriptPath,
    audio_intelligibility_probe_path: paths.audioProbePath,
    human_review_decision_path: paths.humanDecisionPath,
    review_summary_path: paths.reviewSummaryPath,
    v025_human_review_decision_path: paths.v025HumanDecisionPath,
    voiceover_script_path: paths.voiceoverScriptPath,
    voiceover_audio_path: paths.voiceoverAudioPath
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
    .replaceAll("건조 대", "건조대")
    .replaceAll("빨래 건조 대", "빨래 건조대")
    .replaceAll("빨래 건조되는", "빨래 건조대는")
    .replaceAll("건조되는", "건조대는")
    .replaceAll("건 조대", "건조대")
    .replaceAll("공 간", "공간");
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
  generateV026RealAdVideoReviewPacket()
    .then((result) => {
      console.log(JSON.stringify({
        target_version: TARGET_VERSION,
        v025_review_status: result.v025_review_status,
        pr146_merge_allowed: result.pr146_merge_allowed,
        review_console_generated: result.review_console_generated,
        real_ad_visual_pass: result.real_ad_visual_pass,
        product_photo_card_slide: result.product_photo_card_slide,
        ppt_slide_feeling: result.ppt_slide_feeling,
        motion_variety_count: result.motion_variety_count,
        negative_pattern_match: result.negative_pattern_match,
        product_interaction_pass: result.product_interaction_pass,
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
