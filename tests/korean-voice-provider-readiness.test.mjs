import { describe, expect, test } from "vitest";

import {
  buildKoreanVoiceProviderSafeSummary,
  evaluateKoreanVoiceProviderReadiness
} from "../scripts/korean-voice-provider-readiness.mjs";

describe("approved Korean voice provider readiness contract", () => {
  test("blocks missing provider without exposing raw values", () => {
    const result = evaluateKoreanVoiceProviderReadiness({});

    expect(result).toMatchObject({
      providerName: null,
      providerType: null,
      configured: false,
      approved: false,
      koreanCapable: false,
      sapiRejected: false,
      paidOrCloudRequiresExplicitApproval: false,
      canGenerate: false,
      blocker: "BLOCKED_KOREAN_VOICE_PROVIDER_NOT_CONFIGURED",
      rawValuesMasked: true
    });
    expect(buildKoreanVoiceProviderSafeSummary(result)).not.toContain("secret");
  });

  test("rejects Windows SAPI and local_sapi providers even when marked approved", () => {
    for (const providerName of ["Windows SAPI", "local_sapi_voice", "local_sapi"]) {
      const result = evaluateKoreanVoiceProviderReadiness({
        KOREAN_VOICE_PROVIDER: providerName,
        KOREAN_VOICE_PROVIDER_APPROVED: "true",
        KOREAN_VOICE_LANGUAGE: "ko",
        KOREAN_VOICE_REJECT_WINDOWS_SAPI: "true"
      });

      expect(result).toMatchObject({
        approved: false,
        sapiRejected: true,
        canGenerate: false,
        blocker: "VOICEOVER_REJECTED_LOCAL_SAPI_VOICE"
      });
    }
  });

  test("blocks unapproved cloud or paid providers before any generation call", () => {
    const result = evaluateKoreanVoiceProviderReadiness({
      KOREAN_VOICE_PROVIDER: "approved_cloud",
      KOREAN_VOICE_PROVIDER_APPROVED: "true",
      KOREAN_VOICE_LANGUAGE: "ko",
      KOREAN_VOICE_PAID_OR_CLOUD_APPROVAL: ""
    });

    expect(result).toMatchObject({
      providerType: "approved_cloud",
      configured: true,
      approved: false,
      paidOrCloudRequiresExplicitApproval: true,
      canGenerate: false,
      blocker: "VOICE_PROVIDER_PAID_OR_CLOUD_REQUIRES_APPROVAL"
    });
  });

  test("accepts an approved local Korean TTS command contract without exposing paths", () => {
    const result = evaluateKoreanVoiceProviderReadiness({
      KOREAN_VOICE_PROVIDER: "local_approved_korean_tts",
      KOREAN_VOICE_PROVIDER_APPROVED: "true",
      KOREAN_VOICE_COMMAND: "C:/private/tools/tts.exe --voice ko",
      KOREAN_VOICE_LANGUAGE: "ko",
      KOREAN_VOICE_REJECT_WINDOWS_SAPI: "true"
    });

    expect(result).toMatchObject({
      providerType: "local",
      configured: true,
      approved: true,
      koreanCapable: true,
      sapiRejected: false,
      paidOrCloudRequiresExplicitApproval: false,
      canGenerate: true,
      blocker: null,
      commandPresent: true
    });
    expect(buildKoreanVoiceProviderSafeSummary(result)).not.toContain("C:/private/tools/tts.exe");
  });

  test("accepts an owner-recorded Korean voice file contract when explicitly approved", () => {
    const result = evaluateKoreanVoiceProviderReadiness({
      KOREAN_VOICE_PROVIDER: "owner_recorded",
      KOREAN_VOICE_PROVIDER_APPROVED: "true",
      KOREAN_VOICE_MODEL_PATH: "C:/private/voice/owner.wav",
      KOREAN_VOICE_LANGUAGE: "ko"
    });

    expect(result).toMatchObject({
      providerType: "owner_recorded",
      configured: true,
      approved: true,
      koreanCapable: true,
      canGenerate: true,
      blocker: null,
      modelPathPresent: true
    });
    expect(buildKoreanVoiceProviderSafeSummary(result)).not.toContain("owner.wav");
  });
});
