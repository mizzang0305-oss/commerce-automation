import { describe, expect, test } from "vitest";

import { rankCreativeCandidates } from "@/lib/video-lab/creativeRanker";
import { scoreCreativeCandidate } from "@/lib/video-lab/viralityScorer";
import type { CreativeScoreDimension } from "@/lib/video-lab/types";
import { creativeCandidateFixtures } from "./fixtures/creativeCandidates";

const POSITIVE_DIMENSIONS: CreativeScoreDimension[] = [
  "hook",
  "curiosity",
  "problem",
  "benefit",
  "purchaseIntent",
  "retention",
  "clarity"
];

describe("video lab creative ranker", () => {
  test("ranks all 24 fixtures deterministically with blocked candidates after passing candidates", () => {
    expect(creativeCandidateFixtures).toHaveLength(24);
    const first = rankCreativeCandidates(creativeCandidateFixtures);
    const second = rankCreativeCandidates(structuredClone(creativeCandidateFixtures));

    expect(first).toEqual(second);
    expect(first.map((item) => item.rank)).toEqual(Array.from({ length: 24 }, (_, index) => index + 1));
    const firstBlocked = first.findIndex((item) => !item.score.passed);
    expect(firstBlocked).toBeGreaterThan(0);
    expect(first.slice(0, firstBlocked).every((item) => item.score.passed)).toBe(true);
    expect(first.slice(firstBlocked).every((item) => !item.score.passed)).toBe(true);
    expect(first[0].score.blockers).toEqual([]);
  });

  test("blocks the later duplicate while preserving the first candidate", () => {
    const duplicate = {
      ...creativeCandidateFixtures[0],
      id: "LAB_DUPLICATE"
    };
    const ranked = rankCreativeCandidates([creativeCandidateFixtures[0], duplicate]);
    const original = ranked.find((item) => item.candidate.id === "LAB_01");
    const repeated = ranked.find((item) => item.candidate.id === "LAB_DUPLICATE");

    expect(original?.score.blockers).not.toContain("DUPLICATE_CANDIDATE");
    expect(repeated?.score.passed).toBe(false);
    expect(repeated?.score.blockers).toContain("DUPLICATE_CANDIDATE");
  });

  test("binds every fixture to an expected outcome, score range, strongest factor, and blocker", () => {
    for (const fixture of creativeCandidateFixtures) {
      const result = scoreCreativeCandidate(fixture);
      const [minimum, maximum] = fixture.expected.scoreRange;
      const strongestValue = Math.max(
        ...POSITIVE_DIMENSIONS.map((dimension) => result.breakdown[dimension])
      );

      expect(result.passed).toBe(fixture.expected.outcome === "PASS");
      expect(result.totalScore).toBeGreaterThanOrEqual(minimum);
      expect(result.totalScore).toBeLessThanOrEqual(maximum);
      expect(result.breakdown[fixture.expected.strongestFactor]).toBe(strongestValue);
      if (fixture.expected.blocker) {
        expect(result.blockers).toContain(fixture.expected.blocker);
      }
    }
  });

  test("ranks malformed candidates without throwing and keeps them blocked", () => {
    const malformed: unknown[] = [null, 1, [], { ...creativeCandidateFixtures[0], hook: null }];
    expect(() => rankCreativeCandidates(malformed)).not.toThrow();
    const ranked = rankCreativeCandidates(malformed);
    expect(ranked).toHaveLength(malformed.length);
    expect(ranked.every((item) => item.score.blockers.includes("INVALID_CANDIDATE_INPUT"))).toBe(true);
  });
});
