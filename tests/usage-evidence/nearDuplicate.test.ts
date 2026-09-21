import { describe, expect, test } from "vitest";
import { validateUsageEvidenceRegistry } from "@/lib/usage-evidence";
import { makeUsageEvidenceRegistry } from "./fixture";

describe("near duplicate rejection", () => {
  test("rejects pHash values within the configured Hamming threshold", () => {
    const registry = makeUsageEvidenceRegistry();
    registry.nearDuplicateHammingThreshold = 6;
    registry.assets[0].visualFingerprint = "0000000000000000";
    registry.assets[1].visualFingerprint = "0000000000000001";
    expect(() => validateUsageEvidenceRegistry(registry)).toThrow("USAGE_SOURCE_REVIEW_NOT_VALID");
  });
});
