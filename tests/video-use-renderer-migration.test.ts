import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { loadVideoRendererConfig, VIDEO_USE_PINNED_COMMIT } from "@/video/config/videoRendererConfig";
import type { RenderRequest, RenderResult, VideoRenderer } from "@/video/contracts/renderer";
import { buildNoUploadRenderBridge } from "@/video/integration/renderResultToUploadAsset";
import { validateProductImages } from "@/video/photoToShort/imageValidator";
import { buildMotionClipArgs } from "@/video/photoToShort/motionClipBuilder";
import { buildPhotoToShortPlan } from "@/video/photoToShort/photoToShortPlan";
import { executeRenderer } from "@/video/rendererOrchestrator";
import { renderShadowComparison } from "@/video/renderers/shadowRenderer";

describe("video-use renderer migration", () => {
  test("defaults to legacy with every production mutation disabled", () => {
    const config = loadVideoRendererConfig({ NODE_ENV: "test" }, "C:/repo");
    expect(config.renderer).toBe("legacy");
    expect(config.videoUseEnabled).toBe(false);
    expect(config.previewOnly).toBe(true);
    expect(config.liveUpload).toBe(false);
    expect(config.productionDbWrite).toBe(false);
    expect(config.videoUseCommit).toBe(VIDEO_USE_PINNED_COMMIT);
  });

  test.each([1, 3, 6])("plans photo-to-short for %i local images", (count) => {
    const request = requestFixture(count, count === 1 ? 15 : count === 3 ? 20 : 30);
    const plan = buildPhotoToShortPlan(request);
    expect(plan.scenes).toHaveLength(count);
    expect(plan.scenes.reduce((sum, scene) => sum + scene.duration_seconds, 0)).toBeCloseTo(request.target_duration_seconds, 2);
    expect(plan.width).toBe(1080);
    expect(plan.height).toBe(1920);
    expect(plan.fps).toBe(30);
    expect(plan.voiceover_required).toBe(false);
    expect(plan.remote_download_allowed).toBe(false);
  });

  test("builds a local-only H264/AAC faststart motion clip command", () => {
    const args = buildMotionClipArgs({
      imagePath: "C:/fixtures/한글 상품.png",
      outputPath: "C:/output/edit/scene.mp4",
      durationSeconds: 5,
      effect: "slow_push_in",
      width: 1080,
      height: 1920,
      fps: 30
    });
    expect(args).toContain("anullsrc=channel_layout=stereo:sample_rate=48000");
    expect(args).toContain("libx264");
    expect(args).toContain("aac");
    expect(args).toContain("yuv420p");
    expect(args).toContain("+faststart");
    expect(args.join(" ")).not.toMatch(/https?:\/\//);
  });

  test("blocks corrupt, too-small, and duplicate local images", async () => {
    const validStat = vi.fn(async () => ({ isFile: () => true, size: 1000 })) as never;
    const probe = vi.fn(async () => ({ stdout: JSON.stringify({ streams: [{ codec_name: "png", width: 1080, height: 1920 }] }), stderr: "" })) as never;
    const sameBytes = vi.fn(async () => Buffer.from("same")) as never;
    await expect(validateProductImages([
      { path: path.resolve("fixtures/a.png") },
      { path: path.resolve("fixtures/b.png") }
    ], { stat: validStat, readFile: sameBytes, exec: probe })).rejects.toThrow("PHOTO_SOURCE_DUPLICATE_HASH");

    const tooSmallProbe = vi.fn(async () => ({ stdout: JSON.stringify({ streams: [{ codec_name: "png", width: 200, height: 200 }] }), stderr: "" })) as never;
    await expect(validateProductImages([{ path: path.resolve("fixtures/small.png") }], {
      stat: validStat,
      readFile: vi.fn(async () => Buffer.from("small")) as never,
      exec: tooSmallProbe
    })).rejects.toThrow("PHOTO_SOURCE_RESOLUTION_TOO_SMALL");

    const missingStat = vi.fn(async () => { throw new Error("missing"); }) as never;
    await expect(validateProductImages([{ path: path.resolve("fixtures/corrupt.png") }], {
      stat: missingStat
    })).rejects.toThrow("PHOTO_SOURCE_FILE_NOT_READABLE");
  });

  test("shadow renders both engines but never produces a publish-ready result", async () => {
    const request = requestFixture(3, 20);
    const legacy = mockRenderer("legacy", successfulResult("legacy"));
    const videoUse = mockRenderer("video_use", successfulResult("video_use"));
    const result = await renderShadowComparison({ request, legacyRenderer: legacy, videoUseRenderer: videoUse });
    expect(result.legacy.success).toBe(true);
    expect(result.video_use.success).toBe(true);
    expect(result.safe_to_publish).toBe(false);
    expect(result.live_upload_attempted).toBe(false);
    expect(result.preferred_publish_renderer).toBe("legacy");
  });

  test("falls back to legacy after a video-use timeout without publishing", async () => {
    const request = requestFixture(3, 20);
    const result = await executeRenderer({
      request,
      config: {
        ...loadVideoRendererConfig({
          NODE_ENV: "test",
          VIDEO_RENDERER: "video_use",
          VIDEO_USE_ENABLED: "true"
        }),
        renderer: "video_use",
        videoUseEnabled: true
      },
      legacyRenderer: mockRenderer("legacy", successfulResult("legacy")),
      videoUseRenderer: mockRenderer("video_use", failedResult("video_use", "VIDEO_USE_RENDER_TIMEOUT"))
    });
    expect(result.mode).toBe("video_use");
    if (result.mode === "shadow") throw new Error("unexpected shadow result");
    expect(result.fallback_used).toBe(true);
    expect(result.result.renderer_name).toBe("legacy");
    expect(result.result.warnings).toContain("VIDEO_USE_FAILED_LEGACY_FALLBACK_USED");
    expect(result.safe_to_publish).toBe(false);
  });

  test("never forwards shadow or successful local render output to a live publisher", () => {
    const shadow = {
      mode: "shadow" as const,
      legacy: successfulResult("legacy"),
      video_use: successfulResult("video_use"),
      safe_to_publish: false as const,
      live_upload_attempted: false as const,
      comparison_only: true as const,
      preferred_publish_renderer: "legacy" as const,
      warnings: []
    };
    expect(buildNoUploadRenderBridge(shadow)).toEqual(expect.objectContaining({
      ready: false,
      blocker: "SHADOW_OUTPUT_NOT_PUBLISHABLE",
      video_path: null,
      live_upload_attempted: false
    }));
    expect(buildNoUploadRenderBridge({
      mode: "legacy",
      result: successfulResult("legacy"),
      fallback_used: false,
      safe_to_publish: false
    }).blocker).toBe("LIVE_UPLOAD_DISABLED");
  });
});

function requestFixture(imageCount: number, duration: number): RenderRequest {
  return {
    job_id: "job-1",
    product_id: "product-1",
    campaign_id: "campaign-1",
    source_timestamp: "2026-07-12T00:00:00.000Z",
    title: "긴 한글 상품명 렌더링 테스트",
    subtitle_lines: ["첫 번째 장면", "두 번째 장면", "상품 링크 확인"],
    hook: "상품을 확인하세요",
    cta: "상품 링크는 설명란",
    disclosure: "쿠팡 파트너스 활동으로 수수료를 제공받을 수 있습니다.",
    product_images: Array.from({ length: imageCount }, (_, index) => ({ path: path.resolve(`fixtures/product-${index + 1}.png`) })),
    logo_asset: null,
    bgm_asset: null,
    voiceover_asset: null,
    target_duration_seconds: duration,
    aspect_ratio: "9:16",
    width: 1080,
    height: 1920,
    fps: 30,
    template_id: "photo-to-short-v1",
    output_directory: path.resolve("artifacts/test-render"),
    metadata: { safe: true }
  };
}

function mockRenderer(name: "legacy" | "video_use", result: RenderResult): VideoRenderer {
  return { name, version: "test", render: vi.fn(async () => result) };
}

function successfulResult(name: "legacy" | "video_use"): RenderResult {
  return {
    success: true,
    renderer_name: name,
    renderer_version: "test",
    upstream_commit: name === "video_use" ? VIDEO_USE_PINNED_COMMIT : null,
    output_video_path: "C:/output/final.mp4",
    preview_video_path: "C:/output/preview.mp4",
    thumbnail_path: "C:/output/thumbnail.jpg",
    duration_seconds: 20,
    width: 1080,
    height: 1920,
    fps: 30,
    video_codec: "h264",
    audio_codec: "aac",
    file_size_bytes: 1000,
    source_hash: "a".repeat(64),
    render_manifest_path: "C:/output/render_manifest.json",
    quality_report_path: "C:/output/quality_report.json",
    quality: {
      status: "PASS", width: 1080, height: 1920, fps: 30, duration_seconds: 20,
      video_codec: "h264", pixel_format: "yuv420p", audio_codec: "aac", audio_stream_present: true,
      faststart: true, black_frame_detected: false, warnings: [], blockers: []
    },
    warnings: [],
    errors: [],
    elapsed_seconds: 1,
    live_upload_attempted: false,
    production_db_write_attempted: false
  };
}

function failedResult(name: "legacy" | "video_use", error: string): RenderResult {
  return {
    ...successfulResult(name),
    success: false,
    output_video_path: null,
    quality: { ...successfulResult(name).quality, status: "FAIL", blockers: [error] },
    errors: [error]
  };
}
