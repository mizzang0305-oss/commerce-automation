import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  JsonYouTubeIntelligenceStore,
  aggregateCreativePatterns,
  analyzeCreativeEvidence,
  analyzeYouTubeFixtureInputs,
  buildSyntheticYouTubeFixtures,
  buildYouTubeCreativeResearchContext,
} from "../../src/lib/video-lab/youtube-intelligence";

describe("pattern aggregation and channel concentration", () => {
  it("caps same-channel contributions and withholds trend eligibility below channel diversity", () => {
    const fixtures = buildSyntheticYouTubeFixtures();
    const evidence = [0, 3].map((index) => analyzeCreativeEvidence(fixtures[index]!));
    const patterns = aggregateCreativePatterns(evidence, {
      maxContributionPerChannel: 1,
      minimumDistinctChannels: 2,
    });
    const captionPattern = patterns.find((item) => item.type === "caption_pattern");
    expect(captionPattern).toMatchObject({
      sourceCount: 1,
      channelCount: 1,
      eligibleForTrendUse: false,
      maxContributionPerChannel: 1,
      minimumDistinctChannels: 2,
    });
    expect(captionPattern!.confidence).toBeLessThanOrEqual(0.5);
  });

  it("accumulates cross-channel support with first/last seen and supporting IDs", () => {
    const result = analyzeYouTubeFixtureInputs(buildSyntheticYouTubeFixtures(), {
      runId: "aggregate",
      startedAt: "2026-08-16T00:00:00.000Z",
      finishedAt: "2026-08-16T00:00:00.000Z",
    });
    const eligible = result.patterns.filter((item) => item.eligibleForTrendUse);
    expect(eligible.length).toBeGreaterThan(0);
    expect(eligible.every((item) => item.channelCount >= 2)).toBe(true);
    expect(eligible.every((item) => item.firstSeen <= item.lastSeen)).toBe(true);
    expect(eligible.every((item) => item.supportingVideoIds.length === item.sourceCount)).toBe(true);
  });
});

describe("local derived-data lifecycle", () => {
  it("stores normalized indexes without transcript text and keeps performance separate", async () => {
    const [fixture] = buildSyntheticYouTubeFixtures();
    const evidence = analyzeCreativeEvidence(fixture!);
    const root = await mkdtemp(path.join(os.tmpdir(), "ytci-store-"));
    const store = new JsonYouTubeIntelligenceStore(root);

    const normalizedPath = await store.saveNormalizedIndex(fixture!.snapshot, fixture!.transcript);
    const derivedPath = await store.saveDerivedEvidence(evidence);
    const normalized = await readFile(normalizedPath, "utf8");
    const derived = await readFile(derivedPath, "utf8");

    expect(normalized).toContain(fixture!.transcript.transcriptFingerprint);
    expect(normalized).toContain('"textRetained": false');
    expect(normalized).not.toContain(fixture!.transcript.segments[0]!.text);
    expect(derived).toContain('"rawMediaReuseAllowed": false');
    expect(derivedPath).toContain(`${path.sep}derived${path.sep}`);
  });

  it("builds a typed research-only commerce context without production ranking authority", () => {
    const evidence = buildSyntheticYouTubeFixtures().slice(0, 3).map(analyzeCreativeEvidence);
    const context = buildYouTubeCreativeResearchContext(evidence, {
      productId: "opaque-product-1",
      category: "organizer",
      useCases: ["정리"],
      benefitTerms: ["절약"],
    });
    expect(context.supportingVideoIds.length).toBeGreaterThan(0);
    expect(context).toMatchObject({
      researchOnly: true,
      productionRankingMutationAllowed: false,
      rawMediaReuseAllowed: false,
    });
  });
});
