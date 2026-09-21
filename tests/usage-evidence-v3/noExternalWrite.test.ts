import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

describe("V3 no-external-write boundary", () => {
  test("does not import downstream writer, renderer, speech, or upload modules", () => {
    const paths = [
      "scripts/usage-evidence/run-v3-capacity-simulation.ts",
      "tools/video-automation/usage_evidence_source_packs_v3.py"
    ];
    const source = paths.map((path) => readFileSync(resolve(path), "utf8")).join("\n");
    for (const forbidden of ["google-sheets-command-runner", "run-next-batch", "public-upload", "textToSpeech", "WhisperX", "supabase.from(", "R2Client"]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
