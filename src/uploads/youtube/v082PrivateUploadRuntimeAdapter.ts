import "server-only";

import {
  BlockedV081PrivateUploadPilotAdapter,
  type V081PrivateUploadPilotAdapter,
  type V081PrivateUploadPilotAdapterResult
} from "./v081PrivateUploadPilot";
import {
  buildYouTubeExecuteTokenProviderReadiness,
  type YouTubeExecuteTokenProviderReadiness
} from "@/lib/uploads/youtube/youtubeTokenProviderContract";
import {
  buildV082PrivateUploadRuntimeAdapterReadiness,
  type V082PrivateUploadRuntimeAdapterReadiness,
  type V082PrivateUploadRuntimeAdapterReadinessInput,
  type V082PrivateUploadTokenProviderReadiness,
  type V082PrivateUploadRuntimeVisibility
} from "./v082PrivateUploadRuntimeReadiness";

const TOKEN_FILE_ENVS = ["YOUTUBE_LOCAL_TOKEN_FILE_PATH", "YOUTUBE_TOKEN_FILE"] as const;

export type V082PrivateUploadRuntimeAdapterFactory = {
  version: "v082";
  readiness: V082PrivateUploadRuntimeAdapterReadiness;
  adapter: V081PrivateUploadPilotAdapter;
  uploadExecutionCalled: false;
  videos_insert_called: false;
  commentThreads_insert_called: false;
  raw_urls_printed: false;
  raw_video_ids_printed: false;
  raw_channel_ids_printed: false;
  secrets_printed: false;
  fake_success: false;
};

export type V082PrivateUploadRuntimeAdapterFactoryOptions = {
  readinessInput?: V082PrivateUploadRuntimeAdapterReadinessInput;
};

export type V082PrivateUploadRuntimeAdapterFactoryEnvOptions = {
  env?: NodeJS.ProcessEnv;
  serverOnlyContext?: boolean;
  tokenProviderReadiness?: V082PrivateUploadTokenProviderReadiness | YouTubeExecuteTokenProviderReadiness | null;
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

export class V082RealCandidatePrivateUploadAdapter implements V081PrivateUploadPilotAdapter {
  readonly mode = "real_candidate" as const;

  async uploadPrivatePilot(): Promise<V081PrivateUploadPilotAdapterResult> {
    return {
      status: "BLOCKED",
      blocker: "BLOCKED_V082_REAL_UPLOAD_EXECUTION_NOT_ALLOWED_IN_THIS_PR",
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

export function createV082PrivateUploadRuntimeAdapterFactory(
  options: V082PrivateUploadRuntimeAdapterFactoryOptions = {}
): V082PrivateUploadRuntimeAdapterFactory {
  const readiness = buildV082PrivateUploadRuntimeAdapterReadiness(options.readinessInput);
  const adapter = readiness.ready
    ? new V082RealCandidatePrivateUploadAdapter()
    : new BlockedV081PrivateUploadPilotAdapter();

  return buildFactoryResult({ readiness, adapter });
}

export function createV082PrivateUploadRuntimeAdapterFactoryFromEnv(
  options: V082PrivateUploadRuntimeAdapterFactoryEnvOptions = {}
): V082PrivateUploadRuntimeAdapterFactory {
  const env = options.env ?? process.env;
  const tokenFileConfigured = TOKEN_FILE_ENVS.some((key) => Boolean(trimOrNull(env[key])));
  const tokenProviderReadiness = resolveTokenProviderReadiness(options, env);
  const readiness = buildV082PrivateUploadRuntimeAdapterReadiness({
    serverOnlyContext: options.serverOnlyContext ?? isServerOnlyContext(),
    oauthConfigured: Boolean(trimOrNull(env.YOUTUBE_CLIENT_ID) && trimOrNull(env.YOUTUBE_CLIENT_SECRET)),
    tokenProviderConfigured: Boolean(trimOrNull(env.YOUTUBE_TOKEN_PROVIDER_MODE) || tokenFileConfigured),
    tokenProviderReadiness,
    videoAssetResolverConfigured: options.videoAssetResolverConfigured ?? false,
    uploadPackageResolverConfigured: options.uploadPackageResolverConfigured ?? false,
    duplicateGuardConfigured: options.duplicateGuardConfigured ?? false,
    disclosureGuardConfigured: options.disclosureGuardConfigured ?? false,
    requestedVisibility: options.requestedVisibility,
    commentAutomationRequested: options.commentAutomationRequested,
    schedulerExecutionRequested: options.schedulerExecutionRequested,
    maxItems: options.maxItems,
    realUploadExecutionRequested: options.realUploadExecutionRequested
  });
  const adapter = readiness.ready
    ? new V082RealCandidatePrivateUploadAdapter()
    : new BlockedV081PrivateUploadPilotAdapter();

  return buildFactoryResult({ readiness, adapter });
}

function buildFactoryResult(input: {
  readiness: V082PrivateUploadRuntimeAdapterReadiness;
  adapter: V081PrivateUploadPilotAdapter;
}): V082PrivateUploadRuntimeAdapterFactory {
  return {
    version: "v082",
    readiness: input.readiness,
    adapter: input.adapter,
    uploadExecutionCalled: false,
    videos_insert_called: false,
    commentThreads_insert_called: false,
    raw_urls_printed: false,
    raw_video_ids_printed: false,
    raw_channel_ids_printed: false,
    secrets_printed: false,
    fake_success: false
  };
}

function isServerOnlyContext() {
  return typeof window === "undefined";
}

function resolveTokenProviderReadiness(
  options: V082PrivateUploadRuntimeAdapterFactoryEnvOptions,
  env: NodeJS.ProcessEnv
): V082PrivateUploadTokenProviderReadiness | null {
  if (Object.prototype.hasOwnProperty.call(options, "tokenProviderReadiness")) {
    return normalizeTokenProviderReadiness(options.tokenProviderReadiness ?? null);
  }

  return mapExecuteTokenProviderReadiness(buildYouTubeExecuteTokenProviderReadiness(env));
}

function normalizeTokenProviderReadiness(
  readiness: V082PrivateUploadRuntimeAdapterFactoryEnvOptions["tokenProviderReadiness"]
): V082PrivateUploadTokenProviderReadiness | null {
  if (!readiness) {
    return null;
  }

  if ("can_provide_upload_token" in readiness) {
    return mapExecuteTokenProviderReadiness(readiness);
  }

  return {
    providerReady: Boolean(readiness.providerReady),
    tokenReady: Boolean(readiness.tokenReady),
    uploadScopeReady: Boolean(readiness.uploadScopeReady),
    tokenFileSafeAndReadable: Boolean(readiness.tokenFileSafeAndReadable)
  };
}

function mapExecuteTokenProviderReadiness(
  readiness: YouTubeExecuteTokenProviderReadiness
): V082PrivateUploadTokenProviderReadiness {
  const blockers = new Set(readiness.blockers);
  const tokenFileUnsafeOrUnreadable = [
    "token_file_path_missing",
    "token_file_missing",
    "token_file_unreadable",
    "token_file_inside_repo"
  ].some((blocker) => blockers.has(blocker));

  return {
    providerReady: readiness.can_provide_upload_token,
    tokenReady: readiness.can_provide_upload_token,
    uploadScopeReady: readiness.can_provide_upload_token && !blockers.has("scopes_not_ready"),
    tokenFileSafeAndReadable: !tokenFileUnsafeOrUnreadable
  };
}

function trimOrNull(value: string | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized : null;
}
