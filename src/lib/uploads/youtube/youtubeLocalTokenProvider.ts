import "server-only";

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { YouTubeLocalTokenProviderStatus } from "@/lib/uploads/youtube/types";
import { YOUTUBE_UPLOAD_SCOPE } from "@/lib/uploads/youtube/youtubeOAuthScopes";

const TOKEN_FILE_ENV = "YOUTUBE_LOCAL_TOKEN_FILE_PATH";

type TokenFileJson = {
  access_token?: unknown;
  refresh_token?: unknown;
  scope?: unknown;
  scopes?: unknown;
  granted_scopes?: unknown;
};

export function buildYouTubeLocalTokenProviderStatus(env: NodeJS.ProcessEnv = process.env): YouTubeLocalTokenProviderStatus {
  const configuredPath = env[TOKEN_FILE_ENV]?.trim() ?? "";
  const token_file_path_configured = configuredPath.length > 0;
  const resolvedPath = token_file_path_configured ? path.resolve(/*turbopackIgnore: true*/ configuredPath) : "";
  const repoRoot = path.resolve(/*turbopackIgnore: true*/ process.cwd());
  const token_file_inside_repo = Boolean(resolvedPath) && isPathInside(resolvedPath, repoRoot);
  const token_file_gitignored_or_outside_repo = !token_file_inside_repo;
  const blocked_reasons: string[] = [];

  if (!token_file_path_configured) {
    blocked_reasons.push("token_file_path_missing");
  }
  if (token_file_inside_repo) {
    blocked_reasons.push("token_file_inside_repo");
  }

  const token_file_exists = token_file_path_configured && !token_file_inside_repo && existsSync(resolvedPath);
  if (token_file_path_configured && !token_file_inside_repo && !token_file_exists) {
    blocked_reasons.push("token_file_missing");
  }

  let token_ready = false;
  let scopes_ready = false;

  if (token_file_exists) {
    try {
      const tokenJson = JSON.parse(readFileSync(/*turbopackIgnore: true*/ resolvedPath, "utf8")) as TokenFileJson;
      token_ready = hasTokenCredential(tokenJson);
      scopes_ready = getScopes(tokenJson).includes(YOUTUBE_UPLOAD_SCOPE);
    } catch {
      blocked_reasons.push("token_file_unreadable");
    }
  }

  if (!token_ready) {
    blocked_reasons.push("token_not_ready");
  }
  if (!scopes_ready) {
    blocked_reasons.push("scopes_not_ready");
  }

  const configured = token_file_path_configured && token_file_gitignored_or_outside_repo;
  const safe_summary = buildSafeSummary({
    configured,
    token_file_path_configured,
    token_file_inside_repo,
    token_file_exists,
    token_ready,
    scopes_ready
  });

  return {
    configured,
    token_file_path_configured,
    token_file_inside_repo,
    token_file_gitignored_or_outside_repo,
    token_file_exists,
    token_ready,
    scopes_ready,
    safe_summary,
    blocked_reasons: Array.from(new Set(blocked_reasons))
  };
}

function isPathInside(filePath: string, rootPath: string) {
  const relative = path.relative(rootPath, filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function hasTokenCredential(tokenJson: TokenFileJson) {
  return typeof tokenJson.refresh_token === "string" || typeof tokenJson.access_token === "string";
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

function buildSafeSummary(status: Pick<YouTubeLocalTokenProviderStatus, "configured" | "token_file_path_configured" | "token_file_inside_repo" | "token_file_exists" | "token_ready" | "scopes_ready">) {
  if (!status.token_file_path_configured) {
    return `${TOKEN_FILE_ENV} is not configured.`;
  }
  if (status.token_file_inside_repo) {
    return "Token file path is inside the repository and is blocked.";
  }
  if (!status.token_file_exists) {
    return "Token file path is configured outside the repository, but the file does not exist.";
  }
  if (!status.token_ready || !status.scopes_ready) {
    return "Token file metadata was found, but upload token readiness is incomplete.";
  }
  return "Local YouTube token metadata is ready for separately approved private upload smoke.";
}
