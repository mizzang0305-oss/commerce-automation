import { describe, expect, test } from "vitest";
import { V5_NO_DOWNSTREAM_EXECUTION } from "@/lib/usage-evidence";

describe("V5 no-downstream execution", () => {
  test("keeps all write, render, speech, scheduler, and upload effects at zero or disabled", () => {
    expect(V5_NO_DOWNSTREAM_EXECUTION).toMatchObject({
      GOOGLE_SHEETS_WRITE: 0,
      GOOGLE_DRIVE_WRITE: 0,
      R2_WRITE: 0,
      DB_WRITE: 0,
      FINAL_PRODUCT_VIDEO_RENDER_COUNT: 0,
      TTS_EXECUTION_COUNT: 0,
      ASR_EXECUTION_COUNT: 0,
      WHISPERX_EXECUTION_COUNT: 0,
      PLATFORM_UPLOAD: 0,
      QUEUE_SCHEDULER_ENABLED: false,
      isPaused: true,
      SAFE_TO_UPLOAD: false,
      SAFE_TO_PUBLIC_UPLOAD: false
    });
  });
});
