import { describe, expect, test } from "vitest";
import { resolvePublisherChannel } from "@/lib/youtube-public-publisher/channelConfig";

describe("guarded public publisher channel configuration", () => {
  test("routes neoman only to its dedicated token path", () => {
    const env = {
      YOUTUBE_PUBLIC_PUBLISHER_NEOMAN_TOKEN_FILE: "D:\\secure\\youtube-neoman.json",
      YOUTUBE_PUBLIC_PUBLISHER_FATHER_TOKEN_FILE: "D:\\secure\\youtube-father.json",
      YOUTUBE_LOCAL_TOKEN_FILE_PATH: "D:\\secure\\default-token-must-not-be-used.json"
    };

    expect(resolvePublisherChannel("neoman_moleulgeol", env)).toEqual({
      channelKey: "neoman_moleulgeol",
      expectedChannelId: "UCOdvPLaFnvzAI-_VyIXTdOw",
      expectedChannelTitle: "너만모를껄?",
      tokenFilePath: "D:\\secure\\youtube-neoman.json"
    });
  });

  test("routes father jobs only to its dedicated token path", () => {
    const env = {
      YOUTUBE_PUBLIC_PUBLISHER_NEOMAN_TOKEN_FILE: "D:\\secure\\youtube-neoman.json",
      YOUTUBE_PUBLIC_PUBLISHER_FATHER_TOKEN_FILE: "D:\\secure\\youtube-father.json"
    };

    expect(resolvePublisherChannel("father_jobs", env)).toEqual({
      channelKey: "father_jobs",
      expectedChannelId: "UC38rroV6ZRTIzqKgWr5vWrw",
      expectedChannelTitle: "father jobs",
      tokenFilePath: "D:\\secure\\youtube-father.json"
    });
  });

  test("rejects unsupported channels and never uses a default token path", () => {
    expect(resolvePublisherChannel("father_jobs", {
      YOUTUBE_LOCAL_TOKEN_FILE_PATH: "D:\\secure\\default-token-must-not-be-used.json"
    })).toMatchObject({ tokenFilePath: "" });

    expect(() => resolvePublisherChannel("lets_buy" as "neoman_moleulgeol")).toThrow("UNSUPPORTED_YOUTUBE_PUBLIC_PUBLISHER_CHANNEL");
  });
});
