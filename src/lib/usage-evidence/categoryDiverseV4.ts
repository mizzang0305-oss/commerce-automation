import type { RankedLiveProduct } from "@/lib/live-product-video";
import type { LocalQueueItem, ReserveCandidate } from "@/lib/queue-scheduler/types";
import type { UsageEvidenceRegistry } from "./contracts";

export const V4_CAPPED_USE_CASES = Object.freeze([
  "vehicle_console_organization",
  "vehicle_cabin_storage",
  "vehicle_organization",
  "cable_organization",
  "desk_organization",
  "laundry_space_organization",
  "laundry_drying"
] as const);

export const V4_USE_CASE_PROPOSALS = Object.freeze({
  kitchen_organization: {
    categoryPatterns: ["주방"],
    keywords: ["싱크대 정리함", "주방 수납 선반", "냉장고 정리 용기"],
    mediaAcquisitionDifficulty: 1
  },
  home_storage: {
    categoryPatterns: ["홈인테리어", "가구/홈인테리어"],
    keywords: ["옷장 수납 정리", "현관 수납 정리", "리빙박스 수납 정리"],
    mediaAcquisitionDifficulty: 1
  },
  camping_storage: {
    categoryPatterns: ["스포츠/레저", "스포츠/레저용품"],
    keywords: ["캠핑 수납 가방", "캠핑용품 정리함", "아웃도어 수납 박스"],
    mediaAcquisitionDifficulty: 2
  },
  office_stationery_organization: {
    categoryPatterns: ["문구/오피스", "문구/사무용품"],
    keywords: ["문구 데스크 정리", "서류 수납 정리", "오피스 소품 정리함"],
    mediaAcquisitionDifficulty: 1
  },
  digital_accessory_organization: {
    categoryPatterns: ["가전디지털"],
    keywords: ["전자기기 수납 파우치", "디지털 액세서리 정리", "소형기기 수납 가방"],
    mediaAcquisitionDifficulty: 1
  },
  travel_organization: {
    categoryPatterns: ["패션잡화", "여행"],
    keywords: ["여행 파우치 정리", "캐리어 수납 파우치", "여행용품 정리 가방"],
    mediaAcquisitionDifficulty: 1
  }
} as const);

export type V4ProposedUseCase = keyof typeof V4_USE_CASE_PROPOSALS;

export const V4_UNCHANGED_POLICY_LIMITS = Object.freeze({
  maxCategoryRatio: 0.35,
  maxProductFamilyRatio: 0.10,
  maxUsagePackReuse: 5,
  assetDailyReuseLimit: 5,
  maxSameSequenceConsecutive: 2,
  policyThresholdChanges: 0
});

export const V4_NO_DOWNSTREAM_EXECUTION = Object.freeze({
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
  FINAL_VIDEO_RENDER_COUNT: 0,
  TTS_EXECUTION_COUNT: 0,
  ASR_EXECUTION_COUNT: 0,
  WHISPERX_EXECUTION_COUNT: 0,
  PLATFORM_UPLOAD: 0,
  PRODUCTION_DEPLOY: 0,
  CONTROL_RUNNER_CREATED: 0,
  EXISTING_WORKER_CHANGED: 0
});

export type CategoryOpportunity = {
  categoryKey: string;
  policyEligibleCandidates: number;
  uniqueCandidates: number;
  imageReadyCandidates: number;
  affiliateReadyCandidates: number;
  fullyReadyCandidates: number;
  currentlyActive: number;
  currentlyReserve: number;
  currentCap: number;
  remainingHeadroom: number;
  currentUsageEvidenceSupported: number;
  usageEvidenceBlocked: number;
  unsupportedUseCaseCount: number;
  potentialActiveGain: number;
  potentialReserveGain: number;
  candidateKeywords: string[];
  recommendedUseCases: V4ProposedUseCase[];
  mediaCoverageStatus: "existing_compatible" | "owner_media_required" | "not_applicable";
  highRiskPolicyCategory: boolean;
  genericUsageRepresentable: boolean;
  selected: boolean;
};

export function buildCategoryOpportunityMatrix(input: {
  ranked: RankedLiveProduct[];
  active: LocalQueueItem[];
  reserve: ReserveCandidate[];
  dailyTargetCount?: number;
  maxCategoryRatio?: number;
  locallyCoveredUseCases?: string[];
}) {
  const dailyTargetCount = input.dailyTargetCount ?? 69;
  const currentCap = Math.floor(dailyTargetCount * (input.maxCategoryRatio ?? V4_UNCHANGED_POLICY_LIMITS.maxCategoryRatio));
  const activeKeys = new Set(input.active.map((item) => item.productKey));
  const reserveKeys = new Set(input.reserve.map((entry) => entry.candidate.productKey));
  const selectedKeys = new Set([...activeKeys, ...reserveKeys]);
  const activeCounts = countCategories(input.active.map((item) => item.candidate.category));
  const reserveCounts = countCategories(input.reserve.map((entry) => entry.candidate.category));
  const deduped = dedupeRanked(input.ranked);
  const categoryKeys = new Set([
    ...deduped.map((entry) => canonicalCategory(entry.candidate.category || entry.candidate.categoryPath)),
    ...activeCounts.keys(),
    ...reserveCounts.keys()
  ]);
  const locallyCovered = new Set(input.locallyCoveredUseCases ?? []);
  const categories: CategoryOpportunity[] = [...categoryKeys].filter(Boolean).map((categoryKey) => {
    const rows = deduped.filter((entry) => canonicalCategory(entry.candidate.category || entry.candidate.categoryPath) === categoryKey);
    const newRows = rows.filter((entry) => !selectedKeys.has(entry.candidate.productKey));
    const policyReady = newRows.filter(isPolicyReady);
    const imageReady = policyReady.filter((entry) => entry.score.imageReadinessScore === 100);
    const affiliateReady = policyReady.filter((entry) => entry.score.affiliateReadinessScore === 100);
    const fullyReady = policyReady.filter((entry) => entry.score.imageReadinessScore === 100 && entry.score.affiliateReadinessScore === 100);
    const currentlyActive = activeCounts.get(categoryKey) ?? 0;
    const currentlyReserve = reserveCounts.get(categoryKey) ?? 0;
    const remainingHeadroom = Math.max(0, currentCap - currentlyActive);
    const recommendedUseCases = proposedUseCasesForCategory(categoryKey);
    const highRiskPolicyCategory = /식품|건강|의약|주류|담배|성인|무기/u.test(categoryKey);
    const genericUsageRepresentable = recommendedUseCases.length > 0 && !highRiskPolicyCategory;
    const potentialActiveGain = Math.min(remainingHeadroom, fullyReady.length);
    const selected = remainingHeadroom > 0
      && policyReady.length >= 4
      && imageReady.length >= 4
      && affiliateReady.length >= 4
      && fullyReady.length >= 4
      && !highRiskPolicyCategory
      && genericUsageRepresentable;
    const existingCompatible = recommendedUseCases.some((useCase) => locallyCovered.has(useCase));
    return {
      categoryKey,
      policyEligibleCandidates: policyReady.length,
      uniqueCandidates: newRows.length,
      imageReadyCandidates: imageReady.length,
      affiliateReadyCandidates: affiliateReady.length,
      fullyReadyCandidates: fullyReady.length,
      currentlyActive,
      currentlyReserve,
      currentCap,
      remainingHeadroom,
      currentUsageEvidenceSupported: rows.filter((entry) => entry.candidate.useCase !== "unsupported").length,
      usageEvidenceBlocked: fullyReady.filter((entry) => entry.candidate.useCase === "unsupported" || entry.score.blockers.includes("USAGE_EVIDENCE_NOT_AVAILABLE")).length,
      unsupportedUseCaseCount: rows.filter((entry) => entry.candidate.useCase === "unsupported").length,
      potentialActiveGain,
      potentialReserveGain: Math.max(0, fullyReady.length - potentialActiveGain),
      candidateKeywords: [...new Set(rows.map((entry) => entry.candidate.sourceKeyword).filter(Boolean))].sort(),
      recommendedUseCases,
      mediaCoverageStatus: recommendedUseCases.length === 0 ? "not_applicable" : existingCompatible ? "existing_compatible" : "owner_media_required",
      highRiskPolicyCategory,
      genericUsageRepresentable,
      selected
    } satisfies CategoryOpportunity;
  }).sort((left, right) => right.potentialActiveGain - left.potentialActiveGain
    || right.policyEligibleCandidates - left.policyEligibleCandidates
    || right.remainingHeadroom - left.remainingHeadroom
    || minimumMediaDifficulty(left.recommendedUseCases) - minimumMediaDifficulty(right.recommendedUseCases)
    || left.categoryKey.localeCompare(right.categoryKey, "ko"));
  const selectedCategories = categories.filter((entry) => entry.selected);
  return {
    schemaVersion: "category-opportunity-matrix-v4",
    sourceCandidateCount: input.ranked.length,
    authoritativeUniqueCandidates: deduped.length,
    dailyTargetCount,
    maxCategoryRatio: input.maxCategoryRatio ?? V4_UNCHANGED_POLICY_LIMITS.maxCategoryRatio,
    categoryCap: currentCap,
    categories,
    selectedCategoryKeys: selectedCategories.map((entry) => entry.categoryKey),
    potentialAllocatableCandidates: selectedCategories.reduce((sum, entry) => sum + entry.potentialActiveGain + entry.potentialReserveGain, 0),
    stopEarlyReady: selectedCategories.length >= 3
      && selectedCategories.every((entry) => entry.policyEligibleCandidates >= 4)
      && selectedCategories.reduce((sum, entry) => sum + entry.potentialActiveGain + entry.potentialReserveGain, 0) >= 25,
    policyThresholdChanges: 0
  };
}

export function buildUnassignedSourceOpportunity(input: {
  registry: UsageEvidenceRegistry;
  targetUseCases: V4ProposedUseCase[];
}) {
  const assetsBySource = new Map<string, UsageEvidenceRegistry["assets"]>();
  const usedAssetIds = new Set(input.registry.packs.flatMap((pack) => pack.assetIds));
  for (const asset of input.registry.assets) {
    const rows = assetsBySource.get(asset.sourceId) ?? [];
    rows.push(asset);
    assetsBySource.set(asset.sourceId, rows);
  }
  const sources = [...assetsBySource.entries()].map(([sourceId, assets]) => {
    const usedAssets = assets.filter((asset) => usedAssetIds.has(asset.assetId));
    const useCases = [...new Set(assets.flatMap((asset) => asset.useCases))].sort();
    const compatibleUseCases = input.targetUseCases.filter((useCase) => useCases.includes(useCase));
    const privacyBlocked = assets.some((asset) => asset.blockCodes.includes("USAGE_ASSET_PRIVACY_RISK"));
    const rightsBlocked = assets.some((asset) => asset.blockCodes.includes("USAGE_ASSET_RIGHTS_UNCLEAR"));
    const staticBlocked = assets.every((asset) => asset.motionQa?.motionPresent === false || asset.derivedMachineQaStatus !== "pass");
    return {
      sourceId,
      relativeReferences: [...new Set(assets.map((asset) => asset.sourceRelativeReference))].sort(),
      categoryUseCaseCandidates: useCases,
      durationSeconds: round(Math.max(0, ...assets.map((asset) => (asset.clipEndSeconds ?? 0) - (asset.clipStartSeconds ?? 0)))),
      motionAvailable: assets.some((asset) => asset.motionQa?.motionPresent === true),
      privacyStatus: privacyBlocked ? "blocked" : "pass",
      rightsStatus: rightsBlocked ? "blocked" : "pass",
      currentRegistryUse: true,
      currentPackUse: usedAssets.length,
      unusedAssetCount: assets.length - usedAssets.length,
      newCategoryCompatibility: compatibleUseCases,
      expectedRoleCoverage: [...new Set(assets.flatMap((asset) => asset.sceneRoles))].sort(),
      codexReviewRequired: assets.some((asset) => asset.derivedCodexVisualReviewStatus !== "pass"),
      potentialMarginalGain: compatibleUseCases.length > 0 && !privacyBlocked && !rightsBlocked && !staticBlocked ? 1 : 0,
      staticBlocked
    };
  }).sort((left, right) => right.potentialMarginalGain - left.potentialMarginalGain || left.sourceId.localeCompare(right.sourceId));
  return {
    schemaVersion: "unassigned-source-opportunity-v4",
    validSourceCount: sources.filter((source) => source.privacyStatus === "pass" && source.rightsStatus === "pass" && !source.staticBlocked).length,
    unassignedValidSources: sources.filter((source) => source.currentPackUse === 0 && source.privacyStatus === "pass" && source.rightsStatus === "pass" && !source.staticBlocked).length,
    newCategoryCompatibleSources: sources.filter((source) => source.newCategoryCompatibility.length > 0).length,
    selectedSources: sources.filter((source) => source.potentialMarginalGain > 0).map((source) => source.sourceId),
    rejectedPrivacy: sources.filter((source) => source.privacyStatus === "blocked").length,
    rejectedRights: sources.filter((source) => source.rightsStatus === "blocked").length,
    rejectedStatic: sources.filter((source) => source.staticBlocked).length,
    sources
  };
}

export type OwnerSanitizedMediaManifest = {
  schemaVersion: "owner-sanitized-media-intake-v1";
  sourceId: string;
  ownerProvided: true;
  rightsConfirmed: true;
  privacyConfirmed: true;
  brandNeutralConfirmed: true;
  allowedUseCases: string[];
  sourceHumanReviewStatus: "not_available";
  humanOwnerReviewStatus: "not_requested";
  publishEligible: false;
  noUploadAutomationCandidate: true;
};

export function validateOwnerSanitizedMediaManifest(value: unknown) {
  const blockers: string[] = [];
  const manifest = value && typeof value === "object" ? value as Partial<OwnerSanitizedMediaManifest> : {};
  if (manifest.schemaVersion !== "owner-sanitized-media-intake-v1") blockers.push("OWNER_MEDIA_INTAKE_SCHEMA_INVALID");
  if (!manifest.sourceId?.trim()) blockers.push("OWNER_MEDIA_SOURCE_ID_REQUIRED");
  if (manifest.ownerProvided !== true) blockers.push("OWNER_MEDIA_OWNER_PROVIDED_REQUIRED");
  if (manifest.rightsConfirmed !== true) blockers.push("OWNER_MEDIA_RIGHTS_NOT_CONFIRMED");
  if (manifest.privacyConfirmed !== true) blockers.push("OWNER_MEDIA_PRIVACY_NOT_CONFIRMED");
  if (manifest.brandNeutralConfirmed !== true) blockers.push("OWNER_MEDIA_BRAND_NEUTRAL_NOT_CONFIRMED");
  if (!Array.isArray(manifest.allowedUseCases) || manifest.allowedUseCases.length === 0) blockers.push("OWNER_MEDIA_USE_CASE_REQUIRED");
  if (manifest.sourceHumanReviewStatus !== "not_available") blockers.push("OWNER_MEDIA_SOURCE_HUMAN_REVIEW_INVALID");
  if (manifest.humanOwnerReviewStatus !== "not_requested") blockers.push("OWNER_MEDIA_HUMAN_REVIEW_MUST_NOT_BE_PROMOTED");
  if (manifest.publishEligible !== false) blockers.push("OWNER_MEDIA_PUBLISH_MUST_REMAIN_FALSE");
  if (manifest.noUploadAutomationCandidate !== true) blockers.push("OWNER_MEDIA_NO_UPLOAD_CANDIDATE_REQUIRED");
  return { valid: blockers.length === 0, blockers, humanOwnerReviewPromoted: false };
}

export function evaluateNewUseCaseRegistration(input: {
  useCase: string;
  categoryHeadroom: number;
  liveCandidateUniqueCount: number;
  keywordCount: number;
  sourceMediaCount: number;
  distinctSourceIds: number;
  packCount: number;
  uniqueAssetsPerPack: number;
  problemRoleAssets: number;
  usageActionRoleAssets: number;
  afterRoleAssets: number;
  codexReviewPassed: boolean;
  marginalAllocatableGain: number;
}) {
  const blockers: string[] = [];
  if (input.liveCandidateUniqueCount < 4) blockers.push("V4_USE_CASE_LIVE_CANDIDATES_INSUFFICIENT");
  if (input.categoryHeadroom < 1) blockers.push("V4_USE_CASE_CATEGORY_CAPPED");
  if (input.keywordCount < 1) blockers.push("V4_USE_CASE_KEYWORD_PLAN_REQUIRED");
  if (input.sourceMediaCount < 2 || input.distinctSourceIds < 2) blockers.push("V4_USE_CASE_TWO_SOURCES_REQUIRED");
  if (input.packCount < 2) blockers.push("V4_USE_CASE_TWO_PACKS_REQUIRED");
  if (input.uniqueAssetsPerPack < 7) blockers.push("V4_PACK_SEVEN_ASSETS_REQUIRED");
  if (input.problemRoleAssets < 2) blockers.push("V4_PACK_PROBLEM_ROLE_INSUFFICIENT");
  if (input.usageActionRoleAssets < 3) blockers.push("V4_PACK_USAGE_ROLE_INSUFFICIENT");
  if (input.afterRoleAssets < 2) blockers.push("V4_PACK_AFTER_ROLE_INSUFFICIENT");
  if (!input.codexReviewPassed) blockers.push("V4_CODEX_VISUAL_REVIEW_REQUIRED");
  if (input.marginalAllocatableGain <= 0) blockers.push("V4_POSITIVE_MARGINAL_GAIN_REQUIRED");
  return { useCase: input.useCase, supported: blockers.length === 0, blockers };
}

export type V4MarginalPack = {
  packId: string;
  useCase: string;
  categoryKey: string;
  activeGain: number;
  reserveGain: number;
  distinctGain: number;
  categoryHeadroomUsed: number;
  familyImpact: number;
  assetPressure: number;
  sourcePressure: number;
  sequenceImpact: number;
};

export function selectPositiveV4MarginalPacks(input: {
  packs: V4MarginalPack[];
  baseline: { active: number; reserve: number; distinct: number };
  targets?: { active: number; reserve: number; distinct: number };
}) {
  const targets = input.targets ?? { active: 69, reserve: 14, distinct: 83 };
  const selected: V4MarginalPack[] = [];
  const zeroGainOmitted = input.packs.filter((pack) => pack.activeGain <= 0).map((pack) => ({ ...pack, selected: false, zeroGainReason: "NO_POSITIVE_LIVE_ACTIVE_GAIN" as const }));
  let state = { ...input.baseline };
  const positive = input.packs.filter((pack) => pack.activeGain > 0).sort((left, right) => right.activeGain - left.activeGain
    || right.reserveGain - left.reserveGain
    || left.sourcePressure - right.sourcePressure
    || left.packId.localeCompare(right.packId));
  for (const pack of positive) {
    if (state.active >= targets.active && state.reserve >= targets.reserve && state.distinct >= targets.distinct) break;
    selected.push(pack);
    state = {
      active: Math.min(targets.active, state.active + pack.activeGain),
      reserve: state.reserve + pack.reserveGain,
      distinct: state.distinct + pack.distinctGain
    };
  }
  return {
    selectedPackIds: selected.map((pack) => pack.packId),
    selected,
    zeroGainOmitted,
    final: state,
    result: state.active >= targets.active && state.reserve >= targets.reserve && state.distinct >= targets.distinct ? "TARGET_REACHED" : selected.length > 0 ? "POSITIVE_GAIN_EXHAUSTED" : "NO_POSITIVE_GAIN"
  };
}

export function shouldRunV4SecondScout(input: { run1TargetReached: boolean; hardAcceptancePassed: boolean }) {
  return input.run1TargetReached && input.hardAcceptancePassed;
}

export function buildOwnerMediaRequestMatrix(opportunities: CategoryOpportunity[], activeShortfall = 11) {
  const selected = opportunities.filter((entry) => entry.selected && entry.recommendedUseCases.length > 0);
  const contributionPlan = [4, 4, 3];
  let remaining = activeShortfall;
  const requests = selected.map((entry, index) => {
    const useCase = entry.recommendedUseCases[0];
    const expectedActiveGain = Math.min(entry.potentialActiveGain, contributionPlan[index] ?? 3, remaining);
    remaining = Math.max(0, remaining - expectedActiveGain);
    return {
      useCase,
      topLevelCategory: entry.categoryKey,
      expectedActiveGain,
      expectedReserveGain: 0,
      requiredSourceCount: 3,
      requiredClipCount: 14,
      requiredRoles: { problem: 4, usageOrAction: 6, after: 4 },
      minimumDurationSeconds: 6,
      recommendedDurationSeconds: "10-30",
      exampleShotList: ["정리 전 문제 공간", "손으로 물건을 배치하거나 수납하는 동작", "정리 후 확보된 공간"],
      privacyRestrictions: ["얼굴", "주소", "전화번호", "송장", "주문서", "계정 화면", "개인 메시지", "차량 번호판"],
      rightsRequirement: "ownerProvided=true, rightsConfirmed=true, privacyConfirmed=true, brandNeutralConfirmed=true",
      folderName: useCase,
      manifestSchemaVersion: "owner-sanitized-media-intake-v1",
      publishEligible: false,
      humanOwnerReviewStatus: "not_requested"
    };
  });
  return { schemaVersion: "owner-sanitized-media-request-matrix-v1", activeShortfall, plannedActiveGain: requests.reduce((sum, request) => sum + request.expectedActiveGain, 0), requests };
}

export function categoryOpportunityKeywords() {
  return Object.entries(V4_USE_CASE_PROPOSALS).flatMap(([useCase, definition]) => definition.keywords.map((keyword) => ({ useCase: useCase as V4ProposedUseCase, keyword }))).slice(0, 20);
}

function proposedUseCasesForCategory(categoryKey: string): V4ProposedUseCase[] {
  return (Object.entries(V4_USE_CASE_PROPOSALS) as Array<[V4ProposedUseCase, typeof V4_USE_CASE_PROPOSALS[V4ProposedUseCase]]>)
    .filter(([, definition]) => definition.categoryPatterns.some((pattern) => categoryKey.includes(pattern)))
    .map(([useCase]) => useCase);
}

function minimumMediaDifficulty(useCases: V4ProposedUseCase[]) {
  return Math.min(99, ...useCases.map((useCase) => V4_USE_CASE_PROPOSALS[useCase].mediaAcquisitionDifficulty));
}

function isPolicyReady(entry: RankedLiveProduct) {
  return entry.score.duplicatePenalty === 0
    && entry.score.policySafetyScore === 100
    && entry.score.eventRelevanceScore >= 60
    && entry.score.motionSuitabilityScore >= 60;
}

function dedupeRanked(ranked: RankedLiveProduct[]) {
  const keys = new Set<string>();
  const names = new Set<string>();
  const rows: RankedLiveProduct[] = [];
  for (const entry of ranked) {
    const name = entry.candidate.canonicalProductName.normalize("NFKC").toLowerCase().replace(/\s+/gu, "");
    if (keys.has(entry.candidate.productKey) || names.has(name)) continue;
    keys.add(entry.candidate.productKey);
    names.add(name);
    rows.push(entry);
  }
  return rows;
}

function canonicalCategory(value: string) {
  const normalized = value.normalize("NFKC").trim();
  if (/자동차|차량/u.test(normalized)) return "자동차용품";
  if (/생활/u.test(normalized)) return "생활용품";
  if (/주방/u.test(normalized)) return "주방용품";
  if (/문구|사무|오피스/u.test(normalized)) return "문구/오피스";
  if (/홈인테리어|가구/u.test(normalized)) return "홈인테리어";
  if (/스포츠|레저|캠핑/u.test(normalized)) return "스포츠/레저";
  if (/가전|디지털|컴퓨터/u.test(normalized)) return "가전디지털";
  if (/여행|패션잡화/u.test(normalized)) return "패션잡화";
  if (/출산|유아/u.test(normalized)) return "출산/유아동";
  return normalized || "미분류";
}

function countCategories(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = canonicalCategory(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
