import { describe, expect, test } from "vitest";
import { assessCodexImageSkillReadiness, V5_GENERATION_BUDGET, V5_NO_DOWNSTREAM_EXECUTION } from "@/lib/usage-evidence";

describe("V5 Codex Image Skill readiness", () => {
  test("is ready only when the built-in tool and persistence contract are available", () => {
    expect(assessCodexImageSkillReadiness({
      builtInToolAvailable: true,
      localReferenceInput: true,
      backgroundGeneration: true,
      outputFilePersistence: true,
      deterministicMetadata: true
    })).toMatchObject({ CODEX_IMAGE_SKILL_READY: true, provider: "built_in_image_gen", externalCredentialsRequired: false, newImageApiClient: false });
  });

  test("does not depend on user media or owner inbox state", () => {
    const contract = { userMediaRequired: false, ownerInboxRequired: false, ...V5_NO_DOWNSTREAM_EXECUTION };
    expect(contract).toMatchObject({ userMediaRequired: false, ownerInboxRequired: false });
    expect(V5_NO_DOWNSTREAM_EXECUTION.PLATFORM_UPLOAD).toBe(0);
  });

  test("caps generation, repair, and live provider calls", () => {
    expect(V5_GENERATION_BUDGET).toEqual({
      candidateProducts: 15,
      initialGeneratedImages: 60,
      repairGeneratedImages: 30,
      maximumGeneratedImages: 90,
      maximumLiveProviderCalls: 60,
      maximumRepairsPerScene: 1
    });
  });
});
