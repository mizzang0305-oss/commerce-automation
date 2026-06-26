import { mkdtemp, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import {
  buildV016ReviewSummary,
  generateV016ReviewPacket
} from "../scripts/generate-local-asr-v016-review-packet.mjs";
import { evaluateKoreanVoiceProviderReadiness } from "../scripts/korean-voice-provider-readiness.mjs";

describe("local v016 Korean voice provider review packet", () => {
  test("keeps v016 blocked and does not generate local video when approved voice provider is missing", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "commerce-v016-blocked-"));
    const result = await generateV016ReviewPacket({
      cwd,
      env: {}
    });

    expect(result).toMatchObject({
      target_version: "v016",
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
    const readiness = JSON.parse(await readFile(result.voice_provider_readiness_path, "utf8"));
    expect(readiness).toMatchObject({
      configured: false,
      approved: false,
      blocker: "BLOCKED_KOREAN_VOICE_PROVIDER_NOT_CONFIGURED",
      rawValuesMasked: true
    });
  });

  test("passes v016 readiness summary only for an approved non-SAPI Korean provider contract", () => {
    const summary = buildV016ReviewSummary({
      voiceProvider: evaluateKoreanVoiceProviderReadiness({
        KOREAN_VOICE_PROVIDER: "local_approved_korean_tts",
        KOREAN_VOICE_PROVIDER_APPROVED: "true",
        KOREAN_VOICE_COMMAND: "tts-local --language ko",
        KOREAN_VOICE_LANGUAGE: "ko",
        KOREAN_VOICE_REJECT_WINDOWS_SAPI: "true"
      }),
      localReviewVideoCreated: true,
      voiceoverGenerated: true,
      asrProbe: {
        real_asr_probe_executed: true,
        raw_similarity_score: 0.9,
        transcript_similarity_score: 0.91,
        core_anchor_recognition_pass: true,
        recognized_core_anchors: ["빨래", "건조대", "공간"],
        speech_rate_wpm: 142,
        max_silence_between_segments_ms: 120,
        hard_cut_count: 0,
        voiceover_naturalness_score: 90
      }
    });

    expect(summary).toMatchObject({
      version: "v016",
      approved_korean_voice_ready: true,
      voice_provider_configured: true,
      voice_provider_approved: true,
      windows_sapi_used: false,
      voiceover_rejected_local_sapi_voice: false,
      real_asr_probe_executed: true,
      raw_similarity_score: 0.9,
      transcript_similarity_score: 0.91,
      core_anchor_recognition_pass: true,
      local_review_packet_ready: true,
      SAFE_TO_REQUEST_PRIVATE_UPLOAD: false
    });
  });
});
