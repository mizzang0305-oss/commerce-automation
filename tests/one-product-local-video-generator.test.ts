import { Buffer } from "node:buffer";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";

import {
  buildBilibinSceneImageBriefs,
  buildSceneImageManifest
} from "@/lib/uploads/videoAssets/autoSceneImagePipeline";
import { createOneProductLocalVideoGenerator } from "@/lib/uploads/videoAssets/oneProductLocalVideoGenerator";
import type { ProductCandidate } from "@/types/automation";

const candidate: ProductCandidate = {
  id: "candidate-real-asset-001",
  product_name: "빌리빈 스테인리스 조리도구 8종 세트",
  raw_coupang_url: "https://www.coupang.com/vp/products/123456789",
  selected_affiliate_url: "https://link.coupang.com/a/private-real-product",
  candidate_score: 91,
  payload: {
    thumbnail_url: "https://image.example.com/product.jpg",
    image_readiness_status: "ready",
    affiliate_validation_status: "valid"
  },
  created_at: "2026-06-15T00:00:00.000Z",
  updated_at: "2026-06-15T00:00:00.000Z"
};

describe("one-product local video generator adapter", () => {
  test("returns a local-only video contract without exposing source URLs", async () => {
    const execFileAsync = vi.fn(async (file: string) => ({
      stdout: file === "ffprobe"
        ? JSON.stringify({
            format: { duration: "25.000000" },
            streams: [
              { codec_type: "video" },
              { codec_type: "audio" }
            ]
          })
        : "",
      stderr: ""
    }));
    const mkdir = vi.fn(async () => undefined);
    const stat = vi.fn(async () => ({
      isFile: () => true,
      size: 8192
    }));
    const readFile = vi.fn(async () => Buffer.from("fake-mp4-content"));
    const sceneImagePipeline = vi.fn(async () => buildScenePipelineResult(candidate, "C:\\repo\\commerce-automation"));
    const generator = createOneProductLocalVideoGenerator({
      cwd: "C:\\repo\\commerce-automation",
      execFileAsync,
      mkdir,
      writeFile: vi.fn(async () => undefined),
      stat: stat as never,
      readFile: readFile as never,
      sceneImagePipeline
    });

    const result = await generator(candidate);
    const args = execFileAsync.mock.calls[1]?.[1] ?? [];
    const serialized = JSON.stringify(result);

    expect(execFileAsync).toHaveBeenCalledTimes(3);
    expect(sceneImagePipeline).toHaveBeenCalledTimes(1);
    expect(execFileAsync.mock.calls[0]?.[0]).toMatch(/powershell/i);
    expect(execFileAsync.mock.calls[1]?.[0]).toBe("ffmpeg");
    expect(execFileAsync.mock.calls[2]?.[0]).toBe("ffprobe");
    expect(execFileAsync.mock.calls[1]?.[2]?.timeout).toBeGreaterThanOrEqual(240000);
    expect(JSON.stringify(args)).toContain("scene-01-hook.png");
    expect(JSON.stringify(args)).toContain("scene-08-cta.png");
    expect(JSON.stringify(args)).not.toContain("https://image.example.com/product.jpg");
    expect(args).toContain("-i");
    expect(result).toMatchObject({
      candidate_id: "candidate-real-asset-001",
      mime_type: "video/mp4",
      size_bytes: 8192,
      duration_seconds: 25,
      black_screen_detected: false,
      generated_this_run: true,
      local_only: true,
      story_video_generated: true,
      voiceover_audio_present: true,
      voiceover_audio_file_present: true,
      audio_duration_seconds: 25,
      audio_mime_type: "audio/wav",
      audio_muxed_into_video: true,
      video_has_audio_stream: true,
      scene_count: 8,
      caption_count: 8,
      static_single_image_only: false,
      product_image_present: true,
      content_quality_score: 100,
      scene_image_briefs_generated: true,
      user_prompt_required: false,
      image_generation_provider: "real_scene_image_provider_mock",
      generated_scene_image_count: 8,
      generated_scene_image_paths_present: true,
      unique_scene_image_hash_count: 8,
      scene_image_color_palette_delta_pass: true,
      scene_image_semantic_kind_unique: true,
      product_image_reuse_ratio: 0.28,
      color_card_only_ratio: 0,
      real_scene_image_provider_configured: true,
      generated_scene_images_are_not_color_cards: true,
      generated_scene_images_are_visually_distinct: true,
      scene_manifest_created: true,
      renderer_consumed_scene_manifest: true,
      fallback_to_single_product_image: false,
      frame_sample_count: 8,
      same_frame_ratio: 0.18,
      static_background_ratio: 0.22,
      product_image_bbox_change_count: 8,
      caption_position_change_count: 6,
      dominant_background_change_count: 8,
      true_scene_change_pass: true,
      contact_sheet_generated: true,
      contact_sheet_path_present: true,
      hook_title_present: true,
      hook_title_visible_in_first_1_0_seconds: true,
      hook_title_visible_in_first_1_5_seconds: true,
      hook_title_readability_score: 94,
      hook_title_font_size_large: true,
      hook_title_contrast_pass: true,
      hook_title_background_chip_present: true,
      hook_title_safe_area_pass: true,
      caption_safe_area_pass: true,
      all_text_inside_mobile_safe_area: true,
      no_text_clipped: true,
      max_caption_lines: 2,
      caption_font_size_readable: true,
      caption_contrast_pass: true,
      transition_count: 8,
      visual_motion_score: 96,
      distinct_frame_ratio_pass: true,
      use_case_scene_present: true,
      kitchen_context_scene_present: true,
      utensil_usage_simulation_present: true,
      before_after_or_problem_scene_present: true,
      checklist_scene_present: true,
      cta_scene_present: true,
      cta_mentions_description_or_comment: true,
      voiceover_speed_wpm: 200,
      voiceover_speed_multiplier: 1.22,
      voiceover_naturalness_score: 84,
      voiceover_too_robotic: false,
      alternate_voice_used: true,
      max_silence_between_segments_ms: 240,
      audio_video_duration_gap_seconds: 0
    });
    expect(result.local_video_path).toContain(path.join("commerce-assets", "generated-videos", "candidate-real-asset-001", "v005"));
    expect(result.scene_manifest_path).toContain(path.join("commerce-assets", "generated-scenes", "candidate-real-asset-001", "v005", "scene-manifest.json"));
    expect(result.checksum_sha256).toHaveLength(64);
    expect(serialized).not.toContain("link.coupang.com");
    expect(serialized).not.toContain("image.example.com/product.jpg");
    expect(serialized).not.toMatch(/access_token|refresh_token|client_secret|Authorization|Bearer/i);
  });

  test("blocks candidates without an HTTP product image before invoking ffmpeg", async () => {
    const execFileAsync = vi.fn(async () => ({ stdout: "", stderr: "" }));
    const generator = createOneProductLocalVideoGenerator({
      execFileAsync,
      mkdir: vi.fn(async () => undefined),
      writeFile: vi.fn(async () => undefined),
      stat: vi.fn() as never,
      readFile: vi.fn() as never
    });

    await expect(generator({
      ...candidate,
      payload: {
        image_readiness_status: "missing_image",
        affiliate_validation_status: "valid"
      }
    })).rejects.toThrow("candidate_image_url_not_ready");
    expect(execFileAsync).not.toHaveBeenCalled();
  });
});

function buildScenePipelineResult(productCandidate: ProductCandidate, cwd: string) {
  const briefs = buildBilibinSceneImageBriefs(productCandidate);
  const generatedImages = briefs.map((brief, index) => ({
    scene_id: brief.scene_id,
    kind: brief.kind,
    image_path: path.join(cwd, "commerce-assets", "generated-scenes", productCandidate.id, "v005", `scene-${String(index + 1).padStart(2, "0")}-${brief.kind}.png`),
    width: 1080,
    height: 1920,
    generated: true
  }));
  const manifestPath = path.join(cwd, "commerce-assets", "generated-scenes", productCandidate.id, "v005", "scene-manifest.json");
  return {
    provider: "real_scene_image_provider_mock",
    version: "v005",
    scene_image_briefs: briefs,
    generated_images: generatedImages,
    manifest: buildSceneImageManifest({
      candidate: productCandidate,
      version: "v005",
      generatedImages,
      manifestPath
    }),
    manifest_path: manifestPath,
    contact_sheet_path: path.join(cwd, "commerce-assets", "generated-scenes", productCandidate.id, "v005", "scene-contact-sheet.jpg"),
    quality_report_path: path.join(cwd, "commerce-assets", "generated-scenes", productCandidate.id, "v005", "quality-report.json"),
    generated_scene_image_count: 8,
    generated_scene_image_paths_present: true,
    scene_manifest_created: true,
    contact_sheet_generated: true,
    quality_report: {
      frame_sample_count: 8,
      same_frame_ratio: 0.18,
      static_background_ratio: 0.22,
      unique_scene_image_hash_count: 8,
      scene_image_color_palette_delta_pass: true,
      scene_image_semantic_kind_unique: true,
      product_image_reuse_ratio: 0.28,
      color_card_only_ratio: 0,
      real_scene_image_provider_configured: true,
      generated_scene_images_are_not_color_cards: true,
      generated_scene_images_are_visually_distinct: true,
      product_image_bbox_change_count: 8,
      caption_position_change_count: 6,
      dominant_background_change_count: 8,
      visual_motion_score: 96,
      true_scene_change_pass: true
    }
  };
}
