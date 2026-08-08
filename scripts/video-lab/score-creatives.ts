import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { rankCreativeCandidates } from "../../src/lib/video-lab/creativeRanker";
import { parseCreativeCandidates } from "../../src/lib/video-lab/creativeCandidateParser";
import { creativeCandidateFixtures } from "../../tests/video-lab/fixtures/creativeCandidates";

export function loadCandidates(inputPath?: string): unknown[] {
  if (!inputPath) return creativeCandidateFixtures;
  const resolved = path.resolve(inputPath);
  const parsed: unknown = JSON.parse(fs.readFileSync(resolved, "utf8"));
  if (!Array.isArray(parsed)) throw new Error("VIDEO_LAB_CANDIDATE_ARRAY_REQUIRED");
  parseCreativeCandidates(parsed);
  return parsed;
}

export function main(): void {
  if (process.argv[2] === "--help" || process.argv[2] === "-h") {
    process.stdout.write("Usage: npm run video-lab:score -- [creative-candidates.json]\n");
    return;
  }
  const candidates = loadCandidates(process.argv[2]);
  const ranked = rankCreativeCandidates(candidates);
  process.stdout.write(
    `${JSON.stringify(
      {
        version: "video-lab-creative-score-v2",
        candidates: ranked.length,
        passed: ranked.filter((item) => item.score.passed).length,
        SAFE_TO_UPLOAD: false,
        SAFE_TO_PUBLIC_UPLOAD: false,
        results: ranked
      },
      null,
      2
    )}\n`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
