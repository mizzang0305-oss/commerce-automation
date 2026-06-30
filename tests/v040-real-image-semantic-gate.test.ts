import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import {
  V039_FAILURE_RECORD,
  buildV040ScenePromptPackage,
  writeV040RealImageSemanticReviewPackets
} from "../scripts/uploads/generate-v040-real-image-semantic-review-packets";
import {
  detectMosaicPlaceholder,
  detectPixelPlaceholderPattern
} from "../src/uploads/multi-channel/mosaicPlaceholderDetector";
import {
  evaluateRealImageProviderAvailability
} from "../src/uploads/multi-channel/realImageProviderAvailabilityGate";
import {
  validateRealImageSemanticGate
} from "../src/uploads/multi-channel/realImageSemanticGate";
import {
  validateSceneObjectRequirements
} from "../src/uploads/multi-channel/sceneObjectRequirementGate";

async function makeCwd() {
  return mkdtemp(path.join(os.tmpdir(), "commerce-v040-"));
}

describe("v040 real image semantic gate", () => {
  test("v039_fail_status_tests records owner failure and blocks PR158 merge", () => {
    expect(V039_FAILURE_RECORD).toMatchObject({
      version: "v039",
      human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
      safe_to_upload: false,
      pr158_merge_allowed: false
    });
    expect(V039_FAILURE_RECORD.fail_reasons).toEqual(expect.arrayContaining([
      "GENERATED_SCENE_ASSETS_ARE_MOSAIC_PLACEHOLDERS",
      "IMAGE_SKILL_PROVIDER_FALSE_POSITIVE",
      "REAL_IMAGE_SEMANTIC_GATE_MISSING",
      "PR158_MERGE_BLOCKED"
    ]));
  });

  test("mosaic_placeholder_detector_tests and checkerboard_noise_detector_tests block synthetic patterns", () => {
    const mosaic = detectMosaicPlaceholder({
      width: 720,
      height: 1280,
      color_cluster_count: 4,
      repeated_tile_ratio: 0.78,
      edge_direction_uniformity: 0.86,
      entropy_score: 0.32
    });
    const checkerboard = detectPixelPlaceholderPattern({
      alternating_grid_score: 0.91,
      random_noise_score: 0.12,
      gradient_smoothness_score: 0.1,
      abstract_color_grid_score: 0.88
    });
    const photoLike = detectMosaicPlaceholder({
      width: 1080,
      height: 1920,
      color_cluster_count: 58,
      repeated_tile_ratio: 0.08,
      edge_direction_uniformity: 0.22,
      entropy_score: 0.84
    });

    expect(mosaic.mosaic_pattern_detected).toBe(true);
    expect(mosaic.blockers).toContain("MOSAIC_PATTERN_DETECTED");
    expect(checkerboard.checkerboard_pattern_detected).toBe(true);
    expect(checkerboard.abstract_color_grid_detected).toBe(true);
    expect(checkerboard.blockers).toEqual(expect.arrayContaining([
      "CHECKERBOARD_PATTERN_DETECTED",
      "ABSTRACT_COLOR_GRID_DETECTED"
    ]));
    expect(photoLike.mosaic_pattern_detected).toBe(false);
    expect(photoLike.blockers).not.toContain("MOSAIC_PATTERN_DETECTED");
  });

  test("scene_object_requirement_gate_tests require channel-specific real scene objects", () => {
    const pass = validateSceneObjectRequirements({
      channel_key: "neoman_moleulgeol",
      detected_objects: ["laundry", "drying rack", "indoor room", "rainy window", "clothes", "towels"]
    });
    const fail = validateSceneObjectRequirements({
      channel_key: "lets_buy",
      detected_objects: ["color blocks", "abstract pattern", "grid"]
    });

    expect(pass.required_scene_objects_detected).toBe(true);
    expect(pass.scene_context_visible).toBe(true);
    expect(pass.product_or_related_object_visible).toBe(true);
    expect(fail.required_scene_objects_detected).toBe(false);
    expect(fail.blockers).toContain("REQUIRED_SCENE_OBJECTS_MISSING");
    expect(fail.blockers).toContain("SCENE_CONTEXT_NOT_VISIBLE");
  });

  test("real_image_provider_availability_gate_tests and no_fake_image_fallback_tests stop when real provider evidence is absent", async () => {
    const cwd = await makeCwd();
    try {
      const result = await writeV040RealImageSemanticReviewPackets({ cwd });
      const providerStatus = JSON.parse(await readFile(result.artifact_paths.real_image_provider_status, "utf8"));

      expect(result.FINAL_STATUS).toBe("BLOCKED_REAL_IMAGE_PROVIDER_NOT_AVAILABLE");
      expect(result.V040_REVIEW_PACKETS_READY).toBe(false);
      expect(result.SAFE_TO_UPLOAD).toBe(false);
      expect(result.channel_results.every((channel) => channel.video_generated === false)).toBe(true);
      expect(providerStatus.provider_available).toBe(false);
      expect(providerStatus.blocker).toBe("REAL_IMAGE_PROVIDER_NOT_AVAILABLE");
      await expect(stat(result.artifact_paths.scene_prompt_package)).resolves.toBeTruthy();
      await expect(stat(result.artifact_paths.manual_image_drop_guide)).resolves.toBeTruthy();
      await expect(stat(result.artifact_paths.expected_image_paths)).resolves.toBeTruthy();
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("real_image_semantic_gate_tests pass only with photo-like assets and required objects", () => {
    const pass = validateRealImageSemanticGate({
      channel_key: "father_jobs",
      assets: Array.from({ length: 6 }, (_, index) => ({
        scene_key: `scene_${index + 1}`,
        file_exists: true,
        decode_success: true,
        width: 1080,
        height: 1920,
        file_size_bytes: 180000,
        real_photo_likeness_score: 0.82,
        detected_objects: ["car interior", "cup holder", "console", "organizer", "storage object", "messy-to-clean context"],
        visual_stats: {
          color_cluster_count: 64,
          repeated_tile_ratio: 0.05,
          edge_direction_uniformity: 0.25,
          entropy_score: 0.88,
          alternating_grid_score: 0.02,
          random_noise_score: 0.06,
          gradient_smoothness_score: 0.18,
          abstract_color_grid_score: 0.04
        }
      }))
    });
    const fail = validateRealImageSemanticGate({
      channel_key: "father_jobs",
      assets: [{
        scene_key: "scene_1",
        file_exists: true,
        decode_success: true,
        width: 720,
        height: 1280,
        file_size_bytes: 62000,
        real_photo_likeness_score: 0.2,
        detected_objects: ["checkerboard", "mosaic"],
        visual_stats: {
          color_cluster_count: 4,
          repeated_tile_ratio: 0.82,
          edge_direction_uniformity: 0.88,
          entropy_score: 0.28,
          alternating_grid_score: 0.93,
          random_noise_score: 0.8,
          gradient_smoothness_score: 0.91,
          abstract_color_grid_score: 0.85
        }
      }]
    });

    expect(pass.pass).toBe(true);
    expect(pass.real_photo_likeness_pass).toBe(true);
    expect(pass.required_scene_objects_detected).toBe(true);
    expect(fail.pass).toBe(false);
    expect(fail.blockers).toEqual(expect.arrayContaining([
      "MOSAIC_PATTERN_DETECTED",
      "CHECKERBOARD_PATTERN_DETECTED",
      "NOISE_TEXTURE_DETECTED",
      "ABSTRACT_COLOR_GRID_DETECTED",
      "SOLID_OR_GRADIENT_PLACEHOLDER_DETECTED",
      "REAL_PHOTO_LIKENESS_FAIL",
      "REQUIRED_SCENE_OBJECTS_MISSING"
    ]));
  });

  test("three_channel_real_video_builder_tests create prompt package but no placeholder video without semantic pass", () => {
    const promptPackage = buildV040ScenePromptPackage();

    expect(promptPackage.version).toBe("v040");
    expect(promptPackage.channels).toHaveLength(3);
    expect(promptPackage.channels.every((channel) => channel.scenes.length >= 6)).toBe(true);
    expect(promptPackage.forbidden_fallbacks).toEqual(expect.arrayContaining([
      "solid rectangle",
      "gradient panel",
      "color bar",
      "checkerboard",
      "mosaic noise",
      "CSS placeholder",
      "canvas placeholder",
      "sample fixture image"
    ]));
  });

  test("metadata_disclosure_tests, no_raw_affiliate_url_report_tests, and mojibake_tests", async () => {
    const cwd = await makeCwd();
    try {
      const result = await writeV040RealImageSemanticReviewPackets({ cwd });
      const serialized = JSON.stringify(result);
      const promptPackage = await readFile(result.artifact_paths.scene_prompt_package, "utf8");

      expect(result.raw_urls_printed).toBe(false);
      expect(result.secrets_printed).toBe(false);
      expect(serialized).not.toContain("https://link.coupang.com/a/");
      expect(promptPackage).not.toContain("example.com");
      expect(promptPackage).not.toContain("???");
      expect(promptPackage).not.toContain("\uFFFD");
      expect(promptPackage).toContain("쿠팡 파트너스");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("package script exposes review:v040", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

    expect(packageJson.scripts["review:v040"]).toBe(
      "tsx scripts/uploads/generate-v040-real-image-semantic-review-packets.ts"
    );
  });

  test("provider_available true requires actual photo-like semantic assets", () => {
    const status = evaluateRealImageProviderAvailability({
      provider_name: "manual_drop_real_images",
      scene_assets: Array.from({ length: 6 }, (_, index) => ({
        scene_key: `scene_${index + 1}`,
        file_exists: true,
        decode_success: true,
        width: 1080,
        height: 1920,
        file_size_bytes: 160000,
        real_photo_likeness_score: 0.8,
        detected_objects: ["desk", "cables", "cable organizer", "cable clips", "before/after cable clutter context"],
        visual_stats: {
          color_cluster_count: 48,
          repeated_tile_ratio: 0.05,
          edge_direction_uniformity: 0.18,
          entropy_score: 0.81,
          alternating_grid_score: 0.03,
          random_noise_score: 0.04,
          gradient_smoothness_score: 0.14,
          abstract_color_grid_score: 0.05
        }
      }))
    });

    expect(status.provider_available).toBe(true);
    expect(status.real_image_generation_success).toBe(true);
    expect(status.blocker).toBeNull();
  });
});
