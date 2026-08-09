import { describe, expect, it } from "vitest";
import {
  assertSlot069ProviderBudget,
  V5_SLOT069_LIMITS,
  V5_SLOT069_NO_DOWNSTREAM_EXECUTION
} from "@/lib/usage-evidence";

describe("V5 slot-069 narrow repair budgets", () => {
  it("caps direct, replacement, proof, and total provider calls", () => {
    expect(assertSlot069ProviderBudget({ direct: 2, replacement: 6, proof: 3, reserve: 1 })).toBe(12);
    expect(() => assertSlot069ProviderBudget({ direct: 3, replacement: 0, proof: 0 })).toThrow("V5_SLOT069_PROVIDER_BUDGET_EXCEEDED");
    expect(() => assertSlot069ProviderBudget({ direct: 2, replacement: 6, proof: 3, reserve: 2 })).toThrow("V5_SLOT069_PROVIDER_BUDGET_EXCEEDED");
  });

  it("keeps regeneration and provisional pack scope narrow", () => {
    expect(V5_SLOT069_LIMITS).toMatchObject({
      provisionalReplacementPacks: 3,
      selectedReplacementPacks: 1,
      standbyPacks: 1,
      normalBackgroundGenerations: 0,
      maximumRepairBackgroundGenerations: 4,
      maximumNewComposites: 16
    });
  });

  it("keeps every downstream writer and media executor disabled", () => {
    expect(V5_SLOT069_NO_DOWNSTREAM_EXECUTION).toMatchObject({
      SAFE_TO_UPLOAD: false,
      SAFE_TO_PUBLIC_UPLOAD: false,
      QUEUE_SCHEDULER_ENABLED: false,
      isPaused: true,
      GOOGLE_SHEETS_WRITE: 0,
      GOOGLE_DRIVE_WRITE: 0,
      R2_WRITE: 0,
      DB_WRITE: 0,
      FINAL_VIDEO_RENDER_COUNT: 0,
      TTS_EXECUTION_COUNT: 0,
      ASR_EXECUTION_COUNT: 0,
      WHISPERX_EXECUTION_COUNT: 0,
      PLATFORM_UPLOAD: 0
    });
  });
});
