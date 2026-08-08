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
    .sort(
      (left, right) =>
        Number(right.passed) - Number(left.passed) ||
        right.total_score - left.total_score ||
        left.risk_penalty - right.risk_penalty ||
        right.dimensions.hook_strength - left.dimensions.hook_strength ||
        right.dimensions.retention - left.dimensions.retention ||
        left.candidate_id.localeCompare(right.candidate_id)
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
  const explicit = candidate.duplicate_key?.trim();
  if (explicit) return `explicit:${normalize(explicit)}`;
  return [candidate.product_name, candidate.hook, candidate.script]
    .map(normalize)
    .join("|");
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^가-힣a-z0-9]/gu, "");
}
