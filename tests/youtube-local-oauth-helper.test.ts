import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  APPROVE_YOUTUBE_LOCAL_OAUTH_TOKEN_GENERATION,
  buildYouTubeLocalOAuthAuthorizationUrl,
  buildYouTubeLocalOAuthExchangeBlockedResult,
  validateYouTubeLocalOAuthTokenFilePath,
  validateYouTubeTokenFileMetadataFromJson
} from "@/lib/uploads/youtube/localOAuthTokenHelper";
import { redactYouTubeTokenPayload } from "@/lib/uploads/youtube/redactYoutubeToken";
import { YOUTUBE_UPLOAD_SCOPE } from "@/lib/uploads/youtube/youtubeOAuthScopes";

const secretNeedles = /refresh-secret-value|access-secret-value|client-secret-value|Authorization: Bearer/i;

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
