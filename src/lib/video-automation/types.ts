import type { CreativeCandidate, RankedCreative } from "../video-lab/types";

export const PRODUCT_VIDEO_AUTOMATION_FLAGS = Object.freeze({
  PRODUCT_VIDEO_AUTOMATION_V1_ENABLED: false,
  CREATIVE_MULTI_CANDIDATE_ENABLED: false,
  CREATIVE_SCORER_V2_ENABLED: false,
  WHISPERX_ALIGNMENT_ENABLED: false,
  WHISPERX_ALIGNMENT_REQUIRED: false,
  AUTO_RENDER_LOCAL_ENABLED: false,
  UPLOAD_ENABLED: false,
  SAFE_TO_UPLOAD: false,
  SAFE_TO_PUBLIC_UPLOAD: false,
  YOUTUBE_AUTO_UPLOAD: false,
  PUBLIC_UPLOAD: false,
  UNLISTED_UPLOAD: false,
  TIKTOK_AUTO_UPLOAD: false,
  THREADS_AUTO_POST: false,
  COMMENT_AUTOMATION: false,
  DB_WRITE: 0,
  PRODUCTION_DEPLOY: 0,
  SCHEDULER_CHANGE: 0,
  LIVE_PLATFORM_UPLOAD: 0
} as const);

export type ProductVideoAutomationInput = {
  runId: string;
  product: {
    productKey: string;
    rawProductName: string;
    canonicalProductName: string;
    aliases: string[];
    anchors: string[];
    category: string;
    priceText?: string;
    imagePaths: string[];
    affiliateUrl?: string;
    disclosureText?: string;
    exactProductReference?: {
      sourceUrl: string;
      localPath: string;
      identityType: "product_reference";
      sourceProvider: string;
      sourceRequestId: string;
    };
    sourceProvenance?: {
      sourceProvider: string;
      sourceRequestId: string;
      discoveredAt: string;
      sourceKeyword: string;
      rawProductId: string;
      productKey: string;
    };
    realUseAsset?: OwnerReviewedRealUseAsset;
  };
  creative: { candidateCount: 3; language: "ko" };
  mode: "local_review_only";
};

export type OwnerReviewStatus = "pending" | "pass" | "fail";

export type OwnerReviewedRealUseAsset = {
  assetId: string;
  productKey: string;
  sourcePath: string;
  reviewEvidencePath: string;
  sourceType: "owner_reviewed_local_video";
  identityType: "generic_usage_example" | "exact_product_use";
  usageType: "real_use_context";
  ownerReviewStatus: "pass";
  ownerReviewedAt?: string;
};

export type LocalAutomationQaStatus = {
  technicalQaPassed: boolean;
  captionQaPassed: boolean;
  layoutQaPassed: boolean;
  visualEvidencePassed: boolean;
  ownerReviewStatus: OwnerReviewStatus;
  publishQualityPassed: boolean;
};

export type CreativeSelectionArtifact = {
  productKey: string;
  scorerVersion: "video-lab-creative-score-v2";
  passingScore: 50;
  candidates: Array<RankedCreative & { candidateHash: string; selected: boolean }>;
  selectedCandidateId: string | null;
  selectionReason: { rank: 1; score: number } | null;
  manual_review_required: boolean;
  SAFE_TO_UPLOAD: false;
};

export type CaptionCueV1 = {
  id: string;
  start: number;
  end: number;
  text: string;
  words: string[];
  emphasisWord?: string;
};

export type PipelineStage =
  | "creative_ready"
  | "tts_ready"
  | "asr_ready"
  | "alignment_ready"
  | "rendered"
  | "qa_pass";

export type PipelineDependencies = {
  generateCandidates(input: ProductVideoAutomationInput): Promise<CreativeCandidate[]>;
  synthesize(script: string): Promise<{ audioPath: string }>;
  validateAsr(audioPath: string, script: string, anchors: string[]): Promise<{ passed: boolean; similarity: number; transcript: string; recognizedAnchors: string[] }>;
  align(audioPath: string): Promise<{ words: Array<{ word: string; start: number; end: number; confidence: number | null }> }>;
  render(input: { selected: CreativeCandidate; audioPath: string; captions: CaptionCueV1[]; product: ProductVideoAutomationInput["product"] }): Promise<{ outputPath: string }>;
  qa(input: { outputPath: string; selected: CreativeCandidate; captions: CaptionCueV1[]; asrSimilarity: number }): Promise<{ passed: boolean; blockers: string[] }>;
};

export type PipelineResult = {
  status: "COMPLETED" | "CREATIVE_SELECTION_FAILED" | "FAILED" | "MANUAL_REVIEW";
  stages: PipelineStage[];
  selection: CreativeSelectionArtifact;
  outputPath: string | null;
  qaPassed: boolean;
  blockers: string[];
  SAFE_TO_UPLOAD: false;
};
