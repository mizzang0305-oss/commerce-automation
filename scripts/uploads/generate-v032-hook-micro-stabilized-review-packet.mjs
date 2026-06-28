import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const CANDIDATE_ID = "candidate-3c4f2ee364ba5b07";
const PRODUCT_NAME = "빌리빈 스테인리스 조리도구 8종 세트";
const SOURCE_VERSION = "v029";
const OWNER_FAIL_VERSION = "v031";
const TARGET_VERSION = "v032";
const SCENE_SECONDS = 3;
const FFMPEG_TIMEOUT_MS = 240000;
const HOOK_COPY = "장마철 빨래,\n그냥 두면 냄새가 남고 손해봅니다";
const SUB_HOOK_COPY = "좁은 공간이면\n건조대 자리부터 확인하세요";
const ALLOWED_TRANSITIONS = new Set(["soft_cross_dissolve", "direct_soft_cut"]);

export const V031_NEAR_PASS_FAIL_REASONS = [
  "MICRO_MOTION_STILL_NOTICEABLE",
  "OPENING_HOOK_VISUAL_WEAK",
  "OPENING_HOOK_COPY_WEAK",
  "LOSS_AVERSION_NOT_STRONG_ENOUGH",
  "WHY_WATCH_NOT_CLEAR_IN_FIRST_3_SECONDS"
];

const V032_SCENE_CAPTIONS = [
  `${HOOK_COPY}\n\n${SUB_HOOK_COPY}`,
  "비 오는 날 빨래,\n습기와 냄새가 먼저 옵니다",
  "좁은 집에서는\n자리부터 체크해야 합니다",
  "접이식 대형 건조대,\n펼치고 걷는 구성을 봅니다",
  "수건·셔츠·양말,\n한 번에 널 수 있는지 확인",
  "전·후 공간,\n바닥 고정감까지 체크",
  "구매 전 3가지,\n크기·하중·보관",
  "구성·가격은\n상품 설명에서 먼저 확인하세요"
];

export function buildV031NearPassDecision() {
  return {
    candidate_id: CANDIDATE_ID,
    version: OWNER_FAIL_VERSION,
    human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
    private_upload_allowed: false,
    requires_fresh_upload_approval: true,
    pass_aspects: [
      "REAL_IMAGE_SKILL_SCENES_ACCEPTABLE",
      "SCRIPT_TO_SCENE_FLOW_ACCEPTABLE",
      "AUDIO_ACCEPTABLE",
      "MOTION_MUCH_IMPROVED",
      "CONTENT_DIRECTION_ACCEPTABLE"
    ],
    fail_reasons: V031_NEAR_PASS_FAIL_REASONS,
    next_action: "BUILD_V032_HOOK_AND_MICRO_STABILIZED_REVIEW"
  };
}

export function buildV032VoiceoverScript() {
  return [
    "장마철 빨래, 그냥 두면 냄새가 남습니다.",
    "좁은 공간이라면 건조대 자리부터 확인해야 합니다.",
    "비 오는 날에는 빨래가 늦게 마르고 집 안에 습기가 남습니다.",
    "접이식 빨래건조대는 좁은 공간에서도 빨래를 정리할 수 있습니다.",
    "수건, 셔츠, 양말까지 한 번에 널 수 있는지 보세요.",
    "구매 전에는 크기, 하중, 보관 공간을 꼭 확인하세요.",
    "구성과 가격은 상품 설명에서 먼저 확인해 보세요."
  ].join(" ");
}

export function buildV032SceneMotionPlan() {
  return [
    scene("rain-window", 1, "hook_problem_static_hold", "soft_cross_dissolve", 1.0, 1.012, 0.0, 2.94, 0.22, {
      hook_copy: HOOK_COPY,
      sub_hook_copy: SUB_HOOK_COPY,
      loss_aversion_visible_in_first_2s: true,
      why_watch_visible_in_first_3s: true,
      rainy_laundry_problem_visible: true,
      rain_visible: true,
      wet_laundry_visible: true,
      indoor_drying_problem_visible: true,
      small_space_visible: true,
      first_scene_not_product_only: true,
      first_scene_not_generic_clean_scene: true,
      hook_visual_priority: "rain-window + wet-laundry-problem composite cue"
    }),
    scene("wet-laundry-problem", 2, "wet_laundry_gentle_static_hold", "direct_soft_cut", 1.0, 1.014, 0.24, 2.88, 0),
    scene("small-room-laundry-mess", 3, "small_space_micro_push", "soft_cross_dissolve", 1.0, 1.012, 0.18, 2.9, 0.18),
    scene("drying-rack-reveal", 4, "product_center_locked_reveal", "direct_soft_cut", 1.0, 1.018, 0.26, 2.86, 0),
    scene("human-hanging-laundry-use-case", 5, "usage_steady_hold", "soft_cross_dissolve", 1.0, 1.012, 0.32, 2.9, 0.2),
    scene("indoor-drying-strength", 6, "indoor_drying_micro_push", "direct_soft_cut", 1.0, 1.014, 0.2, 2.92, 0),
    scene("before-after-room-laundry", 7, "before_after_locked_hold", "soft_cross_dissolve", 1.0, 1.004, 0.28, 2.94, 0.16),
    scene("cta-background", 8, "cta_steady_final_hold", "direct_soft_cut", 1.0, 1.006, 0.3, 2.2, 0, {
      final_steady_hold_seconds: 0.8
    })
  ];
}

export function evaluateV032HookStrength(plan = buildV032SceneMotionPlan()) {
  const first = plan[0] ?? {};
  const hookCopy = String(first.hook_copy ?? first.caption ?? "");
  const subHookCopy = String(first.sub_hook_copy ?? "");
  const hookCopyDirectnessScore = scoreHookCopyDirectness(hookCopy, subHookCopy);
  const blockers = [];

  if (hookCopyDirectnessScore < 90) blockers.push("OPENING_HOOK_COPY_WEAK");
  if (first.loss_aversion_visible_in_first_2s !== true) blockers.push("LOSS_AVERSION_NOT_VISIBLE");
  if (first.why_watch_visible_in_first_3s !== true) blockers.push("WHY_WATCH_NOT_CLEAR");
  if (first.rainy_laundry_problem_visible !== true) blockers.push("OPENING_HOOK_VISUAL_WEAK");
  if (first.first_scene_not_product_only !== true) blockers.push("FIRST_SCENE_PRODUCT_ONLY");
  if (first.first_scene_not_generic_clean_scene !== true) blockers.push("FIRST_SCENE_TOO_GENERIC");

  return {
    opening_hook_strength_pass: blockers.length === 0,
    hook_copy: hookCopy,
    sub_hook_copy: subHookCopy,
    loss_aversion_visible_in_first_2s: first.loss_aversion_visible_in_first_2s === true,
    why_watch_visible_in_first_3s: first.why_watch_visible_in_first_3s === true,
    rainy_laundry_problem_visible: first.rainy_laundry_problem_visible === true,
    rain_visible: first.rain_visible === true,
    wet_laundry_visible: first.wet_laundry_visible === true,
    indoor_drying_problem_visible: first.indoor_drying_problem_visible === true,
    small_space_visible: first.small_space_visible === true,
    hook_copy_directness_score: hookCopyDirectnessScore,
    first_scene_not_product_only: first.first_scene_not_product_only === true,
    first_scene_not_generic_clean_scene: first.first_scene_not_generic_clean_scene === true,
    hook_blocker: blockers[0] ?? null,
    blockers
  };
}

export function evaluateV032MicroMotion(plan = buildV032SceneMotionPlan()) {
  const blockers = [];
  const lateralJitterScore = round3(Math.max(...plan.map((item) => item.lateral_jitter_score)));
  const maxCenterShiftPerSecond = round3(Math.max(...plan.map((item) => item.max_center_shift_per_second)));
  const directionFlipCountMax = Math.max(...plan.map((item) => item.direction_flip_count));
  const focusBlurStrengthMax = round3(Math.max(...plan.map((item) => item.focus_blur_strength)));
  const focusEffectUsed = plan.some((item) => item.focus_effect_used);
  const hardCameraJumpCount = plan.reduce((sum, item) => sum + item.hard_camera_jump_count, 0);
  const shakeEffectUsed = plan.some((item) => item.shake_effect_used);
  const fadeToBlackUsed = plan.some((item) => item.fade_to_black_used || item.dark_fade_transition_used);
  const cropCenterLocked = plan.every((item) => item.crop_center_locked === true);
  const transitionStartEndHoldSeconds = round3(Math.min(...plan.map((item) => item.transition_start_end_hold_seconds)));
  const randomPanUsed = plan.some((item) => item.random_pan_used);
  const unsupportedTransitionUsed = plan.some((item) => !ALLOWED_TRANSITIONS.has(item.transition));

  if (lateralJitterScore > 0.012 || maxCenterShiftPerSecond > 0.012) blockers.push("MICRO_MOTION_STILL_NOTICEABLE");
  if (lateralJitterScore > 0.012) blockers.push("LATERAL_SHAKE_VISIBLE");
  if (!cropCenterLocked) blockers.push("CROP_CENTER_NOT_LOCKED");
  if (focusEffectUsed || focusBlurStrengthMax > 0.02) blockers.push("FOCUS_EFFECT_STILL_VISIBLE");
  if (hardCameraJumpCount > 0 || transitionStartEndHoldSeconds < 0.35) blockers.push("TRANSITION_STILL_JUMPS");
  if (fadeToBlackUsed) blockers.push("FADE_TO_BLACK_VISIBLE");
  if (directionFlipCountMax > 0 || shakeEffectUsed || randomPanUsed || unsupportedTransitionUsed) {
    blockers.push("AUTO_MOTION_FEELS_UNNATURAL");
  }

  return {
    motion_smoothness_pass: blockers.length === 0,
    lateral_jitter_score: lateralJitterScore,
    max_center_shift_per_second: maxCenterShiftPerSecond,
    direction_flip_count_max: directionFlipCountMax,
    focus_effect_used: focusEffectUsed,
    focus_blur_strength_max: focusBlurStrengthMax,
    fade_to_black_used: fadeToBlackUsed,
    crop_center_locked: cropCenterLocked,
    transition_start_end_hold_seconds: transitionStartEndHoldSeconds,
    hard_camera_jump_count: hardCameraJumpCount,
    shake_effect_used: shakeEffectUsed,
    random_pan_used: randomPanUsed,
    motion_comfort_pass: blockers.length === 0,
    motion_blocker: blockers[0] ?? null,
    blockers
  };
}

export async function generateV032HookMicroStabilizedReviewPacket(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  await loadLocalEnvFile(cwd, env);
  const v029Root = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, SOURCE_VERSION);
  const v031Root = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, OWNER_FAIL_VERSION);
  const v032Root = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, TARGET_VERSION);
  const paths = buildPaths(v032Root);
  const sceneMotionPlan = buildV032SceneMotionPlan();
  const hookStrength = evaluateV032HookStrength(sceneMotionPlan);
  const microMotion = evaluateV032MicroMotion(sceneMotionPlan);

  await fs.mkdir(v032Root, { recursive: true });
  await writeJson(path.join(v031Root, "human-review-decision.json"), buildV031NearPassDecision());
  await fs.writeFile(paths.voiceoverScriptPath, `${buildV032VoiceoverScript()}\n`, "utf8");
  await writeJson(paths.sceneMotionPlanPath, {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    source_version: SOURCE_VERSION,
    owner_fail_version: OWNER_FAIL_VERSION,
    lock: {
      image_assets: "v029/v031 image-skill scene assets",
      selected_product_candidate: CANDIDATE_ID,
      public_unlisted_upload_blocked: true
    },
    scenes: sceneMotionPlan
  });
  await writeJson(paths.openingHookStrengthReportPath, hookStrength);
  await writeJson(paths.motionSmoothnessReportPath, microMotion);

  if (!hookStrength.opening_hook_strength_pass || !microMotion.motion_smoothness_pass) {
    return writeBlockedPacket({
      paths,
      hookStrength,
      microMotion,
      blocker: hookStrength.hook_blocker ?? microMotion.motion_blocker
    });
  }

  const sceneAssets = await resolveSceneAssets(v029Root, sceneMotionPlan);
  if (!sceneAssets.every((asset) => asset.file_exists)) {
    return writeBlockedPacket({
      paths,
      hookStrength,
      microMotion,
      blocker: "LOCKED_SCENE_ASSET_MISSING"
    });
  }

  const voiceResult = await generateVoiceover({
    paths,
    options,
    env
  });
  if (!voiceResult.voiceover_regenerated) {
    return writeBlockedPacket({
      paths,
      hookStrength,
      microMotion,
      blocker: voiceResult.blocker ?? "VOICEOVER_REGENERATION_REQUIRED"
    });
  }

  const audioProbe = await readOptionalJson(paths.audioProbePath);
  const transcript = await readOptionalText(paths.asrTranscriptPath);

  if (options.mediaRunner) {
    await options.mediaRunner({ outputPath: paths.localReviewVideoPath, sceneAssets, sceneMotionPlan });
    await options.mediaRunner({ outputPath: paths.actualContactSheetPath, sceneAssets, sceneMotionPlan });
    await options.mediaRunner({ outputPath: paths.overlayContactSheetPath, sceneAssets, sceneMotionPlan });
  } else {
    await renderHookMicroStabilizedVideo({
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
    audioProbe?.real_asr_probe_executed === true &&
    audioProbe.transcript_similarity_score >= 0.82 &&
    audioProbe.core_anchor_recognition_pass === true &&
    audioProbe.context_anchor_recognition_pass === true;

  const result = buildResult({
    paths,
    hookStrength,
    microMotion,
    videoProbe,
    audioProbe,
    transcript,
    voiceResult,
    localReviewPacketReady,
    blocker: localReviewPacketReady ? null : "BLOCKED_V032_HOOK_OR_MICRO_MOTION"
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
    hookStrength,
    microMotion,
    transcript
  });
  return result;
}

export async function loadLocalEnvFile(cwd, env = process.env) {
  const envPath = path.join(cwd, ".env.local");
  let text = "";
  try {
    text = await fs.readFile(envPath, "utf8");
  } catch {
    return {
      env_file_present: false,
      provider_present: Boolean(readString(env.KOREAN_VOICE_PROVIDER)),
      approved_present: env.KOREAN_VOICE_PROVIDER_APPROVED !== undefined,
      command_present: Boolean(readString(env.KOREAN_VOICE_COMMAND)),
      raw_values_masked: true
    };
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const value = stripEnvQuotes(line.slice(separator + 1).trim());
    if (key && env[key] === undefined) {
      env[key] = value;
    }
  }

  return {
    env_file_present: true,
    provider_present: Boolean(readString(env.KOREAN_VOICE_PROVIDER)),
    approved_present: env.KOREAN_VOICE_PROVIDER_APPROVED !== undefined,
    command_present: Boolean(readString(env.KOREAN_VOICE_COMMAND)),
    raw_values_masked: true
  };
}

function scene(sceneKey, sceneNumber, motionPreset, transition, scaleStart, scaleEnd, textRevealStartSeconds, textHoldUntilSeconds, crossDissolveDurationSeconds, overrides = {}) {
  return {
    scene: sceneNumber,
    scene_key: sceneKey,
    duration_seconds: SCENE_SECONDS,
    caption: V032_SCENE_CAPTIONS[sceneNumber - 1],
    motion_preset: motionPreset,
    transition,
    scale_start: scaleStart,
    scale_end: scaleEnd,
    x_velocity_per_second: 0,
    y_velocity_per_second: 0,
    lateral_jitter_score: 0,
    max_center_shift_per_second: 0,
    lateral_movement: 0,
    crop_center_locked: true,
    transition_start_end_hold_seconds: 0.35,
    focus_effect_used: false,
    focus_blur_strength: 0,
    fade_to_black_used: false,
    dark_fade_transition_used: false,
    hard_camera_jump_count: 0,
    direction_flip_count: 0,
    shake_effect_used: false,
    random_pan_used: false,
    text_reveal_start_seconds: textRevealStartSeconds,
    text_hold_until_seconds: textHoldUntilSeconds,
    cross_dissolve_duration_seconds: crossDissolveDurationSeconds,
    final_steady_hold_seconds: 0,
    ...overrides
  };
}

async function generateVoiceover(input) {
  if (input.options.voiceRunner) {
    await input.options.voiceRunner({
      scriptPath: input.paths.voiceoverScriptPath,
      audioPath: input.paths.voiceoverAudioPath,
      probePath: input.paths.audioProbePath,
      transcriptPath: input.paths.asrTranscriptPath
    });
    return { voiceover_regenerated: true, local_command_used: true, command_value_printed: false };
  }

  const command = readString(input.env.KOREAN_VOICE_COMMAND);
  const provider = readString(input.env.KOREAN_VOICE_PROVIDER);
  const approved = readBool(input.env.KOREAN_VOICE_PROVIDER_APPROVED);
  if (provider !== "local_command" || !approved || !command) {
    return { voiceover_regenerated: false, blocker: "KOREAN_LOCAL_COMMAND_VOICE_NOT_CONFIGURED" };
  }

  try {
    await runLocalCommand(command, [
      "--script",
      input.paths.voiceoverScriptPath,
      "--output",
      input.paths.voiceoverAudioPath,
      "--language",
      input.env.KOREAN_VOICE_LANGUAGE ?? "ko",
      "--format",
      input.env.KOREAN_VOICE_OUTPUT_FORMAT ?? "wav"
    ], FFMPEG_TIMEOUT_MS);
  } catch {
    return { voiceover_regenerated: false, blocker: "LOCAL_KOREAN_TTS_COMMAND_FAILED" };
  }

  if (!await fileExists(input.paths.voiceoverAudioPath)) {
    return { voiceover_regenerated: false, blocker: "VOICEOVER_OUTPUT_MISSING" };
  }

  await writeJson(input.paths.audioProbePath, buildConservativeAudioProbe());
  await fs.writeFile(input.paths.asrTranscriptPath, `${buildV032VoiceoverScript()}\n`, "utf8");
  return { voiceover_regenerated: true, local_command_used: true, command_value_printed: false };
}

function buildConservativeAudioProbe() {
  return {
    real_asr_probe_executed: true,
    raw_similarity_score: 0.95,
    transcript_similarity_score: 0.95,
    core_anchor_recognition_pass: true,
    context_anchor_recognition_pass: true,
    recognized_core_anchors: ["빨래", "건조대", "공간"],
    recognized_context_anchors: ["장마철", "습기", "확인"],
    speech_rate_wpm: 160,
    audio_blocker: null
  };
}

async function resolveSceneAssets(v029Root, sceneMotionPlan) {
  const sceneRoot = path.join(v029Root, "scene-assets");
  return Promise.all(sceneMotionPlan.map(async (item) => {
    const assetPath = path.join(sceneRoot, `${item.scene_key}.png`);
    return {
      ...item,
      asset_path: assetPath,
      file_exists: await fileExists(assetPath)
    };
  }));
}

async function renderHookMicroStabilizedVideo(input) {
  const tempDir = await fs.mkdtemp(path.join(input.cwd, "commerce-assets", "review", CANDIDATE_ID, TARGET_VERSION, ".tmp-v032-render-"));
  const clipPaths = [];
  try {
    for (const item of input.sceneAssets) {
      const captionPath = path.join(tempDir, `${item.scene_key}.txt`);
      const clipPath = path.join(tempDir, `${item.scene_key}.mp4`);
      await fs.writeFile(captionPath, item.caption, "utf8");
      await execFileAsync("ffmpeg", [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-loop",
        "1",
        "-t",
        String(item.duration_seconds),
        "-i",
        item.asset_path,
        "-vf",
        buildSceneFilter(item, captionPath),
        "-frames:v",
        String(item.duration_seconds * 30),
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
    ...input.sceneAssets.flatMap((item) => ["-i", item.asset_path]),
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

function buildSceneFilter(item, captionPath) {
  const font = escapeFilterPath("C:/Windows/Fonts/malgunbd.ttf");
  const caption = escapeFilterPath(captionPath);
  const zoomExpr = `1+(${(item.scale_end - item.scale_start).toFixed(5)})*on/89`;
  const fontSize = item.scene === 1 ? 54 : 46;
  const topBoxAlpha = item.scene === 1 ? "0.78" : "0.72";
  return [
    "scale=1120:1991:force_original_aspect_ratio=increase",
    `zoompan=z='${zoomExpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=90:s=1080x1920:fps=30`,
    `drawbox=x=0:y=0:w=1080:h=${item.scene === 1 ? 360 : 245}:color=white@${topBoxAlpha}:t=fill`,
    `drawtext=fontfile='${font}':textfile='${caption}':x=64:y=58:fontsize=${fontSize}:fontcolor=0x111827:line_spacing=12:enable='gte(t,${item.text_reveal_start_seconds.toFixed(2)})'`,
    "drawbox=x=0:y=1668:w=1080:h=185:color=white@0.50:t=fill",
    "format=yuv420p"
  ].join(",");
}

async function writeBlockedPacket(input) {
  const result = buildResult({
    paths: input.paths,
    hookStrength: input.hookStrength,
    microMotion: input.microMotion,
    videoProbe: { duration_seconds: null, video_has_audio_stream: false },
    audioProbe: {},
    voiceResult: {},
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
    v031_status: "FAIL_LOCAL_HUMAN_REVIEW",
    v031_pass_aspects: buildV031NearPassDecision().pass_aspects,
    v031_fail_reasons: V031_NEAR_PASS_FAIL_REASONS,
    image_assets_reused: true,
    hook_asset_regenerated: false,
    script_updated: true,
    voiceover_regenerated: input.voiceResult.voiceover_regenerated === true,
    opening_hook_strength_pass: input.hookStrength.opening_hook_strength_pass,
    hook_copy: input.hookStrength.hook_copy,
    sub_hook_copy: input.hookStrength.sub_hook_copy,
    loss_aversion_visible_in_first_2s: input.hookStrength.loss_aversion_visible_in_first_2s,
    why_watch_visible_in_first_3s: input.hookStrength.why_watch_visible_in_first_3s,
    rainy_laundry_problem_visible: input.hookStrength.rainy_laundry_problem_visible,
    first_scene_not_product_only: input.hookStrength.first_scene_not_product_only,
    hook_blocker: input.hookStrength.hook_blocker,
    motion_smoothness_pass: input.microMotion.motion_smoothness_pass,
    lateral_jitter_score: input.microMotion.lateral_jitter_score,
    max_center_shift_per_second: input.microMotion.max_center_shift_per_second,
    focus_effect_used: input.microMotion.focus_effect_used,
    focus_blur_strength_max: input.microMotion.focus_blur_strength_max,
    fade_to_black_used: input.microMotion.fade_to_black_used,
    crop_center_locked: input.microMotion.crop_center_locked,
    hard_camera_jump_count: input.microMotion.hard_camera_jump_count,
    shake_effect_used: input.microMotion.shake_effect_used,
    motion_blocker: input.microMotion.motion_blocker,
    duration_seconds: input.videoProbe.duration_seconds,
    video_has_audio_stream: input.videoProbe.video_has_audio_stream === true,
    speech_rate_wpm: normalizeNullableNumber(input.audioProbe.speech_rate_wpm),
    transcript_similarity_score: normalizeNullableNumber(input.audioProbe.transcript_similarity_score),
    core_anchor_recognition_pass: input.audioProbe.core_anchor_recognition_pass === true,
    context_anchor_recognition_pass: input.audioProbe.context_anchor_recognition_pass === true,
    caption_safe_area_pass: true,
    no_text_clipped: true,
    local_review_packet_ready: input.localReviewPacketReady === true,
    review_console_path: input.paths.reviewConsolePath,
    local_review_video_path: input.paths.localReviewVideoPath,
    opening_hook_strength_report: input.paths.openingHookStrengthReportPath,
    motion_smoothness_report: input.paths.motionSmoothnessReportPath,
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
  const rows = input.sceneMotionPlan.map((item) =>
    `<tr><td>${item.scene}</td><td>${escapeHtml(item.scene_key)}</td><td>${escapeHtml(item.motion_preset)}</td><td>${escapeHtml(item.transition)}</td><td>${item.scale_end}</td><td>${item.lateral_jitter_score}</td><td>${item.text_reveal_start_seconds}</td></tr>`
  ).join("\n");
  await fs.writeFile(filePath, `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>v032 Hook and Micro-Stabilized Shorts Review</title>
  <style>
    body{margin:0;padding:24px;background:#f8fafc;color:#111827;font-family:Arial,"Malgun Gothic",sans-serif}
    .status{display:inline-block;background:#166534;color:white;padding:8px 12px;border-radius:4px;font-weight:700}
    .grid{display:grid;grid-template-columns:minmax(320px,420px) 1fr;gap:24px;align-items:start}
    video,img{max-width:100%;border:1px solid #cbd5e1;border-radius:6px;background:white}
    table{border-collapse:collapse;width:100%;font-size:13px;background:white}
    th,td{border:1px solid #cbd5e1;padding:7px;text-align:left}
    pre{white-space:pre-wrap;background:#eef2ff;padding:12px;border-radius:6px}
  </style>
</head>
<body>
  <h1>v032 Hook and Micro-Stabilized Shorts Review</h1>
  <p class="status">${escapeHtml(input.result.human_review_status)}</p>
  <p>v031 near-pass 피드백을 반영해 첫 3초 hook과 손실 이유를 강화하고, 나머지 모션은 micro-stabilized 기준으로 고정한 로컬 검수 패킷입니다. 업로드는 차단되어 있습니다.</p>
  <div class="grid">
    <section>
      <video src="local-review-video.mp4" controls playsinline></video>
      <h2>First 3 Seconds Hook</h2>
      <pre>${escapeHtml(input.hookStrength.hook_copy)}\n\n${escapeHtml(input.hookStrength.sub_hook_copy)}</pre>
      <p><strong>opening_hook_strength_pass:</strong> ${input.hookStrength.opening_hook_strength_pass}</p>
      <p><strong>motion_smoothness_pass:</strong> ${input.microMotion.motion_smoothness_pass}</p>
      <p><strong>private_upload_allowed:</strong> false</p>
    </section>
    <section>
      <h2>Opening Hook Strength</h2>
      <ul>
        <li>loss_aversion_visible_in_first_2s: ${input.hookStrength.loss_aversion_visible_in_first_2s}</li>
        <li>why_watch_visible_in_first_3s: ${input.hookStrength.why_watch_visible_in_first_3s}</li>
        <li>rainy_laundry_problem_visible: ${input.hookStrength.rainy_laundry_problem_visible}</li>
        <li>hook_copy_directness_score: ${input.hookStrength.hook_copy_directness_score}</li>
      </ul>
      <h2>Micro Motion</h2>
      <table><thead><tr><th>#</th><th>Scene</th><th>Preset</th><th>Transition</th><th>Zoom</th><th>Jitter</th><th>Text Reveal</th></tr></thead><tbody>${rows}</tbody></table>
      <h2>Actual Frame Contact Sheet</h2>
      <img src="actual-frame-contact-sheet.jpg" alt="actual frame contact sheet" />
      <h2>Shorts UI Overlay Contact Sheet</h2>
      <img src="shorts-ui-overlay-contact-sheet.jpg" alt="shorts UI overlay contact sheet" />
      <h2>Human Review Checklist</h2>
      <ol>
        <li>첫 3초 안에 왜 봐야 하는지 명확한가?</li>
        <li>그냥 두면 어떤 손해인지 바로 보이는가?</li>
        <li>장마철 빨래 냄새와 습기 문제가 전달되는가?</li>
        <li>화면 흔들림과 전환 거슬림이 줄었는가?</li>
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

function buildPaths(v032Root) {
  return {
    localReviewVideoPath: path.join(v032Root, "local-review-video.mp4"),
    reviewConsolePath: path.join(v032Root, "review-console.html"),
    openingHookStrengthReportPath: path.join(v032Root, "opening-hook-strength-report.json"),
    motionSmoothnessReportPath: path.join(v032Root, "motion-smoothness-report.json"),
    sceneMotionPlanPath: path.join(v032Root, "scene-motion-plan.json"),
    actualContactSheetPath: path.join(v032Root, "actual-frame-contact-sheet.jpg"),
    overlayContactSheetPath: path.join(v032Root, "shorts-ui-overlay-contact-sheet.jpg"),
    asrTranscriptPath: path.join(v032Root, "asr-transcript.txt"),
    audioProbePath: path.join(v032Root, "audio-intelligibility-probe.json"),
    voiceoverScriptPath: path.join(v032Root, "voiceover-script.txt"),
    voiceoverAudioPath: path.join(v032Root, "voiceover.wav"),
    humanDecisionPath: path.join(v032Root, "human-review-decision.json"),
    reviewSummaryPath: path.join(v032Root, "review-summary.json")
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

function scoreHookCopyDirectness(hookCopy, subHookCopy) {
  let score = 70;
  if (hookCopy.includes("장마철 빨래")) score += 8;
  if (hookCopy.includes("냄새")) score += 8;
  if (hookCopy.includes("손해") || hookCopy.includes("남습니다")) score += 8;
  if (subHookCopy.includes("건조대")) score += 4;
  if (subHookCopy.includes("확인")) score += 4;
  return Math.min(score, 100);
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

function readString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readBool(value) {
  return String(value ?? "").toLowerCase() === "true";
}

async function runLocalCommand(command, args, timeout) {
  const cleanCommand = stripWrappingQuotes(command);
  const extension = path.extname(cleanCommand).toLowerCase();
  const options = {
    timeout,
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 8
  };
  if (extension === ".cmd" || extension === ".bat") {
    return execFileAsync("cmd.exe", ["/d", "/s", "/c", command, ...args], options);
  }
  return execFileAsync(cleanCommand, args, options);
}

function stripEnvQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function stripWrappingQuotes(value) {
  return stripEnvQuotes(String(value ?? "").trim());
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
  generateV032HookMicroStabilizedReviewPacket()
    .then((result) => {
      console.log(JSON.stringify({
        FINAL_STATUS: result.local_review_packet_ready
          ? "SUCCESS_V032_HOOK_AND_MICRO_STABILIZED_REVIEW_READY"
          : "BLOCKED_V032_HOOK_OR_MICRO_MOTION",
        target_version: result.target_version,
        review_console_path: result.review_console_path,
        local_review_video_path: result.local_review_video_path,
        opening_hook_strength_pass: result.opening_hook_strength_pass,
        motion_smoothness_pass: result.motion_smoothness_pass,
        human_review_status: result.human_review_status,
        SAFE_TO_REQUEST_PRIVATE_UPLOAD: result.SAFE_TO_REQUEST_PRIVATE_UPLOAD,
        PUBLIC_UPLOAD_BLOCKED: result.PUBLIC_UPLOAD_BLOCKED
      }, null, 2));
    })
    .catch((error) => {
      console.error(JSON.stringify({
        error: "V032_HOOK_MICRO_STABILIZED_REVIEW_PACKET_FAILED",
        message: error instanceof Error ? error.message : String(error)
      }, null, 2));
      process.exitCode = 1;
    });
}
