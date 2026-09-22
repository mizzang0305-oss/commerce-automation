import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("simple producer no-upload boundary", () => {
  test("creates only ready jobs and never imports or invokes the YouTube API client", async () => {
    const source = await Promise.all([
      readFile("src/lib/simple-producer/producer.ts", "utf8"),
      readFile("src/lib/simple-producer/runtime.ts", "utf8"),
      readFile("scripts/simple-producer/run-once.ts", "utf8")
    ]).then((files) => files.join("\n"));

    expect(source).not.toMatch(/youtubeApiClient|insertPublicVideo|videos\.insert|googleapis/iu);
    expect(source).toContain("enqueueYouTubePublicUploadJob");
    expect(source).toContain('status: "ready"');
    expect(source).toContain("videosInsertCalls: 0");
  });
});
