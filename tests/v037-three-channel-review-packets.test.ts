import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import {
  buildV037ThreeChannelReviewPlan,
  validateV037DuplicateGuard,
  validateV037SafetyGate
} from "../src/uploads/multi-channel/threeChannelReviewPlanner";
import {
  buildChannelScenePromptPlan,
  V037_SCENE_KEYS
} from "../src/uploads/multi-channel/channelScenePromptPlanner";
import {
  buildChannelReviewPacket,
  writeV037ThreeChannelReviewPackets
} from "../src/uploads/multi-channel/channelReviewPacketBuilder";

async function makeCwd(prefix: string) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("v037 three-channel commerce review packets", () => {
  test("three_channel_review_planner_tests selects one distinct product per channel", () => {
    const plan = buildV037ThreeChannelReviewPlan();

    expect(plan.version).toBe("v037");
    expect(plan.safe_to_upload).toBe(false);
    expect(plan.public_upload_blocked).toBe(true);
    expect(plan.upload_attempted).toBe(false);
    expect(plan.channel_packets.map((packet) => packet.channel_key)).toEqual([
      "father_jobs",
      "neoman_moleulgeol",
      "lets_buy"
    ]);
    expect(new Set(plan.channel_packets.map((packet) => packet.selected_product.product_name)).size).toBe(3);
    expect(plan.channel_packets.find((packet) => packet.channel_key === "father_jobs")?.selected_product.product_name).toContain("차량");
    expect(plan.channel_packets.find((packet) => packet.channel_key === "neoman_moleulgeol")?.selected_product.product_name).toContain("빨래");
    expect(plan.channel_packets.find((packet) => packet.channel_key === "lets_buy")?.selected_product.product_name).toContain("케이블");
  });

  test("channel_scene_prompt_planner_tests creates channel-specific seven-scene plans", () => {
    const father = buildChannelScenePromptPlan({
      channel_key: "father_jobs",
      product_name: "차량용 컵홀더 정리함"
    });
    const life = buildChannelScenePromptPlan({
      channel_key: "neoman_moleulgeol",
      product_name: "접이식 빨래건조대"
    });
    const buy = buildChannelScenePromptPlan({
      channel_key: "lets_buy",
      product_name: "특가 케이블 정리함"
    });

    expect(father.scenes.map((scene) => scene.scene_key)).toEqual(V037_SCENE_KEYS);
    expect(father.scenes).toHaveLength(7);
    expect(life.scenes).toHaveLength(7);
    expect(buy.scenes).toHaveLength(7);
    expect(JSON.stringify(father)).toContain("작업");
    expect(JSON.stringify(life)).toContain("생활");
    expect(JSON.stringify(buy)).toContain("가성비");
    expect(new Set([
      father.scenes[0].prompt,
      life.scenes[0].prompt,
      buy.scenes[0].prompt
    ]).size).toBe(3);
    expect(father.common_constraints).toEqual(expect.arrayContaining([
      "photorealistic",
      "9:16 vertical",
      "no text inside image",
      "safe subtitle space"
    ]));
  });

  test("channel_review_packet_builder_tests builds locked pending-review packet", () => {
    const packet = buildChannelReviewPacket("father_jobs");

    expect(packet.human_review_decision).toMatchObject({
      version: "v037",
      channel_key: "father_jobs",
      human_review_status: "PENDING_HUMAN_REVIEW",
      metadata_review_status: "PENDING_METADATA_REVIEW",
      safe_to_upload: false,
      requires_fresh_upload_approval: true
    });
    expect(packet.hook_script_preview.hooks).toHaveLength(5);
    expect(packet.hook_script_preview.selected_hook).toContain("차");
    expect(packet.comment_preview.validation.comment_link_present).toBe(true);
    expect(packet.comment_preview.validation.coupang_disclosure_present).toBe(true);
    expect(packet.metadata_preview.title).toContain("차량용 컵홀더 정리함");
    expect(packet.metadata_preview.raw_affiliate_url_included).toBe(false);
  });

  test("three_channel_duplicate_guard_tests blocks reused products, hooks, scripts, and metadata", () => {
    const plan = buildV037ThreeChannelReviewPlan();
    const guard = validateV037DuplicateGuard(plan.channel_packets);

    expect(guard).toMatchObject({
      duplicate_product_across_channels: false,
      same_video_reused_across_channels: false,
      same_script_reused_across_channels: false,
      same_hook_reused_across_channels: false,
      duplicate_metadata_title_across_channels: false,
      pass: true
    });

    const unsafe = validateV037DuplicateGuard([
      plan.channel_packets[0],
      { ...plan.channel_packets[1], selected_product: plan.channel_packets[0].selected_product },
      plan.channel_packets[2]
    ]);
    expect(unsafe.pass).toBe(false);
    expect(unsafe.duplicate_product_across_channels).toBe(true);
  });

  test("channel_specific_hook_tests and fake_usage_claim_guard_tests", () => {
    const plan = buildV037ThreeChannelReviewPlan();

    expect(plan.channel_packets.map((packet) => packet.hook_script_preview.selected_hook)).toEqual([
      expect.stringContaining("차"),
      expect.stringContaining("생활"),
      expect.stringContaining("가격")
    ]);
    expect(validateV037SafetyGate(plan).fake_review_or_fake_usage_detected).toBe(false);
    expect(validateV037SafetyGate(plan).guaranteed_result_claim_detected).toBe(false);
  });

  test("channel_comment_template_tests and metadata_disclosure_tests", () => {
    const plan = buildV037ThreeChannelReviewPlan();

    for (const packet of plan.channel_packets) {
      expect(packet.comment_preview.comment_text_sanitized).toContain("https://link.coupang.com/re/***");
      expect(packet.comment_preview.comment_text_sanitized).toContain("쿠팡 파트너스");
      expect(packet.metadata_preview.description).toContain("댓글");
      expect(packet.metadata_preview.description).toContain("쿠팡 파트너스");
      expect(packet.metadata_preview.description).not.toContain(["example", "com"].join("."));
      expect(packet.metadata_preview.description).not.toContain("???");
    }
  });

  test("no_raw_affiliate_url_report_tests and local review artifacts", async () => {
    const cwd = await makeCwd("commerce-v037-review-");
    try {
      const result = await writeV037ThreeChannelReviewPackets({
        cwd,
        mediaRunner: async ({ scenePaths, videoPath }) => {
          for (const scenePath of scenePaths) {
            await mkdir(path.dirname(scenePath), { recursive: true });
            await writeFile(scenePath, makePngProbeBuffer(1080, 1920));
          }
          await writeFile(videoPath, "mock-v037-video", "utf8");
        }
      });

      expect(result.FINAL_STATUS).toBe("SUCCESS_V037_THREE_CHANNEL_REVIEW_PACKETS_READY");
      expect(result.V037_REVIEW_PACKETS_READY).toBe(true);
      expect(result.SAFE_TO_UPLOAD).toBe(false);
      expect(result.youtube_execute_called).toBe(false);
      expect(result.videos_insert_called).toBe(false);
      expect(result.raw_urls_printed).toBe(false);
      await expect(stat(result.artifact_paths.three_channel_review_plan)).resolves.toBeTruthy();
      await expect(stat(result.artifact_paths.routing_summary_html)).resolves.toBeTruthy();

      for (const channelKey of ["father_jobs", "neoman_moleulgeol", "lets_buy"] as const) {
        const channelPaths = result.artifact_paths.channels[channelKey];
        await expect(stat(channelPaths.review_console)).resolves.toBeTruthy();
        await expect(stat(channelPaths.local_review_video)).resolves.toBeTruthy();
        await expect(stat(channelPaths.scene_manifest)).resolves.toBeTruthy();
        await expect(stat(channelPaths.hook_script_preview)).resolves.toBeTruthy();
        await expect(stat(channelPaths.comment_preview)).resolves.toBeTruthy();
        await expect(stat(channelPaths.youtube_metadata_preview)).resolves.toBeTruthy();
        await expect(stat(channelPaths.human_review_decision)).resolves.toBeTruthy();
      }

      const serialized = await readFile(result.artifact_paths.three_channel_review_plan, "utf8");
      const rawCoupangUrlPrefix = ["https://link.coupang.com", "a"].join("/");
      expect(serialized).not.toContain(`${rawCoupangUrlPrefix}/`);
      expect(serialized).not.toContain(["<ACTUAL", "AFFILIATE_URL>"].join("_"));
      expect(serialized).not.toContain(["example", "com"].join("."));
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("image_skill_scene_manifest_tests and mojibake_tests", () => {
    const plan = buildV037ThreeChannelReviewPlan();
    const gate = validateV037SafetyGate(plan);

    expect(gate.image_skill_scene_manifest_ready).toBe(true);
    expect(gate.scene_asset_quality_pass).toBe(true);
    expect(gate.mojibake_present).toBe(false);
    expect(gate.placeholder_url_present).toBe(false);
    expect(gate.example_com_present).toBe(false);
    expect(gate.affiliate_disclosure_missing).toBe(false);
    expect(gate.comment_link_missing).toBe(false);
  });

  test("package script exposes review:v037", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

    expect(packageJson.scripts["review:v037"]).toBe(
      "tsx scripts/uploads/generate-v037-three-channel-review-packets.ts"
    );
  });
});

function makePngProbeBuffer(width: number, height: number) {
  const buffer = Buffer.alloc(60000, 1);
  buffer[0] = 0x89;
  buffer[1] = 0x50;
  buffer[2] = 0x4e;
  buffer[3] = 0x47;
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}
