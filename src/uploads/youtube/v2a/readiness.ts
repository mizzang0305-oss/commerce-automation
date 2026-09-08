import {
  YOUTUBE_UPLOAD_SCOPE,
  YOUTUBE_UPLOAD_V2A_CANONICAL_CHANNEL_ID_PATTERN,
  YOUTUBE_UPLOAD_V2A_DEFAULT_FLAGS,
  YOUTUBE_UPLOAD_V2A_INTENDED_DAILY_COUNT,
  YOUTUBE_UPLOAD_V2A_PRIVATE_CANARY_BLOCKED,
  YOUTUBE_UPLOAD_V2A_PRIVATE_CANARY_READY
} from "./constants";
import {
  validateV2AUploadPackage,
  type V2AUploadPackage,
  type V2AUploadPackageExpectedBindings
} from "./uploadPackage";

export type V2ASafetyFlags = {
  YOUTUBE_UPLOAD_ENABLED: boolean;
  YOUTUBE_AUTO_UPLOAD: boolean;
  YOUTUBE_PUBLIC_UPLOAD_ENABLED: boolean;
  YOUTUBE_PUBLICATION_ENABLED: boolean;
  PUBLIC_UPLOAD_ENABLED: boolean;
  SAFE_TO_UPLOAD: boolean;
};

export type V2AAuthEvidence = {
  authReady: boolean;
  expiresAt: string | null;
  scopes: readonly string[];
  sanitizedProviderIdentity: string | null;
  expectedAccountChannelRelationship: string | null;
  runtimeEvidence: boolean;
};

export type V2AApiProjectEvidence = {
  googleCloudProjectId: string | null;
  youtubeDataApiEnabled: boolean | null;
  oauthClientConfigured: boolean | null;
  consentStatus: "testing" | "production" | "internal" | "unknown";
  auditVerificationStatus: "verified" | "not_required" | "unverified" | "restricted" | "unknown";
  uploadPrivacyRestrictionStatus: "none" | "private_only" | "restricted" | "unknown";
  observedAt: string | null;
  runtimeEvidence: boolean;
};

export type V2AQuotaEvidence = {
  videosInsertLimitUnits: number | null;
  videosInsertUsageUnits: number | null;
  videosInsertCostUnits: number | null;
  intendedCount: number;
  reservedRetryHeadroom: number | null;
  capturedAt: string | null;
  source: string | null;
  runtimeEvidence: boolean;
};

export type V2AVerifiedCapabilityEvidence = {
  pass: boolean;
  evidenceId: string | null;
  runtimeEvidence: boolean;
};

export type V2APrivateCanaryReadinessInput = {
  now?: string | Date;
  flags?: Partial<V2ASafetyFlags>;
  configuredTargetChannelId?: string | null;
  authenticatedChannelId?: string | null;
  operationSelectedChannelId?: string | null;
  auth?: V2AAuthEvidence | null;
  apiProject?: V2AApiProjectEvidence | null;
  quota?: V2AQuotaEvidence | null;
  uploadPackage?: V2AUploadPackage | null;
  expectedPackageBindings?: V2AUploadPackageExpectedBindings | null;
  packageApproved?: boolean;
  resumableAdapter?: V2AVerifiedCapabilityEvidence | null;
  idempotency?: (V2AVerifiedCapabilityEvidence & { duplicateSuccessfulReceiptFound: boolean }) | null;
  uploadReceiptPathReady?: boolean;
  postUploadReadbackReady?: boolean;
};

export type V2APrivateCanaryReadinessBlocker =
  | "V2A_SAFETY_FLAGS_NOT_DISABLED"
  | "V2A_TARGET_CHANNEL_ID_INVALID"
  | "V2A_AUTHENTICATED_CHANNEL_ID_INVALID"
  | "V2A_OPERATION_CHANNEL_ID_INVALID"
  | "V2A_TARGET_CHANNEL_BINDING_MISMATCH"
  | "V2A_AUTH_MISSING"
  | "V2A_AUTH_NOT_READY"
  | "V2A_AUTH_EXPIRED_OR_EXPIRY_UNKNOWN"
  | "V2A_AUTH_SANITIZED_IDENTITY_MISSING"
  | "V2A_AUTH_ACCOUNT_CHANNEL_RELATIONSHIP_UNKNOWN"
  | "V2A_AUTH_RUNTIME_EVIDENCE_MISSING"
  | "V2A_YOUTUBE_UPLOAD_SCOPE_MISSING"
  | "V2A_API_PROJECT_STATUS_UNKNOWN"
  | "V2A_API_PROJECT_EVIDENCE_STALE_OR_FUTURE"
  | "V2A_YOUTUBE_DATA_API_DISABLED"
  | "V2A_OAUTH_CLIENT_NOT_CONFIGURED"
  | "V2A_PRIVATE_UPLOAD_RESTRICTED"
  | "V2A_QUOTA_EVIDENCE_MISSING"
  | "V2A_QUOTA_EVIDENCE_INVALID"
  | "V2A_QUOTA_EVIDENCE_STALE_OR_FUTURE"
  | "V2A_QUOTA_INTENDED_COUNT_MISMATCH"
  | "V2A_QUOTA_INSUFFICIENT"
  | "V2A_UPLOAD_PACKAGE_MISSING"
  | "V2A_UPLOAD_PACKAGE_EVIDENCE_MISSING"
  | "V2A_UPLOAD_PACKAGE_INVALID"
  | "V2A_UPLOAD_PACKAGE_NOT_APPROVED"
  | "V2A_RESUMABLE_ADAPTER_NOT_VERIFIED"
  | "V2A_IDEMPOTENCY_NOT_VERIFIED"
  | "V2A_DUPLICATE_SUCCESSFUL_RECEIPT_FOUND"
  | "V2A_UPLOAD_RECEIPT_PATH_NOT_READY"
  | "V2A_POST_UPLOAD_READBACK_NOT_READY";

export type V2APrivateCanaryReadinessReport = {
  FINAL_STATUS:
    | typeof YOUTUBE_UPLOAD_V2A_PRIVATE_CANARY_READY
    | typeof YOUTUBE_UPLOAD_V2A_PRIVATE_CANARY_BLOCKED;
  ready: boolean;
  uploadPackageDigest: string | null;
  targetChannelId: string | null;
  blockers: V2APrivateCanaryReadinessBlocker[];
  flags: V2ASafetyFlags;
  TARGET_CHANNEL_BINDING: "PASS" | "BLOCKED";
  OAUTH_READINESS: "PASS" | "BLOCKED";
  YOUTUBE_UPLOAD_SCOPE: "PASS" | "BLOCKED";
  API_PROJECT_STATUS: "KNOWN" | "UNKNOWN";
  QUOTA_READINESS: "PASS" | "BLOCKED";
  RESUMABLE_UPLOAD_ADAPTER: "PASS" | "BLOCKED";
  IDEMPOTENCY: "PASS" | "BLOCKED";
  PRIVATE_ONLY_GUARD: "PASS" | "BLOCKED";
  PRIVATE_CANARY_EXECUTED: "NO";
  BULK_UPLOAD: 0;
  PUBLIC_UPLOAD: 0;
  PLATFORM_UPLOAD: 0;
  quota: {
    remainingUnits: number | null;
    requiredUnits: number | null;
    intendedCount: number;
    reservedRetryHeadroom: number | null;
  };
};

export function evaluateV2APrivateCanaryReadiness(
  input: V2APrivateCanaryReadinessInput = {}
): V2APrivateCanaryReadinessReport {
  const flags: V2ASafetyFlags = { ...YOUTUBE_UPLOAD_V2A_DEFAULT_FLAGS, ...input.flags };
  const blockers: V2APrivateCanaryReadinessBlocker[] = [];
  const nowMs = resolveNow(input.now);

  const safetyPass = Object.values(flags).every((value) => value === false);
  if (!safetyPass) blockers.push("V2A_SAFETY_FLAGS_NOT_DISABLED");

  const targetChannelPass = channelBindingReady(input);
  addChannelBlockers(input, blockers);

  const authResult = evaluateAuth(input.auth, nowMs);
  blockers.push(...authResult.blockers);

  const apiResult = evaluateApiProject(input.apiProject, nowMs);
  blockers.push(...apiResult.blockers);

  const quotaResult = evaluateQuota(input.quota, nowMs);
  blockers.push(...quotaResult.blockers);

  const packageResult = evaluatePackage(input);
  blockers.push(...packageResult.blockers);

  const resumablePass = verifiedCapability(input.resumableAdapter);
  if (!resumablePass) blockers.push("V2A_RESUMABLE_ADAPTER_NOT_VERIFIED");

  const idempotencyPass = verifiedCapability(input.idempotency) &&
    input.idempotency?.duplicateSuccessfulReceiptFound === false;
  if (!verifiedCapability(input.idempotency)) blockers.push("V2A_IDEMPOTENCY_NOT_VERIFIED");
  if (input.idempotency?.duplicateSuccessfulReceiptFound === true) {
    blockers.push("V2A_DUPLICATE_SUCCESSFUL_RECEIPT_FOUND");
  }
  if (input.uploadReceiptPathReady !== true) blockers.push("V2A_UPLOAD_RECEIPT_PATH_NOT_READY");
  if (input.postUploadReadbackReady !== true) blockers.push("V2A_POST_UPLOAD_READBACK_NOT_READY");

  const uniqueBlockers = unique(blockers);
  const ready = uniqueBlockers.length === 0;

  return {
    FINAL_STATUS: ready
      ? YOUTUBE_UPLOAD_V2A_PRIVATE_CANARY_READY
      : YOUTUBE_UPLOAD_V2A_PRIVATE_CANARY_BLOCKED,
    ready,
    uploadPackageDigest: input.uploadPackage?.uploadPackageDigest ?? null,
    targetChannelId: input.configuredTargetChannelId ?? null,
    blockers: uniqueBlockers,
    flags,
    TARGET_CHANNEL_BINDING: targetChannelPass ? "PASS" : "BLOCKED",
    OAUTH_READINESS: authResult.authReady ? "PASS" : "BLOCKED",
    YOUTUBE_UPLOAD_SCOPE: authResult.scopeReady ? "PASS" : "BLOCKED",
    API_PROJECT_STATUS: apiResult.statusKnown ? "KNOWN" : "UNKNOWN",
    QUOTA_READINESS: quotaResult.ready ? "PASS" : "BLOCKED",
    RESUMABLE_UPLOAD_ADAPTER: resumablePass ? "PASS" : "BLOCKED",
    IDEMPOTENCY: idempotencyPass ? "PASS" : "BLOCKED",
    PRIVATE_ONLY_GUARD: packageResult.privateOnly ? "PASS" : "BLOCKED",
    PRIVATE_CANARY_EXECUTED: "NO",
    BULK_UPLOAD: 0,
    PUBLIC_UPLOAD: 0,
    PLATFORM_UPLOAD: 0,
    quota: {
      remainingUnits: quotaResult.remainingUnits,
      requiredUnits: quotaResult.requiredUnits,
      intendedCount: input.quota?.intendedCount ?? YOUTUBE_UPLOAD_V2A_INTENDED_DAILY_COUNT,
      reservedRetryHeadroom: input.quota?.reservedRetryHeadroom ?? null
    }
  };
}

function addChannelBlockers(
  input: V2APrivateCanaryReadinessInput,
  blockers: V2APrivateCanaryReadinessBlocker[]
) {
  const configured = input.configuredTargetChannelId ?? "";
  const authenticated = input.authenticatedChannelId ?? "";
  const operationSelected = input.operationSelectedChannelId ?? "";
  if (!validChannelId(configured)) blockers.push("V2A_TARGET_CHANNEL_ID_INVALID");
  if (!validChannelId(authenticated)) blockers.push("V2A_AUTHENTICATED_CHANNEL_ID_INVALID");
  if (!validChannelId(operationSelected)) blockers.push("V2A_OPERATION_CHANNEL_ID_INVALID");
  if (
    validChannelId(configured) &&
    validChannelId(authenticated) &&
    validChannelId(operationSelected) &&
    (configured !== authenticated || configured !== operationSelected || configured !== input.uploadPackage?.targetChannelId)
  ) {
    blockers.push("V2A_TARGET_CHANNEL_BINDING_MISMATCH");
  }
}

function channelBindingReady(input: V2APrivateCanaryReadinessInput) {
  const configured = input.configuredTargetChannelId ?? "";
  return validChannelId(configured) &&
    configured === input.authenticatedChannelId &&
    configured === input.operationSelectedChannelId &&
    configured === input.uploadPackage?.targetChannelId;
}

function evaluateAuth(auth: V2AAuthEvidence | null | undefined, nowMs: number) {
  const blockers: V2APrivateCanaryReadinessBlocker[] = [];
  if (!auth) {
    return {
      authReady: false,
      scopeReady: false,
      blockers: ["V2A_AUTH_MISSING", "V2A_YOUTUBE_UPLOAD_SCOPE_MISSING"] as V2APrivateCanaryReadinessBlocker[]
    };
  }
  const scopeReady = auth.scopes.includes(YOUTUBE_UPLOAD_SCOPE);
  const expiryMs = auth.expiresAt ? Date.parse(auth.expiresAt) : Number.NaN;
  if (!auth.authReady) blockers.push("V2A_AUTH_NOT_READY");
  if (!Number.isFinite(expiryMs) || expiryMs <= nowMs) blockers.push("V2A_AUTH_EXPIRED_OR_EXPIRY_UNKNOWN");
  if (!sanitizedIdentityPresent(auth.sanitizedProviderIdentity)) blockers.push("V2A_AUTH_SANITIZED_IDENTITY_MISSING");
  if (!nonEmpty(auth.expectedAccountChannelRelationship)) blockers.push("V2A_AUTH_ACCOUNT_CHANNEL_RELATIONSHIP_UNKNOWN");
  if (!auth.runtimeEvidence) blockers.push("V2A_AUTH_RUNTIME_EVIDENCE_MISSING");
  if (!scopeReady) blockers.push("V2A_YOUTUBE_UPLOAD_SCOPE_MISSING");
  return { authReady: blockers.length === 0, scopeReady, blockers };
}

function evaluateApiProject(apiProject: V2AApiProjectEvidence | null | undefined, nowMs: number) {
  const blockers: V2APrivateCanaryReadinessBlocker[] = [];
  const statusKnown = Boolean(
    apiProject?.runtimeEvidence &&
    nonEmpty(apiProject.googleCloudProjectId) &&
    typeof apiProject.youtubeDataApiEnabled === "boolean" &&
    typeof apiProject.oauthClientConfigured === "boolean" &&
    apiProject.consentStatus !== "unknown" &&
    apiProject.auditVerificationStatus !== "unknown" &&
    apiProject.uploadPrivacyRestrictionStatus !== "unknown" &&
    validTimestamp(apiProject.observedAt)
  );
  if (!statusKnown) blockers.push("V2A_API_PROJECT_STATUS_UNKNOWN");
  if (statusKnown && !freshTimestamp(apiProject!.observedAt, nowMs)) {
    blockers.push("V2A_API_PROJECT_EVIDENCE_STALE_OR_FUTURE");
  }
  if (apiProject?.youtubeDataApiEnabled === false) blockers.push("V2A_YOUTUBE_DATA_API_DISABLED");
  if (apiProject?.oauthClientConfigured === false) blockers.push("V2A_OAUTH_CLIENT_NOT_CONFIGURED");
  if (apiProject?.uploadPrivacyRestrictionStatus === "restricted") blockers.push("V2A_PRIVATE_UPLOAD_RESTRICTED");
  return { statusKnown, blockers };
}

function evaluateQuota(quota: V2AQuotaEvidence | null | undefined, nowMs: number) {
  const blockers: V2APrivateCanaryReadinessBlocker[] = [];
  if (!quota) {
    return {
      ready: false,
      remainingUnits: null,
      requiredUnits: null,
      blockers: ["V2A_QUOTA_EVIDENCE_MISSING"] as V2APrivateCanaryReadinessBlocker[]
    };
  }
  const valid = quota.runtimeEvidence &&
    nonNegativeInteger(quota.videosInsertLimitUnits) &&
    nonNegativeInteger(quota.videosInsertUsageUnits) &&
    positiveInteger(quota.videosInsertCostUnits) &&
    nonNegativeInteger(quota.reservedRetryHeadroom) &&
    validTimestamp(quota.capturedAt) &&
    nonEmpty(quota.source);
  if (!valid) blockers.push("V2A_QUOTA_EVIDENCE_INVALID");
  if (valid && !freshTimestamp(quota.capturedAt, nowMs)) {
    blockers.push("V2A_QUOTA_EVIDENCE_STALE_OR_FUTURE");
  }
  if (quota.intendedCount !== YOUTUBE_UPLOAD_V2A_INTENDED_DAILY_COUNT) {
    blockers.push("V2A_QUOTA_INTENDED_COUNT_MISMATCH");
  }

  const remainingUnits = valid
    ? quota.videosInsertLimitUnits! - quota.videosInsertUsageUnits!
    : null;
  const requiredUnits = valid
    ? (quota.intendedCount + quota.reservedRetryHeadroom!) * quota.videosInsertCostUnits!
    : null;
  if (valid && (remainingUnits! < requiredUnits! || remainingUnits! < 0)) {
    blockers.push("V2A_QUOTA_INSUFFICIENT");
  }
  return { ready: blockers.length === 0, remainingUnits, requiredUnits, blockers };
}

function evaluatePackage(input: V2APrivateCanaryReadinessInput) {
  const blockers: V2APrivateCanaryReadinessBlocker[] = [];
  if (!input.uploadPackage) {
    return {
      privateOnly: false,
      blockers: ["V2A_UPLOAD_PACKAGE_MISSING"] as V2APrivateCanaryReadinessBlocker[]
    };
  }
  if (!input.expectedPackageBindings) blockers.push("V2A_UPLOAD_PACKAGE_EVIDENCE_MISSING");
  const validation = validateV2AUploadPackage(
    input.uploadPackage,
    input.expectedPackageBindings ?? undefined
  );
  if (!validation.valid) blockers.push("V2A_UPLOAD_PACKAGE_INVALID");
  if (input.packageApproved !== true) blockers.push("V2A_UPLOAD_PACKAGE_NOT_APPROVED");
  return {
    privateOnly: input.uploadPackage.visibility === "private" && validation.valid,
    blockers
  };
}

function verifiedCapability(evidence: V2AVerifiedCapabilityEvidence | null | undefined) {
  return evidence?.pass === true && evidence.runtimeEvidence === true && nonEmpty(evidence.evidenceId);
}

function validChannelId(value: unknown) {
  return typeof value === "string" && YOUTUBE_UPLOAD_V2A_CANONICAL_CHANNEL_ID_PATTERN.test(value);
}

function sanitizedIdentityPresent(value: string | null) {
  return nonEmpty(value) && !value.includes("@") && !/\s/u.test(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validTimestamp(value: string | null) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function freshTimestamp(value: string | null, nowMs: number) {
  const observedMs = typeof value === "string" ? Date.parse(value) : Number.NaN;
  const maxAgeMs = 15 * 60 * 1_000;
  const maxFutureSkewMs = 5 * 60 * 1_000;
  return Number.isFinite(observedMs) && observedMs >= nowMs - maxAgeMs && observedMs <= nowMs + maxFutureSkewMs;
}

function nonNegativeInteger(value: number | null): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function positiveInteger(value: number | null): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function resolveNow(now: string | Date | undefined) {
  if (now instanceof Date) return now.getTime();
  if (typeof now === "string") {
    const parsed = Date.parse(now);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

function unique<T>(values: readonly T[]) {
  return [...new Set(values)];
}
