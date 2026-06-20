import path from "node:path";
import { Buffer } from "node:buffer";
import { describe, expect, test, vi } from "vitest";

import {
  buildBilibinSceneImageBriefs,
  buildSceneImageManifest,
  createAutoSceneImagePipeline
} from "@/lib/uploads/videoAssets/autoSceneImagePipeline";
import { createOneProductLocalVideoGenerator } from "@/lib/uploads/videoAssets/oneProductLocalVideoGenerator";
import type { ProductCandidate } from "@/types/automation";

const candidate: ProductCandidate = {
  id: "candidate-490aa6d25e8ea89d",
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
    expect(JSON.stringify(briefs)).not.toMatch(/제가 써봤|실제 사용 후기|무조건|완벽|최고/);
  });

  test("stores generated scene image paths as the manifest source of truth", () => {
    const briefs = buildBilibinSceneImageBriefs(candidate);
    const generatedImages = briefs.map((brief, index) => ({
      scene_id: brief.scene_id,
      kind: brief.kind,
      image_path: path.join("commerce-assets", "generated-scenes", candidate.id, "v005", `scene-${String(index + 1).padStart(2, "0")}-${brief.kind}.png`),
      width: 1080,
      height: 1920,
      generated: true
    }));

    const manifest = buildSceneImageManifest({
      candidate,
      version: "v005",
      generatedImages,
      manifestPath: path.join("commerce-assets", "generated-scenes", candidate.id, "v005", "scene-manifest.json")
    });

    expect(manifest.version).toBe("v005");
    expect(manifest.scenes).toHaveLength(8);
    expect(manifest.scenes.every((scene) => scene.image_path.endsWith(".png"))).toBe(true);
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
    expect(result.true_scene_change_pass).toBe(false);
    expect(result.visual_motion_score).toBe(0);
    expect(result.contact_sheet_generated).toBe(true);
    expect(result.scene_manifest_path).toContain(path.join("commerce-assets", "generated-scenes", candidate.id, "v005", "scene-manifest.json"));
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
      execFileAsync,
      mkdir: vi.fn(async () => undefined),
      writeFile: vi.fn(async () => undefined),
      stat: vi.fn(async () => ({ isFile: () => true, size: 4096 })) as never
    });

    const result = await pipeline(candidate);

    expect(result.provider).toBe("local_ffmpeg_scene_card_generator");
    expect(result.quality_report.true_scene_change_pass).toBe(false);
    expect(result.quality_report.visual_motion_score).toBe(0);
    expect(result.quality_report.color_card_only_ratio).toBe(1);
    expect(result.quality_report.product_image_reuse_ratio).toBeGreaterThan(0.35);
    expect(result.quality_report.real_scene_image_provider_configured).toBe(false);
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
