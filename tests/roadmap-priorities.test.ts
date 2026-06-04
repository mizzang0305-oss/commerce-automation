import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("Coupang MVP roadmap priorities", () => {
  test("keeps the next roadmap centered on the in-house Coupang MVP", () => {
    const roadmap = readFileSync("docs/09_RELEASE_AND_ROADMAP.md", "utf8");
    const readme = readFileSync("README.md", "utf8");
    const architecture = readFileSync("docs/03_ARCHITECTURE_DESIGN.md", "utf8");

    expect(roadmap).toContain("PR #37. Render quality tuning v2");
    expect(roadmap).toContain("PR #38. Production hosting target decision package");
    expect(roadmap).toContain("PR #39. Coupang collector MVP");
    expect(roadmap).toContain("PR #40. Daily production planner actual use");
    expect(roadmap).toContain("PR #41. Channel package operations dashboard");
    expect(roadmap).toContain("PR #42. Content quality review queue");
    expect(roadmap).toContain("PR #43. YouTube channel readiness only");
    expect(roadmap).toContain("YouTube OAuth/upload stays last");

    for (const doc of [roadmap, readme, architecture]) {
      expect(doc).toContain("n8n, Creatomate, and Google Docs are not the current production path");
      expect(doc).toContain("Naver BrandConnect is deferred");
      expect(doc).toContain("multi-user SaaS is deferred");
    }
  });
});
