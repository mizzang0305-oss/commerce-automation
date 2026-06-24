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
    expect(artifactPaths.humanReviewSummaryPath).toContain("human-review-summary.json");
    expect(result.passed).toBe(true);
    expect(result.actual_true_scene_change_pass).toBe(true);
    expect(result.actual_caption_safe_area_pass).toBe(true);
    expect(result.audio_continuity_pass).toBe(true);
  });
});
