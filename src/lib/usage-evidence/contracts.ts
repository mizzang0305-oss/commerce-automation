export const USAGE_ASSET_BLOCK_CODES = [
  "USAGE_ASSET_PRIVACY_RISK",
  "USAGE_ASSET_RIGHTS_UNCLEAR",
  "USAGE_ASSET_BRAND_OVERCLAIM_RISK",
  "USAGE_ASSET_NEAR_DUPLICATE"
] as const;

export type UsageAssetBlockCode = typeof USAGE_ASSET_BLOCK_CODES[number];
export type UsageEvidenceTrustTier = "HUMAN_REVIEWED_SOURCE_DERIVED" | "CODEX_REVIEWED_LOCAL_ONLY" | "UNREVIEWED";
export type UsageSceneRole = "problem" | "hand_interaction" | "usage" | "before" | "after" | "organization" | "storage" | "folding" | "cleaning" | "cooling" | "travel" | "cta_background";

export type UsageEvidenceAsset = {
  assetId: string;
  sourceId: string;
  sourceKind: "owner_reviewed_video" | "sanitized_local_video" | "sanitized_local_image" | "derived_clip" | "derived_frame_pack";
  sourceRelativeReference: string;
  sourceSha256: string;
  derivedSha256: string;
  derivationOperation: string;
  clipStartSeconds?: number;
  clipEndSeconds?: number;
  useCases: string[];
  sceneRoles: UsageSceneRole[];
  categoryAllowlist: string[];
  categoryBlocklist: string[];
  identityType: "generic_usage_example";
  trustTier: UsageEvidenceTrustTier;
  sourceHumanReviewStatus: "pass" | "fail" | "not_available";
  derivedMachineQaStatus: "pass" | "fail" | "not_run";
  derivedCodexVisualReviewStatus: "pass" | "fail" | "not_run";
  humanOwnerReviewStatus: "pass" | "fail" | "not_requested";
  noUploadAutomationEligible: boolean;
  publishEligible: false;
  visualFingerprint: string;
  sourceFingerprint: string;
  dailyReuseLimit: number;
  consecutiveReuseLimit: number;
  createdAt: string;
  reviewedAt: string;
  safeReviewNotes: string[];
  blockCodes: UsageAssetBlockCode[];
};

export type UsageEvidencePack = {
  packId: string;
  useCase: string;
  subUseCase: string;
  assetIds: string[];
  problemAssetIds: string[];
  usageAssetIds: string[];
  actionAssetIds: string[];
  afterAssetIds: string[];
  categoryAllowlist: string[];
  categoryBlocklist: string[];
  dailyReuseLimit: number;
  consecutiveReuseLimit: number;
  sequenceFingerprint: string;
  noUploadAutomationEligible: boolean;
  publishEligible: false;
};

export type UsageEvidenceRegistry = {
  schemaVersion: "usage-evidence-registry-v2";
  generatedAt: string;
  visualReviewExecuted: boolean;
  maxUsagePackReuse: 5;
  maxSameSequenceConsecutive: 2;
  maxSameSourceVideoDaily: number;
  nearDuplicateHammingThreshold: number;
  assets: UsageEvidenceAsset[];
  packs: UsageEvidencePack[];
  sourceInventory: {
    reviewReportsScanned: number;
    sourceVideosFound: number;
    validSources: number;
    invalidSources: number;
    humanReviewedSources: number;
    sanitizedLocalSources: number;
    privacyBlocked: number;
    rightsBlocked: number;
    nearDuplicatesRemoved: number;
  };
};

export type UsageEvidenceAllocation = {
  productKey: string;
  useCase: string;
  packId: string;
  assetIds: string[];
  sequenceFingerprint: string;
  sourceIds: string[];
};

export type UsageEvidenceAllocationDiagnostics = {
  assetCapacityRejected: number;
  sequenceCapacityRejected: number;
  categoryCompatibilityRejected: number;
  useCaseMismatchRejected: number;
};
