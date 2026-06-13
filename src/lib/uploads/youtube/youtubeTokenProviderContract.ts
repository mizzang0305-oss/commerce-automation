import "server-only";

export type YouTubeTokenProviderKind = "none" | "local_dev" | "server";

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

export interface YouTubeTokenProvider {
  getReadiness(): Promise<YouTubeTokenReadiness>;
  getAccessTokenForServerUpload(): Promise<string>;
}

export function buildYouTubeTokenProviderReadiness(env: NodeJS.ProcessEnv = process.env): YouTubeTokenReadiness {
  const provider = normalizeTokenProvider(env.YOUTUBE_TOKEN_PROVIDER);
  const providerConfigured = provider === "server";
  const tokenReady = readBooleanEnvValue(env.YOUTUBE_TOKEN_READY);
  const scopesReady = readBooleanEnvValue(env.YOUTUBE_SCOPES_READY);
  const accountReady = readBooleanEnvValue(env.YOUTUBE_ACCOUNT_READY);
  const quotaReady = readBooleanEnvValue(env.YOUTUBE_QUOTA_READY);
  const policyReady = readBooleanEnvValue(env.YOUTUBE_POLICY_READY) && !readBooleanEnvValue(env.PUBLIC_UPLOAD_ENABLED);
  const blockers: string[] = [];

  if (!providerConfigured) {
    blockers.push("provider_not_configured");
  }
  if (!tokenReady) {
    blockers.push("token_not_ready");
  }
  if (!scopesReady) {
    blockers.push("scopes_not_ready");
  }
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
    provider_kind: provider,
    token_ready: tokenReady,
    scopes_ready: scopesReady,
    account_ready: accountReady,
    quota_ready: quotaReady,
    policy_ready: policyReady,
    blockers: [...new Set(blockers)],
    safe_message: providerConfigured
      ? "Server-side YouTube token provider readiness is represented by safe booleans only."
      : "Server-accessible YouTube token provider is not configured."
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

function readBooleanEnvValue(value: unknown) {
  if (typeof value !== "string") {
    return false;
  }
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}
