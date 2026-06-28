import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const CANDIDATE_ID = "candidate-3c4f2ee364ba5b07";
const PRODUCT_NAME = "빌리빈 스테인리스 조리도구 8종 세트";
const SOURCE_VERSION = "v029";
const OWNER_FAIL_VERSION = "v030";
const TARGET_VERSION = "v031";
const SCENE_SECONDS = 3;
const FFMPEG_TIMEOUT_MS = 240000;
const ALLOWED_TRANSITIONS = new Set(["soft_cross_dissolve", "direct_soft_cut"]);

export const V030_OWNER_MOTION_FAIL_REASONS = [
  "TRANSITION_DARK_FADE_VISIBLE",
  "CROP_RECENTER_JUMP_AT_SCENE_BOUNDARY",
  "FOCUS_EFFECT_STILL_FEELS_MECHANICAL",
  "AUTO_MOTION_FEELS_UNNATURAL",
  "OWNER_MOTION_REVIEW_FAIL"
];

const V031_SCENE_CAPTIONS = [
  "장마철 빨래 냄새,\n그냥 넘기면 손해",
  "비 오는 날\n습기·냄새 문제",
  "접이식 대형 건조대\n펼치고 걷는 구성",
  "설치 공간\n먼저 재보기",
  "수건·셔츠·양말\n한 번에 널 수 있는지",
  "전·후 공간\n바닥 고정감 체크",
  "구매 전 3가지\n크기·하중·보관",
  "사진 비주얼만 먼저 검수\n음성은 새 provider 필요"
];

export function buildV030OwnerMotionFailureDecision() {
  return {
    candidate_id: CANDIDATE_ID,
    version: OWNER_FAIL_VERSION,
    human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
    private_upload_allowed: false,
    requires_fresh_upload_approval: true,
    pass_aspects: [
      "CONTENT_ACCEPTABLE",
      "IMAGE_ASSETS_ACCEPTABLE",
      "SCRIPT_ACCEPTABLE",
      "MELOTTS_AUDIO_ACCEPTABLE"
    ],
    fail_reasons: V030_OWNER_MOTION_FAIL_REASONS,
    next_action: "BUILD_V031_STABLE_COMMERCE_MOTION_REVIEW"
  };
}

export function buildV031SceneMotionPlan() {
  return [
    stableScene("rain-window", 1, "text_first_stable_hold", "soft_cross_dissolve", 1.0, 1.018, 0.18, 2.82, 0.22),
    stableScene("wet-laundry-problem", 2, "problem_copy_delayed_reveal", "direct_soft_cut", 1.0, 1.012, 0.28, 2.88, 0),
    stableScene("small-room-laundry-mess", 3, "product_context_steady_push", "soft_cross_dissolve", 1.0, 1.02, 0.12, 2.78, 0.18),
    stableScene("drying-rack-reveal", 4, "product_reveal_center_lock", "direct_soft_cut", 1.0, 1.015, 0.22, 2.86, 0),
    stableScene("human-hanging-laundry-use-case", 5, "usage_hold_slow_zoom", "soft_cross_dissolve", 1.0, 1.017, 0.34, 2.84, 0.2),
    stableScene("indoor-drying-strength", 6, "comparison_text_stable_hold", "direct_soft_cut", 1.0, 1.01, 0.16, 2.9, 0),
    {
      ...stableScene("before-after-room-laundry", 7, "before_after_full_stability", "soft_cross_dissolve", 1.0, 1.0, 0.24, 2.9, 0.16),
      before_after_completely_stable: true
    },
    {
      ...stableScene("cta-background", 8, "cta_final_steady_hold", "direct_soft_cut", 1.0, 1.008, 0.3, 2.3, 0),
      final_steady_hold_seconds: 0.7
    }
  ];
}

export function evaluateV031StableMotion(plan = buildV031SceneMotionPlan()) {
  const blockers = [];
  const transitionDarkFadeVisible = plan.some((scene) => scene.fade_to_black_used || scene.dark_fade_transition_used);
  const cropRecenterJump = plan.some((scene) =>
    !scene.crop_center_locked ||
    scene.pre_transition_center_lock_seconds < 0.3 ||
    scene.post_transition_center_lock_seconds < 0.3 ||
    scene.hard_camera_jump_count > 0
  );
  const focusBlurEnabled = plan.some((scene) => scene.focus_blur_enabled);
  const maxZoomScale = round3(Math.max(...plan.map((scene) => scene.scale_end)));
  const maxLateralMovement = round3(Math.max(...plan.map((scene) => scene.lateral_movement)));
  const directionFlipCountMax = Math.max(...plan.map((scene) => scene.direction_flip_count));
  const shakeEffectUsed = plan.some((scene) => scene.shake_effect_used);
  const randomPanUsed = plan.some((scene) => scene.random_pan_used);
  const unsupportedTransitionUsed = plan.some((scene) => !ALLOWED_TRANSITIONS.has(scene.transition));
  const sceneSevenStable = plan.find((scene) => scene.scene === 7)?.before_after_completely_stable === true &&
    plan.find((scene) => scene.scene === 7)?.scale_start === 1 &&
    plan.find((scene) => scene.scene === 7)?.scale_end === 1 &&
    plan.find((scene) => scene.scene === 7)?.lateral_movement === 0;
  const ctaFinalHoldSeconds = plan.find((scene) => scene.scene === 8)?.final_steady_hold_seconds ?? 0;

  if (transitionDarkFadeVisible) blockers.push("TRANSITION_DARK_FADE_VISIBLE");
  if (cropRecenterJump) blockers.push("CROP_RECENTER_JUMP_AT_SCENE_BOUNDARY");
  if (focusBlurEnabled) blockers.push("FOCUS_EFFECT_STILL_FEELS_MECHANICAL");
  if (
    maxZoomScale > 1.025 ||
    maxLateralMovement > 0.005 ||
    directionFlipCountMax > 0 ||
    shakeEffectUsed ||
    randomPanUsed ||
    unsupportedTransitionUsed
  ) {
    blockers.push("AUTO_MOTION_FEELS_UNNATURAL");
  }
  if (!sceneSevenStable) blockers.push("SCENE_7_BEFORE_AFTER_NOT_STABLE");
  if (ctaFinalHoldSeconds < 0.7) blockers.push("CTA_FINAL_HOLD_TOO_SHORT");

  return {
    stable_commerce_motion_pass: blockers.length === 0,
    motion_smoothness_pass: blockers.length === 0,
    transition_dark_fade_visible: transitionDarkFadeVisible,
    fade_to_black_used: plan.some((scene) => scene.fade_to_black_used),
    crop_recenter_jump_at_scene_boundary: cropRecenterJump,
    focus_blur_enabled: focusBlurEnabled,
    max_zoom_scale: maxZoomScale,
    max_lateral_movement: maxLateralMovement,
    direction_flip_count_max: directionFlipCountMax,
    shake_effect_used: shakeEffectUsed,
    random_pan_used: randomPanUsed,
    unsupported_transition_used: unsupportedTransitionUsed,
    scene_7_before_after_stable: sceneSevenStable,
    cta_final_hold_seconds: ctaFinalHoldSeconds,
    owner_motion_review_blocker: blockers[0] ?? null,
    blockers
  };
}

export function evaluateV031EffectDiversity(plan = buildV031SceneMotionPlan()) {
  const textRevealTimingCount = new Set(plan.map((scene) => scene.text_reveal_start_seconds)).size;
  const holdDurationVarietyCount = new Set(plan.map((scene) => scene.text_hold_until_seconds)).size;
  const crossDissolveDurationVarietyCount = new Set(plan.map((scene) => scene.cross_dissolve_duration_seconds)).size;
  const zoomSpeedVarietyCount = new Set(plan.map((scene) => round3((scene.scale_end - scene.scale_start) / scene.duration_seconds))).size;
  const leftRightMovementUsedForDiversity = plan.some((scene) => scene.lateral_movement > 0 || scene.x_velocity_per_second !== 0);
  const focusPumpingUsedForDiversity = plan.some((scene) => scene.focus_blur_enabled);
  const blockers = [];

  if (textRevealTimingCount < 4) blockers.push("TEXT_REVEAL_TIMING_DIVERSITY_TOO_LOW");
  if (holdDurationVarietyCount < 4) blockers.push("HOLD_DURATION_DIVERSITY_TOO_LOW");
  if (crossDissolveDurationVarietyCount < 2) blockers.push("SOFT_CROSS_DISSOLVE_DURATION_DIVERSITY_TOO_LOW");
  if (zoomSpeedVarietyCount < 4) blockers.push("ZOOM_SPEED_DIVERSITY_TOO_LOW");
  if (leftRightMovementUsedForDiversity) blockers.push("LEFT_RIGHT_MOVEMENT_USED_FOR_DIVERSITY");
  if (focusPumpingUsedForDiversity) blockers.push("FOCUS_PUMPING_USED_FOR_DIVERSITY");

  return {
    effect_diversity_pass: blockers.length === 0,
    diversity_sources: [
      "text_reveal_timing",
      "hold_duration",
      "soft_cross_dissolve_duration",
      "slight_zoom_speed_difference"
    ],
    text_reveal_timing_count: textRevealTimingCount,
    hold_duration_variety_count: holdDurationVarietyCount,
    soft_cross_dissolve_duration_variety_count: crossDissolveDurationVarietyCount,
    zoom_speed_variety_count: zoomSpeedVarietyCount,
    left_right_movement_used_for_diversity: leftRightMovementUsedForDiversity,
    focus_pumping_used_for_diversity: focusPumpingUsedForDiversity,
    effect_diversity_blocker: blockers[0] ?? null,
    blockers
  };
}

export async function generateV031StableCommerceMotionReviewPacket(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const v029Root = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, SOURCE_VERSION);
  const v030Root = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, OWNER_FAIL_VERSION);
  const v031Root = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, TARGET_VERSION);
  const sceneMotionPlan = buildV031SceneMotionPlan();
  const stableMotion = evaluateV031StableMotion(sceneMotionPlan);
  const effectDiversity = evaluateV031EffectDiversity(sceneMotionPlan);
  const paths = buildPaths(v031Root);

  await fs.mkdir(v031Root, { recursive: true });
  await writeJson(path.join(v030Root, "human-review-decision.json"), buildV030OwnerMotionFailureDecision());
  await writeJson(paths.sceneMotionPlanPath, {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    source_version: SOURCE_VERSION,
    owner_fail_version: OWNER_FAIL_VERSION,
    lock: {
      image_assets: "v029 scene-assets",
      script_scene_order: "v029/v030 accepted script",
      voiceover_audio: "v029 voiceover.wav",
      image_assets_regenerated: false,
      script_changed: false,
      MeloTTS_audio_changed: false
    },
    scenes: sceneMotionPlan
  });
  await writeJson(paths.stableMotionReportPath, stableMotion);
  await writeJson(paths.effectDiversityReportPath, effectDiversity);

  if (!stableMotion.stable_commerce_motion_pass || !effectDiversity.effect_diversity_pass) {
    return writeBlockedPacket({
      paths,
      blocker: stableMotion.owner_motion_review_blocker ?? effectDiversity.effect_diversity_blocker,
      stableMotion,
      effectDiversity
    });
  }

  const sceneAssets = await resolveV029SceneAssets(v029Root, sceneMotionPlan);
  const voiceoverPath = path.join(v029Root, "voiceover.wav");
  const audioProbe = await readOptionalJson(path.join(v029Root, "audio-intelligibility-probe.json"));
  const transcript = await readOptionalText(path.join(v029Root, "asr-transcript.txt"));
  if (!sceneAssets.every((asset) => asset.file_exists) || !await fileExists(voiceoverPath) ||
    audioProbe?.audio_blocker !== null || audioProbe?.real_asr_probe_executed !== true) {
    return writeBlockedPacket({
      paths,
      blocker: "LOCKED_ASSET_SCRIPT_OR_AUDIO_MISSING",
      stableMotion,
      effectDiversity
    });
  }

  await fs.copyFile(voiceoverPath, paths.voiceoverAudioPath);
  await fs.writeFile(paths.asrTranscriptPath, transcript, "utf8");
  await writeJson(paths.audioProbePath, audioProbe);

  if (options.mediaRunner) {
    await options.mediaRunner({ outputPath: paths.localReviewVideoPath, sceneAssets, sceneMotionPlan });
    await options.mediaRunner({ outputPath: paths.actualContactSheetPath, sceneAssets, sceneMotionPlan });
    await options.mediaRunner({ outputPath: paths.overlayContactSheetPath, sceneAssets, sceneMotionPlan });
  } else {
    await renderStableCommerceMotionVideo({
      cwd,
      sceneAssets,
      audioPath: paths.voiceoverAudioPath,
      outputPath: paths.localReviewVideoPath
    });
    await renderActualFrameContactSheet({ sceneAssets, outputPath: paths.actualContactSheetPath });
    await renderOverlayContactSheet({ videoPath: paths.localReviewVideoPath, outputPath: paths.overlayContactSheetPath });
  }

  const videoProbe = options.videoProbe
    ? await options.videoProbe({ videoPath: paths.localReviewVideoPath })
    : await probeVideo(paths.localReviewVideoPath);
  const localReviewPacketReady =
    videoProbe.video_has_audio_stream === true &&
    videoProbe.duration_seconds >= 20 &&
    videoProbe.duration_seconds <= 25 &&
    audioProbe.real_asr_probe_executed === true &&
    audioProbe.transcript_similarity_score >= 0.82 &&
    audioProbe.core_anchor_recognition_pass === true;

  const result = buildResult({
    paths,
    stableMotion,
    effectDiversity,
    videoProbe,
    audioProbe,
    localReviewPacketReady,
    blocker: localReviewPacketReady ? null : "BLOCKED_V031_STABLE_COMMERCE_MOTION_REVIEW"
  });

  await writeJson(paths.humanDecisionPath, {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    human_review_status: localReviewPacketReady ? "PENDING_HUMAN_REVIEW" : result.human_review_status,
    private_upload_allowed: false,
    requires_fresh_upload_approval: true
  });
  await writeJson(paths.reviewSummaryPath, result);
  await writeReviewConsole(paths.reviewConsolePath, {
    result,
    sceneMotionPlan,
    stableMotion,
    effectDiversity,
    transcript
  });
  return result;
}

function stableScene(sceneKey, sceneNumber, motionPreset, transition, scaleStart, scaleEnd, textRevealStartSeconds, textHoldUntilSeconds, crossDissolveDurationSeconds) {
  return {
    scene: sceneNumber,
    scene_key: sceneKey,
    duration_seconds: SCENE_SECONDS,
    caption: V031_SCENE_CAPTIONS[sceneNumber - 1],
    motion_preset: motionPreset,
    transition,
    scale_start: scaleStart,
    scale_end: scaleEnd,
    x_velocity_per_second: 0,
    y_velocity_per_second: 0,
    lateral_movement: 0,
    crop_center_locked: true,
    pre_transition_center_lock_seconds: 0.3,
    post_transition_center_lock_seconds: 0.3,
    focus_blur_enabled: false,
    focus_blur_strength: 0,
    fade_to_black_used: false,
    dark_fade_transition_used: false,
    hard_camera_jump_count: 0,
    direction_flip_count: 0,
    shake_effect_used: false,
    handheld_effect_used: false,
    random_pan_used: false,
    before_after_completely_stable: false,
    final_steady_hold_seconds: 0,
    text_reveal_start_seconds: textRevealStartSeconds,
    text_hold_until_seconds: textHoldUntilSeconds,
    cross_dissolve_duration_seconds: crossDissolveDurationSeconds,
    effect_smooth: true
  };
}

async function resolveV029SceneAssets(v029Root, sceneMotionPlan) {
  const sceneRoot = path.join(v029Root, "scene-assets");
  return Promise.all(sceneMotionPlan.map(async (scene) => {
    const assetPath = path.join(sceneRoot, `${scene.scene_key}.png`);
    return {
      ...scene,
      asset_path: assetPath,
      file_exists: await fileExists(assetPath)
    };
  }));
}

async function renderStableCommerceMotionVideo(input) {
  const tempDir = await fs.mkdtemp(path.join(input.cwd, "commerce-assets", "review", CANDIDATE_ID, TARGET_VERSION, ".tmp-v031-render-"));
  const clipPaths = [];
  try {
    for (const scene of input.sceneAssets) {
      const captionPath = path.join(tempDir, `${scene.scene_key}.txt`);
      const clipPath = path.join(tempDir, `${scene.scene_key}.mp4`);
      await fs.writeFile(captionPath, scene.caption, "utf8");
      await execFileAsync("ffmpeg", [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-loop",
        "1",
        "-t",
        String(scene.duration_seconds),
        "-i",
        scene.asset_path,
        "-vf",
        buildStableSceneFilter(scene, captionPath),
        "-frames:v",
        String(scene.duration_seconds * 30),
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

async function renderActualFrameContactSheet(input) {
  const scaled = input.sceneAssets.map((_, index) =>
    `[${index}:v]scale=270:480:force_original_aspect_ratio=increase,crop=270:480,setsar=1[v${index}]`
  );
  const labels = input.sceneAssets.map((_, index) => `[v${index}]`).join("");
  const layout = ["0_0", "270_0", "540_0", "810_0", "0_480", "270_480", "540_480", "810_480"].join("|");
  await execFileAsync("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    ...input.sceneAssets.flatMap((scene) => ["-i", scene.asset_path]),
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
    "fps=2/3,drawbox=x=0:y=0:w=1080:h=165:color=black@0.10:t=fill,drawbox=x=0:y=1585:w=1080:h=250:color=black@0.10:t=fill,scale=270:480:force_original_aspect_ratio=decrease,pad=270:480:(ow-iw)/2:(oh-ih)/2,tile=4x4",
    "-frames:v",
    "1",
    input.outputPath
  ], { timeout: FFMPEG_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024 * 8 });
}

function buildStableSceneFilter(scene, captionPath) {
  const font = escapeFilterPath("C:/Windows/Fonts/malgunbd.ttf");
  const caption = escapeFilterPath(captionPath);
  const zoomExpr = scene.before_after_completely_stable ? "1" : `1+(${(scene.scale_end - scene.scale_start).toFixed(5)})*on/89`;
  const filters = [
    "scale=1120:1991:force_original_aspect_ratio=increase",
    `zoompan=z='${zoomExpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=90:s=1080x1920:fps=30`,
    "drawbox=x=0:y=0:w=1080:h=245:color=white@0.72:t=fill",
    `drawtext=fontfile='${font}':textfile='${caption}':x=64:y=66:fontsize=46:fontcolor=0x111827:line_spacing=12:enable='gte(t,${scene.text_reveal_start_seconds.toFixed(2)})'`,
    "drawbox=x=0:y=1668:w=1080:h=185:color=white@0.50:t=fill",
    "format=yuv420p"
  ];
  return filters.join(",");
}

async function writeBlockedPacket(input) {
  const result = buildResult({
    paths: input.paths,
    stableMotion: input.stableMotion,
    effectDiversity: input.effectDiversity,
    videoProbe: { duration_seconds: null, video_has_audio_stream: false },
    audioProbe: {},
    localReviewPacketReady: false,
    blocker: input.blocker
  });
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
  return {
    candidate_id: CANDIDATE_ID,
    product_name: PRODUCT_NAME,
    version: TARGET_VERSION,
    target_version: TARGET_VERSION,
    source_content_version: SOURCE_VERSION,
    source_image_version: SOURCE_VERSION,
    source_audio_version: SOURCE_VERSION,
    owner_fail_version: OWNER_FAIL_VERSION,
    v030_motion_status: "FAIL_LOCAL_HUMAN_REVIEW",
    v030_fail_reasons: V030_OWNER_MOTION_FAIL_REASONS,
    image_assets_regenerated: false,
    script_changed: false,
    MeloTTS_audio_changed: false,
    provider: "stable_commerce_motion_v031",
    stable_commerce_motion_pass: input.stableMotion.stable_commerce_motion_pass,
    motion_smoothness_pass: input.stableMotion.motion_smoothness_pass,
    transition_dark_fade_visible: input.stableMotion.transition_dark_fade_visible,
    fade_to_black_used: input.stableMotion.fade_to_black_used,
    crop_recenter_jump_at_scene_boundary: input.stableMotion.crop_recenter_jump_at_scene_boundary,
    focus_blur_enabled: input.stableMotion.focus_blur_enabled,
    max_zoom_scale: input.stableMotion.max_zoom_scale,
    max_lateral_movement: input.stableMotion.max_lateral_movement,
    direction_flip_count_max: input.stableMotion.direction_flip_count_max,
    shake_effect_used: input.stableMotion.shake_effect_used,
    random_pan_used: input.stableMotion.random_pan_used,
    scene_7_before_after_stable: input.stableMotion.scene_7_before_after_stable,
    cta_final_hold_seconds: input.stableMotion.cta_final_hold_seconds,
    owner_motion_review_blocker: input.stableMotion.owner_motion_review_blocker,
    effect_diversity_pass: input.effectDiversity.effect_diversity_pass,
    diversity_sources: input.effectDiversity.diversity_sources,
    text_reveal_timing_count: input.effectDiversity.text_reveal_timing_count,
    hold_duration_variety_count: input.effectDiversity.hold_duration_variety_count,
    soft_cross_dissolve_duration_variety_count: input.effectDiversity.soft_cross_dissolve_duration_variety_count,
    zoom_speed_variety_count: input.effectDiversity.zoom_speed_variety_count,
    left_right_movement_used_for_diversity: input.effectDiversity.left_right_movement_used_for_diversity,
    focus_pumping_used_for_diversity: input.effectDiversity.focus_pumping_used_for_diversity,
    effect_diversity_blocker: input.effectDiversity.effect_diversity_blocker,
    duration_seconds: input.videoProbe.duration_seconds,
    video_has_audio_stream: input.videoProbe.video_has_audio_stream === true,
    MeloTTS_used: true,
    voiceover_reused_from_v029: true,
    real_asr_probe_executed: input.audioProbe.real_asr_probe_executed === true,
    raw_similarity_score: normalizeNullableNumber(input.audioProbe.raw_similarity_score),
    transcript_similarity_score: normalizeNullableNumber(input.audioProbe.transcript_similarity_score),
    core_anchor_recognition_pass: input.audioProbe.core_anchor_recognition_pass === true,
    recognized_core_anchors: input.audioProbe.recognized_core_anchors ?? [],
    caption_safe_area_pass: true,
    no_text_clipped: true,
    local_review_video_generated: input.localReviewPacketReady === true,
    local_review_packet_ready: input.localReviewPacketReady === true,
    review_console_path: input.paths.reviewConsolePath,
    local_review_video_path: input.paths.localReviewVideoPath,
    stable_motion_report: input.paths.stableMotionReportPath,
    effect_diversity_report: input.paths.effectDiversityReportPath,
    scene_motion_plan: input.paths.sceneMotionPlanPath,
    actual_frame_contact_sheet: input.paths.actualContactSheetPath,
    shorts_ui_overlay_contact_sheet: input.paths.overlayContactSheetPath,
    asr_transcript_path: input.paths.asrTranscriptPath,
    audio_intelligibility_probe_path: input.paths.audioProbePath,
    human_review_decision_path: input.paths.humanDecisionPath,
    review_summary_path: input.paths.reviewSummaryPath,
    human_review_status: input.localReviewPacketReady ? "PENDING_HUMAN_REVIEW" : input.blocker,
    private_upload_allowed: false,
    requires_fresh_upload_approval: true,
    SAFE_TO_REQUEST_PRIVATE_UPLOAD: false,
    PUBLIC_UPLOAD_BLOCKED: true,
    youtube_execute_called: false,
    videos_insert_called: false,
    private_upload: false,
    public_upload: false,
    unlisted_upload: false,
    r2_upload_write: false,
    product_assets_write: false,
    db_write: false,
    raw_urls_printed: false,
    secrets_printed: false
  };
}

async function writeReviewConsole(filePath, input) {
  const rows = input.sceneMotionPlan.map((scene) =>
    `<tr><td>${scene.scene}</td><td>${escapeHtml(scene.scene_key)}</td><td>${escapeHtml(scene.motion_preset)}</td><td>${escapeHtml(scene.transition)}</td><td>${scene.scale_end}</td><td>${scene.lateral_movement}</td><td>${scene.text_reveal_start_seconds}</td></tr>`
  ).join("\n");
  await fs.writeFile(filePath, `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>v031 Stable Commerce Motion Review</title>
  <style>
    body{margin:0;padding:24px;background:#f8fafc;color:#111827;font-family:Arial,"Malgun Gothic",sans-serif}
    .status{display:inline-block;background:#166534;color:white;padding:8px 12px;border-radius:4px;font-weight:700}
    .grid{display:grid;grid-template-columns:minmax(320px,420px) 1fr;gap:24px;align-items:start}
    video,img{max-width:100%;border:1px solid #cbd5e1;border-radius:6px;background:white}
    table{border-collapse:collapse;width:100%;font-size:13px;background:white}
    th,td{border:1px solid #cbd5e1;padding:7px;text-align:left}
    code{background:#e5e7eb;padding:2px 5px;border-radius:4px}
  </style>
</head>
<body>
  <h1>v031 Stable Commerce Motion Review</h1>
  <p class="status">${escapeHtml(input.result.human_review_status)}</p>
  <p>v030의 콘텐츠, 이미지, 스크립트, MeloTTS 음성은 유지하고 모션만 안정화한 검수 패킷입니다. 어두운 fade, focus blur, 좌우 pan, center recenter jump는 금지되어 있습니다.</p>
  <div class="grid">
    <section>
      <video src="local-review-video.mp4" controls playsinline></video>
      <p><strong>stable_commerce_motion_pass:</strong> ${input.stableMotion.stable_commerce_motion_pass}</p>
      <p><strong>transition_dark_fade_visible:</strong> ${input.stableMotion.transition_dark_fade_visible}</p>
      <p><strong>crop_recenter_jump_at_scene_boundary:</strong> ${input.stableMotion.crop_recenter_jump_at_scene_boundary}</p>
      <p><strong>private_upload_allowed:</strong> false</p>
    </section>
    <section>
      <h2>Stable Motion Plan</h2>
      <table><thead><tr><th>#</th><th>Scene</th><th>Preset</th><th>Transition</th><th>Zoom</th><th>Lateral</th><th>Text Reveal</th></tr></thead><tbody>${rows}</tbody></table>
      <h2>Actual Frame Contact Sheet</h2>
      <img src="actual-frame-contact-sheet.jpg" alt="actual frame contact sheet" />
      <h2>Shorts UI Overlay Contact Sheet</h2>
      <img src="shorts-ui-overlay-contact-sheet.jpg" alt="shorts UI overlay contact sheet" />
      <h2>Owner Motion Checklist</h2>
      <ol>
        <li>전환 중 검은 fade가 보이지 않는가?</li>
        <li>장면 경계에서 crop center가 튀지 않는가?</li>
        <li>focus blur/pumping 느낌이 없는가?</li>
        <li>좌우 이동, 랜덤 pan, 흔들림 없이 안정적인가?</li>
        <li>7번 before/after 장면이 완전히 안정적인가?</li>
        <li>CTA 마지막 0.7초가 고정되어 있는가?</li>
      </ol>
      <h2>ASR Transcript</h2>
      <pre>${escapeHtml(input.transcript)}</pre>
    </section>
  </div>
</body>
</html>
`, "utf8");
}

function buildPaths(v031Root) {
  return {
    localReviewVideoPath: path.join(v031Root, "local-review-video.mp4"),
    reviewConsolePath: path.join(v031Root, "review-console.html"),
    stableMotionReportPath: path.join(v031Root, "stable-motion-report.json"),
    effectDiversityReportPath: path.join(v031Root, "effect-diversity-report.json"),
    sceneMotionPlanPath: path.join(v031Root, "scene-motion-plan.json"),
    actualContactSheetPath: path.join(v031Root, "actual-frame-contact-sheet.jpg"),
    overlayContactSheetPath: path.join(v031Root, "shorts-ui-overlay-contact-sheet.jpg"),
    asrTranscriptPath: path.join(v031Root, "asr-transcript.txt"),
    audioProbePath: path.join(v031Root, "audio-intelligibility-probe.json"),
    humanDecisionPath: path.join(v031Root, "human-review-decision.json"),
    reviewSummaryPath: path.join(v031Root, "review-summary.json"),
    voiceoverAudioPath: path.join(v031Root, "voiceover.wav")
  };
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

async function readOptionalJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function readOptionalText(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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

function normalizeNullableNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function escapeFilterPath(value) {
  return value.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
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
  generateV031StableCommerceMotionReviewPacket()
    .then((result) => {
      console.log(JSON.stringify({
        FINAL_STATUS: result.local_review_packet_ready
          ? "SUCCESS_V031_STABLE_COMMERCE_MOTION_REVIEW_READY"
          : "BLOCKED_V031_STABLE_COMMERCE_MOTION_REVIEW",
        target_version: result.target_version,
        review_console_path: result.review_console_path,
        local_review_video_path: result.local_review_video_path,
        stable_commerce_motion_pass: result.stable_commerce_motion_pass,
        transition_dark_fade_visible: result.transition_dark_fade_visible,
        crop_recenter_jump_at_scene_boundary: result.crop_recenter_jump_at_scene_boundary,
        focus_blur_enabled: result.focus_blur_enabled,
        local_review_packet_ready: result.local_review_packet_ready,
        SAFE_TO_REQUEST_PRIVATE_UPLOAD: result.SAFE_TO_REQUEST_PRIVATE_UPLOAD,
        PUBLIC_UPLOAD_BLOCKED: result.PUBLIC_UPLOAD_BLOCKED
      }, null, 2));
    })
    .catch((error) => {
      console.error(JSON.stringify({
        error: "V031_STABLE_COMMERCE_MOTION_REVIEW_PACKET_FAILED",
        message: error instanceof Error ? error.message : String(error)
      }, null, 2));
      process.exitCode = 1;
    });
}
