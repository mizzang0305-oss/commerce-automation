export type ShortsContentQualityBlocker =
  | "CONTENT_QUALITY_FAILED"
  | "STATIC_IMAGE_ONLY_VIDEO_BLOCKED"
  | "VOICEOVER_AUDIO_REQUIRED"
  | "STORY_SCRIPT_REQUIRED"
  | "WHY_BUY_REASON_REQUIRED"
  | "DEV_PLACEHOLDER_DESCRIPTION_BLOCKED"
  | "CAPTION_COUNT_TOO_LOW"
  | "SCENE_COUNT_TOO_LOW"
  | "VIDEO_DURATION_TOO_SHORT";

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
};

export type StoryDrivenShortsPackage = {
  title: string;
  description: string;
  disclosure_text: string;
  shorts_content_quality: Record<string, unknown>;
  tags: string[];
};

const MIN_CAPTION_COUNT = 5;
const MIN_SCENE_COUNT = 5;
const MIN_DURATION_SECONDS = 20;
const MIN_QUALITY_SCORE = 80;
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
  const audioVideoDurationDelta = audioDurationSeconds && durationSeconds
    ? Math.abs(audioDurationSeconds - durationSeconds)
    : null;
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
    explicit_audio_unavailable_blocker: explicitAudioUnavailableBlocker,
    voiceover_audio_ready: voiceoverAudioPresent && !explicitAudioUnavailableBlocker,
    caption_count: captions.filter((item) => safeTrim(item)).length,
    scene_count: scenes.filter(isMeaningfulScene).length,
    duration_seconds: durationSeconds ?? 0,
    audio_duration_seconds: audioDurationSeconds,
    audio_video_duration_delta_seconds: audioVideoDurationDelta,
    static_single_image_only: staticSingleImageOnly,
    product_image_present: quality.product_image_present === true,
    black_screen_detected: quality.black_screen_detected === true,
    description_not_dev_placeholder: !containsDevPlaceholder(description),
    description_contains_no_manual_review_placeholder: !/manual review/i.test(description)
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
    audioVideoDurationDelta === null || audioVideoDurationDelta <= 2
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
  audio_duration_seconds?: number;
}): StoryDrivenShortsPackage {
  const productName = safeTrim(input.product_name) ||
    "\ube4c\ub9ac\ube48 \uc2a4\ud14c\uc778\ub9ac\uc2a4 \uc870\ub9ac\ub3c4\uad6c 8\uc885 \uc138\ud2b8";
  const affiliateUrl = safeTrim(input.selected_affiliate_url);
  const scenes = [
    { id: "hook", duration_seconds: 3, motion: "slow_zoom_in" },
    { id: "problem", duration_seconds: 4, motion: "pan_left" },
    { id: "product_intro", duration_seconds: 5, motion: "slow_zoom_out" },
    { id: "why_buy", duration_seconds: 5, motion: "pan_right" },
    { id: "check_before_buy", duration_seconds: 5, motion: "crop_shift" },
    { id: "cta", duration_seconds: 3, motion: "slow_zoom_in" }
  ];
  const captions = [
    "\uc870\ub9ac\ub3c4\uad6c, \uc11c\ub78d\uc5d0\uc11c \ub9e8\ub0a0 \uc5c9\ud0a4\uc8e0?",
    "\uad6d\uc790\u00b7\ub4a4\uc9d1\uac1c\u00b7\uac70\ud488\uae30 \ucc3e\ub2e4\uac00 \uc694\ub9ac \ud750\ub984\uc774 \ub04a\uae41\ub2c8\ub2e4.",
    "\uae30\ubcf8 \uc870\ub9ac\ub3c4\uad6c 8\uc885\uc744 \ud55c \ubc88\uc5d0 \uc900\ube44",
    "\uc790\ucde8 \uc2dc\uc791, \uc0c8 \uc8fc\ubc29 \uc138\ud305, \uad50\uccb4 \uc2dc\uc810\uc5d0 \uc801\ud569",
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
      audio_duration_seconds: input.audio_duration_seconds ?? 25,
      captions,
      scenes,
      duration_seconds: 25,
      static_single_image_only: false,
      product_image_present: input.product_image_present !== false,
      black_screen_detected: false
    }
  };
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

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
