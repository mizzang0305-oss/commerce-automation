import type { OwnerReviewedRealUseAsset } from "@/lib/video-automation/types";
import type { LiveProductCandidate, LiveVideoInput, ResolvedExactProductReference } from "./types";

export const COUPANG_PARTNERS_DISCLOSURE = "이 포스팅은 쿠팡 파트너스 활동의 일환으로 일정액의 수수료를 제공받습니다.";

export function adaptLiveProductToVideoInput(input: {
  candidate: LiveProductCandidate;
  exactReference: ResolvedExactProductReference;
  usageEvidence: OwnerReviewedRealUseAsset;
  runId: string;
}): LiveVideoInput {
  const { candidate } = input;
  if (!candidate.selectedAffiliateUrl) throw new Error("AFFILIATE_NOT_READY");
  if (input.exactReference.identityType !== "product_reference") throw new Error("EXACT_PRODUCT_REFERENCE_REQUIRED");
  if (input.usageEvidence.identityType !== "generic_usage_example" || input.usageEvidence.ownerReviewStatus !== "pass") throw new Error("USAGE_EVIDENCE_NOT_AVAILABLE");
  return {
    runId: input.runId,
    product: {
      productKey: candidate.productKey,
      rawProductName: candidate.rawProductName,
      canonicalProductName: candidate.canonicalProductName,
      aliases: candidate.productAliases,
      anchors: candidate.productAnchors,
      category: candidate.categoryPath || candidate.category || candidate.useCase,
      priceText: candidate.priceText,
      imagePaths: [],
      affiliateUrl: candidate.selectedAffiliateUrl,
      disclosureText: COUPANG_PARTNERS_DISCLOSURE,
      exactProductReference: {
        sourceUrl: input.exactReference.sourceUrl,
        localPath: input.exactReference.localPath,
        identityType: "product_reference",
        sourceProvider: candidate.sourceProvider,
        sourceRequestId: candidate.sourceRequestId
      },
      sourceProvenance: {
        sourceProvider: candidate.sourceProvider,
        sourceRequestId: candidate.sourceRequestId,
        discoveredAt: candidate.discoveredAt,
        sourceKeyword: candidate.sourceKeyword,
        rawProductId: candidate.rawProductId,
        productKey: candidate.productKey
      },
      realUseAsset: { ...input.usageEvidence, productKey: candidate.productKey }
    },
    creative: { candidateCount: 3, language: "ko" },
    mode: "local_review_only"
  };
}
