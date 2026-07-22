import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { V035_SCENE_ASSETS, buildV035VoiceoverScript } from "../scripts/uploads/generate-v035-image-skill-scene-shorts-review-packet";
import {
  V045_CHANNEL_PLANS,
  buildV045ThreeChannelV035ReviewPackets
} from "../src/uploads/multi-channel/threeChannelV035ReviewBuilder";
import { assertV035SuccessPipelineReusable } from "../src/uploads/multi-channel/v035PipelineAdapter";

const AFFILIATE_URL = "https://link.coupang.com/a/v045-real-affiliate";

async function makeCwd() {
  return mkdtemp(path.join(os.tmpdir(), "commerce-v045-"));
}

function validPng(width = 941, height = 1672) {
  const buffer = Buffer.alloc(60000, 1);
  buffer[0] = 0x89;
  buffer[1] = 0x50;
  buffer[2] = 0x4e;
  buffer[3] = 0x47;
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

async function writeV045ChannelSceneAssets(cwd: string) {
  for (const plan of V045_CHANNEL_PLANS) {
    const sceneDir = path.join(cwd, "commerce-assets", "review", "v045", plan.channel_key, "generated-scenes");
    await mkdir(sceneDir, { recursive: true });
    for (const scene of V035_SCENE_ASSETS) {
      await writeFile(path.join(sceneDir, scene.filename), validPng());
    }
  }
}

function mockedRunners() {
  return {
    selectedAffiliateUrl: AFFILIATE_URL,
    voiceRunner: async ({ audioPath }: { audioPath: string }) => {
      await writeFile(audioPath, "fake-v045-audio", "utf8");
      return { ok: true };
    },
    mediaRunner: async ({ outputPath }: { outputPath: string }) => {
      await writeFile(outputPath, "fake-v045-media", "utf8");
    },
    videoProbe: async () => ({
      duration_seconds: 23.5,
      audio_duration_seconds: 22.1,
      video_has_audio_stream: true
    }),
    asrRunner: async () => ({
      transcript: buildV035VoiceoverScript(),
      raw_similarity_score: 0.96,
      transcript_similarity_score: 0.96,
      core_anchor_recognition_pass: true,
      speech_rate_wpm: 160
    })
  };
}

describe("v045 restored v035 pipeline adapter", () => {
  test("v035_pipeline_adapter_tests confirm proven pipeline is reusable", () => {
    const reusable = assertV035SuccessPipelineReusable();

    expect(reusable).toMatchObject({
      v035_generator_found: true,
      v035_scene_assets_found: true,
      v035_voice_script_found: true,
      reusable: true
    });
  });

  test("three_channel_distinct_plan_tests define three distinct channel plans", () => {
    expect(V045_CHANNEL_PLANS.map((plan) => plan.channel_key)).toEqual([
      "father_jobs",
      "neoman_moleulgeol",
      "lets_buy"
    ]);
    expect(new Set(V045_CHANNEL_PLANS.map((plan) => plan.product_name)).size).toBe(3);
    expect(V045_CHANNEL_PLANS.every((plan) => plan.scene_prompt_plan.length === 6)).toBe(true);
  });

  test("three_channel_v035_reuse_tests create channel review packets through v035", async () => {
    const cwd = await makeCwd();
    try {
      await writeV045ChannelSceneAssets(cwd);
      const result = await buildV045ThreeChannelV035ReviewPackets({
        cwd,
        ...mockedRunners()
      });

      expect(result.FINAL_STATUS).toBe("SUCCESS_V045_RESTORED_V035_RENDERER_THREE_CHANNEL_REVIEW_READY");
      expect(result.V045_THREE_CHANNEL_REVIEW_READY).toBe(true);
      expect(result.SAFE_TO_UPLOAD).toBe(false);
      expect(result.v035_renderer_reused).toBe(true);
      expect(result.v035_metadata_builder_reused).toBe(true);
      expect(result.v035_review_console_reused).toBe(true);
      expect(result.father_jobs_video_generated).toBe(true);
      expect(result.neoman_moleulgeol_video_generated).toBe(true);
      expect(result.lets_buy_video_generated).toBe(true);
      await expect(stat(result.father_jobs_review_console as string)).resolves.toBeTruthy();
      await expect(stat(result.neoman_moleulgeol_review_console as string)).resolves.toBeTruthy();
      await expect(stat(result.lets_buy_review_console as string)).resolves.toBeTruthy();
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }, 30000);

  test("no_v037_renderer_usage_tests and visual regression gates stay clean", async () => {
    const cwd = await makeCwd();
    try {
      await writeV045ChannelSceneAssets(cwd);
      const result = await buildV045ThreeChannelV035ReviewPackets({
        cwd,
        ...mockedRunners()
      });

      expect(result.v037_renderer_used).toBe(false);
      expect(result.v038_renderer_used).toBe(false);
      expect(result.v039_renderer_used).toBe(false);
      expect(result.manual_drop_primary_used).toBe(false);
      expect(result.color_bar_detected).toBe(false);
      expect(result.solid_placeholder_detected).toBe(false);
      expect(result.mosaic_placeholder_detected).toBe(false);
      expect(result.checkerboard_detected).toBe(false);
      expect(result.real_scene_assets_visible).toBe(true);
      expect(result.asset_to_frame_proof_pass).toBe(true);
      expect(result.fake_success).toBe(false);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }, 30000);

  test("blocks instead of using manual-drop fallback when channel images are missing", async () => {
    const cwd = await makeCwd();
    try {
      const result = await buildV045ThreeChannelV035ReviewPackets({
        cwd,
        ...mockedRunners()
      });

      expect(result.FINAL_STATUS).toBe("BLOCKED_V035_IMAGE_GENERATION_NOT_REPRODUCIBLE");
      expect(result.V045_THREE_CHANNEL_REVIEW_READY).toBe(false);
      expect(result.manual_drop_primary_used).toBe(false);
      expect(result.fake_success).toBe(false);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("metadata_disclosure_tests, comment_template_tests, no_raw_affiliate_url_report_tests, upload_side_effect_block_tests", async () => {
    const cwd = await makeCwd();
    try {
      await writeV045ChannelSceneAssets(cwd);
      const result = await buildV045ThreeChannelV035ReviewPackets({
        cwd,
        ...mockedRunners()
      });
      const summary = await readFile(path.join(cwd, "commerce-assets", "review", "v045", "father_jobs", "review-summary.json"), "utf8");
      const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
      const serialized = JSON.stringify({ result, summary });

      expect(result.comment_previews_generated).toBe(true);
      expect(result.metadata_previews_generated).toBe(true);
      expect(result.affiliate_disclosure_present_all).toBe(true);
      expect(result.comment_link_present_all).toBe(true);
      expect(serialized).not.toContain(AFFILIATE_URL);
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
      expect(packageJson.scripts["review:v045"]).toBe("tsx scripts/uploads/generate-v045-three-channel-v035-review-packets.ts");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
