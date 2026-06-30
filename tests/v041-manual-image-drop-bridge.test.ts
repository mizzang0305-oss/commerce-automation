import { mkdir, mkdtemp, readFile, rm, writeFile, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import {
  buildV041ManualImageDropPromptPackage,
  writeV041ManualImageDropReviewPackets
} from "../scripts/uploads/generate-v041-manual-image-drop-review-packets";
import {
  buildV041ManualImageDropManifest,
  getV041ExpectedImagePaths
} from "../src/uploads/multi-channel/manualImageDropManifest";
import {
  validateV041ManualImageDrop
} from "../src/uploads/multi-channel/manualImageDropValidator";
import {
  buildV041ManualImageDropReview
} from "../src/uploads/multi-channel/manualImageDropReviewBuilder";

async function makeCwd() {
  return mkdtemp(path.join(os.tmpdir(), "commerce-v041-"));
}

function pngProbe(width = 1080, height = 1920) {
  const buffer = Buffer.alloc(60001, 7);
  buffer[0] = 0x89;
  buffer[1] = 0x50;
  buffer[2] = 0x4e;
  buffer[3] = 0x47;
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

async function writeChannelImages(cwd: string, channelKey: "father_jobs" | "neoman_moleulgeol" | "lets_buy") {
  const expected = getV041ExpectedImagePaths({ cwd }).find((item) => item.channel_key === channelKey);
  if (!expected) throw new Error(`missing expected paths for ${channelKey}`);
  await mkdir(expected.expected_dir, { recursive: true });
  for (const file of expected.files) {
    await writeFile(file.path, pngProbe());
  }
  await writeFile(path.join(expected.expected_dir, "manual-image-semantic-evidence.json"), JSON.stringify({
    channel_key: channelKey,
    real_photo_likeness_score: 0.82,
    detected_objects: fileObjects(channelKey),
    visual_stats: {
      color_cluster_count: 48,
      repeated_tile_ratio: 0.05,
      edge_direction_uniformity: 0.2,
      entropy_score: 0.84,
      alternating_grid_score: 0.03,
      random_noise_score: 0.04,
      gradient_smoothness_score: 0.13,
      abstract_color_grid_score: 0.05
    }
  }, null, 2), "utf8");
}

function fileObjects(channelKey: string) {
  if (channelKey === "father_jobs") {
    return ["car interior", "cup holder", "console", "organizer", "storage object", "messy-to-clean context"];
  }
  if (channelKey === "neoman_moleulgeol") {
    return ["laundry", "drying rack", "indoor room", "rainy window", "clothes", "towels", "socks"];
  }
  return ["desk", "cables", "cable organizer", "cable clips", "before/after cable clutter context"];
}

describe("v041 manual image drop bridge", () => {
  test("manual_image_drop_manifest_tests and expected_image_paths_tests", () => {
    const manifest = buildV041ManualImageDropManifest({ cwd: "C:\\repo" });

    expect(manifest.version).toBe("v041");
    expect(manifest.required_image_count).toBe(18);
    expect(manifest.channels).toHaveLength(3);
    expect(manifest.channels.find((channel) => channel.channel_key === "father_jobs")?.files.map((file) => file.filename)).toEqual([
      "01-car-messy-cup-holder.png",
      "02-car-console-clutter.png",
      "03-organizer-product-reveal.png",
      "04-driver-organizing-items.png",
      "05-clean-car-console-after.png",
      "06-car-dashboard-cta.png"
    ]);
    expect(getV041ExpectedImagePaths({ cwd: "C:\\repo" }).flatMap((channel) => channel.files)).toHaveLength(18);
  });

  test("manual_image_drop_status_tests waits without generating videos when images are absent", async () => {
    const cwd = await makeCwd();
    try {
      const result = await writeV041ManualImageDropReviewPackets({ cwd });

      expect(result.FINAL_STATUS).toBe("WAITING_FOR_MANUAL_IMAGE_DROP");
      expect(result.V041_BRIDGE_READY).toBe(true);
      expect(result.V041_REVIEW_PACKETS_READY).toBe(false);
      expect(result.SAFE_TO_UPLOAD).toBe(false);
      expect(result.required_image_count).toBe(18);
      expect(result.found_image_count).toBe(0);
      expect(result.videos_generated).toBe(false);
      await expect(stat(result.artifact_paths.manual_image_drop_guide)).resolves.toBeTruthy();
      await expect(stat(result.artifact_paths.manual_image_prompt_package)).resolves.toBeTruthy();
      await expect(stat(result.artifact_paths.expected_image_paths)).resolves.toBeTruthy();
      await expect(stat(result.artifact_paths.manual_drop_status)).resolves.toBeTruthy();
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("manual_drop_validation_tests block incomplete or evidence-free image drops", async () => {
    const cwd = await makeCwd();
    try {
      await writeChannelImages(cwd, "father_jobs");
      const report = await validateV041ManualImageDrop({ cwd });

      expect(report.all_required_images_present).toBe(false);
      expect(report.validation_pass).toBe(false);
      expect(report.validation_blockers).toContain("MANUAL_DROP_IMAGES_MISSING");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("manual_drop_quality_gate_tests pass only with all images and semantic evidence", async () => {
    const cwd = await makeCwd();
    try {
      await writeChannelImages(cwd, "father_jobs");
      await writeChannelImages(cwd, "neoman_moleulgeol");
      await writeChannelImages(cwd, "lets_buy");
      const report = await validateV041ManualImageDrop({ cwd });

      expect(report.all_required_images_present).toBe(true);
      expect(report.all_images_decode_success).toBe(true);
      expect(report.all_images_portrait).toBe(true);
      expect(report.all_images_min_resolution).toBe(true);
      expect(report.all_images_file_size_gt_50000).toBe(true);
      expect(report.validation_pass).toBe(true);
      expect(report.real_image_semantic_summary.every((channel) => channel.pass)).toBe(true);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("three_channel_video_builder_tests generate review packets only after validation pass", async () => {
    const cwd = await makeCwd();
    try {
      await writeChannelImages(cwd, "father_jobs");
      await writeChannelImages(cwd, "neoman_moleulgeol");
      await writeChannelImages(cwd, "lets_buy");
      const result = await buildV041ManualImageDropReview({
        cwd,
        mediaRunner: async ({ outputPath, actualFrameContactSheetPath, shortsUiOverlayContactSheetPath }) => {
          await writeFile(outputPath, "fake-video-by-test-runner", "utf8");
          await writeFile(actualFrameContactSheetPath, "fake-frame-contact-sheet", "utf8");
          await writeFile(shortsUiOverlayContactSheetPath, "fake-overlay-contact-sheet", "utf8");
        }
      });

      expect(result.FINAL_STATUS).toBe("SUCCESS_V041_MANUAL_IMAGE_DROP_REVIEW_PACKETS_READY");
      expect(result.videos_generated).toBe(true);
      expect(result.channel_results.every((channel) => channel.review_console)).toBe(true);
      expect(result.channel_results.every((channel) => channel.local_review_video)).toBe(true);
      expect(result.SAFE_TO_UPLOAD).toBe(false);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("metadata_disclosure_tests, comment_template_tests, no_raw_affiliate_url_report_tests, mojibake_tests", async () => {
    const cwd = await makeCwd();
    try {
      const result = await writeV041ManualImageDropReviewPackets({ cwd });
      const guide = await readFile(result.artifact_paths.manual_image_drop_guide, "utf8");
      const promptPackage = buildV041ManualImageDropPromptPackage({ cwd });
      const serialized = JSON.stringify({ result, promptPackage, guide });

      expect(serialized).toContain("쿠팡 파트너스");
      expect(serialized).not.toContain("https://link.coupang.com/a/");
      expect(serialized).not.toContain("example.com");
      expect(serialized).not.toContain("???");
      expect(serialized).not.toContain("\uFFFD");
      expect(result.raw_urls_printed).toBe(false);
      expect(result.secrets_printed).toBe(false);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("package script exposes review:v041", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

    expect(packageJson.scripts["review:v041"]).toBe(
      "tsx scripts/uploads/generate-v041-manual-image-drop-review-packets.ts"
    );
  });
});
