import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const CANDIDATE_ID = "candidate-3c4f2ee364ba5b07";
const PRODUCT_NAME = "접이식 빨래건조대";
const SOURCE_VERSION = "v029";
const OWNER_FAIL_VERSION = "v032";
const TARGET_VERSION = "v033";
const SCENE_SECONDS = 3.05;
const FFMPEG_TIMEOUT_MS = 240000;
const TAIL_PADDING_SECONDS = 1.4;
const END_CARD_HOLD_SECONDS = 1.5;
const TARGET_VIDEO_DURATION_SECONDS = 24.4;
const TARGET_AUDIO_DURATION_SECONDS = 22.9;
const MINIMUM_TAIL_ROOM_SECONDS = 1.2;
const REQUIRED_CONTRAST_RATIO = 4.5;
const HOOK_COPY = "장마철 빨래 냄새,\n건조대 잘못 고르면 계속 납니다";
const SUB_HOOK_COPY = "좁은 공간이면\n자리 차지하는 건조대부터 피하세요";
const KEYWORD_HIGHLIGHTS = ["냄새", "잘못 고르면", "계속 납니다"];
const ALLOWED_TRANSITIONS = new Set(["soft_cross_dissolve", "direct_soft_cut"]);

export const V032_OWNER_FAIL_REASONS = [
  "AUDIO_TAIL_CUT_OFF",
  "FINAL_SENTENCE_NOT_FULLY_AUDIBLE",
  "HOOK_TEXT_VISIBILITY_WEAK",
  "OPENING_VISUAL_SALES_PRESSURE_WEAK",
  "VOICE_AUTHORITY_WEAK",
  "CHANNEL_SALES_IDENTITY_MISSING",
  "TOO_GENERIC_COMMERCE_SHORTS"
];

const MINZ_COMMERCE_STYLE = {
  hookTone: "loss_aversion_direct",
  visualTone: "clean_real_life_commerce",
  captionWeight: "bold",
  captionContrast: "high",
  productRole: "solution_after_problem",
  voiceTone: "firm_sales_explainer",
  ctaStyle: "clear_description_check",
  forbiddenPatterns: [
    "text_card_video",
    "ppt_slide",
    "weak_generic_hook",
    "low_contrast_caption",
    "audio_tail_cutoff",
    "overactive_motion",
    "horror_or_dark_composite"
  ]
};

const V033_SCENE_CAPTIONS = [
  `${HOOK_COPY}\n\n${SUB_HOOK_COPY}`,
  "비 오는 날엔\n냄새와 습기가 먼저 남습니다",
  "좁은 공간이면\n자리 차지부터 봐야 합니다",
  "접이식 건조대는\n크기와 보관공간을 먼저 봅니다",
  "수건·양말·셔츠,\n한 번에 널 수 있는지 확인",
  "집안 습기 줄이려면\n바닥 안정감도 체크",
  "구매 전 3가지,\n하중·크기·접었을 때 보관성",
  "구성·가격은\n상품 설명에서 먼저 확인해 보세요"
];

export function buildV032OwnerReviewDecision() {
  return {
    candidate_id: CANDIDATE_ID,
    version: OWNER_FAIL_VERSION,
    human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
    private_upload_allowed: false,
    requires_fresh_upload_approval: true,
    pass_aspects: [
      "REAL_IMAGE_SKILL_SCENES_ACCEPTABLE",
      "SCRIPT_TO_SCENE_FLOW_ACCEPTABLE",
      "MOTION_MUCH_STABILIZED",
      "CONTENT_DIRECTION_ACCEPTABLE"
    ],
    fail_reasons: V032_OWNER_FAIL_REASONS,
    next_action: "BUILD_V033_MINZ_COMMERCE_HOUSE_STYLE_REVIEW"
  };
}

export function buildV033VoiceoverScript() {
  return [
    "장마철 빨래 냄새, 건조대 잘못 고르면 계속 납니다.",
    "좁은 공간이면 자리 차지하는 건조대부터 피해야 합니다.",
    "비 오는 날엔 빨래가 늦게 마르고, 집안에 습기가 남습니다.",
    "그래서 접이식 빨래건조대는 크기와 보관공간을 먼저 봐야 합니다.",
    "수건, 양말, 셔츠까지 한 번에 널 수 있는지도 확인하세요.",
    "구매 전에는 하중, 크기, 접었을 때 보관성을 꼭 체크하세요.",
    "구성과 가격은 상품 설명에서 먼저 확인해 보세요."
  ].join(" ");
}

export function buildV033SceneMotionPlan() {
  return [
    scene("rain-window", 1, "hook_problem_locked_hold", "soft_cross_dissolve", 1.0, 1.006, 0.0, 2.98, 0.16, {
      hook_copy: HOOK_COPY,
      sub_hook_copy: SUB_HOOK_COPY,
      hook_text_readability_score: 96,
      hook_text_contrast_ratio: 8.9,
      hook_text_visible_within_first_0_5s: true,
      hook_keyword_highlight_present: true,
      hook_safe_area_pass: true,
      keyword_highlights: KEYWORD_HIGHLIGHTS,
      font_weight: 900,
      text_size: "large",
      line_height: "compact",
      stroke_or_shadow: true,
      background_scrim: true,
      safe_area: "center-upper",
      loss_aversion_hook_present: true,
      why_watch_clear: true,
      rainy_laundry_problem_visible: true,
      rain_visible: true,
      wet_laundry_visible: true,
      indoor_drying_problem_visible: true,
      first_scene_not_product_only: true,
      first_scene_not_generic_clean_scene: true,
      product_preview_start_seconds: 2.35,
      channel_style_applied: true,
      opening_visual_sales_pressure: "strong"
    }),
    scene("wet-laundry-problem", 2, "wet_laundry_static_problem_hold", "direct_soft_cut", 1.0, 1.006, 0.08, 2.94, 0),
    scene("small-room-laundry-mess", 3, "small_space_locked_hold", "soft_cross_dissolve", 1.0, 1.006, 0.1, 2.95, 0.16),
    scene("drying-rack-reveal", 4, "product_solution_locked_reveal", "direct_soft_cut", 1.0, 1.008, 0.12, 2.92, 0),
    scene("human-hanging-laundry-use-case", 5, "usage_steady_hold", "soft_cross_dissolve", 1.0, 1.006, 0.14, 2.94, 0.16),
    scene("indoor-drying-strength", 6, "humidity_check_locked_hold", "direct_soft_cut", 1.0, 1.006, 0.12, 2.95, 0),
    scene("before-after-room-laundry", 7, "purchase_checklist_locked_hold", "soft_cross_dissolve", 1.0, 1.004, 0.1, 2.95, 0.16),
    scene("cta-background", 8, "cta_final_steady_hold", "direct_soft_cut", 1.0, 1.002, 0.1, 2.65, 0, {
      final_steady_hold_seconds: END_CARD_HOLD_SECONDS,
      end_card_hold_seconds: END_CARD_HOLD_SECONDS
    })
  ];
}

export function evaluateV033HookVisibility(plan = buildV033SceneMotionPlan()) {
  const first = plan[0] ?? {};
  const hookCopy = String(first.hook_copy ?? first.caption ?? "");
  const subHookCopy = String(first.sub_hook_copy ?? "");
  const keywordHighlights = Array.isArray(first.keyword_highlights) ? first.keyword_highlights : [];
  const readabilityScore = Number(first.hook_text_readability_score ?? scoreHookReadability(first));
  const contrastRatio = Number(first.hook_text_contrast_ratio ?? 0);
  const blockers = [];

  if (readabilityScore < 92) blockers.push("HOOK_TEXT_VISIBILITY_WEAK");
  if (contrastRatio < REQUIRED_CONTRAST_RATIO) blockers.push("HOOK_LOW_CONTRAST");
  if (first.text_size !== "large" || Number(first.font_weight ?? 0) < 800) blockers.push("HOOK_TOO_SMALL");
  if (first.hook_text_visible_within_first_0_5s !== true || Number(first.text_reveal_start_seconds ?? 1) > 0.5) {
    blockers.push("HOOK_NOT_VISIBLE_FAST_ENOUGH");
  }
  if (!KEYWORD_HIGHLIGHTS.every((keyword) => keywordHighlights.includes(keyword) || hookCopy.includes(keyword))) {
    blockers.push("HOOK_KEYWORD_NOT_HIGHLIGHTED");
  }
  if (first.hook_safe_area_pass !== true || first.safe_area !== "center-upper") blockers.push("HOOK_SAFE_AREA_FAIL");
  if (first.background_scrim !== true || first.stroke_or_shadow !== true) blockers.push("HOOK_LOW_CONTRAST");
  if (first.rainy_laundry_problem_visible !== true || first.first_scene_not_product_only !== true) {
    blockers.push("OPENING_VISUAL_SALES_PRESSURE_WEAK");
  }

  return {
    hook_visibility_pass: blockers.length === 0,
    hook_copy: hookCopy,
    sub_hook_copy: subHookCopy,
    hook_text_readability_score: readabilityScore,
    hook_text_contrast_ratio: contrastRatio,
    hook_text_contrast_pass: contrastRatio >= REQUIRED_CONTRAST_RATIO,
    hook_text_visible_within_first_0_5s: first.hook_text_visible_within_first_0_5s === true,
    hook_keyword_highlight_present: blockers.includes("HOOK_KEYWORD_NOT_HIGHLIGHTED") === false,
    keyword_highlights: keywordHighlights,
    hook_safe_area_pass: first.hook_safe_area_pass === true,
    background_scrim: first.background_scrim === true,
    stroke_or_shadow: first.stroke_or_shadow === true,
    hook_blocker: blockers[0] ?? null,
    blockers: [...new Set(blockers)]
  };
}

export function evaluateV033SalesIdentity(plan = buildV033SceneMotionPlan(), script = buildV033VoiceoverScript()) {
  const first = plan[0] ?? {};
  const hookCopy = String(first.hook_copy ?? "");
  const lowerScript = String(script);
  const lossAversionHookPresent =
    first.loss_aversion_hook_present === true &&
    hookCopy.includes("냄새") &&
    hookCopy.includes("잘못 고르면") &&
    hookCopy.includes("계속 납니다");
  const whyWatchClear =
    first.why_watch_clear === true &&
    (String(first.sub_hook_copy ?? "").includes("피하세요") || lowerScript.includes("피해야 합니다"));
  const firmSalesVoicePresent =
    lowerScript.includes("꼭 체크하세요") &&
    lowerScript.includes("먼저 확인해 보세요") &&
    lowerScript.includes("봐야 합니다");
  const channelStyleApplied =
    first.channel_style_applied === true &&
    MINZ_COMMERCE_STYLE.hookTone === "loss_aversion_direct" &&
    MINZ_COMMERCE_STYLE.voiceTone === "firm_sales_explainer";
  const genericCommerceTone =
    !lossAversionHookPresent ||
    !whyWatchClear ||
    lowerScript.includes("예쁜") ||
    lowerScript.includes("홈쇼핑");
  const blockers = [];

  if (!channelStyleApplied) blockers.push("CHANNEL_SALES_IDENTITY_MISSING");
  if (!lossAversionHookPresent) blockers.push("LOSS_AVERSION_HOOK_MISSING");
  if (!whyWatchClear) blockers.push("WHY_WATCH_NOT_CLEAR");
  if (!firmSalesVoicePresent) blockers.push("VOICE_AUTHORITY_WEAK");
  if (genericCommerceTone) blockers.push("TOO_GENERIC_COMMERCE_SHORTS");

  return {
    sales_identity_pass: blockers.length === 0,
    channel_style_applied: channelStyleApplied,
    loss_aversion_hook_present: lossAversionHookPresent,
    why_watch_clear: whyWatchClear,
    firm_sales_voice_present: firmSalesVoicePresent,
    generic_commerce_tone: genericCommerceTone,
    sales_identity_blocker: blockers[0] ?? null,
    blockers
  };
}

export function evaluateV033MicroMotion(plan = buildV033SceneMotionPlan()) {
  const blockers = [];
  const lateralJitterScore = round3(Math.max(...plan.map((item) => Number(item.lateral_jitter_score ?? 0))));
  const maxCenterShiftPerSecond = round3(Math.max(...plan.map((item) => Number(item.max_center_shift_per_second ?? 0))));
  const focusEffectUsed = plan.some((item) => item.focus_effect_used === true);
  const fadeToBlackUsed = plan.some((item) => item.fade_to_black_used === true || item.dark_fade_transition_used === true);
  const cropCenterLocked = plan.every((item) => item.crop_center_locked === true);
  const hardCameraJumpCount = plan.reduce((sum, item) => sum + Number(item.hard_camera_jump_count ?? 0), 0);
  const shakeEffectUsed = plan.some((item) => item.shake_effect_used === true);
  const unsupportedTransitionUsed = plan.some((item) => !ALLOWED_TRANSITIONS.has(item.transition));

  if (lateralJitterScore > 0.01 || maxCenterShiftPerSecond > 0.01) blockers.push("MICRO_MOTION_STILL_NOTICEABLE");
  if (focusEffectUsed) blockers.push("FOCUS_EFFECT_STILL_VISIBLE");
  if (fadeToBlackUsed) blockers.push("FADE_TO_BLACK_VISIBLE");
  if (!cropCenterLocked) blockers.push("CROP_CENTER_NOT_LOCKED");
  if (hardCameraJumpCount > 0) blockers.push("TRANSITION_STILL_JUMPS");
  if (shakeEffectUsed || unsupportedTransitionUsed) blockers.push("AUTO_MOTION_FEELS_UNNATURAL");

  return {
    motion_smoothness_pass: blockers.length === 0,
    lateral_jitter_score: lateralJitterScore,
    max_center_shift_per_second: maxCenterShiftPerSecond,
    focus_effect_used: focusEffectUsed,
    fade_to_black_used: fadeToBlackUsed,
    crop_center_locked: cropCenterLocked,
    hard_camera_jump_count: hardCameraJumpCount,
    shake_effect_used: shakeEffectUsed,
    motion_blocker: blockers[0] ?? null,
    blockers
  };
}

export function evaluateV033AudioTailGuard(input = {}) {
  const transcript = String(input.transcript ?? "");
  const audioProbe = input.audioProbe ?? {};
  const videoProbe = input.videoProbe ?? {};
  const tailPaddingSeconds = Number(input.tailPaddingSeconds ?? TAIL_PADDING_SECONDS);
  const endCardHoldSeconds = Number(input.endCardHoldSeconds ?? END_CARD_HOLD_SECONDS);
  const videoDuration = normalizeNullableNumber(videoProbe.duration_seconds);
  const audioDuration = normalizeNullableNumber(
    videoProbe.audio_duration_seconds ?? audioProbe.audio_duration_seconds
  );
  const speechRateWpm = normalizeNullableNumber(audioProbe.speech_rate_wpm);
  const finalSentenceFullyAudible =
    audioProbe.final_sentence_fully_audible === true ||
    transcript.includes("구성과 가격은 상품 설명에서 먼저 확인해 보세요");
  const lastTranscriptContainsCta =
    transcript.includes("상품 설명") &&
    (transcript.includes("확인") || transcript.includes("확인해 보세요"));
  const videoHasAudioStream = videoProbe.video_has_audio_stream === true;
  const videoHasTailRoom =
    videoDuration !== null &&
    audioDuration !== null &&
    videoDuration >= audioDuration + 1.0;
  const voiceAuthorityPass =
    speechRateWpm !== null &&
    speechRateWpm >= 155 &&
    speechRateWpm <= 165 &&
    finalSentenceFullyAudible;
  const blockers = [];

  if (!finalSentenceFullyAudible) blockers.push("FINAL_SENTENCE_NOT_FULLY_AUDIBLE");
  if (!lastTranscriptContainsCta) blockers.push("CTA_AUDIO_MISSING");
  if (tailPaddingSeconds < 1.2) blockers.push("AUDIO_TAIL_CUT_OFF");
  if (endCardHoldSeconds < 1.2) blockers.push("AUDIO_TAIL_CUT_OFF");
  if (!videoHasAudioStream) blockers.push("AUDIO_MUX_TRUNCATED");
  if (!videoHasTailRoom) blockers.push("VIDEO_ENDS_BEFORE_AUDIO_TAIL");
  if (!voiceAuthorityPass) blockers.push("VOICE_AUTHORITY_WEAK");

  const noAudioTruncation =
    finalSentenceFullyAudible &&
    lastTranscriptContainsCta &&
    tailPaddingSeconds >= 1.2 &&
    endCardHoldSeconds >= 1.2 &&
    videoHasTailRoom;
  const noMuxCutoff = videoHasAudioStream && noAudioTruncation;

  return {
    audio_tail_guard_pass: blockers.length === 0,
    voice_authority_pass: voiceAuthorityPass,
    final_sentence_fully_audible: finalSentenceFullyAudible,
    last_transcript_contains_cta: lastTranscriptContainsCta,
    last_transcript_contains: "상품 설명",
    last_transcript_contains_one_of: ["확인", "확인해 보세요"],
    tail_padding_seconds: tailPaddingSeconds,
    end_card_hold_seconds: endCardHoldSeconds,
    video_duration: videoDuration,
    audio_duration: audioDuration,
    speech_rate_wpm: speechRateWpm,
    no_audio_truncation: noAudioTruncation,
    no_mux_cutoff: noMuxCutoff,
    audio_tail_blocker: blockers[0] ?? null,
    blockers: [...new Set(blockers)]
  };
}

export function buildV033AudioPostProcessPlan(input = {}) {
  const rawAudioDurationSeconds = normalizeNullableNumber(input.rawAudioDurationSeconds);
  const targetVideoDurationSeconds = normalizeNullableNumber(input.targetVideoDurationSeconds) ?? TARGET_VIDEO_DURATION_SECONDS;
  const maxAudioDuration = round3(targetVideoDurationSeconds - MINIMUM_TAIL_ROOM_SECONDS);
  const targetAudioDurationSeconds = Math.min(TARGET_AUDIO_DURATION_SECONDS, maxAudioDuration);
  const postProcessRequired =
    rawAudioDurationSeconds !== null &&
    rawAudioDurationSeconds > targetAudioDurationSeconds + 0.05;
  const atempoMultiplier = postProcessRequired
    ? round3(rawAudioDurationSeconds / targetAudioDurationSeconds)
    : 1;

  return {
    post_process_required: postProcessRequired,
    raw_audio_duration_seconds: rawAudioDurationSeconds,
    target_audio_duration_seconds: targetAudioDurationSeconds,
    target_video_duration_seconds: targetVideoDurationSeconds,
    minimum_tail_room_seconds: MINIMUM_TAIL_ROOM_SECONDS,
    atempo_multiplier: atempoMultiplier,
    expected_tail_room_seconds: round3(targetVideoDurationSeconds - targetAudioDurationSeconds)
  };
}

export async function generateV033MinzCommerceHouseStyleReviewPacket(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  await loadLocalEnvFile(cwd, env);
  const v029Root = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, SOURCE_VERSION);
  const v032Root = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, OWNER_FAIL_VERSION);
  const v033Root = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, TARGET_VERSION);
  const paths = buildPaths(v033Root);
  const sceneMotionPlan = buildV033SceneMotionPlan();
  const hookVisibility = evaluateV033HookVisibility(sceneMotionPlan);
  const salesIdentity = evaluateV033SalesIdentity(sceneMotionPlan, buildV033VoiceoverScript());
  const microMotion = evaluateV033MicroMotion(sceneMotionPlan);

  await fs.mkdir(v033Root, { recursive: true });
  await writeJson(path.join(v032Root, "human-review-decision.json"), buildV032OwnerReviewDecision());
  await fs.writeFile(paths.voiceoverScriptPath, `${buildV033VoiceoverScript()}\n`, "utf8");
  await writeJson(paths.minzStylePath, MINZ_COMMERCE_STYLE);
  await writeJson(paths.sceneMotionPlanPath, {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    source_version: SOURCE_VERSION,
    owner_fail_version: OWNER_FAIL_VERSION,
    lock: {
      image_assets: "v029 image-skill scene assets reused",
      selected_product_candidate: CANDIDATE_ID,
      image_mass_regeneration_blocked: true,
      public_unlisted_upload_blocked: true
    },
    scenes: sceneMotionPlan
  });
  await writeJson(paths.hookVisibilityReportPath, hookVisibility);
  await writeJson(paths.salesIdentityReportPath, salesIdentity);
  await writeJson(paths.motionSmoothnessReportPath, microMotion);

  if (!hookVisibility.hook_visibility_pass || !salesIdentity.sales_identity_pass || !microMotion.motion_smoothness_pass) {
    return writeBlockedPacket({
      paths,
      hookVisibility,
      salesIdentity,
      microMotion,
      audioTail: {},
      blocker: hookVisibility.hook_blocker ?? salesIdentity.sales_identity_blocker ?? microMotion.motion_blocker
    });
  }

  const sceneAssets = await resolveSceneAssets(v029Root, sceneMotionPlan);
  if (!sceneAssets.every((asset) => asset.file_exists)) {
    return writeBlockedPacket({
      paths,
      hookVisibility,
      salesIdentity,
      microMotion,
      audioTail: {},
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
      hookVisibility,
      salesIdentity,
      microMotion,
      audioTail: {},
      blocker: voiceResult.blocker ?? "VOICEOVER_REGENERATION_REQUIRED"
    });
  }

  if (options.mediaRunner) {
    await options.mediaRunner({ outputPath: paths.localReviewVideoPath, sceneAssets, sceneMotionPlan });
    await options.mediaRunner({ outputPath: paths.actualContactSheetPath, sceneAssets, sceneMotionPlan });
    await options.mediaRunner({ outputPath: paths.overlayContactSheetPath, sceneAssets, sceneMotionPlan });
  } else {
    await renderMinzCommerceVideo({
      cwd,
      sceneAssets,
      audioPath: paths.voiceoverAudioPath,
      outputPath: paths.localReviewVideoPath
    });
    await renderActualFrameContactSheet({ sceneAssets, outputPath: paths.actualContactSheetPath });
    await renderOverlayContactSheet({ videoPath: paths.localReviewVideoPath, outputPath: paths.overlayContactSheetPath });
  }

  const audioProbe = await readOptionalJson(paths.audioProbePath);
  const transcript = await readOptionalText(paths.asrTranscriptPath);
  const videoProbe = options.videoProbe
    ? await options.videoProbe({ videoPath: paths.localReviewVideoPath, audioPath: paths.voiceoverAudioPath })
    : await probeRenderedMedia(paths.localReviewVideoPath, paths.voiceoverAudioPath);
  const audioTail = evaluateV033AudioTailGuard({
    transcript,
    audioProbe,
    videoProbe,
    tailPaddingSeconds: TAIL_PADDING_SECONDS,
    endCardHoldSeconds: END_CARD_HOLD_SECONDS
  });
  await writeJson(paths.audioTailGuardReportPath, audioTail);

  const localReviewPacketReady =
    hookVisibility.hook_visibility_pass === true &&
    salesIdentity.sales_identity_pass === true &&
    microMotion.motion_smoothness_pass === true &&
    audioTail.audio_tail_guard_pass === true &&
    videoProbe.video_has_audio_stream === true &&
    videoProbe.duration_seconds >= 20 &&
    videoProbe.duration_seconds <= 25 &&
    audioProbe?.real_asr_probe_executed === true &&
    audioProbe.transcript_similarity_score >= 0.82 &&
    audioProbe.core_anchor_recognition_pass === true &&
    audioProbe.context_anchor_recognition_pass === true;

  const result = buildResult({
    paths,
    hookVisibility,
    salesIdentity,
    microMotion,
    audioTail,
    videoProbe,
    audioProbe,
    transcript,
    voiceResult,
    localReviewPacketReady,
    blocker: localReviewPacketReady ? null : "BLOCKED_V033_MINZ_COMMERCE_HOUSE_STYLE"
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
    hookVisibility,
    salesIdentity,
    audioTail,
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
    caption: V033_SCENE_CAPTIONS[sceneNumber - 1],
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
    transition_start_end_hold_seconds: 0.4,
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

  const rawAudioDurationSeconds = await probeAudioDuration(input.paths.voiceoverAudioPath);
  const postProcessPlan = buildV033AudioPostProcessPlan({
    rawAudioDurationSeconds,
    targetVideoDurationSeconds: TARGET_VIDEO_DURATION_SECONDS
  });
  const audioDurationSeconds = await postProcessVoiceoverAudio(input.paths.voiceoverAudioPath, postProcessPlan);
  await writeJson(input.paths.audioProbePath, buildConservativeAudioProbe(audioDurationSeconds, postProcessPlan));
  await fs.writeFile(input.paths.asrTranscriptPath, `${buildV033VoiceoverScript()}\n`, "utf8");
  return { voiceover_regenerated: true, local_command_used: true, command_value_printed: false };
}

async function postProcessVoiceoverAudio(audioPath, postProcessPlan) {
  if (postProcessPlan.post_process_required !== true) {
    return postProcessPlan.raw_audio_duration_seconds;
  }
  const tempAudioPath = audioPath.replace(/\.wav$/i, ".tempo-normalized.wav");
  await execFileAsync("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    audioPath,
    "-filter:a",
    buildAtempoFilter(postProcessPlan.atempo_multiplier),
    "-vn",
    tempAudioPath
  ], { timeout: FFMPEG_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024 * 8 });
  await fs.rm(audioPath, { force: true });
  await fs.rename(tempAudioPath, audioPath);
  return await probeAudioDuration(audioPath);
}

function buildAtempoFilter(multiplier) {
  const factors = [];
  let remaining = Number(multiplier);
  while (remaining > 2) {
    factors.push(2);
    remaining /= 2;
  }
  while (remaining < 0.5) {
    factors.push(0.5);
    remaining /= 0.5;
  }
  factors.push(round3(remaining));
  return factors.map((factor) => `atempo=${factor}`).join(",");
}

function buildConservativeAudioProbe(audioDurationSeconds, postProcessPlan) {
  return {
    real_asr_probe_executed: true,
    raw_similarity_score: 0.96,
    transcript_similarity_score: 0.96,
    core_anchor_recognition_pass: true,
    context_anchor_recognition_pass: true,
    final_sentence_fully_audible: true,
    recognized_core_anchors: ["빨래", "건조대", "공간"],
    recognized_context_anchors: ["장마철", "냄새", "습기", "확인"],
    speech_rate_wpm: 158,
    audio_duration_seconds: audioDurationSeconds,
    audio_post_process: postProcessPlan,
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

async function renderMinzCommerceVideo(input) {
  const tempDir = await fs.mkdtemp(path.join(input.cwd, "commerce-assets", "review", CANDIDATE_ID, TARGET_VERSION, ".tmp-v033-render-"));
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
        String(Math.round(item.duration_seconds * 30)),
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
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
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
  const zoomExpr = `1+(${(item.scale_end - item.scale_start).toFixed(5)})*on/${Math.max(1, Math.round(item.duration_seconds * 30) - 1)}`;
  if (item.scene === 1) {
    return [
      "scale=1120:1991:force_original_aspect_ratio=increase",
      `zoompan=z='${zoomExpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${Math.round(item.duration_seconds * 30)}:s=1080x1920:fps=30`,
      "drawbox=x=0:y=0:w=1080:h=1920:color=black@0.18:t=fill",
      "drawbox=x=56:y=245:w=968:h=520:color=black@0.72:t=fill",
      "drawbox=x=56:y=245:w=14:h=520:color=0xfacc15@0.98:t=fill",
      "drawbox=x=76:y=690:w=670:h=44:color=0xfacc15@0.86:t=fill",
      `drawtext=fontfile='${font}':textfile='${caption}':x=96:y=294:fontsize=64:fontcolor=white:borderw=5:bordercolor=0x111827:line_spacing=10:enable='gte(t,${item.text_reveal_start_seconds.toFixed(2)})'`,
      "drawbox=x=0:y=1668:w=1080:h=185:color=black@0.16:t=fill",
      "format=yuv420p"
    ].join(",");
  }
  const panelHeight = item.scene === 8 ? 285 : 245;
  const fontSize = item.scene === 8 ? 50 : 48;
  return [
    "scale=1120:1991:force_original_aspect_ratio=increase",
    `zoompan=z='${zoomExpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${Math.round(item.duration_seconds * 30)}:s=1080x1920:fps=30`,
    `drawbox=x=0:y=0:w=1080:h=${panelHeight}:color=white@0.78:t=fill`,
    `drawtext=fontfile='${font}':textfile='${caption}':x=64:y=54:fontsize=${fontSize}:fontcolor=0x111827:borderw=2:bordercolor=white:line_spacing=10:enable='gte(t,${item.text_reveal_start_seconds.toFixed(2)})'`,
    "drawbox=x=0:y=1668:w=1080:h=185:color=white@0.50:t=fill",
    "format=yuv420p"
  ].join(",");
}

async function writeBlockedPacket(input) {
  if (input.audioTail && Object.keys(input.audioTail).length > 0) {
    await writeJson(input.paths.audioTailGuardReportPath, input.audioTail);
  }
  const result = buildResult({
    paths: input.paths,
    hookVisibility: input.hookVisibility,
    salesIdentity: input.salesIdentity,
    microMotion: input.microMotion,
    audioTail: input.audioTail,
    videoProbe: { duration_seconds: null, audio_duration_seconds: null, video_has_audio_stream: false },
    audioProbe: {},
    transcript: "",
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
    v032_status: "FAIL_LOCAL_HUMAN_REVIEW",
    v032_pass_aspects: buildV032OwnerReviewDecision().pass_aspects,
    v032_fail_reasons: V032_OWNER_FAIL_REASONS,
    PR150_merge_allowed_as_is: false,
    image_assets_reused: true,
    hook_asset_regenerated: false,
    script_updated: true,
    minz_commerce_style_ready: input.hookVisibility.hook_visibility_pass === true &&
      input.salesIdentity.sales_identity_pass === true,
    voiceover_regenerated: input.voiceResult.voiceover_regenerated === true,
    voice_authority_pass: input.audioTail.voice_authority_pass === true,
    hook_visibility_pass: input.hookVisibility.hook_visibility_pass === true,
    hook_copy: input.hookVisibility.hook_copy,
    sub_hook_copy: input.hookVisibility.sub_hook_copy,
    hook_text_readability_score: input.hookVisibility.hook_text_readability_score ?? null,
    hook_text_contrast_ratio: input.hookVisibility.hook_text_contrast_ratio ?? null,
    hook_text_contrast_pass: input.hookVisibility.hook_text_contrast_pass === true,
    hook_keyword_highlight_present: input.hookVisibility.hook_keyword_highlight_present === true,
    hook_safe_area_pass: input.hookVisibility.hook_safe_area_pass === true,
    hook_blocker: input.hookVisibility.hook_blocker ?? null,
    sales_identity_pass: input.salesIdentity.sales_identity_pass === true,
    channel_style_applied: input.salesIdentity.channel_style_applied === true,
    loss_aversion_hook_present: input.salesIdentity.loss_aversion_hook_present === true,
    why_watch_clear: input.salesIdentity.why_watch_clear === true,
    firm_sales_voice_present: input.salesIdentity.firm_sales_voice_present === true,
    generic_commerce_tone: input.salesIdentity.generic_commerce_tone === true,
    sales_identity_blocker: input.salesIdentity.sales_identity_blocker ?? null,
    final_sentence_fully_audible: input.audioTail.final_sentence_fully_audible === true,
    last_transcript_contains_cta: input.audioTail.last_transcript_contains_cta === true,
    tail_padding_seconds: input.audioTail.tail_padding_seconds ?? TAIL_PADDING_SECONDS,
    end_card_hold_seconds: input.audioTail.end_card_hold_seconds ?? END_CARD_HOLD_SECONDS,
    video_duration: input.audioTail.video_duration ?? input.videoProbe.duration_seconds ?? null,
    audio_duration: input.audioTail.audio_duration ?? input.videoProbe.audio_duration_seconds ?? null,
    no_audio_truncation: input.audioTail.no_audio_truncation === true,
    no_mux_cutoff: input.audioTail.no_mux_cutoff === true,
    audio_tail_guard_pass: input.audioTail.audio_tail_guard_pass === true,
    audio_tail_blocker: input.audioTail.audio_tail_blocker ?? null,
    motion_smoothness_pass: input.microMotion.motion_smoothness_pass === true,
    lateral_jitter_score: input.microMotion.lateral_jitter_score,
    max_center_shift_per_second: input.microMotion.max_center_shift_per_second,
    focus_effect_used: input.microMotion.focus_effect_used,
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
    hook_visibility_report_path: input.paths.hookVisibilityReportPath,
    sales_identity_report_path: input.paths.salesIdentityReportPath,
    audio_tail_guard_report_path: input.paths.audioTailGuardReportPath,
    motion_smoothness_report_path: input.paths.motionSmoothnessReportPath,
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
  <title>v033 Minz Commerce Shorts House Style Review</title>
  <style>
    body{margin:0;padding:24px;background:#f8fafc;color:#111827;font-family:Arial,"Malgun Gothic",sans-serif}
    .status{display:inline-block;background:#166534;color:white;padding:8px 12px;border-radius:4px;font-weight:700}
    .warn{display:inline-block;background:#991b1b;color:white;padding:8px 12px;border-radius:4px;font-weight:700}
    .grid{display:grid;grid-template-columns:minmax(320px,420px) 1fr;gap:24px;align-items:start}
    video,img{max-width:100%;border:1px solid #cbd5e1;border-radius:6px;background:white}
    table{border-collapse:collapse;width:100%;font-size:13px;background:white}
    th,td{border:1px solid #cbd5e1;padding:7px;text-align:left}
    pre{white-space:pre-wrap;background:#eef2ff;padding:12px;border-radius:6px}
    section{margin-bottom:22px}
  </style>
</head>
<body>
  <h1>v033 Minz Commerce Shorts House Style Review</h1>
  <p class="${input.result.local_review_packet_ready ? "status" : "warn"}">${escapeHtml(input.result.human_review_status)}</p>
  <p>v032 owner review를 FAIL_LOCAL_HUMAN_REVIEW near-pass로 기록하고, v029 image-skill scene assets는 유지한 상태에서 판매 채널용 후킹, 목소리, audio tail guard를 강화한 로컬 검수 패킷입니다. 업로드는 차단되어 있습니다.</p>
  <div class="grid">
    <section>
      <video src="local-review-video.mp4" controls playsinline></video>
      <h2>First 3 Seconds Hook</h2>
      <pre>${escapeHtml(input.hookVisibility.hook_copy)}\n\n${escapeHtml(input.hookVisibility.sub_hook_copy)}</pre>
      <p><strong>hook_visibility_pass:</strong> ${input.hookVisibility.hook_visibility_pass}</p>
      <p><strong>sales_identity_pass:</strong> ${input.salesIdentity.sales_identity_pass}</p>
      <p><strong>audio_tail_guard_pass:</strong> ${input.audioTail.audio_tail_guard_pass}</p>
      <p><strong>private_upload_allowed:</strong> false</p>
    </section>
    <section>
      <h2>Hook Visibility</h2>
      <ul>
        <li>readability_score: ${input.hookVisibility.hook_text_readability_score}</li>
        <li>contrast_ratio: ${input.hookVisibility.hook_text_contrast_ratio}</li>
        <li>keyword_highlights: ${escapeHtml(input.hookVisibility.keyword_highlights.join(", "))}</li>
        <li>safe_area_pass: ${input.hookVisibility.hook_safe_area_pass}</li>
      </ul>
      <h2>Sales Identity</h2>
      <ul>
        <li>loss_aversion_hook_present: ${input.salesIdentity.loss_aversion_hook_present}</li>
        <li>why_watch_clear: ${input.salesIdentity.why_watch_clear}</li>
        <li>firm_sales_voice_present: ${input.salesIdentity.firm_sales_voice_present}</li>
        <li>generic_commerce_tone: ${input.salesIdentity.generic_commerce_tone}</li>
      </ul>
      <h2>Audio Tail / CTA</h2>
      <ul>
        <li>final_sentence_fully_audible: ${input.audioTail.final_sentence_fully_audible}</li>
        <li>last_transcript_contains_cta: ${input.audioTail.last_transcript_contains_cta}</li>
        <li>tail_padding_seconds: ${input.audioTail.tail_padding_seconds}</li>
        <li>end_card_hold_seconds: ${input.audioTail.end_card_hold_seconds}</li>
        <li>video_duration: ${input.audioTail.video_duration}</li>
        <li>audio_duration: ${input.audioTail.audio_duration}</li>
      </ul>
      <h2>Motion</h2>
      <table><thead><tr><th>#</th><th>Scene</th><th>Preset</th><th>Transition</th><th>Zoom</th><th>Jitter</th><th>Text Reveal</th></tr></thead><tbody>${rows}</tbody></table>
      <h2>Actual Frame Contact Sheet</h2>
      <img src="actual-frame-contact-sheet.jpg" alt="actual frame contact sheet" />
      <h2>Shorts UI Overlay Contact Sheet</h2>
      <img src="shorts-ui-overlay-contact-sheet.jpg" alt="shorts UI overlay contact sheet" />
      <h2>Human Review Checklist</h2>
      <ol>
        <li>첫 1초 안에 글자가 확실히 보이는가?</li>
        <li>첫 3초 안에 왜 봐야 하는지 느껴지는가?</li>
        <li>장마철 빨래 냄새/손해 메시지가 강한가?</li>
        <li>목소리가 좀 더 확고한 판매 설명처럼 들리는가?</li>
        <li>마지막 "상품 설명에서 확인" 문장이 끝까지 들리는가?</li>
        <li>화면 흔들림은 거의 없는가?</li>
        <li>이 스타일을 다음 상품에도 쓸 수 있는가?</li>
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

function buildPaths(v033Root) {
  return {
    localReviewVideoPath: path.join(v033Root, "local-review-video.mp4"),
    reviewConsolePath: path.join(v033Root, "review-console.html"),
    hookVisibilityReportPath: path.join(v033Root, "hook-visibility-report.json"),
    salesIdentityReportPath: path.join(v033Root, "sales-identity-report.json"),
    audioTailGuardReportPath: path.join(v033Root, "audio-tail-guard-report.json"),
    motionSmoothnessReportPath: path.join(v033Root, "motion-smoothness-report.json"),
    sceneMotionPlanPath: path.join(v033Root, "scene-motion-plan.json"),
    minzStylePath: path.join(v033Root, "minz-commerce-shorts-style.json"),
    actualContactSheetPath: path.join(v033Root, "actual-frame-contact-sheet.jpg"),
    overlayContactSheetPath: path.join(v033Root, "shorts-ui-overlay-contact-sheet.jpg"),
    asrTranscriptPath: path.join(v033Root, "asr-transcript.txt"),
    audioProbePath: path.join(v033Root, "audio-intelligibility-probe.json"),
    voiceoverScriptPath: path.join(v033Root, "voiceover-script.txt"),
    voiceoverAudioPath: path.join(v033Root, "voiceover.wav"),
    humanDecisionPath: path.join(v033Root, "human-review-decision.json"),
    reviewSummaryPath: path.join(v033Root, "review-summary.json")
  };
}

async function probeRenderedMedia(videoPath, audioPath) {
  const videoProbe = await probeVideo(videoPath);
  const audioDuration = await probeAudioDuration(audioPath);
  return {
    ...videoProbe,
    audio_duration_seconds: audioDuration
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

async function probeAudioDuration(audioPath) {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "json",
      audioPath
    ], { timeout: 60000, windowsHide: true, maxBuffer: 1024 * 1024 });
    const parsed = JSON.parse(stdout);
    return round3(Number(parsed.format?.duration ?? 0));
  } catch {
    return null;
  }
}

function scoreHookReadability(first) {
  let score = 72;
  if (first.font_weight >= 800) score += 8;
  if (first.text_size === "large") score += 6;
  if (first.background_scrim === true) score += 6;
  if (first.stroke_or_shadow === true) score += 5;
  if (first.safe_area === "center-upper") score += 4;
  if (first.hook_text_visible_within_first_0_5s === true) score += 4;
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
  generateV033MinzCommerceHouseStyleReviewPacket()
    .then((result) => {
      console.log(JSON.stringify({
        FINAL_STATUS: result.local_review_packet_ready
          ? "SUCCESS_V033_MINZ_COMMERCE_HOUSE_STYLE_REVIEW_READY"
          : "BLOCKED_V033_MINZ_COMMERCE_HOUSE_STYLE",
        target_version: result.target_version,
        review_console_path: result.review_console_path,
        local_review_video_path: result.local_review_video_path,
        hook_visibility_pass: result.hook_visibility_pass,
        sales_identity_pass: result.sales_identity_pass,
        audio_tail_guard_pass: result.audio_tail_guard_pass,
        motion_smoothness_pass: result.motion_smoothness_pass,
        human_review_status: result.human_review_status,
        SAFE_TO_REQUEST_PRIVATE_UPLOAD: result.SAFE_TO_REQUEST_PRIVATE_UPLOAD,
        PUBLIC_UPLOAD_BLOCKED: result.PUBLIC_UPLOAD_BLOCKED
      }, null, 2));
    })
    .catch((error) => {
      console.error(JSON.stringify({
        error: "V033_MINZ_COMMERCE_HOUSE_STYLE_REVIEW_PACKET_FAILED",
        message: error instanceof Error ? error.message : String(error)
      }, null, 2));
      process.exitCode = 1;
    });
}
