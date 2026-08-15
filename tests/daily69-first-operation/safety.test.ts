import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("first operation task safety", () => {
  it("uses exact task names, 20 bounded triggers, expected-head guard, and no-upload wrappers", async () => {
    const install = await readFile("scripts/daily69-first-operation/install-tasks.ps1", "utf8");
    const common = await readFile("scripts/daily69-first-operation/common-first-operation-no-upload.ps1", "utf8");
    expect(install).toContain("Minz-Commerce-Scout-NoUpload-V1");
    expect(install).toContain("Minz-Commerce-VideoBatch-NoUpload-V1");
    expect(install).toContain("Minz-Commerce-ControlRunner-NoUpload-V1");
    expect(install).toContain("Minz-Commerce-Daily69-Closeout-NoUpload-V1");
    expect(install).toContain("4..23");
    expect(install).toContain("-MultipleInstances IgnoreNew");
    expect(install).toContain("-StartWhenAvailable");
    expect(common).toContain("RUNTIME_GIT_HEAD_MISMATCH");
    expect(common).toContain('$env:SAFE_TO_UPLOAD = "false"');
    expect(common).not.toMatch(/(?:YOUTUBE_AUTO_UPLOAD|TIKTOK_AUTO_POST|THREADS_AUTO_POST)\s*=\s*["']true["']/iu);
  });

  it("keeps day-two execution out of the closeout wrapper", async () => {
    const closeout = await readFile("scripts/daily69-first-operation/run-closeout-no-upload.ps1", "utf8");
    expect(closeout).toContain("Disable-ScheduledTask");
    expect(closeout).not.toContain("Enable-ScheduledTask");
    expect(closeout).not.toContain("run-nightly-scout");
  });

  it("keeps readiness preparation and arm gates outside external mutation paths", async () => {
    const readiness = await readFile("src/lib/affiliate-readiness/index.ts", "utf8");
    const firstOperation = await readFile("src/lib/daily69-first-operation/index.ts", "utf8");
    const videoExecutor = await readFile("src/lib/queue-scheduler/videoExecutor.ts", "utf8");
    expect(readiness).not.toMatch(/\b(?:fetch|spawn|execFile|Register-ScheduledTask|Enable-ScheduledTask|videos\.insert)\b/u);
    expect(firstOperation.indexOf("const affiliateReadiness = assertSource(source)")).toBeLessThan(firstOperation.indexOf("await mkdir(resolve(input.operationBase)"));
    expect(videoExecutor).not.toMatch(/youtubeUploadAdapter|TikTok|Threads|videos\.insert/u);
    expect([readiness, firstOperation, videoExecutor].join("\n")).not.toContain("operation-2026-08-11");
  });
});
