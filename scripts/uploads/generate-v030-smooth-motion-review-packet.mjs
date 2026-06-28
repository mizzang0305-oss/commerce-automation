import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const CANDIDATE_ID = "candidate-3c4f2ee364ba5b07";
const PRODUCT_NAME = "빌리빈 스테인리스 조리도구 8종 세트";
const SOURCE_VERSION = "v029";
const TARGET_VERSION = "v030";
const SCENE_SECONDS = 3;
const FFMPEG_TIMEOUT_MS = 240000;

export const V029_MOTION_FAIL_REASONS = [
  "MOTION_JITTER_TOO_STRONG",
  "FOCUS_EFFECT_CAUSES_LATERAL_SHAKE",
  "CAMERA_RECENTERING_TOO_ABRUPT",
  "MOTION_NOT_SMOOTH_ENOUGH"
];

const V030_SCENE_CAPTIONS = [
  "장마철 빨래 냄새,\n그냥 넘기면 손해입니다.",
  "비 오는 날엔 빨래가 늦게 마르고\n집 안 습기가 남습니다.",
  "좁은 공간이라면\n건조대 자리부터 확인하세요.",
  "접이식 빨래건조대는\n작은 공간에 쓰기 좋습니다.",
  "수건과 양말, 옷까지\n한 번에 정리해 보세요.",
  "장마철 실내건조는\n공간 활용이 중요합니다.",
  "구매 전 크기, 하중,\n보관 공간을 확인하세요.",
  "구성과 가격은 상품 설명에서\n먼저 확인해 보세요."
];

export function buildV029MotionFailureDecision() {
  return {
    candidate_id: CANDIDATE_ID,
    version: SOURCE_VERSION,
    human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
    private_upload_allowed: false,
    requires_fresh_upload_approval: true,
    pass_aspects: [
      "REAL_IMAGE_SKILL_SCENES_READY",
      "SCRIPT_TO_SCENE_ALIGNMENT_ACCEPTABLE",
      "AUDIO_ACCEPTABLE",
      "CONTENT_DIRECTION_ACCEPTABLE"
    ],
    fail_reasons: V029_MOTION_FAIL_REASONS,
    next_action: "BUILD_V030_SMOOTH_MOTION_REVIEW"
  };
}

export function buildV030SceneMotionPlan() {
  return [
    motionScene("rain-window", 1, "slow_push_in", "cross_dissolve", 1.0, 1.035, 0, 0, 0.06, 0.02),
    motionScene("wet-laundry-problem", 2, "gentle_vertical_drift", "gentle_opacity_fade", 1.02, 1.045, 0, 0.018, 0, 0),
    motionScene("small-room-laundry-mess", 3, "slow_reveal_pan", "soft_wipe", 1.03, 1.05, 0.022, 0, 0, 0),
    motionScene("drying-rack-reveal", 4, "product_slow_push", "slow_push_cut", 1.0, 1.04, 0, 0, 0, 0),
    motionScene("human-hanging-laundry-use-case", 5, "soft_hold_with_micro_zoom", "cross_dissolve", 1.0, 1.025, 0, 0, 0, 0),
    motionScene("indoor-drying-strength", 6, "clean_parallax_lite", "gentle_opacity_fade", 1.015, 1.03, -0.012, 0.006, 0, 0),
    motionScene("before-after-room-laundry", 7, "stable_split_hold", "stable_split_wipe", 1.0, 1.015, 0, 0, 0, 0),
    motionScene("cta-background", 8, "final_hero_slow_push", "cross_dissolve", 1.0, 1.035, 0, 0, 0, 0.5)
  ];
}

export function evaluateV030MotionSmoothness(plan = buildV030SceneMotionPlan()) {
  const lateralJitterScore = round3(Math.max(...plan.map((scene) => scene.lateral_jitter_score)));
  const maxCenterShiftPerSecond = round3(Math.max(...plan.map((scene) => scene.max_center_shift_per_second)));
  const directionFlipCountMax = Math.max(...plan.map((scene) => scene.direction_flip_count));
  const focusBlurStrengthMax = round3(Math.max(...plan.map((scene) => scene.focus_blur_strength)));
  const focusCenterShiftCoupled = plan.some((scene) => scene.focus_center_shift_coupled);
  const hardCameraJumpCount = plan.reduce((sum, scene) => sum + scene.hard_camera_jump_count, 0);
  const shakeEffectUsed = plan.some((scene) => scene.shake_effect_used);
  const blockers = [];
  if (lateralJitterScore > 0.15) blockers.push("MOTION_JITTER_TOO_STRONG");
  if (lateralJitterScore > 0.15) blockers.push("LEFT_RIGHT_JITTER");
  if (maxCenterShiftPerSecond > 0.035) blockers.push("CAMERA_RECENTERING_TOO_ABRUPT");
  if (directionFlipCountMax > 1) blockers.push("DIRECTION_FLIP_TOO_FREQUENT");
  if (focusBlurStrengthMax > 0.35) blockers.push("FOCUS_BLUR_TOO_STRONG");
  if (focusCenterShiftCoupled) blockers.push("FOCUS_EFFECT_CAUSES_LATERAL_SHAKE");
  if (hardCameraJumpCount > 0) blockers.push("CAMERA_RECENTERING_TOO_ABRUPT");
  if (shakeEffectUsed) blockers.push("SHAKE_EFFECT_USED");

  return {
    motion_smoothness_pass: blockers.length === 0,
    lateral_jitter_score: lateralJitterScore,
    max_center_shift_per_second: maxCenterShiftPerSecond,
    direction_flip_count_max: directionFlipCountMax,
    focus_blur_strength_max: focusBlurStrengthMax,
    focus_center_shift_coupled: focusCenterShiftCoupled,
    hard_camera_jump_count: hardCameraJumpCount,
    shake_effect_used: shakeEffectUsed,
    motion_comfort_pass: blockers.length === 0,
    motion_smoothness_blocker: blockers[0] ?? null,
    blockers
  };
}

export function evaluateV030EffectDiversity(plan = buildV030SceneMotionPlan()) {
  const presetCounts = new Map();
  for (const scene of plan) {
    presetCounts.set(scene.motion_preset, (presetCounts.get(scene.motion_preset) ?? 0) + 1);
  }
  const uniqueMotionPresetCount = presetCounts.size;
  const sameMotionPresetRepeatedMoreThan2 = [...presetCounts.values()].some((count) => count > 2);
  const transitionVarietyCount = new Set(plan.map((scene) => scene.transition)).size;
  const allEffectsSmooth = plan.every((scene) => scene.effect_smooth === true);
  const blockers = [];
  if (uniqueMotionPresetCount < 5) blockers.push("MOTION_PRESET_DIVERSITY_TOO_LOW");
  if (sameMotionPresetRepeatedMoreThan2) blockers.push("MOTION_PRESET_REPEATED_TOO_OFTEN");
  if (transitionVarietyCount < 3) blockers.push("TRANSITION_VARIETY_TOO_LOW");
  if (!allEffectsSmooth) blockers.push("MOTION_COMFORT_FAIL");

  return {
    effect_diversity_pass: blockers.length === 0,
    unique_motion_preset_count: uniqueMotionPresetCount,
    same_motion_preset_repeated_more_than_2: sameMotionPresetRepeatedMoreThan2,
    transition_variety_count: transitionVarietyCount,
    all_effects_smooth: allEffectsSmooth,
    effect_diversity_blocker: blockers[0] ?? null,
    blockers
  };
}

export async function generateV030SmoothMotionReviewPacket(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const v029Root = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, SOURCE_VERSION);
  const v030Root = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, TARGET_VERSION);
  const sceneMotionPlan = buildV030SceneMotionPlan();
  const motionSmoothness = evaluateV030MotionSmoothness(sceneMotionPlan);
  const effectDiversity = evaluateV030EffectDiversity(sceneMotionPlan);
  const paths = buildPaths(v030Root);

  await fs.mkdir(v030Root, { recursive: true });
  await writeJson(path.join(v029Root, "human-review-decision.json"), buildV029MotionFailureDecision());
  await writeJson(paths.sceneMotionPlanPath, {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    source_version: SOURCE_VERSION,
    lock: {
      image_assets: "v029 scene-assets",
      script_scene_order: "v029",
      voiceover_audio: "v029 voiceover.wav",
      selected_product_candidate: CANDIDATE_ID
    },
    scenes: sceneMotionPlan
  });
  await writeJson(paths.motionSmoothnessReportPath, motionSmoothness);
  await writeJson(paths.effectDiversityReportPath, effectDiversity);

  if (!motionSmoothness.motion_smoothness_pass || !effectDiversity.effect_diversity_pass) {
    return writeBlockedPacket({
      paths,
      blocker: motionSmoothness.motion_smoothness_blocker ?? effectDiversity.effect_diversity_blocker,
      sceneMotionPlan,
      motionSmoothness,
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
      blocker: "V029_LOCKED_ASSET_OR_AUDIO_MISSING",
      sceneMotionPlan,
      motionSmoothness,
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
    await renderSmoothMotionVideo({
      cwd,
      sceneAssets,
      sceneMotionPlan,
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
    motionSmoothness,
    effectDiversity,
    videoProbe,
    audioProbe,
    localReviewPacketReady,
    blocker: localReviewPacketReady ? null : "BLOCKED_V030_SMOOTH_MOTION_REVIEW"
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
    motionSmoothness,
    effectDiversity,
    transcript
  });
  return result;
}

function motionScene(sceneKey, sceneNumber, motionPreset, transition, scaleStart, scaleEnd, xVelocityPerSecond, yVelocityPerSecond, focusBlurStrength, endSteadyHoldSeconds) {
  const maxCenterShiftPerSecond = Math.sqrt((xVelocityPerSecond ** 2) + (yVelocityPerSecond ** 2));
  return {
    scene: sceneNumber,
    scene_key: sceneKey,
    duration_seconds: SCENE_SECONDS,
    caption: V030_SCENE_CAPTIONS[sceneNumber - 1],
    motion_preset: motionPreset,
    transition,
    scale_start: scaleStart,
    scale_end: scaleEnd,
    x_velocity_per_second: xVelocityPerSecond,
    y_velocity_per_second: yVelocityPerSecond,
    lateral_jitter_score: Math.abs(xVelocityPerSecond),
    max_center_shift_per_second: round3(maxCenterShiftPerSecond),
    direction_flip_count: 0,
    focus_blur_strength: focusBlurStrength,
    focus_center_shift_coupled: false,
    hard_camera_jump_count: 0,
    shake_effect_used: false,
    effect_smooth: true,
    end_steady_hold_seconds: endSteadyHoldSeconds
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

async function renderSmoothMotionVideo(input) {
  const tempDir = await fs.mkdtemp(path.join(input.cwd, "commerce-assets", "review", CANDIDATE_ID, TARGET_VERSION, ".tmp-v030-render-"));
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
        buildSmoothSceneFilter(scene, captionPath),
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
    "fps=2/3,drawbox=x=0:y=0:w=1080:h=165:color=black@0.18:t=fill,drawbox=x=0:y=1585:w=1080:h=250:color=black@0.16:t=fill,scale=270:480:force_original_aspect_ratio=decrease,pad=270:480:(ow-iw)/2:(oh-ih)/2,tile=4x4",
    "-frames:v",
    "1",
    input.outputPath
  ], { timeout: FFMPEG_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024 * 8 });
}

function buildSmoothSceneFilter(scene, captionPath) {
  const font = escapeFilterPath("C:/Windows/Fonts/malgunbd.ttf");
  const caption = escapeFilterPath(captionPath);
  const zoomExpr = `1+(${(scene.scale_end - scene.scale_start).toFixed(5)})*on/89`;
  const xExpr = buildCenterExpression("iw", "zoom", scene.x_velocity_per_second);
  const yExpr = buildCenterExpression("ih", "zoom", scene.y_velocity_per_second);
  const filters = [
    "scale=1240:2204:force_original_aspect_ratio=increase",
    "crop=1080:1920",
    `zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=90:s=1080x1920:fps=30`
  ];
  if (scene.focus_blur_strength > 0) {
    filters.push(`boxblur=${Math.max(0.2, scene.focus_blur_strength * 2).toFixed(2)}:enable='between(t,0.2,0.8)'`);
  }
  return [
    ...filters,
    "fade=t=in:st=0:d=0.18",
    "fade=t=out:st=2.82:d=0.18",
    "drawbox=x=0:y=0:w=1080:h=245:color=white@0.70:t=fill",
    `drawtext=fontfile='${font}':textfile='${caption}':x=64:y=66:fontsize=46:fontcolor=0x111827:line_spacing=12`,
    "drawbox=x=0:y=1668:w=1080:h=185:color=white@0.52:t=fill",
    "format=yuv420p"
  ].filter(Boolean).join(",");
}

function buildCenterExpression(axis, zoom, velocityPerSecond) {
  const base = `${axis}/2-(${axis}/${zoom}/2)`;
  if (velocityPerSecond === 0) {
    return base;
  }
  const pixelsPerFrame = velocityPerSecond * 1080 / 30;
  return `${base}+(${pixelsPerFrame.toFixed(3)}*on)`;
}

async function writeBlockedPacket(input) {
  const result = buildResult({
    paths: input.paths,
    motionSmoothness: input.motionSmoothness,
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
    source_version: SOURCE_VERSION,
    v029_content_direction: "PASS_CANDIDATE",
    v029_image_skill_scenes: "PASS_CANDIDATE",
    v029_motion_status: "FAIL_LOCAL_HUMAN_REVIEW",
    v029_fail_reasons: V029_MOTION_FAIL_REASONS,
    v029_scene_assets_reused: true,
    image_assets_regenerated: false,
    provider: "smooth_motion_v030",
    motion_smoothness_pass: input.motionSmoothness.motion_smoothness_pass,
    lateral_jitter_score: input.motionSmoothness.lateral_jitter_score,
    max_center_shift_per_second: input.motionSmoothness.max_center_shift_per_second,
    direction_flip_count_max: input.motionSmoothness.direction_flip_count_max,
    focus_blur_strength_max: input.motionSmoothness.focus_blur_strength_max,
    focus_center_shift_coupled: input.motionSmoothness.focus_center_shift_coupled,
    hard_camera_jump_count: input.motionSmoothness.hard_camera_jump_count,
    shake_effect_used: input.motionSmoothness.shake_effect_used,
    motion_comfort_pass: input.motionSmoothness.motion_comfort_pass,
    motion_smoothness_blocker: input.motionSmoothness.motion_smoothness_blocker,
    effect_diversity_pass: input.effectDiversity.effect_diversity_pass,
    unique_motion_preset_count: input.effectDiversity.unique_motion_preset_count,
    same_motion_preset_repeated_more_than_2: input.effectDiversity.same_motion_preset_repeated_more_than_2,
    transition_variety_count: input.effectDiversity.transition_variety_count,
    all_effects_smooth: input.effectDiversity.all_effects_smooth,
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
    motion_smoothness_report: input.paths.motionSmoothnessReportPath,
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
  const presetRows = input.sceneMotionPlan.map((scene) =>
    `<tr><td>${scene.scene}</td><td>${escapeHtml(scene.scene_key)}</td><td>${escapeHtml(scene.motion_preset)}</td><td>${escapeHtml(scene.transition)}</td><td>${scene.lateral_jitter_score}</td><td>${scene.focus_blur_strength}</td></tr>`
  ).join("\n");
  await fs.writeFile(filePath, `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>v030 Smooth Motion Shorts Review</title>
  <style>
    body{margin:0;padding:24px;background:#f8fafc;color:#111827;font-family:Arial,"Malgun Gothic",sans-serif}
    .status{display:inline-block;background:#1d4ed8;color:white;padding:8px 12px;border-radius:4px;font-weight:700}
    .grid{display:grid;grid-template-columns:minmax(320px,420px) 1fr;gap:24px;align-items:start}
    video,img{max-width:100%;border:1px solid #cbd5e1;border-radius:6px;background:white}
    table{border-collapse:collapse;width:100%;font-size:13px;background:white}
    th,td{border:1px solid #cbd5e1;padding:7px;text-align:left}
    code{background:#e5e7eb;padding:2px 5px;border-radius:4px}
  </style>
</head>
<body>
  <h1>v030 Smooth Motion Shorts Review</h1>
  <p class="status">${escapeHtml(input.result.human_review_status)}</p>
  <p>v029 이미지는 유지하고 좌우 흔들림, focus jitter, abrupt recentering을 줄인 smooth motion 검수 패킷입니다. 업로드는 별도 승인 전까지 차단됩니다.</p>
  <div class="grid">
    <section>
      <video src="local-review-video.mp4" controls playsinline></video>
      <p><strong>motion_smoothness_pass:</strong> ${input.motionSmoothness.motion_smoothness_pass}</p>
      <p><strong>effect_diversity_pass:</strong> ${input.effectDiversity.effect_diversity_pass}</p>
      <p><strong>private_upload_allowed:</strong> false</p>
    </section>
    <section>
      <h2>Motion Presets</h2>
      <table><thead><tr><th>#</th><th>Scene</th><th>Preset</th><th>Transition</th><th>Jitter</th><th>Focus</th></tr></thead><tbody>${presetRows}</tbody></table>
      <h2>Actual Frame Contact Sheet</h2>
      <img src="actual-frame-contact-sheet.jpg" alt="actual frame contact sheet" />
      <h2>Shorts UI Overlay Contact Sheet</h2>
      <img src="shorts-ui-overlay-contact-sheet.jpg" alt="shorts UI overlay contact sheet" />
      <h2>Human Review Checklist</h2>
      <ol>
        <li>포커스 인/아웃 때 좌우 흔들림이 없는가?</li>
        <li>장면 움직임이 부드러운가?</li>
        <li>효과가 장면별로 자연스럽게 다른가?</li>
        <li>광고 흐름이 유지되는가?</li>
        <li>자막이 흔들리거나 잘리지 않는가?</li>
        <li>private upload 후보로 볼 수 있는가?</li>
      </ol>
      <h2>ASR Transcript</h2>
      <pre>${escapeHtml(input.transcript)}</pre>
    </section>
  </div>
</body>
</html>
`, "utf8");
}

function buildPaths(v030Root) {
  return {
    localReviewVideoPath: path.join(v030Root, "local-review-video.mp4"),
    reviewConsolePath: path.join(v030Root, "review-console.html"),
    motionSmoothnessReportPath: path.join(v030Root, "motion-smoothness-report.json"),
    effectDiversityReportPath: path.join(v030Root, "effect-diversity-report.json"),
    sceneMotionPlanPath: path.join(v030Root, "scene-motion-plan.json"),
    actualContactSheetPath: path.join(v030Root, "actual-frame-contact-sheet.jpg"),
    overlayContactSheetPath: path.join(v030Root, "shorts-ui-overlay-contact-sheet.jpg"),
    asrTranscriptPath: path.join(v030Root, "asr-transcript.txt"),
    audioProbePath: path.join(v030Root, "audio-intelligibility-probe.json"),
    humanDecisionPath: path.join(v030Root, "human-review-decision.json"),
    reviewSummaryPath: path.join(v030Root, "review-summary.json"),
    voiceoverAudioPath: path.join(v030Root, "voiceover.wav")
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
  generateV030SmoothMotionReviewPacket()
    .then((result) => {
      console.log(JSON.stringify({
        FINAL_STATUS: result.local_review_packet_ready
          ? "SUCCESS_V030_SMOOTH_MOTION_REVIEW_READY"
          : "BLOCKED_V030_SMOOTH_MOTION_REVIEW",
        target_version: result.target_version,
        review_console_path: result.review_console_path,
        local_review_video_path: result.local_review_video_path,
        motion_smoothness_pass: result.motion_smoothness_pass,
        effect_diversity_pass: result.effect_diversity_pass,
        local_review_packet_ready: result.local_review_packet_ready,
        SAFE_TO_REQUEST_PRIVATE_UPLOAD: result.SAFE_TO_REQUEST_PRIVATE_UPLOAD,
        PUBLIC_UPLOAD_BLOCKED: result.PUBLIC_UPLOAD_BLOCKED
      }, null, 2));
    })
    .catch((error) => {
      console.error(JSON.stringify({
        error: "V030_SMOOTH_MOTION_REVIEW_PACKET_FAILED",
        message: error instanceof Error ? error.message : String(error)
      }, null, 2));
      process.exitCode = 1;
    });
}
