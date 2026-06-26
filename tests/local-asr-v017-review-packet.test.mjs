import { mkdtemp, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import {
  buildV017ReviewSummary,
  generateV017ReviewPacket
} from "../scripts/generate-local-asr-v017-review-packet.mjs";
import { evaluateKoreanVoiceProviderReadiness } from "../scripts/korean-voice-provider-readiness.mjs";

describe("local v017 approved Korean voice provider review packet", () => {
  test("keeps v017 blocked and does not generate review video when provider env is missing", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "commerce-v017-blocked-"));
    const result = await generateV017ReviewPacket({ cwd, env: {} });

    expect(result).toMatchObject({
      target_version: "v017",
      voice_provider_configured: false,
      voice_provider_approved: false,
      voice_provider_blocker: "BLOCKED_KOREAN_VOICE_PROVIDER_NOT_CONFIGURED",
      review_console_generated: false,
      voiceover_generated: false,
      real_asr_probe_executed: false,
      local_review_packet_ready: false,
      SAFE_TO_REQUEST_PRIVATE_UPLOAD: false
    });
    await expect(stat(result.local_review_video_path)).rejects.toThrow();
  });

  test("accepts approved owner-recorded readiness only when ASR/audio gates pass", () => {
    const summary = buildV017ReviewSummary({
      voiceProvider: evaluateKoreanVoiceProviderReadiness({
        KOREAN_VOICE_PROVIDER: "owner_recorded",
        KOREAN_VOICE_PROVIDER_APPROVED: "true",
        KOREAN_VOICE_SOURCE_PATH: "C:/private/voice/owner.wav",
        KOREAN_VOICE_LANGUAGE: "ko"
      }),
      ownerRecordedFileUsed: true,
      voiceoverGenerated: true,
      localReviewVideoCreated: true,
      asrProbe: {
        real_asr_probe_executed: true,
        raw_similarity_score: 0.9,
        transcript_similarity_score: 0.92,
        core_anchor_recognition_pass: true,
        recognized_core_anchors: ["빨래", "건조대", "공간"],
        recognized_context_anchors: ["장마철", "습기", "확인"],
        speech_rate_wpm: 141,
        max_silence_between_segments_ms: 110,
        hard_cut_count: 0,
        voiceover_naturalness_score: 91
      }
    });

    expect(summary).toMatchObject({
      version: "v017",
      approved_korean_voice_ready: true,
      owner_recorded_file_used: true,
      local_command_used: false,
      voiceover_generated: true,
      real_asr_probe_executed: true,
      core_anchor_recognition_pass: true,
      local_review_packet_ready: true,
      SAFE_TO_REQUEST_PRIVATE_UPLOAD: false
    });
  });
});
