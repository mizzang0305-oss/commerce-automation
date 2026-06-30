import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import packageJson from "../package.json";
import {
  V038_FAILURE_RECORD,
  buildV039AssetToFrameReviewPlan,
  writeV039AssetToFrameProofReviewPackets
} from "../scripts/uploads/generate-v039-asset-to-frame-proof-review-packets";
import {
  validateAssetToFrameProofGate
} from "../src/uploads/multi-channel/assetToFrameProofGate";
import {
  extractRealSceneFrames
} from "../src/uploads/multi-channel/realSceneFrameExtractor";
import {
  calculateFrameVisualStats,
  detectSolidPlaceholderFrame
} from "../src/uploads/multi-channel/solidPlaceholderFrameDetector";

describe("v039 asset-to-frame proof review packet", () => {
  test("v038_fail_status_tests", () => {
    expect(V038_FAILURE_RECORD).toMatchObject({
      version: "v038",
      human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
      safe_to_upload: false,
      pr157_merge_allowed: false
    });
    expect(V038_FAILURE_RECORD.fail_reasons).toEqual(expect.arrayContaining([
      "BLANK_SOLID_PLACEHOLDER_FRAME",
      "SCENE_ASSET_NOT_VISIBLE_IN_VIDEO",
      "RENDERED_FRAME_DOES_NOT_CONTAIN_IMAGE_PIXELS",
      "ASSET_TO_FRAME_PROOF_MISSING",
      "TEST_PATTERN_GATE_FALSE_NEGATIVE"
    ]));
  });

  test("asset_to_frame_proof_gate_tests blocks missing asset visibility", () => {
    const result = validateAssetToFrameProofGate({
      scene_count: 6,
      scene_asset_files_exist: true,
      scene_asset_decode_success: true,
      scene_asset_min_width: 720,
      scene_asset_min_height: 1280,
      scene_asset_file_size_bytes: 120000,
      rendered_video_exists: true,
      rendered_video_duration_seconds: 22,
      rendered_video_frame_extract_success: true,
      frame_visual_entropy_avg: 0.74,
      solid_color_frame_ratio: 0,
      blank_frame_ratio: 0,
      dark_placeholder_frame_ratio: 0,
      rect_placeholder_frame_ratio: 0,
      frame_scene_asset_similarity_pass: false,
      at_least_one_frame_matches_each_scene_asset: false,
      scene_asset_visible_frame_count: 2,
      actual_frame_contact_sheet_not_blank: true,
      actual_frame_contact_sheet_not_solid_rectangles: true
    });

    expect(result.pass).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      "SCENE_ASSET_NOT_VISIBLE_IN_VIDEO",
      "FRAME_SCENE_ASSET_SIMILARITY_FAIL"
    ]));
  });

  test("solid_placeholder_frame_detector_tests and low_visual_entropy_frame_tests", () => {
    const solid = calculateFrameVisualStats({
      width: 720,
      height: 1280,
      palette_hex: ["#3a8241"],
      edge_density: 0.01,
      entropy: 0.03,
      brightness: 0.42
    });
    const realFrame = calculateFrameVisualStats({
      width: 720,
      height: 1280,
      palette_hex: ["#596356", "#a98d62", "#2d4554", "#c9bd9a", "#48533a", "#80624e"],
      edge_density: 0.28,
      entropy: 0.78,
      brightness: 0.56
    });

    expect(detectSolidPlaceholderFrame(solid).placeholder_detected).toBe(true);
    expect(detectSolidPlaceholderFrame(solid).blockers).toContain("LOW_VISUAL_ENTROPY_FRAME");
    expect(detectSolidPlaceholderFrame(realFrame).placeholder_detected).toBe(false);
  });

  test("scene_asset_decode_tests frame_scene_similarity_tests and real_scene_frame_extractor_tests", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "commerce-v039-extractor-"));
    try {
      const result = await writeV039AssetToFrameProofReviewPackets({ cwd });
      const father = result.artifact_paths.channels.father_jobs;
      const extraction = await extractRealSceneFrames({
        videoPath: father.local_review_video,
        outputDir: path.join(cwd, "manual-extract"),
        timestampsSeconds: [0.5, 2, 4]
      });

      expect(extraction.rendered_video_frame_extract_success).toBe(true);
      expect(extraction.frames.length).toBe(3);
      await expect(stat(extraction.frames[0].frame_path)).resolves.toBeTruthy();
      expect(result.summary.frame_scene_asset_similarity_pass).toBe(true);
      expect(result.summary.at_least_one_frame_matches_each_scene_asset).toBe(true);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }, 90000);

  test("color_bar_pattern_blocker_tests", () => {
    const result = validateAssetToFrameProofGate({
      scene_count: 6,
      scene_asset_files_exist: true,
      scene_asset_decode_success: true,
      scene_asset_min_width: 720,
      scene_asset_min_height: 1280,
      scene_asset_file_size_bytes: 120000,
      rendered_video_exists: true,
      rendered_video_duration_seconds: 22,
      rendered_video_frame_extract_success: true,
      frame_visual_entropy_avg: 0.12,
      solid_color_frame_ratio: 0.4,
      blank_frame_ratio: 0,
      dark_placeholder_frame_ratio: 0,
      rect_placeholder_frame_ratio: 0.4,
      frame_scene_asset_similarity_pass: true,
      at_least_one_frame_matches_each_scene_asset: true,
      scene_asset_visible_frame_count: 6,
      actual_frame_contact_sheet_not_blank: true,
      actual_frame_contact_sheet_not_solid_rectangles: false
    });

    expect(result.pass).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      "SOLID_COLOR_FRAME_RATIO_TOO_HIGH",
      "RECT_PLACEHOLDER_FRAME_RATIO_TOO_HIGH",
      "CONTACT_SHEET_PLACEHOLDER_DETECTED"
    ]));
  });

  test("three_channel_real_video_builder_tests and review artifacts", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "commerce-v039-review-"));
    try {
      const result = await writeV039AssetToFrameProofReviewPackets({ cwd });

      expect(result.FINAL_STATUS).toBe("SUCCESS_V039_ASSET_TO_FRAME_PROOF_REVIEW_READY");
      expect(result.safe_to_upload).toBe(false);
      expect(result.summary.pass).toBe(true);
      expect(result.summary.rendered_video_frame_extract_success).toBe(true);
      expect(result.summary.frame_visual_entropy_avg).toBeGreaterThanOrEqual(0.35);
      expect(result.summary.solid_color_frame_ratio).toBeLessThanOrEqual(0.05);
      expect(result.summary.blank_frame_ratio).toBeLessThanOrEqual(0.02);
      expect(result.summary.dark_placeholder_frame_ratio).toBeLessThanOrEqual(0.05);
      expect(result.summary.rect_placeholder_frame_ratio).toBeLessThanOrEqual(0.05);
      expect(result.summary.frame_scene_asset_similarity_pass).toBe(true);
      expect(result.summary.at_least_one_frame_matches_each_scene_asset).toBe(true);

      for (const channelKey of ["father_jobs", "neoman_moleulgeol", "lets_buy"] as const) {
        const channel = result.artifact_paths.channels[channelKey];
        await expect(stat(channel.review_console)).resolves.toBeTruthy();
        await expect(stat(channel.local_review_video)).resolves.toBeTruthy();
        await expect(stat(channel.asset_to_frame_proof_report)).resolves.toBeTruthy();
        await expect(stat(channel.human_review_decision)).resolves.toBeTruthy();
        expect(result.channel_results[channelKey].proof_gate.pass).toBe(true);
        expect(result.channel_results[channelKey].placeholder_detected).toBe(false);
      }
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }, 90000);

  test("metadata_disclosure_tests no_raw_affiliate_url_report_tests and mojibake_tests", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "commerce-v039-sanitized-"));
    try {
      const result = await writeV039AssetToFrameProofReviewPackets({ cwd });
      const planText = await readFile(result.artifact_paths.asset_to_frame_summary, "utf8");

      expect(result.comment_previews_generated).toBe(true);
      expect(result.metadata_previews_generated).toBe(true);
      expect(result.affiliate_disclosure_present_all).toBe(true);
      expect(result.comment_link_present_all).toBe(true);
      expect(result.raw_affiliate_url_printed).toBe(false);
      expect(result.mojibake_present).toBe(false);
      expect(planText).toContain("https://link.coupang.com/re/***");
      expect(planText).not.toContain("https://link.coupang.com/a/");
      expect(planText).not.toContain("example.com");
      expect(planText).not.toContain("<ACTUAL_AFFILIATE_URL>");
      expect(planText).not.toContain("???");
      expect(planText).not.toContain(String.fromCharCode(0x5360));
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }, 90000);

  test("build plan is review-only and package script exposes review:v039", () => {
    const plan = buildV039AssetToFrameReviewPlan();

    expect(plan.safe_to_upload).toBe(false);
    expect(plan.youtube_execute_called).toBe(false);
    expect(plan.videos_insert_called).toBe(false);
    expect(plan.channel_packets).toHaveLength(3);
    expect(packageJson.scripts["review:v039"]).toBe(
      "tsx scripts/uploads/generate-v039-asset-to-frame-proof-review-packets.ts"
    );
  });
});
