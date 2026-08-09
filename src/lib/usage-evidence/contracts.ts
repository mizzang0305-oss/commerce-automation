export const USAGE_ASSET_BLOCK_CODES = [
  "USAGE_ASSET_PRIVACY_RISK",
  "USAGE_ASSET_RIGHTS_UNCLEAR",
  "USAGE_ASSET_BRAND_OVERCLAIM_RISK",
  "USAGE_ASSET_NEAR_DUPLICATE",
  "PRODUCT_COLOR_CHANGED",
  "PRODUCT_SHAPE_CHANGED",
  "PRODUCT_COMPONENT_COUNT_CHANGED",
  "PRODUCT_HANDLE_MISSING",
  "PRODUCT_LID_HALLUCINATED",
  "PRODUCT_LOGO_HALLUCINATED",
  "PRODUCT_SIZE_MISREPRESENTED",
  "PRODUCT_BOUNDARY_BAD",
  "PRODUCT_PIXEL_PROVENANCE_MISSING",
  "PRODUCT_CLIPPING_DETECTED",
  "GENERATED_TEXT_OR_WATERMARK_DETECTED",
  "GENERATED_PRIVACY_RISK"
] as const;

export type UsageAssetBlockCode = typeof USAGE_ASSET_BLOCK_CODES[number];
export type UsageEvidenceTrustTier = "HUMAN_REVIEWED_SOURCE_DERIVED" | "CODEX_REVIEWED_LOCAL_ONLY" | "UNREVIEWED";
export type UsageSceneRole = "problem" | "hand_interaction" | "usage" | "before" | "after" | "organization" | "storage" | "folding" | "cleaning" | "cooling" | "travel" | "cta_background" | "product_reveal" | "detail" | "context";

export type UsageEvidenceAsset = {
  assetId: string;
  sourceId: string;
  sourceKind: "owner_reviewed_video" | "sanitized_local_video" | "sanitized_local_image" | "derived_clip" | "derived_frame_pack" | "coupang_product_reference" | "codex_generated_background" | "exact_product_composite" | "reference_card";
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
  identityType: "generic_usage_example" | "synthetic_product_usage_example";
  trustTier: UsageEvidenceTrustTier;
  sourceHumanReviewStatus: "pass" | "fail" | "not_available";
  derivedMachineQaStatus: "pass" | "fail" | "not_run";
  derivedCodexVisualReviewStatus: "pass" | "fail" | "not_run";
  humanOwnerReviewStatus: "pass" | "fail" | "not_requested";
  noUploadAutomationEligible: boolean;
  publishEligible: false;
  visualFingerprint: string;
  temporalFingerprint?: string;
  motionQa?: {
    durationSeconds: number;
    freezeRatio: number;
    longestFreezeSeconds: number;
    visualChangeRatio: number;
    blackFrameRatio: number;
    blurScore: number;
    frameFill: number;
    motionPresent: boolean;
    decodePassed: boolean;
    textContaminationIndicator: "clear" | "review_required";
  };
  sourceFingerprint: string;
  dailyReuseLimit: number;
  consecutiveReuseLimit: number;
  createdAt: string;
  reviewedAt: string;
  safeReviewNotes: string[];
  blockCodes: UsageAssetBlockCode[];
  boundProductKey?: string;
  sourceProductImageUrl?: string;
  sourceProductImageSha256?: string;
  generationProvider?: "codex_image_skill";
  generationMode?: "background_plus_exact_product_composite" | "reference_image_edit" | "reference_card_plus_synthetic_context";
  productPixelSource?: "exact_coupang_reference" | "reference_image_edit" | "not_present";
  syntheticUsageExample?: true;
  disclosureRequired?: true;
  disclosureText?: "AI 연출 사용 예시";
  identityFidelityStatus?: "pass" | "fail" | "not_run" | "not_applicable";
  identityFidelityScore?: number;
};

export type ProductAvailabilityEvidence = {
  productKey: string;
  observedInPrepare: boolean;
  observedInRun1: boolean;
  observedInRun2: boolean;
  observedInTargetedRecovery: boolean;
  observationCount: number;
  sourceKeywords: string[];
  lastObservedAt: string;
  availabilityScore: number;
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
  packGeneration?: "v2" | "v3_motion" | "v5_product_bound_synthetic";
  trustTier?: "HUMAN_REVIEWED_SOURCE_DERIVED" | "CODEX_REVIEWED_LOCAL_ONLY";
  primarySourceId?: string;
  packKind?: "generic_usage_pack" | "product_bound_synthetic_pack";
  boundProductKey?: string;
  canonicalProductName?: string;
  category?: string;
  exactProductReferenceAssetId?: string;
  detailAssetIds?: string[];
  identityFidelityScore?: number;
  sourceImageSha256?: string;
  syntheticDisclosureRequired?: true;
  productPixelProvenance?: "exact_coupang_reference" | "reference_image_edit";
  availabilityEvidence?: ProductAvailabilityEvidence;
  replacementOfPackId?: string;
  replacementOfProductKey?: string;
  replacementReason?: "SELECTED_PRODUCT_NOT_STABLE_IN_LIVE_SEARCH";
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
  productBoundMismatchRejected: number;
};
