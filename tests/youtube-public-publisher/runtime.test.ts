import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { runConfiguredYouTubePublicPublisherOnce } from "@/lib/youtube-public-publisher/runtime";

describe("configured run-once publisher", () => {
  test("refuses a state ledger path inside the repository", async () => {
    const result = await runConfiguredYouTubePublicPublisherOnce({
      cwd: "D:\\repo\\commerce-automation",
      env: {
        YOUTUBE_PUBLIC_PUBLISHER_ENABLED: "true",
        YOUTUBE_PUBLIC_PUBLISHER_STATE_PATH: "D:\\repo\\commerce-automation\\data\\youtube-public-publisher.json"
      }
    });

    expect(result).toMatchObject({
      status: "configuration_error",
      safeError: "YOUTUBE_PUBLIC_PUBLISHER_STATE_PATH_INSIDE_REPOSITORY",
      videosInsertCalls: 0
    });
  });

  test("activates with no ready jobs without contacting YouTube", async () => {
    const directory = await mkdtemp(join(tmpdir(), "youtube-public-runtime-"));
    try {
      const result = await runConfiguredYouTubePublicPublisherOnce({
        cwd: "D:\\repo\\commerce-automation",
        env: {
          YOUTUBE_PUBLIC_PUBLISHER_ENABLED: "true",
          YOUTUBE_PUBLIC_PUBLISHER_STATE_PATH: join(directory, "publisher-state.json"),
          YOUTUBE_PUBLIC_PUBLISHER_NEOMAN_TOKEN_FILE: "D:\\secure\\youtube-neoman.json",
          YOUTUBE_PUBLIC_PUBLISHER_FATHER_TOKEN_FILE: "D:\\secure\\youtube-father.json"
        },
        client: {
          getAccessToken: async () => {
            throw new Error("must not reach token provider");
          },
          probeMineChannel: async () => {
            throw new Error("must not probe YouTube");
          },
          insertPublicVideo: async () => {
            throw new Error("must not upload");
          },
          readbackVideo: async () => {
            throw new Error("must not read back");
          }
        }
      });

      expect(result).toMatchObject({ status: "no_ready_job", videosInsertCalls: 0, canariesImported: 2 });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
