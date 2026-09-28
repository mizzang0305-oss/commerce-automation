import { describe, expect, test } from "vitest";
import { adaptLiveProductToVideoInput, COUPANG_PARTNERS_DISCLOSURE } from "@/lib/live-product-video";
import { validateProductVideoInput } from "@/lib/video-automation/productInput";
import { generateDeterministicCreativeCandidates } from "@/lib/video-automation/creativeCandidates";
import { rankCreativeCandidates } from "@/lib/video-lab/creativeRanker";
import { candidate } from "./fixtures";

describe("live product to proven V2 adapter", () => {
  test("binds live identity, affiliate, provenance, exact-only visual mode, and disclosure", () => {
    const live = candidate();
    const result = adaptLiveProductToVideoInput({
      candidate: live,
      exactReference: { sourceUrl: live.productImageUrls[0], localPath: "C:/local/product.jpg", width: 800, height: 800, mimeType: "image/jpeg", sizeBytes: 100, identityType: "product_reference" },
      runId: "run-live-1"
    });
    expect(validateProductVideoInput(result)).toBe(result);
    expect(result.product).toMatchObject({ productKey: live.productKey, affiliateUrl: live.selectedAffiliateUrl, disclosureText: COUPANG_PARTNERS_DISCLOSURE });
    expect(generateDeterministicCreativeCandidates(result).every((creative) => creative.disclosure === COUPANG_PARTNERS_DISCLOSURE)).toBe(true);
    const longNameInput = { ...result, product: { ...result.product, canonicalProductName: "여행용 휴대용 캠핑용 접이식 행거 스테인리스 옷걸이 빨래건조대" } };
    expect(rankCreativeCandidates(generateDeterministicCreativeCandidates(longNameInput)).every((creative) => creative.score.passed)).toBe(true);
    const deskInput = { ...result, product: { ...result.product, anchors: ["정리", "책상", "공간", "고정"] } };
    expect(generateDeterministicCreativeCandidates(deskInput)[0].hook).toBe("책상 정리, 왜 자꾸 불편할까요?");
    expect(result.product.exactProductReference?.identityType).toBe("product_reference");
    expect(result.product.visualMode).toBe("product_information");
    expect(result.product.imagePaths).toEqual(["C:/local/product.jpg"]);
    expect(result.product.realUseAsset).toBeUndefined();
    expect(result.product.sourceProvenance?.sourceRequestId).toBe(live.sourceRequestId);
  });

  test("blocks missing affiliate readiness", () => {
    const live = candidate({ selectedAffiliateUrl: "" });
    expect(() => adaptLiveProductToVideoInput({ candidate: live, exactReference: { sourceUrl: live.productImageUrls[0], localPath: "x", width: 800, height: 800, mimeType: "image/jpeg", sizeBytes: 100, identityType: "product_reference" }, runId: "run-live-1" })).toThrow("AFFILIATE_NOT_READY");
  });

  test("rejects generic frames or a relabeled product in product-information mode", () => {
    const live = candidate();
    const result = adaptLiveProductToVideoInput({ candidate: live, exactReference: { sourceUrl: live.productImageUrls[0], localPath: "C:/local/product.jpg", width: 800, height: 800, mimeType: "image/jpeg", sizeBytes: 100, identityType: "product_reference" }, runId: "run-live-1" });
    result.product.imagePaths.push("C:/local/generic.jpg");
    expect(() => validateProductVideoInput(result)).toThrow("PRODUCT_INFORMATION_EXACT_ASSET_REQUIRED");
    result.product.imagePaths = ["C:/local/product.jpg"];
    result.product.sourceProvenance!.productKey = "coupang:product:999:item:999:vendor:999";
    expect(() => validateProductVideoInput(result)).toThrow("VIDEO_AUTOMATION_SOURCE_PROVENANCE_REQUIRED");
  });
});
