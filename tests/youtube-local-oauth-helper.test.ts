import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  APPROVE_YOUTUBE_LOCAL_OAUTH_TOKEN_GENERATION,
  buildYouTubeLocalOAuthAuthorizationUrl,
  buildYouTubeLocalOAuthExchangeBlockedResult,
  hasYouTubeLocalOAuthApproval,
  validateYouTubeLocalOAuthTokenFilePath,
  validateYouTubeTokenFileMetadataFromJson
} from "@/lib/uploads/youtube/localOAuthTokenHelper";
import { redactYouTubeTokenPayload } from "@/lib/uploads/youtube/redactYoutubeToken";
import { YOUTUBE_UPLOAD_SCOPE } from "@/lib/uploads/youtube/youtubeOAuthScopes";

const secretNeedles = /refresh-secret-value|access-secret-value|client-secret-value|Authorization: Bearer/i;
const helperPath = path.join(process.cwd(), "scripts", "youtube-local-oauth-helper.mjs");
const loopbackReauthApproval = "APPROVE_FIX_YOUTUBE_LOOPBACK_CALLBACK_REAUTH_NO_UPLOAD";

function runLocalOAuthCli(args: string[], env: NodeJS.ProcessEnv = {}) {
  const safeEnv: NodeJS.ProcessEnv = {
    COMSPEC: process.env.COMSPEC,
    PATH: process.env.PATH ?? process.env.Path,
    Path: process.env.Path ?? process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    ...env
  };
  return spawnSync(process.execPath, [helperPath, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: safeEnv,
    windowsHide: true
  });
}

describe("YouTube local OAuth token helper", () => {
  test("builds an offline authorization URL with the YouTube upload scope", () => {
    const url = buildYouTubeLocalOAuthAuthorizationUrl({
      client_id: "local-client-id.apps.googleusercontent.com",
      redirect_uri: "http://localhost:3001/api/uploads/youtube/oauth-callback",
      scope: YOUTUBE_UPLOAD_SCOPE,
      state: "local-state"
    });

    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(parsed.searchParams.get("scope")).toBe(YOUTUBE_UPLOAD_SCOPE);
    expect(parsed.searchParams.get("access_type")).toBe("offline");
    expect(parsed.searchParams.get("prompt")).toBe("consent");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("client_secret")).toBeNull();
  });

  test("blocks token exchange without exact local OAuth approval", () => {
    const result = buildYouTubeLocalOAuthExchangeBlockedResult();

    expect(result).toMatchObject({
      ok: false,
      error_code: "YOUTUBE_LOCAL_OAUTH_APPROVAL_REQUIRED",
      token_exchange_executed: false,
      raw_token_printed: false,
      required_confirmation: APPROVE_YOUTUBE_LOCAL_OAUTH_TOKEN_GENERATION
    });
    expect(JSON.stringify(result)).not.toMatch(secretNeedles);
  });

  test("lists the loopback reauth command without printing secret material", () => {
    const result = runLocalOAuthCli(["--help"], {
      YOUTUBE_CLIENT_SECRET: "client-secret-value"
    });

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.commands).toContain("reauth-local");
    expect(result.stdout + result.stderr).not.toMatch(secretNeedles);
  });

  test("blocks loopback reauth without the exact repair approval before reading OAuth config", () => {
    const result = runLocalOAuthCli(["reauth-local"], {
      YOUTUBE_CLIENT_SECRET: "client-secret-value",
      YOUTUBE_TOKEN_FILE: path.join(process.cwd(), "blocked-youtube-token.json")
    });

    expect(result.status).toBe(1);
    const payload = JSON.parse(result.stdout);
    expect(payload).toMatchObject({
      ok: false,
      error_code: "YOUTUBE_LOOPBACK_REAUTH_APPROVAL_REQUIRED",
      listener_started: false,
      token_exchange_executed: false,
      token_file_written: false,
      raw_url_printed: false,
      auth_code_printed: false,
      raw_token_printed: false
    });
    expect(result.stdout + result.stderr).not.toMatch(secretNeedles);
    expect(result.stdout + result.stderr).not.toMatch(/accounts\.google\.com|oauth2\/v2\/auth/i);
  });

  test("blocks approved loopback reauth when the token file is inside the repository", () => {
    const result = runLocalOAuthCli(["reauth-local", "--confirm", loopbackReauthApproval], {
      YOUTUBE_CLIENT_SECRET: "client-secret-value",
      YOUTUBE_TOKEN_FILE: path.join(process.cwd(), "blocked-youtube-token.json")
    });

    expect(result.status).toBe(1);
    const payload = JSON.parse(result.stdout);
    expect(payload).toMatchObject({
      ok: false,
      error_code: "YOUTUBE_TOKEN_FILE_PATH_BLOCKED",
      listener_started: false,
      token_exchange_executed: false,
      token_file_written: false,
      raw_url_printed: false,
      auth_code_printed: false,
      raw_token_printed: false
    });
    expect(JSON.stringify(payload)).not.toContain(path.join(process.cwd(), "blocked-youtube-token.json"));
    expect(result.stdout + result.stderr).not.toMatch(secretNeedles);
  });

  test("does not treat boolean-like approval as exact local OAuth approval", () => {
    expect(hasYouTubeLocalOAuthApproval("true")).toBe(false);
    expect(hasYouTubeLocalOAuthApproval(APPROVE_YOUTUBE_LOCAL_OAUTH_TOKEN_GENERATION)).toBe(true);
  });

  test("rejects token files inside the repository", () => {
    const tokenPath = path.join(process.cwd(), ".local-youtube-token.json");

    const result = validateYouTubeLocalOAuthTokenFilePath(tokenPath, process.cwd());

    expect(result).toMatchObject({
      safe: false,
      token_file_inside_repo: true,
      blocked_reason: "token_file_inside_repo"
    });
    expect(JSON.stringify(result)).not.toContain(tokenPath);
  });

  test("allows token files outside the repository without returning the path", () => {
    const tokenPath = path.join(process.cwd(), "..", "..", ".commerce-automation", "youtube-token.json");

    const result = validateYouTubeLocalOAuthTokenFilePath(tokenPath, process.cwd());

    expect(result).toMatchObject({
      safe: true,
      token_file_inside_repo: false
    });
    expect(JSON.stringify(result)).not.toContain(path.resolve(tokenPath));
  });

  test("redacts token payloads recursively", () => {
    const redacted = redactYouTubeTokenPayload({
      access_token: "access-secret-value",
      refresh_token: "refresh-secret-value",
      client_secret: "client-secret-value",
      nested: {
        authorization: "Authorization: Bearer abc"
      },
      scope: YOUTUBE_UPLOAD_SCOPE
    });

    expect(JSON.stringify(redacted)).not.toMatch(secretNeedles);
    expect(redacted).toMatchObject({
      access_token: "[REDACTED]",
      refresh_token: "[REDACTED]",
      client_secret: "[REDACTED]",
      nested: {
        authorization: "[REDACTED]"
      },
      scope: YOUTUBE_UPLOAD_SCOPE
    });
  });

  test("validates token metadata without returning raw token values", () => {
    const result = validateYouTubeTokenFileMetadataFromJson(
      JSON.stringify({
        access_token: "access-secret-value",
        refresh_token: "refresh-secret-value",
        scope: YOUTUBE_UPLOAD_SCOPE
      })
    );

    expect(result).toMatchObject({
      token_ready: true,
      scopes_ready: true,
      raw_token_returned: false
    });
    expect(JSON.stringify(result)).not.toMatch(secretNeedles);
  });
});
