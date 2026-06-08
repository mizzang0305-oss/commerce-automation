import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  ServerYouTubeUploadAdapter,
  buildYouTubeUploadRequest,
  youtubeUploadSafeSideEffects
} from "@/lib/uploads/youtube";

const secretNeedles = /refresh-secret-value|access-secret-value|Authorization: Bearer|client-secret/i;

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
