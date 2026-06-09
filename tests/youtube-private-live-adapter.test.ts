import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  ServerYouTubeUploadAdapter,
  buildYouTubeUploadRequest,
  youtubeUploadSafeSideEffects
} from "@/lib/uploads/youtube";

const secretNeedles = /refresh-secret-value|access-secret-value|expired-access-secret-value|fresh-access-secret-value|Authorization: Bearer|client-secret/i;

function makeValidUploadRequest(videoPath: string) {
  const result = buildYouTubeUploadRequest({
    candidate_id: "candidate-youtube-private-live-001",
    video_path_or_url: videoPath,
    title: "Private upload smoke",
    description: "Private smoke test.",
    disclosure_text: "This content contains affiliate links.",
    selected_affiliate_url: "https://link.coupang.com/a/private-live-smoke",
    visibility: "private",
    tags: ["commerce", "private smoke"]
  });
  if (!result.ok) {
    throw new Error("expected valid upload request");
  }
  return result.request;
}

function makeTempVideoFile() {
  const dir = mkdtempSync(path.join(tmpdir(), "commerce-youtube-video-"));
  const videoPath = path.join(dir, "smoke.mp4");
  writeFileSync(videoPath, Buffer.from("tiny-mp4-placeholder"));
  return { dir, videoPath };
}

describe("private YouTube live adapter readiness", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  test("blocks execute when the local video file is missing", async () => {
    vi.stubEnv("RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE", "RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE");
    const request = makeValidUploadRequest(path.join(tmpdir(), "missing-youtube-smoke.mp4"));

    const result = await new ServerYouTubeUploadAdapter().upload(request);

    expect(result).toMatchObject({
      attempted: false,
      succeeded: false,
      side_effects: youtubeUploadSafeSideEffects,
      blocked_reasons: expect.arrayContaining(["video_file_missing"])
    });
    expect(result.youtube_video_id).toBeUndefined();
  });

  test("performs mocked resumable upload and requires a returned YouTube video id", async () => {
    vi.stubEnv("RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE", "RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE");
    const { dir, videoPath } = makeTempVideoFile();
    const request = makeValidUploadRequest(videoPath);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 200,
        headers: {
          Location: "https://upload.youtube.test/resumable-session"
        }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "youtube-video-123",
        status: { privacyStatus: "private" }
      }), { status: 200, headers: { "Content-Type": "application/json" } }));

    try {
      const result = await new ServerYouTubeUploadAdapter({
        accessToken: "access-secret-value",
        fetchImpl: fetchMock
      }).upload(request);

      expect(result).toMatchObject({
        provider: "youtube",
        attempted: true,
        succeeded: true,
        youtube_video_id: "youtube-video-123",
        youtube_url: "https://www.youtube.com/watch?v=youtube-video-123",
        visibility: "private",
        blocked_reasons: [],
        side_effects: {
          external_api_called: true,
          youtube_upload_executed: true,
          uploaded: true,
          db_written: false,
          r2_uploaded: false,
          queue_created: false,
          worker_job_created: false,
          platform_upload_triggered: true,
          public_upload_enabled: false
        }
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(result)).not.toMatch(secretNeedles);
      expect(JSON.stringify(fetchMock.mock.calls)).not.toMatch(secretNeedles);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("refreshes a local token before creating the resumable upload session when a refresh token exists", async () => {
    vi.stubEnv("RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE", "RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE");
    vi.stubEnv("YOUTUBE_CLIENT_ID", "client-id-value");
    vi.stubEnv("YOUTUBE_CLIENT_SECRET", "client-secret-value");
    const tokenDir = mkdtempSync(path.join(tmpdir(), "commerce-youtube-token-refresh-"));
    const tokenPath = path.join(tokenDir, "youtube-token.json");
    writeFileSync(
      tokenPath,
      JSON.stringify({
        access_token: "expired-access-secret-value",
        refresh_token: "refresh-secret-value",
        scope: "https://www.googleapis.com/auth/youtube.upload"
      }),
      "utf8"
    );
    vi.stubEnv("YOUTUBE_LOCAL_TOKEN_FILE_PATH", tokenPath);
    const { dir, videoPath } = makeTempVideoFile();
    const request = makeValidUploadRequest(videoPath);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "fresh-access-secret-value",
        scope: "https://www.googleapis.com/auth/youtube.upload"
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(null, {
        status: 200,
        headers: {
          Location: "https://upload.youtube.test/resumable-session"
        }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "youtube-video-456"
      }), { status: 200, headers: { "Content-Type": "application/json" } }));

    try {
      const result = await new ServerYouTubeUploadAdapter({ fetchImpl: fetchMock }).upload(request);

      expect(result).toMatchObject({
        attempted: true,
        succeeded: true,
        youtube_video_id: "youtube-video-456",
        token_refresh_attempted: true,
        token_refresh_succeeded: true,
        token_file_updated: true,
        resumable_session_attempted: true
      });
      expect(fetchMock).toHaveBeenCalledTimes(3);
      const sessionHeaders = fetchMock.mock.calls[1]?.[1]?.headers as Headers;
      expect(sessionHeaders.get("Authorization")).toBe("Bearer fresh-access-secret-value");
      const updatedToken = JSON.parse(readFileSync(tokenPath, "utf8")) as Record<string, unknown>;
      expect(updatedToken.access_token).toBe("fresh-access-secret-value");
      expect(updatedToken.refresh_token).toBe("refresh-secret-value");
      expect(JSON.stringify(result)).not.toMatch(secretNeedles);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(tokenDir, { recursive: true, force: true });
    }
  });

  test("blocks upload with reauth_required when token refresh fails", async () => {
    vi.stubEnv("RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE", "RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE");
    vi.stubEnv("YOUTUBE_CLIENT_ID", "client-id-value");
    vi.stubEnv("YOUTUBE_CLIENT_SECRET", "client-secret-value");
    const tokenDir = mkdtempSync(path.join(tmpdir(), "commerce-youtube-token-refresh-fail-"));
    const tokenPath = path.join(tokenDir, "youtube-token.json");
    writeFileSync(
      tokenPath,
      JSON.stringify({
        access_token: "expired-access-secret-value",
        refresh_token: "refresh-secret-value",
        scope: "https://www.googleapis.com/auth/youtube.upload"
      }),
      "utf8"
    );
    vi.stubEnv("YOUTUBE_LOCAL_TOKEN_FILE_PATH", tokenPath);
    const { dir, videoPath } = makeTempVideoFile();
    const request = makeValidUploadRequest(videoPath);
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      error: "invalid_grant"
    }), { status: 400, headers: { "Content-Type": "application/json" } }));

    try {
      const result = await new ServerYouTubeUploadAdapter({ fetchImpl: fetchMock }).upload(request);

      expect(result).toMatchObject({
        attempted: false,
        succeeded: false,
        blocked_reasons: expect.arrayContaining(["youtube_token_refresh_failed"]),
        token_refresh_attempted: true,
        token_refresh_succeeded: false,
        resumable_session_attempted: false,
        reauth_required: true,
        side_effects: youtubeUploadSafeSideEffects
      });
      expect(result.youtube_video_id).toBeUndefined();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(result)).not.toMatch(secretNeedles);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(tokenDir, { recursive: true, force: true });
    }
  });

  test("blocks refresh and upload when token file path is inside the repository", async () => {
    vi.stubEnv("RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE", "RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE");
    vi.stubEnv("YOUTUBE_CLIENT_ID", "client-id-value");
    vi.stubEnv("YOUTUBE_CLIENT_SECRET", "client-secret-value");
    const tokenPath = path.join(process.cwd(), ".youtube-token-blocked-test.json");
    writeFileSync(
      tokenPath,
      JSON.stringify({
        access_token: "expired-access-secret-value",
        refresh_token: "refresh-secret-value",
        scope: "https://www.googleapis.com/auth/youtube.upload"
      }),
      "utf8"
    );
    vi.stubEnv("YOUTUBE_LOCAL_TOKEN_FILE_PATH", tokenPath);
    const { dir, videoPath } = makeTempVideoFile();
    const request = makeValidUploadRequest(videoPath);
    const fetchMock = vi.fn();

    try {
      const result = await new ServerYouTubeUploadAdapter({ fetchImpl: fetchMock }).upload(request);

      expect(result).toMatchObject({
        attempted: false,
        succeeded: false,
        blocked_reasons: expect.arrayContaining(["token_file_inside_repo"]),
        resumable_session_attempted: false,
        side_effects: youtubeUploadSafeSideEffects
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.youtube_video_id).toBeUndefined();
      expect(JSON.stringify(result)).not.toMatch(secretNeedles);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      if (existsSync(tokenPath)) {
        unlinkSync(tokenPath);
      }
    }
  });

  test("does not report success when YouTube returns no video id", async () => {
    vi.stubEnv("RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE", "RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE");
    const { dir, videoPath } = makeTempVideoFile();
    const request = makeValidUploadRequest(videoPath);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 200,
        headers: {
          Location: "https://upload.youtube.test/resumable-session"
        }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ kind: "youtube#video" }), { status: 200 }));

    try {
      const result = await new ServerYouTubeUploadAdapter({
        accessToken: "access-secret-value",
        fetchImpl: fetchMock
      }).upload(request);

      expect(result).toMatchObject({
        attempted: true,
        succeeded: false,
        side_effects: youtubeUploadSafeSideEffects,
        blocked_reasons: expect.arrayContaining(["youtube_video_id_missing"])
      });
      expect(result.youtube_video_id).toBeUndefined();
      expect(JSON.stringify(result)).not.toMatch(secretNeedles);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
