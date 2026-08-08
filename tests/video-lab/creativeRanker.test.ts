import { describe, expect, test } from "vitest";

import { rankCreativeCandidates } from "@/lib/video-lab/creativeRanker";
import { creativeCandidateFixtures } from "./fixtures/creativeCandidates";

describe("video lab creative ranker", () => {
  test("ranks all 24 fixtures deterministically with blocked candidates after passing candidates", () => {
    expect(creativeCandidateFixtures).toHaveLength(24);
    const first = rankCreativeCandidates(creativeCandidateFixtures);
    const second = rankCreativeCandidates(structuredClone(creativeCandidateFixtures));

    expect(first).toEqual(second);
    expect(first.map((item) => item.rank)).toEqual(Array.from({ length: 24 }, (_, index) => index + 1));
    const firstBlocked = first.findIndex((item) => !item.passed);
    expect(firstBlocked).toBeGreaterThan(0);
    expect(first.slice(0, firstBlocked).every((item) => item.passed)).toBe(true);
    expect(first.slice(firstBlocked).every((item) => !item.passed)).toBe(true);
  });

  test("blocks the later duplicate while preserving the first candidate", () => {
    const duplicate = {
      ...creativeCandidateFixtures[0],
      candidate_id: "LAB_DUPLICATE"
    };
    const ranked = rankCreativeCandidates([creativeCandidateFixtures[0], duplicate]);
    const original = ranked.find((item) => item.candidate_id === "LAB_01");
    const repeated = ranked.find((item) => item.candidate_id === "LAB_DUPLICATE");

    expect(original?.blockers).not.toContain("DUPLICATE_CANDIDATE");
    expect(repeated?.passed).toBe(false);
    expect(repeated?.blockers).toContain("DUPLICATE_CANDIDATE");
  });
});
