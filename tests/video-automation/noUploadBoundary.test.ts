import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { PRODUCT_VIDEO_AUTOMATION_FLAGS } from "@/lib/video-automation/types";

describe("no-upload boundary", () => {
  test("keeps every mutation flag disabled", () => expect(PRODUCT_VIDEO_AUTOMATION_FLAGS).toMatchObject({ SAFE_TO_UPLOAD: false, SAFE_TO_PUBLIC_UPLOAD: false, YOUTUBE_AUTO_UPLOAD: false, PUBLIC_UPLOAD: false, UNLISTED_UPLOAD: false, TIKTOK_AUTO_UPLOAD: false, THREADS_AUTO_POST: false, COMMENT_AUTOMATION: false, DB_WRITE: 0, PRODUCTION_DEPLOY: 0, SCHEDULER_CHANGE: 0, LIVE_PLATFORM_UPLOAD: 0 }));
  test("does not import platform, database, sheets, or upload adapters", async () => {
    const files = ["src/lib/video-automation/index.ts", "src/lib/video-automation/pipeline.ts", "scripts/video-automation/run-product-to-video-v1.ts"];
    const content = (await Promise.all(files.map((file) => readFile(resolve(file), "utf8")))).join("\n");
    for (const blocked of ["videos.insert", "uploads/youtube", "tiktokadapter", "threadspublisher", "commentthreads.insert", "@supabase", "lib/google-sheets", "r2client", "productqueuerepository"]) expect(content.toLowerCase()).not.toContain(blocked.toLowerCase());
  });
});
