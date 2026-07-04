import type { ChannelKey } from "../multi-channel/channelProfiles";
import type {
  V076UploadResultPlatform,
  V076UploadResultStoreItem
} from "./v076UploadResultStore";

export type V077AutopilotSchedulerMode = "scaffold_only";
export type V077AutopilotIntendedAction = "upload_prepare" | "comment_prepare";
export type V077SchedulerCandidateReadinessStatus = "blocked" | "plan_only";

export type V077AutopilotSchedulerBlocker =
  | "BLOCKED_V077_SCHEDULER_DISABLED"
  | "BLOCKED_V077_SAFE_TO_UPLOAD_FALSE"
  | "BLOCKED_V077_UPLOAD_FEATURE_DISABLED"
  | "BLOCKED_V077_COMMENT_FEATURE_DISABLED"
  | "BLOCKED_V077_APPROVAL_MISSING"
  | "BLOCKED_V077_UPLOAD_RESULT_EVIDENCE_MISSING"
  | "BLOCKED_V077_AFFILIATE_URL_MISSING"
  | "BLOCKED_V077_COUPANG_DISCLOSURE_MISSING"
  | "BLOCKED_V077_TARGET_CHANNEL_EVIDENCE_MISSING"
  | "BLOCKED_V077_PUBLIC_VISIBILITY_NOT_APPROVED"
  | "BLOCKED_V077_DUPLICATE_GUARD_NOT_SATISFIED"
  | "BLOCKED_V077_REAL_ADAPTER_DISABLED"
  | "BLOCKED_V077_MUTATION_ATTEMPT_BLOCKED";

export type V077AutopilotSchedulerCandidateInput = {
  queueItemId: string;
  uploadPackageId: string;
  channelKey: ChannelKey;
  platform: V076UploadResultPlatform;
  intendedAction: V077AutopilotIntendedAction;
  nextEligibleAt: string | null;
  affiliateUrlPresent: boolean;
  affiliateUrlHashPrefix: string | null;
  coupangDisclosurePresent: boolean;
  targetChannelEvidencePresent: boolean;
  targetChannelHashPrefix: string | null;
  duplicateGuardSatisfied: boolean;
  uploadPackageReady: boolean;
  commentPackageReady: boolean;
  uploadResultStoreItem: V076UploadResultStoreItem | null;
};

export type V077AutopilotSchedulerInput = {
  schedulerPlanId: string;
  generatedAt: string;
  mode?: V077AutopilotSchedulerMode;
  enabled?: boolean;
  safeToUpload?: false;
  uploadFeatureEnabled?: boolean;
  commentFeatureEnabled?: boolean;
  approvalPresent?: boolean;
  publicVisibilityApproved?: boolean;
  realAdapterEnabled?: boolean;
  mutationAttempted?: boolean;
  candidates: V077AutopilotSchedulerCandidateInput[];
};

export type V077AutopilotSchedulerCandidate = {
  queueItemId: string;
  uploadPackageId: string;
  channelKey: ChannelKey;
  platform: V076UploadResultPlatform;
  intendedAction: V077AutopilotIntendedAction;
  readinessStatus: V077SchedulerCandidateReadinessStatus;
  nextEligibleAt: string | null;
  blockers: V077AutopilotSchedulerBlocker[];
  evidencePresent: {
    queueItem: boolean;
    uploadPackage: boolean;
    uploadResultEvidence: boolean;
    affiliateUrl: boolean;
    coupangDisclosure: boolean;
    targetChannel: boolean;
    duplicateGuard: boolean;
    commentPackage: boolean;
  };
  hashPrefixes: {
    affiliateUrlHashPrefix: string | null;
    targetChannelHashPrefix: string | null;
    youtubeVideoIdHashPrefix: string | null;
    channelIdHashPrefix: string | null;
  };
  sanitizedReason: string;
};

export type V077AutopilotSchedulerPlan = {
  schedulerPlanId: string;
  generatedAt: string;
  mode: V077AutopilotSchedulerMode;
  enabled: false;
  safeToUpload: false;
  safeToComment: false;
  approvalRequired: true;
  candidateCount: number;
  blockedCount: number;
  nextEligibleAt: string | null;
  blockers: V077AutopilotSchedulerBlocker[];
  candidates: V077AutopilotSchedulerCandidate[];
  uploadActionCalled: false;
  commentActionCalled: false;
  videos_insert_called: false;
  commentThreads_insert_called: false;
  comment_create_update_delete_called: false;
  visibility_changed: false;
  R2_upload: false;
  DB_write: false;
  product_assets_write: false;
  raw_urls_printed: false;
  raw_video_ids_printed: false;
  raw_channel_ids_printed: false;
  secrets_printed: false;
  fake_success: false;
};

export type V077AutopilotSchedulerReport = V077AutopilotSchedulerPlan & {
  version: "v077";
  FINAL_STATUS: "BLOCKED_V077_AUTOPILOT_SCHEDULER_SCAFFOLD_ONLY";
  SAFE_TO_UPLOAD: false;
};

export function buildV077AutopilotSchedulerPlan(
  input: V077AutopilotSchedulerInput
): V077AutopilotSchedulerPlan {
  const schedulerState = normalizeSchedulerState(input);
  const candidates = input.candidates.map((candidate) => buildCandidate(candidate, schedulerState));

  return {
    schedulerPlanId: input.schedulerPlanId,
    generatedAt: input.generatedAt,
    mode: input.mode ?? "scaffold_only",
    enabled: false,
    safeToUpload: false,
    safeToComment: false,
    approvalRequired: true,
    candidateCount: candidates.length,
    blockedCount: candidates.filter((candidate) => candidate.readinessStatus === "blocked").length,
    nextEligibleAt: resolveNextEligibleAt(candidates),
    blockers: dedupe(candidates.flatMap((candidate) => candidate.blockers)),
    candidates,
    uploadActionCalled: false,
    commentActionCalled: false,
    videos_insert_called: false,
    commentThreads_insert_called: false,
    comment_create_update_delete_called: false,
    visibility_changed: false,
    R2_upload: false,
    DB_write: false,
    product_assets_write: false,
    raw_urls_printed: false,
    raw_video_ids_printed: false,
    raw_channel_ids_printed: false,
    secrets_printed: false,
    fake_success: false
  };
}

export function buildV077AutopilotSchedulerReport(
  plan: V077AutopilotSchedulerPlan
): V077AutopilotSchedulerReport {
  return {
    version: "v077",
    FINAL_STATUS: "BLOCKED_V077_AUTOPILOT_SCHEDULER_SCAFFOLD_ONLY",
    SAFE_TO_UPLOAD: false,
    ...plan,
    safeToUpload: false,
    safeToComment: false,
    uploadActionCalled: false,
    commentActionCalled: false,
    videos_insert_called: false,
    commentThreads_insert_called: false,
    comment_create_update_delete_called: false,
    visibility_changed: false,
    R2_upload: false,
    DB_write: false,
    product_assets_write: false,
    raw_urls_printed: false,
    raw_video_ids_printed: false,
    raw_channel_ids_printed: false,
    secrets_printed: false,
    fake_success: false
  };
}

function buildCandidate(
  candidate: V077AutopilotSchedulerCandidateInput,
  schedulerState: Required<Pick<
    V077AutopilotSchedulerInput,
    "enabled" | "uploadFeatureEnabled" | "commentFeatureEnabled" | "approvalPresent" |
      "publicVisibilityApproved" | "realAdapterEnabled" | "mutationAttempted"
  >>
): V077AutopilotSchedulerCandidate {
  const uploadResultEvidence = candidate.uploadResultStoreItem?.sanitizedStatus === "stored";
  const blockers = buildCandidateBlockers(candidate, schedulerState, uploadResultEvidence);
  const readinessStatus: V077SchedulerCandidateReadinessStatus = blockers.length === 0 ? "plan_only" : "blocked";

  return {
    queueItemId: candidate.queueItemId,
    uploadPackageId: candidate.uploadPackageId,
    channelKey: candidate.channelKey,
    platform: candidate.platform,
    intendedAction: candidate.intendedAction,
    readinessStatus,
    nextEligibleAt: candidate.nextEligibleAt,
    blockers,
    evidencePresent: {
      queueItem: Boolean(candidate.queueItemId),
      uploadPackage: candidate.uploadPackageReady,
      uploadResultEvidence,
      affiliateUrl: candidate.affiliateUrlPresent,
      coupangDisclosure: candidate.coupangDisclosurePresent,
      targetChannel: candidate.targetChannelEvidencePresent,
      duplicateGuard: candidate.duplicateGuardSatisfied,
      commentPackage: candidate.commentPackageReady
    },
    hashPrefixes: {
      affiliateUrlHashPrefix: candidate.affiliateUrlHashPrefix,
      targetChannelHashPrefix: candidate.targetChannelHashPrefix,
      youtubeVideoIdHashPrefix: candidate.uploadResultStoreItem?.youtubeVideoIdHashPrefix ?? null,
      channelIdHashPrefix: candidate.uploadResultStoreItem?.channelIdHashPrefix ?? null
    },
    sanitizedReason: readinessStatus === "blocked"
      ? "blocked: scaffold-only scheduler never executes actions"
      : "plan-only: scaffold-only scheduler report"
  };
}

function buildCandidateBlockers(
  candidate: V077AutopilotSchedulerCandidateInput,
  schedulerState: Required<Pick<
    V077AutopilotSchedulerInput,
    "enabled" | "uploadFeatureEnabled" | "commentFeatureEnabled" | "approvalPresent" |
      "publicVisibilityApproved" | "realAdapterEnabled" | "mutationAttempted"
  >>,
  uploadResultEvidence: boolean
): V077AutopilotSchedulerBlocker[] {
  const blockers: V077AutopilotSchedulerBlocker[] = [];

  if (!schedulerState.enabled) {
    blockers.push("BLOCKED_V077_SCHEDULER_DISABLED");
  }
  blockers.push("BLOCKED_V077_SAFE_TO_UPLOAD_FALSE");
  if (candidate.intendedAction === "upload_prepare" && !schedulerState.uploadFeatureEnabled) {
    blockers.push("BLOCKED_V077_UPLOAD_FEATURE_DISABLED");
  }
  if (candidate.intendedAction === "comment_prepare" && !schedulerState.commentFeatureEnabled) {
    blockers.push("BLOCKED_V077_COMMENT_FEATURE_DISABLED");
  }
  if (!schedulerState.approvalPresent) {
    blockers.push("BLOCKED_V077_APPROVAL_MISSING");
  }
  if (candidate.intendedAction === "comment_prepare" && !uploadResultEvidence) {
    blockers.push("BLOCKED_V077_UPLOAD_RESULT_EVIDENCE_MISSING");
  }
  if (!candidate.affiliateUrlPresent) {
    blockers.push("BLOCKED_V077_AFFILIATE_URL_MISSING");
  }
  if (!candidate.coupangDisclosurePresent) {
    blockers.push("BLOCKED_V077_COUPANG_DISCLOSURE_MISSING");
  }
  if (!candidate.targetChannelEvidencePresent) {
    blockers.push("BLOCKED_V077_TARGET_CHANNEL_EVIDENCE_MISSING");
  }
  if (!schedulerState.publicVisibilityApproved) {
    blockers.push("BLOCKED_V077_PUBLIC_VISIBILITY_NOT_APPROVED");
  }
  if (!candidate.duplicateGuardSatisfied) {
    blockers.push("BLOCKED_V077_DUPLICATE_GUARD_NOT_SATISFIED");
  }
  if (!schedulerState.realAdapterEnabled) {
    blockers.push("BLOCKED_V077_REAL_ADAPTER_DISABLED");
  }
  if (schedulerState.mutationAttempted) {
    blockers.push("BLOCKED_V077_MUTATION_ATTEMPT_BLOCKED");
  }

  return dedupe(blockers);
}

function normalizeSchedulerState(input: V077AutopilotSchedulerInput) {
  return {
    enabled: input.enabled ?? false,
    uploadFeatureEnabled: input.uploadFeatureEnabled ?? false,
    commentFeatureEnabled: input.commentFeatureEnabled ?? false,
    approvalPresent: input.approvalPresent ?? false,
    publicVisibilityApproved: input.publicVisibilityApproved ?? false,
    realAdapterEnabled: input.realAdapterEnabled ?? false,
    mutationAttempted: input.mutationAttempted ?? false
  };
}

function resolveNextEligibleAt(candidates: V077AutopilotSchedulerCandidate[]) {
  const timestamps = candidates
    .map((candidate) => candidate.nextEligibleAt)
    .filter((value): value is string => Boolean(value))
    .sort();
  return timestamps[0] ?? null;
}

function dedupe<T>(values: T[]) {
  return [...new Set(values)];
}
