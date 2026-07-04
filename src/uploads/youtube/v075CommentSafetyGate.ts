export type V075UploadResultStatus =
  | "uploaded_public"
  | "uploaded"
  | "failed"
  | "blocked"
  | "missing";

export type V075UploadVisibility = "public" | "private" | "unlisted" | null;

export type V075CommentWriterBlocker =
  | "BLOCKED_V075_COMMENT_WRITER_DISABLED"
  | "BLOCKED_V075_UPLOAD_RESULT_MISSING"
  | "BLOCKED_V075_VIDEO_ID_MISSING"
  | "BLOCKED_V075_UPLOAD_NOT_PUBLIC"
  | "BLOCKED_V075_AFFILIATE_URL_MISSING"
  | "BLOCKED_V075_COUPANG_DISCLOSURE_MISSING"
  | "BLOCKED_V075_COMMENT_TEXT_MISSING"
  | "BLOCKED_V075_TARGET_CHANNEL_NOT_VERIFIED"
  | "BLOCKED_V075_DUPLICATE_GUARD_NOT_PASSED"
  | "BLOCKED_V075_COMMENT_APPROVAL_MISSING"
  | "BLOCKED_V075_REAL_COMMENT_MUTATION_FORBIDDEN"
  | "BLOCKED_V075_REAL_ADAPTER_DISABLED";

export type V075CommentSafetyGateInput = {
  uploadResultPresent: boolean;
  uploadResultStatus: V075UploadResultStatus;
  youtubeVideoIdPresent: boolean;
  uploadVisibility: V075UploadVisibility;
  affiliateUrlReady: boolean;
  coupangDisclosurePresent: boolean;
  commentTextReady: boolean;
  targetChannelVerified: boolean;
  duplicateGuardPassed: boolean;
  publicUploadPackageReady: boolean;
  commentFeatureEnabled: boolean;
  freshCommentApprovalPresent: boolean;
  realAdapterRequested?: boolean;
  realCommentMutationAttempted?: boolean;
};

export type V075CommentSafetyGate = {
  ready: boolean;
  commentWriteAllowed: boolean;
  safeToUpload: false;
  blocker: V075CommentWriterBlocker | null;
  blockers: V075CommentWriterBlocker[];
};

export function buildV075CommentSafetyGate(
  input: V075CommentSafetyGateInput
): V075CommentSafetyGate {
  const blockers = buildBlockers(input);
  const ready = blockers.length === 0;

  return {
    ready,
    commentWriteAllowed: ready,
    safeToUpload: false,
    blocker: blockers[0] ?? null,
    blockers
  };
}

function buildBlockers(input: V075CommentSafetyGateInput): V075CommentWriterBlocker[] {
  const blockers: V075CommentWriterBlocker[] = [];
  const uploadSucceeded = input.uploadResultStatus === "uploaded_public" ||
    input.uploadResultStatus === "uploaded";

  if (input.realCommentMutationAttempted) {
    blockers.push("BLOCKED_V075_REAL_COMMENT_MUTATION_FORBIDDEN");
  }
  if (input.realAdapterRequested) {
    blockers.push("BLOCKED_V075_REAL_ADAPTER_DISABLED");
  }
  if (!input.commentFeatureEnabled) {
    blockers.push("BLOCKED_V075_COMMENT_WRITER_DISABLED");
  }
  if (!input.uploadResultPresent || !uploadSucceeded || !input.publicUploadPackageReady) {
    blockers.push("BLOCKED_V075_UPLOAD_RESULT_MISSING");
  }
  if (!input.youtubeVideoIdPresent) {
    blockers.push("BLOCKED_V075_VIDEO_ID_MISSING");
  }
  if (input.uploadVisibility !== "public") {
    blockers.push("BLOCKED_V075_UPLOAD_NOT_PUBLIC");
  }
  if (!input.affiliateUrlReady) {
    blockers.push("BLOCKED_V075_AFFILIATE_URL_MISSING");
  }
  if (!input.coupangDisclosurePresent) {
    blockers.push("BLOCKED_V075_COUPANG_DISCLOSURE_MISSING");
  }
  if (!input.commentTextReady) {
    blockers.push("BLOCKED_V075_COMMENT_TEXT_MISSING");
  }
  if (!input.targetChannelVerified) {
    blockers.push("BLOCKED_V075_TARGET_CHANNEL_NOT_VERIFIED");
  }
  if (!input.duplicateGuardPassed) {
    blockers.push("BLOCKED_V075_DUPLICATE_GUARD_NOT_PASSED");
  }
  if (!input.freshCommentApprovalPresent) {
    blockers.push("BLOCKED_V075_COMMENT_APPROVAL_MISSING");
  }

  return dedupe(blockers);
}

function dedupe<T>(values: T[]) {
  return [...new Set(values)];
}
