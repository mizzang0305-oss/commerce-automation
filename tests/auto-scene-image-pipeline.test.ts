import path from "node:path";
import { Buffer } from "node:buffer";
import { describe, expect, test, vi } from "vitest";

import {
  buildBilibinSceneImageBriefs,
  buildSceneImageManifest,
  createAutoSceneImagePipeline
} from "@/lib/uploads/videoAssets/autoSceneImagePipeline";
import {
  buildBilibinMotionScenePlan,
  createMotionFirstShortsPipeline,
  type MotionFirstProvider,
  type MotionFirstProviderMode,
  type MotionScenePlan
} from "@/lib/uploads/videoAssets/motionFirstShortsPipeline";
import { createOneProductLocalVideoGenerator } from "@/lib/uploads/videoAssets/oneProductLocalVideoGenerator";
import type { ProductCandidate } from "@/types/automation";

const candidate: ProductCandidate = {
  id: "candidate-490aa6d25e8ea89d",
  product_name: "\ube4c\ub9ac\ube48 \uc2a4\ud14c\uc778\ub9ac\uc2a4 \uc870\ub9ac\ub3c4\uad6c 8\uc885 \uc138\ud2b8",
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

describe("auto scene image pipeline", () => {
  test("generates eight scene image briefs automatically from a product candidate", () => {
    const briefs = buildBilibinSceneImageBriefs(candidate);

    expect(briefs).toHaveLength(8);
    expect(briefs.map((brief) => brief.kind)).toEqual([
      "hook",
      "problem",
      "product_intro",
      "components",
      "use_case",
      "why_buy",
      "checklist",
      "cta"
    ]);
    expect(briefs.every((brief) => brief.user_prompt_required === false)).toBe(true);
    expect(briefs.every((brief) => brief.prompt.includes("vertical 9:16 shorts background"))).toBe(true);
    expect(briefs.every((brief) => brief.prompt.includes("no fake review"))).toBe(true);
    expect(briefs.every((brief) => brief.negative_prompt.includes("best or perfect guarantee"))).toBe(true);
  });

  test("stores generated scene image paths as the manifest source of truth", () => {
    const briefs = buildBilibinSceneImageBriefs(candidate);
    const generatedImages = briefs.map((brief, index) => ({
      scene_id: brief.scene_id,
      kind: brief.kind,
      image_path: path.join("commerce-assets", "generated-scenes", candidate.id, "v008", `scene-${String(index + 1).padStart(2, "0")}-${brief.kind}.png`),
      local_image_path: path.join("commerce-assets", "generated-scenes", candidate.id, "v008", `scene-${String(index + 1).padStart(2, "0")}-${brief.kind}.png`),
      mime_type: "image/png" as const,
      width: 1080,
      height: 1920,
      generated: true,
      provider: "codex_photorealistic_scene_image_provider",
      provider_mode: "photorealistic_generated" as const,
      provider_configured: true,
      generated_at: "1970-01-01T00:00:00.000Z",
      safe_summary: `${brief.kind} scene image generated without exposing raw source URLs.`
    }));

    const manifest = buildSceneImageManifest({
      candidate,
      version: "v008",
      generatedImages,
      manifestPath: path.join("commerce-assets", "generated-scenes", candidate.id, "v008", "scene-manifest.json")
    });

    expect(manifest.version).toBe("v008");
    expect(manifest.provider_mode).toBe("photorealistic_generated");
    expect(manifest.final_upload_allowed).toBe(true);
    expect(manifest.local_card_generator_used_for_final).toBe(false);
    expect(manifest.shape_card_scene_allowed).toBe(false);
    expect(manifest.abstract_scene_allowed).toBe(false);
    expect(manifest.image_generation_provider).toBe("codex_photorealistic_scene_image_provider");
    expect(manifest.scenes).toHaveLength(8);
    expect(manifest.scenes.every((scene) => scene.image_path.endsWith(".png"))).toBe(true);
    expect(manifest.scenes.filter((scene) => scene.kitchen_context)).toHaveLength(8);
    expect(manifest.scenes.filter((scene) => scene.human_or_hand_usage_signal)).toHaveLength(3);
    expect(manifest.scenes.filter((scene) => scene.utensil_interaction)).toHaveLength(3);
    expect(manifest.scenes.every((scene) => scene.abstract_shape_card === false)).toBe(true);
    expect(manifest.scenes[0]).toMatchObject({
      scene_id: "scene-01-hook",
      kind: "hook",
      text_position: "top_safe",
      transition: "zoom_snap"
    });
  });

  test("renderer consumes scene manifest image paths and does not fallback to one product image", async () => {
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
    const writeFile = vi.fn(async () => undefined);
    const pipeline = createAutoSceneImagePipeline({
      cwd: "C:\\repo\\commerce-automation",
      execFileAsync,
      mkdir: vi.fn(async () => undefined),
      writeFile,
      stat: vi.fn(async () => ({ isFile: () => true, size: 4096 })) as never
    });
    const generator = createOneProductLocalVideoGenerator({
      cwd: "C:\\repo\\commerce-automation",
      execFileAsync,
      mkdir: vi.fn(async () => undefined),
      writeFile,
      stat: vi.fn(async () => ({ isFile: () => true, size: 8192 })) as never,
      readFile: vi.fn(async () => Buffer.from("fake-mp4-content")),
      sceneImagePipeline: pipeline
    });

    const result = await generator(candidate);
    const ffmpegCalls = execFileAsync.mock.calls.filter((call) => call[0] === "ffmpeg");
    const videoRenderArgs = ffmpegCalls.at(-1)?.[1] ?? [];
    const videoRenderArgsText = JSON.stringify(videoRenderArgs);

    expect(result.scene_manifest_created).toBe(true);
    expect(result.generated_scene_image_count).toBe(8);
    expect(result.renderer_consumed_scene_manifest).toBe(true);
    expect(result.fallback_to_single_product_image).toBe(false);
    expect(result.true_scene_change_pass).toBe(true);
    expect(result.visual_motion_score).toBe(95);
    expect(result.image_generation_provider).toBe("codex_photorealistic_scene_image_provider");
    expect(result.image_generation_provider_mode).toBe("photorealistic_generated");
    expect(result.real_usage_scene_count).toBeGreaterThanOrEqual(5);
    expect(result.kitchen_context_scene_count).toBeGreaterThanOrEqual(3);
    expect(result.human_or_hand_usage_signal_scene_count).toBeGreaterThanOrEqual(2);
    expect(result.utensil_interaction_scene_count).toBeGreaterThanOrEqual(2);
    expect(result.abstract_shape_card_scene_count).toBe(0);
    expect(result.contact_sheet_generated).toBe(true);
    expect(result.scene_manifest_path).toContain(path.join("commerce-assets", "generated-scenes", candidate.id, "v008", "scene-manifest.json"));
    expect(videoRenderArgsText).toContain("scene-01-hook.png");
    expect(videoRenderArgsText).toContain("scene-08-cta.png");
    expect(videoRenderArgsText).not.toContain("https://image.example.com/product.jpg");
  });

  test("local deterministic scene card generator is draft-only and cannot satisfy final scene image proof", async () => {
    const execFileAsync = vi.fn(async () => ({
      stdout: "",
      stderr: ""
    }));
    const pipeline = createAutoSceneImagePipeline({
      cwd: "C:\\repo\\commerce-automation",
      providerMode: "draft",
      execFileAsync,
      mkdir: vi.fn(async () => undefined),
      writeFile: vi.fn(async () => undefined),
      stat: vi.fn(async () => ({ isFile: () => true, size: 4096 })) as never
    });

    const result = await pipeline(candidate);

    expect(result.provider).toBe("local_ffmpeg_scene_card_generator");
    expect(result.manifest.provider_mode).toBe("draft");
    expect(result.quality_report.true_scene_change_pass).toBe(false);
    expect(result.quality_report.visual_motion_score).toBe(0);
    expect(result.quality_report.color_card_only_ratio).toBe(1);
    expect(result.quality_report.product_image_reuse_ratio).toBeGreaterThan(0.35);
    expect(result.quality_report.real_scene_image_provider_configured).toBe(false);
  });

  test("local composited real usage scene provider is draft-composited and cannot satisfy final upload", async () => {
    const execFileAsync = vi.fn(async () => ({
      stdout: "",
      stderr: ""
    }));
    const pipeline = createAutoSceneImagePipeline({
      cwd: "C:\\repo\\commerce-automation",
      providerMode: "real_usage",
      execFileAsync,
      mkdir: vi.fn(async () => undefined),
      writeFile: vi.fn(async () => undefined),
      stat: vi.fn(async () => ({ isFile: () => true, size: 4096 })) as never
    });

    const result = await pipeline(candidate);

    expect(result.provider).toBe("local_composited_scene_image_provider");
    expect(result.manifest.provider_mode).toBe("draft_composited");
    expect(result.manifest.final_upload_allowed).toBe(false);
    expect(result.quality_report.real_scene_image_provider_configured).toBe(false);
    expect(result.quality_report.photorealistic_scene_provider_configured).toBe(false);
    expect(result.quality_report.photorealistic_score).toBeLessThan(80);
    expect(result.quality_report.vector_or_shape_scene_count).toBeGreaterThan(0);
    expect(result.quality_report.unrealistic_hand_detected).toBe(true);
    expect(result.quality_report.real_usage_scene_pass).toBe(false);
  });

  test("photorealistic usage scene provider produces final-upload usage, kitchen, and utensil evidence", async () => {
    const execFileAsync = vi.fn(async () => ({
      stdout: "",
      stderr: ""
    }));
    const pipeline = createAutoSceneImagePipeline({
      cwd: "C:\\repo\\commerce-automation",
      execFileAsync,
      mkdir: vi.fn(async () => undefined),
      writeFile: vi.fn(async () => undefined),
      stat: vi.fn(async () => ({ isFile: () => true, size: 4096 })) as never
    });

    const result = await pipeline(candidate);

    expect(result.provider).toBe("codex_photorealistic_scene_image_provider");
    expect(result.manifest.provider_mode).toBe("photorealistic_generated");
    expect(result.manifest.final_upload_allowed).toBe(true);
    expect(result.scene_image_briefs.every((brief) => brief.user_prompt_required === false)).toBe(true);
    expect(result.generated_scene_image_count).toBe(8);
    expect(result.generated_images.every((image) => image.provider_mode === "photorealistic_generated")).toBe(true);
    expect(result.generated_images.every((image) => image.mime_type === "image/png")).toBe(true);
    expect(result.quality_report).toMatchObject({
      real_scene_image_provider_configured: true,
      photorealistic_scene_provider_configured: true,
      photorealistic_score: 88,
      photorealistic_scene_count: 8,
      vector_or_shape_scene_count: 0,
      abstract_scene_count: 0,
      unrealistic_hand_detected: false,
      product_identity_consistency_score: 82,
      generated_scene_images_are_not_color_cards: true,
      generated_scene_images_are_visually_distinct: true,
      unique_scene_image_hash_count: 8,
      color_card_only_ratio: 0,
      product_image_reuse_ratio: 0.18,
      use_case_human_context_present: true,
      use_case_kitchen_context_present: true,
      utensil_interaction_present: true,
      human_use_signal_scene_count: 4,
      human_or_hand_usage_signal_scene_count: 4,
      kitchen_context_scene_count: 8,
      utensil_interaction_scene_count: 4,
      real_usage_scene_count: 8,
      abstract_shape_card_scene_count: 0,
      real_usage_visual_present: true,
      shape_card_scene_detected: false,
      shape_card_scene_count: 0,
      abstract_scene_ratio: 0,
      real_usage_scene_pass: true,
      true_scene_change_pass: true
    });
  });

  test("renderer fails when scene images are missing instead of reusing one product image", async () => {
    const execFileAsync = vi.fn(async () => ({ stdout: "", stderr: "" }));
    const pipeline = createAutoSceneImagePipeline({
      cwd: "C:\\repo\\commerce-automation",
      execFileAsync,
      mkdir: vi.fn(async () => undefined),
      writeFile: vi.fn(async () => undefined),
      stat: vi.fn(async () => {
        throw new Error("missing");
      }) as never
    });
    const generator = createOneProductLocalVideoGenerator({
      cwd: "C:\\repo\\commerce-automation",
      execFileAsync,
      mkdir: vi.fn(async () => undefined),
      writeFile: vi.fn(async () => undefined),
      stat: vi.fn() as never,
      readFile: vi.fn() as never,
      sceneImagePipeline: pipeline
    });

    await expect(generator(candidate)).rejects.toThrow("scene_image_generation_failed");
    expect(execFileAsync.mock.calls.some((call) => call[0] === "ffmpeg" && JSON.stringify(call[1]).includes("story-shorts.mp4"))).toBe(false);
  });
});

describe("motion-first shorts pipeline", () => {
  test("generates eight motion scene briefs automatically without manual prompts", () => {
    const plan = buildBilibinMotionScenePlan(candidate);

    expect(plan.scene_plan.map((scene) => scene.scene_id)).toEqual([
      "scene-01-hook",
      "scene-02-problem",
      "scene-03-product-intro",
      "scene-04-hand-pickup",
      "scene-05-cooking-use",
      "scene-06-product-rotate",
      "scene-07-checklist",
      "scene-08-cta"
    ]);
    expect(plan.scene_video_briefs_generated).toBe(true);
    expect(plan.scene_image_briefs_generated).toBe(true);
    expect(plan.scene_prompts_generated).toBe(true);
    expect(plan.user_prompt_required).toBe(false);
    expect(plan.manual_image_upload_required).toBe(false);
    expect(plan.manual_scene_selection_required).toBe(false);
    expect(plan.manual_provider_selection_required).toBe(false);
    expect(plan.scene_plan.find((scene) => scene.scene_id === "scene-04-hand-pickup")?.prompt)
      .toContain("human hand taking a stainless steel utensil");
    expect(plan.scene_plan.find((scene) => scene.scene_id === "scene-05-cooking-use")?.prompt)
      .toContain("hand stirring soup using a stainless steel ladle");
    expect(plan.scene_plan.find((scene) => scene.scene_id === "scene-06-product-rotate")?.prompt)
      .toContain("rotating slowly");
    expect(plan.scene_plan.every((scene) => scene.negative_prompt.includes("no cartoon"))).toBe(true);
    expect(plan.scene_plan.every((scene) => scene.negative_prompt.includes("no vector"))).toBe(true);
  });

  test("provider router prefers real motion clips when the quality gate passes", async () => {
    const pipeline = createMotionFirstShortsPipeline({
      cwd: "C:\\repo\\commerce-automation",
      mkdir: vi.fn(async () => undefined),
      writeFile: vi.fn(async () => undefined),
      stat: vi.fn(async () => ({ isFile: () => true, size: 4096 })) as never,
      providers: {
        motionClip: provider("real_motion_generated", true),
        imageToVideo: provider("image_to_video_generated", true),
        animatedStill: provider("animated_still_generated", true),
        slideshow: provider("slideshow_generated", true)
      }
    });

    const result = await pipeline(candidate);

    expect(result.motion_first_pipeline_enabled).toBe(true);
    expect(result.provider_selected).toBe("real_motion_generated");
    expect(result.fallback_chain_used).toEqual(["real_motion_generated"]);
    expect(result.motion_manifest_created).toBe(true);
    expect(result.renderer_consumed_motion_manifest).toBe(true);
    expect(result.final_upload_allowed).toBe(true);
    expect(result.scene_count).toBe(8);
    expect(result.motion_scene_count).toBeGreaterThanOrEqual(4);
    expect(result.real_motion_scene_count).toBeGreaterThanOrEqual(2);
    expect(result.hand_interaction_scene_count).toBeGreaterThanOrEqual(2);
    expect(result.utensil_interaction_scene_count).toBeGreaterThanOrEqual(2);
    expect(result.product_rotate_scene_present).toBe(true);
    expect(result.kitchen_context_scene_count).toBeGreaterThanOrEqual(5);
    expect(result.slideshow_like_ratio).toBeLessThanOrEqual(0.25);
    expect(result.blockers).toEqual([]);
    expect(result.manifest.scenes.find((scene) => scene.scene_id === "scene-04-hand-pickup"))
      .toMatchObject({ asset_type: "video", real_motion: true, hand_interaction: true, utensil_interaction: true });
  });

  test("provider router falls back to strong image-to-video before animated stills", async () => {
    const pipeline = createMotionFirstShortsPipeline({
      cwd: "C:\\repo\\commerce-automation",
      mkdir: vi.fn(async () => undefined),
      writeFile: vi.fn(async () => undefined),
      stat: vi.fn(async () => ({ isFile: () => true, size: 4096 })) as never,
      providers: {
        motionClip: provider("real_motion_generated", false),
        imageToVideo: provider("image_to_video_generated", true),
        animatedStill: provider("animated_still_generated", true),
        slideshow: provider("slideshow_generated", true)
      }
    });

    const result = await pipeline(candidate);

    expect(result.provider_selected).toBe("image_to_video_generated");
    expect(result.fallback_chain_used).toEqual(["real_motion_generated", "image_to_video_generated"]);
    expect(result.final_upload_allowed).toBe(true);
    expect(result.real_motion_scene_count).toBeGreaterThanOrEqual(2);
    expect(result.manifest.scenes.filter((scene) => scene.strong_image_to_video_motion)).toHaveLength(4);
  });

  test("animated still fallback runs but cannot pass the motion-first final upload gate", async () => {
    const pipeline = createMotionFirstShortsPipeline({
      cwd: "C:\\repo\\commerce-automation",
      mkdir: vi.fn(async () => undefined),
      writeFile: vi.fn(async () => undefined),
      stat: vi.fn(async () => ({ isFile: () => true, size: 4096 })) as never,
      providers: {
        motionClip: provider("real_motion_generated", false),
        imageToVideo: provider("image_to_video_generated", false),
        animatedStill: provider("animated_still_generated", true),
        slideshow: provider("slideshow_generated", true)
      }
    });

    const result = await pipeline(candidate);

    expect(result.provider_selected).toBe("animated_still_generated");
    expect(result.fallback_chain_used).toEqual([
      "real_motion_generated",
      "image_to_video_generated",
      "animated_still_generated"
    ]);
    expect(result.final_upload_allowed).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      "REAL_MOTION_CLIP_REQUIRED",
      "HAND_INTERACTION_SCENE_MISSING",
      "UTENSIL_INTERACTION_SCENE_MISSING"
    ]));
  });

  test("slideshow fallback is created only as a blocked last resort", async () => {
    const pipeline = createMotionFirstShortsPipeline({
      cwd: "C:\\repo\\commerce-automation",
      mkdir: vi.fn(async () => undefined),
      writeFile: vi.fn(async () => undefined),
      stat: vi.fn(async () => ({ isFile: () => true, size: 4096 })) as never,
      providers: {
        motionClip: provider("real_motion_generated", false),
        imageToVideo: provider("image_to_video_generated", false),
        animatedStill: provider("animated_still_generated", false),
        slideshow: provider("slideshow_generated", true)
      }
    });

    const result = await pipeline(candidate);

    expect(result.provider_selected).toBe("slideshow_generated");
    expect(result.final_upload_allowed).toBe(false);
    expect(result.fallback_to_slideshow_only).toBe(true);
    expect(result.blockers).toEqual(expect.arrayContaining([
      "SLIDESHOW_LIKE_OUTPUT_BLOCKED",
      "IMAGE_SWAP_ONLY_VIDEO_BLOCKED"
    ]));
  });
});

function provider(providerMode: MotionFirstProviderMode, configured: boolean): MotionFirstProvider {
  return {
    provider_name: `test_${providerMode}`,
    provider_mode: providerMode,
    configured,
    generate: async ({ scene_plan }) => ({
      ok: true,
      scenes: providerScenes(scene_plan, providerMode)
    })
  };
}

function providerScenes(scenePlan: MotionScenePlan[], providerMode: MotionFirstProviderMode) {
  return scenePlan.map((scene) => {
    const coreMotion = [
      "scene-02-problem",
      "scene-04-hand-pickup",
      "scene-05-cooking-use",
      "scene-06-product-rotate"
    ].includes(scene.scene_id);
    const realOrStrong = providerMode === "real_motion_generated" || providerMode === "image_to_video_generated";
    return {
      scene_id: scene.scene_id,
      kind: scene.kind,
      asset_type: providerMode === "slideshow_generated" ? "image" as const : "video" as const,
      asset_path: path.join("commerce-assets", "generated-motion", candidate.id, "v001", `${scene.scene_id}.${providerMode === "slideshow_generated" ? "png" : "mp4"}`),
      real_motion: providerMode === "real_motion_generated" && coreMotion,
      strong_image_to_video_motion: providerMode === "image_to_video_generated" && coreMotion,
      animated_still: providerMode === "animated_still_generated",
      image_swap_only: providerMode === "slideshow_generated",
      hand_interaction: realOrStrong && ["scene-02-problem", "scene-04-hand-pickup"].includes(scene.scene_id),
      utensil_interaction: realOrStrong && ["scene-04-hand-pickup", "scene-05-cooking-use"].includes(scene.scene_id),
      product_rotate_scene: scene.scene_id === "scene-06-product-rotate" && realOrStrong,
      kitchen_context: providerMode !== "slideshow_generated",
      duration_seconds: scene.duration_seconds
    };
  });
}
