import { describe, expect, test } from "vitest";
import { buildPopGroupCaptions, requireNarrationIntentAlignment, restoreKnownCaptionTokens, splitOverlongPunctuationToken } from "@/lib/video-automation/captionIntegration";

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
  test("splits a punctuation-fused long alignment token without changing its words", () => {
    const words = splitOverlongPunctuationToken([{ word: "행거,입니다.", start: 7.1, end: 9.54, confidence: 0.9 }]);
    expect(words.map((word) => word.word).join("")).toBe("행거,입니다.");
    expect(words.every((word) => word.end - word.start <= 2.4)).toBe(true);
    expect(words[0].end).toBe(words[1].start);
  });
  test("does not split a long word without a real punctuation boundary", () => {
    expect(() => splitOverlongPunctuationToken([{ word: "긴정렬오류", start: 0, end: 3, confidence: null }])).toThrow("CAPTION_ALIGNMENT_TOKEN_TOO_LONG");
  });
  test("rejects ASR-like typo instead of promoting it into caption text", () => {
    const alignment = [{ word: "접이씨", start: 0, end: 0.4, confidence: 0.8 }];
    expect(() => requireNarrationIntentAlignment("접이식", alignment)).toThrow("CAPTION_ALIGNMENT_INTENT_MISMATCH");
  });
  test("accepts aligned canonical display text while ignoring punctuation-only drift", () => {
    const alignment = [
      { word: "EasyBuy", start: 0, end: 0.3, confidence: 0.8 },
      { word: "접이식", start: 0.4, end: 0.8, confidence: 0.8 }
    ];
    expect(requireNarrationIntentAlignment("EasyBuy, 접이식.", alignment)).toEqual(alignment);
  });
});
