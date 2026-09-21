import { createHash } from "node:crypto";
import type { RankedLiveProduct } from "@/lib/live-product-video";
import type { LocalQueueItem, ReserveCandidate } from "@/lib/queue-scheduler/types";
import {
  GENERIC_USAGE_EVIDENCE_USE_CASES,
  PRODUCT_BOUND_SYNTHETIC_USE_CASES,
  SUPPORTED_USAGE_EVIDENCE_USE_CASES,
  V5_SYNTHETIC_DISCLOSURE,
  type ProductBoundSyntheticUseCase,
  type UsageAssetBlockCode,
  type UsageEvidenceAsset,
  type UsageEvidencePack,
  type UsageEvidenceRegistry
} from "@/lib/usage-evidence";
import { makeUsageEvidenceRegistry } from "../usage-evidence/fixture";

const CATEGORY: Record<ProductBoundSyntheticUseCase, string> = {
  home_storage: "홈인테리어",
  kitchen_organization: "주방용품",
  camping_storage: "스포츠/레저"
};

export function makeV5Ranked(productKey: string, useCase: ProductBoundSyntheticUseCase, index = 0): RankedLiveProduct {
  const category = CATEGORY[useCase];
  const name = `${productKey} ${useCase} 수납 제품`;
  return {
    candidate: {
      rawProductId: String(8_000_000 + index),
      rawProductName: name,
      canonicalProductName: name,
      category,
      categoryPath: `${category}>정리/수납>${productKey}`,
      priceText: "19900",
      rawProductUrl: `https://www.coupang.com/vp/products/${8_000_000 + index}`,
      selectedAffiliateUrl: `https://link.coupang.com/a/test-${index}`,
      productImageUrls: [`https://image.coupangcdn.com/image/product/image/${index}/test.jpg`],
      sourceProvider: "coupang_partners_product_search",
      sourceRequestId: `request-${index}`,
      discoveredAt: "2026-08-09T00:00:00.000Z",
      sourceKeyword: `${useCase} keyword`,
      eventContext: { eventId: "v5", eventName: "v5" },
      candidateId: `candidate-${productKey}`,
      productKey,
      productAliases: [name],
      productAnchors: ["수납", "정리", "공간", "보관", productKey],
      useCase
    },
    score: {
      productKey,
      eventRelevanceScore: 100,
      motionSuitabilityScore: 100,
      policySafetyScore: 100,
      imageReadinessScore: 100,
      affiliateReadinessScore: 100,
      duplicatePenalty: 0,
      usageEvidenceScore: 100,
      finalProductScore: 100 - index / 100,
      selectionRank: index + 1,
      eligible: true,
      blockers: []
    }
  };
}

export function makeV5Pack(productKey: string, useCase: ProductBoundSyntheticUseCase, options: {
  blockCode?: UsageAssetBlockCode;
  reviewStatus?: UsageEvidenceAsset["derivedCodexVisualReviewStatus"];
  productPixelSource?: UsageEvidenceAsset["productPixelSource"];
  publishEligible?: boolean;
  disclosureRequired?: boolean;
  identityScore?: number;
} = {}): { assets: UsageEvidenceAsset[]; pack: UsageEvidencePack } {
  const definition = SUPPORTED_USAGE_EVIDENCE_USE_CASES[useCase];
  const sourceImageSha256 = createHash("sha256").update(`source-${productKey}`).digest("hex");
  const roles: Array<{ suffix: string; roles: UsageEvidenceAsset["sceneRoles"]; sourceKind: UsageEvidenceAsset["sourceKind"] }> = [
    { suffix: "reference", roles: ["product_reveal"], sourceKind: "coupang_product_reference" },
    { suffix: "problem", roles: ["problem"], sourceKind: "exact_product_composite" },
    { suffix: "usage", roles: ["usage", "organization"], sourceKind: "exact_product_composite" },
    { suffix: "after", roles: ["after"], sourceKind: "exact_product_composite" },
    { suffix: "detail", roles: ["detail"], sourceKind: "exact_product_composite" }
  ];
  const assets = roles.map(({ suffix, roles: sceneRoles, sourceKind }): UsageEvidenceAsset => {
    const assetId = `v5-${productKey}-${suffix}`;
    const derivedSha256 = createHash("sha256").update(assetId).digest("hex");
    return {
      assetId,
      sourceId: `coupang-reference-${productKey}`,
      sourceKind,
      sourceRelativeReference: `products/${productKey}/${suffix}.png`,
      sourceSha256: sourceImageSha256,
      derivedSha256,
      derivationOperation: sourceKind === "coupang_product_reference" ? "exact_coupang_reference" : "deterministic_alpha_composite",
      useCases: [useCase],
      sceneRoles,
      categoryAllowlist: [...definition.categoryAllowlist],
      categoryBlocklist: [...definition.categoryBlocklist],
      identityType: "synthetic_product_usage_example",
      trustTier: "CODEX_REVIEWED_LOCAL_ONLY",
      sourceHumanReviewStatus: "not_available",
      derivedMachineQaStatus: options.blockCode ? "fail" : "pass",
      derivedCodexVisualReviewStatus: options.reviewStatus ?? "pass",
      humanOwnerReviewStatus: "not_requested",
      noUploadAutomationEligible: true,
      publishEligible: false,
      visualFingerprint: derivedSha256.slice(0, 16),
      sourceFingerprint: sourceImageSha256.slice(0, 16),
      dailyReuseLimit: 1,
      consecutiveReuseLimit: 1,
      createdAt: "2026-08-09T00:00:00.000Z",
      reviewedAt: "2026-08-09T00:00:00.000Z",
      safeReviewNotes: [
        "reference silhouette and major color are preserved from the exact product pixels",
        "composite scale remains consistent with surrounding storage context",
        "no face, private identifier, generated text, logo, or watermark is visible"
      ],
      blockCodes: options.blockCode ? [options.blockCode] : [],
      boundProductKey: productKey,
      sourceProductImageUrl: `https://image.coupangcdn.com/image/product/${productKey}.jpg`,
      sourceProductImageSha256: sourceImageSha256,
      generationProvider: "codex_image_skill",
      generationMode: "background_plus_exact_product_composite",
      productPixelSource: options.productPixelSource ?? "exact_coupang_reference",
      syntheticUsageExample: true,
      disclosureRequired: true,
      disclosureText: V5_SYNTHETIC_DISCLOSURE,
      identityFidelityStatus: options.blockCode ? "fail" : "pass",
      identityFidelityScore: options.identityScore ?? 1
    };
  });
  if (options.publishEligible === true) (assets[0] as unknown as { publishEligible: boolean }).publishEligible = true;
  if (options.disclosureRequired === false) delete assets[0].disclosureRequired;
  const pack: UsageEvidencePack = {
    packId: `pack-v5-${productKey}`,
    useCase,
    subUseCase: useCase,
    assetIds: assets.map((asset) => asset.assetId),
    problemAssetIds: [assets[1].assetId],
    usageAssetIds: [assets[2].assetId],
    actionAssetIds: [assets[2].assetId],
    afterAssetIds: [assets[3].assetId],
    detailAssetIds: [assets[4].assetId],
    categoryAllowlist: [...definition.categoryAllowlist],
    categoryBlocklist: [...definition.categoryBlocklist],
    dailyReuseLimit: 1,
    consecutiveReuseLimit: 1,
    sequenceFingerprint: createHash("sha256").update(productKey).digest("hex").slice(0, 24),
    noUploadAutomationEligible: true,
    publishEligible: false,
    packGeneration: "v5_product_bound_synthetic",
    trustTier: "CODEX_REVIEWED_LOCAL_ONLY",
    packKind: "product_bound_synthetic_pack",
    boundProductKey: productKey,
    canonicalProductName: `${useCase} 수납 제품 ${productKey}`,
    category: CATEGORY[useCase],
    exactProductReferenceAssetId: assets[0].assetId,
    identityFidelityScore: options.identityScore ?? 1,
    sourceImageSha256,
    syntheticDisclosureRequired: true,
    productPixelProvenance: "exact_coupang_reference"
  };
  return { assets, pack };
}

export function makeV5Registry(rows: Array<{ productKey: string; useCase: ProductBoundSyntheticUseCase }>): UsageEvidenceRegistry {
  const registry = makeUsageEvidenceRegistry({ packsPerUseCase: 2 });
  const productUseCases = new Set<string>(PRODUCT_BOUND_SYNTHETIC_USE_CASES);
  const genericUseCases = new Set<string>(GENERIC_USAGE_EVIDENCE_USE_CASES);
  const retainedPacks = registry.packs.filter((pack) => genericUseCases.has(pack.useCase));
  const retainedAssetIds = new Set(retainedPacks.flatMap((pack) => pack.assetIds));
  registry.packs = retainedPacks;
  registry.assets = registry.assets.filter((asset) => retainedAssetIds.has(asset.assetId) && !asset.useCases.some((useCase) => productUseCases.has(useCase)));
  for (const row of rows) {
    const built = makeV5Pack(row.productKey, row.useCase);
    registry.assets.push(...built.assets);
    registry.packs.push(built.pack);
  }
  registry.sourceInventory.validSources = registry.assets.length;
  return registry;
}

export function makeActive(ranked: RankedLiveProduct, rank: number): LocalQueueItem {
  const candidate = ranked.candidate;
  return {
    id: `queue-${rank}`,
    slotId: `slot-${String(rank).padStart(3, "0")}`,
    queueDate: "2026-08-09",
    queueRank: rank,
    productKey: candidate.productKey,
    productId: candidate.rawProductId,
    rawProductName: candidate.rawProductName,
    canonicalProductName: candidate.canonicalProductName,
    sourceProvider: candidate.sourceProvider,
    sourceKeyword: candidate.sourceKeyword,
    productScore: ranked.score.finalProductScore,
    scheduledAt: new Date(Date.UTC(2026, 7, 8, 15 + Math.floor((rank - 1) / 3))).toISOString(),
    status: "scheduled",
    attemptCount: 0,
    productCandidateAttempt: 0,
    maxProductCandidates: 3,
    candidateHistory: [],
    leaseOwner: "",
    leaseAcquiredAt: "",
    leaseExpiresAt: "",
    nextAttemptAt: "",
    claimedAt: "",
    startedAt: "",
    finishedAt: "",
    creativeScore: null,
    videoQualityScore: null,
    videoPath: "",
    reviewPath: "",
    errorCode: "",
    safeMessage: "",
    reviewMetadata: { codexReview: "not_executed" },
    candidate,
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
    localRevision: 1
  };
}

export function makeReserve(ranked: RankedLiveProduct): ReserveCandidate {
  return { ...ranked, insertedAt: "2026-08-09T00:00:00.000Z", claimedBySlot: "", claimedAt: "" };
}
