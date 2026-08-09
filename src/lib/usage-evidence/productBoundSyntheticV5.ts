import { createHash } from "node:crypto";
import { validateCandidateImageUrl } from "@/lib/coupang/coupangImage";
import type { RankedLiveProduct } from "@/lib/live-product-video";
import type { LocalQueueItem, ReserveCandidate } from "@/lib/queue-scheduler/types";
import type {
  UsageEvidenceAllocation,
  UsageEvidenceAsset,
  UsageEvidencePack,
  UsageEvidenceRegistry
} from "./contracts";
import { PRODUCT_BOUND_SYNTHETIC_USE_CASES } from "./taxonomy";

export type ProductBoundSyntheticUseCase = typeof PRODUCT_BOUND_SYNTHETIC_USE_CASES[number];

export const V5_PRODUCT_TARGETS = Object.freeze({
  home_storage: { category: "홈인테리어", candidateTarget: 6, minimumContribution: 4 },
  kitchen_organization: { category: "주방용품", candidateTarget: 5, minimumContribution: 4 },
  camping_storage: { category: "스포츠/레저", candidateTarget: 4, minimumContribution: 3 }
} satisfies Record<ProductBoundSyntheticUseCase, { category: string; candidateTarget: number; minimumContribution: number }>);

export const V5_UNCHANGED_POLICY_LIMITS = Object.freeze({
  maxCategoryRatio: 0.35,
  maxProductFamilyRatio: 0.10,
  maxUsagePackReuse: 5,
  assetDailyReuseLimit: 5,
  productBoundDailyReuseLimit: 1,
  productBoundConsecutiveReuseLimit: 1,
  policyThresholdChanges: 0
});

export const V5_GENERATION_BUDGET = Object.freeze({
  candidateProducts: 15,
  initialGeneratedImages: 60,
  repairGeneratedImages: 30,
  maximumGeneratedImages: 90,
  maximumLiveProviderCalls: 60,
  maximumRepairsPerScene: 1
});

export const V5_NO_DOWNSTREAM_EXECUTION = Object.freeze({
  SAFE_TO_UPLOAD: false,
  SAFE_TO_PUBLIC_UPLOAD: false,
  YOUTUBE_AUTO_UPLOAD: false,
  PUBLIC_UPLOAD: false,
  UNLISTED_UPLOAD: false,
  TIKTOK_AUTO_UPLOAD: false,
  THREADS_AUTO_POST: false,
  COMMENT_AUTOMATION: false,
  QUEUE_SCHEDULER_ENABLED: false,
  isPaused: true,
  GOOGLE_SHEETS_WRITE: 0,
  GOOGLE_DRIVE_WRITE: 0,
  R2_WRITE: 0,
  DB_WRITE: 0,
  SUPABASE_WRITE: 0,
  PRODUCTION_DB_WRITE: 0,
  FINAL_PRODUCT_VIDEO_RENDER_COUNT: 0,
  TTS_EXECUTION_COUNT: 0,
  ASR_EXECUTION_COUNT: 0,
  WHISPERX_EXECUTION_COUNT: 0,
  PLATFORM_UPLOAD: 0,
  PRODUCTION_DEPLOY: 0,
  CONTROL_RUNNER_CREATED: 0,
  EXISTING_WORKER_CHANGED: 0
});

export const V5_SYNTHETIC_DISCLOSURE = "AI 연출 사용 예시" as const;

export type CodexImageSkillReadiness = {
  CODEX_IMAGE_SKILL_READY: boolean;
  provider: "built_in_image_gen" | "unavailable";
  localReferenceInput: boolean;
  backgroundGeneration: boolean;
  outputFilePersistence: boolean;
  deterministicMetadata: boolean;
  externalCredentialsRequired: false;
  newImageApiClient: false;
  blocker: "CODEX_IMAGE_SKILL_RUNTIME_BLOCKED" | null;
};

export function assessCodexImageSkillReadiness(input: {
  builtInToolAvailable: boolean;
  localReferenceInput: boolean;
  backgroundGeneration: boolean;
  outputFilePersistence: boolean;
  deterministicMetadata: boolean;
}): CodexImageSkillReadiness {
  const ready = Object.values(input).every(Boolean);
  return {
    CODEX_IMAGE_SKILL_READY: ready,
    provider: ready ? "built_in_image_gen" : "unavailable",
    ...input,
    externalCredentialsRequired: false,
    newImageApiClient: false,
    blocker: ready ? null : "CODEX_IMAGE_SKILL_RUNTIME_BLOCKED"
  };
}

export type V5SelectedProduct = RankedLiveProduct & {
  v5UseCase: ProductBoundSyntheticUseCase;
  authoritativeImageUrl: string;
};

export function selectV5ProductCandidates(input: {
  ranked: RankedLiveProduct[];
  active?: LocalQueueItem[];
  reserve?: ReserveCandidate[];
  targets?: Partial<Record<ProductBoundSyntheticUseCase, number>>;
}): {
  selected: V5SelectedProduct[];
  byUseCase: Record<ProductBoundSyntheticUseCase, number>;
  rejected: Array<{ productKey: string; blockers: string[] }>;
} {
  const selectedKeys = new Set([
    ...(input.active ?? []).map((item) => item.productKey),
    ...(input.reserve ?? []).map((entry) => entry.candidate.productKey)
  ]);
  const seenKeys = new Set<string>();
  const seenFamilies = new Set<string>();
  const selected: V5SelectedProduct[] = [];
  const rejected: Array<{ productKey: string; blockers: string[] }> = [];
  const targets = Object.fromEntries(PRODUCT_BOUND_SYNTHETIC_USE_CASES.map((useCase) => [
    useCase,
    input.targets?.[useCase] ?? V5_PRODUCT_TARGETS[useCase].candidateTarget
  ])) as Record<ProductBoundSyntheticUseCase, number>;
  const byUseCase = Object.fromEntries(PRODUCT_BOUND_SYNTHETIC_USE_CASES.map((useCase) => [useCase, 0])) as Record<ProductBoundSyntheticUseCase, number>;

  const ordered = [...input.ranked].sort((left, right) =>
    right.score.finalProductScore - left.score.finalProductScore
    || left.candidate.productKey.localeCompare(right.candidate.productKey)
  );
  for (const entry of ordered) {
    const useCase = asProductBoundUseCase(entry.candidate.useCase);
    if (!useCase || byUseCase[useCase] >= targets[useCase]) continue;
    const blockers: string[] = [];
    const imageUrl = entry.candidate.productImageUrls.find((value) => validateCandidateImageUrl(value).ok) ?? "";
    const family = familyKey(entry.candidate.canonicalProductName, entry.candidate.categoryPath || entry.candidate.category);
    if (selectedKeys.has(entry.candidate.productKey) || seenKeys.has(entry.candidate.productKey)) blockers.push("DUPLICATE_PRODUCT");
    if (seenFamilies.has(family)) blockers.push("DUPLICATE_PRODUCT_FAMILY");
    if (!entry.candidate.canonicalProductName.trim()) blockers.push("CANONICAL_PRODUCT_NAME_MISSING");
    if (entry.candidate.productAnchors.length < 4) blockers.push("PRODUCT_ANCHORS_MISSING");
    if (entry.score.policySafetyScore !== 100) blockers.push("POLICY_BLOCKED");
    if (entry.score.imageReadinessScore !== 100 || !imageUrl) blockers.push("PRODUCT_REFERENCE_IMAGE_NOT_READY");
    if (entry.score.affiliateReadinessScore !== 100 || !entry.candidate.selectedAffiliateUrl) blockers.push("AFFILIATE_NOT_READY");
    if (entry.score.duplicatePenalty > 0) blockers.push("DUPLICATE_PRODUCT");
    if (!categoryMatchesUseCase(entry.candidate.categoryPath || entry.candidate.category, useCase)) blockers.push("CATEGORY_USE_CASE_MISMATCH");
    if (/식품|건강|의약|주류|담배|성인|무기/u.test(entry.candidate.categoryPath || entry.candidate.category)) blockers.push("HIGH_RISK_CATEGORY");
    if (blockers.length > 0) {
      rejected.push({ productKey: entry.candidate.productKey, blockers: [...new Set(blockers)] });
      continue;
    }
    selected.push({ ...entry, v5UseCase: useCase, authoritativeImageUrl: imageUrl });
    byUseCase[useCase] += 1;
    seenKeys.add(entry.candidate.productKey);
    seenFamilies.add(family);
  }
  return { selected, byUseCase, rejected };
}

export function isV5SyntheticAssetEligible(asset: UsageEvidenceAsset): boolean {
  if (asset.identityType !== "synthetic_product_usage_example") return false;
  const hashReady = /^[0-9a-f]{64}$/u.test(asset.sourceSha256)
    && /^[0-9a-f]{64}$/u.test(asset.derivedSha256)
    && /^[0-9a-f]{64}$/u.test(asset.sourceProductImageSha256 ?? "")
    && /^[0-9a-f]{16}$/u.test(asset.visualFingerprint);
  const productPresent = asset.productPixelSource !== "not_present";
  const provenanceReady = productPresent
    ? asset.productPixelSource === "exact_coupang_reference" || asset.productPixelSource === "reference_image_edit"
    : asset.sourceKind === "codex_generated_background" && asset.sceneRoles.some((role) => role === "problem" || role === "context");
  const identityReady = productPresent
    ? asset.identityFidelityStatus === "pass" && Number(asset.identityFidelityScore) >= 0.9
    : asset.identityFidelityStatus === "not_applicable";
  return Boolean(
    asset.assetId
    && asset.sourceId
    && asset.sourceRelativeReference
    && asset.boundProductKey
    && asProductBoundUseCase(asset.useCases[0])
    && hashReady
    && provenanceReady
    && identityReady
    && asset.generationProvider === "codex_image_skill"
    && asset.syntheticUsageExample === true
    && asset.disclosureRequired === true
    && asset.disclosureText === V5_SYNTHETIC_DISCLOSURE
    && asset.derivedMachineQaStatus === "pass"
    && asset.derivedCodexVisualReviewStatus === "pass"
    && asset.humanOwnerReviewStatus === "not_requested"
    && asset.noUploadAutomationEligible
    && asset.publishEligible === false
    && asset.dailyReuseLimit === 1
    && asset.consecutiveReuseLimit === 1
    && asset.blockCodes.length === 0
  );
}

export function isV5ProductBoundPackEligible(
  pack: UsageEvidencePack,
  assets: Map<string, UsageEvidenceAsset>
): boolean {
  if (pack.packKind !== "product_bound_synthetic_pack" || pack.packGeneration !== "v5_product_bound_synthetic") return false;
  if (!pack.boundProductKey || !pack.canonicalProductName || !pack.category || !pack.exactProductReferenceAssetId) return false;
  if (pack.dailyReuseLimit !== 1 || pack.consecutiveReuseLimit !== 1 || !pack.syntheticDisclosureRequired) return false;
  if (pack.productPixelProvenance !== "exact_coupang_reference" && pack.productPixelProvenance !== "reference_image_edit") return false;
  if (!Number.isFinite(pack.identityFidelityScore) || Number(pack.identityFidelityScore) < 0.9) return false;
  if (!/^[0-9a-f]{64}$/u.test(pack.sourceImageSha256 ?? "") || !pack.sequenceFingerprint) return false;
  if (!pack.noUploadAutomationEligible || pack.publishEligible !== false || pack.assetIds.length < 5 || new Set(pack.assetIds).size !== pack.assetIds.length) return false;
  const selected = pack.assetIds.map((assetId) => assets.get(assetId));
  if (selected.some((asset) => !asset || !isV5SyntheticAssetEligible(asset))) return false;
  const typed = selected.filter((asset): asset is UsageEvidenceAsset => Boolean(asset));
  if (typed.some((asset) => asset.boundProductKey !== pack.boundProductKey || !asset.useCases.includes(pack.useCase))) return false;
  const productPresent = typed.filter((asset) => asset.productPixelSource !== "not_present");
  const problemReady = pack.problemAssetIds.some((id) => pack.assetIds.includes(id));
  const usageReady = [...pack.usageAssetIds, ...pack.actionAssetIds].some((id) => pack.assetIds.includes(id));
  const afterReady = pack.afterAssetIds.some((id) => pack.assetIds.includes(id));
  const detailReady = (pack.detailAssetIds ?? []).some((id) => pack.assetIds.includes(id));
  return productPresent.length >= 3
    && pack.assetIds.includes(pack.exactProductReferenceAssetId)
    && problemReady
    && usageReady
    && afterReady
    && detailReady;
}

export function validateProductBoundPackForCandidate(pack: UsageEvidencePack, productKey: string): {
  matched: boolean;
  blocker: "PRODUCT_BOUND_USAGE_PACK_MISMATCH" | null;
} {
  const matched = pack.packKind !== "product_bound_synthetic_pack" || pack.boundProductKey === productKey;
  return { matched, blocker: matched ? null : "PRODUCT_BOUND_USAGE_PACK_MISMATCH" };
}

export type V5MarginalPackResult = {
  packId: string;
  productKey: string;
  useCase: string;
  activeGain: number;
  reserveGain: number;
  distinctGain: number;
  categoryImpact: number;
  familyImpact: number;
  identityScore: number;
  selected: boolean;
  zeroGainReason: string | null;
};

export function selectMinimalPositiveV5Packs(input: {
  registry: UsageEvidenceRegistry;
  candidates: RankedLiveProduct[];
  active: LocalQueueItem[];
  reserve: ReserveCandidate[];
  dailyTargetCount?: number;
  minimumReserveCount?: number;
  maxCategoryRatio?: number;
  maxProductFamilyRatio?: number;
}) {
  const dailyTargetCount = input.dailyTargetCount ?? 69;
  const minimumReserveCount = input.minimumReserveCount ?? 14;
  const categoryLimit = Math.floor(dailyTargetCount * (input.maxCategoryRatio ?? V5_UNCHANGED_POLICY_LIMITS.maxCategoryRatio));
  const familyLimit = Math.floor(dailyTargetCount * (input.maxProductFamilyRatio ?? V5_UNCHANGED_POLICY_LIMITS.maxProductFamilyRatio));
  const candidateByKey = new Map(input.candidates.map((entry) => [entry.candidate.productKey, entry]));
  const assets = new Map(input.registry.assets.map((asset) => [asset.assetId, asset]));
  const activeKeys = new Set(input.active.map((item) => item.productKey));
  const reserveKeys = new Set(input.reserve.map((entry) => entry.candidate.productKey));
  const categoryCounts = count(input.active.map((item) => categoryKey(item.candidate.categoryPath || item.candidate.category)));
  const familyCounts = count(input.active.map((item) => familyKey(item.candidate.canonicalProductName, item.candidate.categoryPath || item.candidate.category)));
  const rows: V5MarginalPackResult[] = [];
  const selectedPackIds: string[] = [];
  let active = input.active.length;
  let distinct = new Set([...activeKeys, ...reserveKeys]).size;

  const packs = input.registry.packs
    .filter((pack) => pack.packKind === "product_bound_synthetic_pack")
    .sort((left, right) => {
      const leftCandidate = candidateByKey.get(left.boundProductKey ?? "");
      const rightCandidate = candidateByKey.get(right.boundProductKey ?? "");
      return Number(right.identityFidelityScore ?? 0) - Number(left.identityFidelityScore ?? 0)
        || Number(rightCandidate?.score.finalProductScore ?? 0) - Number(leftCandidate?.score.finalProductScore ?? 0)
        || left.packId.localeCompare(right.packId);
    });
  for (const pack of packs) {
    const productKey = pack.boundProductKey ?? "";
    const candidate = candidateByKey.get(productKey);
    let zeroGainReason: string | null = null;
    if (!candidate) zeroGainReason = "PRODUCT_NOT_PRESENT_IN_LIVE_CANDIDATES";
    else if (!isV5ProductBoundPackEligible(pack, assets)) zeroGainReason = "SYNTHETIC_PACK_QA_FAILED";
    else if (activeKeys.has(productKey) || reserveKeys.has(productKey)) zeroGainReason = "DUPLICATE_PRODUCT";
    else if (candidate.score.policySafetyScore !== 100 || candidate.score.imageReadinessScore !== 100 || candidate.score.affiliateReadinessScore !== 100) zeroGainReason = "PRODUCT_NOT_POLICY_IMAGE_AFFILIATE_READY";
    const category = candidate ? categoryKey(candidate.candidate.categoryPath || candidate.candidate.category) : "";
    const family = candidate ? familyKey(candidate.candidate.canonicalProductName, candidate.candidate.categoryPath || candidate.candidate.category) : "";
    if (!zeroGainReason && (categoryCounts.get(category) ?? 0) >= categoryLimit) zeroGainReason = "CATEGORY_CAP_REACHED";
    if (!zeroGainReason && (familyCounts.get(family) ?? 0) >= familyLimit) zeroGainReason = "FAMILY_CAP_REACHED";
    if (!zeroGainReason && active >= dailyTargetCount) zeroGainReason = "DAILY_TARGET_ALREADY_REACHED";
    const selected = zeroGainReason === null;
    if (selected) {
      active += 1;
      distinct += 1;
      activeKeys.add(productKey);
      increment(categoryCounts, category);
      increment(familyCounts, family);
      selectedPackIds.push(pack.packId);
    }
    rows.push({
      packId: pack.packId,
      productKey,
      useCase: pack.useCase,
      activeGain: selected ? 1 : 0,
      reserveGain: 0,
      distinctGain: selected ? 1 : 0,
      categoryImpact: selected ? categoryCounts.get(category) ?? 0 : 0,
      familyImpact: selected ? familyCounts.get(family) ?? 0 : 0,
      identityScore: Number(pack.identityFidelityScore ?? 0),
      selected,
      zeroGainReason
    });
  }
  return {
    baselineActive: input.active.length,
    baselineReserve: input.reserve.length,
    baselineDistinct: new Set([...input.active.map((item) => item.productKey), ...input.reserve.map((entry) => entry.candidate.productKey)]).size,
    predictedActive: active,
    predictedReserve: input.reserve.length,
    predictedDistinct: distinct,
    selectedPackIds,
    selectedPackCount: selectedPackIds.length,
    categoryLimit,
    familyLimit,
    rows,
    pass: active >= dailyTargetCount && input.reserve.length >= minimumReserveCount && distinct >= dailyTargetCount + minimumReserveCount
  };
}

export function buildProductBoundAllocation(input: {
  pack: UsageEvidencePack;
  assets: Map<string, UsageEvidenceAsset>;
  productKey: string;
}): UsageEvidenceAllocation {
  if (!validateProductBoundPackForCandidate(input.pack, input.productKey).matched) throw new Error("PRODUCT_BOUND_USAGE_PACK_MISMATCH");
  const problem = input.pack.problemAssetIds.find((assetId) => input.assets.has(assetId));
  const usage = [...input.pack.usageAssetIds, ...input.pack.actionAssetIds].find((assetId) => input.assets.has(assetId));
  const after = input.pack.afterAssetIds.find((assetId) => input.assets.has(assetId));
  if (!problem || !usage || !after || new Set([problem, usage, after]).size !== 3) throw new Error("SYNTHETIC_PACK_ROLE_COVERAGE_FAILED");
  const selected = [problem, usage, after];
  return {
    productKey: input.productKey,
    useCase: input.pack.useCase,
    packId: input.pack.packId,
    assetIds: selected,
    sequenceFingerprint: `${input.pack.sequenceFingerprint}:${selected.join(":")}`,
    sourceIds: [...new Set(selected.map((assetId) => input.assets.get(assetId)?.sourceId).filter((value): value is string => Boolean(value)))]
  };
}

export function buildV5BackgroundPrompt(useCase: ProductBoundSyntheticUseCase, role: "problem_context" | "usage_background" | "organized_after" | "detail_background") {
  const scene = {
    home_storage: {
      problem_context: "A naturally cluttered but clean Korean apartment closet or entryway storage area, with an open clear placement zone in the lower center.",
      usage_background: "A realistic Korean apartment wardrobe shelf or entryway cabinet with an empty, unobstructed placement zone in the lower center.",
      organized_after: "A clean organized wardrobe or entryway storage area with visibly improved free space and an empty placement zone in the lower center.",
      detail_background: "A neutral home storage detail setting with a clean floor and soft wall, reserved product placement zone centered."
    },
    kitchen_organization: {
      problem_context: "A naturally cluttered but hygienic Korean kitchen sink cabinet, pantry, or shelf with an open product placement zone in the lower center.",
      usage_background: "A realistic Korean kitchen shelf or pantry with an empty, unobstructed placement zone in the lower center.",
      organized_after: "A clean organized kitchen storage space with improved workflow and an empty placement zone in the lower center.",
      detail_background: "A neutral kitchen detail setting with clean counter and wall, reserved product placement zone centered."
    },
    camping_storage: {
      problem_context: "Camping gear arranged loosely in a safe campsite storage area, no vehicle plate, with an open product placement zone in the lower center.",
      usage_background: "A realistic campsite or neutral car-camping storage setting with an empty unobstructed placement zone in the lower center, no visible plate.",
      organized_after: "An organized portable camping gear storage scene with an empty placement zone in the lower center and clear improved order.",
      detail_background: "A neutral outdoor camping detail surface with soft natural light and a reserved product placement zone centered."
    }
  }[useCase][role];
  return [
    "Use case: photorealistic-natural",
    "Asset type: product-bound synthetic commerce background plate",
    `Primary request: ${scene}`,
    "Composition/framing: vertical 9:16, realistic perspective, product placement area must stay empty and unobstructed.",
    "Lighting/mood: soft realistic commerce lighting, honest scale cues, clean but not sterile.",
    "Constraints: background plate only; do not draw or imply a specific product; no text; no logos; no watermark; no visible face; no address; no license plate; no receipt or invoice; no private UI; brand-neutral objects.",
    "Avoid: containers or organizers occupying the reserved placement zone, distorted hands, labels, packaging, branded goods, floating objects."
  ].join("\n");
}

export function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

export function asProductBoundUseCase(value: string): ProductBoundSyntheticUseCase | null {
  return (PRODUCT_BOUND_SYNTHETIC_USE_CASES as readonly string[]).includes(value) ? value as ProductBoundSyntheticUseCase : null;
}

function categoryMatchesUseCase(value: string, useCase: ProductBoundSyntheticUseCase) {
  const normalized = normalize(value);
  if (useCase === "home_storage") return normalized.includes("홈인테리어") || normalized.includes("가구/홈");
  if (useCase === "kitchen_organization") return normalized.includes("주방");
  return normalized.includes("스포츠/레저") || normalized.includes("캠핑");
}

function categoryKey(value: string) {
  const top = value.split(/[>/]/u)[0] || "uncategorized";
  const normalized = normalize(top);
  if (normalized.includes("가구/홈인테리어") || normalized === "홈인테리어") return "홈인테리어";
  if (normalized.includes("스포츠/레저")) return "스포츠/레저";
  return top.trim() || "uncategorized";
}

function familyKey(name: string, category: string) {
  return `${categoryKey(category)}:${normalize(name).slice(0, 28)}`;
}

function normalize(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, "");
}

function count(values: string[]) {
  const result = new Map<string, number>();
  for (const value of values) increment(result, value);
  return result;
}

function increment(values: Map<string, number>, key: string) {
  values.set(key, (values.get(key) ?? 0) + 1);
}
