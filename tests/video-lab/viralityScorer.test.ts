import { describe, expect, test } from "vitest";

import { scoreCreativeCandidate } from "@/lib/video-lab/viralityScorer";
import type { CreativeBlocker, CreativeCandidate } from "@/lib/video-lab/types";
import { creativeCandidateFixtures } from "./fixtures/creativeCandidates";

const base = creativeCandidateFixtures[0];
const blockerCases: Array<[Partial<CreativeCandidate>, CreativeBlocker]> = [
  [{ script: "" }, "EMPTY_SCRIPT"],
  [{ hook: "" }, "MISSING_HOOK"],
  [{ disclosure_text: "" }, "MISSING_DISCLOSURE"],
  [{ script: "접이식 빨래건조대는 무조건 100% 냄새를 없앱니다. 건조가 편합니다." }, "EXPLICIT_OVERCLAIM"],
  [{ script: "접이식 빨래건조대는 주방 양념만 이야기합니다.", product_anchors: ["건조"] }, "UNRELATED_SCRIPT"],
  [{ script: "이 도구는 건조 문제를 편하게 줄입니다." }, "PRODUCT_NAME_MISSING"],
  [{ script: `${"접이식 빨래건조대의 건조 장점과 공간 활용 방법을 아주 길게 설명해서 첫 문장이 기준을 넘도록 자세히 이어 갑니다".repeat(2)}. 다음 문장입니다.` }, "FIRST_SENTENCE_TOO_LONG"],
  [{ claims_personal_experience: true, personal_experience_evidence: false }, "UNVERIFIED_PERSONAL_EXPERIENCE"]
];

function withChanges(changes: Partial<CreativeCandidate>): CreativeCandidate {
  return { ...base, candidate_id: "CUSTOM", ...changes };
}

describe("video lab creative scorer", () => {
  test("is deterministic and keeps every score inside 0..100", () => {
    const first = scoreCreativeCandidate(base);
    const second = scoreCreativeCandidate(structuredClone(base));

    expect(first).toEqual(second);
    expect(Object.values(first.dimensions).every((value) => value >= 0 && value <= 100)).toBe(true);
    expect(first.total_score).toBeGreaterThanOrEqual(0);
    expect(first.total_score).toBeLessThanOrEqual(100);
    expect(first.SAFE_TO_UPLOAD).toBe(false);
    expect(first.SAFE_TO_PUBLIC_UPLOAD).toBe(false);
  });

  test.each(blockerCases)("blocks invalid creative %j with %s", (changes, blocker) => {
    const result = scoreCreativeCandidate(withChanges(changes));

    expect(result.passed).toBe(false);
    expect(result.blockers).toContain(blocker);
  });

  test("penalizes repetitive and risky copy without hiding raw dimensions", () => {
    const result = scoreCreativeCandidate(
      withChanges({
        hook: "접이식 빨래건조대 진짜 최고인가요?",
        script: "접이식 빨래건조대 건조 건조 건조 건조 최고 완벽 확실 즉시. 건조 문제를 줄입니다."
      })
    );

    expect(result.dimensions.repetition_risk).toBeGreaterThan(0);
    expect(result.dimensions.overclaim_risk).toBeGreaterThan(0);
    expect(result.risk_penalty).toBeGreaterThan(0);
    expect(result.total_score).toBeLessThan(result.positive_score);
  });
});
