import { generateKeyPairSync, sign } from "node:crypto";
import { productVisualReviewPayload, type ProductVisualReviewReceipt } from "@/lib/video-automation/productVisualReview";

const keys = generateKeyPairSync("ed25519");
export const TEST_REVIEW_PUBLIC_KEY = keys.publicKey.export({ format: "pem", type: "spki" }).toString();

export function signedTestReview(productId: string, videoSha256: string, reviewedPriorVideoIds = ["t4F3OHxGGeg", "f9zPg0OEqG8"]): ProductVisualReviewReceipt {
  const receipt: ProductVisualReviewReceipt = {
    schema: "product-visual-review/v1",
    visualMode: "product_information",
    productId,
    videoSha256,
    sourceSha256: ["b".repeat(64)],
    audioSha256: "c".repeat(64),
    narrationSha256: "d".repeat(64),
    rightsEvidenceId: "TEST_ONLY_RIGHTS_EVIDENCE",
    productContentReview: "passed",
    audioScriptReview: "passed",
    crossVideoReview: "passed",
    reviewedPriorVideoIds,
    reviewerId: "TEST_ONLY_REVIEWER",
    evidenceId: "TEST_ONLY_EVIDENCE",
    reviewedAt: "2026-09-22T00:00:00.000Z",
    signature: ""
  };
  receipt.signature = sign(null, Buffer.from(productVisualReviewPayload(receipt)), keys.privateKey).toString("base64url");
  return receipt;
}
