import { describe, expect, test } from "vitest";

import { scoreCreativeCandidate } from "@/lib/video-lab/viralityScorer";
import type { CreativeBlocker, CreativeCandidate } from "@/lib/video-lab/types";
import { creativeCandidateFixtures } from "./fixtures/creativeCandidates";

const base = creativeCandidateFixtures[0];
const blockerCases: Array<[Partial<CreativeCandidate>, CreativeBlocker]> = [
  [{ script: "" }, "EMPTY_SCRIPT"],
  [{ hook: "" }, "MISSING_HOOK"],
  [{ disclosure: "" }, "MISSING_DISCLOSURE"],
  [
    { script: "접이식 빨래건조대는 무조건 100% 냄새를 없앱니다. 건조가 편합니다." },
    "EXPLICIT_OVERCLAIM"
  ],
  [
    {
      script: "접이식 빨래건조대는 주방 양념만 이야기합니다.",
      productAnchors: ["건조"]
    },
    "UNRELATED_SCRIPT"
  ],
  [{ script: "이 도구는 건조 문제를 편하게 줄입니다." }, "PRODUCT_NAME_MISSING"],
  [
    {
      script: `${"접이식 빨래건조대의 건조 장점과 공간 활용 방법을 아주 길게 설명해서 첫 문장이 기준을 넘도록 자세히 이어 갑니다".repeat(2)}. 다음 문장입니다.`
    },
    "FIRST_SENTENCE_TOO_LONG"
  ],
  [
    { claimsPersonalExperience: true, personalExperienceEvidence: false },
    "FAKE_PERSONAL_EXPERIENCE_CLAIM"
  ]
];

function withChanges(changes: Partial<CreativeCandidate>): CreativeCandidate {
  return { ...base, id: "CUSTOM", ...changes };
}

describe("video lab creative scorer", () => {
  test("is deterministic and keeps every score inside 0..100", () => {
    const first = scoreCreativeCandidate(base);
    const second = scoreCreativeCandidate(structuredClone(base));

    expect(first).toEqual(second);
    expect(Object.values(first.breakdown).every((value) => value >= 0 && value <= 100)).toBe(true);
    expect(first.totalScore).toBeGreaterThanOrEqual(0);
    expect(first.totalScore).toBeLessThanOrEqual(100);
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

    expect(result.breakdown.repetitionRisk).toBeGreaterThan(0);
    expect(result.breakdown.overclaimRisk).toBeGreaterThan(0);
    expect(result.riskPenalty).toBeGreaterThan(0);
    expect(result.totalScore).toBeLessThan(result.positiveScore);
  });

  test("scores a strong hook above a weak hook", () => {
    const strong = scoreCreativeCandidate(base);
    const weak = scoreCreativeCandidate(withChanges({ hook: "접이식 빨래건조대 안내", id: "WEAK" }));

    expect(strong.breakdown.hook).toBeGreaterThan(weak.breakdown.hook);
    expect(strong.totalScore).toBeGreaterThan(weak.totalScore);
  });

  test("rewards explicit customer problem and benefit language", () => {
    const informative = scoreCreativeCandidate(base);
    const flat = scoreCreativeCandidate(
      withChanges({
        id: "FLAT",
        script: "접이식 빨래건조대, 건조 제품을 소개합니다. 제품 정보를 확인하세요."
      })
    );

    expect(informative.breakdown.problem).toBeGreaterThan(flat.breakdown.problem);
    expect(informative.breakdown.benefit).toBeGreaterThan(flat.breakdown.benefit);
    expect(informative.totalScore).toBeGreaterThan(flat.totalScore);
  });

  test("fails closed for malformed runtime input", () => {
    const result = scoreCreativeCandidate(null as unknown as CreativeCandidate);

    expect(result.passed).toBe(false);
    expect(result.blockers).toContain("EMPTY_SCRIPT");
    expect(result.blockers).toContain("MISSING_HOOK");
    expect(result.candidateId).toBe("INVALID_CANDIDATE");
  });
});
