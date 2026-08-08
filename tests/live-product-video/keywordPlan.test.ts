import { describe, expect, test } from "vitest";
import { buildLiveProductKeywordContexts } from "@/lib/live-product-video";

describe("rolling live keyword plan", () => {
  test("uses the existing rolling 30-day KST calendar and returns five bounded queries", () => {
    const result = buildLiveProductKeywordContexts("2026-08-08");
    expect(result.window).toMatchObject({ startDate: "2026-08-08", endDate: "2026-09-07", timezone: "Asia/Seoul", daysAhead: 30 });
    expect(result.contexts.length).toBeGreaterThanOrEqual(3);
    expect(result.contexts.length).toBeLessThanOrEqual(5);
    expect(result.contexts.some((entry) => entry.keyword.includes("차량"))).toBe(true);
    expect(result.contexts.some((entry) => entry.keyword.includes("책상"))).toBe(true);
    expect(result.contexts.some((entry) => entry.keyword.includes("빨래건조대"))).toBe(true);
  });
});
