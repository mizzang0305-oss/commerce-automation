import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { GET as getYouTubeTokenReadiness } from "../app/api/uploads/youtube/token-readiness/route";
import { buildYouTubeLocalTokenProviderStatus } from "@/lib/uploads/youtube";

const uploadScope = "https://www.googleapis.com/auth/youtube.upload";
const secretNeedles = /refresh-secret-value|access-secret-value|Authorization: Bearer|client-secret/i;

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

function clearYouTubeTokenEnv() {
  vi.stubEnv("YOUTUBE_LOCAL_TOKEN_FILE_PATH", "");
  vi.stubEnv("YOUTUBE_TOKEN_FILE", "");
}

describe("YouTube local token provider readiness", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("blocks readiness when token file path is missing", async () => {
    vi.unstubAllEnvs();
    clearYouTubeTokenEnv();

    const status = buildYouTubeLocalTokenProviderStatus();

    expect(status).toMatchObject({
      configured: false,
      token_file_path_configured: false,
      token_file_inside_repo: false,
      token_file_gitignored_or_outside_repo: true,
      token_file_exists: false,
      token_ready: false,
      scopes_ready: false
    });
    expect(status.blocked_reasons).toEqual(expect.arrayContaining(["token_file_path_missing", "token_not_ready", "scopes_not_ready"]));
  });

  test("blocks token files inside the repository", () => {
    vi.stubEnv("YOUTUBE_LOCAL_TOKEN_FILE_PATH", path.join(process.cwd(), ".local-youtube-token.json"));

    const status = buildYouTubeLocalTokenProviderStatus();

    expect(status.token_file_path_configured).toBe(true);
    expect(status.token_file_inside_repo).toBe(true);
    expect(status.token_file_gitignored_or_outside_repo).toBe(false);
    expect(status.token_ready).toBe(false);
    expect(status.blocked_reasons).toEqual(expect.arrayContaining(["token_file_inside_repo"]));
  });

  test("uses YOUTUBE_TOKEN_FILE fallback when the local token path env is not set", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "commerce-youtube-token-"));
    const tokenPath = path.join(dir, "youtube-token.json");
    writeFileSync(
      tokenPath,
      JSON.stringify({
        refresh_token: "refresh-secret-value",
        access_token: "access-secret-value",
        scope: uploadScope
      }),
      "utf8"
    );
    vi.stubEnv("YOUTUBE_TOKEN_FILE", tokenPath);

    try {
      const status = buildYouTubeLocalTokenProviderStatus();
      expect(status).toMatchObject({
        configured: true,
        token_file_path_configured: true,
        token_file_inside_repo: false,
        token_file_exists: true,
        token_ready: true,
        scopes_ready: true
      });
      expect(JSON.stringify(status)).not.toMatch(secretNeedles);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("prefers YOUTUBE_LOCAL_TOKEN_FILE_PATH over YOUTUBE_TOKEN_FILE", () => {
    const fallbackDir = mkdtempSync(path.join(tmpdir(), "commerce-youtube-token-fallback-"));
    const priorityDir = mkdtempSync(path.join(tmpdir(), "commerce-youtube-token-priority-"));
    const fallbackPath = path.join(fallbackDir, "youtube-token.json");
    const priorityPath = path.join(priorityDir, "youtube-token.json");
    writeFileSync(fallbackPath, JSON.stringify({ refresh_token: "fallback-refresh", scope: uploadScope }), "utf8");
    writeFileSync(priorityPath, JSON.stringify({ refresh_token: "priority-refresh", scope: "https://www.googleapis.com/auth/youtube.readonly" }), "utf8");
    vi.stubEnv("YOUTUBE_TOKEN_FILE", fallbackPath);
    vi.stubEnv("YOUTUBE_LOCAL_TOKEN_FILE_PATH", priorityPath);

    try {
      const status = buildYouTubeLocalTokenProviderStatus();
      expect(status.token_ready).toBe(true);
      expect(status.scopes_ready).toBe(false);
      expect(status.blocked_reasons).toEqual(expect.arrayContaining(["scopes_not_ready"]));
      expect(JSON.stringify(status)).not.toMatch(/fallback-refresh|priority-refresh/);
    } finally {
      rmSync(fallbackDir, { recursive: true, force: true });
      rmSync(priorityDir, { recursive: true, force: true });
    }
  });

  test("allows an outside-repo token file and never returns raw token values", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "commerce-youtube-token-"));
    const tokenPath = path.join(dir, "youtube-token.json");
    writeFileSync(
      tokenPath,
      JSON.stringify({
        refresh_token: "refresh-secret-value",
        access_token: "access-secret-value",
        scope: uploadScope
      }),
      "utf8"
    );
    vi.stubEnv("YOUTUBE_LOCAL_TOKEN_FILE_PATH", tokenPath);

    try {
      const status = buildYouTubeLocalTokenProviderStatus();
      expect(status).toMatchObject({
        configured: true,
        token_file_path_configured: true,
        token_file_inside_repo: false,
        token_file_gitignored_or_outside_repo: true,
        token_file_exists: true,
        token_ready: true,
        scopes_ready: true
      });
      expect(JSON.stringify(status)).not.toMatch(secretNeedles);

      const response = await getYouTubeTokenReadiness();
      const payload = await json(response);
      expect(response.status).toBe(200);
      expect(payload).toMatchObject({
        ok: true,
        token_readiness: {
          token_ready: true,
          scopes_ready: true
        },
        raw_token_exposed: false
      });
      expect(JSON.stringify(payload)).not.toMatch(secretNeedles);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("blocks token files that do not include the YouTube upload scope", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "commerce-youtube-token-"));
    const tokenPath = path.join(dir, "youtube-token.json");
    writeFileSync(
      tokenPath,
      JSON.stringify({
        refresh_token: "refresh-secret-value",
        scope: "https://www.googleapis.com/auth/youtube.readonly"
      }),
      "utf8"
    );
    vi.stubEnv("YOUTUBE_LOCAL_TOKEN_FILE_PATH", tokenPath);

    try {
      const status = buildYouTubeLocalTokenProviderStatus();
      expect(status.token_ready).toBe(true);
      expect(status.scopes_ready).toBe(false);
      expect(status.blocked_reasons).toEqual(expect.arrayContaining(["scopes_not_ready"]));
      expect(JSON.stringify(status)).not.toMatch(secretNeedles);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
