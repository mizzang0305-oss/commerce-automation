import { describe, expect, test } from "vitest";
import { buildPopGroupCaptions, restoreKnownCaptionTokens } from "@/lib/video-automation/captionIntegration";

describe("caption integration", () => {
  test("builds monotonic POP_GROUP cues with word arrays", () => {
    const cues = buildPopGroupCaptions([
      { word: "케이블", start: 0, end: 0.3, confidence: 0.9 },
      { word: "정리를", start: 0.31, end: 0.65, confidence: 0.9 },
      { word: "간편하게", start: 0.66, end: 1.05, confidence: 0.9 },
      { word: "시작하세요", start: 1.06, end: 1.5, confidence: 0.9 }
    ]);
    expect(cues.every((cue, index) => cue.start >= (cues[index - 1]?.end ?? 0) && cue.words.length <= 4 && cue.text.length <= 18)).toBe(true);
  });
  test("splits five short Korean words instead of failing the four-word contract", () => {
    const words = ["이", "제품", "정리", "공간", "확인"].map((word, index) => ({ word, start: index * 0.2, end: index * 0.2 + 0.19, confidence: 0.9 }));
    const cues = buildPopGroupCaptions(words);
    expect(cues.map((cue) => cue.words.length)).toEqual([3, 2]);
    expect(cues.every((cue) => cue.words.length >= 2)).toBe(true);
  });
  test("restores a one-character WhisperX miss for a known product token", () => {
    expect(restoreKnownCaptionTokens([{ word: "티가", start: 0, end: 0.2, confidence: 0.9 }], ["특가 케이블 정리함"])[0].word).toBe("특가");
  });
});
