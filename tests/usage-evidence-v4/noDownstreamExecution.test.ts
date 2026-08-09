import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { V4_NO_DOWNSTREAM_EXECUTION } from "@/lib/usage-evidence";

describe("V4 no-downstream boundary", () => {
  test("keeps every writer, render, scheduler, and upload path disabled", () => {
    expect(V4_NO_DOWNSTREAM_EXECUTION).toMatchObject({
      SAFE_TO_UPLOAD: false,
      SAFE_TO_PUBLIC_UPLOAD: false,
      QUEUE_SCHEDULER_ENABLED: false,
      isPaused: true,
      GOOGLE_SHEETS_WRITE: 0,
      FINAL_VIDEO_RENDER_COUNT: 0,
      TTS_EXECUTION_COUNT: 0,
      ASR_EXECUTION_COUNT: 0,
      WHISPERX_EXECUTION_COUNT: 0,
      PLATFORM_UPLOAD: 0,
      PRODUCTION_DEPLOY: 0,
      CONTROL_RUNNER_CREATED: 0,
      EXISTING_WORKER_CHANGED: 0
    });
  });

  test("V4 domain code imports no external writer or video execution module", () => {
    const source = readFileSync(resolve("src/lib/usage-evidence/categoryDiverseV4.ts"), "utf8");
    const imports = source.split(/\r?\n/u).filter((line) => /^import /u.test(line)).join("\n");
    expect(imports).not.toMatch(/google|sheets|drive|supabase|r2|upload|render|tts|asr|whisperx/iu);
  });

  test("PowerShell wrapper has mandatory runtime paths and no absolute default", () => {
    const source = readFileSync(resolve("scripts/usage-evidence/run-v4-category-opportunity-no-upload.ps1"), "utf8");
    expect(source.match(/\[Parameter\(Mandatory = \$true\)\]/gu)).toHaveLength(7);
    expect(source).not.toMatch(/[A-Z]:\\Users\\/iu);
    expect(source).toContain('QUEUE_SCHEDULER_ENABLED = "false"');
    expect(source).toContain('SAFE_TO_UPLOAD = "false"');
    expect(source).toContain("exit $exitCode");
  });
});
