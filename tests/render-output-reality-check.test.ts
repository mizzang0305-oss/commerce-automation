import { describe, expect, test } from "vitest";

import {
  buildRenderRealityReviewArtifactPaths,
  evaluateRenderRealityCheck
} from "@/lib/uploads/videoAssets/renderOutputRealityCheck";

const PASSING_REALITY_CHECK = {
  candidate_id: "candidate-real-render-check",
  version: "v010",
  rendered_frame_contact_sheet_generated: true,
  actual_frame_probe: {
    actual_frame_sample_count: 12,
    actual_frame_hash_unique_ratio: 0.72,
    foreground_product_position_change_count: 6,
    foreground_product_scale_change_count: 5,
    layout_structure_change_count: 7,
    background_only_change_ratio: 0.18,
    same_composition_ratio: 0.24
  },
  caption_bbox_probe: {
    actual_caption_safe_area_pass: true,
    actual_no_text_clipped: true,
    actual_no_caption_overlaps_right_ui: true,
    max_caption_lines: 2,
    hook_title_visible_actual: true,
    hook_title_contrast_actual_pass: true
  },
  audio_continuity_probe: {
    audio_stream_present: true,
    max_silence_between_segments_ms: 210,
    hard_cut_count: 1,
    audio_loudness_normalized: true,
    audio_peak_not_clipped: true,
    speech_continuity_score: 84,
    voiceover_naturalness_score: 84
  },
  shorts_ui_overlay_probe: {
    shorts_overlay_probe_executed: true,
    no_text_in_top_ui_zone: true,
    no_critical_text_in_right_ui_zone: true,
    no_caption_in_bottom_meta_zone: true,
    no_caption_in_bottom_nav_zone: true,
    hook_visible_below_top_ui: true,
    main_caption_inside_safe_window: true
  },
  caption_text_integrity_probe: {
    caption_newline_probe_executed: true,
    captions: ["장마철 빨래건조\n공간 절약", "속건과 하중\n먼저 확인"]
  },
  title_description_integrity_probe: {
    mojibake_probe_executed: true,
    title: "코멧 홈 접이식 대형 빨래건조대",
    description: "장마철 실내건조 체크 포인트와 쿠팡 파트너스 고지 포함"
  },
  korean_asr_probe: {
    asr_provider: "fixture",
    asr_probe_executed: true,
    real_asr_probe_executed: true,
    korean_transcript_present: true,
    raw_transcript_similarity_score: 0.88,
    transcript_similarity_score: 0.88,
    core_anchor_recognition_pass: true,
    recognized_core_anchors: ["빨래", "건조대", "공간"],
    recognized_context_anchors: ["장마철", "냄새", "습기", "확인"],
    recognized_context_anchor_count: 4,
    recognized_keyword_anchor_count: 6,
    speech_rate_wpm: 152,
    max_silence_between_segments_ms: 140,
    hard_cut_count: 0,
    voiceover_naturalness_score: 86
  },
  scene_layout_probe: {
    static_product_card_feeling: false,
    product_dominates_too_many_scenes: false,
    background_only_motion: false,
    scene_layout_too_similar: false,
    problem_visual_before_product: true,
    distinct_layout_templates: 8
  },
  human_visual_gate_probe: {
    human_visual_gate_executed: true,
    first_frame_ad_like: true,
    loss_aversion_hook_large_visible: true,
    empty_canvas_ratio: 0.28,
    primary_text_area_ratio: 0.18,
    product_or_problem_visual_visible_in_first_1s: true,
    hook_text_contains_loss_trigger: true,
    problem_before_product_visible: true,
    cta_not_present_too_early: true,
    ppt_card_feeling: false
  }
};

describe("render output reality check", () => {
  test("background-only frame changes fail the actual scene probe", () => {
    const result = evaluateRenderRealityCheck({
      ...PASSING_REALITY_CHECK,
      actual_frame_probe: {
        ...PASSING_REALITY_CHECK.actual_frame_probe,
        foreground_product_position_change_count: 1,
        foreground_product_scale_change_count: 1,
        layout_structure_change_count: 2,
        background_only_change_ratio: 0.78,
        same_composition_ratio: 0.81
      }
    });

    expect(result.actual_true_scene_change_pass).toBe(false);
    expect(result.blocked_reasons).toEqual(expect.arrayContaining([
      "FOREGROUND_PRODUCT_STATIC_TOO_LONG",
      "BACKGROUND_ONLY_CHANGED",
      "TRUE_SCENE_CHANGE_FALSE_POSITIVE",
      "ACTUAL_CONTACT_SHEET_TOO_SIMILAR"
    ]));
  });

  test("static foreground product placement fails even when background hashes differ", () => {
    const result = evaluateRenderRealityCheck({
      ...PASSING_REALITY_CHECK,
      actual_frame_probe: {
        ...PASSING_REALITY_CHECK.actual_frame_probe,
        actual_frame_hash_unique_ratio: 0.8,
        foreground_product_position_change_count: 0,
        foreground_product_scale_change_count: 0,
        background_only_change_ratio: 0.29,
        same_composition_ratio: 0.34
      }
    });

    expect(result.actual_true_scene_change_pass).toBe(false);
    expect(result.blocked_reasons).toEqual(expect.arrayContaining([
      "FOREGROUND_PRODUCT_STATIC_TOO_LONG",
      "TRUE_SCENE_CHANGE_FALSE_POSITIVE"
    ]));
  });

  test("repeated composition contact sheets fail the actual frame probe", () => {
    const result = evaluateRenderRealityCheck({
      ...PASSING_REALITY_CHECK,
      actual_frame_probe: {
        ...PASSING_REALITY_CHECK.actual_frame_probe,
        same_composition_ratio: 0.7
      }
    });

    expect(result.actual_true_scene_change_pass).toBe(false);
    expect(result.blocked_reasons).toEqual(expect.arrayContaining([
      "ACTUAL_CONTACT_SHEET_TOO_SIMILAR",
      "TRUE_SCENE_CHANGE_FALSE_POSITIVE"
    ]));
  });

  test("caption outside the Shorts right-side UI safe area fails", () => {
    const result = evaluateRenderRealityCheck({
      ...PASSING_REALITY_CHECK,
      caption_bbox_probe: {
        ...PASSING_REALITY_CHECK.caption_bbox_probe,
        actual_caption_safe_area_pass: false,
        actual_no_text_clipped: false,
        actual_no_caption_overlaps_right_ui: false
      }
    });

    expect(result.actual_caption_safe_area_pass).toBe(false);
    expect(result.blocked_reasons).toEqual(expect.arrayContaining([
      "CAPTION_OUT_OF_ACTUAL_FRAME",
      "CAPTION_OVERLAPS_SHORTS_UI",
      "CAPTION_CLIPPED_IN_RENDERED_FRAME"
    ]));
  });

  test("low-contrast or hidden hook title fails the caption probe", () => {
    const result = evaluateRenderRealityCheck({
      ...PASSING_REALITY_CHECK,
      caption_bbox_probe: {
        ...PASSING_REALITY_CHECK.caption_bbox_probe,
        hook_title_visible_actual: false,
        hook_title_contrast_actual_pass: false
      }
    });

    expect(result.blocked_reasons).toContain("HOOK_TITLE_LOW_VISIBILITY_ACTUAL");
  });

  test("audio gaps and hard cuts fail the continuity probe", () => {
    const result = evaluateRenderRealityCheck({
      ...PASSING_REALITY_CHECK,
      audio_continuity_probe: {
        ...PASSING_REALITY_CHECK.audio_continuity_probe,
        max_silence_between_segments_ms: 620,
        hard_cut_count: 4,
        audio_loudness_normalized: false,
        speech_continuity_score: 54
      }
    });

    expect(result.audio_continuity_pass).toBe(false);
    expect(result.blocked_reasons).toEqual(expect.arrayContaining([
      "VOICEOVER_SEGMENT_GAPS_TOO_LONG",
      "VOICEOVER_HARD_CUTS_DETECTED",
      "VOICEOVER_UNINTELLIGIBLE",
      "VOICEOVER_LOUDNESS_UNNORMALIZED"
    ]));
  });

  test("passing probe reports required review artifact paths", () => {
    const artifactPaths = buildRenderRealityReviewArtifactPaths({
      cwd: "C:\\repo\\commerce-automation",
      candidateId: "candidate-real-render-check",
      version: "v010"
    });
    const result = evaluateRenderRealityCheck(PASSING_REALITY_CHECK);

    expect(artifactPaths.actualFrameContactSheetPath).toContain("actual-frame-contact-sheet.jpg");
    expect(artifactPaths.actualFrameProbePath).toContain("actual-frame-probe.json");
    expect(artifactPaths.captionBboxProbePath).toContain("caption-bbox-probe.json");
    expect(artifactPaths.audioContinuityProbePath).toContain("audio-continuity-probe.json");
    expect(artifactPaths.shortsOverlayContactSheetPath).toContain("shorts-ui-overlay-contact-sheet.jpg");
    expect(artifactPaths.shortsOverlayProbePath).toContain("shorts-ui-overlay-probe.json");
    expect(artifactPaths.captionTextIntegrityProbePath).toContain("caption-text-integrity-probe.json");
    expect(artifactPaths.captionTextIntegrityReportPath).toContain("caption-text-integrity.json");
    expect(artifactPaths.audioAsrProbePath).toContain("audio-asr-probe.json");
    expect(artifactPaths.audioIntelligibilityReportPath).toContain("audio-intelligibility-probe.json");
    expect(artifactPaths.asrTranscriptPath).toContain("asr-transcript.txt");
    expect(artifactPaths.sceneLayoutProbePath).toContain("scene-layout-probe.json");
    expect(artifactPaths.humanVisualGatePath).toContain("human-visual-gate.json");
    expect(artifactPaths.humanReviewSummaryPath).toContain("human-review-summary.json");
    expect(artifactPaths.humanReviewChecklistPath).toContain("human-review-checklist.md");
    expect(artifactPaths.localReviewVideoPath).toContain("local-review-video.mp4");
    expect(artifactPaths.reviewSummaryPath).toContain("review-summary.json");
    expect(result.passed).toBe(true);
    expect(result.actual_true_scene_change_pass).toBe(true);
    expect(result.actual_caption_safe_area_pass).toBe(true);
    expect(result.audio_continuity_pass).toBe(true);
    expect(result.shorts_overlay_pass).toBe(true);
    expect(result.caption_text_integrity_pass).toBe(true);
    expect(result.audio_intelligibility_pass).toBe(true);
    expect(result.scene_layout_pass).toBe(true);
    expect(result.human_visual_gate_pass).toBe(true);
  });

  test("Shorts UI overlay collisions fail even when frame hashes pass", () => {
    const result = evaluateRenderRealityCheck({
      ...PASSING_REALITY_CHECK,
      shorts_ui_overlay_probe: {
        ...PASSING_REALITY_CHECK.shorts_ui_overlay_probe,
        no_text_in_top_ui_zone: false,
        no_critical_text_in_right_ui_zone: false,
        no_caption_in_bottom_meta_zone: false,
        no_caption_in_bottom_nav_zone: false,
        hook_visible_below_top_ui: false,
        main_caption_inside_safe_window: false
      }
    });

    expect(result.shorts_overlay_probe_executed).toBe(true);
    expect(result.shorts_overlay_pass).toBe(false);
    expect(result.blocked_reasons).toEqual(expect.arrayContaining([
      "SHORTS_UI_OVERLAY_TEXT_BLOCKED",
      "TEXT_UNDER_TOP_CHIPS",
      "CAPTION_OVERLAPS_RIGHT_BUTTONS",
      "CAPTION_OVERLAPS_BOTTOM_META",
      "CAPTION_OVERLAPS_BOTTOM_NAV",
      "HOOK_HIDDEN_BY_SHORTS_UI"
    ]));
  });

  test("literal escaped newline captions and Korean mojibake fail text integrity", () => {
    const result = evaluateRenderRealityCheck({
      ...PASSING_REALITY_CHECK,
      caption_text_integrity_probe: {
        caption_newline_probe_executed: true,
        captions: ["장마철 빨래건조n공간 절약", "속건\\n하중 먼저 확인"]
      },
      title_description_integrity_probe: {
        mojibake_probe_executed: true,
        title: "??? ???? ??",
        description: "?? \u5360\u5360 \uCC59\uCC59"
      }
    });

    expect(result.caption_text_integrity_pass).toBe(false);
    expect(result.korean_text_integrity_pass).toBe(false);
    expect(result.blocked_reasons).toEqual(expect.arrayContaining([
      "CAPTION_NEWLINE_ESCAPED_AS_LITERAL_N",
      "CAPTION_LITERAL_BACKSLASH_N_VISIBLE",
      "YOUTUBE_TITLE_MOJIBAKE",
      "YOUTUBE_DESCRIPTION_MOJIBAKE",
      "KOREAN_TEXT_REPLACED_WITH_QUESTION_MARKS"
    ]));
  });

  test("Korean ASR failures block unintelligible voiceover", () => {
    const result = evaluateRenderRealityCheck({
      ...PASSING_REALITY_CHECK,
      korean_asr_probe: {
        asr_provider: "fixture",
        asr_probe_executed: true,
        real_asr_probe_executed: true,
        korean_transcript_present: true,
        raw_transcript_similarity_score: 0.42,
        transcript_similarity_score: 0.42,
        recognized_keyword_anchor_count: 2,
        speech_rate_wpm: 212,
        max_silence_between_segments_ms: 240,
        hard_cut_count: 2,
        voiceover_naturalness_score: 70
      }
    });

    expect(result.audio_intelligibility_pass).toBe(false);
    expect(result.blocked_reasons).toEqual(expect.arrayContaining([
      "VOICEOVER_UNINTELLIGIBLE_ASR_FAILED",
      "VOICEOVER_KEYWORD_ANCHORS_MISSING",
      "VOICEOVER_TOO_FAST",
      "VOICEOVER_TOO_ROBOTIC",
      "VOICEOVER_SEGMENT_GAPS_TOO_LONG",
      "VOICEOVER_HARD_CUTS_DETECTED"
    ]));
  });

  test("missing product core ASR anchors block upload even when generic anchor count passes", () => {
    const result = evaluateRenderRealityCheck({
      ...PASSING_REALITY_CHECK,
      korean_asr_probe: {
        asr_provider: "faster-whisper",
        asr_probe_executed: true,
        real_asr_probe_executed: true,
        korean_transcript_present: true,
        raw_transcript_similarity_score: 0.86,
        transcript_similarity_score: 0.86,
        core_anchor_recognition_pass: false,
        recognized_core_anchors: ["빨래"],
        recognized_context_anchors: ["장마철", "냄새", "습기", "확인"],
        recognized_context_anchor_count: 4,
        recognized_keyword_anchor_count: 6,
        speech_rate_wpm: 148,
        max_silence_between_segments_ms: 140,
        hard_cut_count: 0,
        voiceover_naturalness_score: 88
      }
    });

    expect(result.audio_intelligibility_pass).toBe(false);
    expect(result.blocked_reasons).toContain("VOICEOVER_PRODUCT_CORE_ANCHORS_MISSING");
  });

  test("script alignment alone is not treated as real ASR readiness", () => {
    const result = evaluateRenderRealityCheck({
      ...PASSING_REALITY_CHECK,
      korean_asr_probe: {
        asr_provider: "local_script_alignment_probe",
        asr_probe_executed: true,
        real_asr_probe_executed: false,
        korean_transcript_present: true,
        raw_transcript_similarity_score: 0.9,
        transcript_similarity_score: 0.9,
        recognized_keyword_anchor_count: 8,
        speech_rate_wpm: 150,
        max_silence_between_segments_ms: 120,
        hard_cut_count: 0,
        voiceover_naturalness_score: 90
      }
    });

    expect(result.real_asr_probe_executed).toBe(false);
    expect(result.audio_intelligibility_pass).toBe(false);
    expect(result.blocked_reasons).toContain("AUDIO_ASR_PROVIDER_NOT_CONFIGURED");
  });

  test("static product-card layouts fail even with passing motion metrics", () => {
    const result = evaluateRenderRealityCheck({
      ...PASSING_REALITY_CHECK,
      scene_layout_probe: {
        static_product_card_feeling: true,
        product_dominates_too_many_scenes: true,
        background_only_motion: true,
        scene_layout_too_similar: true,
        problem_visual_before_product: false,
        distinct_layout_templates: 3
      }
    });

    expect(result.scene_layout_pass).toBe(false);
    expect(result.blocked_reasons).toEqual(expect.arrayContaining([
      "STATIC_PRODUCT_CARD_FEELING",
      "PRODUCT_IMAGE_DOMINATES_TOO_MANY_SCENES",
      "BACKGROUND_ONLY_MOTION",
      "SCENE_LAYOUT_TOO_SIMILAR",
      "NO_PROBLEM_VISUAL_BEFORE_PRODUCT"
    ]));
  });

  test("raw Korean ASR similarity is gated before normalized transcript similarity can pass", () => {
    const result = evaluateRenderRealityCheck({
      ...PASSING_REALITY_CHECK,
      korean_asr_probe: {
        ...PASSING_REALITY_CHECK.korean_asr_probe,
        raw_transcript_similarity_score: 0.779,
        transcript_similarity_score: 1,
        core_anchor_recognition_pass: true,
        recognized_context_anchor_count: 4,
        recognized_keyword_anchor_count: 7
      }
    });

    expect(result.audio_intelligibility_pass).toBe(false);
    expect(result.blocked_reasons).toContain("RAW_ASR_SIMILARITY_TOO_LOW");
  });

  test("context ASR anchors require at least three recognized rainy-season signals", () => {
    const result = evaluateRenderRealityCheck({
      ...PASSING_REALITY_CHECK,
      korean_asr_probe: {
        ...PASSING_REALITY_CHECK.korean_asr_probe,
        raw_transcript_similarity_score: 0.9,
        transcript_similarity_score: 0.9,
        recognized_context_anchor_count: 2,
        recognized_keyword_anchor_count: 5
      }
    });

    expect(result.audio_intelligibility_pass).toBe(false);
    expect(result.blocked_reasons).toContain("VOICEOVER_CONTEXT_ANCHORS_MISSING");
  });

  test("human visual gate blocks weak first frames with too much empty canvas", () => {
    const result = evaluateRenderRealityCheck({
      ...PASSING_REALITY_CHECK,
      human_visual_gate_probe: {
        human_visual_gate_executed: true,
        first_frame_ad_like: false,
        loss_aversion_hook_large_visible: false,
        empty_canvas_ratio: 0.62,
        primary_text_area_ratio: 0.07,
        product_or_problem_visual_visible_in_first_1s: false,
        hook_text_contains_loss_trigger: false,
        problem_before_product_visible: false,
        cta_not_present_too_early: false,
        ppt_card_feeling: true
      }
    });

    expect(result.human_visual_gate_pass).toBe(false);
    expect(result.blocked_reasons).toEqual(expect.arrayContaining([
      "FIRST_FRAME_NOT_AD_LIKE",
      "LOSS_AVERSION_NOT_VISIBLE",
      "EMPTY_CANVAS_TOO_LARGE",
      "PRIMARY_TEXT_TOO_SMALL",
      "PRODUCT_OR_PROBLEM_VISUAL_MISSING_FIRST_SECOND",
      "PPT_CARD_FEELING",
      "HOOK_COPY_WEAK"
    ]));
  });

  test("voice review gate blocks locally rejected SAPI voices even when ASR is acceptable", () => {
    const result = evaluateRenderRealityCheck({
      ...PASSING_REALITY_CHECK,
      korean_asr_probe: {
        ...PASSING_REALITY_CHECK.korean_asr_probe,
        asr_provider: "faster-whisper",
        asr_probe_executed: true,
        real_asr_probe_executed: true,
        korean_transcript_present: true,
        raw_transcript_similarity_score: 0.9,
        transcript_similarity_score: 0.91,
        core_anchor_recognition_pass: true,
        recognized_core_anchors: ["빨래", "건조대", "공간"],
        recognized_context_anchor_count: 4,
        recognized_context_anchors: ["장마철", "냄새", "습기", "확인"],
        recognized_keyword_anchor_count: 7,
        speech_rate_wpm: 148,
        max_silence_between_segments_ms: 120,
        hard_cut_count: 0,
        voiceover_naturalness_score: 90
      },
      voiceover_review_probe: {
        voiceover_review_executed: true,
        selected_voice_name: "Microsoft Heami Desktop",
        selected_voice_gender: "Female",
        selected_voice_culture: "ko-KR",
        owner_rejected_voice_gender: "Female",
        voice_tone_owner_acceptable: false,
        speech_pace_owner_acceptable: false
      }
    });

    expect(result.voiceover_review_pass).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.blocked_reasons).toEqual(expect.arrayContaining([
      "VOICEOVER_REJECTED_LOCAL_SAPI_VOICE",
      "VOICEOVER_TONE_REJECTED_BY_OWNER",
      "VOICEOVER_PACE_REJECTED_BY_OWNER"
    ]));
  });

  test("visual diversity gate blocks repeated single product photo with color-only text changes", () => {
    const result = evaluateRenderRealityCheck({
      ...PASSING_REALITY_CHECK,
      visual_diversity_probe: {
        visual_diversity_probe_executed: true,
        repeated_single_product_photo: true,
        text_color_only_variation: true,
        unique_scene_compositions: 2,
        product_photo_reuse_ratio: 1
      }
    });

    expect(result.visual_diversity_pass).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.blocked_reasons).toEqual(expect.arrayContaining([
      "REPEATED_SINGLE_PRODUCT_PHOTO",
      "TEXT_COLOR_ONLY_VARIATION",
      "VISUAL_STORYBOARD_TOO_STATIC"
    ]));
  });

  test("real storyboard gate passes when problem, use-case, comparison, checklist, and CTA sources are present", () => {
    const result = evaluateRenderRealityCheck({
      ...PASSING_REALITY_CHECK,
      real_storyboard_probe: {
        real_storyboard_gate_executed: true,
        single_product_photo_reuse_count: 2,
        product_photo_dominant_scene_count: 2,
        unique_non_product_scene_source_count: 6,
        problem_scene_count: 3,
        use_case_scene_count: 2,
        comparison_scene_count: 1,
        checklist_scene_count: 1,
        cta_scene_count: 1,
        problem_before_product_visible: true,
        before_after_comparison_present: true,
        use_case_visual_present: true,
        text_color_only_variation: false
      },
      voice_provider_probe: {
        voice_provider_review_executed: true,
        voice_provider_name: "approved-local-korean-voice",
        voice_provider_approved: true,
        windows_sapi_used: false,
        voiceover_rejected_local_sapi_voice: false
      }
    });

    expect(result.real_storyboard_gate_pass).toBe(true);
    expect(result.voice_provider_gate_pass).toBe(true);
    expect(result.passed).toBe(true);
  });

  test("real storyboard gate blocks product-photo-dominant static card storyboards", () => {
    const result = evaluateRenderRealityCheck({
      ...PASSING_REALITY_CHECK,
      real_storyboard_probe: {
        real_storyboard_gate_executed: true,
        single_product_photo_reuse_count: 8,
        product_photo_dominant_scene_count: 7,
        unique_non_product_scene_source_count: 2,
        problem_scene_count: 1,
        use_case_scene_count: 0,
        comparison_scene_count: 0,
        checklist_scene_count: 1,
        cta_scene_count: 1,
        problem_before_product_visible: false,
        before_after_comparison_present: false,
        use_case_visual_present: false,
        text_color_only_variation: true
      }
    });

    expect(result.real_storyboard_gate_pass).toBe(false);
    expect(result.blocked_reasons).toEqual(expect.arrayContaining([
      "REPEATED_SINGLE_PRODUCT_PHOTO",
      "TEXT_COLOR_ONLY_VARIATION",
      "VISUAL_STORYBOARD_TOO_STATIC",
      "PRODUCT_PHOTO_DOMINATES_STORY",
      "NO_REAL_PROBLEM_SCENE_SOURCE",
      "NO_REAL_USE_CASE_SCENE_SOURCE",
      "NO_BEFORE_AFTER_COMPARISON"
    ]));
  });

  test("voice provider gate blocks Windows SAPI and unapproved Korean voice providers", () => {
    const result = evaluateRenderRealityCheck({
      ...PASSING_REALITY_CHECK,
      voice_provider_probe: {
        voice_provider_review_executed: true,
        voice_provider_name: "Windows SAPI",
        voice_provider_approved: false,
        windows_sapi_used: true,
        voiceover_rejected_local_sapi_voice: true
      }
    });

    expect(result.voice_provider_gate_pass).toBe(false);
    expect(result.blocked_reasons).toEqual(expect.arrayContaining([
      "BLOCKED_KOREAN_VOICE_PROVIDER_NOT_CONFIGURED",
      "VOICEOVER_REJECTED_LOCAL_SAPI_VOICE"
    ]));
  });
});
