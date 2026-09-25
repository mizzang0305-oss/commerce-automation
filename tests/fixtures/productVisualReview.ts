import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { productVisualReviewPayload, type ProductVisualReviewReceipt } from "@/lib/video-automation/productVisualReview";

const keys = generateKeyPairSync("ed25519");
export const TEST_REVIEW_PUBLIC_KEY = keys.publicKey.export({ format: "pem", type: "spki" }).toString();

export function signedTestReview(productId: string, videoSha256: string, reviewedPriorVideoIds = ["t4F3OHxGGeg", "f9zPg0OEqG8"], canonicalProductName = "검증 상품", affiliateUrl = "https://link.coupang.com/a/example"): ProductVisualReviewReceipt {
  const receipt: ProductVisualReviewReceipt = {
    schema: "product-visual-review/v1",
    visualMode: "product_information",
    productId,
    canonicalProductName,
    affiliateProductId: productId,
    affiliateUrlSha256: createHash("sha256").update(affiliateUrl).digest("hex"),
    videoSha256,
    sourceSha256: ["b".repeat(64)],
    audioSha256: "c".repeat(64),
    narrationSha256: "d".repeat(64),
    scriptSha256: "e".repeat(64),
    captionSha256: "f".repeat(64),
    reviewerType: "human",
    contentEvidenceSha256: "1".repeat(64),
    rightsEvidenceId: "TEST_ONLY_RIGHTS_EVIDENCE",
    rightsReview: "passed",
    productContentReview: "passed",
    audioScriptReview: "passed",
    crossVideoReview: "passed",
    priorPublicationSimilarityResult: "distinct",
    reviewedPriorVideoIds,
    reviewerId: "TEST_ONLY_REVIEWER",
    reviewerVersion: "TEST_ONLY_V1",
    evidenceId: "TEST_ONLY_EVIDENCE",
    reviewedAt: "2026-09-22T00:00:00.000Z",
    signature: ""
  };
  receipt.signature = sign(null, Buffer.from(productVisualReviewPayload(receipt)), keys.privateKey).toString("base64url");
  return receipt;
}
