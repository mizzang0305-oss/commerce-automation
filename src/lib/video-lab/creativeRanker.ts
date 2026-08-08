import { parseCreativeCandidate } from "./creativeCandidateParser";
import type { CreativeCandidate, CreativeScoreResult, RankedCreative } from "./types";
import { scoreCreativeCandidate } from "./viralityScorer";

export function rankCreativeCandidates(candidates: readonly unknown[]): RankedCreative[] {
  const seen = new Set<string>();
  const normalizedCandidates = candidates.map((candidate, index) =>
    parseCreativeCandidate(candidate, `INVALID_CANDIDATE_${String(index + 1).padStart(2, "0")}`).candidate
  );
  const scored = candidates.map((candidate, index) => {
    const score = scoreCreativeCandidate(candidate);
    if (score.blockers.includes("INVALID_CANDIDATE_INPUT")) return score;
    const key = dedupeKey(normalizedCandidates[index]);
    if (seen.has(key)) return blockDuplicate(score);
    seen.add(key);
    return score;
  });

  return scored
    .map((score, index) => ({ candidate: normalizedCandidates[index], score }))
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
  return typeof value === "string" ? value.toLowerCase().replace(/[^가-힣a-z0-9]/gu, "") : "";
}
