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
    transcript_similarity_score: 0.88,
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

  test("script alignment alone is not treated as real ASR readiness", () => {
    const result = evaluateRenderRealityCheck({
      ...PASSING_REALITY_CHECK,
      korean_asr_probe: {
        asr_provider: "local_script_alignment_probe",
        asr_probe_executed: true,
        real_asr_probe_executed: false,
        korean_transcript_present: true,
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
});
