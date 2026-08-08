import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

describe("video lab score CLI", () => {
  test("emits a fail-closed result for malformed JSON candidates without leaking TypeError", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "video-lab-cli-"));
    const inputPath = path.join(tempRoot, "candidates.json");
    fs.writeFileSync(inputPath, JSON.stringify([null, {}, { id: "BAD", productName: 3 }]), "utf8");
    try {
      const result = spawnSync(
        process.execPath,
        ["--import", "tsx", "scripts/video-lab/score-creatives.ts", inputPath],
        { cwd: process.cwd(), encoding: "utf8", timeout: 30_000 }
      );
      expect(result.status).toBe(0);
      expect(result.stderr).not.toContain("TypeError");
      const output = JSON.parse(result.stdout) as {
        version: string;
        results: Array<{ score: { blockers: string[] } }>;
      };
      expect(output.version).toBe("video-lab-creative-score-v2");
      expect(
        output.results.every((item) => item.score.blockers.includes("INVALID_CANDIDATE_INPUT"))
      ).toBe(true);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
