import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("batch creative failure isolation", () => {
  it("does not throw a whole-batch hook repetition failure before per-product handling", async () => {
    const source = await readFile("scripts/video-automation/run-autonomous-video-review-v2.ts", "utf8");
    expect(source).not.toContain('if (!selected) throw new Error("HOOK_TEMPLATE_REPETITION")');
    expect(source).toContain('if (!selected) continue');
    expect(source).toContain('if (!selected) throw new Error("CREATIVE_SELECTION_FAILED")');
  });
});
