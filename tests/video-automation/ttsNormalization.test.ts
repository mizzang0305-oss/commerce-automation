import { describe, expect, test } from "vitest";
import { buildKoreanProductNarration, buildKoreanProductNarrationPlan, normalizeKoreanTtsPronunciation, restoreCanonicalDisplayNarration } from "@/lib/video-automation/ttsNormalization";

describe("Korean TTS normalization", () => {
  test("states the canonical product name as a separate identity sentence", () => {
    const narration = buildKoreanProductNarration({ canonicalProductName: "특가 케이블 정리함", hook: "케이블 정리 조건 확인", script: "책상과 고정 방식을 확인하세요." });
    expect(narration).toBe("상품명은 특가 케이블 정리함입니다. 케이블 정리 조건 확인 책상과 고정 방식을 확인하세요.");
  });
  test("adds deterministic spacing for a Korean loanword core anchor", () => {
    expect(normalizeKoreanTtsPronunciation("컵홀더, 왜 3가지를 확인할까요?")).toBe("컵 홀더, 왜 세 가지를 확인할까요?");
  });
  test("keeps canonical metadata separate from pronunciation-only EasyBuy alias", () => {
    const plan = buildKoreanProductNarrationPlan({ canonicalProductName: "EasyBuy 슬랩 타입 분리수납함", hook: "수납 확인", script: "EasyBuy 슬랩 타입 분리수납함을 확인하세요." });
    expect(plan.canonicalProductName).toBe("EasyBuy 슬랩 타입 분리수납함");
    expect(plan.pronunciationProductName).toBe("이지바이 슬랩, 타입 분리 수납함");
    expect(plan.narration).toContain("이지바이 슬랩, 타입 분리 수납함");
    expect(plan.narration).not.toContain("EasyBuy");
  });
  test("preserves the exact Korean terms with pronunciation pauses", () => {
    const plan = buildKoreanProductNarrationPlan({ canonicalProductName: "접이식 행거 스테인리스", hook: "정리", script: "접이식 행거 스테인리스를 확인하세요." });
    expect(plan.canonicalProductName).toBe("접이식 행거 스테인리스");
    expect(plan.pronunciationProductName).toBe("접이식, 행거, 스테인리스");
  });
  test("never inserts a pronunciation pause between a product name and its following particle", () => {
    const plan = buildKoreanProductNarrationPlan({ canonicalProductName: "접이식 행거", hook: "정리", script: "접이식 행거를 확인하세요." });
    expect(plan.narration).not.toMatch(/[,，](?:입니다|을|를|으로|로)/u);
  });
  test("repairs product-bound Korean particles in narration without changing canonical metadata", () => {
    const name = "휴대용 빨래건조대";
    const plan = buildKoreanProductNarrationPlan({ canonicalProductName: name, hook: "정리", script: `${name}으로 확인하고 ${name}을 고르세요.` });
    expect(plan.narration).toContain(`${name}로 확인하고 ${name}를 고르세요.`);
    expect(plan.canonicalProductName).toBe(name);
  });
  test("restores the canonical visible name without leaking a speech-only alias", () => {
    const visible = restoreCanonicalDisplayNarration("상품명은 이지바이 슬랩, 타입 분리 수납함입니다.", "EasyBuy 슬랩 타입 분리수납함", "이지바이 슬랩, 타입 분리 수납함");
    expect(visible).toBe("상품명은 EasyBuy 슬랩 타입 분리수납함입니다.");
    expect(() => restoreCanonicalDisplayNarration("무관한 대본", "EasyBuy", "이지바이")).toThrow("CAPTION_NARRATION_PRODUCT_IDENTITY_MISSING");
  });
});
