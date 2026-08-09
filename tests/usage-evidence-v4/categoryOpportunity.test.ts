import { describe, expect, test } from "vitest";
import { buildCategoryOpportunityMatrix } from "@/lib/usage-evidence";
import { makeActive, makeV4Ranked } from "./fixture";

describe("V4 category opportunity matrix", () => {
  test("rejects a capped category and calculates unchanged headroom", () => {
    const report = buildCategoryOpportunityMatrix({
      ranked: makeV4Ranked({ category: "생활용품", keyword: "옷장 수납 정리", count: 8 }),
      active: makeActive("생활용품", 24),
      reserve: []
    });
    const category = report.categories.find((entry) => entry.categoryKey === "생활용품");
    expect(category).toMatchObject({ currentCap: 24, remainingHeadroom: 0, potentialActiveGain: 0, selected: false });
    expect(report.policyThresholdChanges).toBe(0);
  });

  test("detects an uncapped policy/image/affiliate-ready category", () => {
    const report = buildCategoryOpportunityMatrix({
      ranked: makeV4Ranked({ category: "주방용품", keyword: "싱크대 정리함", count: 6 }),
      active: [],
      reserve: []
    });
    expect(report.categories[0]).toMatchObject({
      categoryKey: "주방용품",
      remainingHeadroom: 24,
      policyEligibleCandidates: 6,
      imageReadyCandidates: 6,
      affiliateReadyCandidates: 6,
      potentialActiveGain: 6,
      selected: true
    });
  });
});
