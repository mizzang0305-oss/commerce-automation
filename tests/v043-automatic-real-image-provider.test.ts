import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import {
  buildV043AutomaticRealImageReview,
  buildV043ScenePromptPackage
} from "../src/uploads/multi-channel/automaticRealImageReviewBuilder";
import { createRealImageProviderRegistry, REAL_IMAGE_PROVIDER_PRIORITY } from "../src/uploads/multi-channel/realImageProviderRegistry";
import { type RealImageProvider } from "../src/uploads/multi-channel/realImageProvider";

async function makeCwd() {
  return mkdtemp(path.join(os.tmpdir(), "commerce-v043-"));
}

function validPng(width = 1080, height = 1920) {
  const buffer = Buffer.alloc(60001);
  buffer[0] = 0x89;
  buffer[1] = 0x50;
  buffer[2] = 0x4e;
  buffer[3] = 0x47;
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  for (let index = 32; index < buffer.length; index += 1) {
    buffer[index] = index % 251;
  }
  return buffer;
}

function makeMockProvider(input: { quality?: "valid" | "tiny" } = {}): RealImageProvider {
  return {
    key: "codex_image_skill",
    priority: 1,
    async checkAvailability() {
      return {
        provider: "codex_image_skill",
        provider_configured: true,
        provider_test_image_generated: true,
        provider_test_image_real_photo_likeness_pass: true,
        provider_test_image_not_mosaic: true,
        provider_test_image_not_checkerboard: true,
        provider_test_image_not_noise: true,
        provider_test_image_decode_success: true,
        provider_available: true,
        provider_blocker: null,
        raw_url_printed: false,
        secrets_printed: false
      };
    },
    async generateImage(request) {
      await mkdir(path.dirname(request.output_path), { recursive: true });
      await writeFile(request.output_path, input.quality === "tiny" ? validPng(300, 300) : validPng());
      const stats = await stat(request.output_path);
      return {
        provider: "codex_image_skill",
        generated: true,
        output_path: request.output_path,
        width: input.quality === "tiny" ? 300 : 1080,
        height: input.quality === "tiny" ? 300 : 1920,
        file_size_bytes: stats.size,
        raw_url_printed: false
      };
    }
  };
}

describe("v043 automatic real image provider orchestrator", () => {
  test("real_image_provider_registry_tests expose priority and no configured provider by default", async () => {
    const registry = createRealImageProviderRegistry();
    const availability = await registry.checkAvailability();

    expect(registry.provider_priority).toEqual([...REAL_IMAGE_PROVIDER_PRIORITY]);
    expect(availability.provider_available).toBe(false);
    expect(availability.provider_blocker).toBe("REAL_IMAGE_PROVIDER_NOT_CONFIGURED");
  });

  test("provider_availability_gate_tests write setup artifacts when provider is not configured", async () => {
    const cwd = await makeCwd();
    try {
      const result = await buildV043AutomaticRealImageReview({ cwd });

      expect(result.FINAL_STATUS).toBe("BLOCKED_REAL_IMAGE_PROVIDER_NOT_CONFIGURED");
      expect(result.V043_AUTO_IMAGE_READY).toBe(false);
      expect(result.V043_REVIEW_PACKETS_READY).toBe(false);
      expect(result.SAFE_TO_UPLOAD).toBe(false);
      expect(result.provider_blocker).toBe("REAL_IMAGE_PROVIDER_NOT_CONFIGURED");
      await expect(stat(result.artifacts.real_image_provider_setup_guide)).resolves.toBeTruthy();
      await expect(stat(result.artifacts.provider_status)).resolves.toBeTruthy();
      await expect(stat(result.artifacts.scene_prompt_package)).resolves.toBeTruthy();
      await expect(stat(result.artifacts.fallback_to_v042_image_pack_guide)).resolves.toBeTruthy();
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("automatic_scene_prompt_generation_tests create 18 scene prompts", async () => {
    const promptPackage = await buildV043ScenePromptPackage({ cwd: "C:\\repo" });

    expect(promptPackage.channels).toHaveLength(3);
    expect(promptPackage.channels.flatMap((channel) => channel.scenes)).toHaveLength(18);
    expect(promptPackage.channels[0].scenes[0].aspect_ratio).toBeUndefined();
    expect(JSON.stringify(promptPackage)).not.toContain("https://");
  });

  test("automatic_image_generation_manifest_tests and three_channel_video_builder_tests pass with injected real provider", async () => {
    const cwd = await makeCwd();
    try {
      const result = await buildV043AutomaticRealImageReview({
        cwd,
        providers: [makeMockProvider()],
        mediaRunner: async ({ outputPath, actualFrameContactSheetPath, shortsUiOverlayContactSheetPath }) => {
          await writeFile(outputPath, "fake-local-review-video-by-test-runner", "utf8");
          await writeFile(actualFrameContactSheetPath, "fake-frame-sheet", "utf8");
          await writeFile(shortsUiOverlayContactSheetPath, "fake-overlay-sheet", "utf8");
        }
      });

      expect(result.FINAL_STATUS).toBe("SUCCESS_V043_AUTO_REAL_IMAGE_REVIEW_PACKETS_READY");
      expect(result.V043_AUTO_IMAGE_READY).toBe(true);
      expect(result.V043_REVIEW_PACKETS_READY).toBe(true);
      expect(result.generated_scene_asset_count).toBe(18);
      expect(result.generated_channels).toEqual(["father_jobs", "neoman_moleulgeol", "lets_buy"]);
      expect(result.real_image_semantic_pass).toBe(true);
      expect(result.videos_generated).toBe(true);
      await expect(stat(result.artifacts.image_generation_manifest)).resolves.toBeTruthy();
      await expect(stat(path.join(cwd, "commerce-assets/review/v043/father_jobs/review-console.html"))).resolves.toBeTruthy();
      await expect(stat(path.join(cwd, "commerce-assets/review/v043/neoman_moleulgeol/local-review-video.mp4"))).resolves.toBeTruthy();
      await expect(stat(path.join(cwd, "commerce-assets/review/v043/lets_buy/human-review-decision.json"))).resolves.toBeTruthy();
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("provider_no_mock_image_tests and provider_no_checkerboard_tests block non-real dimensions", async () => {
    const cwd = await makeCwd();
    try {
      const result = await buildV043AutomaticRealImageReview({ cwd, providers: [makeMockProvider({ quality: "tiny" })] });

      expect(result.FINAL_STATUS).toBe("BLOCKED_V043_REAL_IMAGE_SEMANTIC_GATE");
      expect(result.V043_REVIEW_PACKETS_READY).toBe(false);
      expect(result.semantic_blocker).toBeTruthy();
      expect(result.videos_generated).toBe(false);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("metadata_disclosure_tests, comment_template_tests, no_raw_affiliate_url_report_tests, mojibake_tests", async () => {
    const cwd = await makeCwd();
    try {
      const result = await buildV043AutomaticRealImageReview({ cwd });
      const serialized = JSON.stringify(result) + await readFile(result.artifacts.fallback_to_v042_image_pack_guide, "utf8");

      expect(serialized).toContain("review:v041:from-pack");
      expect(serialized).not.toContain("https://");
      expect(serialized).not.toContain("example.com");
      expect(serialized).not.toContain("???");
      expect(serialized).not.toContain("\uFFFD");
      expect(result.youtube_execute_called).toBe(false);
      expect(result.videos_insert_called).toBe(false);
      expect(result.new_upload_attempted).toBe(false);
      expect(result.comment_create_update_delete_called).toBe(false);
      expect(result.visibility_changed).toBe(false);
      expect(result.R2_upload).toBe(false);
      expect(result.product_assets_write).toBe(false);
      expect(result.DB_write).toBe(false);
      expect(result.raw_urls_printed).toBe(false);
      expect(result.secrets_printed).toBe(false);
      expect(result.fake_success).toBe(false);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
