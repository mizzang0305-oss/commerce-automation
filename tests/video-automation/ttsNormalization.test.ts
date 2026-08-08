import { describe, expect, test } from "vitest";
import { buildKoreanProductNarration, normalizeKoreanTtsPronunciation } from "@/lib/video-automation/ttsNormalization";

describe("Korean TTS normalization", () => {
  test("states the canonical product name as a separate identity sentence", () => {
    const narration = buildKoreanProductNarration({ canonicalProductName: "특가 케이블 정리함", hook: "케이블 정리 조건 확인", script: "책상과 고정 방식을 확인하세요." });
    expect(narration).toBe("상품명은 특가 케이블 정리함입니다. 케이블 정리 조건 확인 책상과 고정 방식을 확인하세요.");
  });
  test("adds deterministic spacing for a Korean loanword core anchor", () => {
    expect(normalizeKoreanTtsPronunciation("컵홀더, 왜 3가지를 확인할까요?")).toBe("컵 홀더, 왜 세 가지를 확인할까요?");
  });
});
