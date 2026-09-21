import { describe, expect, test } from "vitest";

import { calculateCalibrationMetrics } from "../../scripts/video-lab/calibrate-scorer";
import { calibrationCandidates } from "./fixtures/calibrationCandidates";

describe("video lab creative scorer calibration", () => {
  test("uses an independently labelled, balanced commerce set", () => {
    expect(calibrationCandidates).toHaveLength(40);
    expect(new Set(calibrationCandidates.map((item) => item.pairGroup)).size).toBe(10);
    const counts = Object.groupBy(calibrationCandidates, (item) => item.humanLabel);
    expect(counts.GOOD).toHaveLength(10);
    expect(counts.BORDERLINE).toHaveLength(10);
    expect(counts.BAD).toHaveLength(10);
    expect(counts.BLOCK).toHaveLength(10);
  });

  test("reports owner-review metrics without changing the configured threshold", () => {
    const metrics = calculateCalibrationMetrics();
    expect(metrics.sampleCount).toBe(40);
    expect(metrics.thresholdAutomaticallyChanged).toBe(false);
    expect(metrics.thresholdRecommendation).toMatch(/^(KEEP_50|PROPOSE_55_FOR_OWNER_REVIEW)$/u);
    expect(metrics.topTierPrecision).toBeGreaterThanOrEqual(0);
    expect(metrics.pairwiseRankingAgreement).toBeGreaterThanOrEqual(0);
  });
});
