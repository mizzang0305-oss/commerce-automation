import "server-only";

import { existsSync, readFileSync } from "node:fs";
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
};

type TokenReadResult =
  | { ok: true; accessToken: string; refreshed: boolean }
  | { ok: false; blocked_reasons: string[]; safe_error: string; external_api_called: boolean };

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

  if (typeof tokenJson.access_token === "string" && tokenJson.access_token.trim()) {
    return {
      ok: true,
      accessToken: tokenJson.access_token.trim(),
      refreshed: false
    };
  }

  if (typeof tokenJson.refresh_token !== "string" || !tokenJson.refresh_token.trim()) {
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
      refresh_token: tokenJson.refresh_token.trim(),
      grant_type: "refresh_token"
    })
  });
  const payload = await safeJson(response);

  if (!response.ok || typeof payload?.access_token !== "string" || !payload.access_token.trim()) {
    return {
      ok: false,
      blocked_reasons: ["token_refresh_failed"],
      safe_error: typeof payload?.error === "string" ? payload.error : "YouTube token refresh failed.",
      external_api_called: true
    };
  }

  return {
    ok: true,
    accessToken: payload.access_token.trim(),
    refreshed: true
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
