// Candidate evidence is reusable for a bounded period; a fresh host snapshot
// is still required independently before accepting any command.
export const STUDIO_CANDIDATE_MAX_AGE_MS = 1_800_000;
