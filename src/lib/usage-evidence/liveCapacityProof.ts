import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import {
  buildCoupangPartnersSearchRequest,
  readCoupangPartnersEnv,
  type CoupangPartnersLiveRequestBlocker
} from "@/lib/coupang/partnersAuthConfig";
import type {
  LiveCoupangProviderProduct,
  LiveCoupangProviderResult,
  RankedLiveProduct
} from "@/lib/live-product-video";
import type {
  LocalQueueItem,
  QueueSchedulerSettings,
  ReserveCandidate
} from "@/lib/queue-scheduler/types";
import type { UsageEvidenceAllocation, UsageEvidencePack, UsageEvidenceRegistry } from "./contracts";
import { validateUsageEvidenceRegistry } from "./registry";

export const COUPANG_PROVIDER_ENV_WHITELIST = Object.freeze([
  "COUPANG_PARTNERS_PROVIDER_ENABLED",
  "COUPANG_PARTNERS_ACCESS_KEY",
  "COUPANG_ACCESS_KEY",
  "COUPANG_PARTNERS_SECRET_KEY",
  "COUPANG_SECRET_KEY",
  "COUPANG_CUSTOMER_ID",
  "COUPANG_PARTNER_ID",
  "COUPANG_PARTNERS_CUSTOMER_ID",
  "COUPANG_PARTNERS_BASE_URL"
] as const);

export const CAPACITY_PROOF_SAFETY_ENV = Object.freeze({
  QUEUE_SCHEDULER_ENABLED: "false",
  SAFE_TO_UPLOAD: "false",
  SAFE_TO_PUBLIC_UPLOAD: "false",
  YOUTUBE_AUTO_UPLOAD: "false",
  PUBLIC_UPLOAD: "false",
  UNLISTED_UPLOAD: "false",
  TIKTOK_AUTO_UPLOAD: "false",
  THREADS_AUTO_POST: "false",
  COMMENT_AUTOMATION: "false",
  GOOGLE_SHEETS_WRITE: "0",
  GOOGLE_DRIVE_WRITE: "0",
  DRIVE_WRITE: "0",
  R2_WRITE: "0",
  DB_WRITE: "0",
  PRODUCTION_DB_WRITE: "0",
  SUPABASE_WRITE: "0",
  PLATFORM_UPLOAD: "0",
  PRODUCTION_DEPLOY: "0"
});

type DotenvParseResult = {
  values: Record<string, string>;
  loadedKeys: string[];
  ignoredKeyCount: number;
};

export function parseWhitelistedCoupangProviderEnv(contents: string): DotenvParseResult {
  const allowed = new Set<string>(COUPANG_PROVIDER_ENV_WHITELIST);
  const values: Record<string, string> = {};
  let ignoredKeyCount = 0;
  for (const rawLine of contents.replace(/^\uFEFF/u, "").split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const assignment = line.startsWith("export ") ? line.slice(7).trim() : line;
    const separator = assignment.indexOf("=");
    if (separator <= 0) continue;
    const key = assignment.slice(0, separator).trim();
    if (!/^[A-Z][A-Z0-9_]*$/u.test(key)) continue;
    if (!allowed.has(key)) {
      ignoredKeyCount += 1;
      continue;
    }
    values[key] = unwrapDotenvValue(assignment.slice(separator + 1).trim());
  }
  return { values, loadedKeys: Object.keys(values).sort(), ignoredKeyCount };
}

export function injectProcessOnlyCoupangProviderEnv(contents: string, env: NodeJS.ProcessEnv = process.env) {
  const parsed = parseWhitelistedCoupangProviderEnv(contents);
  for (const [key, value] of Object.entries(parsed.values)) env[key] = value;
  for (const [key, value] of Object.entries(CAPACITY_PROOF_SAFETY_ENV)) env[key] = value;
  return { loadedKeys: parsed.loadedKeys, ignoredKeyCount: parsed.ignoredKeyCount };
}

export function buildSafeProviderPreflight(env: Record<string, string | undefined>) {
  const readiness = readCoupangPartnersEnv(env).readiness;
  const request = buildCoupangPartnersSearchRequest({
    env,
    keyword: "정리용품",
    limit: 1,
    signedDate: "260809T000000Z"
  });
  const configured = readiness.provider_enabled
    && readiness.access_key_present
    && readiness.secret_key_present
    && readiness.customer_id_or_partner_id_present;
  return {
    schemaVersion: "coupang-provider-readiness-v3",
    envSource: "external_local_env_file",
    provider_enabled: readiness.provider_enabled,
    access_key_present: readiness.access_key_present,
    secret_key_present: readiness.secret_key_present,
    customer_id_or_partner_id_present: readiness.customer_id_or_partner_id_present,
    base_url_configured: readiness.base_url_configured,
    signature_builder_present: readiness.signature_builder_present,
    endpoint_contract_valid: readiness.endpoint_contract_valid,
    request_ok: request.ok,
    external_api_call_allowed: request.external_api_call_allowed,
    external_api_called: false,
    request_summary: request.ok ? request.request.toJSON() : null,
    blocker: request.ok ? null : request.blocker,
    LIVE_PROVIDER_CONFIGURED: configured && request.ok,
    raw_values_masked: true,
    SAFE_TO_UPLOAD: false,
    SAFE_TO_PUBLIC_UPLOAD: false
  };
}

export type V3ArtifactPreflight = {
  schemaVersion: "usage-evidence-v3-artifact-preflight";
  baseline_registry_valid: boolean;
  candidate_registry_valid: boolean;
  v2_packs: number;
  v3_candidate_packs: number;
  candidate_total_packs: number;
  candidate_assets: number;
  derived_clips: number;
  distinct_new_sources: number;
  unique_sequence_fingerprints: number;
  codex_reviewed_clips: number;
  codex_reviewed_packs: number;
  publish_eligible: number;
  clip_files_matched: number;
  pack_manifests_matched: number;
  source_hash_metadata_matched: number;
  hash_mismatches: number;
  rebuild_executed: false;
  ready: boolean;
  blocker: "V3_LOCAL_ARTIFACT_NOT_READY" | null;
};

export function evaluateV3ArtifactContract(input: Omit<V3ArtifactPreflight, "schemaVersion" | "rebuild_executed" | "ready" | "blocker">): V3ArtifactPreflight {
  const hashMismatches = input.hash_mismatches
    + Math.max(0, input.derived_clips - input.clip_files_matched)
    + Math.max(0, input.derived_clips - input.source_hash_metadata_matched)
    + Math.max(0, input.v3_candidate_packs - input.pack_manifests_matched);
  const ready = input.baseline_registry_valid
    && input.candidate_registry_valid
    && input.v2_packs === 30
    && input.v3_candidate_packs === 12
    && input.candidate_total_packs === 42
    && input.candidate_assets === 83
    && input.derived_clips === 24
    && input.distinct_new_sources === 8
    && input.unique_sequence_fingerprints === 12
    && input.codex_reviewed_clips === 24
    && input.codex_reviewed_packs === 12
    && input.publish_eligible === 0
    && hashMismatches === 0;
  return {
    schemaVersion: "usage-evidence-v3-artifact-preflight",
    ...input,
    hash_mismatches: hashMismatches,
    rebuild_executed: false,
    ready,
    blocker: ready ? null : "V3_LOCAL_ARTIFACT_NOT_READY"
  };
}

export async function verifyV3LocalArtifacts(input: {
  baselineRegistryPath: string;
  candidateRegistryPath: string;
  artifactRoot: string;
}): Promise<{ report: V3ArtifactPreflight; baselineRegistry: UsageEvidenceRegistry; candidateRegistry: UsageEvidenceRegistry }> {
  const baselineRegistry = validateUsageEvidenceRegistry(JSON.parse(await readFile(input.baselineRegistryPath, "utf8")));
  const candidateRegistry = validateUsageEvidenceRegistry(JSON.parse(await readFile(input.candidateRegistryPath, "utf8")));
  const v3Packs = candidateRegistry.packs.filter((pack) => pack.packGeneration === "v3_motion");
  const derivedClips = candidateRegistry.assets.filter((asset) => asset.sourceKind === "derived_clip");
  const codexReview = JSON.parse(await readFile(join(input.artifactRoot, "reviews", "codex-review.json"), "utf8")) as {
    visualReviewExecuted?: boolean;
    clips?: Record<string, { status?: string }>;
  };
  const packReview = JSON.parse(await readFile(join(input.artifactRoot, "reviews", "pack-codex-review.json"), "utf8")) as {
    status?: string;
    contactSheetsOpened?: number;
    packIds?: string[];
    publishEligible?: boolean;
  };
  const sourceReport = JSON.parse(await readFile(join(input.artifactRoot, "analysis", "source-opportunity-report.json"), "utf8")) as {
    sources?: Array<{ sourceId?: string; sourceSha256?: string }>;
  };
  const clipHashes = new Set<string>();
  for (const path of await findFiles(join(input.artifactRoot, "clips"), ".mp4")) {
    clipHashes.add(createHash("sha256").update(await readFile(path)).digest("hex"));
  }
  const reviewedClipIds = new Set(Object.entries(codexReview.clips ?? {}).filter(([, review]) => review.status === "pass").map(([assetId]) => assetId));
  const reviewedPackIds = new Set(packReview.status === "pass" ? packReview.packIds ?? [] : []);
  const sourceHashes = new Map((sourceReport.sources ?? []).map((source) => [source.sourceId, source.sourceSha256]));
  let clipFilesMatched = 0;
  let sourceHashMetadataMatched = 0;
  for (const clip of derivedClips) {
    if (clipHashes.has(clip.derivedSha256)) clipFilesMatched += 1;
    if (sourceHashes.get(clip.sourceId) === clip.sourceSha256) sourceHashMetadataMatched += 1;
  }
  let packManifestsMatched = 0;
  for (const pack of v3Packs) {
    try {
      const manifest = JSON.parse(await readFile(join(input.artifactRoot, "packs", pack.packId, "manifest.json"), "utf8")) as UsageEvidencePack;
      if (manifest.packId === pack.packId && manifest.sequenceFingerprint === pack.sequenceFingerprint && digest(manifest.assetIds) === digest(pack.assetIds)) packManifestsMatched += 1;
    } catch {
      // Counted as an unmatched manifest below.
    }
  }
  const sequenceCount = new Set(v3Packs.map((pack) => pack.sequenceFingerprint)).size;
  const codexReviewedClips = derivedClips.filter((asset) => reviewedClipIds.has(asset.assetId) && asset.derivedCodexVisualReviewStatus === "pass").length;
  const codexReviewedPacks = v3Packs.filter((pack) => reviewedPackIds.has(pack.packId)).length;
  const publishEligible = candidateRegistry.assets.filter((asset) => asset.publishEligible).length + candidateRegistry.packs.filter((pack) => pack.publishEligible).length;
  const reviewContractValid = codexReview.visualReviewExecuted === true
    && packReview.contactSheetsOpened === 12
    && packReview.publishEligible === false;
  const report = evaluateV3ArtifactContract({
    baseline_registry_valid: true,
    candidate_registry_valid: true,
    v2_packs: baselineRegistry.packs.length,
    v3_candidate_packs: v3Packs.length,
    candidate_total_packs: candidateRegistry.packs.length,
    candidate_assets: candidateRegistry.assets.length,
    derived_clips: derivedClips.length,
    distinct_new_sources: new Set(derivedClips.map((asset) => asset.sourceId)).size,
    unique_sequence_fingerprints: sequenceCount,
    codex_reviewed_clips: reviewContractValid ? codexReviewedClips : 0,
    codex_reviewed_packs: reviewContractValid ? codexReviewedPacks : 0,
    publish_eligible: publishEligible,
    clip_files_matched: clipFilesMatched,
    pack_manifests_matched: packManifestsMatched,
    source_hash_metadata_matched: sourceHashMetadataMatched,
    hash_mismatches: 0
  });
  return {
    baselineRegistry,
    candidateRegistry,
    report
  };
}

export function summarizeProviderCalls(results: LiveCoupangProviderResult[]) {
  const search = results.filter((result) => result.searchApiCalled).length;
  const deeplink = results.filter((result) => result.deeplinkApiCalled).length;
  return { search, deeplink, total: results.reduce((sum, result) => sum + result.apiCallCount, 0) };
}

export function classifyProviderFailure(results: LiveCoupangProviderResult[]) {
  const blockers = results.map((result) => result.blocker).filter((value): value is string => Boolean(value));
  if (blockers.some((value) => /HTTP_401$/u.test(value))) return "LIVE_PROVIDER_AUTH_REJECTED";
  if (blockers.some((value) => /HTTP_403$/u.test(value))) return "LIVE_PROVIDER_PERMISSION_REJECTED";
  if (blockers.some((value) => /HTTP_429$/u.test(value))) return "LIVE_PROVIDER_RATE_LIMITED";
  if (blockers.some((value) => /NETWORK_FAILED$/u.test(value))) return "LIVE_PROVIDER_NETWORK_FAILED";
  if (blockers.some((value) => /RESPONSE_INVALID$/u.test(value))) return "LIVE_PROVIDER_RESPONSE_INVALID";
  if (blockers.length > 0 && results.every((result) => result.products.length === 0)) return "LIVE_PROVIDER_EMPTY";
  return null;
}

export function isTerminalProviderFailure(result: LiveCoupangProviderResult) {
  return Boolean(result.blocker && /(HTTP_401|HTTP_403|HTTP_429|NETWORK_FAILED|RESPONSE_INVALID)$/u.test(result.blocker));
}

export function buildSafeLiveCandidateSnapshot(input: {
  raw: LiveCoupangProviderProduct[];
  normalized: RankedLiveProduct["candidate"][];
  ranked: RankedLiveProduct[];
}) {
  const unique = dedupeCandidates(input.ranked.map((entry) => entry.candidate));
  const policyEligible = input.ranked.filter((entry) => entry.score.eligible);
  const usageClassified = input.ranked.filter((entry) => entry.candidate.useCase !== "unsupported");
  return {
    schemaVersion: "daily69-live-candidate-snapshot-v3",
    counters: {
      raw: input.raw.length,
      normalized: input.normalized.length,
      unique: unique.length,
      ranked: input.ranked.length,
      policyEligible: policyEligible.length,
      usageEligibleBeforeAllocation: usageClassified.length,
      unsupported: input.ranked.filter((entry) => entry.candidate.useCase === "unsupported").length,
      blockedByPolicy: input.ranked.filter((entry) => entry.score.blockers.some((blocker) => /POLICY|EVENT|PRICE/u.test(blocker))).length,
      blockedByImage: input.ranked.filter((entry) => entry.score.blockers.some((blocker) => /IMAGE/u.test(blocker))).length,
      blockedByAffiliate: input.ranked.filter((entry) => entry.score.blockers.some((blocker) => /AFFILIATE|URL/u.test(blocker))).length,
      blockedByUsageCase: input.ranked.filter((entry) => entry.candidate.useCase === "unsupported" || entry.score.blockers.some((blocker) => /USAGE/u.test(blocker))).length
    },
    rawSafeProducts: input.raw,
    normalizedCandidates: input.normalized,
    uniqueCandidates: unique,
    rankedCandidates: input.ranked,
    policyEligibleCandidates: policyEligible,
    usageClassifiedCandidates: usageClassified,
    credentialsStored: false,
    requestHeadersStored: false
  };
}

export function validateLiveCapacityAcceptance(input: {
  active: LocalQueueItem[];
  reserve: ReserveCandidate[];
  registry: UsageEvidenceRegistry;
  settings: QueueSchedulerSettings;
}) {
  const activeKeys = new Set(input.active.map((item) => item.productKey));
  const reserveKeys = new Set(input.reserve.map((entry) => entry.candidate.productKey));
  const categoryCounts = new Map<string, number>();
  const familyCounts = new Map<string, number>();
  const packUses = new Map<string, number>();
  const assetUses = new Map<string, number>();
  const sourceUses = new Map<string, number>();
  const assetById = new Map(input.registry.assets.map((asset) => [asset.assetId, asset]));
  const packById = new Map(input.registry.packs.map((pack) => [pack.packId, pack]));
  for (const item of input.active) {
    increment(categoryCounts, categoryKey(item.candidate.categoryPath, item.candidate.category));
    increment(familyCounts, familyKey(item.candidate.canonicalProductName, item.candidate.categoryPath, item.candidate.category));
  }
  const allocations = [...input.active.map((item) => item.usageEvidenceAllocation), ...input.reserve.map((entry) => entry.usageEvidenceAllocation)].filter((value): value is UsageEvidenceAllocation => Boolean(value));
  let productBoundMismatch = 0;
  for (const allocation of allocations) {
    const pack = packById.get(allocation.packId);
    if (pack?.packKind === "product_bound_synthetic_pack" && pack.boundProductKey !== allocation.productKey) productBoundMismatch += 1;
    increment(packUses, allocation.packId);
    for (const assetId of allocation.assetIds) increment(assetUses, assetId);
    const sources = new Set(allocation.assetIds.map((assetId) => assetById.get(assetId)?.sourceId).filter((value): value is string => Boolean(value)));
    for (const sourceId of sources) increment(sourceUses, sourceId);
  }
  const sequenceFingerprints = allocations.map((allocation) => allocation.sequenceFingerprint);
  const sequenceViolations = sequenceFingerprints.filter((value, index) => index >= 2 && value === sequenceFingerprints[index - 1] && value === sequenceFingerprints[index - 2]).length;
  const batchPackViolations = input.active.reduce((count, _item, index) => index % 3 === 0 && input.active.slice(index, index + 3).length === 3 && new Set(input.active.slice(index, index + 3).map((entry) => entry.usageEvidenceAllocation?.packId)).size === 1 ? count + 1 : count, 0);
  const expectedSlots = Array.from({ length: input.settings.dailyTargetCount }, (_, index) => `slot-${String(index + 1).padStart(3, "0")}`);
  const expectedRanks = Array.from({ length: input.settings.dailyTargetCount }, (_, index) => index + 1);
  const hourFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", hour: "2-digit", hourCycle: "h23" });
  const hourlyGroups = new Map<string, number>();
  for (const item of input.active) increment(hourlyGroups, hourFormatter.format(new Date(item.scheduledAt)));
  const categoryLimit = Math.floor(input.settings.dailyTargetCount * input.settings.maxCategoryRatio);
  const familyLimit = Math.floor(input.settings.dailyTargetCount * input.settings.maxProductFamilyRatio);
  const details = {
    active: input.active.length,
    reserve: input.reserve.length,
    distinct: new Set([...activeKeys, ...reserveKeys]).size,
    slots: digest(input.active.map((item) => item.slotId)) === digest(expectedSlots),
    ranks: digest(input.active.map((item) => item.queueRank)) === digest(expectedRanks),
    hourlyGroups: hourlyGroups.size,
    productsPerGroup: hourlyGroups.size === 23 && [...hourlyGroups.values()].every((count) => count === 3),
    categoryMax: maxCount(categoryCounts),
    categoryLimit,
    familyMax: maxCount(familyCounts),
    familyLimit,
    maxPackReuse: maxCount(packUses),
    maxAssetReuse: maxCount(assetUses),
    maxSourceReuse: maxCount(sourceUses),
    packReuseViolations: [...packUses.values()].filter((count) => count > input.registry.maxUsagePackReuse).length,
    assetReuseViolations: [...assetUses.values()].filter((count) => count > 5).length,
    sourceReuseViolations: [...sourceUses.values()].filter((count) => count > input.registry.maxSameSourceVideoDaily).length,
    sequenceViolations,
    batchPackViolations,
    unsupported: input.active.filter((item) => item.candidate.useCase === "unsupported").length,
    activeAllocationCount: input.active.filter((item) => item.usageEvidenceAllocation).length,
    reserveAllocationCount: input.reserve.filter((entry) => entry.usageEvidenceAllocation).length,
    reserveDuplicatesWithActive: [...reserveKeys].filter((key) => activeKeys.has(key)).length,
    productBoundMismatch
  };
  return {
    ...details,
    pass: details.active === input.settings.dailyTargetCount
      && details.reserve >= input.settings.minimumReserveCount
      && details.distinct >= input.settings.dailyTargetCount + input.settings.minimumReserveCount
      && details.slots
      && details.ranks
      && details.hourlyGroups === 23
      && details.productsPerGroup
      && details.categoryMax <= details.categoryLimit
      && details.familyMax <= details.familyLimit
      && details.packReuseViolations === 0
      && details.assetReuseViolations === 0
      && details.sourceReuseViolations === 0
      && details.sequenceViolations === 0
      && details.batchPackViolations === 0
      && details.unsupported === 0
      && details.activeAllocationCount === input.settings.dailyTargetCount
      && details.reserveAllocationCount === input.reserve.length
      && details.reserveDuplicatesWithActive === 0
      && details.productBoundMismatch === 0
  };
}

export function providerReadinessBlocker(preflight: ReturnType<typeof buildSafeProviderPreflight>): CoupangPartnersLiveRequestBlocker | null {
  return preflight.blocker;
}

function unwrapDotenvValue(value: string) {
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) return value.slice(1, -1);
  return value;
}

async function findFiles(root: string, extension: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...await findFiles(path, extension));
    else if (entry.isFile() && extname(entry.name).toLowerCase() === extension) files.push(path);
  }
  return files;
}

function dedupeCandidates(candidates: RankedLiveProduct["candidate"][]) {
  const keys = new Set<string>();
  const names = new Set<string>();
  return candidates.filter((candidate) => {
    const name = normalize(candidate.canonicalProductName);
    if (keys.has(candidate.productKey) || names.has(name)) return false;
    keys.add(candidate.productKey);
    names.add(name);
    return true;
  });
}

function normalize(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[^가-힣a-z0-9]/gu, "");
}

function categoryKey(categoryPath: string, category: string) {
  return normalize((categoryPath || category).split(/[>\\/]/u)[0] || "uncategorized") || "uncategorized";
}

function familyKey(name: string, categoryPath: string, category: string) {
  return `${categoryKey(categoryPath, category)}:${normalize(name).slice(0, 24)}`;
}

function increment(counts: Map<string, number>, key: string) {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function maxCount(counts: Map<string, number>) {
  return Math.max(0, ...counts.values());
}

function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
