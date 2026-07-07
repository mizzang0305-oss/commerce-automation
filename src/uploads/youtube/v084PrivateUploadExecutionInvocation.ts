import type { ChannelKey } from "../multi-channel/channelProfiles";
import {
  APPROVE_YOUTUBE_PRIVATE_UPLOAD_PILOT_1_ITEM_NO_COMMENT,
  type V081PrivateUploadPilotVisibility
} from "./v081PrivateUploadPilot";
import type { V081PrivateUploadPilotResult } from "./v081PrivateUploadPilot";
import type {
  V083PrivateUploadExecutionBlocker
} from "./v083PrivateUploadExecutionReadiness";
import {
  loadV095PrivatePilotExecutionContextForV084
} from "./v095PrivatePilotExecutionContext";

export type V084PrivateUploadPilotInvocationMode = "private_upload_pilot_invocation";
export type V084PrivateUploadPilotInvocationStatus =
  | "blocked"
  | "ready_for_private_execution"
  | "private_upload_completed";
export type V084PrivateUploadPilotInvocationVisibility = "private" | "public" | "unlisted";
export type V084PrivateUploadPilotResolverStatus = "bound" | "blocked" | "missing";
export type V084PrivateUploadPilotBinderStatus =
  | "ready_for_fresh_approval"
  | "blocked"
  | "not_run"
  | "missing";
export type V084PrivateUploadPilotInvocationBlocker =
  | "BLOCKED_V084_FRESH_APPROVAL_REQUIRED"
  | "BLOCKED_V084_STALE_APPROVAL_REJECTED"
  | "BLOCKED_V084_SERVER_ONLY_CONTEXT_REQUIRED"
  | "BLOCKED_V084_V083_ADAPTER_NOT_AVAILABLE"
  | "BLOCKED_V084_V088_RESOLVER_NOT_BOUND"
  | "BLOCKED_V084_V087_BINDER_NOT_READY"
  | "BLOCKED_V084_V085_BINDER_NOT_READY"
  | "BLOCKED_V084_VISIBILITY_MUST_BE_PRIVATE"
  | "BLOCKED_V084_MAX_ITEMS_MUST_BE_ONE"
  | "BLOCKED_V084_PUBLIC_UPLOAD_NOT_ALLOWED"
  | "BLOCKED_V084_UNLISTED_UPLOAD_NOT_ALLOWED"
  | "BLOCKED_V084_COMMENT_AUTOMATION_NOT_ALLOWED"
  | "BLOCKED_V084_SCHEDULER_EXECUTION_NOT_ALLOWED"
  | "BLOCKED_V084_UPLOAD_PACKAGE_REQUIRED"
  | "BLOCKED_V084_QUEUE_ITEM_REQUIRED"
  | "BLOCKED_V084_READINESS_NOT_READY"
  | "BLOCKED_V084_V081_EXECUTION_BLOCKED"
  | "BLOCKED_V084_EXECUTION_CONTEXT_STALE"
  | "BLOCKED_V084_EXECUTION_CONTEXT_CONFLICT"
  | "BLOCKED_V084_EXECUTION_CONTEXT_PATH_UNSAFE"
  | "BLOCKED_V084_EXECUTION_CONTEXT_UNSAFE"
  | "BLOCKED_V084_UNSAFE_REPORT_REQUESTED";

export type V084PrivateUploadPilotInvocationReadiness = {
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
  metadataReady: boolean;
  quotaReady: boolean;
};

export type V084PrivateUploadPilotInvocationRequest = {
  mode: V084PrivateUploadPilotInvocationMode;
  dryRun: boolean;
  serverOnlyContext?: boolean;
  v083AdapterAvailable?: boolean;
  v088ResolverStatus?: V084PrivateUploadPilotResolverStatus | null;
  v087BinderStatus?: V084PrivateUploadPilotBinderStatus | null;
  v085BinderStatus?: V084PrivateUploadPilotBinderStatus | null;
  queueItemId: string | null;
  uploadPackageId: string | null;
  channelKey?: ChannelKey;
  visibility: V084PrivateUploadPilotInvocationVisibility;
  maxItems: number;
  approvalPhrase: string | null;
  commentAutomationAllowed: boolean;
  schedulerExecutionAllowed: boolean;
  generatedAt?: string;
  videoAssetHashPrefix?: string | null;
  readiness: V084PrivateUploadPilotInvocationReadiness;
  unsafeReportRequested?: boolean;
  preflightBlockers?: V084PrivateUploadPilotInvocationBlocker[];
};

export type V084PrivateUploadPilotInvocationResult = {
  version: "v084";
  status: V084PrivateUploadPilotInvocationStatus;
  mode: V084PrivateUploadPilotInvocationMode;
  dryRun: boolean;
  executionAllowed: false;
  queueItemIdPresent: boolean;
  uploadPackageIdPresent: boolean;
  channelKey: ChannelKey;
  requestedVisibility: V084PrivateUploadPilotInvocationVisibility;
  visibility: "private";
  requestedMaxItems: number;
  maxItems: 1;
  approvalAccepted: boolean;
  commentAutomationAllowed: false;
  schedulerExecutionAllowed: false;
  publicUploadAllowed: false;
  safeToUpload: false;
  SAFE_TO_UPLOAD: false;
  safeToPublicUpload: false;
  SAFE_TO_PUBLIC_UPLOAD: false;
  blockers: V084PrivateUploadPilotInvocationBlocker[];
  v083AdapterAvailable: boolean;
  v088ResolverBound: boolean;
  v087BinderReady: boolean;
  v085BinderReady: boolean;
  v083AdapterInvoked: boolean;
  v083AdapterMode: "blocked" | "mock" | "real_candidate" | null;
  v083Blockers: V083PrivateUploadExecutionBlocker[];
  v081ResultStatus: V081PrivateUploadPilotResult["status"] | null;
  v081Blockers: V081PrivateUploadPilotResult["blockers"];
  videosInsertCalled: boolean;
  videosInsertTotalCount: 0 | 1;
  commentThreadsInsertCalled: false;
  comment_create_update_delete_called: false;
  scheduler_auto_execution_called: false;
  visibility_changed: false;
  R2_upload: false;
  DB_write: false;
  product_assets_write: false;
  n8n_webhook_called: false;
  uploadResultEvidence: V081PrivateUploadPilotResult["uploadResultEvidence"];
  uploadResultStoreItem: V081PrivateUploadPilotResult["uploadResultStoreItem"];
  uploadResultStoreReport: V081PrivateUploadPilotResult["uploadResultStoreReport"];
  redactionProof: V084RedactionProof;
  raw_urls_printed: false;
  raw_video_ids_printed: false;
  raw_channel_ids_printed: false;
  secrets_printed: false;
  fake_success: false;
};

export type V084RedactionProof = {
  rawUrlsPrinted: false;
  rawVideoIdsPrinted: false;
  rawChannelIdsPrinted: false;
  secretsPrinted: false;
  fakeSuccess: false;
};

export type V084PrivateUploadPilotInvocationFromEnvOptions = {
  env?: NodeJS.ProcessEnv;
  dryRun: boolean;
};

export async function buildV084PrivateUploadPilotInvocationRequestFromEnv(
  options: V084PrivateUploadPilotInvocationFromEnvOptions
): Promise<V084PrivateUploadPilotInvocationRequest> {
  const env = options.env ?? process.env;
  const cwd = env.V095_CWD || env.V084_CWD || process.cwd();
  const context = await loadV095PrivatePilotExecutionContextForV084({ cwd, env });
  const contextValues = context.values;
  const runtimeReady = contextValues
    ? contextValues.readiness.v081PilotReady
    : env.V084_RUNTIME_READY === "true";

  return {
    mode: "private_upload_pilot_invocation",
    dryRun: options.dryRun,
    serverOnlyContext: true,
    v083AdapterAvailable: true,
    v088ResolverStatus: contextValues?.v088ResolverStatus ?? normalizeResolverStatus(env.V084_V088_RESOLVER_STATUS),
    v087BinderStatus: contextValues?.v087BinderStatus ?? normalizeBinderStatus(env.V084_V087_BINDER_STATUS),
    v085BinderStatus: contextValues?.v085BinderStatus ?? normalizeBinderStatus(env.V084_V085_BINDER_STATUS),
    queueItemId: contextValues?.queueItemId ?? env.V084_QUEUE_ITEM_ID ?? null,
    uploadPackageId: contextValues?.uploadPackageId ?? env.V084_UPLOAD_PACKAGE_ID ?? null,
    channelKey: contextValues?.channelKey ?? normalizeChannelKey(env.V084_CHANNEL_KEY),
    visibility: contextValues?.visibility ?? normalizeVisibility(env.V084_VISIBILITY),
    maxItems: contextValues?.maxItems ?? Number(env.V084_MAX_ITEMS ?? 1),
    approvalPhrase: env.V084_PRIVATE_UPLOAD_APPROVAL_PHRASE ?? null,
    commentAutomationAllowed: env.V084_COMMENT_AUTOMATION_ALLOWED === "true",
    schedulerExecutionAllowed: env.V084_SCHEDULER_EXECUTION_ALLOWED === "true",
    generatedAt: contextValues?.generatedAt ?? env.V084_GENERATED_AT,
    videoAssetHashPrefix: contextValues?.videoAssetHashPrefix ?? env.V084_VIDEO_ASSET_HASH_PREFIX ?? null,
    readiness: contextValues?.readiness ?? {
      v081PilotReady: runtimeReady,
      v082RuntimeAdapterReady: runtimeReady,
      tokenProviderReady: runtimeReady,
      uploadScopeReady: runtimeReady,
      videoAssetReady: runtimeReady,
      uploadPackageReady: runtimeReady,
      duplicateGuardReady: runtimeReady,
      disclosureGuardReady: runtimeReady,
      affiliateEvidenceReady: runtimeReady,
      targetChannelEvidenceReady: runtimeReady,
      metadataReady: runtimeReady,
      quotaReady: runtimeReady
    },
    preflightBlockers: context.blockers
  };
}

export async function buildV084PrivateUploadPilotInvocationFromEnv(
  options: V084PrivateUploadPilotInvocationFromEnvOptions
): Promise<V084PrivateUploadPilotInvocationResult> {
  return buildV084PrivateUploadPilotInvocation(
    await buildV084PrivateUploadPilotInvocationRequestFromEnv(options)
  );
}

export async function buildV084PrivateUploadPilotInvocation(
  request: V084PrivateUploadPilotInvocationRequest
): Promise<V084PrivateUploadPilotInvocationResult> {
  const normalized = normalizeRequest(request);
  const blockers = buildBlockers(normalized);

  if (blockers.length > 0) {
    return buildResult({ request: normalized, blockers });
  }

  if (normalized.dryRun) {
    return buildResult({
      request: normalized,
      blockers: [],
      status: "ready_for_private_execution",
      v083AdapterInvoked: false,
      v083AdapterMode: null,
      v083Blockers: []
    });
  }

  return buildResult({
    request: normalized,
    blockers: [],
    status: "ready_for_private_execution",
    v083AdapterInvoked: false,
    v083AdapterMode: null,
    v083Blockers: []
  });
}

type NormalizedRequest = Omit<
  V084PrivateUploadPilotInvocationRequest,
  "queueItemId" | "uploadPackageId" | "channelKey" | "generatedAt" | "videoAssetHashPrefix"
> & {
  queueItemId: string;
  uploadPackageId: string;
  channelKey: ChannelKey;
  generatedAt: string;
  videoAssetHashPrefix: string | null;
  v088ResolverStatus: V084PrivateUploadPilotResolverStatus;
  v087BinderStatus: V084PrivateUploadPilotBinderStatus;
  v085BinderStatus: V084PrivateUploadPilotBinderStatus;
  approvalAccepted: boolean;
};

function normalizeRequest(request: V084PrivateUploadPilotInvocationRequest): NormalizedRequest {
  return {
    ...request,
    serverOnlyContext: request.serverOnlyContext ?? true,
    v083AdapterAvailable: request.v083AdapterAvailable ?? true,
    v088ResolverStatus: request.v088ResolverStatus ?? "missing",
    v087BinderStatus: request.v087BinderStatus ?? "missing",
    v085BinderStatus: request.v085BinderStatus ?? "missing",
    queueItemId: trimOrEmpty(request.queueItemId),
    uploadPackageId: trimOrEmpty(request.uploadPackageId),
    channelKey: request.channelKey ?? "father_jobs",
    generatedAt: request.generatedAt ?? new Date(0).toISOString(),
    videoAssetHashPrefix: trimOrNull(request.videoAssetHashPrefix),
    approvalAccepted: request.approvalPhrase === APPROVE_YOUTUBE_PRIVATE_UPLOAD_PILOT_1_ITEM_NO_COMMENT
  };
}

function buildBlockers(request: NormalizedRequest): V084PrivateUploadPilotInvocationBlocker[] {
  const blockers: V084PrivateUploadPilotInvocationBlocker[] = [
    ...(request.preflightBlockers ?? [])
  ];

  if (!request.approvalPhrase) {
    blockers.push("BLOCKED_V084_FRESH_APPROVAL_REQUIRED");
  } else if (!request.approvalAccepted) {
    blockers.push("BLOCKED_V084_STALE_APPROVAL_REJECTED");
  }
  if (!request.serverOnlyContext) {
    blockers.push("BLOCKED_V084_SERVER_ONLY_CONTEXT_REQUIRED");
  }
  if (!request.v083AdapterAvailable) {
    blockers.push("BLOCKED_V084_V083_ADAPTER_NOT_AVAILABLE");
  }
  if (request.v088ResolverStatus !== "bound") {
    blockers.push("BLOCKED_V084_V088_RESOLVER_NOT_BOUND");
  }
  if (request.v087BinderStatus !== "ready_for_fresh_approval") {
    blockers.push("BLOCKED_V084_V087_BINDER_NOT_READY");
  }
  if (request.v085BinderStatus !== "ready_for_fresh_approval") {
    blockers.push("BLOCKED_V084_V085_BINDER_NOT_READY");
  }
  if (request.visibility !== "private") {
    blockers.push("BLOCKED_V084_VISIBILITY_MUST_BE_PRIVATE");
  }
  if (request.visibility === "public") {
    blockers.push("BLOCKED_V084_PUBLIC_UPLOAD_NOT_ALLOWED");
  }
  if (request.visibility === "unlisted") {
    blockers.push("BLOCKED_V084_UNLISTED_UPLOAD_NOT_ALLOWED");
  }
  if (request.maxItems !== 1) {
    blockers.push("BLOCKED_V084_MAX_ITEMS_MUST_BE_ONE");
  }
  if (request.commentAutomationAllowed) {
    blockers.push("BLOCKED_V084_COMMENT_AUTOMATION_NOT_ALLOWED");
  }
  if (request.schedulerExecutionAllowed) {
    blockers.push("BLOCKED_V084_SCHEDULER_EXECUTION_NOT_ALLOWED");
  }
  if (!request.uploadPackageId) {
    blockers.push("BLOCKED_V084_UPLOAD_PACKAGE_REQUIRED");
  }
  if (!request.queueItemId) {
    blockers.push("BLOCKED_V084_QUEUE_ITEM_REQUIRED");
  }
  if (!Object.values(request.readiness).every(Boolean)) {
    blockers.push("BLOCKED_V084_READINESS_NOT_READY");
  }
  if (request.unsafeReportRequested) {
    blockers.push("BLOCKED_V084_UNSAFE_REPORT_REQUESTED");
  }

  return [...new Set(blockers)];
}

function buildResult(input: {
  request: NormalizedRequest;
  blockers: V084PrivateUploadPilotInvocationBlocker[];
  status?: V084PrivateUploadPilotInvocationStatus;
  v083AdapterInvoked?: boolean;
  v083AdapterMode?: V084PrivateUploadPilotInvocationResult["v083AdapterMode"];
  v083Blockers?: V083PrivateUploadExecutionBlocker[];
  v081Result?: V081PrivateUploadPilotResult;
}): V084PrivateUploadPilotInvocationResult {
  const status = input.status ?? "blocked";
  const uploadResultEvidence = input.v081Result?.uploadResultEvidence ?? emptyUploadEvidence();

  return {
    version: "v084",
    status,
    mode: "private_upload_pilot_invocation",
    dryRun: input.request.dryRun,
    executionAllowed: false,
    queueItemIdPresent: Boolean(input.request.queueItemId),
    uploadPackageIdPresent: Boolean(input.request.uploadPackageId),
    channelKey: input.request.channelKey,
    requestedVisibility: input.request.visibility,
    visibility: "private",
    requestedMaxItems: input.request.maxItems,
    maxItems: 1,
    approvalAccepted: input.request.approvalAccepted,
    commentAutomationAllowed: false,
    schedulerExecutionAllowed: false,
    publicUploadAllowed: false,
    safeToUpload: false,
    SAFE_TO_UPLOAD: false,
    safeToPublicUpload: false,
    SAFE_TO_PUBLIC_UPLOAD: false,
    blockers: input.blockers,
    v083AdapterAvailable: Boolean(input.request.v083AdapterAvailable),
    v088ResolverBound: input.request.v088ResolverStatus === "bound",
    v087BinderReady: input.request.v087BinderStatus === "ready_for_fresh_approval",
    v085BinderReady: input.request.v085BinderStatus === "ready_for_fresh_approval",
    v083AdapterInvoked: input.v083AdapterInvoked ?? false,
    v083AdapterMode: input.v083AdapterMode ?? null,
    v083Blockers: input.v083Blockers ?? [],
    v081ResultStatus: input.v081Result?.status ?? null,
    v081Blockers: input.v081Result?.blockers ?? [],
    videosInsertCalled: input.v081Result?.videosInsertCalled ?? false,
    videosInsertTotalCount: input.v081Result?.videosInsertTotalCount ?? 0,
    commentThreadsInsertCalled: false,
    comment_create_update_delete_called: false,
    scheduler_auto_execution_called: false,
    visibility_changed: false,
    R2_upload: false,
    DB_write: false,
    product_assets_write: false,
    n8n_webhook_called: false,
    uploadResultEvidence,
    uploadResultStoreItem: input.v081Result?.uploadResultStoreItem ?? null,
    uploadResultStoreReport: input.v081Result?.uploadResultStoreReport ?? null,
    redactionProof: buildRedactionProof(),
    raw_urls_printed: false,
    raw_video_ids_printed: false,
    raw_channel_ids_printed: false,
    secrets_printed: false,
    fake_success: false
  };
}

function emptyUploadEvidence(): V081PrivateUploadPilotResult["uploadResultEvidence"] {
  return {
    present: false,
    youtubeVideoIdHashPrefix: null,
    channelIdHashPrefix: null,
    rawVideoIdPrinted: false,
    rawChannelIdPrinted: false
  };
}

function buildRedactionProof(): V084RedactionProof {
  return {
    rawUrlsPrinted: false,
    rawVideoIdsPrinted: false,
    rawChannelIdsPrinted: false,
    secretsPrinted: false,
    fakeSuccess: false
  };
}

function normalizeVisibility(value: string | undefined): V081PrivateUploadPilotVisibility {
  return value === "public" || value === "unlisted" ? value : "private";
}

function normalizeChannelKey(value: string | undefined): ChannelKey {
  return value === "neoman_moleulgeol" || value === "lets_buy" ? value : "father_jobs";
}

function normalizeResolverStatus(
  value: string | undefined
): V084PrivateUploadPilotResolverStatus {
  return value === "bound" || value === "blocked" ? value : "missing";
}

function normalizeBinderStatus(
  value: string | undefined
): V084PrivateUploadPilotBinderStatus {
  if (
    value === "ready_for_fresh_approval" ||
    value === "blocked" ||
    value === "not_run"
  ) {
    return value;
  }

  return "missing";
}

function trimOrEmpty(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function trimOrNull(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized : null;
}
