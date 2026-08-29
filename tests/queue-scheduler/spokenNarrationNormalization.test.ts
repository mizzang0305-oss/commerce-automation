import { describe, expect, it } from "vitest";
import { inspectNarrationIdentity } from "../../src/lib/video-automation/ttsRecovery";
import { normalizeSpokenNarration, segmentSpokenNarration } from "../../src/lib/video-automation/ttsNormalization";
import { bestKoreanSubstringSimilarity } from "../../src/lib/video-automation/localRuntime";

describe("spoken narration normalization", () => {
  it("normalizes unsupported symbols, units, models, URLs and invisible characters", () => {
    const value = normalizeSpokenNarration("슈브릭\u200B KS4002 1+1 & 20cm/3kg ✅ https://example.com");
    expect(value).toContain("원 플러스 원");
    expect(value).toContain("앤드");
    expect(value).toContain("20 센티미터");
    expect(value).toContain("3 킬로그램");
    expect(value).not.toContain("KS4002");
    expect(value).not.toContain("4002");
    expect(value).not.toContain("\u200B");
    expect(value).not.toContain("https://");
  });
  it("preserves canonical identity, core anchor, and context anchors", () => {
    const spoken = normalizeSpokenNarration("상품명은 슈브릭 멀티 폴딩박스 손잡이형+우드 트렁크 정리함 KS4002입니다. 차량 정리 수납 공간을 확인하세요.");
    const identity = inspectNarrationIdentity("슈브릭 멀티 폴딩박스 손잡이형+우드 트렁크 정리함 KS4002", ["차량", "정리", "수납", "공간", "슈브릭", "멀티"], spoken);
    expect(identity.passed).toBe(true);
    expect(identity.coreAnchorPreserved).toBe(true);
    expect(identity.recognizedAnchors.length).toBeGreaterThanOrEqual(2);
  });
  it("compares repeated bundle notation against the same spoken canonical contract", () => {
    const canonical = "케이블선정리홀더(1+1+1+1+1=5개구성),";
    const spoken = normalizeSpokenNarration(`상품명은 ${canonical}입니다. 책상 정리와 케이블 고정 조건을 확인하세요.`);
    const identity = inspectNarrationIdentity(canonical, ["정리", "책상", "공간", "고정", "케이블"], spoken);
    expect(spoken).toContain("총 5개 구성");
    expect(spoken).not.toMatch(/[+=]/u);
    expect(identity.identitySimilarity).toBe(1);
    expect(identity.passed).toBe(true);
  });
  it("keeps the 0.65 identity gate while comparing ASR to the spoken canonical contract", () => {
    const canonical = "슈브릭 멀티 폴딩박스 손잡이형+우드 캠핑 테이블 상판+전용 방수팩 구성, 트렁크 정리함 KS4002, 블랙";
    const transcript = "슈브립 멀티폴딩박스 손잡이용 플러스 오드캠핑 테이블 상판 플러스 전용 방수팩 고성, 트렁크 정리함, 블랙";
    expect(bestKoreanSubstringSimilarity(normalizeSpokenNarration(canonical), transcript)).toBeGreaterThanOrEqual(0.65);
  });
  it("segments a long product sentence only at punctuation or word boundaries", () => {
    const narration = "슈브릭 멀티 폴딩박스 손잡이형 플러스 우드 캠핑 테이블 상판 플러스 전용 방수팩 구성 트렁크 정리함 블랙 상품은 차량 정리 수납 공간을 위한 긴 상품명입니다.";
    const segments = segmentSpokenNarration(narration, 45);
    expect(segments.length).toBeGreaterThan(1);
    expect(segments.every((segment) => [...segment].length <= 45)).toBe(true);
    expect(segments.join(" ").replace(/\s+/gu, " ")).toBe(normalizeSpokenNarration(narration));
  });
});
