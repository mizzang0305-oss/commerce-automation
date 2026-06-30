import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import packageJson from "../package.json";
import {
  V037_FAILURE_RECORD,
  buildV038RealThreeChannelReviewPlan,
  writeV038RealThreeChannelReviewPackets
} from "../src/uploads/multi-channel/realThreeChannelImageSkillReviewBuilder";
import {
  detectColorBarPalette,
  validateTestPatternVisualGate
} from "../src/uploads/multi-channel/testPatternVisualGate";

const CHANNEL_KEYS = ["father_jobs", "neoman_moleulgeol", "lets_buy"] as const;

describe("v038 real three-channel image-skill review packets", () => {
  test("v037_fail_status_tests", () => {
    expect(V037_FAILURE_RECORD).toMatchObject({
      version: "v037",
      human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
      safe_to_upload: false,
      pr156_merge_allowed: false
    });
    expect(V037_FAILURE_RECORD.fail_reasons).toEqual(expect.arrayContaining([
      "RGB_TEST_PATTERN_RENDERER_REGRESSION",
      "COLOR_BAR_PLACEHOLDER_VIDEO",
      "IMAGE_SKILL_ASSETS_NOT_USED_IN_RENDER",
      "THREE_CHANNEL_REVIEW_PACKET_FALSE_SUCCESS",
      "VISUAL_ARTIFACT_GATE_MISSING"
    ]));
  });

  test("test_pattern_visual_gate_tests and color_bar_pattern_blocker_tests", () => {
    const colorBars = [
      "#ffffff", "#ffff00", "#00ffff", "#00ff00", "#ff00ff", "#ff0000", "#0000ff", "#000000"
    ];
    const realScenePalette = ["#6f7c64", "#b9a68a", "#2e3d49", "#d6c2a7", "#875c43", "#ccd7dc"];

    expect(detectColorBarPalette(colorBars).color_bar_pattern_detected).toBe(true);
    expect(detectColorBarPalette(realScenePalette).color_bar_pattern_detected).toBe(false);

    const blocked = validateTestPatternVisualGate({
      channel_key: "father_jobs",
      frame_palette_hex: colorBars,
      scene_asset_sha256: "asset-a",
      representative_frame_sha256: "frame-b",
      rendered_with_scene_asset: false,
      generated_by_fixture_renderer: true,
      actual_frame_contact_sheet_palette_hex: colorBars
    });

    expect(blocked.pass).toBe(false);
    expect(blocked.color_bar_pattern_detected).toBe(true);
    expect(blocked.placeholder_video_detected).toBe(true);
    expect(blocked.rendered_frame_uses_scene_asset).toBe(false);
    expect(blocked.blockers).toEqual(expect.arrayContaining([
      "COLOR_BAR_PATTERN_DETECTED",
      "PLACEHOLDER_VIDEO_DETECTED",
      "SCENE_ASSET_NOT_USED_IN_RENDER"
    ]));
  });

  test("real_scene_asset_usage_tests and three_channel_real_video_builder_tests", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "commerce-v038-real-review-"));
    try {
      const result = await writeV038RealThreeChannelReviewPackets({
        cwd,
        mediaRunner: async ({ packet, channelDir }) => {
          const generatedScenesDir = path.join(channelDir, "generated-scenes");
          const sceneAssetPaths = packet.scene_manifest.scenes.map((scene) =>
            path.join(generatedScenesDir, scene.filename)
          );
          return {
            scene_asset_paths: sceneAssetPaths,
            local_review_video_path: path.join(channelDir, "local-review-video.mp4"),
            actual_frame_contact_sheet_path: path.join(channelDir, "actual-frame-contact-sheet.jpg"),
            shorts_ui_overlay_contact_sheet_path: path.join(channelDir, "shorts-ui-overlay-contact-sheet.jpg"),
            scene_asset_sha256: `${packet.channel_key}-asset-sha`,
            representative_frame_sha256: `${packet.channel_key}-asset-sha`,
            frame_palette_hex: packet.visual_gate_input.frame_palette_hex,
            actual_frame_contact_sheet_palette_hex: packet.visual_gate_input.frame_palette_hex,
            rendered_with_scene_asset: true,
            generated_by_fixture_renderer: false
          };
        }
      });

      expect(result.FINAL_STATUS).toBe("SUCCESS_V038_REAL_THREE_CHANNEL_IMAGE_SKILL_REVIEW_READY");
      expect(result.safe_to_upload).toBe(false);
      expect(result.plan.v037_failure.pr156_merge_allowed).toBe(false);
      expect(result.plan.channel_packets).toHaveLength(3);
      expect(result.test_pattern_gate_summary.pass).toBe(true);

      for (const channelKey of CHANNEL_KEYS) {
        const packet = result.plan.channel_packets.find((item) => item.channel_key === channelKey);
        const artifacts = result.artifact_paths.channels[channelKey];
        expect(packet).toBeTruthy();
        expect(packet?.scene_manifest.scenes.length).toBeGreaterThanOrEqual(6);
        expect(packet?.scene_manifest.scenes.every((scene) => scene.file_size_min_bytes === 50000)).toBe(true);
        expect(packet?.scene_manifest.scenes.every((scene) => scene.width_min === 720 && scene.height_min === 1280)).toBe(true);
        expect(packet?.visual_gate.rendered_frame_uses_scene_asset).toBe(true);
        expect(packet?.visual_gate.color_bar_pattern_detected).toBe(false);
        expect(packet?.visual_gate.placeholder_video_detected).toBe(false);
        expect(packet?.visual_gate.actual_frame_contact_sheet_not_color_bars).toBe(true);
        await expect(stat(artifacts.review_console)).resolves.toBeTruthy();
        await expect(stat(artifacts.human_review_decision)).resolves.toBeTruthy();
      }
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("image_skill_scene_manifest_tests and channel_duplicate_guard_tests", () => {
    const plan = buildV038RealThreeChannelReviewPlan();
    const products = plan.channel_packets.map((packet) => packet.selected_product.product_name);
    const scripts = plan.channel_packets.map((packet) => packet.hook_script_preview.script_lines.join("\n"));
    const videos = plan.channel_packets.map((packet) => packet.artifact_names.local_review_video);

    expect(new Set(products).size).toBe(3);
    expect(new Set(scripts).size).toBe(3);
    expect(new Set(videos).size).toBe(3);
    expect(plan.duplicate_guard.pass).toBe(true);
    expect(plan.channel_packets.every((packet) => packet.image_skill_scene_asset_required)).toBe(true);
    expect(plan.channel_packets.every((packet) => packet.test_pattern_fallback_allowed === false)).toBe(true);
  });

  test("channel_specific_hook_tests", () => {
    const plan = buildV038RealThreeChannelReviewPlan();
    const hooks = Object.fromEntries(plan.channel_packets.map((packet) => [
      packet.channel_key,
      packet.hook_script_preview.selected_hook
    ]));

    expect(hooks.father_jobs).toContain("차 안");
    expect(hooks.neoman_moleulgeol).toContain("장마철");
    expect(hooks.lets_buy).toContain("가격");
    expect(plan.copy_safety.fake_usage_claim_blocked).toBe(true);
    expect(plan.copy_safety.guaranteed_claim_blocked).toBe(true);
  });

  test("comment_template_tests metadata_disclosure_tests and no_raw_affiliate_url_report_tests", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "commerce-v038-sanitized-"));
    try {
      const result = await writeV038RealThreeChannelReviewPackets({
        cwd,
        mediaRunner: async ({ packet, channelDir }) => ({
          scene_asset_paths: packet.scene_manifest.scenes.map((scene) => path.join(channelDir, "generated-scenes", scene.filename)),
          local_review_video_path: path.join(channelDir, "local-review-video.mp4"),
          actual_frame_contact_sheet_path: path.join(channelDir, "actual-frame-contact-sheet.jpg"),
          shorts_ui_overlay_contact_sheet_path: path.join(channelDir, "shorts-ui-overlay-contact-sheet.jpg"),
          scene_asset_sha256: `${packet.channel_key}-asset-sha`,
          representative_frame_sha256: `${packet.channel_key}-asset-sha`,
          frame_palette_hex: packet.visual_gate_input.frame_palette_hex,
          actual_frame_contact_sheet_palette_hex: packet.visual_gate_input.frame_palette_hex,
          rendered_with_scene_asset: true,
          generated_by_fixture_renderer: false
        })
      });
      const planText = await readFile(result.artifact_paths.three_channel_review_plan, "utf8");

      expect(result.comment_previews_generated).toBe(true);
      expect(result.metadata_previews_generated).toBe(true);
      expect(result.affiliate_disclosure_present_all).toBe(true);
      expect(result.comment_link_present_all).toBe(true);
      expect(result.raw_affiliate_url_printed).toBe(false);
      expect(result.mojibake_present).toBe(false);
      expect(result.placeholder_url_present).toBe(false);
      expect(planText).toContain("https://link.coupang.com/re/***");
      expect(planText).not.toContain("https://link.coupang.com/a/");
      expect(planText).not.toContain("example.com");
      expect(planText).not.toContain("<ACTUAL_AFFILIATE_URL>");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("mojibake_tests", () => {
    const plan = buildV038RealThreeChannelReviewPlan();
    const serialized = JSON.stringify(plan);

    expect(serialized).not.toContain("???");
    expect(serialized).not.toContain("\uFFFD");
    expect(serialized).not.toContain(String.fromCharCode(0x5360));
  });

  test("package script exposes review:v038", () => {
    expect(packageJson.scripts["review:v038"]).toBe(
      "tsx scripts/uploads/generate-v038-real-three-channel-review-packets.ts"
    );
  });
});
