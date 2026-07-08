import type { ChannelKey } from "../multi-channel/channelProfiles";
import { V057_REUPLOAD_ASSET_PROFILE } from "../multi-channel/v057ReuploadAssetBinding";
import type { PreparedVideoAssetRef } from "@/lib/uploads/youtube/uploadAssetContract";
import type { V094UploadPackageLoader } from "./v094UploadPackageRequestResolutionCore";
import {
  diagnoseV094UploadPackageResolution
} from "./v094UploadPackageRequestResolutionCore";
import {
  buildV084PrivateUploadPilotInvocationRequestFromEnv
} from "./v084PrivateUploadExecutionInvocation";
import type { V081PrivateUploadPilotAdapterRequest } from "./v081PrivateUploadPilot";
import {
  loadV095PrivatePilotExecutionContextForV084
} from "./v095PrivatePilotExecutionContext";

export type V097UploadPackageResolutionDryRunStatus = "blocked" | "package_resolution_ready";

export type V097UploadPackageResolutionDryRunReport = {
  version: "v097";
  status: V097UploadPackageResolutionDryRunStatus;
  mode: "upload_package_resolution_bridge_no_upload";
  contextFound: boolean;
  contextLoaded: boolean;
  contextPathSafe: boolean;
  v084UploadPackageIdPresent: boolean;
  v084QueueItemIdPresent: boolean;
  v081UploadPackageIdPresent: boolean;
  v081QueueItemIdPresent: boolean;
  resolverPackageFound: boolean;
  videoAssetEvidencePresent: boolean;
  preparedAssetEvidencePresent: boolean;
  preparedAssetServerAccessible: boolean;
  preparedAssetUploadableUrlPresent: boolean;
  resolverUploadRequestBuilt: boolean;
  resolverBlocker: string | null;
  packageCount: number;
  packageIdMatch: boolean;
  queueItemIdMatch: boolean;
  channelKeyMatch: boolean;
  uploadAssetProfileLabel: string | null;
  cwdLabel: "process.cwd" | "env_cwd";
  selectedChannelKey: ChannelKey;
  approvalPhraseStored: false;
  uploadExecuteCalled: false;
  videosInsertCalled: false;
  videosInsertTotalCount: 0;
  commentThreadsInsertCalled: false;
  publicUploadAllowed: false;
  unlistedUploadAllowed: false;
  commentAutomationAllowed: false;
  schedulerExecutionAllowed: false;
  V076EvidenceStoreReportCreated: false;
  raw_urls_printed: false;
  raw_file_paths_printed: false;
  raw_video_ids_printed: false;
  raw_channel_ids_printed: false;
  secrets_printed: false;
  fake_success: false;
  SAFE_TO_UPLOAD: false;
  SAFE_TO_PUBLIC_UPLOAD: false;
};

export type V097UploadPackageResolutionDryRunInput = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  loadUploadPackages?: V094UploadPackageLoader;
  preparedVideoAssetRefs?: Partial<Record<ChannelKey, PreparedVideoAssetRef | null>>;
};

export async function buildV097UploadPackageResolutionDryRun(
  input: V097UploadPackageResolutionDryRunInput = {}
): Promise<V097UploadPackageResolutionDryRunReport> {
  const env = input.env ?? process.env;
  const cwd = input.cwd ?? env.V095_CWD ?? env.V084_CWD ?? process.cwd();
  const safeEnv: NodeJS.ProcessEnv = {
    ...env,
    V095_CWD: cwd,
    V084_PRIVATE_UPLOAD_APPROVAL_PHRASE: ""
  };
  const context = await loadV095PrivatePilotExecutionContextForV084({
    cwd,
    env: safeEnv
  });
  const v084Request = await buildV084PrivateUploadPilotInvocationRequestFromEnv({
    dryRun: true,
    env: safeEnv
  });
  const v081Request = toV081AdapterRequest(v084Request);
  const diagnostics = await diagnoseV094UploadPackageResolution(v081Request, {
    cwd,
    env: safeEnv,
    uploadAssetProfile: safeEnv.V051_UPLOAD_ASSET_PROFILE ?? V057_REUPLOAD_ASSET_PROFILE,
    loadUploadPackages: input.loadUploadPackages,
    preparedVideoAssetRefs: input.preparedVideoAssetRefs
  });
  const contextPathSafe = !context.blockers.includes("BLOCKED_V084_EXECUTION_CONTEXT_PATH_UNSAFE");
  const resolverReady = diagnostics.resolverPackageFound &&
    diagnostics.resolverUploadRequestBuilt &&
    !diagnostics.resolverBlocker;

  return {
    version: "v097",
    status: resolverReady ? "package_resolution_ready" : "blocked",
    mode: "upload_package_resolution_bridge_no_upload",
    contextFound: context.found,
    contextLoaded: Boolean(context.values),
    contextPathSafe,
    v084UploadPackageIdPresent: Boolean(v084Request.uploadPackageId),
    v084QueueItemIdPresent: Boolean(v084Request.queueItemId),
    v081UploadPackageIdPresent: diagnostics.packageIdPresent,
    v081QueueItemIdPresent: diagnostics.queueItemIdPresent,
    resolverPackageFound: diagnostics.resolverPackageFound,
    videoAssetEvidencePresent: diagnostics.videoAssetEvidencePresent,
    preparedAssetEvidencePresent: diagnostics.preparedAssetEvidencePresent,
    preparedAssetServerAccessible: diagnostics.preparedAssetServerAccessible,
    preparedAssetUploadableUrlPresent: diagnostics.preparedAssetUploadableUrlPresent,
    resolverUploadRequestBuilt: diagnostics.resolverUploadRequestBuilt,
    resolverBlocker: diagnostics.resolverBlocker,
    packageCount: diagnostics.packageCount,
    packageIdMatch: diagnostics.packageIdMatch,
    queueItemIdMatch: diagnostics.queueItemIdMatch,
    channelKeyMatch: diagnostics.channelKeyMatch,
    uploadAssetProfileLabel: diagnostics.uploadAssetProfileLabel,
    cwdLabel: cwd === process.cwd() ? "process.cwd" : "env_cwd",
    selectedChannelKey: v081Request.channelKey,
    approvalPhraseStored: false,
    uploadExecuteCalled: false,
    videosInsertCalled: false,
    videosInsertTotalCount: 0,
    commentThreadsInsertCalled: false,
    publicUploadAllowed: false,
    unlistedUploadAllowed: false,
    commentAutomationAllowed: false,
    schedulerExecutionAllowed: false,
    V076EvidenceStoreReportCreated: false,
    raw_urls_printed: false,
    raw_file_paths_printed: false,
    raw_video_ids_printed: false,
    raw_channel_ids_printed: false,
    secrets_printed: false,
    fake_success: false,
    SAFE_TO_UPLOAD: false,
    SAFE_TO_PUBLIC_UPLOAD: false
  };
}

function toV081AdapterRequest(input: {
  uploadPackageId: string | null;
  queueItemId: string | null;
  channelKey?: ChannelKey;
  visibility: "private" | "public" | "unlisted";
  maxItems: number;
  videoAssetHashPrefix?: string | null;
  generatedAt?: string;
}): V081PrivateUploadPilotAdapterRequest {
  return {
    uploadPackageId: input.uploadPackageId ?? "",
    queueItemId: input.queueItemId ?? "",
    channelKey: input.channelKey ?? "father_jobs",
    visibility: "private",
    maxItems: 1,
    videoAssetHashPrefix: input.videoAssetHashPrefix ?? null,
    generatedAt: input.generatedAt ?? new Date(0).toISOString()
  };
}
