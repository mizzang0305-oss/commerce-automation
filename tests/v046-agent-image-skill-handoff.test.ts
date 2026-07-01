import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { buildV035VoiceoverScript } from "../scripts/uploads/generate-v035-image-skill-scene-shorts-review-packet";
import {
  V046_AGENT_IMAGE_SCENE_PLANS,
  buildV046AgentImageSkillHandoffManifest,
  validateV046AgentImageSkillHandoff
} from "../src/uploads/multi-channel/agentImageSkillHandoff";
import {
  V046_CHANNEL_PLANS,
  buildV046ThreeChannelReviewPackets
} from "../src/uploads/multi-channel/v046ThreeChannelReviewBuilder";

const AFFILIATE_URL = "https://link.coupang.com/a/v046-real-affiliate";

async function makeCwd() {
  return mkdtemp(path.join(os.tmpdir(), "commerce-v046-"));
}

function validPng(width = 1024, height = 1792, fill = 31) {
  const buffer = Buffer.alloc(70000, fill);
  buffer[0] = 0x89;
  buffer[1] = 0x50;
  buffer[2] = 0x4e;
  buffer[3] = 0x47;
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

async function writeV046AgentImages(cwd: string) {
  for (const [index, scene] of V046_AGENT_IMAGE_SCENE_PLANS.entries()) {
    await mkdir(path.dirname(path.join(cwd, scene.target_path)), { recursive: true });
    await writeFile(path.join(cwd, scene.target_path), validPng(1024, 1792, 41 + index));
  }
}

function mockedRunners() {
  return {
    selectedAffiliateUrl: AFFILIATE_URL,
    voiceRunner: async ({ audioPath }: { audioPath: string }) => {
      await writeFile(audioPath, "fake-v046-audio", "utf8");
      return { ok: true };
    },
    mediaRunner: async ({ outputPath }: { outputPath: string }) => {
      await writeFile(outputPath, "fake-v046-media", "utf8");
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

describe("v046 agent image skill handoff", () => {
  test("agent_image_skill_handoff_manifest_tests record 18 local generated images", async () => {
    const cwd = await makeCwd();
    try {
      await writeV046AgentImages(cwd);
      const manifest = await buildV046AgentImageSkillHandoffManifest({ cwd });

      expect(manifest.version).toBe("v046");
      expect(manifest.generated_image_count).toBe(18);
      expect(manifest.images).toHaveLength(18);
      expect(manifest.images.every((image) => image.generated && image.file_exists)).toBe(true);
      expect(manifest.images.every((image) => image.width === 1024 && image.height === 1792)).toBe(true);
      expect(manifest.images.every((image) => image.raw_url_printed === false)).toBe(true);
      await expect(stat(path.join(cwd, "commerce-assets", "review", "v046", "agent-image-skill-handoff-manifest.json"))).resolves.toBeTruthy();
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("agent_generated_image_path_tests reject URL-only handoff without local files", async () => {
    const cwd = await makeCwd();
    try {
      const manifest = await buildV046AgentImageSkillHandoffManifest({
        cwd,
        agentOutputs: V046_AGENT_IMAGE_SCENE_PLANS.map((scene) => ({
          channel_key: scene.channel_key,
          scene_key: scene.scene_key,
          target_path: scene.target_path,
          generated_url: "https://generated.example.invalid/image.png"
        }))
      });

      expect(manifest.generated_image_count).toBe(0);
      expect(manifest.all_images_exist).toBe(false);
      expect(manifest.url_only_image_success).toBe(false);
      expect(manifest.quality_gate_pass).toBe(false);
      expect(manifest.quality_gate_blocker).toBe("AGENT_IMAGE_LOCAL_FILE_MISSING");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("real_image_semantic_gate_tests and asset_to_frame_proof_gate_tests pass for local files", async () => {
    const cwd = await makeCwd();
    try {
      await writeV046AgentImages(cwd);
      const validation = await validateV046AgentImageSkillHandoff({ cwd });

      expect(validation.generated_image_count).toBe(18);
      expect(validation.all_images_exist).toBe(true);
      expect(validation.all_images_decode_success).toBe(true);
      expect(validation.all_images_portrait).toBe(true);
      expect(validation.all_images_min_width).toBe(true);
      expect(validation.all_images_min_height).toBe(true);
      expect(validation.all_images_file_size_gt_50000).toBe(true);
      expect(validation.mosaic_pattern_detected).toBe(false);
      expect(validation.checkerboard_pattern_detected).toBe(false);
      expect(validation.noise_texture_detected).toBe(false);
      expect(validation.placeholder_detected).toBe(false);
      expect(validation.real_photo_likeness_pass).toBe(true);
      expect(validation.required_scene_objects_detected).toBe(true);
      expect(validation.scene_context_visible).toBe(true);
      expect(validation.asset_to_frame_proof_ready).toBe(true);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("v035_renderer_reuse_tests build three channel review packets from agent images", async () => {
    const cwd = await makeCwd();
    try {
      await writeV046AgentImages(cwd);
      const result = await buildV046ThreeChannelReviewPackets({
        cwd,
        ...mockedRunners()
      });

      expect(result.FINAL_STATUS).toBe("SUCCESS_V046_AGENT_IMAGE_SKILL_THREE_CHANNEL_REVIEW_READY");
      expect(result.V046_THREE_CHANNEL_REVIEW_READY).toBe(true);
      expect(result.SAFE_TO_UPLOAD).toBe(false);
      expect(result.generated_image_count).toBe(18);
      expect(result.quality_gate_pass).toBe(true);
      expect(result.v035_renderer_reused).toBe(true);
      expect(result.v037_renderer_used).toBe(false);
      expect(result.v038_renderer_used).toBe(false);
      expect(result.v039_renderer_used).toBe(false);
      expect(result.manual_drop_primary_used).toBe(false);
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

  test("three_channel_distinct_plan_tests keep channel plans and comment metadata safe", async () => {
    const cwd = await makeCwd();
    try {
      await writeV046AgentImages(cwd);
      const result = await buildV046ThreeChannelReviewPackets({
        cwd,
        ...mockedRunners()
      });
      const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
      const comment = await readFile(path.join(cwd, "commerce-assets", "review", "v046", "lets_buy", "comment-preview.json"), "utf8");
      const serialized = JSON.stringify({ result, comment });

      expect(V046_CHANNEL_PLANS.map((plan) => plan.channel_key)).toEqual([
        "father_jobs",
        "neoman_moleulgeol",
        "lets_buy"
      ]);
      expect(new Set(V046_CHANNEL_PLANS.map((plan) => plan.product_name)).size).toBe(3);
      expect(V046_CHANNEL_PLANS.every((plan) => plan.scene_prompt_plan.length === 6)).toBe(true);
      expect(result.comment_previews_generated).toBe(true);
      expect(result.metadata_previews_generated).toBe(true);
      expect(result.affiliate_disclosure_present_all).toBe(true);
      expect(result.comment_link_present_all).toBe(true);
      expect(serialized).not.toContain(AFFILIATE_URL);
      expect(serialized).not.toContain("example.com");
      expect(serialized).not.toContain("???");
      expect(serialized).not.toContain("\uFFFD");
      expect(packageJson.scripts["review:v046"]).toBe("tsx scripts/uploads/generate-v046-agent-image-skill-three-channel-review.ts");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("upload_side_effect_block_tests and mojibake_tests stay locked", async () => {
    const cwd = await makeCwd();
    try {
      await writeV046AgentImages(cwd);
      const result = await buildV046ThreeChannelReviewPackets({
        cwd,
        ...mockedRunners()
      });

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

  test("blocks without fake success when quality gate fails", async () => {
    const cwd = await makeCwd();
    try {
      await writeV046AgentImages(cwd);
      const first = V046_AGENT_IMAGE_SCENE_PLANS[0];
      await writeFile(path.join(cwd, first.target_path), Buffer.alloc(12000, 1));

      const result = await buildV046ThreeChannelReviewPackets({
        cwd,
        ...mockedRunners()
      });

      expect(result.FINAL_STATUS).toBe("BLOCKED_V046_AGENT_IMAGE_SKILL_OUTPUT_QUALITY_FAIL");
      expect(result.V046_THREE_CHANNEL_REVIEW_READY).toBe(false);
      expect(result.SAFE_TO_UPLOAD).toBe(false);
      expect(result.fake_success).toBe(false);
      expect(result.quality_gate_pass).toBe(false);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
