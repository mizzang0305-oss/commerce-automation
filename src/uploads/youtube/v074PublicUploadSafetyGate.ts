export type V074PublicUploadBlocker =
  | "BLOCKED_V074_PUBLIC_UPLOAD_DISABLED"
  | "BLOCKED_V074_PUBLIC_UPLOAD_APPROVAL_MISSING"
  | "BLOCKED_V074_UPLOAD_PACKAGE_NOT_READY"
  | "BLOCKED_V074_VIDEO_ASSET_NOT_READY"
  | "BLOCKED_V074_METADATA_NOT_READY"
  | "BLOCKED_V074_DISCLOSURE_NOT_READY"
  | "BLOCKED_V074_TARGET_CHANNEL_NOT_VERIFIED"
  | "BLOCKED_V074_DUPLICATE_UPLOAD_RISK"
  | "BLOCKED_V074_YOUTUBE_OAUTH_NOT_READY"
  | "BLOCKED_V074_YOUTUBE_QUOTA_NOT_READY"
  | "BLOCKED_V074_REAL_ADAPTER_DISABLED"
  | "BLOCKED_V074_REAL_YOUTUBE_MUTATION_FORBIDDEN";

export type V074PublicUploadSafetyGateInput = {
  uploadPackageReady: boolean;
  productSourceReady: boolean;
  deeplinkReady: boolean;
  affiliateUrlReady: boolean;
  videoAssetReady: boolean;
  firstFrameReady: boolean;
  metadataReady: boolean;
  descriptionDisclosureReady: boolean;
  commentDisclosureReady: boolean;
  targetChannelVerified: boolean;
  duplicateUploadRisk: boolean;
  quotaReady: boolean;
  oauthReady: boolean;
  publicUploadFeatureEnabled: boolean;
  freshApprovalPresent: boolean;
  realAdapterRequested?: boolean;
  realYouTubeMutationAttempted?: boolean;
};

export type V074PublicUploadSafetyGate = {
  ready: boolean;
  executeAllowed: boolean;
  safeToUpload: boolean;
  blocker: V074PublicUploadBlocker | null;
  blockers: V074PublicUploadBlocker[];
};

export function buildV074PublicUploadSafetyGate(
  input: V074PublicUploadSafetyGateInput
): V074PublicUploadSafetyGate {
  const blockers = buildBlockers(input);
  const ready = blockers.length === 0;

  return {
    ready,
    executeAllowed: ready,
    safeToUpload: ready,
    blocker: blockers[0] ?? null,
    blockers
  };
}

function buildBlockers(input: V074PublicUploadSafetyGateInput): V074PublicUploadBlocker[] {
  const blockers: V074PublicUploadBlocker[] = [];

  if (input.realYouTubeMutationAttempted) {
    blockers.push("BLOCKED_V074_REAL_YOUTUBE_MUTATION_FORBIDDEN");
  }
  if (!input.publicUploadFeatureEnabled) {
    blockers.push("BLOCKED_V074_PUBLIC_UPLOAD_DISABLED");
  }
  if (!input.uploadPackageReady || !input.productSourceReady || !input.deeplinkReady || !input.affiliateUrlReady) {
    blockers.push("BLOCKED_V074_UPLOAD_PACKAGE_NOT_READY");
  }
  if (!input.videoAssetReady || !input.firstFrameReady) {
    blockers.push("BLOCKED_V074_VIDEO_ASSET_NOT_READY");
  }
  if (!input.metadataReady) {
    blockers.push("BLOCKED_V074_METADATA_NOT_READY");
  }
  if (!input.descriptionDisclosureReady || !input.commentDisclosureReady) {
    blockers.push("BLOCKED_V074_DISCLOSURE_NOT_READY");
  }
  if (!input.targetChannelVerified) {
    blockers.push("BLOCKED_V074_TARGET_CHANNEL_NOT_VERIFIED");
  }
  if (input.duplicateUploadRisk) {
    blockers.push("BLOCKED_V074_DUPLICATE_UPLOAD_RISK");
  }
  if (!input.quotaReady) {
    blockers.push("BLOCKED_V074_YOUTUBE_QUOTA_NOT_READY");
  }
  if (!input.oauthReady) {
    blockers.push("BLOCKED_V074_YOUTUBE_OAUTH_NOT_READY");
  }
  if (!input.freshApprovalPresent) {
    blockers.push("BLOCKED_V074_PUBLIC_UPLOAD_APPROVAL_MISSING");
  }
  if (input.realAdapterRequested) {
    blockers.push("BLOCKED_V074_REAL_ADAPTER_DISABLED");
  }

  return dedupe(blockers);
}

function dedupe<T>(values: T[]) {
  return [...new Set(values)];
}
