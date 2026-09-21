import { describe, expect, test } from "vitest";
import { adaptLiveProductToVideoInput, COUPANG_PARTNERS_DISCLOSURE } from "@/lib/live-product-video";
import { validateProductVideoInput } from "@/lib/video-automation/productInput";
import { generateDeterministicCreativeCandidates } from "@/lib/video-automation/creativeCandidates";
import { rankCreativeCandidates } from "@/lib/video-lab/creativeRanker";
import { candidate } from "./fixtures";

const usageEvidence = {
  assetId: "v049-father-generic-use",
  productKey: "old",
  sourcePath: "C:/local/use.mp4",
  reviewEvidencePath: "C:/local/review.json",
  sourceType: "owner_reviewed_local_video" as const,
  identityType: "generic_usage_example" as const,
  usageType: "real_use_context" as const,
  ownerReviewStatus: "pass" as const
};

describe("live product to proven V2 adapter", () => {
  test("binds live identity, affiliate, provenance, exact reference, generic evidence, and disclosure", () => {
    const live = candidate();
    const result = adaptLiveProductToVideoInput({
      candidate: live,
      exactReference: { sourceUrl: live.productImageUrls[0], localPath: "C:/local/product.jpg", width: 800, height: 800, mimeType: "image/jpeg", sizeBytes: 100, identityType: "product_reference" },
      usageEvidence,
      runId: "run-live-1"
    });
    result.product.imagePaths = ["1", "2", "3", "4", "5"];
    expect(validateProductVideoInput(result)).toBe(result);
    expect(result.product).toMatchObject({ productKey: live.productKey, affiliateUrl: live.selectedAffiliateUrl, disclosureText: COUPANG_PARTNERS_DISCLOSURE });
    expect(generateDeterministicCreativeCandidates(result).every((creative) => creative.disclosure === COUPANG_PARTNERS_DISCLOSURE)).toBe(true);
    const longNameInput = { ...result, product: { ...result.product, canonicalProductName: "여행용 휴대용 캠핑용 접이식 행거 스테인리스 옷걸이 빨래건조대" } };
    expect(rankCreativeCandidates(generateDeterministicCreativeCandidates(longNameInput)).every((creative) => creative.score.passed)).toBe(true);
    const deskInput = { ...result, product: { ...result.product, anchors: ["정리", "책상", "공간", "고정"] } };
    expect(generateDeterministicCreativeCandidates(deskInput)[0].hook).toBe("책상 정리, 왜 자꾸 불편할까요?");
    expect(result.product.exactProductReference?.identityType).toBe("product_reference");
    expect(result.product.realUseAsset?.identityType).toBe("generic_usage_example");
    expect(result.product.sourceProvenance?.sourceRequestId).toBe(live.sourceRequestId);
  });

  test("blocks missing affiliate readiness", () => {
    const live = candidate({ selectedAffiliateUrl: "" });
    expect(() => adaptLiveProductToVideoInput({ candidate: live, exactReference: { sourceUrl: live.productImageUrls[0], localPath: "x", width: 800, height: 800, mimeType: "image/jpeg", sizeBytes: 100, identityType: "product_reference" }, usageEvidence, runId: "run-live-1" })).toThrow("AFFILIATE_NOT_READY");
  });
});
