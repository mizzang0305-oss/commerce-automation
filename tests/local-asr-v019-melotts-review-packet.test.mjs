import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import {
  buildV019ReviewSummary,
  evaluateV019AudioIntelligibility,
  generateV019ReviewPacket
} from "../scripts/uploads/generate-v019-review-packet.mjs";
import { evaluateKoreanVoiceProviderReadiness } from "../scripts/korean-voice-provider-readiness.mjs";

describe("v019 MeloTTS local_command review packet", () => {
  test("blocks without a local_command TTS command and never creates upload-ready output", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "commerce-v019-missing-command-"));

    const result = await generateV019ReviewPacket({
      cwd,
      env: {
        KOREAN_VOICE_PROVIDER: "local_command",
        KOREAN_VOICE_PROVIDER_APPROVED: "true",
        KOREAN_VOICE_LANGUAGE: "ko",
        KOREAN_VOICE_REJECT_WINDOWS_SAPI: "true"
      }
    });

    expect(result).toMatchObject({
      target_version: "v019",
      voice_provider_configured: false,
      voice_provider_approved: false,
      voice_provider_blocker: "BLOCKED_KOREAN_VOICE_PROVIDER_NOT_CONFIGURED",
      local_command_used: false,
      windows_sapi_used: false,
      voiceover_generated: false,
      real_asr_probe_executed: false,
      review_console_generated: false,
      local_review_packet_ready: false,
      SAFE_TO_REQUEST_PRIVATE_UPLOAD: false
    });
    await expect(stat(result.local_review_video_path)).rejects.toThrow();
    const decision = JSON.parse(await readFile(result.human_review_decision_path, "utf8"));
    expect(decision).toMatchObject({
      human_review_status: "VOICE_PROVIDER_BLOCKED",
      private_upload_allowed: false,
      requires_fresh_upload_approval: true
    });
  });

  test("rejects any System.Speech or SAPI command before generation", () => {
    const voiceProvider = evaluateKoreanVoiceProviderReadiness({
      KOREAN_VOICE_PROVIDER: "local_command",
      KOREAN_VOICE_PROVIDER_APPROVED: "true",
      KOREAN_VOICE_COMMAND: "powershell Add-Type -AssemblyName System.Speech",
      KOREAN_VOICE_LANGUAGE: "ko",
      KOREAN_VOICE_REJECT_WINDOWS_SAPI: "true"
    });

    expect(voiceProvider).toMatchObject({
      providerType: "local_command",
      configured: true,
      approved: false,
      sapiRejected: true,
      canGenerate: false,
      blocker: "VOICEOVER_REJECTED_LOCAL_SAPI_VOICE"
    });
  });

  test("passes v019 summary only when MeloTTS audio, real ASR, and visual gates pass", () => {
    const summary = buildV019ReviewSummary({
      voiceProvider: evaluateKoreanVoiceProviderReadiness({
        KOREAN_VOICE_PROVIDER: "local_command",
        KOREAN_VOICE_PROVIDER_APPROVED: "true",
        KOREAN_VOICE_COMMAND: "C:/outside-repo/melotts-wrapper.cmd",
        KOREAN_VOICE_LANGUAGE: "ko",
        KOREAN_VOICE_REJECT_WINDOWS_SAPI: "true"
      }),
      localCommandUsed: true,
      localReviewVideoCreated: true,
      voiceoverGenerated: true,
      audioProbe: {
        real_asr_probe_executed: true,
        raw_similarity_score: 0.86,
        transcript_similarity_score: 0.9,
        core_anchor_recognition_pass: true,
        recognized_core_anchors: ["빨래", "건조대", "공간"],
        recognized_context_anchors: ["장마철", "냄새", "습기", "확인"],
        speech_rate_wpm: 145,
        max_silence_between_segments_ms: 130,
        hard_cut_count: 0,
        voiceover_naturalness_score: 90
      },
      visualGate: {
        real_storyboard_gate_pass: true,
        human_visual_gate_pass: true,
        caption_safe_area_pass: true,
        no_text_clipped: true,
        cta_scene_present: true
      }
    });

    expect(summary).toMatchObject({
      version: "v019",
      voice_provider_type: "local_command",
      voice_provider_approved: true,
      local_command_used: true,
      windows_sapi_used: false,
      voiceover_generated: true,
      real_asr_probe_executed: true,
      raw_similarity_score: 0.86,
      transcript_similarity_score: 0.9,
      core_anchor_recognition_pass: true,
      recognized_core_anchors: ["빨래", "건조대", "공간"],
      real_storyboard_gate_pass: true,
      human_visual_gate_pass: true,
      local_review_packet_ready: true,
      SAFE_TO_REQUEST_PRIVATE_UPLOAD: false
    });
  });

  test("normalizes Korean ASR transcript against the v019 core anchors", () => {
    const probe = evaluateV019AudioIntelligibility({
      referenceScript: "장마철 빨래 냄새와 좁은 공간 문제를 빨래건조대로 정리하세요.",
      transcript: "장마철 빨래 냄새와 좁은 공간 문제는 접이식 빨래 건조대로 정리할 수 있습니다.",
      config: {
        minSimilarity: 0.45,
        minWpm: 120,
        maxWpm: 170
      },
      speechRateWpm: 145,
      maxSilenceBetweenSegmentsMs: 120,
      hardCutCount: 0,
      voiceoverNaturalnessScore: 90
    });

    expect(probe).toMatchObject({
      real_asr_probe_executed: true,
      core_anchor_recognition_pass: true,
      recognized_core_anchors: ["빨래", "건조대", "공간"],
      audio_blocker: null
    });
    expect(probe.raw_similarity_score).toBeGreaterThanOrEqual(0.45);
    expect(probe.transcript_similarity_score).toBeGreaterThanOrEqual(0.45);
  });

  test("does not leak local command, model, or raw paths into summary artifacts", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "commerce-v019-safe-summary-"));
    const outsideCommand = path.join(os.tmpdir(), "private-melotts-wrapper.cmd");
    await writeFile(outsideCommand, "echo fake", "utf8");

    const result = await generateV019ReviewPacket({
      cwd,
      env: {
        KOREAN_VOICE_PROVIDER: "local_command",
        KOREAN_VOICE_PROVIDER_APPROVED: "true",
        KOREAN_VOICE_COMMAND: outsideCommand,
        KOREAN_VOICE_LANGUAGE: "ko",
        KOREAN_VOICE_REJECT_WINDOWS_SAPI: "true"
      },
      ttsRunner: async () => ({
        ok: false,
        blocker: "LOCAL_KOREAN_TTS_COMMAND_FAILED"
      })
    });
    const readiness = await readFile(result.voice_provider_readiness_path, "utf8");

    expect(readiness).not.toContain(outsideCommand);
    expect(JSON.stringify(result)).not.toContain(outsideCommand);
    expect(result.voice_provider_blocker).toBe("LOCAL_KOREAN_TTS_COMMAND_FAILED");
  });
});
