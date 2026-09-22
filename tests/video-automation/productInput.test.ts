import { describe, expect, test } from "vitest";
import { validateProductVideoInput } from "@/lib/video-automation/productInput";
import { bestKoreanSubstringSimilarity } from "@/lib/video-automation/localRuntime";

const valid = { runId: "run-1", product: { productKey: "product-001", rawProductName: "상품", canonicalProductName: "정식 상품", aliases: ["상품"], anchors: ["정리", "공간", "사용"], category: "생활", imagePaths: ["1", "2", "3", "4", "5"] }, creative: { candidateCount: 3 as const, language: "ko" as const }, mode: "local_review_only" as const };

describe("product input", () => {
  test("accepts the exact local Korean three-candidate contract", () => expect(validateProductVideoInput(valid)).toBe(valid));
  test("blocks a non-local mode", () => expect(() => validateProductVideoInput({ ...valid, mode: "publish" as never })).toThrow("VIDEO_AUTOMATION_LOCAL_REVIEW_ONLY"));
  test("requires disclosure and provenance for affiliate-backed exact product references", () => {
    expect(() => validateProductVideoInput({ ...valid, product: { ...valid.product, affiliateUrl: "https://link.coupang.com/a/x" } })).toThrow("VIDEO_AUTOMATION_DISCLOSURE_REQUIRED");
    expect(() => validateProductVideoInput({ ...valid, product: { ...valid.product, affiliateUrl: "https://link.coupang.com/a/x", disclosureText: "파트너스 고지", exactProductReference: { sourceUrl: "https://image.coupangcdn.com/a.jpg", localPath: "x", identityType: "product_reference", sourceProvider: "provider", sourceRequestId: "request" } } })).toThrow("VIDEO_AUTOMATION_SOURCE_PROVENANCE_REQUIRED");
  });
  test("recognizes a mildly mistranscribed Korean product phrase", () => expect(bestKoreanSubstringSimilarity("차량용 컵홀더 정리함", "차량용 커플 더 정리함으로 시작합니다")).toBeGreaterThanOrEqual(0.65));
});
