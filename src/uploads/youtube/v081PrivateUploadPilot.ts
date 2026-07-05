import type { ChannelKey } from "../multi-channel/channelProfiles";
import {
  buildV076UploadResultStoreItem,
  buildV076UploadResultStoreSanitizedReport,
  type V076UploadResultStoreItem,
  type V076UploadResultStoreSanitizedReport
} from "./v076UploadResultStore";

export const APPROVE_YOUTUBE_PRIVATE_UPLOAD_PILOT_1_ITEM_NO_COMMENT =
  "APPROVE_YOUTUBE_PRIVATE_UPLOAD_PILOT_1_ITEM_NO_COMMENT" as const;

export type V081PrivateUploadPilotMode = "controlled_private_upload_pilot";
export type V081PrivateUploadPilotStatus =
  | "blocked"
  | "private_upload_ready"
  | "private_upload_completed";
export type V081PrivateUploadPilotVisibility = "private" | "public" | "unlisted";
export type V081PrivateUploadPilotBlocker =
  | "BLOCKED_V081_PRIVATE_UPLOAD_APPROVAL_MISSING"
  | "BLOCKED_V081_VISIBILITY_NOT_PRIVATE"
  | "BLOCKED_V081_PUBLIC_UPLOAD_REQUESTED"
  | "BLOCKED_V081_UNLISTED_UPLOAD_REQUESTED"
  | "BLOCKED_V081_MAX_ITEMS_NOT_ONE"
  | "BLOCKED_V081_COMMENT_AUTOMATION_REQUESTED"
  | "BLOCKED_V081_SCHEDULER_EXECUTION_REQUESTED"
  | "BLOCKED_V081_YOUTUBE_OAUTH_NOT_READY"
  | "BLOCKED_V081_TOKEN_PROVIDER_NOT_READY"
  | "BLOCKED_V081_VIDEO_ASSET_MISSING"
  | "BLOCKED_V081_UPLOAD_PACKAGE_MISSING"
  | "BLOCKED_V081_AFFILIATE_URL_EVIDENCE_MISSING"
  | "BLOCKED_V081_COUPANG_DISCLOSURE_EVIDENCE_MISSING"
  | "BLOCKED_V081_DUPLICATE_GUARD_MISSING"
  | "BLOCKED_V081_TARGET_CHANNEL_EVIDENCE_MISSING"
  | "BLOCKED_V081_METADATA_NOT_READY"
  | "BLOCKED_V081_YOUTUBE_QUOTA_NOT_READY"
  | "BLOCKED_V081_REAL_ADAPTER_DISABLED"
  | "BLOCKED_V081_ADAPTER_UPLOAD_EVIDENCE_INCOMPLETE"
  | "BLOCKED_V081_UNSAFE_REPORT_REQUESTED"
  | "BLOCKED_V081_MUTATION_ATTEMPT_OUTSIDE_APPROVED_PATH"
  | "BLOCKED_V082_REAL_UPLOAD_EXECUTION_NOT_ALLOWED_IN_THIS_PR"
  | "BLOCKED_V083_REAL_UPLOAD_EXECUTION_NOT_ALLOWED_IN_THIS_PR"
  | "BLOCKED_V083_ADAPTER_UPLOAD_EVIDENCE_INCOMPLETE";

export type V081PrivateUploadPilotReadinessInput = {
  oauthReady: boolean;
  tokenProviderReady: boolean;
  videoAssetReady: boolean;
  uploadPackageReady: boolean;
  affiliateUrlEvidenceReady: boolean;
  coupangDisclosureReady: boolean;
  duplicateGuardReady: boolean;
  targetChannelReady: boolean;
  metadataReady: boolean;
  quotaReady: boolean;
};

export type V081PrivateUploadPilotRequest = {
  queueItemId: string;
  uploadPackageId: string;
  channelKey: ChannelKey;
  visibility: V081PrivateUploadPilotVisibility;
  approvalPhrase: string | null;
  commentAutomationAllowed: boolean;
  schedulerExecutionAllowed: boolean;
  maxItems: number;
  targetChannelId: string | null;
  rawCoupangUrl?: string | null;
  selectedAffiliateUrl?: string | null;
  videoAssetHashPrefix: string | null;
  generatedAt: string;
  readiness: V081PrivateUploadPilotReadinessInput;
  unsafeReportRequested?: boolean;
  mutationAttemptOutsideApprovedPath?: boolean;
};

export type V081PrivateUploadPilotReadiness = {
  version: "v081";
  status: "blocked" | "private_upload_ready";
  mode: V081PrivateUploadPilotMode;
  requestedVisibility: V081PrivateUploadPilotVisibility;
  visibility: "private";
  requestedMaxItems: number;
  maxItems: 1;
  safeToPublicUpload: false;
  SAFE_TO_PUBLIC_UPLOAD: false;
  safeToUpload: false;
  commentAutomationAllowed: false;
  schedulerExecutionAllowed: false;
  approvalAccepted: boolean;
  readyForPrivatePilot: boolean;
  blockers: V081PrivateUploadPilotBlocker[];
  hardBlockers: V081PrivateUploadPilotBlocker[];
  videosInsertAllowedWithInjectedAdapter: boolean;
  videosInsertCalled: false;
  commentThreadsInsertCalled: false;
  redactionProof: V081RedactionProof;
};

export type V081RedactionProof = {
  rawUrlsPrinted: false;
  rawVideoIdsPrinted: false;
  rawChannelIdsPrinted: false;
  secretsPrinted: false;
  fakeSuccess: false;
};

export type V081PrivateUploadPilotAdapterMode = "blocked" | "mock" | "real_candidate";
export type V081PrivateUploadPilotAdapterRequest = {
  uploadPackageId: string;
  queueItemId: string;
  channelKey: ChannelKey;
  visibility: "private";
  maxItems: 1;
  videoAssetHashPrefix: string | null;
  generatedAt: string;
};
export type V081PrivateUploadPilotAdapterResult = {
  status: "BLOCKED" | "MOCK_ONLY";
  blocker: V081PrivateUploadPilotBlocker | null;
  youtubeVideoId: string | null;
  channelId: string | null;
  uploadedAt: string | null;
  videosInsertCalled: boolean;
  videosInsertTotalCount: 0 | 1;
  commentThreadsInsertCalled: false;
  fakeSuccess: false;
  rawUrlsPrinted: false;
  rawVideoIdsPrinted: false;
  rawChannelIdsPrinted: false;
  secretsPrinted: false;
};
export type V081PrivateUploadPilotAdapter = {
  mode: V081PrivateUploadPilotAdapterMode;
  uploadPrivatePilot(
    request: V081PrivateUploadPilotAdapterRequest
  ): Promise<V081PrivateUploadPilotAdapterResult>;
};

export type V081UploadResultEvidence = {
  present: boolean;
  youtubeVideoIdHashPrefix: string | null;
  channelIdHashPrefix: string | null;
  rawVideoIdPrinted: false;
  rawChannelIdPrinted: false;
};

export type V081PrivateUploadPilotResult = {
  version: "v081";
  status: V081PrivateUploadPilotStatus;
  mode: V081PrivateUploadPilotMode;
  queueItemId: string;
  uploadPackageId: string;
  channelKey: ChannelKey;
  requestedVisibility: V081PrivateUploadPilotVisibility;
  visibility: "private";
  requestedMaxItems: number;
  maxItems: 1;
  safeToPublicUpload: false;
  SAFE_TO_PUBLIC_UPLOAD: false;
  SAFE_TO_UPLOAD: false;
  safeToUpload: false;
  commentAutomationAllowed: false;
  schedulerExecutionAllowed: false;
  approvalAccepted: boolean;
  adapterMode: V081PrivateUploadPilotAdapterMode;
  videosInsertCalled: boolean;
  videosInsertTotalCount: 0 | 1;
  commentThreadsInsertCalled: false;
  comment_create_update_delete_called: false;
  scheduler_auto_execution_called: false;
  n8n_webhook_called: false;
  visibility_changed: false;
  R2_upload: false;
  DB_write: false;
  product_assets_write: false;
  blockers: V081PrivateUploadPilotBlocker[];
  uploadResultEvidence: V081UploadResultEvidence;
  uploadResultStoreItem: V076UploadResultStoreItem | null;
  uploadResultStoreReport: V076UploadResultStoreSanitizedReport | null;
  redactionProof: V081RedactionProof;
  raw_urls_printed: false;
  raw_video_ids_printed: false;
  raw_channel_ids_printed: false;
  secrets_printed: false;
  fake_success: false;
};

export class BlockedV081PrivateUploadPilotAdapter implements V081PrivateUploadPilotAdapter {
  readonly mode = "blocked" as const;

  async uploadPrivatePilot(): Promise<V081PrivateUploadPilotAdapterResult> {
    return {
      status: "BLOCKED",
      blocker: "BLOCKED_V081_REAL_ADAPTER_DISABLED",
      youtubeVideoId: null,
      channelId: null,
      uploadedAt: null,
      videosInsertCalled: false,
      videosInsertTotalCount: 0,
      commentThreadsInsertCalled: false,
      fakeSuccess: false,
      rawUrlsPrinted: false,
      rawVideoIdsPrinted: false,
      rawChannelIdsPrinted: false,
      secretsPrinted: false
    };
  }
}

export class MockV081PrivateUploadPilotAdapter implements V081PrivateUploadPilotAdapter {
  readonly mode = "mock" as const;
  private readonly result: {
    youtubeVideoId: string;
    channelId: string;
    uploadedAt: string;
  };

  constructor(result?: {
    youtubeVideoId?: string;
    channelId?: string;
    uploadedAt?: string;
  }) {
    this.result = {
      youtubeVideoId: result?.youtubeVideoId ?? "mock-v081-private-video",
      channelId: result?.channelId ?? `UC${"0".repeat(22)}`,
      uploadedAt: result?.uploadedAt ?? new Date(0).toISOString()
    };
  }

  async uploadPrivatePilot(): Promise<V081PrivateUploadPilotAdapterResult> {
    return {
      status: "MOCK_ONLY",
      blocker: null,
      youtubeVideoId: this.result.youtubeVideoId,
      channelId: this.result.channelId,
      uploadedAt: this.result.uploadedAt,
      videosInsertCalled: true,
      videosInsertTotalCount: 1,
      commentThreadsInsertCalled: false,
      fakeSuccess: false,
      rawUrlsPrinted: false,
      rawVideoIdsPrinted: false,
      rawChannelIdsPrinted: false,
      secretsPrinted: false
    };
  }
}

export function createDefaultV081PrivateUploadPilotAdapter(): V081PrivateUploadPilotAdapter {
  return new BlockedV081PrivateUploadPilotAdapter();
}

export function buildV081PrivateUploadPilotReadiness(
  request: V081PrivateUploadPilotRequest
): V081PrivateUploadPilotReadiness {
  const hardBlockers = buildHardBlockers(request);
  const readyForPrivatePilot = hardBlockers.length === 0;

  return {
    version: "v081",
    status: readyForPrivatePilot ? "private_upload_ready" : "blocked",
    mode: "controlled_private_upload_pilot",
    requestedVisibility: request.visibility,
    visibility: "private",
    requestedMaxItems: request.maxItems,
    maxItems: 1,
    safeToPublicUpload: false,
    SAFE_TO_PUBLIC_UPLOAD: false,
    safeToUpload: false,
    commentAutomationAllowed: false,
    schedulerExecutionAllowed: false,
    approvalAccepted: isApprovalAccepted(request.approvalPhrase),
    readyForPrivatePilot,
    blockers: dedupe([
      ...hardBlockers,
      "BLOCKED_V081_REAL_ADAPTER_DISABLED"
    ]),
    hardBlockers,
    videosInsertAllowedWithInjectedAdapter: readyForPrivatePilot,
    videosInsertCalled: false,
    commentThreadsInsertCalled: false,
    redactionProof: buildRedactionProof()
  };
}

export async function executeV081PrivateUploadPilot(
  request: V081PrivateUploadPilotRequest,
  options: {
    adapter?: V081PrivateUploadPilotAdapter;
  } = {}
): Promise<V081PrivateUploadPilotResult> {
  const adapter = options.adapter ?? createDefaultV081PrivateUploadPilotAdapter();
  const readiness = buildV081PrivateUploadPilotReadiness(request);
  const executionReadiness = normalizeReadinessForInjectedAdapter(readiness, adapter.mode);

  if (!executionReadiness.videosInsertAllowedWithInjectedAdapter) {
    return buildBlockedResult({ request, readiness: executionReadiness, adapterMode: adapter.mode });
  }

  const adapterResult = await adapter.uploadPrivatePilot({
    uploadPackageId: request.uploadPackageId,
    queueItemId: request.queueItemId,
    channelKey: request.channelKey,
    visibility: "private",
    maxItems: 1,
    videoAssetHashPrefix: request.videoAssetHashPrefix,
    generatedAt: request.generatedAt
  });

  const adapterUploadEvidenceComplete = hasCompleteAdapterUploadEvidence(adapterResult);
  const adapterBlocker = adapterResult.blocker ??
    (!adapterResult.videosInsertCalled
      ? "BLOCKED_V081_REAL_ADAPTER_DISABLED"
      : "BLOCKED_V081_ADAPTER_UPLOAD_EVIDENCE_INCOMPLETE");

  if (adapterResult.blocker || !adapterResult.videosInsertCalled || !adapterUploadEvidenceComplete) {
    return buildBlockedResult({
      request,
      readiness: {
        ...executionReadiness,
        blockers: dedupe([
          ...executionReadiness.blockers,
          adapterBlocker
        ])
      },
      adapterMode: adapter.mode,
      adapterResult: adapterResult.videosInsertCalled ? adapterResult : undefined
    });
  }

  const storeItem = buildV076UploadResultStoreItem({
    uploadResultId: `v081-${request.uploadPackageId}`,
    uploadPackageId: request.uploadPackageId,
    queueItemId: request.queueItemId,
    channelKey: request.channelKey,
    platform: "youtube",
    visibility: "private",
    uploadedAt: adapterResult.uploadedAt,
    youtubeVideoId: adapterResult.youtubeVideoId,
    channelId: adapterResult.channelId,
    targetChannelVerified: request.readiness.targetChannelReady,
    duplicateGuardPassed: request.readiness.duplicateGuardReady,
    publicUploadPackageReady: false,
    createdAt: request.generatedAt,
    updatedAt: adapterResult.uploadedAt ?? request.generatedAt
  });
  const storeReport = buildV076UploadResultStoreSanitizedReport(storeItem);

  return {
    ...buildBaseResult({ request, readiness, adapterMode: adapter.mode }),
    status: "private_upload_completed",
    videosInsertCalled: true,
    videosInsertTotalCount: 1,
    blockers: [],
    uploadResultEvidence: {
      present: Boolean(storeItem.youtubeVideoIdHashPrefix && storeItem.channelIdHashPrefix),
      youtubeVideoIdHashPrefix: storeItem.youtubeVideoIdHashPrefix,
      channelIdHashPrefix: storeItem.channelIdHashPrefix,
      rawVideoIdPrinted: false,
      rawChannelIdPrinted: false
    },
    uploadResultStoreItem: storeItem,
    uploadResultStoreReport: storeReport
  };
}

function normalizeReadinessForInjectedAdapter(
  readiness: V081PrivateUploadPilotReadiness,
  adapterMode: V081PrivateUploadPilotAdapterMode
): V081PrivateUploadPilotReadiness {
  if (adapterMode === "blocked") {
    return readiness;
  }

  return {
    ...readiness,
    blockers: readiness.blockers.filter((blocker) => blocker !== "BLOCKED_V081_REAL_ADAPTER_DISABLED")
  };
}

function buildBlockedResult(input: {
  request: V081PrivateUploadPilotRequest;
  readiness: Pick<V081PrivateUploadPilotReadiness, "approvalAccepted" | "blockers">;
  adapterMode: V081PrivateUploadPilotAdapterMode;
  adapterResult?: Pick<
    V081PrivateUploadPilotAdapterResult,
    "videosInsertCalled" | "videosInsertTotalCount"
  >;
}): V081PrivateUploadPilotResult {
  return {
    ...buildBaseResult(input),
    status: "blocked",
    videosInsertCalled: input.adapterResult?.videosInsertCalled ?? false,
    videosInsertTotalCount: input.adapterResult?.videosInsertTotalCount ?? 0,
    uploadResultEvidence: {
      present: false,
      youtubeVideoIdHashPrefix: null,
      channelIdHashPrefix: null,
      rawVideoIdPrinted: false,
      rawChannelIdPrinted: false
    },
    uploadResultStoreItem: null,
    uploadResultStoreReport: null
  };
}

function buildBaseResult(input: {
  request: V081PrivateUploadPilotRequest;
  readiness: Pick<V081PrivateUploadPilotReadiness, "approvalAccepted" | "blockers">;
  adapterMode: V081PrivateUploadPilotAdapterMode;
}): Omit<
  V081PrivateUploadPilotResult,
  "status" | "videosInsertCalled" | "videosInsertTotalCount" | "uploadResultEvidence" |
  "uploadResultStoreItem" | "uploadResultStoreReport"
> {
  return {
    version: "v081",
    mode: "controlled_private_upload_pilot",
    queueItemId: input.request.queueItemId,
    uploadPackageId: input.request.uploadPackageId,
    channelKey: input.request.channelKey,
    requestedVisibility: input.request.visibility,
    visibility: "private",
    requestedMaxItems: input.request.maxItems,
    maxItems: 1,
    safeToPublicUpload: false,
    SAFE_TO_PUBLIC_UPLOAD: false,
    SAFE_TO_UPLOAD: false,
    safeToUpload: false,
    commentAutomationAllowed: false,
    schedulerExecutionAllowed: false,
    approvalAccepted: input.readiness.approvalAccepted,
    adapterMode: input.adapterMode,
    commentThreadsInsertCalled: false,
    comment_create_update_delete_called: false,
    scheduler_auto_execution_called: false,
    n8n_webhook_called: false,
    visibility_changed: false,
    R2_upload: false,
    DB_write: false,
    product_assets_write: false,
    blockers: input.readiness.blockers,
    redactionProof: buildRedactionProof(),
    raw_urls_printed: false,
    raw_video_ids_printed: false,
    raw_channel_ids_printed: false,
    secrets_printed: false,
    fake_success: false
  };
}

function buildHardBlockers(request: V081PrivateUploadPilotRequest): V081PrivateUploadPilotBlocker[] {
  const blockers: V081PrivateUploadPilotBlocker[] = [];

  if (!isApprovalAccepted(request.approvalPhrase)) {
    blockers.push("BLOCKED_V081_PRIVATE_UPLOAD_APPROVAL_MISSING");
  }
  if (request.visibility !== "private") {
    blockers.push("BLOCKED_V081_VISIBILITY_NOT_PRIVATE");
  }
  if (request.visibility === "public") {
    blockers.push("BLOCKED_V081_PUBLIC_UPLOAD_REQUESTED");
  }
  if (request.visibility === "unlisted") {
    blockers.push("BLOCKED_V081_UNLISTED_UPLOAD_REQUESTED");
  }
  if (request.maxItems !== 1) {
    blockers.push("BLOCKED_V081_MAX_ITEMS_NOT_ONE");
  }
  if (request.commentAutomationAllowed) {
    blockers.push("BLOCKED_V081_COMMENT_AUTOMATION_REQUESTED");
  }
  if (request.schedulerExecutionAllowed) {
    blockers.push("BLOCKED_V081_SCHEDULER_EXECUTION_REQUESTED");
  }
  if (!request.readiness.oauthReady) {
    blockers.push("BLOCKED_V081_YOUTUBE_OAUTH_NOT_READY");
  }
  if (!request.readiness.tokenProviderReady) {
    blockers.push("BLOCKED_V081_TOKEN_PROVIDER_NOT_READY");
  }
  if (!request.readiness.videoAssetReady) {
    blockers.push("BLOCKED_V081_VIDEO_ASSET_MISSING");
  }
  if (!request.readiness.uploadPackageReady) {
    blockers.push("BLOCKED_V081_UPLOAD_PACKAGE_MISSING");
  }
  if (!request.readiness.affiliateUrlEvidenceReady) {
    blockers.push("BLOCKED_V081_AFFILIATE_URL_EVIDENCE_MISSING");
  }
  if (!request.readiness.coupangDisclosureReady) {
    blockers.push("BLOCKED_V081_COUPANG_DISCLOSURE_EVIDENCE_MISSING");
  }
  if (!request.readiness.duplicateGuardReady) {
    blockers.push("BLOCKED_V081_DUPLICATE_GUARD_MISSING");
  }
  if (!request.readiness.targetChannelReady) {
    blockers.push("BLOCKED_V081_TARGET_CHANNEL_EVIDENCE_MISSING");
  }
  if (!request.readiness.metadataReady) {
    blockers.push("BLOCKED_V081_METADATA_NOT_READY");
  }
  if (!request.readiness.quotaReady) {
    blockers.push("BLOCKED_V081_YOUTUBE_QUOTA_NOT_READY");
  }
  if (request.unsafeReportRequested) {
    blockers.push("BLOCKED_V081_UNSAFE_REPORT_REQUESTED");
  }
  if (request.mutationAttemptOutsideApprovedPath) {
    blockers.push("BLOCKED_V081_MUTATION_ATTEMPT_OUTSIDE_APPROVED_PATH");
  }

  return dedupe(blockers);
}

function isApprovalAccepted(approvalPhrase: string | null | undefined) {
  return approvalPhrase === APPROVE_YOUTUBE_PRIVATE_UPLOAD_PILOT_1_ITEM_NO_COMMENT;
}

function hasCompleteAdapterUploadEvidence(
  adapterResult: V081PrivateUploadPilotAdapterResult
) {
  return Boolean(
    trimOrNull(adapterResult.youtubeVideoId) &&
    trimOrNull(adapterResult.channelId) &&
    trimOrNull(adapterResult.uploadedAt)
  );
}

function buildRedactionProof(): V081RedactionProof {
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

function trimOrNull(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized : null;
}
