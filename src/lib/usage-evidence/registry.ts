import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { SUPPORTED_USAGE_EVIDENCE_USE_CASES, type SupportedUsageEvidenceUseCase } from "./taxonomy";
import type { UsageEvidenceAsset, UsageEvidencePack, UsageEvidenceRegistry } from "./contracts";

export async function loadUsageEvidenceRegistry(path = process.env.USAGE_EVIDENCE_REGISTRY_PATH?.trim()): Promise<UsageEvidenceRegistry> {
  if (!path) throw new Error("USAGE_EVIDENCE_REGISTRY_NOT_READY");
  let value: unknown;
  try { value = JSON.parse(await readFile(resolve(path), "utf8")); }
  catch { throw new Error("USAGE_EVIDENCE_REGISTRY_NOT_READY"); }
  return validateUsageEvidenceRegistry(value);
}

export function validateUsageEvidenceRegistry(value: unknown): UsageEvidenceRegistry {
  if (!value || typeof value !== "object") throw new Error("USAGE_EVIDENCE_REGISTRY_NOT_READY");
  const registry = value as UsageEvidenceRegistry;
  if (registry.schemaVersion !== "usage-evidence-registry-v2" || registry.maxUsagePackReuse !== 5 || registry.maxSameSequenceConsecutive !== 2 || registry.maxSameSourceVideoDaily < 1 || registry.maxSameSourceVideoDaily > 15 || !registry.visualReviewExecuted || !Array.isArray(registry.assets) || !Array.isArray(registry.packs)) throw new Error("USAGE_EVIDENCE_REGISTRY_NOT_READY");
  const assetIds = new Set<string>();
  const fingerprints: string[] = [];
  for (const asset of registry.assets) {
    if (!isEligibleAsset(asset) || assetIds.has(asset.assetId) || fingerprints.some((fingerprint) => hammingDistance(fingerprint, asset.visualFingerprint) <= registry.nearDuplicateHammingThreshold)) throw new Error("USAGE_SOURCE_REVIEW_NOT_VALID");
    assetIds.add(asset.assetId); fingerprints.push(asset.visualFingerprint);
  }
  const assets = new Map(registry.assets.map((asset) => [asset.assetId, asset]));
  const packIds = new Set<string>();
  for (const pack of registry.packs) {
    if (!isEligiblePack(pack, assetIds) || packIds.has(pack.packId) || !packAssetsMatch(pack, assets)) throw new Error("USAGE_PACK_QA_FAILED");
    packIds.add(pack.packId);
  }
  for (const useCase of Object.keys(SUPPORTED_USAGE_EVIDENCE_USE_CASES) as SupportedUsageEvidenceUseCase[]) {
    if (eligiblePacksForUseCase(registry, useCase).length < 2) throw new Error("USAGE_EVIDENCE_REGISTRY_NOT_READY");
  }
  return registry;
}

export function isEligibleAsset(asset: UsageEvidenceAsset): boolean {
  const derivedVideoLineageReady = !["derived_clip", "derived_frame_pack"].includes(asset.sourceKind) || (typeof asset.clipStartSeconds === "number" && typeof asset.clipEndSeconds === "number" && asset.clipStartSeconds >= 0 && asset.clipEndSeconds >= asset.clipStartSeconds && asset.derivationOperation.startsWith("ffmpeg_"));
  const lineageReady = Boolean(asset.assetId && asset.sourceId && asset.sourceRelativeReference && asset.derivationOperation && /^[0-9a-f]{64}$/u.test(asset.sourceSha256) && /^[0-9a-f]{64}$/u.test(asset.derivedSha256) && /^[0-9a-f]{16}$/u.test(asset.visualFingerprint) && asset.sourceFingerprint && derivedVideoLineageReady);
  const reviewReady = asset.derivedMachineQaStatus === "pass" && asset.derivedCodexVisualReviewStatus === "pass" && asset.humanOwnerReviewStatus !== "fail";
  const trustReady = asset.trustTier === "HUMAN_REVIEWED_SOURCE_DERIVED" ? asset.sourceHumanReviewStatus === "pass" : asset.trustTier === "CODEX_REVIEWED_LOCAL_ONLY" && asset.sourceHumanReviewStatus !== "fail";
  return lineageReady && reviewReady && trustReady && asset.noUploadAutomationEligible && asset.publishEligible === false && asset.identityType === "generic_usage_example" && asset.blockCodes.length === 0 && asset.dailyReuseLimit > 0 && asset.dailyReuseLimit <= 5;
}

export function isEligiblePack(pack: UsageEvidencePack, assetIds: Set<string>): boolean {
  return pack.useCase in SUPPORTED_USAGE_EVIDENCE_USE_CASES && pack.noUploadAutomationEligible && pack.publishEligible === false && pack.assetIds.length >= 3 && new Set(pack.assetIds).size === pack.assetIds.length && pack.assetIds.every((id) => assetIds.has(id)) && pack.problemAssetIds.length > 0 && pack.usageAssetIds.length > 0 && pack.afterAssetIds.length > 0 && [...pack.problemAssetIds, ...pack.usageAssetIds, ...pack.actionAssetIds, ...pack.afterAssetIds].every((id) => pack.assetIds.includes(id)) && pack.dailyReuseLimit > 0 && pack.dailyReuseLimit <= 5 && pack.consecutiveReuseLimit > 0 && pack.consecutiveReuseLimit <= 2 && Boolean(pack.sequenceFingerprint);
}

export function eligiblePacksForUseCase(registry: UsageEvidenceRegistry, useCase: string) {
  const assetIds = new Set(registry.assets.filter(isEligibleAsset).map((asset) => asset.assetId));
  return registry.packs.filter((pack) => pack.useCase === useCase && isEligiblePack(pack, assetIds));
}

export function usageEvidenceCapacityUnits(registry: UsageEvidenceRegistry): number {
  return registry.packs.reduce((sum, pack) => sum + pack.dailyReuseLimit, 0);
}

function packAssetsMatch(pack: UsageEvidencePack, assets: Map<string, UsageEvidenceAsset>): boolean {
  const selected = pack.assetIds.map((id) => assets.get(id));
  if (selected.some((asset) => !asset || !asset.useCases.includes(pack.useCase))) return false;
  const roleMatches = pack.problemAssetIds.every((id) => hasAnyRole(assets.get(id), ["problem", "before"]))
    && [...pack.usageAssetIds, ...pack.actionAssetIds].every((id) => hasAnyRole(assets.get(id), ["usage", "hand_interaction", "organization", "storage", "folding", "cleaning"]))
    && pack.afterAssetIds.every((id) => hasAnyRole(assets.get(id), ["after"]));
  return roleMatches && selected.every((asset) => asset && categoriesOverlap(pack.categoryAllowlist, asset.categoryAllowlist) && !pack.categoryAllowlist.some((category) => asset.categoryBlocklist.includes(category)));
}

function hasAnyRole(asset: UsageEvidenceAsset | undefined, roles: UsageEvidenceAsset["sceneRoles"]): boolean {
  return Boolean(asset && roles.some((role) => asset.sceneRoles.includes(role)));
}

function categoriesOverlap(left: string[], right: string[]): boolean {
  return left.length === 0 || right.length === 0 || left.some((category) => right.includes(category));
}

function hammingDistance(left: string, right: string): number {
  return (BigInt(`0x${left}`) ^ BigInt(`0x${right}`)).toString(2).replace(/0/gu, "").length;
}
