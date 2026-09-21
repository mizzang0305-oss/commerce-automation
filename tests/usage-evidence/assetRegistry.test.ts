import { describe, expect, test } from "vitest";
import { validateUsageEvidenceRegistry } from "@/lib/usage-evidence";
import { makeUsageEvidenceRegistry } from "./fixture";

describe("usage evidence registry", () => {
  test("accepts reviewed lineage with at least two packs per supported use case", () => expect(validateUsageEvidenceRegistry(makeUsageEvidenceRegistry()).packs.length).toBe(28));

  test("rejects privacy-risk assets", () => {
    const registry = makeUsageEvidenceRegistry(); registry.assets[0].blockCodes = ["USAGE_ASSET_PRIVACY_RISK"];
    expect(() => validateUsageEvidenceRegistry(registry)).toThrow("USAGE_SOURCE_REVIEW_NOT_VALID");
  });

  test("requires clip timestamps for derived video evidence", () => {
    const registry = makeUsageEvidenceRegistry({ sourceKind: "derived_frame_pack" }); delete registry.assets[0].clipStartSeconds;
    expect(() => validateUsageEvidenceRegistry(registry)).toThrow("USAGE_SOURCE_REVIEW_NOT_VALID");
    const missingOperation = makeUsageEvidenceRegistry({ sourceKind: "derived_frame_pack" }); missingOperation.assets[0].derivationOperation = "";
    expect(() => validateUsageEvidenceRegistry(missingOperation)).toThrow("USAGE_SOURCE_REVIEW_NOT_VALID");
  });

  test("rejects wrong-category packs and use-case mismatches", () => {
    const wrongCategory = makeUsageEvidenceRegistry(); wrongCategory.packs[0].categoryAllowlist = ["식품"];
    expect(() => validateUsageEvidenceRegistry(wrongCategory)).toThrow("USAGE_PACK_QA_FAILED");
    const mismatch = makeUsageEvidenceRegistry(); mismatch.assets[0].useCases = ["desk_organization"];
    expect(() => validateUsageEvidenceRegistry(mismatch)).toThrow("USAGE_PACK_QA_FAILED");
  });
});
