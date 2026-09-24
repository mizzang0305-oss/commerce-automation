import { describe, expect, test } from "vitest";
import { verifyProductVisualReview } from "@/lib/video-automation/productVisualReview";
import { signedTestReview, TEST_REVIEW_PUBLIC_KEY } from "../fixtures/productVisualReview";

const productId = "coupang:product:100:item:200:vendor:300";
const videoSha256 = "a".repeat(64);

describe("independent product visual review receipt", () => {
  test("accepts only a signed exact video/product receipt covering published history", () => {
    const receipt = signedTestReview(productId, videoSha256);
    expect(verifyProductVisualReview({ receipt, productId, videoSha256, publicKey: TEST_REVIEW_PUBLIC_KEY, requiredPriorVideoIds: ["t4F3OHxGGeg", "f9zPg0OEqG8"] })).toEqual({ ok: true });
    expect(verifyProductVisualReview({ receipt, productId, videoSha256, publicKey: TEST_REVIEW_PUBLIC_KEY, requiredPriorVideoIds: ["t4F3OHxGGeg", "f9zPg0OEqG8", "N_-zn9Jxw2A"] })).toMatchObject({ ok: false, safeError: "PRODUCT_BODY_REVIEW_STALE" });
  });

  test("rejects a relabeled product, changed file, forged pass, and missing verifier", () => {
    const receipt = signedTestReview(productId, videoSha256);
    expect(verifyProductVisualReview({ receipt, productId: "coupang:product:101:item:200:vendor:300", videoSha256, publicKey: TEST_REVIEW_PUBLIC_KEY })).toMatchObject({ ok: false, safeError: "PRODUCT_CONTENT_REVIEW_CONTRACT_INVALID" });
    expect(verifyProductVisualReview({ receipt, productId, videoSha256: "b".repeat(64), publicKey: TEST_REVIEW_PUBLIC_KEY })).toMatchObject({ ok: false, safeError: "PRODUCT_CONTENT_REVIEW_CONTRACT_INVALID" });
    expect(verifyProductVisualReview({ receipt: { ...receipt, rightsEvidenceId: "forged" }, productId, videoSha256, publicKey: TEST_REVIEW_PUBLIC_KEY })).toMatchObject({ ok: false, safeError: "PRODUCT_CONTENT_REVIEW_SIGNATURE_INVALID" });
    expect(verifyProductVisualReview({ receipt, productId, videoSha256, publicKey: undefined })).toMatchObject({ ok: false, safeError: "PRODUCT_CONTENT_REVIEW_VERIFIER_NOT_CONFIGURED" });
    expect(verifyProductVisualReview({ receipt: { ...receipt, rightsEvidenceId: 1 } as unknown as typeof receipt, productId, videoSha256, publicKey: TEST_REVIEW_PUBLIC_KEY })).toMatchObject({ ok: false, safeError: "PRODUCT_CONTENT_REVIEW_CONTRACT_INVALID" });
  });
});
