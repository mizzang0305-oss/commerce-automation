import { describe, expect, test } from "vitest";
import { createYouTubePublicPublisherClient } from "@/lib/youtube-public-publisher/youtubeApiClient";
import { createHash } from "node:crypto";

describe("YouTube public publisher API client", () => {
  test("opens an unlisted resumable session for the first Fast Mode smoke", async () => {
    const video = Buffer.from("test-video-bytes");
    let sessionVisibility = "";
    const client = createYouTubePublicPublisherClient({
      readVideoFile: async () => video,
      fetchImpl: async (input, init) => {
        if (String(input).includes("uploadType=resumable")) {
          sessionVisibility = (JSON.parse(String(init?.body)) as { status: { privacyStatus: string } }).status.privacyStatus;
          return new Response(null, { status: 200, headers: { Location: "https://upload.example/session" } });
        }
        return Response.json({ id: "test-video-id" });
      }
    });
    const result = await client.insertPublicVideo({ accessToken: "test-access-token", videoPath: "D:\\render\\product.mp4",
      videoSha256: createHash("sha256").update(video).digest("hex"), title: "title", description: "description", visibility: "unlisted" });
    expect(result).toEqual({ ok: true, youtubeVideoId: "test-video-id" });
    expect(sessionVisibility).toBe("unlisted");
  });
  test("never automatically retries an ambiguous videos.insert session network result", async () => {
    const video = Buffer.from("test-video-bytes");
    const client = createYouTubePublicPublisherClient({
      readVideoFile: async () => video,
      fetchImpl: async () => { throw new Error("network lost after request"); }
    });
    await expect(client.insertPublicVideo({ accessToken: "test-access-token", videoPath: "D:\\render\\product.mp4",
      videoSha256: createHash("sha256").update(video).digest("hex"), title: "title", description: "description",
      visibility: "unlisted" })).resolves.toEqual({ ok: false, safeError: "YOUTUBE_UPLOAD_SESSION_NETWORK_FAILURE", retryable: false });
  });
  test("refreshes from only the explicitly routed channel token file", async () => {
    const tokenPaths: string[] = [];
    const client = createYouTubePublicPublisherClient({
      env: {
        YOUTUBE_CLIENT_ID: "test-client-id",
        YOUTUBE_CLIENT_SECRET: "test-client-secret",
        YOUTUBE_LOCAL_TOKEN_FILE_PATH: "D:\\secure\\default-token-must-not-be-used.json"
      },
      readTokenFile: async (path) => {
        tokenPaths.push(path);
        return JSON.stringify({ refresh_token: "test-refresh-token" });
      },
      fetchImpl: async (input) => {
        expect(String(input)).toBe("https://oauth2.googleapis.com/token");
        return Response.json({ access_token: "test-access-token", expires_in: 3600 });
      }
    });

    await expect(client.getAccessToken({
      channelKey: "neoman_moleulgeol",
      tokenFilePath: "D:\\secure\\youtube-neoman.json"
    })).resolves.toEqual({ ok: true, accessToken: "test-access-token" });

    expect(tokenPaths).toEqual(["D:\\secure\\youtube-neoman.json"]);
  });

  test("refuses bytes whose hash changed after the publisher validation", async () => {
    let fetchCalls = 0;
    const client = createYouTubePublicPublisherClient({
      readVideoFile: async () => Buffer.from("changed-after-validation"),
      fetchImpl: async () => {
        fetchCalls += 1;
        return Response.json({});
      }
    });

    await expect(client.insertPublicVideo({
      accessToken: "test-access-token",
      videoPath: "D:\\render\\product.mp4",
      videoSha256: "a".repeat(64),
      title: "title",
      description: "description"
    })).resolves.toEqual({ ok: false, safeError: "YOUTUBE_VIDEO_HASH_MISMATCH", retryable: false });

    expect(fetchCalls).toBe(0);
  });

  test("refuses a channel token path inside the repository before reading it", async () => {
    let tokenReads = 0;
    const client = createYouTubePublicPublisherClient({
      repositoryRoot: "D:\\repo\\commerce-automation",
      env: {
        YOUTUBE_CLIENT_ID: "test-client-id",
        YOUTUBE_CLIENT_SECRET: "test-client-secret"
      },
      readTokenFile: async () => {
        tokenReads += 1;
        return JSON.stringify({ refresh_token: "must-not-be-read" });
      }
    });

    await expect(client.getAccessToken({
      channelKey: "father_jobs",
      tokenFilePath: "D:\\repo\\commerce-automation\\.tokens\\father.json"
    })).resolves.toEqual({ ok: false, safeError: "YOUTUBE_CHANNEL_TOKEN_PATH_INVALID" });

    expect(tokenReads).toBe(0);
  });
});
