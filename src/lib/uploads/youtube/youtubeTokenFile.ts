import "server-only";

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { YOUTUBE_UPLOAD_SCOPE } from "@/lib/uploads/youtube/youtubeOAuthScopes";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const TOKEN_FILE_ENV = "YOUTUBE_LOCAL_TOKEN_FILE_PATH";
const FALLBACK_TOKEN_FILE_ENV = "YOUTUBE_TOKEN_FILE";

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

type TokenReadResult =
  | {
    ok: true;
    accessToken: string;
    refreshed: boolean;
    token_refresh_attempted: boolean;
    token_refresh_succeeded: boolean;
    token_file_updated: boolean;
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

type TokenReaderOptions = {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
};

export async function readYouTubeAccessTokenFromLocalFile(options: TokenReaderOptions = {}): Promise<TokenReadResult> {
  const env = options.env ?? process.env;
  const tokenPath = env[TOKEN_FILE_ENV]?.trim() || env[FALLBACK_TOKEN_FILE_ENV]?.trim() || "";
  const pathValidation = validateTokenFilePath(tokenPath);
  if (!pathValidation.safe) {
    return {
      ok: false,
      blocked_reasons: [pathValidation.reason],
      safe_error: pathValidation.safe_error,
      external_api_called: false
    };
  }

  if (!existsSync(tokenPath)) {
    return {
      ok: false,
      blocked_reasons: ["token_file_missing"],
      safe_error: "YouTube token file does not exist.",
      external_api_called: false
    };
  }

  let tokenJson: TokenFileJson;
  try {
    tokenJson = JSON.parse(readFileSync(/*turbopackIgnore: true*/ tokenPath, "utf8")) as TokenFileJson;
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
  if (!refreshToken) {
    if (typeof tokenJson.access_token === "string" && tokenJson.access_token.trim()) {
      return {
        ok: true,
        accessToken: tokenJson.access_token.trim(),
        refreshed: false,
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

  const clientId = env.YOUTUBE_CLIENT_ID?.trim();
  const clientSecret = env.YOUTUBE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return {
      ok: false,
      blocked_reasons: ["provider_not_configured"],
      safe_error: "YouTube client credentials are required to refresh the local token.",
      external_api_called: false
    };
  }

  const response = await (options.fetchImpl ?? fetch)(TOKEN_ENDPOINT, {
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

  if (!response.ok || typeof payload?.access_token !== "string" || !payload.access_token.trim()) {
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

  const persisted = writeRefreshedTokenFile(tokenPath, tokenJson, payload);

  return {
    ok: true,
    accessToken: payload.access_token.trim(),
    refreshed: true,
    token_refresh_attempted: true,
    token_refresh_succeeded: true,
    token_file_updated: persisted.updated,
    token_file_update_warning: persisted.warning
  };
}

function validateTokenFilePath(tokenPath: string) {
  if (!tokenPath) {
    return {
      safe: false as const,
      reason: "token_file_path_missing",
      safe_error: `${TOKEN_FILE_ENV} or ${FALLBACK_TOKEN_FILE_ENV} is not configured.`
    };
  }

  const resolvedPath = path.resolve(/*turbopackIgnore: true*/ tokenPath);
  const resolvedRoot = path.resolve(/*turbopackIgnore: true*/ process.cwd());
  const relative = path.relative(resolvedRoot, resolvedPath);
  const insideRepo = relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  if (insideRepo) {
    return {
      safe: false as const,
      reason: "token_file_inside_repo",
      safe_error: "Token file path is inside the repository and is blocked."
    };
  }

  return {
    safe: true as const
  };
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

async function safeJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const json = await response.json();
    return json && typeof json === "object" && !Array.isArray(json) ? json as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function writeRefreshedTokenFile(tokenPath: string, existing: TokenFileJson, refreshPayload: Record<string, unknown>) {
  const nextToken: TokenFileJson = {
    ...existing,
    ...pickRefreshFields(refreshPayload),
    refresh_token: typeof refreshPayload.refresh_token === "string" && refreshPayload.refresh_token.trim()
      ? refreshPayload.refresh_token.trim()
      : existing.refresh_token
  };
  const tempPath = `${tokenPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(tempPath, JSON.stringify(nextToken, null, 2), { encoding: "utf8", flag: "wx" });
    renameSync(tempPath, tokenPath);
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
