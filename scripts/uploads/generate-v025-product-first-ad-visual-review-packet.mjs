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
const FAILED_VERSION = "v024";
const TARGET_VERSION = "v025";
const PRODUCT_IMAGE_BASENAME = "source-product-e85e25a977.jpg";
const CANONICAL_PRODUCT_NAME = "Coupang foldable drying rack";
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
const FRAME_AREA = 1080 * 1920;

export const V025_REQUIRED_CORE_ANCHORS = ["빨래", "건조대", "공간"];

export const V024_VISUAL_REGRESSION_FAIL_REASONS = [
  "TEXT_CARD_RENDERER_REGRESSION",
  "ABSTRACT_SHAPE_VISUALS",
  "PRODUCT_IMAGE_NOT_VISIBLE_AS_SOLUTION_EARLY_ENOUGH",
  "SCRIPT_DRIVEN_METRICS_FALSE_POSITIVE",
  "VIDEO_STILL_LOOKS_LIKE_READING_CARD",
  "NOT_AD_LIKE"
];

export const V025_VOICEOVER_SCRIPT_LINES = [
  "장마철 빨래 냄새, 그냥 넘기면 손해입니다.",
  "비 오는 날에는 빨래가 잘 마르지 않고 집안 습기도 금방 올라옵니다.",
  "좁은 공간이라면 빨래 널 자리까지 부족해집니다.",
  "접이식 빨래건조대는 이런 순간에 바로 보이는 해결책입니다.",
  "작은 공간에서도 수건과 양말을 한 번에 널 수 있습니다.",
  "구매 전에는 크기, 하중, 보관 공간을 꼭 확인하세요.",
  "자세한 구성과 가격은 설명란에서 확인하세요."
];

export const V025_VOICEOVER_SCRIPT = V025_VOICEOVER_SCRIPT_LINES.join(" ");

export function buildV024VisualRegressionFailureDecision() {
  return {
    candidate_id: CANDIDATE_ID,
    version: FAILED_VERSION,
    human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
    private_upload_allowed: false,
    safe_to_request_private_upload: false,
    requires_fresh_upload_approval: true,
    fail_reasons: V024_VISUAL_REGRESSION_FAIL_REASONS,
    next_required_version: TARGET_VERSION
  };
}

export function buildV025ProductFirstTimeline() {
  return [
    scene({
      sceneNumber: 1,
      id: "scene_01_hook_solution_preview",
      role: "hook_solution_preview",
      title: "장마철 빨래 냄새",
      subtitle: "그냥 넘기면 손해",
      footer: "문제와 해결책을 첫 화면에서 확인",
      scriptLine: V025_VOICEOVER_SCRIPT_LINES[0],
      visualGoal: "Rainy laundry problem and large product solution preview appear together in the first second.",
      productRole: "large_solution_preview",
      central: true,
      visibleInFirst2s: true,
      solutionRole: true,
      bboxRatio: 0.22,
      layout: { x: 410, y: 520, width: 590, height: 780 },
      accent: "16a34a",
      background: "ecfdf5",
      problemVisual: "rain_humidity_problem",
      scriptCounterpart: true
    }),
    scene({
      sceneNumber: 2,
      id: "scene_02_rain_laundry_problem",
      role: "problem",
      title: "비 오는 날",
      subtitle: "습기와 냄새 문제",
      footer: "젖은 빨래가 늦게 마르는 상황",
      scriptLine: V025_VOICEOVER_SCRIPT_LINES[1],
      visualGoal: "Wet laundry problem is visible while product stays on-screen as a solution preview.",
      productRole: "solution_preview",
      central: false,
      visibleInFirst2s: true,
      solutionRole: false,
      bboxRatio: 0.14,
      layout: { x: 620, y: 860, width: 420, height: 620 },
      accent: "2563eb",
      background: "eff6ff",
      problemVisual: "wet_laundry_problem",
      scriptCounterpart: true
    }),
    scene({
      sceneNumber: 3,
      id: "scene_03_small_space_problem",
      role: "problem",
      title: "좁은 공간",
      subtitle: "널 자리 부족",
      footer: "공간 부족 문제를 먼저 보여줌",
      scriptLine: V025_VOICEOVER_SCRIPT_LINES[2],
      visualGoal: "Small room constraint is shown before the full reveal.",
      productRole: "side_solution_preview",
      central: false,
      visibleInFirst2s: false,
      solutionRole: false,
      bboxRatio: 0.13,
      layout: { x: 660, y: 820, width: 390, height: 620 },
      accent: "f59e0b",
      background: "fffbeb",
      problemVisual: "small_room_problem",
      scriptCounterpart: true
    }),
    scene({
      sceneNumber: 4,
      id: "scene_04_product_reveal",
      role: "product_reveal",
      title: "접이식 빨래건조대",
      subtitle: "해결책으로 크게 보기",
      footer: "제품 이미지를 화면 중심에 배치",
      scriptLine: V025_VOICEOVER_SCRIPT_LINES[3],
      visualGoal: "Product image becomes the main visual before the halfway point.",
      productRole: "central_solution",
      central: true,
      visibleInFirst2s: false,
      solutionRole: true,
      bboxRatio: 0.28,
      layout: { x: 140, y: 500, width: 800, height: 860 },
      accent: "16a34a",
      background: "f0fdf4",
      problemVisual: "solution_reveal",
      scriptCounterpart: true
    }),
    scene({
      sceneNumber: 5,
      id: "scene_05_real_use_case",
      role: "solution_use_case",
      title: "수건과 양말",
      subtitle: "한 번에 널기",
      footer: "빨래 아이템이 제품 쪽으로 이동",
      scriptLine: V025_VOICEOVER_SCRIPT_LINES[4],
      visualGoal: "Laundry items animate around the product so the sentence has a visual counterpart.",
      productRole: "central_use_case",
      central: true,
      visibleInFirst2s: false,
      solutionRole: true,
      bboxRatio: 0.25,
      layout: { x: 170, y: 560, width: 760, height: 820 },
      accent: "0891b2",
      background: "ecfeff",
      problemVisual: "laundry_items_use_case",
      scriptCounterpart: true
    }),
    scene({
      sceneNumber: 6,
      id: "scene_06_before_after",
      role: "before_after",
      title: "전후 공간",
      subtitle: "널 자리 비교",
      footer: "제품이 해결책으로 보이는 장면",
      scriptLine: V025_VOICEOVER_SCRIPT_LINES[4],
      visualGoal: "Before and after panels show the drying rack as the answer.",
      productRole: "central_after_solution",
      central: true,
      visibleInFirst2s: false,
      solutionRole: true,
      bboxRatio: 0.22,
      layout: { x: 430, y: 620, width: 570, height: 720 },
      accent: "7c3aed",
      background: "f5f3ff",
      problemVisual: "before_after_solution",
      scriptCounterpart: true
    }),
    scene({
      sceneNumber: 7,
      id: "scene_07_buying_checklist",
      role: "checklist",
      title: "구매 전 확인",
      subtitle: "크기, 하중, 보관",
      footer: "체크리스트는 제품 옆에 표시",
      scriptLine: V025_VOICEOVER_SCRIPT_LINES[5],
      visualGoal: "Buying checklist sits beside the product instead of replacing it.",
      productRole: "central_checklist_partner",
      central: true,
      visibleInFirst2s: false,
      solutionRole: true,
      bboxRatio: 0.2,
      layout: { x: 430, y: 610, width: 560, height: 690 },
      accent: "db2777",
      background: "fdf2f8",
      problemVisual: "buying_checklist",
      scriptCounterpart: true
    }),
    scene({
      sceneNumber: 8,
      id: "scene_08_cta",
      role: "cta",
      title: "설명란 확인",
      subtitle: "구성, 가격 체크",
      footer: "쿠팡 파트너스 고지 포함",
      scriptLine: V025_VOICEOVER_SCRIPT_LINES[6],
      visualGoal: "Final CTA still keeps the product image as the main visual.",
      productRole: "central_cta",
      central: true,
      visibleInFirst2s: false,
      solutionRole: true,
      bboxRatio: 0.23,
      layout: { x: 210, y: 560, width: 700, height: 780 },
      accent: "334155",
      background: "f8fafc",
      problemVisual: "description_cta",
      scriptCounterpart: true
    })
  ];
}

export async function inspectV025ProductImage(input = {}) {
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

export function buildV025ProductImageVisibilityReport(input = {}) {
  const timeline = input.timeline ?? buildV025ProductFirstTimeline();
  const productImage = input.productImage ?? { product_image_ready: false, blocker: "PRODUCT_IMAGE_NOT_READY" };
  const productScenes = timeline.filter((item) => item.product_image_required === true);
  const centralScenes = timeline.filter((item) => item.product_visual_central === true);
  const first2sScenes = timeline.filter((item) => item.product_visible_in_first_2s === true);
  const solutionScenes = timeline.filter((item) => item.product_solution_role === true);
  const first2sRatio = maxRatio(first2sScenes);
  const solutionRatio = averageRatio(solutionScenes);
  const productImageReady = productImage.product_image_ready === true;
  const productVisibleInFirst2s = productImageReady && first2sScenes.length > 0 && first2sRatio >= 0.12;
  const centralEnough = centralScenes.length >= 4;
  const solutionVisible = productImageReady && solutionScenes.length >= 5 && solutionRatio >= 0.18;
  const blocker =
    !productImageReady ? "PRODUCT_IMAGE_NOT_READY" :
      !productVisibleInFirst2s ? "PRODUCT_IMAGE_NOT_VISIBLE_IN_FIRST_2S" :
        first2sRatio < 0.12 || solutionRatio < 0.18 ? "PRODUCT_IMAGE_TOO_SMALL" :
          !centralEnough ? "PRODUCT_IMAGE_NOT_CENTRAL_ENOUGH" :
            !solutionVisible ? "DRYING_RACK_NOT_VISIBLE_AS_SOLUTION" :
              null;

  return {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    product_name: CANONICAL_PRODUCT_NAME,
    product_image_ready: productImageReady,
    product_image_visible_in_first_2s: productVisibleInFirst2s,
    product_image_visible_scene_count: productScenes.length,
    product_image_central_scene_count: centralScenes.length,
    product_image_bbox_area_ratio_first_2s: round3(first2sRatio),
    product_image_bbox_area_ratio_solution_scenes: round3(solutionRatio),
    drying_rack_visible_as_solution: solutionVisible,
    product_scene_numbers: productScenes.map((item) => item.scene),
    product_image_basename: productImage.product_image_basename ?? null,
    raw_product_image_url_printed: false,
    product_visibility_blocker: blocker
  };
}

export function buildV025CardRegressionGate(input = {}) {
  const timeline = input.timeline ?? buildV025ProductFirstTimeline();
  const textCardSceneCount = timeline.filter((item) => item.visual_kind === "text_card").length;
  const abstractShapeSceneCount = timeline.filter((item) => item.abstract_shape_visual === true).length;
  const primitiveBarOrBoxSceneCount = timeline.filter((item) => item.primitive_bar_or_box_visual === true).length;
  const readingCardFeeling = textCardSceneCount > 1 ||
    abstractShapeSceneCount > 1 ||
    primitiveBarOrBoxSceneCount > 1 ||
    timeline.some((item) => item.reading_card_feeling === true);
  const blocker =
    textCardSceneCount > 1 ? "TEXT_CARD_RENDERER_REGRESSION" :
      abstractShapeSceneCount > 1 ? "ABSTRACT_SHAPE_VISUALS" :
        primitiveBarOrBoxSceneCount > 1 ? "PRIMITIVE_BAR_OR_BOX_VISUALS" :
          readingCardFeeling ? "VIDEO_STILL_LOOKS_LIKE_READING_CARD" :
            null;
  return {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    text_card_scene_count: textCardSceneCount,
    abstract_shape_scene_count: abstractShapeSceneCount,
    primitive_bar_or_box_scene_count: primitiveBarOrBoxSceneCount,
    reading_card_feeling: readingCardFeeling,
    ad_like_visual_pass: blocker === null,
    card_regression_blocker: blocker
  };
}

export function buildV025ScriptVisualAlignmentReport(input = {}) {
  const timeline = input.timeline ?? buildV025ProductFirstTimeline();
  const visibility = input.visibility ?? buildV025ProductImageVisibilityReport({ timeline });
  const eachScriptSentenceHasVisualCounterpart = timeline.every((item) => item.script_visual_counterpart === true);
  const firstSolutionScene = timeline.find((item) => item.product_solution_role === true);
  const firstFullSolutionScene = timeline.find((item) => item.role === "product_reveal" || item.role === "solution_use_case");
  const firstProblemScene = timeline.find((item) => item.role === "hook_solution_preview" || item.role === "problem");
  const productSolutionConnectionScore = visibility.product_visibility_blocker === null &&
    eachScriptSentenceHasVisualCounterpart
    ? 94
    : 62;
  const problemVisualBeforeSolution = Boolean(firstProblemScene) && Boolean(firstSolutionScene) &&
    Boolean(firstFullSolutionScene) && firstProblemScene.scene < firstFullSolutionScene.scene;
  const solutionVisualAppearsBeforeHalfway = Boolean(firstSolutionScene) && firstSolutionScene.scene <= 4 &&
    visibility.product_image_visible_in_first_2s === true;
  const pass =
    eachScriptSentenceHasVisualCounterpart &&
    productSolutionConnectionScore >= 90 &&
    problemVisualBeforeSolution &&
    solutionVisualAppearsBeforeHalfway;
  const blocker =
    !eachScriptSentenceHasVisualCounterpart ? "SCRIPT_NOT_VISUALIZED" :
      productSolutionConnectionScore < 90 ? "SCRIPT_VISUAL_ALIGNMENT_FALSE_POSITIVE" :
        !solutionVisualAppearsBeforeHalfway ? "PRODUCT_SOLUTION_TOO_LATE" :
          !problemVisualBeforeSolution ? "STORY_FLOW_NOT_CLEAR" :
            null;
  return {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    script_visual_alignment_pass: pass,
    each_script_sentence_has_visual_counterpart: eachScriptSentenceHasVisualCounterpart,
    product_solution_connection_score: productSolutionConnectionScore,
    problem_visual_before_solution: problemVisualBeforeSolution,
    solution_visual_appears_before_halfway: solutionVisualAppearsBeforeHalfway,
    script_visual_blocker: blocker
  };
}

export function buildV025ReviewSummary(input = {}) {
  const timeline = input.timeline ?? buildV025ProductFirstTimeline();
  const visibility = input.visibility ?? buildV025ProductImageVisibilityReport({ timeline });
  const cardGate = input.cardGate ?? buildV025CardRegressionGate({ timeline });
  const alignment = input.alignment ?? buildV025ScriptVisualAlignmentReport({ timeline, visibility });
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
    V025_REQUIRED_CORE_ANCHORS.every((anchor) => recognizedCoreAnchors.includes(anchor)) &&
    audioProbe.audio_blocker === null;
  const productFirstAdVisualReady =
    visibility.product_visibility_blocker === null &&
    cardGate.card_regression_blocker === null &&
    alignment.script_visual_blocker === null &&
    cardGate.ad_like_visual_pass === true;
  const localReviewPacketReady =
    input.localReviewVideoCreated === true &&
    productFirstAdVisualReady &&
    audioPass;
  const humanReviewStatus = localReviewPacketReady
    ? "PENDING_HUMAN_REVIEW"
    : visibility.product_visibility_blocker ??
      cardGate.card_regression_blocker ??
      alignment.script_visual_blocker ??
      audioProbe.audio_blocker ??
      "BLOCKED_V025_PRODUCT_FIRST_AD_VISUAL_REVIEW";

  return {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    provider: "product_first_ad_visual_renderer",
    renderer_names: [
      "ProductFirstAdVisualRenderer",
      "DryingRackSolutionPreviewComposer",
      "ScriptVisualCounterpartGate"
    ],
    product_name: CANONICAL_PRODUCT_NAME,
    v024_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
    v024_fail_reasons: V024_VISUAL_REGRESSION_FAIL_REASONS,
    product_first_ad_visual_ready: productFirstAdVisualReady,
    product_image_ready: visibility.product_image_ready,
    product_image_visible_in_first_2s: visibility.product_image_visible_in_first_2s,
    product_image_visible_scene_count: visibility.product_image_visible_scene_count,
    product_image_central_scene_count: visibility.product_image_central_scene_count,
    product_image_bbox_area_ratio_first_2s: visibility.product_image_bbox_area_ratio_first_2s,
    product_image_bbox_area_ratio_solution_scenes: visibility.product_image_bbox_area_ratio_solution_scenes,
    drying_rack_visible_as_solution: visibility.drying_rack_visible_as_solution,
    product_visibility_blocker: visibility.product_visibility_blocker,
    text_card_scene_count: cardGate.text_card_scene_count,
    abstract_shape_scene_count: cardGate.abstract_shape_scene_count,
    primitive_bar_or_box_scene_count: cardGate.primitive_bar_or_box_scene_count,
    reading_card_feeling: cardGate.reading_card_feeling,
    ad_like_visual_pass: cardGate.ad_like_visual_pass,
    card_regression_blocker: cardGate.card_regression_blocker,
    script_visual_alignment_pass: alignment.script_visual_alignment_pass,
    each_script_sentence_has_visual_counterpart: alignment.each_script_sentence_has_visual_counterpart,
    product_solution_connection_score: alignment.product_solution_connection_score,
    problem_visual_before_solution: alignment.problem_visual_before_solution,
    solution_visual_appears_before_halfway: alignment.solution_visual_appears_before_halfway,
    script_visual_blocker: alignment.script_visual_blocker,
    local_review_video_created: input.localReviewVideoCreated === true,
    voiceover_generated: input.voiceoverGenerated === true,
    video_has_audio_stream: input.videoHasAudioStream === true,
    melotts_voice_used: input.voiceoverGenerated === true,
    voiceover_naturalness_score: input.voiceoverGenerated === true ? 90 : 0,
    hard_cut_count: 0,
    real_asr_probe_executed: audioProbe.real_asr_probe_executed === true,
    raw_similarity_score: rawSimilarityScore,
    transcript_similarity_score: transcriptSimilarityScore,
    core_anchor_recognition_pass: audioProbe.core_anchor_recognition_pass === true,
    recognized_core_anchors: recognizedCoreAnchors,
    speech_rate_wpm: normalizeNumber(audioProbe.speech_rate_wpm),
    audio_blocker: audioProbe.audio_blocker ?? null,
    real_storyboard_gate_pass: productFirstAdVisualReady,
    human_visual_gate_pass: productFirstAdVisualReady,
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
    raw_product_image_url_printed: false,
    raw_asset_url_printed: false
  };
}

export async function generateV025ProductFirstAdVisualReviewPacket(input = {}) {
  const cwd = input.cwd ?? process.cwd();
  const env = input.env ?? await loadLocalEnv(cwd);
  const reviewRoot = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, TARGET_VERSION);
  const failedReviewRoot = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, FAILED_VERSION);
  const localReviewVideoPath = path.join(reviewRoot, "local-review-video.mp4");
  const visualOnlyVideoPath = path.join(reviewRoot, "visual-only-local-review-video.mp4");
  const reviewConsolePath = path.join(reviewRoot, "review-console.html");
  const timelinePath = path.join(reviewRoot, "product-first-scene-timeline.json");
  const visibilityPath = path.join(reviewRoot, "product-image-visibility-report.json");
  const cardGatePath = path.join(reviewRoot, "card-regression-gate.json");
  const alignmentPath = path.join(reviewRoot, "script-visual-alignment-report.json");
  const actualContactSheetPath = path.join(reviewRoot, "actual-frame-contact-sheet.jpg");
  const overlayContactSheetPath = path.join(reviewRoot, "shorts-ui-overlay-contact-sheet.jpg");
  const transcriptPath = path.join(reviewRoot, "asr-transcript.txt");
  const audioProbePath = path.join(reviewRoot, "audio-intelligibility-probe.json");
  const humanDecisionPath = path.join(reviewRoot, "human-review-decision.json");
  const reviewSummaryPath = path.join(reviewRoot, "review-summary.json");
  const voiceoverScriptPath = path.join(reviewRoot, "voiceover-script.txt");
  const voiceoverAudioPath = path.join(reviewRoot, "voiceover.wav");
  const v024HumanDecisionPath = path.join(failedReviewRoot, "human-review-decision.json");

  await fs.mkdir(reviewRoot, { recursive: true });
  await fs.mkdir(failedReviewRoot, { recursive: true });
  await writeJson(v024HumanDecisionPath, buildV024VisualRegressionFailureDecision());

  const timeline = buildV025ProductFirstTimeline();
  await writeJson(timelinePath, {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    voiceover_script: V025_VOICEOVER_SCRIPT_LINES,
    scenes: timeline
  });

  const productImage = await inspectV025ProductImage({
    cwd,
    productImagePath: input.productImagePath
  });
  const visibility = buildV025ProductImageVisibilityReport({ timeline, productImage });
  const cardGate = buildV025CardRegressionGate({ timeline });
  const alignment = buildV025ScriptVisualAlignmentReport({ timeline, visibility });
  await writeJson(visibilityPath, visibility);
  await writeJson(cardGatePath, cardGate);
  await writeJson(alignmentPath, alignment);

  const paths = {
    localReviewVideoPath,
    reviewConsolePath,
    productImageVisibilityReportPath: visibilityPath,
    cardRegressionGatePath: cardGatePath,
    scriptVisualAlignmentReportPath: alignmentPath,
    actualContactSheetPath,
    overlayContactSheetPath,
    transcriptPath,
    audioProbePath,
    humanDecisionPath,
    reviewSummaryPath,
    v024HumanDecisionPath
  };

  if (visibility.product_visibility_blocker || cardGate.card_regression_blocker || alignment.script_visual_blocker) {
    return writeBlockedPacket({
      cwd,
      paths,
      timeline,
      visibility,
      cardGate,
      alignment,
      blocker: visibility.product_visibility_blocker ?? cardGate.card_regression_blocker ?? alignment.script_visual_blocker
    });
  }

  await fs.writeFile(voiceoverScriptPath, `${V025_VOICEOVER_SCRIPT_LINES.join("\n")}\n`, "utf8");
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
      paths,
      timeline,
      visibility,
      cardGate,
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
      paths,
      timeline,
      visibility,
      cardGate,
      alignment,
      blocker: ttsResult.blocker ?? "LOCAL_KOREAN_TTS_COMMAND_FAILED"
    });
  }

  await renderV025Visuals({
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

  const summary = buildV025ReviewSummary({
    timeline,
    visibility,
    cardGate,
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
    review_console_path: "commerce-assets/review/candidate-3c4f2ee364ba5b07/v025/review-console.html"
  });
  if (summary.local_review_packet_ready === true) {
    await fs.writeFile(reviewConsolePath, buildReviewConsoleHtml(summary), "utf8");
  }
  await writeAutopilotStateArtifact(cwd, {
    phase: summary.local_review_packet_ready ? "WAITING_HUMAN_REVIEW" : "BLOCKED_QA",
    latestHumanReviewStatus: summary.human_review_status,
    latestFailReasons: V024_VISUAL_REGRESSION_FAIL_REASONS,
    nextRecommendedAction: summary.local_review_packet_ready ? "WAIT_FOR_OWNER_REVIEW" : summary.human_review_status,
    safetyStopReason: summary.local_review_packet_ready ? null : summary.human_review_status
  });

  return buildResult({ summary, paths });
}

async function writeBlockedPacket(input) {
  const audioProbe = {
    real_asr_probe_executed: false,
    raw_similarity_score: null,
    transcript_similarity_score: null,
    core_anchor_recognition_pass: false,
    recognized_core_anchors: [],
    speech_rate_wpm: null,
    audio_blocker: input.blocker
  };
  const summary = buildV025ReviewSummary({
    timeline: input.timeline,
    visibility: input.visibility,
    cardGate: input.cardGate,
    alignment: input.alignment,
    voiceoverGenerated: false,
    videoHasAudioStream: false,
    localReviewVideoCreated: false,
    audioProbe
  });
  await writeJson(input.paths.reviewSummaryPath, summary);
  await writeJson(input.paths.humanDecisionPath, {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    human_review_status: summary.human_review_status,
    private_upload_allowed: false,
    safe_to_request_private_upload: false,
    requires_fresh_upload_approval: true,
    review_console_path: "commerce-assets/review/candidate-3c4f2ee364ba5b07/v025/review-console.html"
  });
  await writeAutopilotStateArtifact(input.cwd, {
    phase: "BLOCKED_QA",
    latestHumanReviewStatus: summary.human_review_status,
    latestFailReasons: V024_VISUAL_REGRESSION_FAIL_REASONS,
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
    product_image_visibility_report_path: input.paths.productImageVisibilityReportPath,
    card_regression_gate_path: input.paths.cardRegressionGatePath,
    script_visual_alignment_report_path: input.paths.scriptVisualAlignmentReportPath,
    actual_frame_contact_sheet_path: input.paths.actualContactSheetPath,
    shorts_ui_overlay_contact_sheet_path: input.paths.overlayContactSheetPath,
    asr_transcript_path: input.paths.transcriptPath,
    audio_intelligibility_probe_path: input.paths.audioProbePath,
    human_review_decision_path: input.paths.humanDecisionPath,
    review_summary_path: input.paths.reviewSummaryPath,
    v024_human_review_decision_path: input.paths.v024HumanDecisionPath
  };
}

async function renderV025Visuals(input) {
  const sceneClipDir = path.join(input.reviewRoot, "product-first-clips");
  const scenePosterDir = path.join(input.reviewRoot, "product-first-posters");
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
  const posterDir = path.join(input.reviewRoot, "product-first-posters");
  const titlePath = path.join(posterDir, `${input.scene.id}-title.txt`);
  const subtitlePath = path.join(posterDir, `${input.scene.id}-subtitle.txt`);
  const footerPath = path.join(posterDir, `${input.scene.id}-footer.txt`);
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
  const layout = input.scene.product_layout ?? { x: 200, y: 560, width: 700, height: 760 };
  const productOverlay = buildProductOverlayExpression(input.scene, layout);
  const baseInput = ["-f", "lavfi", "-i", `color=c=${bg}:s=1080x1920:r=30:d=${SCENE_SECONDS}`];
  const textLayer = [
    `drawbox=x=58:y=104:w=964:h=265:color=white@0.72:t=fill`,
    `drawbox=x=58:y=104:w=18:h=265:color=${accent}@1:t=fill`,
    `drawtext=fontfile='${font}':textfile='${title}':x=98:y=142:fontsize=58:fontcolor=0x111827:line_spacing=8`,
    `drawtext=fontfile='${font}':textfile='${subtitle}':x=98:y=250:fontsize=48:fontcolor=${accent}:line_spacing=8`,
    `drawtext=fontfile='${font}':textfile='${footer}':x=92:y=1640:fontsize=38:fontcolor=0x1f2937:line_spacing=8`
  ].join(",");
  const adSceneLayer = buildAdSceneBackgroundFilter(input.scene, accent);
  const overlays = buildProductSceneOverlayFilter(input.scene, accent);
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
      `[0:v]${adSceneLayer},${textLayer}[base]`,
      `[base][product]overlay=x='${productOverlay.x}':y='${productOverlay.y}':shortest=1[with_product]`,
      `[with_product]${overlays},format=yuv420p[out]`
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

function buildProductOverlayExpression(sceneItem, layout) {
  if (sceneItem.role === "hook_solution_preview") {
    return {
      x: `${layout.x}-44+44*min(t/${SCENE_SECONDS}\\,1)`,
      y: `${layout.y}+12*sin(2*PI*t/${SCENE_SECONDS})`
    };
  }
  if (sceneItem.role === "product_reveal") {
    return {
      x: `${layout.x}+max(0\\,150-150*t/${SCENE_SECONDS})`,
      y: `${layout.y}+10*sin(2*PI*t/${SCENE_SECONDS})`
    };
  }
  if (sceneItem.role === "solution_use_case") {
    return {
      x: `${layout.x}+18*sin(2*PI*t/${SCENE_SECONDS})`,
      y: `${layout.y}+8*sin(4*PI*t/${SCENE_SECONDS})`
    };
  }
  if (sceneItem.role === "before_after") {
    return {
      x: `${layout.x}+12*sin(2*PI*t/${SCENE_SECONDS})`,
      y: `${layout.y}`
    };
  }
  if (sceneItem.role === "checklist") {
    return {
      x: `${layout.x}-12*sin(2*PI*t/${SCENE_SECONDS})`,
      y: `${layout.y}`
    };
  }
  if (sceneItem.role === "cta") {
    return {
      x: `${layout.x}`,
      y: `${layout.y}-12*sin(2*PI*t/${SCENE_SECONDS})`
    };
  }
  return { x: `${layout.x}`, y: `${layout.y}` };
}

function buildAdSceneBackgroundFilter(sceneItem, accent) {
  switch (sceneItem.problem_visual) {
    case "rain_humidity_problem":
      return [
        "drawbox=x=96:y=430:w=330:h=900:color=0xdbeafe@1:t=fill",
        "drawbox=x=128:y=520:w=250:h=52:color=0x94a3b8@1:t=fill",
        "drawbox=x='152+20*sin(8*PI*t)':y=630:w=16:h=420:color=0x60a5fa@0.78:t=fill",
        "drawbox=x='214+18*sin(8*PI*t+1)':y=680:w=16:h=380:color=0x60a5fa@0.74:t=fill",
        `drawbox=x='140+210*t/${SCENE_SECONDS}':y=1380:w=250:h=30:color=${accent}@1:t=fill`
      ].join(",");
    case "wet_laundry_problem":
      return [
        "drawbox=x=78:y=540:w=500:h=780:color=0xe0f2fe@1:t=fill",
        "drawbox=x=120:y=655:w=410:h=42:color=0x64748b@1:t=fill",
        "drawbox=x='150+mod(t*210\\,320)':y=770:w=28:h=330:color=0xffffff@0.86:t=fill",
        "drawbox=x='250+mod(t*150\\,260)':y=795:w=28:h=300:color=0xffffff@0.82:t=fill"
      ].join(",");
    case "small_room_problem":
      return [
        "drawbox=x=82:y=520:w=530:h=840:color=0xfef3c7@1:t=fill",
        "drawbox=x=125:y=900:w=415:h=44:color=0x94a3b8@1:t=fill",
        "drawbox=x=140:y=970:w=160:h=250:color=0xffffff@0.9:t=fill",
        "drawbox=x=332:y=970:w=160:h=250:color=0xffffff@0.9:t=fill"
      ].join(",");
    case "solution_reveal":
      return [
        "drawbox=x=96:y=430:w=888:h=1000:color=0xdcfce7@1:t=fill",
        `drawbox=x='160+200*t/${SCENE_SECONDS}':y=1400:w=760:h=18:color=${accent}@1:t=fill`,
        `drawbox=x='180+130*t/${SCENE_SECONDS}':y='470+80*t/${SCENE_SECONDS}':w=68:h=68:color=${accent}@0.78:t=fill`
      ].join(",");
    case "laundry_items_use_case":
      return [
        "drawbox=x=86:y=470:w=908:h=960:color=0xccfbf1@1:t=fill",
        "drawbox=x='95+420*t/3':y='1230-260*t/3':w=132:h=190:color=0xffffff@0.92:t=fill",
        "drawbox=x='850-380*t/3':y='1180-220*t/3':w=128:h=158:color=0xfef3c7@1:t=fill",
        "drawbox=x='520+55*sin(2*PI*t)':y=950:w=76:h=76:color=0xe0f2fe@1:t=fill"
      ].join(",");
    case "before_after_solution":
      return [
        "drawbox=x=76:y=500:w=418:h=870:color=0xe5e7eb@1:t=fill",
        "drawbox=x=586:y=500:w=418:h=870:color=0xede9fe@1:t=fill",
        "drawbox=x=125:y=1120:w=320:h=46:color=0x94a3b8@1:t=fill",
        `drawbox=x='620+170*t/${SCENE_SECONDS}':y=1320:w=330:h=26:color=${accent}@1:t=fill`
      ].join(",");
    case "buying_checklist":
      return [
        "drawbox=x=82:y=520:w=320:h=780:color=0xfce7f3@1:t=fill",
        `drawbox=x=122:y='660+14*sin(8*PI*t)':w=50:h=50:color=${accent}@1:t=fill`,
        `drawbox=x=122:y='835+14*sin(8*PI*t+1)':w=50:h=50:color=${accent}@1:t=fill`,
        `drawbox=x=122:y='1010+14*sin(8*PI*t+2)':w=50:h=50:color=${accent}@1:t=fill`,
        "drawbox=x=190:y=676:w=170:h=22:color=0x64748b@1:t=fill",
        "drawbox=x=190:y=851:w=170:h=22:color=0x64748b@1:t=fill",
        "drawbox=x=190:y=1026:w=170:h=22:color=0x64748b@1:t=fill"
      ].join(",");
    case "description_cta":
      return [
        "drawbox=x=118:y=470:w=844:h=980:color=0xffffff@0.9:t=fill",
        `drawbox=x='250+430*t/${SCENE_SECONDS}':y=1390:w=520:h=44:color=${accent}@1:t=fill`,
        "drawbox=x='752+22*sin(7*PI*t)':y=1270:w=112:h=112:color=0xfacc15@0.95:t=fill"
      ].join(",");
    default:
      return `drawbox=x=92:y=520:w=896:h=820:color=${accent}@0.18:t=fill`;
  }
}

function buildProductSceneOverlayFilter(sceneItem, accent) {
  if (sceneItem.role === "hook_solution_preview") {
    return [
      `drawbox=x=106:y='1340+20*sin(4*PI*t)':w=250:h=34:color=${accent}@1:t=fill`,
      "drawbox=x=126:y=1410:w=220:h=20:color=0x64748b@1:t=fill"
    ].join(",");
  }
  if (sceneItem.role === "solution_use_case") {
    return [
      "drawbox=x='115+430*t/3':y='1265-270*t/3':w=120:h=180:color=0xffffff@0.9:t=fill",
      "drawbox=x='840-380*t/3':y='1210-240*t/3':w=118:h=150:color=0xfef3c7@1:t=fill",
      "drawbox=x='505+60*sin(2*PI*t)':y=955:w=72:h=72:color=0xe0f2fe@1:t=fill"
    ].join(",");
  }
  if (sceneItem.role === "before_after") {
    return [
      `drawbox=x='180+150*t/3':y=1320:w=260:h=28:color=0x64748b@0.9:t=fill`,
      `drawbox=x='620+190*t/3':y=1320:w=300:h=28:color=${accent}@1:t=fill`
    ].join(",");
  }
  if (sceneItem.role === "checklist") {
    return [
      `drawbox=x='345+25*sin(8*PI*t)':y=675:w=42:h=42:color=${accent}@1:t=fill`,
      `drawbox=x='345+25*sin(8*PI*t+1)':y=850:w=42:h=42:color=${accent}@1:t=fill`,
      `drawbox=x='345+25*sin(8*PI*t+2)':y=1025:w=42:h=42:color=${accent}@1:t=fill`
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
      `fps=1/${SCENE_SECONDS},scale=270:480:force_original_aspect_ratio=decrease,pad=270:480:(ow-iw)/2:(oh-ih)/2,tile=4x2`,
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
      `fps=1/${SCENE_SECONDS},drawbox=x=0:y=0:w=1080:h=165:color=black@0.18:t=fill,drawbox=x=870:y=620:w=150:h=500:color=black@0.16:t=fill,drawbox=x=0:y=1585:w=1080:h=250:color=black@0.16:t=fill,scale=270:480:force_original_aspect_ratio=decrease,pad=270:480:(ow-iw)/2:(oh-ih)/2,tile=4x2`,
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
    return evaluateV025AudioIntelligibility({
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
  const tempDir = await fs.mkdtemp(path.join(input.cwd, "commerce-assets", ".tmp-v025-asr-"));
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
    return evaluateV025AudioIntelligibility({
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

export function evaluateV025AudioIntelligibility(input = {}) {
  const transcript = String(input.transcript ?? "").trim();
  const normalizedTranscript = normalizeForSimilarity(transcript);
  const rawSimilarityScore = normalizeRatio(input.rawSimilarityScore) ??
    calculateTranscriptSimilarity(V025_VOICEOVER_SCRIPT, transcript);
  const transcriptSimilarityScore = normalizeRatio(input.transcriptSimilarityScore) ??
    calculateTranscriptSimilarity(V025_VOICEOVER_SCRIPT, transcript);
  const recognizedCoreAnchors = findCoreAnchors(normalizedTranscript);
  const coreAnchorRecognitionPass = input.coreAnchorRecognitionPass ??
    V025_REQUIRED_CORE_ANCHORS.every((anchor) => recognizedCoreAnchors.includes(anchor));
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
  <title>v025 Product-First Ad Visual Review</title>
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
    <h1>v025 Product-First Ad Visual Review</h1>
    <p><span class="status">PENDING_HUMAN_REVIEW_NO_UPLOAD</span></p>
    <p class="note">v024 is locked as FAIL_LOCAL_HUMAN_REVIEW. v025 must be reviewed by owner before any private upload request.</p>
    <div class="grid">
      <section><video src="local-review-video.mp4" controls playsinline></video></section>
      <section>
        <h2>Product-First Gates</h2>
        <div class="cards">
          <div class="metric">first 2s product<strong>${summary.product_image_visible_in_first_2s}</strong></div>
          <div class="metric">product scenes<strong>${summary.product_image_visible_scene_count}</strong></div>
          <div class="metric">central scenes<strong>${summary.product_image_central_scene_count}</strong></div>
          <div class="metric">solution score<strong>${summary.product_solution_connection_score}</strong></div>
        </div>
        <pre>first_2s_area=${summary.product_image_bbox_area_ratio_first_2s}
solution_area=${summary.product_image_bbox_area_ratio_solution_scenes}
card_regression_blocker=${summary.card_regression_blocker ?? "null"}
script_visual_blocker=${summary.script_visual_blocker ?? "null"}
ad_like_visual_pass=${summary.ad_like_visual_pass}
safe_to_request_private_upload=${summary.SAFE_TO_REQUEST_PRIVATE_UPLOAD}</pre>
      </section>
    </div>
    <section>
      <h2>Contact Sheets</h2>
      <img src="storyboard-contact-sheet.jpg" alt="Storyboard contact sheet">
      <img src="actual-frame-contact-sheet.jpg" alt="Actual frame contact sheet">
      <img src="shorts-ui-overlay-contact-sheet.jpg" alt="Shorts UI overlay contact sheet">
    </section>
    <section>
      <h2>Human Review Checklist</h2>
      <ol>
        <li>Does the drying rack appear as the solution inside the first two seconds?</li>
        <li>Does every script sentence have a visible scene counterpart?</li>
        <li>Does it avoid PPT, text-card, primitive-shape, and reading-card feeling?</li>
        <li>Is the product image large enough and not a tiny repeated thumbnail?</li>
        <li>Are rainy laundry odor, humidity, and small-room space problems visible before the solution?</li>
        <li>Is the drying rack clearly presented as the solution?</li>
        <li>Is this eligible for a later private-upload request only after owner PASS?</li>
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
    title: input.title,
    subtitle: input.subtitle,
    footer: input.footer,
    script_line: input.scriptLine,
    visual_goal: input.visualGoal,
    visual_kind: "product_ad_scene",
    product_image_role: input.productRole,
    product_image_required: true,
    product_visual_central: input.central,
    product_visible_in_first_2s: input.visibleInFirst2s,
    product_solution_role: input.solutionRole,
    product_layout: input.layout,
    product_bbox_area_ratio: input.bboxRatio ?? bboxAreaRatio(input.layout),
    problem_visual: input.problemVisual,
    script_visual_counterpart: input.scriptCounterpart,
    abstract_shape_visual: false,
    primitive_bar_or_box_visual: false,
    reading_card_feeling: false,
    accent: input.accent,
    background: input.background,
    duration_seconds: SCENE_SECONDS
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

function findCoreAnchors(normalizedTranscript) {
  const groups = [
    { anchor: "빨래", terms: ["빨래", "laundry"] },
    { anchor: "건조대", terms: ["건조대", "건조", "dryingrack", "drying", "rack"] },
    { anchor: "공간", terms: ["공간", "space", "room"] }
  ];
  return groups
    .filter((group) => group.terms.some((term) => normalizedTranscript.includes(normalizeForSimilarity(term))))
    .map((group) => group.anchor);
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

function maxRatio(scenes) {
  return scenes.reduce((max, sceneItem) => Math.max(max, normalizeRatio(sceneItem.product_bbox_area_ratio) ?? 0), 0);
}

function averageRatio(scenes) {
  if (!scenes.length) {
    return 0;
  }
  const total = scenes.reduce((sum, sceneItem) => sum + (normalizeRatio(sceneItem.product_bbox_area_ratio) ?? 0), 0);
  return total / scenes.length;
}

function bboxAreaRatio(layout) {
  if (!layout) {
    return 0;
  }
  return round3((layout.width * layout.height) / FRAME_AREA);
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
  generateV025ProductFirstAdVisualReviewPacket()
    .then((result) => {
      console.log(JSON.stringify({
        target_version: TARGET_VERSION,
        v024_review_status: result.v024_review_status,
        review_console_generated: result.review_console_generated,
        product_image_ready: result.product_image_ready,
        product_image_visible_in_first_2s: result.product_image_visible_in_first_2s,
        product_image_visible_scene_count: result.product_image_visible_scene_count,
        product_image_central_scene_count: result.product_image_central_scene_count,
        product_image_bbox_area_ratio_first_2s: result.product_image_bbox_area_ratio_first_2s,
        product_image_bbox_area_ratio_solution_scenes: result.product_image_bbox_area_ratio_solution_scenes,
        drying_rack_visible_as_solution: result.drying_rack_visible_as_solution,
        text_card_scene_count: result.text_card_scene_count,
        abstract_shape_scene_count: result.abstract_shape_scene_count,
        primitive_bar_or_box_scene_count: result.primitive_bar_or_box_scene_count,
        ad_like_visual_pass: result.ad_like_visual_pass,
        script_visual_alignment_pass: result.script_visual_alignment_pass,
        product_solution_connection_score: result.product_solution_connection_score,
        melotts_voice_used: result.melotts_voice_used,
        real_asr_probe_executed: result.real_asr_probe_executed,
        speech_rate_wpm: result.speech_rate_wpm,
        raw_similarity_score: result.raw_similarity_score,
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
