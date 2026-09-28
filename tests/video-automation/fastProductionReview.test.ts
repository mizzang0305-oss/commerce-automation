import { describe, expect, test } from "vitest";
import { FAST_PRODUCTION_DISCLOSURE, fastProductionModeEnabled, verifyFastProductionReview } from "@/lib/video-automation/fastProductionReview";

const valid = {
  schema: "fast-production-qa/v1" as const,
  productId: "coupang:product:1:item:2:vendor:3",
  canonicalProductName: "접이식 행거",
  videoSha256: "a".repeat(64),
  sourceImageSha256: ["b".repeat(64), "c".repeat(64), "d".repeat(64)],
  disclosureText: FAST_PRODUCTION_DISCLOSURE,
  checks: { PRODUCT_MATCH: true, VIDEO_VALID: true, CONTENT_SAFE: true, DISCLOSURE_PRESENT: true }
};

const input = {
  productId: valid.productId,
  canonicalProductName: valid.canonicalProductName,
  videoSha256: valid.videoSha256,
  disclosureText: FAST_PRODUCTION_DISCLOSURE
};

describe("fast production review", () => {
  test("requires both explicit mode flags", () => {
    expect(fastProductionModeEnabled({ FAST_PRODUCTION_MODE: "true" })).toBe(false);
    expect(fastProductionModeEnabled({ OWNER_DIRECT_OPERATION_APPROVAL: "true" })).toBe(false);
    expect(fastProductionModeEnabled({ FAST_PRODUCTION_MODE: "true", OWNER_DIRECT_OPERATION_APPROVAL: "true" })).toBe(true);
  });

  test("binds all four machine checks to exact product, bytes and disclosure", () => {
    expect(verifyFastProductionReview({ ...input, review: valid })).toEqual({ ok: true });
    expect(verifyFastProductionReview({ ...input, review: undefined })).toMatchObject({ safeError: "FAST_PRODUCTION_QA_MISSING" });
    expect(verifyFastProductionReview({ ...input, videoSha256: "b".repeat(64), review: valid })).toMatchObject({ safeError: "FAST_PRODUCTION_QA_BINDING_MISMATCH" });
    expect(verifyFastProductionReview({ ...input, review: { ...valid, sourceImageSha256: ["b".repeat(64), "b".repeat(64), "d".repeat(64)] } })).toMatchObject({ safeError: "FAST_PRODUCTION_QA_BINDING_MISMATCH" });
    expect(verifyFastProductionReview({ ...input, review: { ...valid, checks: { ...valid.checks, CONTENT_SAFE: false } } })).toMatchObject({ safeError: "FAST_PRODUCTION_QA_NOT_PASS" });
  });
});
