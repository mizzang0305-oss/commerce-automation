import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { buildV035VoiceoverScript } from "../scripts/uploads/generate-v035-image-skill-scene-shorts-review-packet";
import {
  V046_AGENT_IMAGE_SCENE_PLANS
} from "../src/uploads/multi-channel/agentImageSkillHandoff";
import {
  evaluateV035KoreanVoiceProviderReadiness
} from "../src/uploads/multi-channel/v035KoreanVoiceProviderAdapter";
import {
  buildV047ThreeChannelKoreanVoiceReviewPackets
} from "../src/uploads/multi-channel/v047ThreeChannelKoreanVoiceReviewBuilder";

const AFFILIATE_URL = "https://link.coupang.com/a/v047-real-affiliate";

async function makeCwd() {
  return mkdtemp(path.join(os.tmpdir(), "commerce-v047-"));
}

function validPng(width = 1024, height = 1792, fill = 53) {
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
    await writeFile(path.join(cwd, scene.target_path), validPng(1024, 1792, 59 + index));
  }
}

function approvedLocalCommandEnv(): NodeJS.ProcessEnv {
  return {
    KOREAN_VOICE_PROVIDER: "local_command",
    KOREAN_VOICE_PROVIDER_APPROVED: "true",
    KOREAN_VOICE_COMMAND: "local-melotts-wrapper",
    KOREAN_VOICE_LANGUAGE: "ko",
    KOREAN_VOICE_OUTPUT_FORMAT: "wav",
    KOREAN_VOICE_REJECT_WINDOWS_SAPI: "true"
  };
}

function mockedRunners() {
  return {
    selectedAffiliateUrl: AFFILIATE_URL,
    voiceRunner: async ({ audioPath }: { audioPath: string }) => {
      await writeFile(audioPath, "fake-v047-audio", "utf8");
      return { ok: true };
    },
    mediaRunner: async ({ outputPath }: { outputPath: string }) => {
      await writeFile(outputPath, "fake-v047-media", "utf8");
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

describe("v047 restored v035 Korean voice provider review", () => {
  test("v035_melotts_voice_provider_restore_tests accept only approved local_command Korean voice", () => {
    const readiness = evaluateV035KoreanVoiceProviderReadiness(approvedLocalCommandEnv());

    expect(readiness).toMatchObject({
      v035_melotts_provider_ready: true,
      local_command_provider_ready: true,
      command_present: true,
      provider_approved: true,
      korean_language_ready: true,
      windows_sapi_used: false,
      paid_or_cloud_provider_used: false,
      raw_values_masked: true,
      blocker: null
    });
  });

  test("rejects Windows SAPI and cloud or paid voice provider markers", () => {
    expect(evaluateV035KoreanVoiceProviderReadiness({
      ...approvedLocalCommandEnv(),
      KOREAN_VOICE_COMMAND: "powershell System.Speech local_sapi"
    })).toMatchObject({
      v035_melotts_provider_ready: false,
      windows_sapi_used: true,
      blocker: "VOICEOVER_REJECTED_LOCAL_SAPI_VOICE"
    });

    expect(evaluateV035KoreanVoiceProviderReadiness({
      ...approvedLocalCommandEnv(),
      KOREAN_VOICE_COMMAND: "openai-tts-wrapper"
    })).toMatchObject({
      v035_melotts_provider_ready: false,
      paid_or_cloud_provider_used: true,
      blocker: "VOICE_PROVIDER_PAID_OR_CLOUD_REQUIRES_APPROVAL"
    });
  });

  test("three_channel_voice_review_tests build v047 packets from v046 images through v035", async () => {
    const cwd = await makeCwd();
    try {
      await writeV046AgentImages(cwd);
      const result = await buildV047ThreeChannelKoreanVoiceReviewPackets({
        cwd,
        env: approvedLocalCommandEnv(),
        ...mockedRunners()
      });

      expect(result.FINAL_STATUS).toBe("SUCCESS_V047_THREE_CHANNEL_KOREAN_VOICE_REVIEW_READY");
      expect(result.V047_THREE_CHANNEL_REVIEW_READY).toBe(true);
      expect(result.SAFE_TO_UPLOAD).toBe(false);
      expect(result.source_image_version).toBe("v046");
      expect(result.generated_image_count).toBe(18);
      expect(result.v035_renderer_reused).toBe(true);
      expect(result.v035_melotts_voice_provider_restored).toBe(true);
      expect(result.local_command_provider_ready).toBe(true);
      expect(result.melotts_voice_used_all).toBe(true);
      expect(result.speech_rate_wpm_present_all).toBe(true);
      expect(result.raw_similarity_score_present_all).toBe(true);
      expect(result.transcript_similarity_score_present_all).toBe(true);
      expect(result.core_anchor_recognition_pass_all).toBe(true);
      expect(result.audio_blocker_all_clear).toBe(true);
      expect(result.audio_validation_pass).toBe(true);
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

  test("blocks without fake success when v046 images are missing or voice provider is not configured", async () => {
    const cwd = await makeCwd();
    try {
      const missingImages = await buildV047ThreeChannelKoreanVoiceReviewPackets({
        cwd,
        env: approvedLocalCommandEnv(),
        ...mockedRunners()
      });
      expect(missingImages.FINAL_STATUS).toBe("BLOCKED_V046_GENERATED_IMAGES_MISSING");
      expect(missingImages.V047_THREE_CHANNEL_REVIEW_READY).toBe(false);
      expect(missingImages.fake_success).toBe(false);

      await writeV046AgentImages(cwd);
      const missingVoice = await buildV047ThreeChannelKoreanVoiceReviewPackets({
        cwd,
        env: {},
        ...mockedRunners()
      });
      expect(missingVoice.FINAL_STATUS).toBe("BLOCKED_V035_KOREAN_VOICE_PROVIDER_NOT_REPRODUCIBLE");
      expect(missingVoice.V047_THREE_CHANNEL_REVIEW_READY).toBe(false);
      expect(missingVoice.voice_provider_blocker).toBe("BLOCKED_KOREAN_VOICE_PROVIDER_NOT_CONFIGURED");
      expect(missingVoice.fake_success).toBe(false);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("metadata_comment_and_upload_side_effect_guards stay locked", async () => {
    const cwd = await makeCwd();
    try {
      await writeV046AgentImages(cwd);
      const result = await buildV047ThreeChannelKoreanVoiceReviewPackets({
        cwd,
        env: approvedLocalCommandEnv(),
        ...mockedRunners()
      });
      const summary = await readFile(path.join(cwd, "commerce-assets", "review", "v047", "review-summary.json"), "utf8");
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
      expect(result.private_upload).toBe(false);
      expect(result.public_upload).toBe(false);
      expect(result.unlisted_upload).toBe(false);
      expect(result.comment_create_update_delete_called).toBe(false);
      expect(result.visibility_changed).toBe(false);
      expect(result.R2_upload).toBe(false);
      expect(result.product_assets_write).toBe(false);
      expect(result.DB_write).toBe(false);
      expect(result.raw_urls_printed).toBe(false);
      expect(result.secrets_printed).toBe(false);
      expect(result.fake_success).toBe(false);
      expect(packageJson.scripts["review:v047"]).toBe("tsx scripts/uploads/generate-v047-three-channel-korean-voice-review.ts");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
