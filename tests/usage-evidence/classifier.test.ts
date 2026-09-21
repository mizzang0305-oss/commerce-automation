import { describe, expect, test } from "vitest";
import { classifyUsageEvidenceUseCase } from "@/lib/usage-evidence";

describe("usage evidence classifier", () => {
  test.each([
    ["차량용 정리함", "vehicle_organization"],
    ["책상 수납 정리", "desk_organization"],
    ["실내 빨래 건조대", "laundry_drying"]
  ])("preserves legacy classification for %s", (name, expected) => expect(classifyUsageEvidenceUseCase({ productName: name }).useCase).toBe(expected));

  test("classifies specific new uses before generic uses", () => {
    expect(classifyUsageEvidenceUseCase({ productName: "차량 시트백 뒷좌석 수납함", categoryPath: "자동차용품" }).useCase).toBe("vehicle_cabin_storage");
    expect(classifyUsageEvidenceUseCase({ productName: "접이식 공간절약 빨래건조대", categoryPath: "생활용품" }).useCase).toBe("laundry_space_organization");
  });

  test("blocks unsupported or category-conflicting products", () => {
    expect(classifyUsageEvidenceUseCase({ productName: "무선 이어폰", categoryPath: "디지털" }).useCase).toBe("unsupported");
    expect(classifyUsageEvidenceUseCase({ productName: "차량용 정리함 건강기능식품", categoryPath: "건강기능식품" }).useCase).toBe("unsupported");
  });
});
