import type { CreativeCandidate, CreativeScoreResult, RankedCreative } from "./types";
import { scoreCreativeCandidate } from "./viralityScorer";

export function rankCreativeCandidates(candidates: readonly CreativeCandidate[]): RankedCreative[] {
  const seen = new Set<string>();
  const scored = candidates.map((candidate) => {
    const score = scoreCreativeCandidate(candidate);
    const key = dedupeKey(candidate);
    if (seen.has(key)) return blockDuplicate(score);
    seen.add(key);
    return score;
  });

  return scored
    .map((score, index) => ({ candidate: candidates[index], score }))
    .sort(
      (left, right) =>
        Number(right.score.passed) - Number(left.score.passed) ||
        right.score.totalScore - left.score.totalScore ||
        left.score.riskPenalty - right.score.riskPenalty ||
        right.score.breakdown.hook - left.score.breakdown.hook ||
        right.score.breakdown.retention - left.score.breakdown.retention ||
        left.candidate.id.localeCompare(right.candidate.id)
    )
    .map((result, index) => ({ ...result, rank: index + 1 }));
}

function blockDuplicate(score: CreativeScoreResult): CreativeScoreResult {
  return {
    ...score,
    passed: false,
    blockers: [...new Set([...score.blockers, "DUPLICATE_CANDIDATE" as const])]
  };
}

function dedupeKey(candidate: CreativeCandidate): string {
  const explicit = candidate.duplicateKey?.trim();
  if (explicit) return `explicit:${normalize(explicit)}`;
  return [candidate.productName, candidate.hook, candidate.script]
    .map(normalize)
    .join("|");
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^가-힣a-z0-9]/gu, "");
}
