import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { DAILY_69_NO_UPLOAD_SETTINGS, QUEUE_SCHEDULER_FLAGS } from "@/lib/queue-scheduler";

describe("Daily69 no-upload architecture", () => {
  test("keeps scheduler, writes, render, and platform upload disabled", () => {
    expect(DAILY_69_NO_UPLOAD_SETTINGS).toMatchObject({ enabled: false, isPaused: true, uploadEnabled: false, maxCategoryRatio: 0.35, maxProductFamilyRatio: 0.1, maxExactAssetReuse: 5, maxProviderCalls: 30, maxRawDiscoveries: 240 });
    expect(QUEUE_SCHEDULER_FLAGS).toMatchObject({ SAFE_TO_UPLOAD: false, SAFE_TO_PUBLIC_UPLOAD: false, GOOGLE_SHEETS_WRITE: 0, DRIVE_WRITE: 0, R2_WRITE: 0, PRODUCTION_DB_WRITE: 0, PLATFORM_UPLOAD: 0, PRODUCTION_DEPLOY: 0 });
  });

  test("nightly scout imports no renderer, Sheets writer, or uploader", () => {
    const source = readFileSync("src/lib/queue-scheduler/nightlyScout.ts", "utf8");
    expect(source).not.toMatch(/renderVideo|google-sheets-command-runner|execute-v\d+|uploadPackage|youtube/u);
  });
});
