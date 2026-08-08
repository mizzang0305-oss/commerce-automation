import { pathToFileURL } from "node:url";

import { CREATIVE_SCORE_CONFIG } from "../../src/lib/video-lab/creativeScoreConfig";
import { scoreCreativeCandidate } from "../../src/lib/video-lab/viralityScorer";
import {
  calibrationCandidates,
  type HumanCreativeLabel
} from "../../tests/video-lab/fixtures/calibrationCandidates";

const LABEL_RANK: Record<HumanCreativeLabel, number> = {
  GOOD: 3,
  BORDERLINE: 2,
  BAD: 1,
  BLOCK: 0
};

export function calculateCalibrationMetrics() {
  const observations = calibrationCandidates.map((fixture) => ({
    ...fixture,
    score: scoreCreativeCandidate(fixture.candidate)
  }));
  const scores = observations.map((item) => item.score.totalScore).sort((a, b) => a - b);
  const distribution = Object.fromEntries(
    (["GOOD", "BORDERLINE", "BAD", "BLOCK"] as const).map((label) => [
      label,
      observations.filter((item) => item.humanLabel === label).length
    ])
  ) as Record<HumanCreativeLabel, number>;
  const topTier = [...observations]
    .sort((left, right) => right.score.totalScore - left.score.totalScore)
    .slice(0, Math.ceil(observations.length * 0.25));
  const badOrBlock = observations.filter((item) => ["BAD", "BLOCK"].includes(item.humanLabel));
  const good = observations.filter((item) => item.humanLabel === "GOOD");
  const block = observations.filter((item) => item.humanLabel === "BLOCK");
  const pairComparisons = observations.flatMap((left, leftIndex) =>
    observations.slice(leftIndex + 1).flatMap((right) => {
      if (left.pairGroup !== right.pairGroup || left.humanLabel === right.humanLabel) return [];
      const expected = Math.sign(LABEL_RANK[left.humanLabel] - LABEL_RANK[right.humanLabel]);
      const actual = Math.sign(left.score.totalScore - right.score.totalScore);
      return [{ agreed: expected === actual }];
    })
  );
  const badBlockFalsePositives = badOrBlock.filter((item) => item.score.passed).length;
  const goodFalseNegatives = good.filter((item) => !item.score.passed).length;
  const pairwiseRankingAgreement = ratio(
    pairComparisons.filter((item) => item.agreed).length,
    pairComparisons.length
  );
  const currentThresholdIsDefensible =
    ratio(badBlockFalsePositives, badOrBlock.length) <= 0.1 &&
    ratio(goodFalseNegatives, good.length) <= 0.2 &&
    pairwiseRankingAgreement >= 0.75;

  return {
    version: CREATIVE_SCORE_CONFIG.version,
    sampleCount: observations.length,
    labelDistribution: distribution,
    passRate: ratio(observations.filter((item) => item.score.passed).length, observations.length),
    scoreSummary: {
      min: scores[0],
      max: scores[scores.length - 1],
      median: quantile(scores, 0.5),
      p25: quantile(scores, 0.25),
      p75: quantile(scores, 0.75)
    },
    topTierPrecision: ratio(
      topTier.filter((item) => ["GOOD", "BORDERLINE"].includes(item.humanLabel)).length,
      topTier.length
    ),
    badBlockFalsePositive: {
      count: badBlockFalsePositives,
      rate: ratio(badBlockFalsePositives, badOrBlock.length)
    },
    goodFalseNegative: {
      count: goodFalseNegatives,
      rate: ratio(goodFalseNegatives, good.length)
    },
    hardBlockerAgreement: ratio(
      block.filter((item) => item.score.blockers.length > 0).length,
      block.length
    ),
    pairwiseRankingAgreement,
    averageScoresByLabel: Object.fromEntries(
      (Object.keys(distribution) as HumanCreativeLabel[]).map((label) => {
        const values = observations
          .filter((item) => item.humanLabel === label)
          .map((item) => item.score.totalScore);
        return [label, round2(values.reduce((sum, value) => sum + value, 0) / values.length)];
      })
    ),
    thresholdRecommendation: currentThresholdIsDefensible
      ? `KEEP_${CREATIVE_SCORE_CONFIG.passingScore}`
      : "PROPOSE_55_FOR_OWNER_REVIEW",
    thresholdAutomaticallyChanged: false,
    safety: { SAFE_TO_UPLOAD: false, SAFE_TO_PUBLIC_UPLOAD: false }
  };
}

function quantile(sorted: readonly number[], percentile: number): number {
  const index = (sorted.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return round2(sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower));
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : round2(numerator / denominator);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${JSON.stringify(calculateCalibrationMetrics(), null, 2)}\n`);
}
