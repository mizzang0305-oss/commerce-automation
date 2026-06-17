import "server-only";

import { buildYouTubeLocalTokenProviderStatus } from "@/lib/uploads/youtube/youtubeLocalTokenProvider";

export type YouTubeTokenProviderKind = "none" | "local_dev" | "server";
export type YouTubeTokenProviderMode = "contract_only" | "local_file" | "server_secret";

export type YouTubeTokenReadiness = {
  provider_configured: boolean;
  provider_kind: YouTubeTokenProviderKind;
  token_ready: boolean;
  scopes_ready: boolean;
  account_ready: boolean;
  quota_ready: boolean;
  policy_ready: boolean;
  blockers: string[];
  safe_message: string;
};

export type YouTubeExecuteTokenProviderReadiness = {
  provider_mode: YouTubeTokenProviderMode;
  can_provide_upload_token: boolean;
  token_source: "none" | "local_file" | "server_secret";
  blockers: string[];
  safe_message: string;
  secret_safe: true;
};

export type YouTubeUploadAccessTokenResult =
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

export interface YouTubeTokenProvider {
  getReadiness(): Promise<YouTubeTokenReadiness>;
  getAccessTokenForServerUpload(): Promise<string>;
}

export function buildYouTubeTokenProviderReadiness(env: NodeJS.ProcessEnv = process.env): YouTubeTokenReadiness {
  const provider = normalizeTokenProvider(env.YOUTUBE_TOKEN_PROVIDER);
  const providerMode = normalizeTokenProviderMode(env);
  const localStatus = providerMode === "local_file" ? buildYouTubeLocalTokenProviderStatus(env) : null;
  const providerConfigured = provider === "server" || Boolean(localStatus?.configured);
  const tokenReady = localStatus ? localStatus.token_ready : readBooleanEnvValue(env.YOUTUBE_TOKEN_READY);
  const scopesReady = localStatus ? localStatus.scopes_ready : readBooleanEnvValue(env.YOUTUBE_SCOPES_READY);
  const accountReady = readBooleanEnvValue(env.YOUTUBE_ACCOUNT_READY);
  const quotaReady = readBooleanEnvValue(env.YOUTUBE_QUOTA_READY);
  const policyReady = readBooleanEnvValue(env.YOUTUBE_POLICY_READY) && !readBooleanEnvValue(env.PUBLIC_UPLOAD_ENABLED);
  const blockers: string[] = [];

  if (!providerConfigured) blockers.push("provider_not_configured");
  if (!tokenReady) blockers.push("token_not_ready");
  if (!scopesReady) blockers.push("scopes_not_ready");
  if (!accountReady) {
    blockers.push("account_not_ready");
  }
  if (!quotaReady) {
    blockers.push("quota_not_ready");
  }
  if (!policyReady) {
    blockers.push("policy_not_ready");
  }

  return {
    provider_configured: providerConfigured,
    provider_kind: localStatus ? "local_dev" : provider,
    token_ready: tokenReady,
    scopes_ready: scopesReady,
    account_ready: accountReady,
    quota_ready: quotaReady,
    policy_ready: policyReady,
    blockers: [...new Set(blockers)],
    safe_message: localStatus
      ? localStatus.safe_summary
      : providerConfigured
        ? "Server-side YouTube token provider readiness is represented by safe booleans only."
        : "Server-accessible YouTube token provider is not configured."
  };
}

export function buildYouTubeExecuteTokenProviderReadiness(env: NodeJS.ProcessEnv = process.env): YouTubeExecuteTokenProviderReadiness {
  const providerMode = normalizeTokenProviderMode(env);

  if (providerMode === "contract_only") {
    return {
      provider_mode: "contract_only",
      can_provide_upload_token: false,
      token_source: "none",
      blockers: ["server_token_provider_contract_only"],
      safe_message: "Server-side YouTube token provider is contract-only and cannot execute live uploads.",
      secret_safe: true
    };
  }

  if (providerMode === "server_secret") {
    return {
      provider_mode: "server_secret",
      can_provide_upload_token: false,
      token_source: "server_secret",
      blockers: ["server_token_provider_not_configured"],
      safe_message: "Server-secret YouTube token provider is not configured for live upload execution.",
      secret_safe: true
    };
  }

  const localStatus = buildYouTubeLocalTokenProviderStatus(env);
  return {
    provider_mode: "local_file",
    can_provide_upload_token: localStatus.configured && localStatus.token_ready && localStatus.scopes_ready,
    token_source: "local_file",
    blockers: localStatus.blocked_reasons,
    safe_message: localStatus.safe_summary,
    secret_safe: true
  };
}

export async function getYouTubeUploadAccessTokenForServerUpload(options: {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
} = {}): Promise<YouTubeUploadAccessTokenResult> {
  const env = options.env ?? process.env;
  const providerMode = normalizeTokenProviderMode(env);

  if (providerMode === "local_file") {
    const { readYouTubeAccessTokenFromLocalFile } = await import("@/lib/uploads/youtube/youtubeTokenFile");
    return readYouTubeAccessTokenFromLocalFile({
      env,
      fetchImpl: options.fetchImpl
    });
  }

  if (providerMode === "server_secret") {
    return {
      ok: false,
      blocked_reasons: ["server_token_provider_not_configured"],
      safe_error: "Server-secret YouTube token provider is not configured for live upload execution.",
      external_api_called: false,
      token_refresh_attempted: false,
      token_refresh_succeeded: false,
      reauth_required: false
    };
  }

  return {
    ok: false,
    blocked_reasons: ["server_token_provider_contract_only"],
    safe_error: "Server-side YouTube token provider is contract-only and cannot execute live uploads.",
    external_api_called: false,
    token_refresh_attempted: false,
    token_refresh_succeeded: false,
    reauth_required: false
  };
}

export class LocalDevYouTubeTokenProvider implements YouTubeTokenProvider {
  async getReadiness(): Promise<YouTubeTokenReadiness> {
    return {
      provider_configured: false,
      provider_kind: "local_dev",
      token_ready: false,
      scopes_ready: false,
      account_ready: false,
      quota_ready: false,
      policy_ready: false,
      blockers: ["provider_not_configured"],
      safe_message: "Local token files are for localhost smoke only and are not domain-ready."
    };
  }

  async getAccessTokenForServerUpload(): Promise<string> {
    throw new Error("Local token file provider is not available for domain/server upload.");
  }
}

export class ConfiguredYouTubeTokenProvider implements YouTubeTokenProvider {
  async getReadiness(): Promise<YouTubeTokenReadiness> {
    return buildYouTubeTokenProviderReadiness();
  }

  async getAccessTokenForServerUpload(): Promise<string> {
    throw new Error("Server token retrieval is contract-only in this PR.");
  }
}

function normalizeTokenProvider(value: unknown): YouTubeTokenProviderKind {
  const provider = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!provider) {
    return "none";
  }
  if (provider === "local" || provider === "local_dev" || provider === "local_file") {
    return "local_dev";
  }
  return "server";
}

function normalizeTokenProviderMode(env: NodeJS.ProcessEnv): YouTubeTokenProviderMode {
  const explicitMode = typeof env.YOUTUBE_TOKEN_PROVIDER_MODE === "string"
    ? env.YOUTUBE_TOKEN_PROVIDER_MODE.trim().toLowerCase()
    : "";
  if (["local", "local_dev", "local_file"].includes(explicitMode)) {
    return "local_file";
  }
  if (["server", "server_secret"].includes(explicitMode)) {
    return "server_secret";
  }
  if (["contract", "contract_only", "disabled", "none"].includes(explicitMode)) {
    return "contract_only";
  }

  if (hasConfiguredLocalTokenPath(env)) {
    return "local_file";
  }

  const legacyProvider = normalizeTokenProvider(env.YOUTUBE_TOKEN_PROVIDER);
  if (legacyProvider === "local_dev") {
    return "local_file";
  }

  return "contract_only";
}

function hasConfiguredLocalTokenPath(env: NodeJS.ProcessEnv) {
  return Boolean(env.YOUTUBE_LOCAL_TOKEN_FILE_PATH?.trim() || env.YOUTUBE_TOKEN_FILE?.trim());
}

function readBooleanEnvValue(value: unknown) {
  if (typeof value !== "string") {
    return false;
  }
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}
