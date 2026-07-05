export type V082PrivateUploadRuntimeAdapterMode = "blocked" | "real_candidate";
export type V082PrivateUploadRuntimeVisibility = "private" | "public" | "unlisted";
export type V082PrivateUploadRuntimeBlocker =
  | "BLOCKED_V082_SERVER_ONLY_CONTEXT_REQUIRED"
  | "BLOCKED_V082_YOUTUBE_OAUTH_NOT_CONFIGURED"
  | "BLOCKED_V082_TOKEN_PROVIDER_NOT_CONFIGURED"
  | "BLOCKED_V082_TOKEN_READINESS_PROVIDER_STATUS_REQUIRED"
  | "BLOCKED_V082_TOKEN_PROVIDER_NOT_READY"
  | "BLOCKED_V082_TOKEN_NOT_READY"
  | "BLOCKED_V082_TOKEN_UPLOAD_SCOPE_NOT_READY"
  | "BLOCKED_V082_TOKEN_FILE_UNSAFE_OR_UNREADABLE"
  | "BLOCKED_V082_VIDEO_ASSET_RESOLVER_NOT_CONFIGURED"
  | "BLOCKED_V082_UPLOAD_PACKAGE_RESOLVER_NOT_CONFIGURED"
  | "BLOCKED_V082_DUPLICATE_GUARD_NOT_CONFIGURED"
  | "BLOCKED_V082_DISCLOSURE_GUARD_NOT_CONFIGURED"
  | "BLOCKED_V082_PUBLIC_UPLOAD_NOT_ALLOWED"
  | "BLOCKED_V082_UNLISTED_UPLOAD_NOT_ALLOWED"
  | "BLOCKED_V082_MAX_ITEMS_NOT_ONE"
  | "BLOCKED_V082_COMMENT_AUTOMATION_NOT_ALLOWED"
  | "BLOCKED_V082_SCHEDULER_EXECUTION_NOT_ALLOWED"
  | "BLOCKED_V082_REAL_UPLOAD_EXECUTION_NOT_ALLOWED_IN_THIS_PR";

export type V082PrivateUploadTokenProviderReadiness = {
  providerReady: boolean;
  tokenReady: boolean;
  uploadScopeReady: boolean;
  tokenFileSafeAndReadable: boolean;
};

export type V082PrivateUploadRuntimeAdapterReadinessInput = {
  serverOnlyContext?: boolean;
  oauthConfigured?: boolean;
  tokenProviderConfigured?: boolean;
  tokenProviderReadiness?: V082PrivateUploadTokenProviderReadiness | null;
  /**
   * Legacy direct token flag. V082 ignores this for completion decisions; token readiness
   * must come from tokenProviderReadiness so env paths cannot become implicit approval.
   */
  tokenReady?: boolean;
  videoAssetResolverConfigured?: boolean;
  uploadPackageResolverConfigured?: boolean;
  duplicateGuardConfigured?: boolean;
  disclosureGuardConfigured?: boolean;
  requestedVisibility?: V082PrivateUploadRuntimeVisibility;
  commentAutomationRequested?: boolean;
  schedulerExecutionRequested?: boolean;
  maxItems?: number;
  realUploadExecutionRequested?: boolean;
};

export type V082PrivateUploadRuntimeAdapterEvidence = {
  oauthConfigured: boolean;
  tokenProviderConfigured: boolean;
  tokenReadinessProviderStatusPresent: boolean;
  tokenProviderReady: boolean;
  tokenReady: boolean;
  uploadScopeReady: boolean;
  tokenFileSafeAndReadable: boolean;
  videoAssetResolverConfigured: boolean;
  uploadPackageResolverConfigured: boolean;
  duplicateGuardConfigured: boolean;
  disclosureGuardConfigured: boolean;
};

export type V082PrivateUploadRuntimeRedactionProof = {
  rawUrlsPrinted: false;
  rawVideoIdsPrinted: false;
  rawChannelIdsPrinted: false;
  secretsPrinted: false;
  fakeSuccess: false;
};

export type V082PrivateUploadRuntimeAdapterReadiness = {
  version: "v082";
  ready: boolean;
  adapterMode: V082PrivateUploadRuntimeAdapterMode;
  serverOnly: true;
  serverOnlyContextPresent: boolean;
  canCallVideosInsert: boolean;
  canCallCommentThreadsInsert: false;
  executionAllowedInThisPr: false;
  requiresFreshExecutionApproval: true;
  freshApprovalReused: false;
  allowedVisibility: "private";
  requestedVisibility: V082PrivateUploadRuntimeVisibility;
  maxItems: 1;
  requestedMaxItems: number;
  safeToUpload: false;
  SAFE_TO_UPLOAD: false;
  safeToPublicUpload: false;
  SAFE_TO_PUBLIC_UPLOAD: false;
  commentAutomationAllowed: false;
  schedulerExecutionAllowed: false;
  blockers: V082PrivateUploadRuntimeBlocker[];
  evidence: V082PrivateUploadRuntimeAdapterEvidence;
  redactionProof: V082PrivateUploadRuntimeRedactionProof;
  videos_insert_called: false;
  videos_insert_total_count: 0;
  commentThreads_insert_called: false;
  comment_create_update_delete_called: false;
  visibility_changed: false;
  R2_upload: false;
  DB_write: false;
  product_assets_write: false;
  n8n_webhook_called: false;
  raw_urls_printed: false;
  raw_video_ids_printed: false;
  raw_channel_ids_printed: false;
  secrets_printed: false;
  fake_success: false;
};

export type V082PrivateUploadRuntimeReadinessReport = {
  version: "v082";
  FINAL_STATUS:
    | "READY_FOR_PRIVATE_PILOT_EXECUTION_APPROVAL"
    | "BLOCKED_V082_PRIVATE_UPLOAD_RUNTIME_ADAPTER_NOT_READY";
  ready: boolean;
  adapterMode: V082PrivateUploadRuntimeAdapterMode;
  serverOnly: true;
  canCallVideosInsert: boolean;
  canCallCommentThreadsInsert: false;
  executionAllowedInThisPr: false;
  requiresFreshExecutionApproval: true;
  freshApprovalReused: false;
  allowedVisibility: "private";
  requestedVisibility: V082PrivateUploadRuntimeVisibility;
  maxItems: 1;
  requestedMaxItems: number;
  SAFE_TO_UPLOAD: false;
  safeToUpload: false;
  SAFE_TO_PUBLIC_UPLOAD: false;
  safeToPublicUpload: false;
  blockers: V082PrivateUploadRuntimeBlocker[];
  evidence: V082PrivateUploadRuntimeAdapterEvidence;
  redactionProof: V082PrivateUploadRuntimeRedactionProof;
  videos_insert_called: false;
  videos_insert_total_count: 0;
  commentThreads_insert_called: false;
  comment_create_update_delete_called: false;
  visibility_changed: false;
  R2_upload: false;
  DB_write: false;
  product_assets_write: false;
  n8n_webhook_called: false;
  raw_urls_printed: false;
  raw_video_ids_printed: false;
  raw_channel_ids_printed: false;
  secrets_printed: false;
  fake_success: false;
};

export function buildV082PrivateUploadRuntimeAdapterReadiness(
  input: V082PrivateUploadRuntimeAdapterReadinessInput = {}
): V082PrivateUploadRuntimeAdapterReadiness {
  const normalized = normalizeInput(input);
  const evidence = {
    oauthConfigured: normalized.oauthConfigured,
    tokenProviderConfigured: normalized.tokenProviderConfigured,
    tokenReadinessProviderStatusPresent: normalized.tokenReadinessProviderStatusPresent,
    tokenProviderReady: normalized.tokenProviderReady,
    tokenReady: normalized.tokenReady,
    uploadScopeReady: normalized.uploadScopeReady,
    tokenFileSafeAndReadable: normalized.tokenFileSafeAndReadable,
    videoAssetResolverConfigured: normalized.videoAssetResolverConfigured,
    uploadPackageResolverConfigured: normalized.uploadPackageResolverConfigured,
    duplicateGuardConfigured: normalized.duplicateGuardConfigured,
    disclosureGuardConfigured: normalized.disclosureGuardConfigured
  };
  const blockers = buildBlockers(normalized);
  const ready = blockers.length === 0;

  return {
    version: "v082",
    ready,
    adapterMode: ready ? "real_candidate" : "blocked",
    serverOnly: true,
    serverOnlyContextPresent: normalized.serverOnlyContext,
    canCallVideosInsert: ready,
    canCallCommentThreadsInsert: false,
    executionAllowedInThisPr: false,
    requiresFreshExecutionApproval: true,
    freshApprovalReused: false,
    allowedVisibility: "private",
    requestedVisibility: normalized.requestedVisibility,
    maxItems: 1,
    requestedMaxItems: normalized.maxItems,
    safeToUpload: false,
    SAFE_TO_UPLOAD: false,
    safeToPublicUpload: false,
    SAFE_TO_PUBLIC_UPLOAD: false,
    commentAutomationAllowed: false,
    schedulerExecutionAllowed: false,
    blockers,
    evidence,
    redactionProof: buildRedactionProof(),
    videos_insert_called: false,
    videos_insert_total_count: 0,
    commentThreads_insert_called: false,
    comment_create_update_delete_called: false,
    visibility_changed: false,
    R2_upload: false,
    DB_write: false,
    product_assets_write: false,
    n8n_webhook_called: false,
    raw_urls_printed: false,
    raw_video_ids_printed: false,
    raw_channel_ids_printed: false,
    secrets_printed: false,
    fake_success: false
  };
}

export function buildV082PrivateUploadRuntimeReadinessReport(
  readiness: V082PrivateUploadRuntimeAdapterReadiness
): V082PrivateUploadRuntimeReadinessReport {
  return {
    version: "v082",
    FINAL_STATUS: readiness.ready
      ? "READY_FOR_PRIVATE_PILOT_EXECUTION_APPROVAL"
      : "BLOCKED_V082_PRIVATE_UPLOAD_RUNTIME_ADAPTER_NOT_READY",
    ready: readiness.ready,
    adapterMode: readiness.adapterMode,
    serverOnly: true,
    canCallVideosInsert: readiness.canCallVideosInsert,
    canCallCommentThreadsInsert: false,
    executionAllowedInThisPr: false,
    requiresFreshExecutionApproval: true,
    freshApprovalReused: false,
    allowedVisibility: "private",
    requestedVisibility: readiness.requestedVisibility,
    maxItems: 1,
    requestedMaxItems: readiness.requestedMaxItems,
    SAFE_TO_UPLOAD: false,
    safeToUpload: false,
    SAFE_TO_PUBLIC_UPLOAD: false,
    safeToPublicUpload: false,
    blockers: readiness.blockers,
    evidence: readiness.evidence,
    redactionProof: readiness.redactionProof,
    videos_insert_called: false,
    videos_insert_total_count: 0,
    commentThreads_insert_called: false,
    comment_create_update_delete_called: false,
    visibility_changed: false,
    R2_upload: false,
    DB_write: false,
    product_assets_write: false,
    n8n_webhook_called: false,
    raw_urls_printed: false,
    raw_video_ids_printed: false,
    raw_channel_ids_printed: false,
    secrets_printed: false,
    fake_success: false
  };
}

function normalizeInput(input: V082PrivateUploadRuntimeAdapterReadinessInput) {
  const tokenProviderReadiness = input.tokenProviderReadiness ?? null;
  const tokenReadinessProviderStatusPresent = tokenProviderReadiness !== null;

  return {
    serverOnlyContext: input.serverOnlyContext ?? true,
    oauthConfigured: input.oauthConfigured ?? false,
    tokenProviderConfigured: input.tokenProviderConfigured ?? false,
    tokenReadinessProviderStatusPresent,
    tokenProviderReady: tokenProviderReadiness?.providerReady ?? false,
    tokenReady: tokenProviderReadiness?.tokenReady ?? false,
    uploadScopeReady: tokenProviderReadiness?.uploadScopeReady ?? false,
    tokenFileSafeAndReadable: tokenProviderReadiness?.tokenFileSafeAndReadable ?? false,
    videoAssetResolverConfigured: input.videoAssetResolverConfigured ?? false,
    uploadPackageResolverConfigured: input.uploadPackageResolverConfigured ?? false,
    duplicateGuardConfigured: input.duplicateGuardConfigured ?? false,
    disclosureGuardConfigured: input.disclosureGuardConfigured ?? false,
    requestedVisibility: input.requestedVisibility ?? "private",
    commentAutomationRequested: input.commentAutomationRequested ?? false,
    schedulerExecutionRequested: input.schedulerExecutionRequested ?? false,
    maxItems: input.maxItems ?? 1,
    realUploadExecutionRequested: input.realUploadExecutionRequested ?? false
  };
}

function buildBlockers(
  input: ReturnType<typeof normalizeInput>
): V082PrivateUploadRuntimeBlocker[] {
  const blockers: V082PrivateUploadRuntimeBlocker[] = [];

  if (!input.serverOnlyContext) {
    blockers.push("BLOCKED_V082_SERVER_ONLY_CONTEXT_REQUIRED");
  }
  if (!input.oauthConfigured) {
    blockers.push("BLOCKED_V082_YOUTUBE_OAUTH_NOT_CONFIGURED");
  }
  if (!input.tokenProviderConfigured) {
    blockers.push("BLOCKED_V082_TOKEN_PROVIDER_NOT_CONFIGURED");
  }
  if (!input.tokenReadinessProviderStatusPresent) {
    blockers.push("BLOCKED_V082_TOKEN_READINESS_PROVIDER_STATUS_REQUIRED");
  }
  if (input.tokenReadinessProviderStatusPresent && !input.tokenProviderReady) {
    blockers.push("BLOCKED_V082_TOKEN_PROVIDER_NOT_READY");
  }
  if (!input.tokenReady) {
    blockers.push("BLOCKED_V082_TOKEN_NOT_READY");
  }
  if (input.tokenReadinessProviderStatusPresent && !input.uploadScopeReady) {
    blockers.push("BLOCKED_V082_TOKEN_UPLOAD_SCOPE_NOT_READY");
  }
  if (input.tokenReadinessProviderStatusPresent && !input.tokenFileSafeAndReadable) {
    blockers.push("BLOCKED_V082_TOKEN_FILE_UNSAFE_OR_UNREADABLE");
  }
  if (!input.videoAssetResolverConfigured) {
    blockers.push("BLOCKED_V082_VIDEO_ASSET_RESOLVER_NOT_CONFIGURED");
  }
  if (!input.uploadPackageResolverConfigured) {
    blockers.push("BLOCKED_V082_UPLOAD_PACKAGE_RESOLVER_NOT_CONFIGURED");
  }
  if (!input.duplicateGuardConfigured) {
    blockers.push("BLOCKED_V082_DUPLICATE_GUARD_NOT_CONFIGURED");
  }
  if (!input.disclosureGuardConfigured) {
    blockers.push("BLOCKED_V082_DISCLOSURE_GUARD_NOT_CONFIGURED");
  }
  if (input.requestedVisibility === "public") {
    blockers.push("BLOCKED_V082_PUBLIC_UPLOAD_NOT_ALLOWED");
  }
  if (input.requestedVisibility === "unlisted") {
    blockers.push("BLOCKED_V082_UNLISTED_UPLOAD_NOT_ALLOWED");
  }
  if (input.maxItems !== 1) {
    blockers.push("BLOCKED_V082_MAX_ITEMS_NOT_ONE");
  }
  if (input.commentAutomationRequested) {
    blockers.push("BLOCKED_V082_COMMENT_AUTOMATION_NOT_ALLOWED");
  }
  if (input.schedulerExecutionRequested) {
    blockers.push("BLOCKED_V082_SCHEDULER_EXECUTION_NOT_ALLOWED");
  }
  if (input.realUploadExecutionRequested) {
    blockers.push("BLOCKED_V082_REAL_UPLOAD_EXECUTION_NOT_ALLOWED_IN_THIS_PR");
  }

  return dedupe(blockers);
}

function buildRedactionProof(): V082PrivateUploadRuntimeRedactionProof {
  return {
    rawUrlsPrinted: false,
    rawVideoIdsPrinted: false,
    rawChannelIdsPrinted: false,
    secretsPrinted: false,
    fakeSuccess: false
  };
}

function dedupe<T>(values: T[]) {
  return [...new Set(values)];
}
