import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

function collectTsxFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      return collectTsxFiles(path);
    }
    return path.endsWith(".tsx") ? [path] : [];
  });
}

describe("client secret exposure", () => {
  test("does not reference worker or service secrets in client components", () => {
    const clientFiles = [
      ...collectTsxFiles("src/components"),
      ...collectTsxFiles("app")
    ];
    const combined = clientFiles.map((file) => readFileSync(file, "utf8")).join("\n");

    expect(combined).not.toContain("WORKER_API_SECRET");
    expect(combined).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(combined).not.toContain("SUPABASE_URL");
    expect(combined).not.toContain("COUPANG");
    expect(combined).not.toContain("OPENAI_API_KEY");
    expect(combined).not.toContain("GEMINI_API_KEY");
    expect(combined).not.toContain("Authorization");
  });
});
