import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const RESEARCH_ROOT = path.join(
  REPO_ROOT,
  "src",
  "lib",
  "video-lab",
  "youtube-intelligence",
);

describe("YouTube Intelligence production isolation", () => {
  it("is absent from production source imports", () => {
    const sourceFiles = walk(path.join(REPO_ROOT, "src")).filter(
      (file) => /\.[cm]?[jt]sx?$/.test(file) && !file.startsWith(RESEARCH_ROOT),
    );
    const importers = sourceFiles.filter((file) =>
      readFileSync(file, "utf8").includes("video-lab/youtube-intelligence"),
    );
    expect(importers).toEqual([]);
  });

  it("contains no upload, scheduler, Sheets, DB-writer, or external mutation import", () => {
    const researchFiles = [
      ...walk(RESEARCH_ROOT),
      ...walk(path.join(REPO_ROOT, "scripts", "youtube-intelligence")),
    ].filter((file) => /\.[cm]?[jt]sx?$/.test(file));
    const source = researchFiles.map((file) => readFileSync(file, "utf8")).join("\n");
    const forbidden = [
      /from\s+["'][^"']*uploads\//,
      /from\s+["'][^"']*queue-scheduler/,
      /from\s+["'][^"']*daily69-first-operation/,
      /from\s+["'][^"']*google-sheets/,
      /from\s+["'][^"']*supabase/,
      /videos\.insert\s*\(/,
      /Task Scheduler register/i,
      /R2 put/i,
      /TikTok post/i,
      /Threads post/i,
      /comment insert/i,
    ];
    expect(forbidden.filter((pattern) => pattern.test(source))).toEqual([]);
  });

  it("gitignores all local raw, normalized, derived, and index data", () => {
    const gitignore = readFileSync(path.join(REPO_ROOT, ".gitignore"), "utf8");
    expect(gitignore).toContain("/data/youtube-intelligence-v1/");
  });

  it("does not implement a live URL ingest or remote scene provider command", () => {
    const source = walk(RESEARCH_ROOT)
      .filter((file) => file.endsWith(".ts"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(source).not.toMatch(/class\s+RemoteSceneFrameProvider/);
    expect(source).not.toMatch(/ingest-url/);
    expect(source).not.toMatch(/cookiesFromBrowser|cookiefile|youtube-dl|yt-dlp/i);
  });
});

function walk(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const target = path.join(root, name);
    return statSync(target).isDirectory() ? walk(target) : [target];
  });
}
