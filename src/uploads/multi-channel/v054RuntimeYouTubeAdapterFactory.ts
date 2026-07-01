import fs from "node:fs/promises";
import path from "node:path";

import { YOUTUBE_UPLOAD_SCOPE } from "@/lib/uploads/youtube/youtubeOAuthScopes";

import type { ChannelKey } from "./channelProfiles";
import {
  buildV050ChannelAccountReadiness,
  type V050ChannelAccountReadiness,
  type V050ChannelAccountRoute
} from "./channelAccountReadinessGate";
import {
  buildV050DuplicateUploadGuard,
  type V050DuplicateUploadGuard
} from "./threeChannelYouTubeAdapterInjection";
import {
  buildV055YouTubeVideoInsertBody,
  ensureCoupangDisclosure
} from "../youtube/youtubeDisclosurePayload";
import {
  verifyInsertedCommentVisibility,
  type V055CommentVisibilityVerification
} from "../youtube/youtubeCommentVisibilityVerifier";
import {
  evaluateV055ChannelRoutingHardGate,
  type V055ChannelRoutingHardGateBlocker
} from "./channelRoutingHardGate";
import {
  buildAuthenticatedChannelProbe,
  type AuthenticatedChannelProbeResult
} from "./runtimeAuthenticatedChannelProbe";
import {
  buildV049ExecutionCommentText
} from "./threeChannelUploadExecutor";
import {
  buildV049ThreeChannelUploadPreflight,
  type V049AffiliateUrls
} from "./threeChannelUploadPreflight";
import type {
  V051MutationCommentAdapter,
  V051MutationExecutorAdapters,
  V051MutationSafetyOverrides,
  V051MutationUploadAdapter
} from "./v051MutationEnabledExecutor";
import type { V051MutationBlocker } from "./v051MutationSafetyGate";

const YOUTUBE_VIDEO_INSERT_URL =
  "https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status,paidProductPlacementDetails&uploadType=resumable";
const YOUTUBE_COMMENT_THREADS_INSERT_URL =
  "https://www.googleapis.com/youtube/v3/commentThreads?part=snippet";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const TOKEN_FILE_ENV = "YOUTUBE_LOCAL_TOKEN_FILE_PATH";
const FALLBACK_TOKEN_FILE_ENV = "YOUTUBE_TOKEN_FILE";
const TARGET_CHANNEL_ID_ENVS: Record<ChannelKey, string> = {
  father_jobs: "YOUTUBE_FATHER_JOBS_CHANNEL_ID",
  neoman_moleulgeol: "YOUTUBE_NEOMAN_MOLEULGEOL_CHANNEL_ID",
  lets_buy: "YOUTUBE_LETS_BUY_CHANNEL_ID"
};

const CHANNEL_TARGETS: Record<ChannelKey, {
  youtube_account_alias: string;
  target_channel_id_or_handle: string;
}> = {
  father_jobs: {
    youtube_account_alias: "father_jobs_youtube_account",
    target_channel_id_or_handle: "@father-jobs"
  },
  neoman_moleulgeol: {
    youtube_account_alias: "neoman_moleulgeol_youtube_account",
    target_channel_id_or_handle: "@neoman-moleulgeol"
  },
  lets_buy: {
    youtube_account_alias: "lets_buy_youtube_account",
    target_channel_id_or_handle: "@lets-buy"
  }
};

const CHANNEL_ORDER: ChannelKey[] = ["father_jobs", "neoman_moleulgeol", "lets_buy"];

export type V054RuntimeAdapterReadiness = V050ChannelAccountReadiness & {
  version: "v054";
  FINAL_STATUS:
    | "SUCCESS_V054_RUNTIME_YOUTUBE_ADAPTERS_READY_NO_UPLOAD"
    | "BLOCKED_V054_RUNTIME_YOUTUBE_ADAPTERS_NOT_READY"
    | "BLOCKED_CHANNEL_ACCOUNT_ROUTING_NOT_READY";
  V054_RUNTIME_ADAPTERS_READY: boolean;
  SAFE_TO_UPLOAD: false;
  upload_adapter_factory_ready: boolean;
  comment_adapter_factory_ready: boolean;
  token_provider_factory_ready: boolean;
  channel_account_router_factory_ready: boolean;
  duplicate_upload_guard_wired: boolean;
  metadata_gate_wired: boolean;
  duplicate_upload_risk: boolean;
  metadata_gate_ready: boolean;
  runtime_upload_adapter_found: true;
  runtime_comment_adapter_found: true;
  runtime_token_provider_found: true;
  proven_v035_upload_adapter_path: "src/lib/uploads/youtube/youtubeUploadAdapter.ts";
  proven_v035_public_upload_evidence_path: "commerce-assets/review/candidate-3c4f2ee364ba5b07/v035/public-upload-result.json";
  proven_v035_comment_evidence_path: "commerce-assets/review/candidate-3c4f2ee364ba5b07/v035/public-upload-result.json";
  duplicate_upload_guard: V050DuplicateUploadGuard;
  upload_attempted: false;
  new_upload_attempted: false;
  youtube_execute_called: false;
  videos_insert_called: false;
  videos_insert_total_count: 0;
  comment_create_update_delete_called: false;
  comment_create_total_count: 0;
  visibility_changed: false;
  visibility_changed_existing_video: false;
  private_upload: false;
  unlisted_upload: false;
  R2_upload: false;
  product_assets_write: false;
  DB_write: false;
  raw_urls_printed: false;
  secrets_printed: false;
  fake_success: false;
  blocker: string | null;
};

export type V054RuntimeFactory = {
  readiness: V054RuntimeAdapterReadiness;
  adapters: V051MutationExecutorAdapters;
  safetyOverrides: V051MutationSafetyOverrides;
};

type YouTubeUploadAccessTokenResult =
  | {
    ok: true;
    accessToken: string;
    token_refresh_attempted?: boolean;
    token_refresh_succeeded?: boolean;
    token_file_updated?: boolean;
    token_file_update_warning?: string;
  }
  | {
    ok: false;
    blocked_reasons: string[];
    safe_error: string;
    external_api_called: boolean;
    token_refresh_attempted?: boolean;
    token_refresh_succeeded?: boolean;
    reauth_required?: boolean;
  };

type TokenFileJson = {
  access_token?: unknown;
  refresh_token?: unknown;
  scope?: unknown;
  scopes?: unknown;
  granted_scopes?: unknown;
  expiry_date?: unknown;
  expires_at?: unknown;
  token_type?: unknown;
};

export type V054RuntimeFactoryOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  accessTokenProvider?: (channelKey: ChannelKey) => Promise<YouTubeUploadAccessTokenResult>;
  authenticatedChannelProbeProvider?: (input: {
    channelKey: ChannelKey;
    uploadAccountAlias: string;
    accessToken: string;
    fetchImpl: typeof fetch;
  }) => Promise<AuthenticatedChannelProbeResult>;
  commentVisibilityVerifier?: (input: {
    videoId: string;
    commentId: string;
    expectedAffiliateUrl: string;
    accessToken: string;
    fetchImpl: typeof fetch;
  }) => Promise<V055CommentVisibilityVerification>;
  targetChannelIds?: Partial<Record<ChannelKey, string>>;
  routes?: V050ChannelAccountRoute[];
  affiliateUrls?: V049AffiliateUrls;
};

type V054RuntimeSharedOptions = {
  cwd: string;
  env: NodeJS.ProcessEnv;
  fetchImpl: typeof fetch;
  routes: V050ChannelAccountRoute[];
  accessTokenProvider?: (channelKey: ChannelKey) => Promise<YouTubeUploadAccessTokenResult>;
  authenticatedChannelProbeProvider?: V054RuntimeFactoryOptions["authenticatedChannelProbeProvider"];
  commentVisibilityVerifier?: V054RuntimeFactoryOptions["commentVisibilityVerifier"];
  targetChannelIds: Partial<Record<ChannelKey, string>>;
};

type V054RuntimeRoutingProbeResolution =
  | {
    ok: true;
    accessTokens: Partial<Record<ChannelKey, string>>;
  }
  | {
    ok: false;
    blocker: V051MutationBlocker;
  };

export async function createV054RuntimeYouTubeAdapters(
  options: V054RuntimeFactoryOptions = {}
): Promise<V054RuntimeFactory> {
  const readiness = await buildV054RuntimeYouTubeAdapterReadiness(options);
  const shared = {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    fetchImpl: options.fetchImpl ?? fetch,
    routes: readiness.routes,
    accessTokenProvider: options.accessTokenProvider,
    authenticatedChannelProbeProvider: options.authenticatedChannelProbeProvider,
    commentVisibilityVerifier: options.commentVisibilityVerifier,
    targetChannelIds: {
      ...resolveV054RuntimeTargetChannelIds(options.env ?? process.env),
      ...(options.targetChannelIds ?? {})
    }
  };

  return {
    readiness,
    adapters: {
      uploadAdapter: createV054RuntimeUploadAdapter(shared),
      commentAdapter: createV054RuntimeCommentAdapter(shared)
    },
    safetyOverrides: {
      channelRoutingReady: readiness.CHANNEL_ROUTING_READY,
      duplicateUploadRisk: readiness.duplicate_upload_risk,
      metadataGateReady: readiness.metadata_gate_ready
    }
  };
}

export async function buildV054RuntimeYouTubeAdapterReadiness(
  options: V054RuntimeFactoryOptions = {}
): Promise<V054RuntimeAdapterReadiness> {
  const cwd = options.cwd ?? process.cwd();
  const preflight = await buildV049ThreeChannelUploadPreflight({
    cwd,
    affiliateUrls: options.affiliateUrls
  });
  const routes = options.routes ?? resolveV054RuntimeChannelAccountRoutes();
  const channelReadiness = buildV050ChannelAccountReadiness(routes);
  const duplicateGuard = buildV050DuplicateUploadGuard(preflight.channels.map((channel) => ({
    channel_key: channel.channel_key,
    video_path: channel.video_path
  })));
  const metadataGateReady = preflight.channels.every((channel) => channel.description_metadata_gate.can_pass_metadata_gate);
  const factoryChecks = {
    upload_adapter_factory_ready: true,
    comment_adapter_factory_ready: true,
    token_provider_factory_ready: true,
    channel_account_router_factory_ready: true,
    duplicate_upload_guard_wired: duplicateGuard.duplicate_upload_guard_injected,
    metadata_gate_wired: true
  };
  const blocker = firstBlocker([
    channelReadiness.CHANNEL_ROUTING_READY ? null : "BLOCKED_CHANNEL_ACCOUNT_ROUTING_NOT_READY",
    duplicateGuard.duplicate_upload_risk ? "DUPLICATE_UPLOAD_RISK" : null,
    metadataGateReady ? null : "METADATA_GATE_NOT_READY",
    Object.values(factoryChecks).every(Boolean) ? null : "V054_RUNTIME_FACTORY_NOT_READY"
  ]);
  const runtimeReady = blocker === null;

  return {
    version: "v054",
    FINAL_STATUS: runtimeReady
      ? "SUCCESS_V054_RUNTIME_YOUTUBE_ADAPTERS_READY_NO_UPLOAD"
      : blocker === "BLOCKED_CHANNEL_ACCOUNT_ROUTING_NOT_READY"
        ? "BLOCKED_CHANNEL_ACCOUNT_ROUTING_NOT_READY"
        : "BLOCKED_V054_RUNTIME_YOUTUBE_ADAPTERS_NOT_READY",
    V054_RUNTIME_ADAPTERS_READY: runtimeReady,
    SAFE_TO_UPLOAD: false,
    ...factoryChecks,
    ...channelReadiness,
    duplicate_upload_risk: duplicateGuard.duplicate_upload_risk,
    metadata_gate_ready: metadataGateReady,
    runtime_upload_adapter_found: true,
    runtime_comment_adapter_found: true,
    runtime_token_provider_found: true,
    proven_v035_upload_adapter_path: "src/lib/uploads/youtube/youtubeUploadAdapter.ts",
    proven_v035_public_upload_evidence_path: "commerce-assets/review/candidate-3c4f2ee364ba5b07/v035/public-upload-result.json",
    proven_v035_comment_evidence_path: "commerce-assets/review/candidate-3c4f2ee364ba5b07/v035/public-upload-result.json",
    duplicate_upload_guard: duplicateGuard,
    upload_attempted: false,
    new_upload_attempted: false,
    youtube_execute_called: false,
    videos_insert_called: false,
    videos_insert_total_count: 0,
    comment_create_update_delete_called: false,
    comment_create_total_count: 0,
    visibility_changed: false,
    visibility_changed_existing_video: false,
    private_upload: false,
    unlisted_upload: false,
    R2_upload: false,
    product_assets_write: false,
    DB_write: false,
    raw_urls_printed: false,
    secrets_printed: false,
    fake_success: false,
    blocker
  };
}

export function resolveV054RuntimeChannelAccountRoutes(
  resolvedUploadAccounts: Partial<Record<ChannelKey, string>> = {}
): V050ChannelAccountRoute[] {
  return CHANNEL_ORDER.map((channelKey) => {
    const target = CHANNEL_TARGETS[channelKey];
    const resolvedAlias = resolvedUploadAccounts[channelKey]?.trim() || target.youtube_account_alias;
    return {
      channel_key: channelKey,
      youtube_account_alias: target.youtube_account_alias,
      target_channel_id_or_handle: target.target_channel_id_or_handle,
      resolved_upload_account_alias: resolvedAlias,
      target_channel_configured: Boolean(target.target_channel_id_or_handle),
      resolved_channel_id_or_handle_present: Boolean(target.target_channel_id_or_handle),
      upload_account_matches_target: resolvedAlias === target.youtube_account_alias,
      token_scope: "youtube.upload",
      read_only_check_required_before_v051: true,
      secret_safe: true,
      blocker: resolvedAlias === target.youtube_account_alias ? null : "CHANNEL_ACCOUNT_MISMATCH"
    };
  });
}

export function resolveV054RuntimeTargetChannelIds(
  env: NodeJS.ProcessEnv = process.env
): Partial<Record<ChannelKey, string>> {
  return Object.fromEntries(CHANNEL_ORDER.map((channelKey) => [
    channelKey,
    env[TARGET_CHANNEL_ID_ENVS[channelKey]]?.trim() ?? ""
  ]).filter(([, value]) => Boolean(value))) as Partial<Record<ChannelKey, string>>;
}

async function resolveV054RuntimeRoutingProbe(
  options: V054RuntimeSharedOptions
): Promise<V054RuntimeRoutingProbeResolution> {
  const accessTokens: Partial<Record<ChannelKey, string>> = {};
  const probes: Partial<Record<ChannelKey, AuthenticatedChannelProbeResult>> = {};

  for (const channelKey of CHANNEL_ORDER) {
    const route = routeFor(options.routes, channelKey);
    if (!route || route.blocker || !route.upload_account_matches_target) {
      return { ok: false, blocker: "RUNTIME_CHANNEL_ROUTE_NOT_READY" };
    }
    const token = await resolveAccessToken(channelKey, options);
    if (!token.ok) {
      return { ok: false, blocker: "RUNTIME_TOKEN_PROVIDER_NOT_READY" };
    }
    accessTokens[channelKey] = token.accessToken;
    probes[channelKey] = await (options.authenticatedChannelProbeProvider ?? buildAuthenticatedChannelProbe)({
      channelKey,
      uploadAccountAlias: route.resolved_upload_account_alias,
      accessToken: token.accessToken,
      fetchImpl: options.fetchImpl
    });
  }

  const hardGate = evaluateV055ChannelRoutingHardGate({
    routes: options.routes,
    targetChannelIds: options.targetChannelIds,
    probes
  });
  if (!hardGate.routing_ready) {
    return {
      ok: false,
      blocker: mapV055RoutingBlocker(hardGate.blocker)
    };
  }

  return { ok: true, accessTokens };
}

function mapV055RoutingBlocker(
  blocker: V055ChannelRoutingHardGateBlocker | null
): V051MutationBlocker {
  return blocker ?? "BLOCKED_AUTHENTICATED_CHANNEL_PROBE_MISSING";
}

function createV054RuntimeUploadAdapter(options: V054RuntimeSharedOptions): V051MutationUploadAdapter {
  let routingProbePromise: Promise<V054RuntimeRoutingProbeResolution> | null = null;
  const resolveRoutingProbe = () => {
    routingProbePromise ??= resolveV054RuntimeRoutingProbe(options);
    return routingProbePromise;
  };

  return {
    async uploadPublicShorts(input) {
      const route = routeFor(options.routes, input.channelKey);
      if (!route || route.blocker || !route.upload_account_matches_target) {
        return blockedUpload("RUNTIME_CHANNEL_ROUTE_NOT_READY");
      }
      if (input.visibility !== "public") {
        return blockedUpload("NON_PUBLIC_UPLOAD_RESULT_REJECTED");
      }
      const routingProbe = await resolveRoutingProbe();
      if (!routingProbe.ok) {
        return blockedUpload(routingProbe.blocker);
      }
      const accessToken = routingProbe.accessTokens[input.channelKey]?.trim();
      if (!accessToken) {
        return blockedUpload("RUNTIME_TOKEN_PROVIDER_NOT_READY");
      }
      const videoAsset = await readLocalVideoAsset(input.videoPath);
      if (!videoAsset.ok) {
        return blockedUpload("RUNTIME_VIDEO_ASSET_NOT_READY");
      }

      const session = await startPublicUploadSession({
        fetchImpl: options.fetchImpl,
        accessToken,
        title: input.title,
        description: input.description,
        size: videoAsset.bytes.byteLength,
        containsSyntheticMedia: true,
        containsPaidPromotion: input.containsPaidPromotion,
        madeForKids: input.madeForKids
      });
      if (!session.ok) {
        return blockedUpload("RUNTIME_YOUTUBE_UPLOAD_FAILED", true);
      }

      const upload = await uploadVideoBytes({
        fetchImpl: options.fetchImpl,
        uploadUrl: session.uploadUrl,
        accessToken,
        bytes: videoAsset.bytes
      });
      if (!upload.ok) {
        return blockedUpload("RUNTIME_YOUTUBE_UPLOAD_FAILED", true);
      }

      return {
        videoId: upload.videoId,
        visibility: "public" as const,
        videosInsertCalled: true
      };
    }
  };
}

function createV054RuntimeCommentAdapter(options: V054RuntimeSharedOptions): V051MutationCommentAdapter {
  return {
    async createTopLevelComment(input) {
      const route = routeFor(options.routes, input.channelKey);
      if (!route || route.blocker || !route.upload_account_matches_target) {
        return blockedComment("RUNTIME_CHANNEL_ROUTE_NOT_READY");
      }
      const token = await resolveAccessToken(input.channelKey, options);
      if (!token.ok) {
        return blockedComment("RUNTIME_TOKEN_PROVIDER_NOT_READY");
      }

      const response = await options.fetchImpl(YOUTUBE_COMMENT_THREADS_INSERT_URL, {
        method: "POST",
        headers: new Headers({
          Authorization: `Bearer ${token.accessToken}`,
          "Content-Type": "application/json"
        }),
        body: JSON.stringify({
          snippet: {
            videoId: input.videoId,
            topLevelComment: {
              snippet: {
                textOriginal: ensureCoupangDisclosure(input.commentTextWithAffiliateUrl)
              }
            }
          }
        })
      });
      const payload = await safeJson(response);
      const commentId = typeof payload.id === "string" ? payload.id.trim() : "";
      if (!response.ok || !commentId) {
        return blockedComment("RUNTIME_COMMENT_FAILED", true);
      }
      const verification = await (options.commentVisibilityVerifier ?? verifyInsertedCommentVisibility)({
        videoId: input.videoId,
        commentId,
        expectedAffiliateUrl: input.affiliateUrl,
        accessToken: token.accessToken,
        fetchImpl: options.fetchImpl
      });
      if (!verification.ok) {
        return blockedComment(verification.blocker ?? "COMMENT_INSERT_REPORTED_BUT_NOT_VISIBLE", true);
      }

      return {
        commentId,
        commentMutationCalled: true
      };
    }
  };
}

export function buildV054RuntimeCommentText(input: {
  channelKey: ChannelKey;
  affiliateUrl: string;
}) {
  return buildV049ExecutionCommentText(input);
}

async function resolveAccessToken(
  channelKey: ChannelKey,
  options: {
    env: NodeJS.ProcessEnv;
    fetchImpl: typeof fetch;
    accessTokenProvider?: (channelKey: ChannelKey) => Promise<YouTubeUploadAccessTokenResult>;
  }
): Promise<YouTubeUploadAccessTokenResult> {
  if (options.accessTokenProvider) {
    return options.accessTokenProvider(channelKey);
  }
  return readV054AccessTokenFromLocalFile({
    env: options.env,
    fetchImpl: options.fetchImpl
  });
}

async function readV054AccessTokenFromLocalFile(options: {
  env: NodeJS.ProcessEnv;
  fetchImpl: typeof fetch;
}): Promise<YouTubeUploadAccessTokenResult> {
  const tokenPath = options.env[TOKEN_FILE_ENV]?.trim() || options.env[FALLBACK_TOKEN_FILE_ENV]?.trim() || "";
  const pathValidation = validateTokenFilePath(tokenPath);
  if (!pathValidation.safe) {
    return {
      ok: false,
      blocked_reasons: [pathValidation.reason],
      safe_error: pathValidation.safe_error,
      external_api_called: false
    };
  }

  let tokenJson: TokenFileJson;
  try {
    tokenJson = JSON.parse(await fs.readFile(tokenPath, "utf8")) as TokenFileJson;
  } catch {
    return {
      ok: false,
      blocked_reasons: ["token_file_unreadable"],
      safe_error: "YouTube token file could not be parsed.",
      external_api_called: false
    };
  }

  if (!hasUploadScope(tokenJson)) {
    return {
      ok: false,
      blocked_reasons: ["scopes_not_ready"],
      safe_error: "YouTube token metadata does not include the upload scope.",
      external_api_called: false
    };
  }

  const refreshToken = typeof tokenJson.refresh_token === "string" ? tokenJson.refresh_token.trim() : "";
  const accessToken = typeof tokenJson.access_token === "string" ? tokenJson.access_token.trim() : "";
  if (!refreshToken) {
    if (accessToken) {
      return {
        ok: true,
        accessToken,
        token_refresh_attempted: false,
        token_refresh_succeeded: false,
        token_file_updated: false
      };
    }
    return {
      ok: false,
      blocked_reasons: ["token_not_ready"],
      safe_error: "YouTube token metadata does not include a usable access or refresh token.",
      external_api_called: false
    };
  }

  const clientId = options.env.YOUTUBE_CLIENT_ID?.trim();
  const clientSecret = options.env.YOUTUBE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return {
      ok: false,
      blocked_reasons: ["provider_not_configured"],
      safe_error: "YouTube client credentials are required to refresh the local token.",
      external_api_called: false
    };
  }

  const response = await options.fetchImpl(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });
  const payload = await safeJson(response);
  const refreshedAccessToken = typeof payload.access_token === "string" ? payload.access_token.trim() : "";
  if (!response.ok || !refreshedAccessToken) {
    return {
      ok: false,
      blocked_reasons: ["youtube_token_refresh_failed"],
      safe_error: "YouTube token refresh failed.",
      external_api_called: true,
      token_refresh_attempted: true,
      token_refresh_succeeded: false,
      reauth_required: true
    };
  }

  const persisted = await writeRefreshedTokenFile(tokenPath, tokenJson, payload);
  return {
    ok: true,
    accessToken: refreshedAccessToken,
    token_refresh_attempted: true,
    token_refresh_succeeded: true,
    token_file_updated: persisted.updated,
    token_file_update_warning: persisted.warning
  };
}

function validateTokenFilePath(tokenPath: string):
  | { safe: true }
  | { safe: false; reason: string; safe_error: string } {
  if (!tokenPath) {
    return {
      safe: false,
      reason: "token_file_path_missing",
      safe_error: `${TOKEN_FILE_ENV} or ${FALLBACK_TOKEN_FILE_ENV} is not configured.`
    };
  }

  const resolvedPath = path.resolve(tokenPath);
  const resolvedRoot = path.resolve(process.cwd());
  const relative = path.relative(resolvedRoot, resolvedPath);
  const insideRepo = relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  if (insideRepo) {
    return {
      safe: false,
      reason: "token_file_inside_repo",
      safe_error: "Token file path is inside the repository and is blocked."
    };
  }

  return { safe: true };
}

function hasUploadScope(tokenJson: TokenFileJson) {
  const scopes = new Set<string>();
  for (const value of [tokenJson.scope, tokenJson.scopes, tokenJson.granted_scopes]) {
    if (typeof value === "string") {
      value.split(/\s+/).filter(Boolean).forEach((scope) => scopes.add(scope));
    }
    if (Array.isArray(value)) {
      value.filter((scope): scope is string => typeof scope === "string").forEach((scope) => scopes.add(scope));
    }
  }
  return scopes.has(YOUTUBE_UPLOAD_SCOPE);
}

async function writeRefreshedTokenFile(
  tokenPath: string,
  existing: TokenFileJson,
  refreshPayload: Record<string, unknown>
) {
  const nextToken: TokenFileJson = {
    ...existing,
    ...pickRefreshFields(refreshPayload),
    refresh_token: typeof refreshPayload.refresh_token === "string" && refreshPayload.refresh_token.trim()
      ? refreshPayload.refresh_token.trim()
      : existing.refresh_token
  };
  const tempPath = `${tokenPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(tempPath, JSON.stringify(nextToken, null, 2), { encoding: "utf8", flag: "wx" });
    await fs.rename(tempPath, tokenPath);
    return { updated: true };
  } catch {
    return {
      updated: false,
      warning: "Refreshed token could not be persisted; using it for this request only."
    };
  }
}

function pickRefreshFields(payload: Record<string, unknown>): TokenFileJson {
  const next: TokenFileJson = {};
  for (const key of ["access_token", "scope", "scopes", "granted_scopes", "expiry_date", "expires_at", "token_type"] as const) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      next[key] = value.trim();
    } else if (Array.isArray(value)) {
      next[key] = value;
    } else if (typeof value === "number" && Number.isFinite(value)) {
      next[key] = value;
    }
  }
  if (typeof payload.expires_in === "number" && Number.isFinite(payload.expires_in)) {
    next.expiry_date = Date.now() + payload.expires_in * 1000;
  }
  return next;
}

async function readLocalVideoAsset(videoPath: string) {
  try {
    const bytes = await fs.readFile(path.resolve(videoPath));
    if (bytes.byteLength <= 0) {
      return { ok: false as const };
    }
    return { ok: true as const, bytes };
  } catch {
    return { ok: false as const };
  }
}

async function startPublicUploadSession(input: {
  fetchImpl: typeof fetch;
  accessToken: string;
  title: string;
  description: string;
  size: number;
  containsSyntheticMedia: true;
  containsPaidPromotion: true;
  madeForKids: false;
}) {
  const response = await input.fetchImpl(YOUTUBE_VIDEO_INSERT_URL, {
    method: "POST",
    headers: new Headers({
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
      "X-Upload-Content-Type": "video/mp4",
      "X-Upload-Content-Length": String(input.size)
    }),
    body: JSON.stringify(buildV055YouTubeVideoInsertBody({
      title: input.title,
      description: input.description,
      madeForKids: input.madeForKids,
      visibility: "public",
      containsSyntheticMedia: input.containsSyntheticMedia,
      containsPaidPromotion: input.containsPaidPromotion
    }))
  });
  const uploadUrl = response.headers.get("Location")?.trim() ?? "";
  if (!response.ok || !uploadUrl) {
    return { ok: false as const };
  }
  return { ok: true as const, uploadUrl };
}

async function uploadVideoBytes(input: {
  fetchImpl: typeof fetch;
  uploadUrl: string;
  accessToken: string;
  bytes: Buffer;
}) {
  const response = await input.fetchImpl(input.uploadUrl, {
    method: "PUT",
    headers: new Headers({
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "video/mp4",
      "Content-Length": String(input.bytes.byteLength)
    }),
    body: new Uint8Array(input.bytes)
  });
  const payload = await safeJson(response);
  const videoId = typeof payload.id === "string" ? payload.id.trim() : "";
  if (!response.ok || !videoId) {
    return { ok: false as const };
  }
  return { ok: true as const, videoId };
}

function routeFor(routes: V050ChannelAccountRoute[], channelKey: ChannelKey) {
  return routes.find((route) => route.channel_key === channelKey);
}

function blockedUpload(blockedReason: V051MutationBlocker, externalCallAttempted = false) {
  return {
    videoId: "",
    visibility: "public" as const,
    ambiguous: false,
    blockedReason,
    videosInsertCalled: externalCallAttempted
  };
}

function blockedComment(blockedReason: V051MutationBlocker, externalCallAttempted = false) {
  return {
    commentId: "",
    ambiguous: false,
    blockedReason,
    commentMutationCalled: externalCallAttempted
  };
}

async function safeJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const json = await response.json();
    return json && typeof json === "object" && !Array.isArray(json) ? json as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function firstBlocker(values: Array<string | null>) {
  return values.find((value): value is string => Boolean(value)) ?? null;
}
