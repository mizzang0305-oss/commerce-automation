import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("bounded ASR recovery contract", () => {
  it("uses at most two fresh TTS/ASR attempts and fails closed to product fallback", async () => {
    const source = await readFile("scripts/video-automation/run-autonomous-video-review-v2.ts", "utf8");
    expect(source).toContain("attempt <= 2");
    expect(source).toContain("tts${suffix}-repaired.wav");
    expect(source).toContain("asr-provider${suffix}.json");
    expect(source).toContain("ASR_FAILED_AFTER_REPAIR");
    expect(source).toContain("threshold: 0.82");
    expect(source).toContain("contextAnchorMinimum: 2");
  });
});
