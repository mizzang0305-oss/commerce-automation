import { describe, expect, test } from "vitest";
import { createYouTubePublicPublisherClient } from "@/lib/youtube-public-publisher/youtubeApiClient";

describe("YouTube public publisher API client", () => {
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
