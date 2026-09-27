export type FastProductionReview = {
  schema: "fast-production-qa/v1";
  productId: string;
  canonicalProductName: string;
  videoSha256: string;
  sourceImageSha256: string[];
  disclosureText: string;
  checks: {
    PRODUCT_MATCH: boolean;
    VIDEO_VALID: boolean;
    CONTENT_SAFE: boolean;
    DISCLOSURE_PRESENT: boolean;
  };
};

export const FAST_PRODUCTION_DISCLOSURE = "※ 이 콘텐츠는 쿠팡파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.";

export function verifyFastProductionReview(input: {
  review: FastProductionReview | null | undefined;
  productId: string;
  canonicalProductName: string;
  videoSha256: string;
  disclosureText: string;
}): { ok: true } | { ok: false; safeError: string } {
  const review = input.review;
  if (!review) return { ok: false, safeError: "FAST_PRODUCTION_QA_MISSING" };
  if (review.schema !== "fast-production-qa/v1" ||
      review.productId !== input.productId ||
      review.canonicalProductName !== input.canonicalProductName ||
      typeof review.videoSha256 !== "string" ||
      review.videoSha256.toLowerCase() !== input.videoSha256.toLowerCase() ||
      !Array.isArray(review.sourceImageSha256) || review.sourceImageSha256.length < 3 || review.sourceImageSha256.length > 8 ||
      new Set(review.sourceImageSha256).size !== review.sourceImageSha256.length ||
      review.sourceImageSha256.some((value) => typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) ||
      review.disclosureText !== FAST_PRODUCTION_DISCLOSURE ||
      input.disclosureText !== FAST_PRODUCTION_DISCLOSURE) {
    return { ok: false, safeError: "FAST_PRODUCTION_QA_BINDING_MISMATCH" };
  }
  if (!review.checks || Object.values(review.checks).length !== 4 ||
      !review.checks.PRODUCT_MATCH || !review.checks.VIDEO_VALID ||
      !review.checks.CONTENT_SAFE || !review.checks.DISCLOSURE_PRESENT) {
    return { ok: false, safeError: "FAST_PRODUCTION_QA_NOT_PASS" };
  }
  return { ok: true };
}

export function fastProductionModeEnabled(env: Readonly<Record<string, string | undefined>>) {
  return env.FAST_PRODUCTION_MODE === "true" && env.OWNER_DIRECT_OPERATION_APPROVAL === "true";
}
