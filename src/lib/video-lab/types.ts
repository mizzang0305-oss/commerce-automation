export const VIDEO_LAB_FLAGS = Object.freeze({
  VIDEO_LAB_ENABLED: false,
  VIDEO_LAB_VIRALITY_SCORER: true,
  VIDEO_LAB_WHISPERX: false,
  VIDEO_LAB_REMOTION: false,
  VIDEO_LAB_LATENTSYNC: false,
  SAFE_TO_UPLOAD: false,
  SAFE_TO_PUBLIC_UPLOAD: false
} as const);

export type CreativeScoreDimension =
  | "hook"
  | "curiosity"
  | "problem"
  | "benefit"
  | "purchaseIntent"
  | "retention"
  | "clarity"
  | "overclaimRisk"
  | "repetitionRisk";

export type CreativeBlocker =
  | "EMPTY_SCRIPT"
  | "MISSING_HOOK"
  | "MISSING_DISCLOSURE"
  | "EXPLICIT_OVERCLAIM"
  | "UNRELATED_SCRIPT"
  | "PRODUCT_NAME_MISSING"
  | "FIRST_SENTENCE_TOO_LONG"
  | "DUPLICATE_CANDIDATE"
  | "FAKE_PERSONAL_EXPERIENCE_CLAIM";

export interface CreativeCandidate {
  id: string;
  productName: string;
  productCategory?: string;
  angle: string;
  hook: string;
  script: string;
  cta?: string;
  disclosure?: string;
  productAnchors?: string[];
  disclosureRequired?: boolean;
  duplicateKey?: string | null;
  claimsPersonalExperience?: boolean;
  personalExperienceEvidence?: boolean;
}

export interface CreativeScoreBreakdown {
  hook: number;
  curiosity: number;
  problem: number;
  benefit: number;
  purchaseIntent: number;
  retention: number;
  clarity: number;
  overclaimRisk: number;
  repetitionRisk: number;
}

export interface CreativeScoreResult {
  version: "video-lab-creative-score-v1";
  candidateId: string;
  totalScore: number;
  positiveScore: number;
  riskPenalty: number;
  breakdown: CreativeScoreBreakdown;
  strengths: string[];
  weaknesses: string[];
  blockers: CreativeBlocker[];
  passed: boolean;
  SAFE_TO_UPLOAD: false;
  SAFE_TO_PUBLIC_UPLOAD: false;
}

export interface RankedCreative {
  candidate: CreativeCandidate;
  score: CreativeScoreResult;
  rank: number;
}
