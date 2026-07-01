import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { V046_AGENT_IMAGE_SCENE_PLANS } from "../src/uploads/multi-channel/agentImageSkillHandoff";
import {
  buildV048ChannelSpecificReviewPackets,
  recordV047ChannelBindingFailure
} from "../src/uploads/multi-channel/v048ChannelSpecificReviewBuilder";
import {
  V048_CHANNEL_SPECS,
  buildChannelSpecificScriptPlan
} from "../src/uploads/multi-channel/channelSpecificScriptFactory";
import {
  evaluateChannelBinding,
  evaluateThreeChannelBinding
} from "../src/uploads/multi-channel/channelBindingGate";
import { buildChannelUploadSettingsPreview } from "../src/uploads/multi-channel/channelUploadSettingsPreview";

const AFFILIATE_URL = "https://link.coupang.com/a/v048-real-affiliate";

async function makeCwd() {
  return mkdtemp(path.join(os.tmpdir(), "commerce-v048-"));
}

function validPng(width = 1024, height = 1792, fill = 73) {
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
    await writeFile(path.join(cwd, scene.target_path), validPng(1024, 1792, 79 + index));
  }
}

function mockedRunners() {
  return {
    selectedAffiliateUrl: AFFILIATE_URL,
    env: {
      KOREAN_VOICE_PROVIDER: "local_command",
      KOREAN_VOICE_PROVIDER_APPROVED: "true",
      KOREAN_VOICE_COMMAND: "local-melotts-wrapper",
      KOREAN_VOICE_LANGUAGE: "ko",
      KOREAN_VOICE_OUTPUT_FORMAT: "wav",
      KOREAN_VOICE_REJECT_WINDOWS_SAPI: "true"
    },
    voiceRunner: async ({ audioPath }: { audioPath: string }) => {
      await writeFile(audioPath, "fake-v048-audio", "utf8");
      return { ok: true };
    },
    mediaRunner: async ({ outputPath }: { outputPath: string }) => {
      await writeFile(outputPath, "fake-v048-media", "utf8");
    },
    videoProbe: async () => ({
      duration_seconds: 23.5,
      audio_duration_seconds: 22.1,
      video_has_audio_stream: true
    }),
    asrRunner: async ({ channelKey }: { channelKey?: string }) => {
      const spec = V048_CHANNEL_SPECS.find((item) => item.channel_key === channelKey) ?? V048_CHANNEL_SPECS[0];
      return {
        transcript: spec.script,
        raw_similarity_score: 0.97,
        transcript_similarity_score: 0.97,
        core_anchor_recognition_pass: true,
        speech_rate_wpm: 160
      };
    }
  };
}

describe("v048 channel-specific script asset settings gate", () => {
  test("v047_fail_status_tests record owner failure and block PR166 merge", async () => {
    const cwd = await makeCwd();
    try {
      const decision = await recordV047ChannelBindingFailure({ cwd });

      expect(decision).toMatchObject({
        version: "v047",
        human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
        safe_to_upload: false,
        pr166_merge_allowed: false
      });
      expect(decision.fail_reasons).toEqual([
        "CROSS_CHANNEL_SCRIPT_CONTAMINATION",
        "ALL_CHANNELS_USED_LAUNDRY_SCRIPT",
        "CHANNEL_PRODUCT_SCRIPT_MISMATCH",
        "SCENE_MANIFEST_PURPOSE_MISMATCH",
        "FATHER_JOBS_USED_LAUNDRY_PURPOSES",
        "LETS_BUY_USED_LAUNDRY_PURPOSES",
        "HOOK_ASSET_SCRIPT_NOT_BOUND_TO_CHANNEL",
        "UPLOAD_SETTINGS_GATE_MISSING"
      ]);
      await expect(stat(path.join(cwd, "commerce-assets", "review", "v047", "human-review-decision.json"))).resolves.toBeTruthy();
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("channel_script_binding_tests and channel_scene_manifest_binding_tests enforce canonical text", () => {
    const plans = V048_CHANNEL_SPECS.map((spec) => buildChannelSpecificScriptPlan(spec.channel_key));
    const binding = evaluateThreeChannelBinding(plans);

    expect(binding.channel_script_binding_pass).toBe(true);
    expect(binding.channel_scene_manifest_binding_pass).toBe(true);
    expect(binding.channel_metadata_binding_pass).toBe(true);
    expect(binding.channel_comment_binding_pass).toBe(true);
    expect(binding.cross_channel_text_contamination).toBe(false);
    expect(binding.same_script_reused).toBe(false);
    expect(binding.binding_blocker).toBeNull();

    expect(plans.find((plan) => plan.channel_key === "father_jobs")?.script).toContain("차량용 컵홀더 정리함");
    expect(plans.find((plan) => plan.channel_key === "neoman_moleulgeol")?.script).toContain("접이식 빨래건조대");
    expect(plans.find((plan) => plan.channel_key === "lets_buy")?.script).toContain("케이블 정리함");
  });

  test("cross_channel_text_contamination_tests and same_script_reuse_guard_tests block bad plans", () => {
    const fatherJobs = buildChannelSpecificScriptPlan("father_jobs");
    const contaminated = evaluateChannelBinding({
      ...fatherJobs,
      script: `${fatherJobs.script} 빨래 건조대 장마철`,
      scene_prompt_plan: fatherJobs.scene_prompt_plan.map((scene) => ({
        ...scene,
        purpose: `${scene.purpose} 빨래`
      }))
    });

    expect(contaminated.channel_script_binding_pass).toBe(false);
    expect(contaminated.channel_scene_manifest_binding_pass).toBe(false);
    expect(contaminated.binding_blocker).toBe("CHANNEL_SCRIPT_BINDING_FAIL");

    const plans = V048_CHANNEL_SPECS.map((spec) => buildChannelSpecificScriptPlan(spec.channel_key));
    const reused = evaluateThreeChannelBinding(plans.map((plan) => ({ ...plan, script: plans[0].script })));
    expect(reused.same_script_reused).toBe(true);
    expect(reused.binding_blocker).toBe("SAME_SCRIPT_REUSED_ACROSS_CHANNELS");
  });

  test("paid_promotion_settings_preview_tests and manual_paid_promotion_blocker_tests", () => {
    const preview = buildChannelUploadSettingsPreview("father_jobs");

    expect(preview).toMatchObject({
      visibility: "public",
      made_for_kids: false,
      contains_paid_promotion: true,
      paid_promotion_disclosure_required: true,
      paid_promotion_setting_verification: "REQUIRED_BEFORE_UPLOAD",
      description_points_to_comment_link: true,
      comment_contains_affiliate_link: true,
      comment_contains_coupang_disclosure: true,
      raw_affiliate_url_printed: false,
      safe_to_upload: false,
      manual_paid_promotion_check_required: true,
      blocker: "MANUAL_PAID_PROMOTION_CHECK_REQUIRED"
    });
  });

  test("asr_anchor_binding_tests build three channel review packets with distinct scripts and settings", async () => {
    const cwd = await makeCwd();
    try {
      await writeV046AgentImages(cwd);
      const result = await buildV048ChannelSpecificReviewPackets({
        cwd,
        ...mockedRunners()
      });

      expect(result.FINAL_STATUS).toBe("SUCCESS_V048_CHANNEL_SPECIFIC_REVIEW_READY");
      expect(result.V048_REVIEW_PACKETS_READY).toBe(true);
      expect(result.SAFE_TO_UPLOAD).toBe(false);
      expect(result.father_jobs_binding_pass).toBe(true);
      expect(result.neoman_moleulgeol_binding_pass).toBe(true);
      expect(result.lets_buy_binding_pass).toBe(true);
      expect(result.cross_channel_text_contamination).toBe(false);
      expect(result.same_script_reused).toBe(false);
      expect(result.father_jobs_core_anchor_pass).toBe(true);
      expect(result.neoman_moleulgeol_core_anchor_pass).toBe(true);
      expect(result.lets_buy_core_anchor_pass).toBe(true);
      expect(result.father_jobs_video_generated).toBe(true);
      expect(result.neoman_moleulgeol_video_generated).toBe(true);
      expect(result.lets_buy_video_generated).toBe(true);
      await expect(stat(result.father_jobs_review_console as string)).resolves.toBeTruthy();
      await expect(stat(result.neoman_moleulgeol_review_console as string)).resolves.toBeTruthy();
      await expect(stat(result.lets_buy_review_console as string)).resolves.toBeTruthy();
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("metadata_disclosure_tests no_raw_affiliate_url_report_tests upload_side_effect_block_tests mojibake_tests", async () => {
    const cwd = await makeCwd();
    try {
      await writeV046AgentImages(cwd);
      const result = await buildV048ChannelSpecificReviewPackets({
        cwd,
        ...mockedRunners()
      });
      const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
      const fatherHook = await readFile(path.join(cwd, "commerce-assets", "review", "v048", "father_jobs", "hook-script-preview.json"), "utf8");
      const fatherSettings = await readFile(path.join(cwd, "commerce-assets", "review", "v048", "father_jobs", "youtube-upload-settings-preview.json"), "utf8");
      const serialized = JSON.stringify({ result, fatherHook, fatherSettings });

      expect(result.metadata_previews_generated).toBe(true);
      expect(result.comment_previews_generated).toBe(true);
      expect(result.comment_link_present_all).toBe(true);
      expect(result.affiliate_disclosure_present_all).toBe(true);
      expect(result.upload_settings_previews_generated).toBe(true);
      expect(result.contains_paid_promotion_all).toBe(true);
      expect(result.paid_promotion_setting_verified).toBe(false);
      expect(result.manual_paid_promotion_check_required).toBe(true);
      expect(result.made_for_kids_false_all).toBe(true);
      expect(result.upload_settings_blocker).toBe("MANUAL_PAID_PROMOTION_CHECK_REQUIRED");
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
      expect(result.fake_success).toBe(false);
      expect(packageJson.scripts["review:v048"]).toBe("tsx scripts/uploads/generate-v048-channel-specific-review.ts");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
