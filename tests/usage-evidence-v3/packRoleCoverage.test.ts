import { describe, expect, test } from "vitest";
import { validateUsageEvidenceRegistry } from "@/lib/usage-evidence";
import { makeUsageEvidenceRegistry, withV3MotionPack } from "../usage-evidence/fixture";

describe("V3 pack role and source coverage", () => {
  test("accepts seven assets with 2 problem, 3 action, 2 after, and two sources", () => {
    const registry = withV3MotionPack(makeUsageEvidenceRegistry({ packsPerUseCase: 2 }), "cable_organization", 1);
    expect(validateUsageEvidenceRegistry(registry).packs[registry.packs.length - 1]?.packGeneration).toBe("v3_motion");
  });

  test("rejects incomplete role coverage", () => {
    const registry = withV3MotionPack(makeUsageEvidenceRegistry({ packsPerUseCase: 2 }), "cable_organization", 2);
    const pack = registry.packs[registry.packs.length - 1];
    pack.afterAssetIds = [pack.afterAssetIds[0]];
    expect(() => validateUsageEvidenceRegistry(registry)).toThrow("USAGE_PACK_QA_FAILED");
  });

  test("rejects a V3 pack backed by only one source", () => {
    const registry = withV3MotionPack(makeUsageEvidenceRegistry({ packsPerUseCase: 2 }), "cable_organization", 3, ["one-source"]);
    expect(() => validateUsageEvidenceRegistry(registry)).toThrow("USAGE_PACK_QA_FAILED");
  });

  test("rejects clips assigned to the wrong use case", () => {
    const registry = withV3MotionPack(makeUsageEvidenceRegistry({ packsPerUseCase: 2 }), "cable_organization", 4);
    registry.packs[registry.packs.length - 1].useCase = "laundry_drying";
    expect(() => validateUsageEvidenceRegistry(registry)).toThrow("USAGE_PACK_QA_FAILED");
  });
});
