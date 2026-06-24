import { Buffer } from "node:buffer";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";

import {
  RAINY_DRYING_RACK_HOOK_TEXT,
  buildRainyDryingRackStoryPackage,
  createRainyDryingRackSceneCardRenderer
} from "@/lib/uploads/videoAssets/rainyDryingRackSceneRenderer";
import { evaluateRenderRealityCheck } from "@/lib/uploads/videoAssets/renderOutputRealityCheck";
import { APPROVE_MERGE_PR122_AND_COMPLETE_RAINY_DRYING_RACK_PRIVATE_UPLOAD } from "@/lib/uploads/youtube/rainyDryingRackPrivateUploadApproval";
import { hasExactYouTubeUploadConfirmation } from "@/lib/uploads/youtube/youtubeUploadGuards";
import {
  selectRainyDryingRackCandidate,
  scoreRainyDryingRackCandidate
} from "@/lib/coupang/rainyDryingRackCandidateScoring";
import type { ProductCandidate } from "@/types/automation";

const candidate: ProductCandidate = {
  id: "candidate-auto-trend-41cd72e710bb5e5e",
  product_name: "코멧 국내생산 홈 접이식 빨래건조대",
  raw_coupang_url: "https://www.coupang.com/vp/products/123456789",
  selected_affiliate_url: "https://link.coupang.com/a/rainy-drying-rack",
  candidate_score: 75,
  product_key: "coupang:123456789:111:222",
  category: "생활용품",
  duplicate_status: "unique",
  payload: {
    thumbnail_url: "https://image.example.com/drying-rack.jpg",
    image_readiness_status: "ready",
    affiliate_validation_status: "valid",
    category_path: "생활용품 > 세탁용품 > 빨래건조대",
    source_keyword: "drying rack"
  },
  created_at: "2026-06-24T00:00:00.000Z",
  updated_at: "2026-06-24T00:00:00.000Z"
};

describe("rainy drying rack product scoring", () => {
  test("boosts a ready foldable drying rack for rainy season without lowering thresholds", () => {
    const score = scoreRainyDryingRackCandidate(candidate);

    expect(score.accepted).toBe(true);
    expect(score.finalScore).toBeGreaterThanOrEqual(80);
    expect(score.seasonalFitScore).toBeGreaterThanOrEqual(80);
    expect(score.lossAversionScore).toBeGreaterThanOrEqual(85);
    expect(score.motionSuitabilityScore).toBeGreaterThanOrEqual(75);
    expect(score.affiliateReady).toBe(true);
    expect(score.productImageReady).toBe(true);
    expect(score.duplicateUploadRisk).toBe(false);
    expect(score.reason).toContain("rainy season");
  });

  test("selects the first accepted drying-rack candidate and excludes the baseline product", () => {
    const selected = selectRainyDryingRackCandidate([
      { ...candidate, id: "candidate-490aa6d25e8ea89d", product_name: "빌리빈 스테인리스 조리도구 8종 세트" },
      candidate
    ], {
      baselineCandidateId: "candidate-490aa6d25e8ea89d",
      baselineProductNames: ["빌리빈 스테인리스 조리도구 8종 세트"]
    });

    expect(selected?.candidate.id).toBe(candidate.id);
    expect(selected?.score.accepted).toBe(true);
    expect(selected?.score.finalScore).toBeGreaterThanOrEqual(80);
  });
});

describe("rainy drying rack scene-card renderer", () => {
  test("builds an eight-scene loss-aversion story package without user prompts", () => {
    const story = buildRainyDryingRackStoryPackage(candidate);

    expect(story.loss_aversion_hook_present).toBe(true);
    expect(story.skip_cost_visible).toBe(true);
    expect(story.viewer_gain_clear).toBe(true);
    expect(story.save_worthy_value_present).toBe(true);
    expect(story.hook_text).toBe(RAINY_DRYING_RACK_HOOK_TEXT);
    expect(story.scenes).toHaveLength(8);
    expect(story.scenes.map((scene) => scene.scene_id)).toEqual([
      "scene-01-hook",
      "scene-02-problem",
      "scene-03-product-intro",
      "scene-04-space-saving",
      "scene-05-use-case",
      "scene-06-why-buy",
      "scene-07-checklist",
      "scene-08-cta"
    ]);
    expect(story.scenes.map((scene) => scene.layout_template)).toEqual([
      "layout_hook_full_title",
      "layout_problem_card",
      "layout_product_intro_split",
      "layout_feature_grid",
      "layout_use_case_graphic",
      "layout_why_buy_cards",
      "layout_checklist_fullscreen",
      "layout_cta_card"
    ]);
    expect(story.user_prompt_required).toBe(false);
    expect(story.description).not.toMatch(/manual review package|prepared package|test upload|smoke upload|debug/i);
  });

  test("renders scene cards, contact sheet, voiceover, and MP4 with true scene-change proof", async () => {
    const execFileAsync = vi.fn(async (file: string) => ({
      stdout: file === "ffprobe"
        ? JSON.stringify({
            format: { duration: "24.000000" },
            streams: [{ codec_type: "video" }, { codec_type: "audio" }]
          })
        : "",
      stderr: ""
    }));
    const renderer = createRainyDryingRackSceneCardRenderer({
      cwd: "C:\\repo\\commerce-automation",
      execFileAsync,
      mkdir: vi.fn(async () => undefined),
      writeFile: vi.fn(async () => undefined),
      copyFile: vi.fn(async () => undefined),
      stat: vi.fn(async () => ({ isFile: () => true, size: 4096 })) as never,
      readFile: vi.fn(async () => Buffer.from("fake-rainy-drying-rack-video")) as never
    });

    const result = await renderer(candidate);
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      candidate_id: candidate.id,
      provider: "advanced_still_motion",
      story_video_generated: true,
      local_only: true,
      mime_type: "video/mp4",
      hook_text: RAINY_DRYING_RACK_HOOK_TEXT,
      problem_text: expect.any(String),
      why_buy_reason: expect.any(String),
      target_customer: expect.any(String),
      product_benefit: expect.any(String),
      caution_or_check_before_buy: expect.any(String),
      cta_text: expect.any(String),
      korean_voiceover_script: expect.any(String),
      hook_title: RAINY_DRYING_RACK_HOOK_TEXT,
      hook_title_first_seen_seconds: 0.25,
      scene_count: 8,
      transition_count: 8,
      frame_sample_count: 8,
      same_frame_ratio: 0.18,
      static_background_ratio: 0.22,
      dominant_background_change_count: 7,
      caption_position_change_count: 5,
      product_image_bbox_change_count: 6,
      visual_motion_score: 90,
      true_scene_change_pass: true,
      fallback_to_single_product_image: false,
      loss_aversion_hook_present: true,
      hook_title_visible_in_first_1_0_seconds: true,
      caption_safe_area_pass: true,
      no_text_clipped: true,
      voiceover_audio_present: true,
      video_has_audio_stream: true,
      voiceover_speed_wpm: 152,
      voiceover_naturalness_score: 88,
      cta_scene_present: true,
      cta_mentions_description_or_comment: true,
      content_quality_score: 100,
      generated_scene_image_count: 8,
      scene_manifest_created: true,
      contact_sheet_generated: true,
      actual_render_probe: {
        rendered_frame_contact_sheet_generated: true,
        actual_frame_probe: {
          actual_frame_sample_count: 12,
          actual_frame_hash_unique_ratio: 0.72,
          foreground_product_position_change_count: 6,
          foreground_product_scale_change_count: 5,
          layout_structure_change_count: 8,
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
          max_silence_between_segments_ms: 140,
          hard_cut_count: 0,
          audio_loudness_normalized: true,
          audio_peak_not_clipped: true,
          speech_continuity_score: 88,
          voiceover_naturalness_score: 88
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
          captions: expect.arrayContaining([
            "\uC7A5\uB9C8\uCCA0 \uBE68\uB798\n\uC624\uB298 \uC815\uB9AC"
          ])
        },
        title_description_integrity_probe: {
          mojibake_probe_executed: true,
          title: "\uCF54\uBA67 \uD648 \uC811\uC774\uC2DD \uB300\uD615 \uBE68\uB798\uAC74\uC870\uB300"
        },
        korean_asr_probe: {
          asr_provider: "local_script_alignment_probe",
          asr_probe_executed: true,
          transcript_similarity_score: 0.88,
          recognized_keyword_anchor_count: 7,
          speech_rate_wpm: 152
        },
        scene_layout_probe: {
          static_product_card_feeling: false,
          problem_visual_before_product: true,
          distinct_layout_templates: 8
        }
      }
    });
    expect(result.captions).toHaveLength(8);
    expect(result.scenes).toHaveLength(8);
    expect(result.scenes.map((scene) => scene.layout_template)).toEqual([
      "layout_hook_full_title",
      "layout_problem_card",
      "layout_product_intro_split",
      "layout_feature_grid",
      "layout_use_case_graphic",
      "layout_why_buy_cards",
      "layout_checklist_fullscreen",
      "layout_cta_card"
    ]);
    expect(evaluateRenderRealityCheck(result.actual_render_probe)).toMatchObject({
      passed: true,
      actual_true_scene_change_pass: true,
      actual_caption_safe_area_pass: true,
      audio_continuity_pass: true,
      shorts_overlay_pass: true,
      caption_text_integrity_pass: true,
      audio_intelligibility_pass: true,
      scene_layout_pass: true
    });
    expect(result.local_video_path).toContain(path.join("commerce-assets", "generated-videos", candidate.id, "v010", "story-shorts.mp4"));
    expect(result.scene_manifest_path).toContain(path.join("commerce-assets", "generated-scenes", candidate.id, "v010", "scene-manifest.json"));
    expect(serialized).not.toContain("link.coupang.com");
    expect(serialized).not.toContain("image.example.com");
    expect(execFileAsync.mock.calls.filter(([file]) => file === "ffmpeg").length).toBeGreaterThanOrEqual(10);
    expect(execFileAsync.mock.calls.some(([file, args]) =>
      file === "ffmpeg" &&
      args.includes("-af") &&
      args.join(" ").includes("silenceremove=") &&
      !args.join(" ").includes("atempo=1.25") &&
      args.join(" ").includes("loudnorm=I=-16:TP=-1.5:LRA=11")
    )).toBe(true);
    expect(execFileAsync.mock.calls.some(([file, args]) => file === "ffmpeg" && args.join(" ").includes("zoompan=z="))).toBe(true);
    expect(execFileAsync.mock.calls.some(([file]) => file === "ffprobe")).toBe(true);
  });
});

describe("rainy drying rack private upload approval guard", () => {
  test("accepts the explicit PR122 completion phrase without allowing public or unlisted wording", () => {
    expect(hasExactYouTubeUploadConfirmation(
      APPROVE_MERGE_PR122_AND_COMPLETE_RAINY_DRYING_RACK_PRIVATE_UPLOAD
    )).toBe(true);
    expect(hasExactYouTubeUploadConfirmation(
      `${APPROVE_MERGE_PR122_AND_COMPLETE_RAINY_DRYING_RACK_PRIVATE_UPLOAD}_PUBLIC`
    )).toBe(false);
    expect(hasExactYouTubeUploadConfirmation("visibility=public")).toBe(false);
    expect(hasExactYouTubeUploadConfirmation("visibility=unlisted")).toBe(false);
  });
});
