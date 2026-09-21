import { describe, expect, test } from "vitest";
import { isEligibleAsset } from "@/lib/usage-evidence";
import { makeUsageEvidenceRegistry } from "./fixture";

describe("review semantics", () => {
  test("Codex Tier B review stays local-only and does not impersonate owner review", () => {
    const asset = makeUsageEvidenceRegistry().assets[0];
    expect(asset.trustTier).toBe("CODEX_REVIEWED_LOCAL_ONLY");
    expect(asset.humanOwnerReviewStatus).toBe("not_requested");
    expect(asset.publishEligible).toBe(false);
    expect(isEligibleAsset(asset)).toBe(true);
  });

  test("human-reviewed tier requires a passing human source review", () => {
    const asset = { ...makeUsageEvidenceRegistry().assets[0], trustTier: "HUMAN_REVIEWED_SOURCE_DERIVED" as const, sourceHumanReviewStatus: "not_available" as const };
    expect(isEligibleAsset(asset)).toBe(false);
  });
});
