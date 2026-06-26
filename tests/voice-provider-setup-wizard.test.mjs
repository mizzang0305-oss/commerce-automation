import { describe, expect, test } from "vitest";

import {
  buildKoreanVoiceSetupGuide,
  checkKoreanVoiceProviderSetup
} from "../scripts/uploads/check-korean-voice-provider.mjs";

describe("v018 Korean voice provider setup wizard", () => {
  test("reports missing provider with setup instructions and no raw env values", async () => {
    const result = await checkKoreanVoiceProviderSetup({ env: {} });

    expect(result).toMatchObject({
      setup_wizard_added: true,
      owner_recorded_mode_supported: true,
      local_command_mode_supported: true,
      approved_cloud_blocked_until_separate_approval: true,
      windows_sapi_rejected: true,
      setup_instructions_generated: true,
      voice_provider_configured: false,
      voice_provider_approved: false,
      voice_provider_blocker: "BLOCKED_KOREAN_VOICE_PROVIDER_NOT_CONFIGURED",
      raw_values_masked: true
    });

    const guide = buildKoreanVoiceSetupGuide(result);
    expect(guide).toContain("KOREAN_VOICE_PROVIDER=owner_recorded");
    expect(guide).toContain("KOREAN_VOICE_PROVIDER=local_command");
    expect(guide).toContain("BLOCKED_KOREAN_VOICE_PROVIDER_NOT_CONFIGURED");
    expect(guide).not.toContain("C:/private");
  });

  test("keeps approved_cloud blocked without separate paid/cloud approval", async () => {
    const result = await checkKoreanVoiceProviderSetup({
      env: {
        KOREAN_VOICE_PROVIDER: "approved_cloud",
        KOREAN_VOICE_PROVIDER_APPROVED: "true",
        KOREAN_VOICE_LANGUAGE: "ko"
      }
    });

    expect(result).toMatchObject({
      voice_provider_type: "approved_cloud",
      voice_provider_configured: true,
      voice_provider_approved: false,
      paid_or_cloud_requires_approval: true,
      voice_provider_blocker: "VOICE_PROVIDER_PAID_OR_CLOUD_REQUIRES_APPROVAL"
    });
  });
});
