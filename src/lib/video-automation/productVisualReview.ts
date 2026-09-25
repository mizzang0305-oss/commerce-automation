import { createHash, createPublicKey, verify } from "node:crypto";

const SHA256 = /^[0-9a-f]{64}$/u;
const PRODUCT_ID = /^coupang:product:\d+:item:\d+:vendor:\d+$/u;

/** Signed by an independent reviewer, never by the producer or publisher. */
export type ProductVisualReviewReceipt = {
  schema: "product-visual-review/v1";
  visualMode: "product_information";
  productId: string;
  canonicalProductName: string;
  affiliateProductId: string;
  affiliateUrlSha256: string;
  videoSha256: string;
  sourceSha256: string[];
  audioSha256: string;
  narrationSha256: string;
  scriptSha256: string;
  captionSha256: string;
  reviewerType: "human" | "composite" | "ai_multimodal";
  contentEvidenceSha256: string;
  rightsEvidenceId: string;
  rightsReview: "passed";
  productContentReview: "passed";
  audioScriptReview: "passed";
  crossVideoReview: "passed";
  priorPublicationSimilarityResult: "distinct";
  reviewedPriorVideoIds: string[];
  reviewerId: string;
  reviewerVersion: string;
  evidenceId: string;
  reviewedAt: string;
  signature: string;
};

export function productVisualReviewPayload(receipt: ProductVisualReviewReceipt): string {
  return JSON.stringify({
    schema: receipt.schema,
    visualMode: receipt.visualMode,
    productId: receipt.productId,
    canonicalProductName: receipt.canonicalProductName,
    affiliateProductId: receipt.affiliateProductId,
    affiliateUrlSha256: receipt.affiliateUrlSha256,
    videoSha256: receipt.videoSha256,
    sourceSha256: receipt.sourceSha256,
    audioSha256: receipt.audioSha256,
    narrationSha256: receipt.narrationSha256,
    scriptSha256: receipt.scriptSha256,
    captionSha256: receipt.captionSha256,
    reviewerType: receipt.reviewerType,
    contentEvidenceSha256: receipt.contentEvidenceSha256,
    rightsEvidenceId: receipt.rightsEvidenceId,
    rightsReview: receipt.rightsReview,
    productContentReview: receipt.productContentReview,
    audioScriptReview: receipt.audioScriptReview,
    crossVideoReview: receipt.crossVideoReview,
    priorPublicationSimilarityResult: receipt.priorPublicationSimilarityResult,
    reviewedPriorVideoIds: receipt.reviewedPriorVideoIds,
    reviewerId: receipt.reviewerId,
    reviewerVersion: receipt.reviewerVersion,
    evidenceId: receipt.evidenceId,
    reviewedAt: receipt.reviewedAt
  });
}

export function verifyProductVisualReview(input: {
  receipt: ProductVisualReviewReceipt | null | undefined;
  productId: string;
  canonicalProductName: string;
  affiliateProductId: string;
  affiliateUrl: string;
  videoSha256: string;
  publicKey: string | undefined;
  requiredPriorVideoIds?: string[];
}): { ok: true } | { ok: false; safeError: string } {
  const receipt = input.receipt;
  if (!receipt) return { ok: false, safeError: "PRODUCT_CONTENT_REVIEW_MISSING" };
  if (!input.publicKey?.trim()) return { ok: false, safeError: "PRODUCT_CONTENT_REVIEW_VERIFIER_NOT_CONFIGURED" };
  if (!nonEmptyString(input.affiliateUrl) || !nonEmptyString(input.canonicalProductName)) return { ok: false, safeError: "PRODUCT_CONTENT_REVIEW_CONTRACT_INVALID" };
  if (receipt.schema !== "product-visual-review/v1" || receipt.visualMode !== "product_information" ||
      !PRODUCT_ID.test(receipt.productId) || receipt.productId !== input.productId ||
      !nonEmptyString(receipt.canonicalProductName) || receipt.canonicalProductName !== input.canonicalProductName ||
      !PRODUCT_ID.test(receipt.affiliateProductId) || receipt.affiliateProductId !== input.affiliateProductId || receipt.affiliateProductId !== receipt.productId ||
      !SHA256.test(receipt.affiliateUrlSha256) || receipt.affiliateUrlSha256 !== sha256(input.affiliateUrl) ||
      !SHA256.test(receipt.videoSha256) || receipt.videoSha256 !== input.videoSha256.toLowerCase() ||
      !Array.isArray(receipt.sourceSha256) || receipt.sourceSha256.length < 1 || receipt.sourceSha256.some((hash) => !SHA256.test(hash)) ||
      !SHA256.test(receipt.audioSha256) || !SHA256.test(receipt.narrationSha256) || !SHA256.test(receipt.scriptSha256) || !SHA256.test(receipt.captionSha256) ||
      !["human", "composite", "ai_multimodal"].includes(receipt.reviewerType) || !SHA256.test(receipt.contentEvidenceSha256) ||
      receipt.rightsReview !== "passed" ||
      receipt.productContentReview !== "passed" || receipt.audioScriptReview !== "passed" || receipt.crossVideoReview !== "passed" ||
      receipt.priorPublicationSimilarityResult !== "distinct" ||
      !Array.isArray(receipt.reviewedPriorVideoIds) || receipt.reviewedPriorVideoIds.some((id) => typeof id !== "string" || !/^[A-Za-z0-9_-]{11}$/u.test(id)) ||
      !nonEmptyString(receipt.rightsEvidenceId) || !nonEmptyString(receipt.reviewerId) || !nonEmptyString(receipt.reviewerVersion) || !nonEmptyString(receipt.evidenceId) ||
      typeof receipt.reviewedAt !== "string" || !Number.isFinite(Date.parse(receipt.reviewedAt)) ||
      typeof receipt.signature !== "string" || !/^[A-Za-z0-9_-]{80,100}$/u.test(receipt.signature)) {
    return { ok: false, safeError: "PRODUCT_CONTENT_REVIEW_CONTRACT_INVALID" };
  }
  if (input.requiredPriorVideoIds && (
    new Set(receipt.reviewedPriorVideoIds).size !== receipt.reviewedPriorVideoIds.length ||
    input.requiredPriorVideoIds.some((id) => !receipt.reviewedPriorVideoIds.includes(id))
  )) return { ok: false, safeError: "PRODUCT_BODY_REVIEW_STALE" };
  try {
    const key = createPublicKey(input.publicKey);
    if (key.asymmetricKeyType !== "ed25519" || !verify(null, Buffer.from(productVisualReviewPayload(receipt)), key, Buffer.from(receipt.signature, "base64url"))) {
      return { ok: false, safeError: "PRODUCT_CONTENT_REVIEW_SIGNATURE_INVALID" };
    }
  } catch {
    return { ok: false, safeError: "PRODUCT_CONTENT_REVIEW_SIGNATURE_INVALID" };
  }
  return { ok: true };
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
