import { createHash } from "node:crypto";
import type { RankedLiveProduct } from "@/lib/live-product-video";
import { GENERIC_USAGE_EVIDENCE_USE_CASES, SUPPORTED_USAGE_EVIDENCE_USE_CASES, type SupportedUsageEvidenceUseCase, type UsageEvidenceAsset, type UsageEvidencePack, type UsageEvidenceRegistry } from "@/lib/usage-evidence";

const USE_CASES = [...GENERIC_USAGE_EVIDENCE_USE_CASES] as SupportedUsageEvidenceUseCase[];

export function makeUsageEvidenceRegistry(input: { packsPerUseCase?: number; sourceKind?: UsageEvidenceAsset["sourceKind"]; sharedSourceId?: string; maxSameSourceVideoDaily?: number } = {}): UsageEvidenceRegistry {
  const packsPerUseCase = input.packsPerUseCase ?? 4;
  const assets: UsageEvidenceAsset[] = [];
  const packs: UsageEvidencePack[] = [];
  for (const [useCaseIndex, useCase] of USE_CASES.entries()) {
    const definition = SUPPORTED_USAGE_EVIDENCE_USE_CASES[useCase];
    for (let packIndex = 0; packIndex < packsPerUseCase; packIndex += 1) {
      const assetIds: string[] = [];
      for (const [roleIndex, role] of (["problem", "usage", "after"] as const).entries()) {
        const key = `${useCase}-${packIndex}-${role}`;
        const assetId = `asset-${key}`;
        const digest = createHash("sha256").update(key).digest("hex");
        assetIds.push(assetId);
        assets.push({
          assetId,
          sourceId: input.sharedSourceId ?? `source-${key}`,
          sourceKind: input.sourceKind ?? "sanitized_local_image",
          sourceRelativeReference: `sanitized/${key}.jpg`,
          sourceSha256: createHash("sha256").update(`source-${key}`).digest("hex"),
          derivedSha256: digest,
          derivationOperation: input.sourceKind === "derived_frame_pack" ? "ffmpeg_scene_detected_segment_midpoint" : "none_sanitized_local_source",
          ...(input.sourceKind === "derived_frame_pack" ? { clipStartSeconds: useCaseIndex * 100 + packIndex * 10 + roleIndex, clipEndSeconds: useCaseIndex * 100 + packIndex * 10 + roleIndex } : {}),
          useCases: [useCase],
          sceneRoles: [role],
          categoryAllowlist: [...definition.categoryAllowlist],
          categoryBlocklist: [...definition.categoryBlocklist],
          identityType: "generic_usage_example",
          trustTier: "CODEX_REVIEWED_LOCAL_ONLY",
          sourceHumanReviewStatus: "not_available",
          derivedMachineQaStatus: "pass",
          derivedCodexVisualReviewStatus: "pass",
          humanOwnerReviewStatus: "not_requested",
          noUploadAutomationEligible: true,
          publishEligible: false,
          visualFingerprint: digest.slice(0, 16),
          sourceFingerprint: digest.slice(16, 32),
          dailyReuseLimit: 5,
          consecutiveReuseLimit: 2,
          createdAt: "2026-08-09T00:00:00.000Z",
          reviewedAt: "2026-08-09T00:00:00.000Z",
          safeReviewNotes: ["machine qa pass", "codex local visual review pass"],
          blockCodes: []
        });
      }
      packs.push({
        packId: `pack-${useCase}-${packIndex}`,
        useCase,
        subUseCase: useCase,
        assetIds,
        problemAssetIds: [assetIds[0]],
        usageAssetIds: [assetIds[1]],
        actionAssetIds: [assetIds[1]],
        afterAssetIds: [assetIds[2]],
        categoryAllowlist: [...definition.categoryAllowlist],
        categoryBlocklist: [...definition.categoryBlocklist],
        dailyReuseLimit: 5,
        consecutiveReuseLimit: 2,
        sequenceFingerprint: createHash("sha256").update(assetIds.join("|")).digest("hex").slice(0, 24),
        noUploadAutomationEligible: true,
        publishEligible: false
      });
    }
  }
  return {
    schemaVersion: "usage-evidence-registry-v2",
    generatedAt: "2026-08-09T00:00:00.000Z",
    visualReviewExecuted: true,
    maxUsagePackReuse: 5,
    maxSameSequenceConsecutive: 2,
    maxSameSourceVideoDaily: input.maxSameSourceVideoDaily ?? 15,
    nearDuplicateHammingThreshold: 0,
    assets,
    packs,
    sourceInventory: { reviewReportsScanned: 10, sourceVideosFound: 3, validSources: assets.length, invalidSources: 0, humanReviewedSources: 3, sanitizedLocalSources: assets.length, privacyBlocked: 0, rightsBlocked: 0, nearDuplicatesRemoved: 0 }
  };
}

export function makeRankedProducts(count = 120): RankedLiveProduct[] {
  return Array.from({ length: count }, (_, index) => {
    const useCase = USE_CASES[index % USE_CASES.length];
    const categories = useCase === "home_storage"
      ? ["홈인테리어"]
      : useCase === "kitchen_organization"
        ? ["주방용품"]
        : useCase === "camping_storage"
          ? ["스포츠/레저"]
          : useCase.startsWith("vehicle")
            ? ["\uC790\uB3D9\uCC28\uC6A9\uD488"]
            : useCase.includes("laundry")
              ? ["\uAC00\uAD6C", "\uC2A4\uD3EC\uCE20", "\uD648\uC778\uD14C\uB9AC\uC5B4"]
              : ["\uC0DD\uD65C\uC6A9\uD488", "\uBB38\uAD6C", "\uB514\uC9C0\uD138"];
    const group = categories[index % categories.length];
    const productKey = `test-product-${index}`;
    const productName = `${index} ${useCase} product`;
    return {
      candidate: {
        rawProductId: String(1_000_000 + index), rawProductName: productName, canonicalProductName: productName,
        category: group, categoryPath: `${group}>subcategory-${index}`, priceText: "12900", rawProductUrl: `https://example.invalid/product/${index}`,
        selectedAffiliateUrl: `https://link.coupang.com/a/test${index}`, productImageUrls: [`https://example.invalid/image/${index}.jpg`],
        sourceProvider: "coupang_partners_product_search", sourceRequestId: `request-${index}`, discoveredAt: "2026-08-09T00:00:00.000Z",
        sourceKeyword: `${useCase} keyword`, eventContext: { eventId: "test-event", eventName: "test event" }, candidateId: `candidate-${index}`,
        productKey, productAliases: [`alias-${index}`], productAnchors: [`anchor-${index}`], useCase
      },
      score: { productKey, eventRelevanceScore: 100, motionSuitabilityScore: 100, policySafetyScore: 100, imageReadinessScore: 100, affiliateReadinessScore: 100, duplicatePenalty: 0, usageEvidenceScore: 100, finalProductScore: 100 - (index % 10), selectionRank: index + 1, eligible: true, blockers: [] }
    };
  });
}

export function withV3MotionPack(registry: UsageEvidenceRegistry, useCase: SupportedUsageEvidenceUseCase, packIndex: number, sourceIds = [`v3-source-${useCase}-a`, `v3-source-${useCase}-b`]): UsageEvidenceRegistry {
  const definition = SUPPORTED_USAGE_EVIDENCE_USE_CASES[useCase];
  const copy = structuredClone(registry);
  const roles: UsageEvidenceAsset["sceneRoles"][] = [
    ["problem", "before"],
    ["problem"],
    ["usage", "organization"],
    ["usage", "hand_interaction"],
    ["usage", "organization", "after"],
    ["after"],
    ["usage", "after"]
  ];
  const assetIds: string[] = [];
  for (const [assetIndex, sceneRoles] of roles.entries()) {
    const key = `v3-${useCase}-${packIndex}-${assetIndex}`;
    const digest = createHash("sha256").update(key).digest("hex");
    const assetId = `asset-${key}`;
    assetIds.push(assetId);
    copy.assets.push({
      assetId,
      sourceId: sourceIds[assetIndex % sourceIds.length],
      sourceKind: "derived_clip",
      sourceRelativeReference: `sanitized/${sourceIds[assetIndex % sourceIds.length]}.mp4`,
      sourceSha256: createHash("sha256").update(`source-${sourceIds[assetIndex % sourceIds.length]}`).digest("hex"),
      derivedSha256: digest,
      derivationOperation: "ffmpeg_scene_detected_h264_motion_clip",
      clipStartSeconds: assetIndex * 2.5,
      clipEndSeconds: assetIndex * 2.5 + 2.2,
      useCases: [useCase],
      sceneRoles,
      categoryAllowlist: [...definition.categoryAllowlist],
      categoryBlocklist: [...definition.categoryBlocklist],
      identityType: "generic_usage_example",
      trustTier: "CODEX_REVIEWED_LOCAL_ONLY",
      sourceHumanReviewStatus: "not_available",
      derivedMachineQaStatus: "pass",
      derivedCodexVisualReviewStatus: "pass",
      humanOwnerReviewStatus: "not_requested",
      noUploadAutomationEligible: true,
      publishEligible: false,
      visualFingerprint: digest.slice(0, 16),
      temporalFingerprint: createHash("sha256").update(`temporal-${key}`).digest("hex"),
      motionQa: { durationSeconds: 2.2, freezeRatio: 0.1, longestFreezeSeconds: 0.2, visualChangeRatio: 0.2, blackFrameRatio: 0, blurScore: 100, frameFill: 1, motionPresent: true, decodePassed: true, textContaminationIndicator: "clear" },
      sourceFingerprint: createHash("sha256").update(`fingerprint-${sourceIds[assetIndex % sourceIds.length]}`).digest("hex").slice(0, 16),
      dailyReuseLimit: 5,
      consecutiveReuseLimit: 2,
      createdAt: "2026-08-09T00:00:00.000Z",
      reviewedAt: "2026-08-09T00:00:00.000Z",
      safeReviewNotes: ["machine motion QA pass", "Codex local visual review pass"],
      blockCodes: []
    });
  }
  copy.packs.push({
    packId: `${useCase}-v3-test-pack-${packIndex}`,
    useCase,
    subUseCase: useCase,
    assetIds,
    problemAssetIds: assetIds.slice(0, 2),
    usageAssetIds: assetIds.slice(2, 5),
    actionAssetIds: assetIds.slice(2, 5),
    afterAssetIds: assetIds.slice(4, 7),
    categoryAllowlist: [...definition.categoryAllowlist],
    categoryBlocklist: [...definition.categoryBlocklist],
    dailyReuseLimit: 5,
    consecutiveReuseLimit: 2,
    sequenceFingerprint: createHash("sha256").update(assetIds.join("|")).digest("hex").slice(0, 24),
    noUploadAutomationEligible: true,
    publishEligible: false,
    packGeneration: "v3_motion",
    trustTier: "CODEX_REVIEWED_LOCAL_ONLY",
    primarySourceId: sourceIds[0]
  });
  return copy;
}
