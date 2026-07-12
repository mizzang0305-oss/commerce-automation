export const V115_VIDEO_ASSET_SELECTION = "v113_product_matched_preview" as const;
export const V115_EXPECTED_CHANNEL_KEY = "father_jobs" as const;
export const V115_EXPECTED_PRODUCT_REFERENCE =
  "CURRENT_REAR_SEAT_MULTIFUNCTION_ORGANIZER" as const;
export const V115_EXPECTED_VIDEO_FILE_NAME = "preview-v113.mp4" as const;
export const V115_EXPECTED_FIRST_FRAME_FILE_NAME = "first-frame-v113.jpg" as const;
export const V115_EXPECTED_SUMMARY_FILE_NAME = "v113-preview-summary.json" as const;
export const V115_EXPECTED_VIDEO_SIZE_BYTES = 7_640_938;
export const V115_EXPECTED_VIDEO_SHA256 =
  "a98dcf4a74d7413dd11220eb7fe0cc84d2254b674d70c27c89ddb1d56695bf10" as const;
export const V115_EXPECTED_FIRST_FRAME_SHA256 =
  "2680d9ee6482656bafb274dffed9168825f179d0521d02893c4585d9bd32d061" as const;

export type V115ExpectedAssetEvidence = {
  videoSizeBytes: number;
  videoSha256: string;
  firstFrameSha256: string;
};

export type V115ObservedAssetEvidence = {
  videoPresent: boolean;
  videoSizeBytes: number | null;
  videoSha256: string | null;
  firstFramePresent: boolean;
  firstFrameSha256: string | null;
  summary: Record<string, unknown> | null;
};

export type V115ExactAssetEvidenceReport = {
  ready: boolean;
  blockers: string[];
  selectedAssetVersion: "v113";
  selectedVideoFileName: typeof V115_EXPECTED_VIDEO_FILE_NAME;
  productReference: typeof V115_EXPECTED_PRODUCT_REFERENCE;
  videoPresent: boolean;
  exactVideoSizeMatch: boolean;
  exactVideoHashMatch: boolean;
  firstFramePresent: boolean;
  exactFirstFrameHashMatch: boolean;
  summaryEvidenceReady: boolean;
  productMatched: boolean;
  voiceEvidenceReady: boolean;
  pinnedCommentPackageReady: boolean;
  ownerSelectedExactAsset: boolean;
  noV057Fallback: true;
  noV112Fallback: true;
  expectedVideoSha256Prefix: string;
  observedVideoSha256Prefix: string | null;
  raw_file_paths_printed: false;
  raw_urls_printed: false;
  videosInsertCalled: false;
  commentThreadsInsertCalled: false;
  fake_success: false;
  SAFE_TO_UPLOAD: false;
  SAFE_TO_PUBLIC_UPLOAD: false;
};

const DEFAULT_EXPECTED_EVIDENCE: V115ExpectedAssetEvidence = {
  videoSizeBytes: V115_EXPECTED_VIDEO_SIZE_BYTES,
  videoSha256: V115_EXPECTED_VIDEO_SHA256,
  firstFrameSha256: V115_EXPECTED_FIRST_FRAME_SHA256
};

export function evaluateV115ExactV113AssetEvidence(
  observed: V115ObservedAssetEvidence,
  expected: V115ExpectedAssetEvidence = DEFAULT_EXPECTED_EVIDENCE
): V115ExactAssetEvidenceReport {
  const summary = observed.summary;
  const pinnedCommentPackage = asRecord(summary?.pinnedCommentPackage);
  const exactVideoSizeMatch = observed.videoSizeBytes === expected.videoSizeBytes;
  const exactVideoHashMatch = normalizedHash(observed.videoSha256) === normalizedHash(expected.videoSha256);
  const exactFirstFrameHashMatch =
    normalizedHash(observed.firstFrameSha256) === normalizedHash(expected.firstFrameSha256);
  const productMatched = Boolean(
    summary?.version === "v113" &&
    summary.status === "preview_ready_for_owner_review" &&
    summary.channelKey === V115_EXPECTED_CHANNEL_KEY &&
    summary.productReference === V115_EXPECTED_PRODUCT_REFERENCE &&
    summary.scriptProductMatched === true &&
    summary.forbiddenMismatchTermsFound === 0
  );
  const voiceEvidenceReady = Boolean(
    summary?.audioReplacedWithProductMatchedVoice === true &&
    summary.localCommandVoiceUsed === true &&
    summary.paidOrCloudVoiceUsed === false &&
    summary.asrProbeExecuted === true &&
    numberAtLeast(summary.transcriptSimilarityScore, 0.9) &&
    numberAtLeast(summary.recognizedProductAnchorCount, 5) &&
    summary.coreAnchorRecognitionPass === true
  );
  const pinnedCommentPackageReady = Boolean(
    summary?.pinnedCommentCtaPresent === true &&
    pinnedCommentPackage?.ready === true &&
    pinnedCommentPackage.affiliateUrlPresent === true &&
    pinnedCommentPackage.disclosurePresent === true &&
    pinnedCommentPackage.linkPresent === true &&
    pinnedCommentPackage.commentMutationAllowed === false &&
    pinnedCommentPackage.rawUrlPrinted === false
  );
  const summaryEvidenceReady = Boolean(
    productMatched &&
    voiceEvidenceReady &&
    pinnedCommentPackageReady &&
    Array.isArray(summary?.blockers) &&
    summary.blockers.length === 0 &&
    summary.uploadExecuteCalled === false &&
    summary.videosInsertCalled === false &&
    summary.commentThreadsInsertCalled === false &&
    summary.visibilityChanged === false &&
    summary.fake_success === false &&
    summary.SAFE_TO_UPLOAD === false &&
    summary.SAFE_TO_PUBLIC_UPLOAD === false
  );
  const blockers = compact([
    observed.videoPresent ? null : "BLOCKED_V115_EXACT_V113_VIDEO_MISSING",
    exactVideoSizeMatch ? null : "BLOCKED_V115_EXACT_V113_VIDEO_SIZE_MISMATCH",
    exactVideoHashMatch ? null : "BLOCKED_V115_EXACT_V113_VIDEO_HASH_MISMATCH",
    observed.firstFramePresent ? null : "BLOCKED_V115_EXACT_V113_FIRST_FRAME_MISSING",
    exactFirstFrameHashMatch ? null : "BLOCKED_V115_EXACT_V113_FIRST_FRAME_HASH_MISMATCH",
    summaryEvidenceReady ? null : "BLOCKED_V115_V113_REVIEW_EVIDENCE_INCOMPLETE"
  ]);

  return {
    ready: blockers.length === 0,
    blockers,
    selectedAssetVersion: "v113",
    selectedVideoFileName: V115_EXPECTED_VIDEO_FILE_NAME,
    productReference: V115_EXPECTED_PRODUCT_REFERENCE,
    videoPresent: observed.videoPresent,
    exactVideoSizeMatch,
    exactVideoHashMatch,
    firstFramePresent: observed.firstFramePresent,
    exactFirstFrameHashMatch,
    summaryEvidenceReady,
    productMatched,
    voiceEvidenceReady,
    pinnedCommentPackageReady,
    ownerSelectedExactAsset: exactVideoSizeMatch && exactVideoHashMatch,
    noV057Fallback: true,
    noV112Fallback: true,
    expectedVideoSha256Prefix: hashPrefix(expected.videoSha256),
    observedVideoSha256Prefix: observed.videoSha256 ? hashPrefix(observed.videoSha256) : null,
    raw_file_paths_printed: false,
    raw_urls_printed: false,
    videosInsertCalled: false,
    commentThreadsInsertCalled: false,
    fake_success: false,
    SAFE_TO_UPLOAD: false,
    SAFE_TO_PUBLIC_UPLOAD: false
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizedHash(value: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function hashPrefix(value: string) {
  return normalizedHash(value).slice(0, 12);
}

function numberAtLeast(value: unknown, minimum: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum;
}

function compact(values: Array<string | null>) {
  return values.filter((value): value is string => Boolean(value));
}
