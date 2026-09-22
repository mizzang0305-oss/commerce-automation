import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

const paths = [
  "src/lib/live-product-video/liveCoupangProvider.ts",
  "src/lib/live-product-video/normalizer.ts",
  "src/lib/live-product-video/ranking.ts",
  "src/lib/live-product-video/usageEvidence.ts",
  "src/lib/live-product-video/adapter.ts",
  "src/lib/live-product-video/assetResolver.ts",
  "scripts/live-product-video/run-live-product-video-v1.ts"
];

describe("live product video no-mutation boundary", () => {
  test("does not import database, queue, storage, scheduler, or platform upload executors", async () => {
    const source = (await Promise.all(paths.map((path) => readFile(path, "utf8")))).join("\n");
    for (const forbidden of ["supabaseAutomationRepository", "upsertProductCandidates", "ProductQueue", "StorageClient", "videos.insert", "commentThreads.insert", "YouTubeUpload", "TaskScheduler", "R2Upload"]) {
      expect(source).not.toContain(forbidden);
    }
  });

  test("pins all external mutation safety flags off", async () => {
    const source = await readFile("src/lib/live-product-video/types.ts", "utf8");
    expect(source).toContain("SAFE_TO_UPLOAD: false");
    expect(source).toContain("DB_WRITE: 0");
    expect(source).toContain("QUEUE_WRITE: 0");
    expect(source).toContain("PLATFORM_UPLOAD: 0");
  });
});
