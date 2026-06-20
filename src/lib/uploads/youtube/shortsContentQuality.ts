export type ShortsContentQualityBlocker =
  | "CONTENT_QUALITY_FAILED"
  | "STATIC_IMAGE_ONLY_VIDEO_BLOCKED"
  | "VOICEOVER_AUDIO_REQUIRED"
  | "VOICEOVER_AUDIO_FILE_MISSING"
  | "VIDEO_AUDIO_STREAM_MISSING"
  | "STORY_SCRIPT_REQUIRED"
  | "WHY_BUY_REASON_REQUIRED"
  | "DEV_PLACEHOLDER_DESCRIPTION_BLOCKED"
  | "CAPTION_COUNT_TOO_LOW"
  | "SCENE_COUNT_TOO_LOW"
  | "VIDEO_DURATION_TOO_SHORT"
  | "HOOK_TITLE_MISSING"
  | "HOOK_TITLE_TOO_LATE"
  | "TEXT_OUT_OF_SAFE_AREA"
  | "CAPTION_CLIPPED"
  | "VISUAL_MOTION_TOO_LOW"
  | "USE_CASE_SCENE_MISSING"
  | "VOICEOVER_TOO_SLOW";

export type ShortsContentQualityResult = {
  passed: boolean;
  score: number;
  blocked_reasons: ShortsContentQualityBlocker[];
  hook_text_present: boolean;
  problem_text_present: boolean;
  why_buy_reason_present: boolean;
  target_customer_present: boolean;
  product_benefit_present: boolean;
  caution_or_check_before_buy_present: boolean;
  cta_present: boolean;
  korean_voiceover_script_present: boolean;
  voiceover_audio_present: boolean;
  voiceover_audio_file_present: boolean;
  video_has_audio_stream: boolean;
  audio_muxed_into_video: boolean;
  audio_mime_type: string | null;
  explicit_audio_unavailable_blocker: boolean;
  voiceover_audio_ready: boolean;
  caption_count: number;
  scene_count: number;
  duration_seconds: number;
  audio_duration_seconds: number | null;
  audio_video_duration_delta_seconds: number | null;
  static_single_image_only: boolean;
  product_image_present: boolean;
  black_screen_detected: boolean;
  description_not_dev_placeholder: boolean;
  description_contains_no_manual_review_placeholder: boolean;
  hook_title_present: boolean;
  hook_title_first_seen_seconds: number | null;
  hook_title_visible_in_first_1_5_seconds: boolean;
  hook_title_safe_area_pass: boolean;
  caption_safe_area_pass: boolean;
  all_text_inside_mobile_safe_area: boolean;
  no_text_clipped: boolean;
  max_caption_lines: number | null;
  caption_font_size_readable: boolean;
  caption_contrast_pass: boolean;
  transition_count: number;
  visual_motion_score: number;
  distinct_frame_ratio_pass: boolean;
  use_case_scene_present: boolean;
  kitchen_context_scene_present: boolean;
  utensil_usage_simulation_present: boolean;
  before_after_or_problem_scene_present: boolean;
  voiceover_speed_wpm: number | null;
  voiceover_speed_multiplier: number | null;
  max_silence_between_segments_ms: number | null;
  voiceover_too_slow: boolean;
};

export type StoryDrivenShortsPackage = {
  title: string;
  description: string;
  disclosure_text: string;
  shorts_content_quality: Record<string, unknown>;
  tags: string[];
};

const MIN_CAPTION_COUNT = 7;
const MIN_SCENE_COUNT = 7;
const MIN_DURATION_SECONDS = 20;
const MIN_QUALITY_SCORE = 85;
const MAX_HOOK_TITLE_FIRST_SEEN_SECONDS = 1.5;
const MIN_TRANSITION_COUNT = 6;
const MIN_VISUAL_MOTION_SCORE = 80;
const MIN_VOICEOVER_WPM = 175;
const MAX_VOICEOVER_WPM = 215;
const MIN_VOICEOVER_SPEED_MULTIPLIER = 1.18;
const MAX_VOICEOVER_SPEED_MULTIPLIER = 1.35;
const MAX_SILENCE_BETWEEN_SEGMENTS_MS = 350;
const MAX_CAPTION_LINES = 2;
const REQUIRED_DISCLOSURE =
  "\u203b \uc774 \ucf58\ud150\uce20\ub294 \ucfe0\ud321\ud30c\ud2b8\ub108\uc2a4 \ud65c\ub3d9\uc758 \uc77c\ud658\uc73c\ub85c, \uc774\uc5d0 \ub530\ub978 \uc77c\uc815\uc561\uc758 \uc218\uc218\ub8cc\ub97c \uc81c\uacf5\ubc1b\uc744 \uc218 \uc788\uc2b5\ub2c8\ub2e4.";

const DEV_PLACEHOLDER_PATTERNS = [
  /private product upload package prepared for manual review/i,
  /manual review package/i,
  /prepared package/i,
  /test upload/i,
  /smoke upload/i,
  /\bdev(?:eloper)?\b/i,
  /\bdebug\b/i,
  /\bplaceholder\b/i
];

export function evaluateShortsContentQuality(input: {
  shorts_content_quality?: unknown;
  description?: unknown;
  disclosure_ready?: boolean;
  affiliate_url_present?: boolean;
}): ShortsContentQualityResult {
  const quality = isRecord(input.shorts_content_quality) ? input.shorts_content_quality : {};
  const description = safeTrim(input.description);
  const scenes = Array.isArray(quality.scenes) ? quality.scenes : [];
  const captions = Array.isArray(quality.captions) ? quality.captions : [];
  const durationSeconds = normalizePositiveNumber(quality.duration_seconds);
  const audioDurationSeconds = normalizePositiveNumber(quality.audio_duration_seconds);
  const staticSingleImageOnly = quality.static_single_image_only !== false;
  const explicitAudioUnavailableBlocker = quality.explicit_audio_unavailable_blocker === true;
  const voiceoverAudioPresent = quality.voiceover_audio_present === true;
  const voiceoverAudioFilePresent = quality.voiceover_audio_file_present === true;
  const videoHasAudioStream = quality.video_has_audio_stream === true;
  const audioMuxedIntoVideo = quality.audio_muxed_into_video === true;
  const audioMimeType = safeTrim(quality.audio_mime_type) || null;
  const audioVideoDurationGap = normalizePositiveNumber(quality.audio_video_duration_gap_seconds);
  const audioVideoDurationDelta = audioVideoDurationGap ?? (audioDurationSeconds && durationSeconds
    ? Math.abs(audioDurationSeconds - durationSeconds)
    : null);
  const hookTitleFirstSeenSeconds = normalizeNonNegativeNumber(quality.hook_title_first_seen_seconds);
  const maxCaptionLines = normalizePositiveNumber(quality.max_caption_lines);
  const transitionCount = normalizeNonNegativeNumber(quality.transition_count) ?? 0;
  const visualMotionScore = normalizeNonNegativeNumber(quality.visual_motion_score) ?? 0;
  const voiceoverSpeedWpm = normalizePositiveNumber(quality.voiceover_speed_wpm);
  const voiceoverSpeedMultiplier = normalizePositiveNumber(quality.voiceover_speed_multiplier);
  const maxSilenceBetweenSegmentsMs = normalizeNonNegativeNumber(quality.max_silence_between_segments_ms);
  const hookTitlePresent = Boolean(safeTrim(quality.hook_title));
  const hookTitleVisible = hookTitlePresent &&
    hookTitleFirstSeenSeconds !== null &&
    hookTitleFirstSeenSeconds <= MAX_HOOK_TITLE_FIRST_SEEN_SECONDS;
  const hookTitleSafeAreaPass = quality.hook_title_safe_area_pass === true;
  const captionSafeAreaPass = quality.caption_safe_area_pass === true;
  const allTextInsideMobileSafeArea = quality.all_text_inside_mobile_safe_area === true;
  const noTextClipped = quality.no_text_clipped === true;
  const captionFontSizeReadable = quality.caption_font_size_readable === true;
  const captionContrastPass = quality.caption_contrast_pass === true;
  const distinctFrameRatioPass = quality.distinct_frame_ratio_pass === true;
  const useCaseScenePresent = quality.use_case_scene_present === true;
  const kitchenContextScenePresent = quality.kitchen_context_scene_present === true;
  const utensilUsageSimulationPresent = quality.utensil_usage_simulation_present === true;
  const beforeAfterOrProblemScenePresent = quality.before_after_or_problem_scene_present === true;
  const voiceoverTooSlow = voiceoverSpeedWpm === null ||
    voiceoverSpeedWpm < MIN_VOICEOVER_WPM ||
    voiceoverSpeedWpm > MAX_VOICEOVER_WPM ||
    voiceoverSpeedMultiplier === null ||
    voiceoverSpeedMultiplier < MIN_VOICEOVER_SPEED_MULTIPLIER ||
    voiceoverSpeedMultiplier > MAX_VOICEOVER_SPEED_MULTIPLIER ||
    maxSilenceBetweenSegmentsMs === null ||
    maxSilenceBetweenSegmentsMs > MAX_SILENCE_BETWEEN_SEGMENTS_MS;
  const result: ShortsContentQualityResult = {
    passed: false,
    score: 0,
    blocked_reasons: [],
    hook_text_present: Boolean(safeTrim(quality.hook_text)),
    problem_text_present: Boolean(safeTrim(quality.problem_text)),
    why_buy_reason_present: Boolean(safeTrim(quality.why_buy_reason)),
    target_customer_present: Boolean(safeTrim(quality.target_customer)),
    product_benefit_present: Boolean(safeTrim(quality.product_benefit)),
    caution_or_check_before_buy_present: Boolean(safeTrim(quality.caution_or_check_before_buy)),
    cta_present: Boolean(safeTrim(quality.cta_text)),
    korean_voiceover_script_present: Boolean(safeTrim(quality.korean_voiceover_script)),
    voiceover_audio_present: voiceoverAudioPresent,
    voiceover_audio_file_present: voiceoverAudioFilePresent,
    video_has_audio_stream: videoHasAudioStream,
    audio_muxed_into_video: audioMuxedIntoVideo,
    audio_mime_type: audioMimeType,
    explicit_audio_unavailable_blocker: explicitAudioUnavailableBlocker,
    voiceover_audio_ready: voiceoverAudioPresent &&
      voiceoverAudioFilePresent &&
      videoHasAudioStream &&
      audioMuxedIntoVideo &&
      isAllowedAudioMimeType(audioMimeType) &&
      !explicitAudioUnavailableBlocker,
    caption_count: captions.filter((item) => safeTrim(item)).length,
    scene_count: scenes.filter(isMeaningfulScene).length,
    duration_seconds: durationSeconds ?? 0,
    audio_duration_seconds: audioDurationSeconds,
    audio_video_duration_delta_seconds: audioVideoDurationDelta,
    static_single_image_only: staticSingleImageOnly,
    product_image_present: quality.product_image_present === true,
    black_screen_detected: quality.black_screen_detected === true,
    description_not_dev_placeholder: !containsDevPlaceholder(description),
    description_contains_no_manual_review_placeholder: !/manual review/i.test(description),
    hook_title_present: hookTitlePresent,
    hook_title_first_seen_seconds: hookTitleFirstSeenSeconds,
    hook_title_visible_in_first_1_5_seconds: hookTitleVisible,
    hook_title_safe_area_pass: hookTitleSafeAreaPass,
    caption_safe_area_pass: captionSafeAreaPass,
    all_text_inside_mobile_safe_area: allTextInsideMobileSafeArea,
    no_text_clipped: noTextClipped,
    max_caption_lines: maxCaptionLines,
    caption_font_size_readable: captionFontSizeReadable,
    caption_contrast_pass: captionContrastPass,
    transition_count: transitionCount,
    visual_motion_score: visualMotionScore,
    distinct_frame_ratio_pass: distinctFrameRatioPass,
    use_case_scene_present: useCaseScenePresent,
    kitchen_context_scene_present: kitchenContextScenePresent,
    utensil_usage_simulation_present: utensilUsageSimulationPresent,
    before_after_or_problem_scene_present: beforeAfterOrProblemScenePresent,
    voiceover_speed_wpm: voiceoverSpeedWpm,
    voiceover_speed_multiplier: voiceoverSpeedMultiplier,
    max_silence_between_segments_ms: maxSilenceBetweenSegmentsMs,
    voiceover_too_slow: voiceoverTooSlow
  };

  const storyReady = [
    result.hook_text_present,
    result.problem_text_present,
    result.target_customer_present,
    result.product_benefit_present,
    result.caution_or_check_before_buy_present,
    result.cta_present,
    result.korean_voiceover_script_present
  ].every(Boolean);

  if (!storyReady) {
    result.blocked_reasons.push("STORY_SCRIPT_REQUIRED");
  }
  if (!result.why_buy_reason_present) {
    result.blocked_reasons.push("WHY_BUY_REASON_REQUIRED");
  }
  if (!voiceoverAudioFilePresent) {
    result.blocked_reasons.push("VOICEOVER_AUDIO_FILE_MISSING");
  }
  if (!videoHasAudioStream || !audioMuxedIntoVideo) {
    result.blocked_reasons.push("VIDEO_AUDIO_STREAM_MISSING");
  }
  if (!result.voiceover_audio_ready || audioVideoDurationDelta !== null && audioVideoDurationDelta > 2) {
    result.blocked_reasons.push("VOICEOVER_AUDIO_REQUIRED");
  }
  if (result.caption_count < MIN_CAPTION_COUNT) {
    result.blocked_reasons.push("CAPTION_COUNT_TOO_LOW");
  }
  if (result.scene_count < MIN_SCENE_COUNT) {
    result.blocked_reasons.push("SCENE_COUNT_TOO_LOW");
  }
  if (result.duration_seconds < MIN_DURATION_SECONDS) {
    result.blocked_reasons.push("VIDEO_DURATION_TOO_SHORT");
  }
  if (!result.hook_title_present) {
    result.blocked_reasons.push("HOOK_TITLE_MISSING");
  }
  if (!result.hook_title_visible_in_first_1_5_seconds) {
    result.blocked_reasons.push("HOOK_TITLE_TOO_LATE");
  }
  if (!result.hook_title_safe_area_pass ||
    !result.caption_safe_area_pass ||
    !result.all_text_inside_mobile_safe_area ||
    !result.caption_font_size_readable ||
    !result.caption_contrast_pass) {
    result.blocked_reasons.push("TEXT_OUT_OF_SAFE_AREA");
  }
  if (!result.no_text_clipped ||
    result.max_caption_lines === null ||
    result.max_caption_lines > MAX_CAPTION_LINES) {
    result.blocked_reasons.push("CAPTION_CLIPPED");
  }
  if (result.transition_count < MIN_TRANSITION_COUNT ||
    result.visual_motion_score < MIN_VISUAL_MOTION_SCORE ||
    !result.distinct_frame_ratio_pass) {
    result.blocked_reasons.push("VISUAL_MOTION_TOO_LOW");
  }
  if (!result.use_case_scene_present ||
    !result.kitchen_context_scene_present ||
    !result.utensil_usage_simulation_present ||
    !result.before_after_or_problem_scene_present) {
    result.blocked_reasons.push("USE_CASE_SCENE_MISSING");
  }
  if (result.voiceover_too_slow) {
    result.blocked_reasons.push("VOICEOVER_TOO_SLOW");
  }
  if (result.static_single_image_only) {
    result.blocked_reasons.push("STATIC_IMAGE_ONLY_VIDEO_BLOCKED");
  }
  if (!result.description_not_dev_placeholder || !result.description_contains_no_manual_review_placeholder) {
    result.blocked_reasons.push("DEV_PLACEHOLDER_DESCRIPTION_BLOCKED");
  }
  if (!result.product_image_present || result.black_screen_detected || input.disclosure_ready !== true || input.affiliate_url_present !== true) {
    result.blocked_reasons.push("CONTENT_QUALITY_FAILED");
  }

  result.blocked_reasons = [...new Set(result.blocked_reasons)];
  const checks = [
    storyReady,
    result.why_buy_reason_present,
    result.voiceover_audio_ready,
    result.voiceover_audio_file_present,
    result.video_has_audio_stream,
    result.audio_muxed_into_video,
    result.caption_count >= MIN_CAPTION_COUNT,
    result.scene_count >= MIN_SCENE_COUNT,
    result.duration_seconds >= MIN_DURATION_SECONDS,
    !result.static_single_image_only,
    result.product_image_present,
    input.disclosure_ready === true,
    input.affiliate_url_present === true,
    result.description_not_dev_placeholder,
    result.description_contains_no_manual_review_placeholder,
    !result.black_screen_detected,
    audioVideoDurationDelta === null || audioVideoDurationDelta <= 2,
    result.hook_title_present,
    result.hook_title_visible_in_first_1_5_seconds,
    result.hook_title_safe_area_pass,
    result.caption_safe_area_pass,
    result.all_text_inside_mobile_safe_area,
    result.no_text_clipped,
    result.max_caption_lines !== null && result.max_caption_lines <= MAX_CAPTION_LINES,
    result.caption_font_size_readable,
    result.caption_contrast_pass,
    result.transition_count >= MIN_TRANSITION_COUNT,
    result.visual_motion_score >= MIN_VISUAL_MOTION_SCORE,
    result.distinct_frame_ratio_pass,
    result.use_case_scene_present,
    result.kitchen_context_scene_present,
    result.utensil_usage_simulation_present,
    result.before_after_or_problem_scene_present,
    !result.voiceover_too_slow
  ];
  result.score = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  if (result.score < MIN_QUALITY_SCORE) {
    result.blocked_reasons = [...new Set<ShortsContentQualityBlocker>([
      ...result.blocked_reasons,
      "CONTENT_QUALITY_FAILED"
    ])];
  }
  result.passed = result.blocked_reasons.length === 0 && result.score >= MIN_QUALITY_SCORE;
  return result;
}

export function buildBilibinStainlessCookingToolsShortsPackage(input: {
  product_name: string;
  selected_affiliate_url: string;
  product_image_present?: boolean;
  voiceover_audio_present?: boolean;
  voiceover_audio_file_present?: boolean;
  video_has_audio_stream?: boolean;
  audio_muxed_into_video?: boolean;
  audio_mime_type?: string;
  audio_duration_seconds?: number;
  hook_title_first_seen_seconds?: number;
  hook_title_safe_area_pass?: boolean;
  caption_safe_area_pass?: boolean;
  all_text_inside_mobile_safe_area?: boolean;
  no_text_clipped?: boolean;
  max_caption_lines?: number;
  caption_font_size_readable?: boolean;
  caption_contrast_pass?: boolean;
  transition_count?: number;
  visual_motion_score?: number;
  distinct_frame_ratio_pass?: boolean;
  use_case_scene_present?: boolean;
  kitchen_context_scene_present?: boolean;
  utensil_usage_simulation_present?: boolean;
  before_after_or_problem_scene_present?: boolean;
  voiceover_speed_wpm?: number;
  voiceover_speed_multiplier?: number;
  max_silence_between_segments_ms?: number;
  audio_video_duration_gap_seconds?: number;
}): StoryDrivenShortsPackage {
  const productName = safeTrim(input.product_name) ||
    "\ube4c\ub9ac\ube48 \uc2a4\ud14c\uc778\ub9ac\uc2a4 \uc870\ub9ac\ub3c4\uad6c 8\uc885 \uc138\ud2b8";
  const affiliateUrl = safeTrim(input.selected_affiliate_url);
  const scenes = [
    { id: "hook", duration_seconds: 3, motion: "slow_zoom_in" },
    { id: "problem", duration_seconds: 3, motion: "pan_left" },
    { id: "product_intro", duration_seconds: 4, motion: "slow_zoom_out" },
    { id: "why_buy", duration_seconds: 4, motion: "pan_right" },
    { id: "target_customer", duration_seconds: 4, motion: "push_in_card" },
    { id: "check_before_buy", duration_seconds: 4, motion: "crop_shift" },
    { id: "cta", duration_seconds: 3, motion: "slow_zoom_in" }
  ];
  const captions = [
    "\uc870\ub9ac\ub3c4\uad6c, \uc11c\ub78d\uc5d0\uc11c \ub9e8\ub0a0 \uc5c9\ud0a4\uc8e0?",
    "\uad6d\uc790\u00b7\ub4a4\uc9d1\uac1c \ucc3e\ub2e4\uac00 \uc694\ub9ac \ud750\ub984\uc774 \ub04a\uae41\ub2c8\ub2e4.",
    "\uae30\ubcf8 \uc870\ub9ac\ub3c4\uad6c 8\uc885\uc744 \ud55c \ubc88\uc5d0 \uc900\ube44",
    "\uc790\ucde8 \uc2dc\uc791, \uc0c8 \uc8fc\ubc29 \uc138\ud305, \uad50\uccb4 \uc2dc\uc810\uc5d0 \uc801\ud569",
    "\ubcf5\uc7a1\ud55c \uc11c\ub78d\uc744 \uc815\ub9ac\ud558\ub824\ub294 \ubd84\uc5d0\uac8c \uc801\ud569",
    "\uad6c\uc131\ud488\u00b7\uc2a4\ud0e0\ub4dc \ud06c\uae30\u00b7\uc190\uc7a1\uc774 \uae38\uc774\ub97c \ud655\uc778",
    "\uac00\uaca9\uacfc \uad6c\uc131\uc740 \ub9c1\ud06c\uc5d0\uc11c \ud655\uc778"
  ];
  const summary = [
    `${productName}`,
    "",
    "\uae30\ubcf8 \uc870\ub9ac\ub3c4\uad6c\ub97c \ud55c \ubc88\uc5d0 \uc900\ube44\ud558\ub824\ub294 \ubd84\uc744 \uc704\ud55c \uc1fc\uce20 \ud328\ud0a4\uc9c0\uc785\ub2c8\ub2e4.",
    "\uc870\ub9ac\ub3c4\uad6c\ub97c \ud558\ub098\uc529 \ucc3e\ub294 \ubd88\ud3b8\uc744 \uc904\uc774\uace0, \uc0c8 \uc8fc\ubc29 \uc138\ud305\uc774\ub098 \uad50\uccb4 \uc2dc\uc810\uc5d0 \uad6c\uc131\uc744 \ud55c \ubc88\uc5d0 \ube44\uad50\ud574\ubcf4\uae30 \uc88b\uc2b5\ub2c8\ub2e4.",
    "\uad6c\ub9e4 \uc804\uc5d0\ub294 \uad6c\uc131\ud488, \uc2a4\ud0e0\ub4dc \ud06c\uae30, \uc190\uc7a1\uc774 \uae38\uc774\ub97c \ud568\uaed8 \ud655\uc778\ud558\uc138\uc694.",
    "",
    "\ucd94\ucc9c \ub300\uc0c1:",
    "- \uc790\ucde8\ub97c \uc2dc\uc791\ud558\ub294 \ubd84",
    "- \uc0c8 \uc8fc\ubc29\uc744 \uc138\ud305\ud558\ub294 \ubd84",
    "- \uae30\ubcf8 \uc870\ub9ac\ub3c4\uad6c\ub97c \ud55c \ubc88\uc5d0 \uad50\uccb4\ud558\ub824\ub294 \ubd84",
    "",
    "\uad6c\ub9e4 \uc804 \ud655\uc778:",
    "- 8\uc885 \uad6c\uc131\ud488\uc774 \ud544\uc694\ud55c \ub3c4\uad6c\uc640 \ub9de\ub294\uc9c0",
    "- \uc2a4\ud0e0\ub4dc \ud06c\uae30\uac00 \uc8fc\ubc29 \uacf5\uac04\uc5d0 \ub9de\ub294\uc9c0",
    "- \uc190\uc7a1\uc774 \uae38\uc774\uc640 \uc7ac\uc9c8\uc774 \uc0ac\uc6a9 \uc2b5\uad00\uacfc \ub9de\ub294\uc9c0",
    "",
    REQUIRED_DISCLOSURE,
    "",
    "\uc81c\ud488 \ud655\uc778:",
    affiliateUrl
  ].filter((line, index, lines) => line || lines[index - 1]).join("\n");

  return {
    title: `${productName} \uc8fc\ubc29 \uc815\ub9ac \ud655\uc778 \ud3ec\uc778\ud2b8`,
    description: summary,
    disclosure_text: REQUIRED_DISCLOSURE,
    tags: ["coupang", "shorts", "kitchen", "private"],
    shorts_content_quality: {
      hook_text: "\uc8fc\ubc29 \uc870\ub9ac\ub3c4\uad6c, \uc11c\ub78d\uc5d0\uc11c \ub9e8\ub0a0 \uc5c9\ud0a4\uc8e0?",
      problem_text: "\uad6d\uc790, \ub4a4\uc9d1\uac1c, \uac70\ud488\uae30 \ucc3e\ub2e4\uac00 \uc694\ub9ac \ud750\ub984\uc774 \ub04a\uae41\ub2c8\ub2e4.",
      why_buy_reason: "\uc790\ucde8 \uc2dc\uc791, \uc0c8 \uc8fc\ubc29 \uc138\ud305, \uc870\ub9ac\ub3c4\uad6c \uad50\uccb4\ud560 \ub54c \ud55c \ubc88\uc5d0 \ub9de\ucd94\uae30 \uc88b\uc2b5\ub2c8\ub2e4.",
      target_customer: "\uc790\ucde8 \uc2dc\uc791, \uc0c8 \uc8fc\ubc29 \uc138\ud305, \uc870\ub9ac\ub3c4\uad6c \uad50\uccb4\ub97c \uace0\ubbfc\ud558\ub294 \ubd84",
      product_benefit: "\uae30\ubcf8 \uc870\ub9ac\ub3c4\uad6c 8\uc885\uc744 \uc2a4\ud0e0\ub4dc\uc640 \ud568\uaed8 \uc815\ub9ac\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4.",
      caution_or_check_before_buy: "\uad6c\uc131\ud488, \uc2a4\ud0e0\ub4dc \ud06c\uae30, \uc190\uc7a1\uc774 \uae38\uc774\ub294 \uad6c\ub9e4 \uc804 \uaf2d \ud655\uc778\ud558\uc138\uc694.",
      cta_text: "\uac00\uaca9\uacfc \uad6c\uc131\uc740 \ub9c1\ud06c\uc5d0\uc11c \ud655\uc778\ud574\ubcf4\uc138\uc694.",
      korean_voiceover_script: "\uc8fc\ubc29 \uc870\ub9ac\ub3c4\uad6c\uac00 \uc11c\ub78d\uc5d0\uc11c \uc5c9\ud0a8\ub2e4\uba74, \uae30\ubcf8 8\uc885 \uad6c\uc131\uacfc \uc2a4\ud0e0\ub4dc \ud06c\uae30\ub97c \ud568\uaed8 \ud655\uc778\ud574\ubcf4\uc138\uc694.",
      voiceover_audio_present: input.voiceover_audio_present === true,
      voiceover_audio_file_present: input.voiceover_audio_file_present === true,
      video_has_audio_stream: input.video_has_audio_stream === true,
      audio_muxed_into_video: input.audio_muxed_into_video === true,
      audio_mime_type: input.audio_mime_type ?? "audio/wav",
      audio_duration_seconds: input.audio_duration_seconds ?? 25,
      captions,
      scenes,
      duration_seconds: 25,
      hook_title: "\uc8fc\ubc29 \uc870\ub9ac\ub3c4\uad6c, \uc544\uc9c1\ub3c4 \uc11c\ub78d\uc5d0 \ub123\uc5b4\ub450\uc138\uc694?",
      hook_title_first_seen_seconds: input.hook_title_first_seen_seconds ?? null,
      hook_title_safe_area_pass: input.hook_title_safe_area_pass === true,
      caption_safe_area_pass: input.caption_safe_area_pass === true,
      all_text_inside_mobile_safe_area: input.all_text_inside_mobile_safe_area === true,
      no_text_clipped: input.no_text_clipped === true,
      max_caption_lines: input.max_caption_lines ?? null,
      caption_font_size_readable: input.caption_font_size_readable === true,
      caption_contrast_pass: input.caption_contrast_pass === true,
      transition_count: input.transition_count ?? null,
      visual_motion_score: input.visual_motion_score ?? null,
      distinct_frame_ratio_pass: input.distinct_frame_ratio_pass === true,
      use_case_scene_present: input.use_case_scene_present === true,
      kitchen_context_scene_present: input.kitchen_context_scene_present === true,
      utensil_usage_simulation_present: input.utensil_usage_simulation_present === true,
      before_after_or_problem_scene_present: input.before_after_or_problem_scene_present === true,
      voiceover_speed_wpm: input.voiceover_speed_wpm ?? null,
      voiceover_speed_multiplier: input.voiceover_speed_multiplier ?? null,
      max_silence_between_segments_ms: input.max_silence_between_segments_ms ?? null,
      audio_video_duration_gap_seconds: input.audio_video_duration_gap_seconds ?? null,
      static_single_image_only: false,
      product_image_present: input.product_image_present !== false,
      black_screen_detected: false
    }
  };
}

function isAllowedAudioMimeType(value: string | null) {
  return value === "audio/wav" || value === "audio/wave" || value === "audio/mpeg" || value === "audio/mp4" || value === "audio/aac";
}

export function containsDevPlaceholder(value: string) {
  return DEV_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value));
}

function isMeaningfulScene(value: unknown) {
  if (typeof value === "string") {
    return Boolean(value.trim());
  }
  if (!isRecord(value)) {
    return false;
  }
  const id = safeTrim(value.id ?? value.shot_id);
  const duration = normalizePositiveNumber(value.duration_seconds ?? value.duration_sec);
  const motion = safeTrim(value.motion ?? value.layout);
  return Boolean(id) && Boolean(duration) && motion !== "none";
}

function normalizePositiveNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function normalizeNonNegativeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
}

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
