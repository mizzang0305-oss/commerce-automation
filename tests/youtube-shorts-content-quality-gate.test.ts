import { describe, expect, test, vi } from "vitest";
import { POST as postYouTubeExecute } from "../app/api/uploads/youtube/execute/route";
import {
  APPROVE_YOUTUBE_PRIVATE_UPLOAD,
  MockYouTubeUploadAdapter,
  buildYouTubeProductVideoUploadPackage,
  buildYouTubeUploadRequest,
  hasExactYouTubeUploadConfirmation,
  APPROVE_GENERATE_STORY_VOICEOVER_MP4_AND_UPLOAD_ONE_PRIVATE,
  APPROVE_FIX_SHORTS_RENDERING_PACING_AND_UPLOAD_ONE_PRIVATE,
  APPROVE_FIX_SHORTS_HOOK_VISUALS_VOICE_LINK_AND_UPLOAD_ONE_PRIVATE,
  APPROVE_AUTO_SCENE_IMAGE_PIPELINE_AND_UPLOAD_ONE_PRIVATE,
  APPROVE_IMPLEMENT_REAL_SCENE_IMAGE_PROVIDER_AND_UPLOAD_ONE_PRIVATE
} from "@/lib/uploads/youtube";

const DISCLOSURE =
  "\u203b \uc774 \ucf58\ud150\uce20\ub294 \ucfe0\ud321\ud30c\ud2b8\ub108\uc2a4 \ud65c\ub3d9\uc758 \uc77c\ud658\uc73c\ub85c, \uc774\uc5d0 \ub530\ub978 \uc77c\uc815\uc561\uc758 \uc218\uc218\ub8cc\ub97c \uc81c\uacf5\ubc1b\uc744 \uc218 \uc788\uc2b5\ub2c8\ub2e4.";

const PRODUCT_NAME =
  "\ube4c\ub9ac\ube48 \uc2a4\ud14c\uc778\ub9ac\uc2a4 \uc870\ub9ac\ub3c4\uad6c 8\uc885 \uc138\ud2b8";

const VALID_ASSET = {
  asset_id: "asset-candidate-490aa6d25e8ea89d-video",
  provider: "signed_url",
  signed_url: "https://assets.example.test/real-product-story-driven.mp4",
  prepared_video_asset_url: "https://assets.example.test/real-product-story-driven.mp4",
  mime_type: "video/mp4",
  size_bytes: 2_400_000,
  checksum_sha256: "a".repeat(64),
  server_accessible: true
};

const STORY_QUALITY = {
  hook_text: "\uc8fc\ubc29 \uc870\ub9ac\ub3c4\uad6c, \uc11c\ub78d\uc5d0\uc11c \ub9e8\ub0a0 \uc5c9\ud0a4\uc8e0?",
  problem_text: "\uad6d\uc790, \ub4a4\uc9d1\uac1c, \uac70\ud488\uae30 \ucc3e\ub2e4\uac00 \uc694\ub9ac \ud750\ub984\uc774 \ub04a\uae41\ub2c8\ub2e4.",
  why_buy_reason: "\uc790\ucde8 \uc2dc\uc791, \uc0c8 \uc8fc\ubc29 \uc138\ud305, \uc870\ub9ac\ub3c4\uad6c \uad50\uccb4\ud560 \ub54c \ud55c \ubc88\uc5d0 \ub9de\ucd94\uae30 \uc88b\uc2b5\ub2c8\ub2e4.",
  target_customer: "\uc790\ucde8 \uc2dc\uc791, \uc2e0\ud63c \uc8fc\ubc29, \uae30\ubcf8 \uc870\ub9ac\ub3c4\uad6c\ub97c \ud55c \ubc88\uc5d0 \uad50\uccb4\ud558\ub824\ub294 \ubd84",
  product_benefit: "\uae30\ubcf8 \uc870\ub9ac\ub3c4\uad6c 8\uc885\uc744 \uc2a4\ud0e0\ub4dc\uc640 \ud568\uaed8 \uc815\ub9ac\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4.",
  caution_or_check_before_buy: "\uad6c\uc131\ud488, \uc2a4\ud0e0\ub4dc \ud06c\uae30, \uc190\uc7a1\uc774 \uae38\uc774\ub294 \uad6c\ub9e4 \uc804 \ud655\uc778\ud558\uc138\uc694.",
  cta_text: "\uac00\uaca9\uacfc \uad6c\uc131\uc740 \ub9c1\ud06c\uc5d0\uc11c \ud655\uc778\ud574\ubcf4\uc138\uc694.",
  korean_voiceover_script: "\uc8fc\ubc29 \uc870\ub9ac\ub3c4\uad6c\uac00 \uc11c\ub78d\uc5d0\uc11c \uc790\uc8fc \uc5c9\ud0a8\ub2e4\uba74, 8\uc885 \uc138\ud2b8 \uad6c\uc131\uacfc \uc2a4\ud0e0\ub4dc \ud06c\uae30\ub97c \ud568\uaed8 \ud655\uc778\ud574\ubcf4\uc138\uc694.",
  voiceover_audio_present: true,
  voiceover_audio_file_present: true,
  video_has_audio_stream: true,
  audio_muxed_into_video: true,
  audio_mime_type: "audio/wav",
  audio_duration_seconds: 24.5,
  hook_title: "\uc8fc\ubc29 \uc870\ub9ac\ub3c4\uad6c, \uc544\uc9c1\ub3c4 \uc11c\ub78d\uc5d0 \ub123\uc5b4\ub450\uc138\uc694?",
  hook_title_first_seen_seconds: 0.4,
  hook_title_safe_area_pass: true,
  caption_safe_area_pass: true,
  all_text_inside_mobile_safe_area: true,
  no_text_clipped: true,
  max_caption_lines: 2,
  caption_font_size_readable: true,
  caption_contrast_pass: true,
  transition_count: 8,
  visual_motion_score: 92,
  distinct_frame_ratio_pass: true,
  image_generation_provider: "real_scene_image_provider_mock",
  real_scene_image_provider_configured: true,
  generated_scene_image_count: 8,
  unique_scene_image_hash_count: 8,
  generated_scene_images_are_not_color_cards: true,
  generated_scene_images_are_visually_distinct: true,
  scene_image_color_palette_delta_pass: true,
  scene_image_semantic_kind_unique: true,
  product_image_reuse_ratio: 0.28,
  color_card_only_ratio: 0,
  frame_sample_count: 8,
  same_frame_ratio: 0.18,
  static_background_ratio: 0.22,
  product_image_bbox_change_count: 8,
  caption_position_change_count: 6,
  dominant_background_change_count: 8,
  true_scene_change_pass: true,
  scene_manifest_created: true,
  renderer_consumed_scene_manifest: true,
  fallback_to_single_product_image: false,
  use_case_scene_present: true,
  kitchen_context_scene_present: true,
  utensil_usage_simulation_present: true,
  use_case_human_context_present: true,
  use_case_kitchen_context_present: true,
  utensil_interaction_present: true,
  human_use_signal_scene_count: 2,
  real_usage_visual_present: true,
  shape_card_scene_detected: false,
  shape_card_scene_count: 0,
  abstract_scene_ratio: 0,
  before_after_or_problem_scene_present: true,
  voiceover_speed_wpm: 190,
  voiceover_speed_multiplier: 1.25,
  max_silence_between_segments_ms: 260,
  hook_title_readability_score: 92,
  hook_title_font_size_large: true,
  hook_title_contrast_pass: true,
  hook_title_background_chip_present: true,
  checklist_scene_present: true,
  cta_scene_present: true,
  cta_mentions_description_or_comment: true,
  voiceover_naturalness_score: 84,
  voiceover_too_robotic: false,
  alternate_voice_used: true,
  audio_video_duration_gap_seconds: 0.5,
  captions: [
    "\uc870\ub9ac\ub3c4\uad6c, \uc790\uc8fc \uc5c9\ud0a4\ub098\uc694?",
    "\uc694\ub9ac \ud750\ub984\uc744 \ub04a\ub294 \ucc3e\uae30 \ubb38\uc81c",
    "8\uc885\uc744 \ud55c \ubc88\uc5d0 \uc900\ube44",
    "\uc0c8 \uc8fc\ubc29 \uc138\ud305\uc5d0 \uc801\ud569",
    "\uc11c\ub78d \uc815\ub9ac\uac00 \ud544\uc694\ud55c \ubd84\uc5d0\uac8c \uc801\ud569",
    "\uad6c\uc131\uacfc \ud06c\uae30\ub294 \uad6c\ub9e4 \uc804 \ud655\uc778",
    "\ub9c1\ud06c\uc5d0\uc11c \uac00\uaca9\uacfc \uad6c\uc131 \ud655\uc778",
    "\uc124\uba85\ub780\uc5d0\uc11c \ub9c1\ud06c\ub97c \ud655\uc778"
  ],
  scenes: [
    { id: "hook", duration_seconds: 3, motion: "slow_zoom_in" },
    { id: "problem", duration_seconds: 3, motion: "pan_left" },
    { id: "intro", duration_seconds: 4, motion: "slow_zoom_out" },
    { id: "components", duration_seconds: 3, motion: "card_pop" },
    { id: "use_case", duration_seconds: 3, motion: "slide" },
    { id: "why_buy", duration_seconds: 3, motion: "pan_right" },
    { id: "checklist", duration_seconds: 3, motion: "checklist_reveal" },
    { id: "cta", duration_seconds: 3, motion: "zoom_snap" }
  ],
  duration_seconds: 25,
  static_single_image_only: false,
  product_image_present: true,
  black_screen_detected: false
};

const READY_PACKAGE_INPUT = {
  candidate_id: "candidate-490aa6d25e8ea89d",
  product_name: PRODUCT_NAME,
  product_source: "coupang",
  selected_affiliate_url: "https://link.coupang.com/a/private-real-product",
  prepared_video_asset: VALID_ASSET,
  video_path_or_url: "https://assets.example.test/real-product-story-driven.mp4",
  visibility: "private",
  title: `${PRODUCT_NAME} \uc8fc\ubc29 \uc815\ub9ac \ud655\uc778 \ud3ec\uc778\ud2b8`,
  description: [
    PRODUCT_NAME,
    "",
    "\uae30\ubcf8 \uc870\ub9ac\ub3c4\uad6c 8\uc885\uc744 \ud55c \ubc88\uc5d0 \uc900\ube44\ud558\ub824\ub294 \ubd84\uc744 \uc704\ud55c \uac1c\uc778 \ud655\uc778\uc6a9 \ube44\uacf5\uac1c \uc601\uc0c1\uc785\ub2c8\ub2e4.",
    "\uad6c\uc131\ud488\uacfc \uc2a4\ud0e0\ub4dc \ud06c\uae30\ub294 \uad6c\ub9e4 \uc804 \ud568\uaed8 \ud655\uc778\ud558\uc138\uc694.",
    "",
    "\ucd94\ucc9c \ub300\uc0c1:",
    "- \uc790\ucde8\ub97c \uc2dc\uc791\ud558\ub294 \ubd84",
    "- \uc0c8 \uc8fc\ubc29\uc744 \uc138\ud305\ud558\ub294 \ubd84",
    "- \uae30\ubcf8 \uc870\ub9ac\ub3c4\uad6c\ub97c \uad50\uccb4\ud558\ub824\ub294 \ubd84",
    "",
    "\uad6c\ub9e4 \uc804 \ud655\uc778:",
    "- \uad6c\uc131\ud488",
    "- \uc2a4\ud0e0\ub4dc \ud06c\uae30",
    "- \uc190\uc7a1\uc774 \uae38\uc774",
    "",
    DISCLOSURE,
    "",
    "\uc81c\ud488 \ud655\uc778:",
    "https://link.coupang.com/a/private-real-product"
  ].join("\n"),
  disclosure_text: DISCLOSURE,
  tags: ["coupang", "shorts", "private"],
  made_for_kids: false,
  shorts_content_quality: STORY_QUALITY
};

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("YouTube Shorts content quality gate", () => {
  test("one-shot story voiceover approval is accepted as private execute confirmation", () => {
    expect(hasExactYouTubeUploadConfirmation(APPROVE_GENERATE_STORY_VOICEOVER_MP4_AND_UPLOAD_ONE_PRIVATE)).toBe(true);
  });

  test("rendering pacing approval is accepted as private execute confirmation", () => {
    expect(hasExactYouTubeUploadConfirmation(APPROVE_FIX_SHORTS_RENDERING_PACING_AND_UPLOAD_ONE_PRIVATE)).toBe(true);
  });

  test("hook visuals voice CTA approval is accepted as private execute confirmation", () => {
    expect(hasExactYouTubeUploadConfirmation(APPROVE_FIX_SHORTS_HOOK_VISUALS_VOICE_LINK_AND_UPLOAD_ONE_PRIVATE)).toBe(true);
  });

  test("auto scene image pipeline approval is accepted as private execute confirmation", () => {
    expect(hasExactYouTubeUploadConfirmation(APPROVE_AUTO_SCENE_IMAGE_PIPELINE_AND_UPLOAD_ONE_PRIVATE)).toBe(true);
  });

  test("real scene image provider approval is accepted as private execute confirmation", () => {
    expect(hasExactYouTubeUploadConfirmation(APPROVE_IMPLEMENT_REAL_SCENE_IMAGE_PROVIDER_AND_UPLOAD_ONE_PRIVATE)).toBe(true);
  });

  test("static single image package is blocked before private upload", () => {
    const result = buildYouTubeProductVideoUploadPackage({
      ...READY_PACKAGE_INPUT,
      shorts_content_quality: {
        ...STORY_QUALITY,
        voiceover_audio_present: false,
        captions: ["single caption"],
        scenes: [{ id: "still", duration_seconds: 12, motion: "none" }],
        duration_seconds: 12,
        static_single_image_only: true
      }
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("static single image package must be blocked");
    }
    expect(result.blocked_reasons).toEqual(expect.arrayContaining([
      "STATIC_IMAGE_ONLY_VIDEO_BLOCKED",
      "VOICEOVER_AUDIO_REQUIRED",
      "CAPTION_COUNT_TOO_LOW",
      "SCENE_COUNT_TOO_LOW",
      "VIDEO_DURATION_TOO_SHORT"
    ]));
    expect(result.readiness.content_quality_ready).toBe(false);
  });

  test("true scene change probe blocks repeated scene images before private upload", () => {
    const result = buildYouTubeProductVideoUploadPackage({
      ...READY_PACKAGE_INPUT,
      shorts_content_quality: {
        ...STORY_QUALITY,
        true_scene_change_pass: false,
        scene_manifest_created: false,
        renderer_consumed_scene_manifest: false,
        fallback_to_single_product_image: true,
        frame_sample_count: 4,
        same_frame_ratio: 0.82,
        static_background_ratio: 0.91,
        product_image_bbox_change_count: 1,
        caption_position_change_count: 1,
        dominant_background_change_count: 1
      }
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("repeated single scene image probe must be blocked");
    }
    expect(result.blocked_reasons).toEqual(expect.arrayContaining([
      "TRUE_SCENE_CHANGE_FAILED",
      "FRAME_HASH_DELTA_TOO_LOW",
      "PRODUCT_IMAGE_BBOX_STATIC",
      "BACKGROUND_STATIC_TOO_LONG",
      "CAPTION_POSITION_STATIC_TOO_LONG",
      "VISUAL_LAYOUT_VARIATION_TOO_LOW"
    ]));
    expect(result.readiness.content_quality_ready).toBe(false);
  });

  test("local deterministic color-card scene generator cannot pass final private upload gate", () => {
    const result = buildYouTubeProductVideoUploadPackage({
      ...READY_PACKAGE_INPUT,
      shorts_content_quality: {
        ...STORY_QUALITY,
        image_generation_provider: "local_ffmpeg_scene_card_generator",
        real_scene_image_provider_configured: false,
        generated_scene_images_are_not_color_cards: false,
        generated_scene_images_are_visually_distinct: false,
        scene_image_color_palette_delta_pass: false,
        scene_image_semantic_kind_unique: false,
        unique_scene_image_hash_count: 8,
        product_image_reuse_ratio: 0.82,
        color_card_only_ratio: 1
      }
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("local deterministic scene cards must not pass final private upload gate");
    }
    expect(result.blocked_reasons).toEqual(expect.arrayContaining([
      "REAL_SCENE_IMAGE_PROVIDER_REQUIRED",
      "LOCAL_SCENE_CARD_GENERATOR_NOT_ENOUGH",
      "COLOR_CARD_ONLY_SCENE_BLOCKED",
      "PRODUCT_IMAGE_REUSE_TOO_HIGH",
      "SCENE_IMAGE_VISUAL_REALISM_TOO_LOW"
    ]));
    expect(result.readiness.content_quality_ready).toBe(false);
  });

  test("abstract use-case scenes without human kitchen interaction are blocked", () => {
    const result = buildYouTubeProductVideoUploadPackage({
      ...READY_PACKAGE_INPUT,
      shorts_content_quality: {
        ...STORY_QUALITY,
        use_case_human_context_present: false,
        use_case_kitchen_context_present: false,
        utensil_interaction_present: false,
        human_use_signal_scene_count: 0,
        real_usage_visual_present: false,
        shape_card_scene_detected: true,
        shape_card_scene_count: 4,
        abstract_scene_ratio: 0.62
      }
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("abstract use-case visuals must not pass final private upload gate");
    }
    expect(result.blocked_reasons).toEqual(expect.arrayContaining([
      "USE_CASE_SCENE_HAS_NO_HUMAN_CONTEXT",
      "USE_CASE_SCENE_TOO_ABSTRACT",
      "REAL_USAGE_VISUAL_MISSING",
      "KITCHEN_CONTEXT_MISSING",
      "SHAPE_CARD_SCENE_BLOCKED"
    ]));
    expect(result.readiness.content_quality_ready).toBe(false);
  });

  test("manual review placeholder description is blocked", () => {
    const result = buildYouTubeProductVideoUploadPackage({
      ...READY_PACKAGE_INPUT,
      description: "Private product upload package prepared for manual review."
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("placeholder description must be blocked");
    }
    expect(result.blocked_reasons).toContain("DEV_PLACEHOLDER_DESCRIPTION_BLOCKED");
    expect(result.readiness.description_not_dev_placeholder).toBe(false);
  });

  test("package without why-buy reason is blocked", () => {
    const result = buildYouTubeProductVideoUploadPackage({
      ...READY_PACKAGE_INPUT,
      shorts_content_quality: {
        ...STORY_QUALITY,
        why_buy_reason: ""
      }
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("missing why-buy reason must be blocked");
    }
    expect(result.blocked_reasons).toContain("WHY_BUY_REASON_REQUIRED");
  });

  test("story-driven package passes with eight or more scenes, captions, audio, CTA, and disclosure", () => {
    const result = buildYouTubeProductVideoUploadPackage(READY_PACKAGE_INPUT);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(`expected story package to pass: ${result.blocked_reasons.join(",")}`);
    }
    expect(result.package.readiness).toMatchObject({
      content_quality_ready: true,
      voiceover_audio_ready: true,
      story_script_ready: true,
      description_not_dev_placeholder: true,
      disclosure_ready: true
    });
    expect(result.package.content_quality).toMatchObject({
      score: expect.any(Number),
      passed: true,
      scene_count: 8,
      caption_count: 8,
      static_single_image_only: false,
      hook_title_present: true,
      hook_title_visible_in_first_1_5_seconds: true,
      hook_title_safe_area_pass: true,
      hook_title_readability_score: 92,
      hook_title_font_size_large: true,
      hook_title_contrast_pass: true,
      hook_title_background_chip_present: true,
      caption_safe_area_pass: true,
      all_text_inside_mobile_safe_area: true,
      no_text_clipped: true,
      max_caption_lines: 2,
      transition_count: 8,
      visual_motion_score: 92,
      real_scene_image_provider_configured: true,
      generated_scene_images_are_not_color_cards: true,
      generated_scene_images_are_visually_distinct: true,
      true_scene_change_pass: true,
      frame_sample_count: 8,
      same_frame_ratio: 0.18,
      product_image_bbox_change_count: 8,
      caption_position_change_count: 6,
      dominant_background_change_count: 8,
      use_case_scene_present: true,
      kitchen_context_scene_present: true,
      utensil_usage_simulation_present: true,
      use_case_human_context_present: true,
      use_case_kitchen_context_present: true,
      utensil_interaction_present: true,
      human_use_signal_scene_count: 2,
      real_usage_visual_present: true,
      shape_card_scene_detected: false,
      shape_card_scene_count: 0,
      abstract_scene_ratio: 0,
      before_after_or_problem_scene_present: true,
      checklist_scene_present: true,
      cta_scene_present: true,
      cta_mentions_description_or_comment: true,
      voiceover_speed_wpm: 190,
      voiceover_naturalness_score: 84,
      voiceover_too_slow: false,
      voiceover_too_robotic: false
    });
    expect(result.package.content_quality.score).toBeGreaterThanOrEqual(88);
    expect(result.package.description).toContain("\ucfe0\ud321\ud30c\ud2b8\ub108\uc2a4");
    expect(result.package.description).toContain("\uc218\uc218\ub8cc");
    expect(result.package.description).not.toMatch(/manual review package|prepared package|test upload|smoke upload/i);
  });

  test("rendering quality gate blocks late hook, unsafe captions, low motion, and slow voiceover", () => {
    const result = buildYouTubeProductVideoUploadPackage({
      ...READY_PACKAGE_INPUT,
      shorts_content_quality: {
        ...STORY_QUALITY,
        hook_title_first_seen_seconds: 2.25,
        hook_title_safe_area_pass: false,
        caption_safe_area_pass: false,
        no_text_clipped: false,
        max_caption_lines: 3,
        transition_count: 3,
        visual_motion_score: 45,
        distinct_frame_ratio_pass: false,
        use_case_scene_present: false,
        voiceover_speed_wpm: 145,
        voiceover_speed_multiplier: 1,
        max_silence_between_segments_ms: 700
      }
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("unsafe rendering and slow voiceover must be blocked");
    }
    expect(result.blocked_reasons).toEqual(expect.arrayContaining([
      "HOOK_TITLE_TOO_LATE",
      "TEXT_OUT_OF_SAFE_AREA",
      "CAPTION_CLIPPED",
      "VISUAL_MOTION_TOO_LOW",
      "USE_CASE_SCENE_MISSING",
      "VOICEOVER_TOO_SLOW"
    ]));
  });

  test("hook visibility, CTA, checklist, visual variation, and natural voice are mandatory", () => {
    const result = buildYouTubeProductVideoUploadPackage({
      ...READY_PACKAGE_INPUT,
      shorts_content_quality: {
        ...STORY_QUALITY,
        hook_title_first_seen_seconds: 1.25,
        hook_title_readability_score: 70,
        hook_title_font_size_large: false,
        hook_title_contrast_pass: false,
        hook_title_background_chip_present: false,
        transition_count: 7,
        visual_motion_score: 82,
        checklist_scene_present: false,
        cta_scene_present: false,
        cta_mentions_description_or_comment: false,
        voiceover_naturalness_score: 62,
        voiceover_too_robotic: true,
        max_silence_between_segments_ms: 320
      }
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("low visibility hook, weak CTA, and robotic voice must be blocked");
    }
    expect(result.blocked_reasons).toEqual(expect.arrayContaining([
      "HOOK_TITLE_TOO_LATE",
      "HOOK_TITLE_LOW_VISIBILITY",
      "HOOK_TITLE_TOO_SMALL",
      "HOOK_TITLE_LOW_CONTRAST",
      "VISUAL_MOTION_TOO_LOW",
      "USE_CASE_SCENE_MISSING",
      "VOICEOVER_TOO_SLOW",
      "VOICEOVER_NATURALNESS_TOO_LOW"
    ]));
  });

  test("old v002 quality metadata is blocked by final hook visuals voice CTA gate", () => {
    const result = buildYouTubeProductVideoUploadPackage({
      ...READY_PACKAGE_INPUT,
      shorts_content_quality: {
        ...STORY_QUALITY,
        scenes: STORY_QUALITY.scenes.slice(0, 7),
        captions: STORY_QUALITY.captions.slice(0, 7),
        hook_title_first_seen_seconds: 0.4,
        hook_title_readability_score: undefined,
        hook_title_font_size_large: undefined,
        hook_title_contrast_pass: undefined,
        hook_title_background_chip_present: undefined,
        transition_count: 6,
        visual_motion_score: 90,
        checklist_scene_present: undefined,
        cta_scene_present: undefined,
        cta_mentions_description_or_comment: undefined,
        voiceover_naturalness_score: undefined,
        max_silence_between_segments_ms: 260
      }
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("v002 metadata must not pass final viewing quality gate");
    }
    expect(result.blocked_reasons).toEqual(expect.arrayContaining([
      "SCENE_COUNT_TOO_LOW",
      "CAPTION_COUNT_TOO_LOW",
      "HOOK_TITLE_LOW_VISIBILITY",
      "VISUAL_MOTION_TOO_LOW",
      "USE_CASE_SCENE_MISSING",
      "VOICEOVER_NATURALNESS_TOO_LOW"
    ]));
  });

  test("execute request builder also blocks content quality failures", () => {
    const result = buildYouTubeUploadRequest({
      ...READY_PACKAGE_INPUT,
      shorts_content_quality: {
        ...STORY_QUALITY,
        voiceover_audio_present: false
      }
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("request builder must block missing voiceover audio");
    }
    expect(result.missing_reasons).toContain("VOICEOVER_AUDIO_REQUIRED");
  });

  test("voiceover metadata cannot pass without an audio file and video audio stream", () => {
    const result = buildYouTubeProductVideoUploadPackage({
      ...READY_PACKAGE_INPUT,
      shorts_content_quality: {
        ...STORY_QUALITY,
        voiceover_audio_present: true,
        voiceover_audio_file_present: false,
        video_has_audio_stream: false,
        audio_muxed_into_video: false
      }
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("voiceover metadata without audio file and stream must be blocked");
    }
    expect(result.blocked_reasons).toEqual(expect.arrayContaining([
      "VOICEOVER_AUDIO_FILE_MISSING",
      "VIDEO_AUDIO_STREAM_MISSING",
      "VOICEOVER_AUDIO_REQUIRED"
    ]));
  });

  test("execute route does not call videos.insert when content quality fails", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await postYouTubeExecute(new Request("http://localhost/api/uploads/youtube/execute", {
      method: "POST",
      body: JSON.stringify({
        ...READY_PACKAGE_INPUT,
        confirmation: APPROVE_YOUTUBE_PRIVATE_UPLOAD,
        shorts_content_quality: {
          ...STORY_QUALITY,
          scenes: [{ id: "still", duration_seconds: 12, motion: "none" }],
          captions: ["still"],
          static_single_image_only: true,
          duration_seconds: 12
        }
      })
    }));
    const payload = await json(response);

    expect(response.status).toBe(400);
    expect(payload).toMatchObject({
      ok: false,
      error_code: "YOUTUBE_PRODUCT_UPLOAD_PACKAGE_NOT_READY",
      missing_reasons: expect.arrayContaining(["STATIC_IMAGE_ONLY_VIDEO_BLOCKED"])
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("mock private upload can only be called once after all quality gates pass", async () => {
    const request = buildYouTubeUploadRequest(READY_PACKAGE_INPUT);
    expect(request.ok).toBe(true);
    if (!request.ok) {
      throw new Error(`expected request ready: ${request.missing_reasons.join(",")}`);
    }

    const adapter = new MockYouTubeUploadAdapter();
    const result = await adapter.upload(request.request);

    expect(result.attempted).toBe(true);
    expect(result.succeeded).toBe(false);
    expect(result.side_effects.external_api_called).toBe(false);
    expect(request.request.visibility).toBe("private");
  });
});
