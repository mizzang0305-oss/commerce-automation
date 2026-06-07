import path from "node:path";
import { YOUTUBE_UPLOAD_SCOPE } from "@/lib/uploads/youtube/youtubeOAuthScopes";

export const APPROVE_YOUTUBE_LOCAL_OAUTH_TOKEN_GENERATION = "APPROVE_YOUTUBE_LOCAL_OAUTH_TOKEN_GENERATION";

type AuthorizationUrlInput = {
  client_id: string;
  redirect_uri: string;
  scope?: string;
  state?: string;
};

export type TokenFilePathValidation = {
  safe: boolean;
  token_file_inside_repo: boolean;
  blocked_reason?: "token_file_missing" | "token_file_inside_repo";
  safe_summary: string;
};

export type TokenMetadataValidation = {
  token_ready: boolean;
  scopes_ready: boolean;
  raw_token_returned: false;
  blocked_reasons: string[];
};

type TokenFileJson = {
  access_token?: unknown;
  refresh_token?: unknown;
  scope?: unknown;
  scopes?: unknown;
  granted_scopes?: unknown;
};

export function buildYouTubeLocalOAuthAuthorizationUrl(input: AuthorizationUrlInput) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", input.client_id);
  url.searchParams.set("redirect_uri", input.redirect_uri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", input.scope?.trim() || YOUTUBE_UPLOAD_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  if (input.state?.trim()) {
    url.searchParams.set("state", input.state.trim());
  }
  return url.toString();
}

export function buildYouTubeLocalOAuthExchangeBlockedResult() {
  return {
    ok: false,
    error_code: "YOUTUBE_LOCAL_OAUTH_APPROVAL_REQUIRED",
    message: "YouTube local OAuth token generation requires exact operator approval.",
    required_confirmation: APPROVE_YOUTUBE_LOCAL_OAUTH_TOKEN_GENERATION,
    token_exchange_executed: false,
    token_file_written: false,
    raw_token_printed: false
  } as const;
}

export function hasYouTubeLocalOAuthApproval(value?: string | null) {
  return value === APPROVE_YOUTUBE_LOCAL_OAUTH_TOKEN_GENERATION;
}

export function validateYouTubeLocalOAuthTokenFilePath(tokenFilePath: string | undefined, repoRoot = process.cwd()): TokenFilePathValidation {
  if (!tokenFilePath?.trim()) {
    return {
      safe: false,
      token_file_inside_repo: false,
      blocked_reason: "token_file_missing",
      safe_summary: "Token file path is missing."
    };
  }

  const resolvedPath = path.resolve(/*turbopackIgnore: true*/ tokenFilePath);
  const resolvedRoot = path.resolve(/*turbopackIgnore: true*/ repoRoot);
  const token_file_inside_repo = isPathInside(resolvedPath, resolvedRoot);

  if (token_file_inside_repo) {
    return {
      safe: false,
      token_file_inside_repo: true,
      blocked_reason: "token_file_inside_repo",
      safe_summary: "Token file path is inside the repository and is blocked."
    };
  }

  return {
    safe: true,
    token_file_inside_repo: false,
    safe_summary: "Token file path is outside the repository."
  };
}

export function validateYouTubeTokenFileMetadataFromJson(jsonText: string): TokenMetadataValidation {
  const blocked_reasons: string[] = [];
  let tokenJson: TokenFileJson;

  try {
    tokenJson = JSON.parse(jsonText) as TokenFileJson;
  } catch {
    return {
      token_ready: false,
      scopes_ready: false,
      raw_token_returned: false,
      blocked_reasons: ["token_file_unreadable"]
    };
  }

  const token_ready = typeof tokenJson.refresh_token === "string" || typeof tokenJson.access_token === "string";
  const scopes_ready = getScopes(tokenJson).includes(YOUTUBE_UPLOAD_SCOPE);

  if (!token_ready) {
    blocked_reasons.push("token_not_ready");
  }
  if (!scopes_ready) {
    blocked_reasons.push("scopes_not_ready");
  }

  return {
    token_ready,
    scopes_ready,
    raw_token_returned: false,
    blocked_reasons
  };
}

function getScopes(tokenJson: TokenFileJson) {
  const scopes = new Set<string>();
  for (const value of [tokenJson.scope, tokenJson.scopes, tokenJson.granted_scopes]) {
    if (typeof value === "string") {
      value.split(/\s+/).filter(Boolean).forEach((scope) => scopes.add(scope));
    }
    if (Array.isArray(value)) {
      value.filter((scope): scope is string => typeof scope === "string").forEach((scope) => scopes.add(scope));
    }
  }
  return Array.from(scopes);
}

function isPathInside(filePath: string, rootPath: string) {
  const relative = path.relative(rootPath, filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
