import { describe, expect, test } from "vitest";
import { verifyProductVisualReview } from "@/lib/video-automation/productVisualReview";
import { signedTestReview, TEST_REVIEW_PUBLIC_KEY } from "../fixtures/productVisualReview";

const productId = "coupang:product:100:item:200:vendor:300";
const videoSha256 = "a".repeat(64);
const identity = { productId, canonicalProductName: "검증 상품", affiliateProductId: productId, affiliateUrl: "https://link.coupang.com/a/example", videoSha256, publicKey: TEST_REVIEW_PUBLIC_KEY };

describe("independent product visual review receipt", () => {
  test("accepts only a signed exact video/product receipt covering published history", () => {
    const receipt = signedTestReview(productId, videoSha256);
    expect(verifyProductVisualReview({ receipt, ...identity, requiredPriorVideoIds: ["t4F3OHxGGeg", "f9zPg0OEqG8"] })).toEqual({ ok: true });
    expect(verifyProductVisualReview({ receipt, ...identity, requiredPriorVideoIds: ["t4F3OHxGGeg", "f9zPg0OEqG8", "N_-zn9Jxw2A"] })).toMatchObject({ ok: false, safeError: "PRODUCT_BODY_REVIEW_STALE" });
  });

  test("rejects a relabeled product, changed file, forged pass, and missing verifier", () => {
    const receipt = signedTestReview(productId, videoSha256);
    expect(verifyProductVisualReview({ receipt, ...identity, productId: "coupang:product:101:item:200:vendor:300" })).toMatchObject({ ok: false, safeError: "PRODUCT_CONTENT_REVIEW_CONTRACT_INVALID" });
    expect(verifyProductVisualReview({ receipt, ...identity, videoSha256: "b".repeat(64) })).toMatchObject({ ok: false, safeError: "PRODUCT_CONTENT_REVIEW_CONTRACT_INVALID" });
    expect(verifyProductVisualReview({ receipt: { ...receipt, rightsEvidenceId: "forged" }, ...identity })).toMatchObject({ ok: false, safeError: "PRODUCT_CONTENT_REVIEW_SIGNATURE_INVALID" });
    expect(verifyProductVisualReview({ receipt, ...identity, publicKey: undefined })).toMatchObject({ ok: false, safeError: "PRODUCT_CONTENT_REVIEW_VERIFIER_NOT_CONFIGURED" });
    expect(verifyProductVisualReview({ receipt: { ...receipt, rightsEvidenceId: 1 } as unknown as typeof receipt, ...identity })).toMatchObject({ ok: false, safeError: "PRODUCT_CONTENT_REVIEW_CONTRACT_INVALID" });
    expect(verifyProductVisualReview({ receipt, ...identity, canonicalProductName: "다른 상품" })).toMatchObject({ ok: false, safeError: "PRODUCT_CONTENT_REVIEW_CONTRACT_INVALID" });
    expect(verifyProductVisualReview({ receipt, ...identity, affiliateProductId: "coupang:product:101:item:200:vendor:300" })).toMatchObject({ ok: false, safeError: "PRODUCT_CONTENT_REVIEW_CONTRACT_INVALID" });
    expect(verifyProductVisualReview({ receipt, ...identity, affiliateUrl: "https://link.coupang.com/a/changed" })).toMatchObject({ ok: false, safeError: "PRODUCT_CONTENT_REVIEW_CONTRACT_INVALID" });
    expect(verifyProductVisualReview({ receipt: { ...receipt, priorPublicationSimilarityResult: "unknown" } as unknown as typeof receipt, ...identity })).toMatchObject({ ok: false, safeError: "PRODUCT_CONTENT_REVIEW_CONTRACT_INVALID" });
  });
});
