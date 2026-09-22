import { createHash } from "node:crypto";
import { rankCreativeCandidates } from "../video-lab/creativeRanker";
import type { CreativeCandidate } from "../video-lab/types";
import type { CreativeSelectionArtifact } from "./types";

export function selectTopPassingCreative(productKey: string, candidates: readonly CreativeCandidate[]): CreativeSelectionArtifact {
  if (candidates.length !== 3) throw new Error("VIDEO_AUTOMATION_EXACTLY_THREE_CANDIDATES_REQUIRED");
  const ranked = rankCreativeCandidates(candidates);
  const selected = ranked.find((entry) => entry.rank === 1 && entry.score.passed) ?? null;
  return {
    productKey,
    scorerVersion: "video-lab-creative-score-v2",
    passingScore: 50,
    candidates: ranked.map((entry) => ({
      ...entry,
      candidateHash: createHash("sha256").update(JSON.stringify(entry.candidate)).digest("hex"),
      selected: entry.candidate.id === selected?.candidate.id
    })),
    selectedCandidateId: selected?.candidate.id ?? null,
    selectionReason: selected ? { rank: 1, score: selected.score.totalScore } : null,
    manual_review_required: !selected,
    SAFE_TO_UPLOAD: false
  };
}
