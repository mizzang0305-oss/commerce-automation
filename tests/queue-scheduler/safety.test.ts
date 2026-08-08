import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const schedulerFiles = [
  "src/lib/queue-scheduler/nightlyScout.ts", "src/lib/queue-scheduler/batchRunner.ts", "src/lib/queue-scheduler/videoExecutor.ts",
  "scripts/queue-scheduler/run-nightly-scout.ts", "scripts/queue-scheduler/run-next-batch.ts"
];

describe("no-upload static boundary", () => {
  it("does not import upload, Supabase, Sheets, Drive, or R2 adapters", async () => { const source = (await Promise.all(schedulerFiles.map((path) => readFile(path, "utf8")))).join("\n"); expect(source).not.toMatch(/youtube|videos\.insert|tiktok.*publish|threads.*publish|commentThreads|supabase|google.*sheets|drive.*upload|r2.*put/iu); });
  it("keeps immutable safety flags", async () => { const source = await readFile("src/lib/queue-scheduler/types.ts", "utf8"); expect(source).toContain("SAFE_TO_UPLOAD: false"); expect(source).toContain("SAFE_TO_PUBLIC_UPLOAD: false"); expect(source).toContain("PLATFORM_UPLOAD: 0"); });
  it("uses exact task names and safe scheduler settings", async () => { const source = await readFile("scripts/queue-scheduler/install-no-upload-pilot.ps1", "utf8"); expect(source).toContain("Minz-Commerce-Scout-NoUpload-V1"); expect(source).toContain("Minz-Commerce-VideoBatch-NoUpload-V1"); expect(source).toContain("-MultipleInstances IgnoreNew"); expect(source).toContain("-StartWhenAvailable"); expect(source).not.toContain("-Force"); });
});
