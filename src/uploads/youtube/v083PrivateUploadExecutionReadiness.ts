export const APPROVE_BUILD_V083_REAL_PRIVATE_UPLOAD_EXECUTION_ADAPTER_NO_UPLOAD =
  "APPROVE_BUILD_V083_REAL_PRIVATE_UPLOAD_EXECUTION_ADAPTER_NO_UPLOAD" as const;

export type V083PrivateUploadExecutionMode = "real_private_execution_adapter_no_upload";
export type V083PrivateUploadExecutionVisibility = "private" | "public" | "unlisted";
export type V083PrivateUploadExecutionBlocker =
  | "BLOCKED_V083_BUILD_APPROVAL_REQUIRED"
  | "BLOCKED_V083_SERVER_ONLY_CONTEXT_REQUIRED"
  | "BLOCKED_V083_V081_PILOT_NOT_READY"
  | "BLOCKED_V083_V082_RUNTIME_ADAPTER_NOT_READY"
  | "BLOCKED_V083_TOKEN_PROVIDER_NOT_READY"
  | "BLOCKED_V083_UPLOAD_SCOPE_NOT_READY"
  | "BLOCKED_V083_VIDEO_ASSET_NOT_READY"
  | "BLOCKED_V083_UPLOAD_PACKAGE_NOT_READY"
  | "BLOCKED_V083_DUPLICATE_GUARD_NOT_READY"
  | "BLOCKED_V083_DISCLOSURE_GUARD_NOT_READY"
  | "BLOCKED_V083_AFFILIATE_EVIDENCE_NOT_READY"
  | "BLOCKED_V083_TARGET_CHANNEL_EVIDENCE_NOT_READY"
  | "BLOCKED_V083_PUBLIC_UPLOAD_NOT_ALLOWED"
  | "BLOCKED_V083_UNLISTED_UPLOAD_NOT_ALLOWED"
  | "BLOCKED_V083_COMMENT_AUTOMATION_NOT_ALLOWED"
  | "BLOCKED_V083_SCHEDULER_EXECUTION_NOT_ALLOWED"
  | "BLOCKED_V083_MAX_ITEMS_MUST_BE_ONE"
  | "BLOCKED_V083_REAL_UPLOAD_EXECUTOR_NOT_INJECTED"
  | "BLOCKED_V083_ADAPTER_UPLOAD_EVIDENCE_INCOMPLETE";

export type V083PrivateUploadExecutionReadinessInput = {
  buildApprovalPhrase?: string | null;
  serverOnlyContext?: boolean;
  v081PilotReady?: boolean;
  v082RuntimeAdapterReady?: boolean;
  tokenProviderReady?: boolean;
  uploadScopeReady?: boolean;
  videoAssetReady?: boolean;
  uploadPackageReady?: boolean;
  duplicateGuardReady?: boolean;
  disclosureGuardReady?: boolean;
  affiliateEvidenceReady?: boolean;
  targetChannelEvidenceReady?: boolean;
  requestedVisibility?: V083PrivateUploadExecutionVisibility;
  maxItems?: number;
  commentAutomationRequested?: boolean;
  schedulerExecutionRequested?: boolean;
};

export type V083PrivateUploadExecutionEvidence = {
  v081PilotReady: boolean;
  v082RuntimeAdapterReady: boolean;
  tokenProviderReady: boolean;
  uploadScopeReady: boolean;
  videoAssetReady: boolean;
  uploadPackageReady: boolean;
  duplicateGuardReady: boolean;
  disclosureGuardReady: boolean;
  affiliateEvidenceReady: boolean;
  targetChannelEvidenceReady: boolean;
};

export type V083PrivateUploadExecutionMutationSafety = {
  videosInsertCalled: false;
  commentThreadsInsertCalled: false;
  visibilityChanged: false;
  schedulerExecuted: false;
};

export type V083PrivateUploadExecutionRedactionProof = {
  rawUrlsPrinted: false;
  rawVideoIdsPrinted: false;
  rawChannelIdsPrinted: false;
  secretsPrinted: false;
  fakeSuccess: false;
};

export type V083PrivateUploadExecutionReadiness = {
  version: "v083";
  ready: boolean;
  mode: V083PrivateUploadExecutionMode;
  serverOnly: true;
  serverOnlyContextPresent: boolean;
  buildApprovalAccepted: boolean;
  executableCandidate: boolean;
  executionAllowedInThisPr: false;
  requiresFreshExecutionApprovalAfterMerge: true;
  allowedVisibility: "private";
  requestedVisibility: V083PrivateUploadExecutionVisibility;
  maxItems: 1;
  requestedMaxItems: number;
  commentAutomationAllowed: false;
  schedulerExecutionAllowed: false;
  publicUploadAllowed: false;
  safeToUpload: false;
  SAFE_TO_UPLOAD: false;
  safeToPublicUpload: false;
  SAFE_TO_PUBLIC_UPLOAD: false;
  blockers: V083PrivateUploadExecutionBlocker[];
  evidence: V083PrivateUploadExecutionEvidence;
  mutationSafety: V083PrivateUploadExecutionMutationSafety;
  redactionProof: V083PrivateUploadExecutionRedactionProof;
};

export type V083PrivateUploadExecutionReadinessReport = {
  version: "v083";
  FINAL_STATUS:
    | "READY_V083_REAL_PRIVATE_UPLOAD_EXECUTION_ADAPTER_NO_UPLOAD"
    | "BLOCKED_V083_REAL_PRIVATE_UPLOAD_EXECUTION_ADAPTER_NOT_READY";
  ready: boolean;
  mode: V083PrivateUploadExecutionMode;
  serverOnly: true;
  buildApprovalAccepted: boolean;
  executableCandidate: boolean;
  executionAllowedInThisPr: false;
  requiresFreshExecutionApprovalAfterMerge: true;
  allowedVisibility: "private";
  requestedVisibility: V083PrivateUploadExecutionVisibility;
  maxItems: 1;
  requestedMaxItems: number;
  SAFE_TO_UPLOAD: false;
  safeToUpload: false;
  SAFE_TO_PUBLIC_UPLOAD: false;
  safeToPublicUpload: false;
  publicUploadAllowed: false;
  commentAutomationAllowed: false;
  schedulerExecutionAllowed: false;
  blockers: V083PrivateUploadExecutionBlocker[];
  evidence: V083PrivateUploadExecutionEvidence;
  mutationSafety: V083PrivateUploadExecutionMutationSafety;
  redactionProof: V083PrivateUploadExecutionRedactionProof;
};

export function buildV083PrivateUploadExecutionReadiness(
  input: V083PrivateUploadExecutionReadinessInput = {}
): V083PrivateUploadExecutionReadiness {
  const normalized = normalizeInput(input);
  const evidence: V083PrivateUploadExecutionEvidence = {
    v081PilotReady: normalized.v081PilotReady,
    v082RuntimeAdapterReady: normalized.v082RuntimeAdapterReady,
    tokenProviderReady: normalized.tokenProviderReady,
    uploadScopeReady: normalized.uploadScopeReady,
    videoAssetReady: normalized.videoAssetReady,
    uploadPackageReady: normalized.uploadPackageReady,
    duplicateGuardReady: normalized.duplicateGuardReady,
    disclosureGuardReady: normalized.disclosureGuardReady,
    affiliateEvidenceReady: normalized.affiliateEvidenceReady,
    targetChannelEvidenceReady: normalized.targetChannelEvidenceReady
  };
  const blockers = buildBlockers(normalized);
  const ready = blockers.length === 0;

  return {
    version: "v083",
    ready,
    mode: "real_private_execution_adapter_no_upload",
    serverOnly: true,
    serverOnlyContextPresent: normalized.serverOnlyContext,
    buildApprovalAccepted: normalized.buildApprovalAccepted,
    executableCandidate: ready,
    executionAllowedInThisPr: false,
    requiresFreshExecutionApprovalAfterMerge: true,
    allowedVisibility: "private",
    requestedVisibility: normalized.requestedVisibility,
    maxItems: 1,
    requestedMaxItems: normalized.maxItems,
    commentAutomationAllowed: false,
    schedulerExecutionAllowed: false,
    publicUploadAllowed: false,
    safeToUpload: false,
    SAFE_TO_UPLOAD: false,
    safeToPublicUpload: false,
    SAFE_TO_PUBLIC_UPLOAD: false,
    blockers,
    evidence,
    mutationSafety: buildMutationSafety(),
    redactionProof: buildRedactionProof()
  };
}

export function buildV083PrivateUploadExecutionReadinessReport(
  readiness: V083PrivateUploadExecutionReadiness
): V083PrivateUploadExecutionReadinessReport {
  return {
    version: "v083",
    FINAL_STATUS: readiness.ready
      ? "READY_V083_REAL_PRIVATE_UPLOAD_EXECUTION_ADAPTER_NO_UPLOAD"
      : "BLOCKED_V083_REAL_PRIVATE_UPLOAD_EXECUTION_ADAPTER_NOT_READY",
    ready: readiness.ready,
    mode: readiness.mode,
    serverOnly: true,
    buildApprovalAccepted: readiness.buildApprovalAccepted,
    executableCandidate: readiness.executableCandidate,
    executionAllowedInThisPr: false,
    requiresFreshExecutionApprovalAfterMerge: true,
    allowedVisibility: "private",
    requestedVisibility: readiness.requestedVisibility,
    maxItems: 1,
    requestedMaxItems: readiness.requestedMaxItems,
    SAFE_TO_UPLOAD: false,
    safeToUpload: false,
    SAFE_TO_PUBLIC_UPLOAD: false,
    safeToPublicUpload: false,
    publicUploadAllowed: false,
    commentAutomationAllowed: false,
    schedulerExecutionAllowed: false,
    blockers: readiness.blockers,
    evidence: readiness.evidence,
    mutationSafety: readiness.mutationSafety,
    redactionProof: readiness.redactionProof
  };
}

function normalizeInput(input: V083PrivateUploadExecutionReadinessInput) {
  return {
    buildApprovalAccepted: input.buildApprovalPhrase ===
      APPROVE_BUILD_V083_REAL_PRIVATE_UPLOAD_EXECUTION_ADAPTER_NO_UPLOAD,
    serverOnlyContext: input.serverOnlyContext ?? true,
    v081PilotReady: input.v081PilotReady ?? false,
    v082RuntimeAdapterReady: input.v082RuntimeAdapterReady ?? false,
    tokenProviderReady: input.tokenProviderReady ?? false,
    uploadScopeReady: input.uploadScopeReady ?? false,
    videoAssetReady: input.videoAssetReady ?? false,
    uploadPackageReady: input.uploadPackageReady ?? false,
    duplicateGuardReady: input.duplicateGuardReady ?? false,
    disclosureGuardReady: input.disclosureGuardReady ?? false,
    affiliateEvidenceReady: input.affiliateEvidenceReady ?? false,
    targetChannelEvidenceReady: input.targetChannelEvidenceReady ?? false,
    requestedVisibility: input.requestedVisibility ?? "private",
    maxItems: input.maxItems ?? 1,
    commentAutomationRequested: input.commentAutomationRequested ?? false,
    schedulerExecutionRequested: input.schedulerExecutionRequested ?? false
  };
}

function buildBlockers(
  input: ReturnType<typeof normalizeInput>
): V083PrivateUploadExecutionBlocker[] {
  const blockers: V083PrivateUploadExecutionBlocker[] = [];

  if (!input.buildApprovalAccepted) {
    blockers.push("BLOCKED_V083_BUILD_APPROVAL_REQUIRED");
  }
  if (!input.serverOnlyContext) {
    blockers.push("BLOCKED_V083_SERVER_ONLY_CONTEXT_REQUIRED");
  }
  if (!input.v081PilotReady) {
    blockers.push("BLOCKED_V083_V081_PILOT_NOT_READY");
  }
  if (!input.v082RuntimeAdapterReady) {
    blockers.push("BLOCKED_V083_V082_RUNTIME_ADAPTER_NOT_READY");
  }
  if (!input.tokenProviderReady) {
    blockers.push("BLOCKED_V083_TOKEN_PROVIDER_NOT_READY");
  }
  if (!input.uploadScopeReady) {
    blockers.push("BLOCKED_V083_UPLOAD_SCOPE_NOT_READY");
  }
  if (!input.videoAssetReady) {
    blockers.push("BLOCKED_V083_VIDEO_ASSET_NOT_READY");
  }
  if (!input.uploadPackageReady) {
    blockers.push("BLOCKED_V083_UPLOAD_PACKAGE_NOT_READY");
  }
  if (!input.duplicateGuardReady) {
    blockers.push("BLOCKED_V083_DUPLICATE_GUARD_NOT_READY");
  }
  if (!input.disclosureGuardReady) {
    blockers.push("BLOCKED_V083_DISCLOSURE_GUARD_NOT_READY");
  }
  if (!input.affiliateEvidenceReady) {
    blockers.push("BLOCKED_V083_AFFILIATE_EVIDENCE_NOT_READY");
  }
  if (!input.targetChannelEvidenceReady) {
    blockers.push("BLOCKED_V083_TARGET_CHANNEL_EVIDENCE_NOT_READY");
  }
  if (input.requestedVisibility === "public") {
    blockers.push("BLOCKED_V083_PUBLIC_UPLOAD_NOT_ALLOWED");
  }
  if (input.requestedVisibility === "unlisted") {
    blockers.push("BLOCKED_V083_UNLISTED_UPLOAD_NOT_ALLOWED");
  }
  if (input.commentAutomationRequested) {
    blockers.push("BLOCKED_V083_COMMENT_AUTOMATION_NOT_ALLOWED");
  }
  if (input.schedulerExecutionRequested) {
    blockers.push("BLOCKED_V083_SCHEDULER_EXECUTION_NOT_ALLOWED");
  }
  if (input.maxItems !== 1) {
    blockers.push("BLOCKED_V083_MAX_ITEMS_MUST_BE_ONE");
  }

  return [...new Set(blockers)];
}

function buildMutationSafety(): V083PrivateUploadExecutionMutationSafety {
  return {
    videosInsertCalled: false,
    commentThreadsInsertCalled: false,
    visibilityChanged: false,
    schedulerExecuted: false
  };
}

function buildRedactionProof(): V083PrivateUploadExecutionRedactionProof {
  return {
    rawUrlsPrinted: false,
    rawVideoIdsPrinted: false,
    rawChannelIdsPrinted: false,
    secretsPrinted: false,
    fakeSuccess: false
  };
}
