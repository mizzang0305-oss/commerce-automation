import { describe, expect, test } from "vitest";
import { buildCategoryOpportunityMatrix, buildOwnerMediaRequestMatrix } from "@/lib/usage-evidence";
import { makeV4Ranked } from "./fixture";

describe("V4 uncapped category ranking", () => {
  test("ranks potential gain first and uses deterministic category order", () => {
    const ranked = [
      ...makeV4Ranked({ category: "홈인테리어", keyword: "옷장 수납 정리", count: 5 }),
      ...makeV4Ranked({ category: "주방용품", keyword: "싱크대 정리함", count: 7 }),
      ...makeV4Ranked({ category: "스포츠/레저", keyword: "캠핑 수납 가방", count: 5 })
    ];
    const report = buildCategoryOpportunityMatrix({ ranked, active: [], reserve: [] });
    expect(report.categories.slice(0, 3).map((entry) => entry.categoryKey)).toEqual(["주방용품", "홈인테리어", "스포츠/레저"]);
    expect(report.selectedCategoryKeys).toHaveLength(3);
    expect(report.categories.find((entry) => entry.categoryKey === "홈인테리어")?.recommendedUseCases).toEqual(["home_storage"]);
    expect(buildOwnerMediaRequestMatrix(report.categories).requests.map((request) => request.expectedActiveGain)).toEqual([4, 4, 3]);
  });
});
