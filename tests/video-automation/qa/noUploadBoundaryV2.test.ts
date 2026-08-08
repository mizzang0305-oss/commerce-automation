import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("autonomous review v2 static boundary", () => {
  it("contains no upload, database, scheduler, or production adapter import", () => {
    const paths = [
      "scripts/video-automation/run-autonomous-video-review-v2.ts",
      "scripts/video-automation/finalize-autonomous-video-review-v2.ts",
      "tools/video-automation/visual_qa.py"
    ];
    const source = paths.map((path) => readFileSync(resolve(path), "utf8")).join("\n");
    expect(source).not.toMatch(/from ["'][^"']*(youtube|supabase|r2|scheduler|uploadPackage|productQueue)/iu);
    expect(source).not.toMatch(/videos\.insert|commentThreads\.insert|privacyStatus|fetch\(/u);
    expect(source).toContain("SAFE_TO_UPLOAD: false");
  });
});
