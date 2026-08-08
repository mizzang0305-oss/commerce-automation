import fs from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

const SOURCE_ROOT = path.join(process.cwd(), "src", "lib", "video-lab");
const PROTECTED_IMPORTS = [
  "/api/",
  "@/lib/supabase",
  "@/lib/coupang",
  "@/lib/uploads",
  "python-worker",
  "googleapis",
  "youtube",
  "@aws-sdk",
  "cloudflare"
];

describe("video lab isolation boundary", () => {
  test("does not import production integration, storage, upload, or worker modules", () => {
    const files = fs.readdirSync(SOURCE_ROOT).filter((name) => name.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const source = fs.readFileSync(path.join(SOURCE_ROOT, file), "utf8").toLowerCase();
      for (const protectedImport of PROTECTED_IMPORTS) {
        expect(source, `${file} contains protected import ${protectedImport}`).not.toContain(
          protectedImport
        );
      }
    }
  });

  test("keeps every runtime feature and upload safety flag fail-closed", async () => {
    const { VIDEO_LAB_FLAGS } = await import("@/lib/video-lab/types");
    expect(VIDEO_LAB_FLAGS).toEqual({
      VIDEO_LAB_ENABLED: false,
      VIDEO_LAB_VIRALITY_SCORER: true,
      VIDEO_LAB_WHISPERX: false,
      VIDEO_LAB_REMOTION: false,
      VIDEO_LAB_LATENTSYNC: false,
      SAFE_TO_UPLOAD: false,
      SAFE_TO_PUBLIC_UPLOAD: false
    });
  });
});
