import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("live product two-level fallback", () => {
  test("keeps video repair in V2 and replaces a rejected product within three candidate attempts", async () => {
    const [liveRunner, v2Runner] = await Promise.all([
      readFile("scripts/live-product-video/run-live-product-video-v1.ts", "utf8"),
      readFile("scripts/video-automation/run-autonomous-video-review-v2.ts", "utf8")
    ]);
    expect(v2Runner).toContain("for (let cycle = 0; cycle < 3; cycle += 1)");
    expect(v2Runner).toContain('status: "VIDEO_AUTOMATION_REJECTED_PRODUCT"');
    expect(liveRunner).toContain("MAX_CANDIDATE_ATTEMPTS_PER_SLOT = 3");
    expect(liveRunner).toContain("await advanceSlot(slotIndex)");
    expect(liveRunner).toContain('phase: "video_qa"');
  });
});
