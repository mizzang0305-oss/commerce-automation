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
  | "hook_strength"
  | "curiosity"
  | "problem_clarity"
  | "benefit_specificity"
  | "purchase_intent"
  | "retention"
  | "clarity"
  | "overclaim_risk"
  | "repetition_risk";

export type CreativeBlocker =
  | "EMPTY_SCRIPT"
  | "MISSING_HOOK"
  | "MISSING_DISCLOSURE"
  | "EXPLICIT_OVERCLAIM"
  | "UNRELATED_SCRIPT"
  | "PRODUCT_NAME_MISSING"
  | "FIRST_SENTENCE_TOO_LONG"
  | "DUPLICATE_CANDIDATE"
  | "UNVERIFIED_PERSONAL_EXPERIENCE";

export type CreativeCandidate = {
  candidate_id: string;
  product_name: string;
  hook: string;
  script: string;
  disclosure_required: boolean;
  disclosure_text?: string | null;
  product_anchors?: string[];
  duplicate_key?: string | null;
  claims_personal_experience?: boolean;
  personal_experience_evidence?: boolean;
};

export type CreativeScoreBreakdown = Record<CreativeScoreDimension, number>;

export type CreativeScoreResult = {
  version: "video-lab-creative-score-v1";
  candidate_id: string;
  passed: boolean;
  blockers: CreativeBlocker[];
  dimensions: CreativeScoreBreakdown;
  positive_score: number;
  risk_penalty: number;
  total_score: number;
  SAFE_TO_UPLOAD: false;
  SAFE_TO_PUBLIC_UPLOAD: false;
};

export type RankedCreative = CreativeScoreResult & {
  rank: number;
};
