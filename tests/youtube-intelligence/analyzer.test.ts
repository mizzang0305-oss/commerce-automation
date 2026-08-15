import { describe, expect, it } from "vitest";

import {
  analyzeCreativeEvidence,
  analyzeYouTubeFixtureInputs,
  buildSyntheticYouTubeFixtures,
  extractCta,
  extractHook,
} from "../../src/lib/video-lab/youtube-intelligence";

describe("deterministic creative evidence", () => {
  const fixtures = buildSyntheticYouTubeFixtures();

  it("ships ten original synthetic fixtures covering requested hook and CTA shapes", () => {
    expect(fixtures).toHaveLength(10);
    expect(new Set(fixtures.map((item) => item.snapshot.videoId)).size).toBe(10);
    expect(fixtures.every((item) => item.snapshot.provenance.repository === "synthetic_fixture")).toBe(true);
  });

  it("extracts question, problem, benefit, warning, list, before-after, demo, and unknown hooks", () => {
    expect(fixtures.map((item) => extractHook(item.transcript).family)).toEqual([
      "question",
      "problem",
      "benefit",
      "warning",
      "number_list",
      "before_after",
      "demonstration",
      "unknown",
      "question",
      "question",
    ]);
    expect(extractHook(fixtures[0]!.transcript).timingBucket).toBe("first_1s");
  });

  it("classifies early and late CTA timing and preserves no-CTA evidence", () => {
    expect(extractCta(fixtures[8]!.transcript, 60)?.timing).toBe("early");
    expect(extractCta(fixtures[9]!.transcript, 60)?.timing).toBe("late");
    expect(extractCta(fixtures[7]!.transcript, 60)).toBeUndefined();
  });

  it("builds structured evidence with provenance, claims, densities, and false reuse rights", () => {
    const evidence = analyzeCreativeEvidence(fixtures[0]!);
    expect(evidence.structure.map((item) => item.section)).toEqual(
      expect.arrayContaining(["HOOK", "PROBLEM", "DEMONSTRATION", "CTA"]),
    );
    expect(evidence.problemStatement).toBeTruthy();
    expect(evidence.demonstration).toBeTruthy();
    expect(evidence.captionDensityCharsPerSecond).toBeGreaterThan(0);
    expect(evidence.sourceRefs).toEqual([{ startSeconds: 0, endSeconds: 31 }]);
    expect(evidence.provenance.sourceFingerprint).toHaveLength(64);
    expect(evidence.rawMediaReuseAllowed).toBe(false);
  });
});

describe("fixture-only engine", () => {
  it("deduplicates by videoId and records zero live/provider calls", () => {
    const fixtures = buildSyntheticYouTubeFixtures();
    const result = analyzeYouTubeFixtureInputs([...fixtures, fixtures[0]!], {
      runId: "synthetic-v1",
      startedAt: "2026-08-16T00:00:00.000Z",
      finishedAt: "2026-08-16T00:00:01.500Z",
    });

    expect(result.sources).toHaveLength(10);
    expect(result.evidence).toHaveLength(10);
    expect(result.run).toMatchObject({
      inputVideoCount: 11,
      normalizedVideoCount: 10,
      duplicateCount: 1,
      transcriptSuccessCount: 10,
      transcriptFailureCount: 0,
      metadataCalls: 0,
      transcriptCalls: 0,
      modelCalls: 0,
      visionCalls: 0,
      elapsedMs: 1_500,
      safeErrorCount: 0,
    });
    expect(result.run.patternCount).toBe(result.patterns.length);
    expect(new Set(result.evidence.map((item) => item.evidenceId)).size).toBe(10);
  });

  it("isolates a malformed source binding and records only a sanitized error code", () => {
    const fixtures = buildSyntheticYouTubeFixtures();
    const broken = {
      ...fixtures[0]!,
      transcript: { ...fixtures[0]!.transcript, sourceId: "mismatch" },
    };
    const result = analyzeYouTubeFixtureInputs([broken, fixtures[1]!], {
      runId: "safe-error",
      startedAt: "2026-08-16T00:00:00.000Z",
      finishedAt: "2026-08-16T00:00:00.000Z",
    });

    expect(result.evidence).toHaveLength(1);
    expect(result.run.transcriptFailureCount).toBe(1);
    expect(result.run.safeErrors).toEqual(["YOUTUBE_SOURCE_BINDING_MISMATCH"]);
    expect(JSON.stringify(result.run)).not.toContain(fixtures[0]!.transcript.segments[0]!.text);
  });
});
