import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("bounded ASR recovery contract", () => {
  it("uses one original ASR attempt and one segmented-TTS ASR recovery before failing closed", async () => {
    const source = await readFile("scripts/video-automation/run-autonomous-video-review-v2.ts", "utf8");
    expect(source).toContain("recoverKoreanTtsAfterAsrFailure");
    expect(source).toContain("asr-recovery-tts-repaired.wav");
    expect(source).toContain("prepareAsrAttempt(input, selectedAudioPath, selectedAudioRepair, selectedTtsRecovery.spokenNarration, 2,");
    expect(source).toContain("normalizeAsrRecoveryNarration(input.canonicalProductName)");
    expect(source).toContain('"tts-repaired.wav"');
    expect(source).toContain("asr-provider${suffix}.json");
    expect(source).toContain("ASR_FAILED_AFTER_REPAIR");
    expect(source).toContain("threshold: 0.82");
    expect(source).toContain("contextAnchorMinimum: 2");
  });
});
