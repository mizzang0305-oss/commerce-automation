import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve } from "node:path";
import type { UsageEvidenceAllocation, UsageEvidenceAsset, UsageEvidencePack, UsageEvidenceRegistry } from "./contracts";
import { isEligibleAsset, isEligiblePack } from "./registry";

export const PRODUCTION_USAGE_MATERIALIZER_SOURCE_KINDS = ["sanitized_local_image"] as const;

export type UsageAllocationMaterializationEligibility =
  | { materializable: true; safeCode: ""; pack: UsageEvidencePack; assets: UsageEvidenceAsset[]; evidenceTypes: string[] }
  | { materializable: false; safeCode: string; pack?: UsageEvidencePack; assets: UsageEvidenceAsset[]; evidenceTypes: string[] };

export type Daily69MaterializationPreflight = {
  activeTotal: number;
  activeMaterializable: number;
  activeBlocked: number;
  reserveTotal: number;
  reserveMaterializable: number;
  reserveBlocked: number;
  requiredActive: number;
  requiredReserve: number;
  blockedQueueIds: string[];
  blockedProductKeys: string[];
  blockedEvidenceTypes: string[];
  safeReasonCodes: string[];
  pass: boolean;
  safeCode: "" | "MATERIALIZABLE_CAPACITY_SHORTFALL";
  SAFE_TO_UPLOAD: false;
  PLATFORM_UPLOAD: 0;
};

export type GeneratedUsageSourceReviewManifest = {
  schemaVersion: "daily69-generated-source-review-v1";
  reviewedAt: string;
  visualReviewExecuted: true;
  reviewerExecution: string;
  machineQaTool: string;
  machineQaExternalApiCalled: false;
  uploadAttempted: false;
  items: Array<{
    sourceRelativeReference: string;
    sha256: string;
    machineQaStatus: "pass";
    codexVisualReviewStatus: "pass";
    identityType: "generic_usage_example";
    width: number;
    height: number;
    blockCodes: [];
  }>;
  rejectedCandidates?: Array<{ role: string; reason: string; replaced: true }>;
};

export function validateGeneratedUsageSourceReviewManifest(value: unknown): GeneratedUsageSourceReviewManifest {
  if (!isRecord(value)
    || value.schemaVersion !== "daily69-generated-source-review-v1"
    || value.visualReviewExecuted !== true
    || value.machineQaExternalApiCalled !== false
    || value.uploadAttempted !== false
    || typeof value.reviewedAt !== "string"
    || !Number.isFinite(Date.parse(value.reviewedAt))
    || typeof value.reviewerExecution !== "string"
    || !value.reviewerExecution.trim()
    || typeof value.machineQaTool !== "string"
    || !value.machineQaTool.trim()
    || !Array.isArray(value.items)
    || value.items.length === 0) throw new Error("GENERATED_USAGE_SOURCE_REVIEW_INVALID");
  const references = new Set<string>();
  for (const item of value.items) {
    if (!isRecord(item)
      || typeof item.sourceRelativeReference !== "string"
      || !item.sourceRelativeReference
      || isAbsolute(item.sourceRelativeReference)
      || references.has(item.sourceRelativeReference)
      || typeof item.sha256 !== "string"
      || !isSha256(item.sha256)
      || item.machineQaStatus !== "pass"
      || item.codexVisualReviewStatus !== "pass"
      || item.identityType !== "generic_usage_example"
      || !Number.isInteger(item.width)
      || !Number.isInteger(item.height)
      || Number(item.width) < 320
      || Number(item.height) < 320
      || !Array.isArray(item.blockCodes)
      || item.blockCodes.length !== 0) throw new Error("GENERATED_USAGE_SOURCE_REVIEW_INVALID");
    references.add(item.sourceRelativeReference);
  }
  return value as GeneratedUsageSourceReviewManifest;
}

type OperationalAllocation = {
  id?: string;
  productKey?: string;
  candidate: { productKey: string; useCase: string };
  usageEvidenceAllocation?: UsageEvidenceAllocation;
};

export function isUsageEvidenceAssetProductionMaterializable(asset: UsageEvidenceAsset, useCase?: string): boolean {
  return isEligibleAsset(asset)
    && asset.sourceKind === "sanitized_local_image"
    && asset.identityType === "generic_usage_example"
    && asset.derivedMachineQaStatus === "pass"
    && asset.derivedCodexVisualReviewStatus === "pass"
    && asset.noUploadAutomationEligible
    && asset.publishEligible === false
    && asset.blockCodes.length === 0
    && (!useCase || asset.useCases.includes(useCase));
}

export function assessUsageAllocationProductionMaterializability(input: {
  registry: UsageEvidenceRegistry;
  allocation: UsageEvidenceAllocation;
  productKey: string;
  useCase: string;
}): UsageAllocationMaterializationEligibility {
  if (!validIdentifier(input.productKey) || input.allocation.productKey !== input.productKey) {
    return blocked("ALLOCATED_USAGE_PRODUCT_BINDING_MISMATCH", []);
  }
  const matches = input.registry.packs.filter(({ packId }) => packId === input.allocation.packId);
  if (matches.length !== 1) return blocked("ALLOCATED_USAGE_PACK_NOT_FOUND", [], matches[0]);
  const pack = matches[0];
  if (pack.useCase !== input.useCase || input.allocation.useCase !== input.useCase) {
    return blocked("ALLOCATED_USAGE_USE_CASE_MISMATCH", [], pack);
  }
  if (pack.boundProductKey && pack.boundProductKey !== input.productKey) {
    return blocked("ALLOCATED_USAGE_PRODUCT_BINDING_MISMATCH", [], pack);
  }
  if (
    input.allocation.assetIds.length !== 3
    || new Set(input.allocation.assetIds).size !== 3
    || !input.allocation.assetIds.every((assetId) => pack.assetIds.includes(assetId))
    || !pack.problemAssetIds.includes(input.allocation.assetIds[0])
    || ![...pack.usageAssetIds, ...pack.actionAssetIds].includes(input.allocation.assetIds[1])
    || !pack.afterAssetIds.includes(input.allocation.assetIds[2])
    || input.allocation.sequenceFingerprint !== `${pack.sequenceFingerprint}:${input.allocation.assetIds.join(":")}`
  ) {
    return blocked("ALLOCATED_USAGE_ALLOCATION_MISMATCH", [], pack);
  }

  const assetsById = new Map<string, UsageEvidenceAsset>();
  for (const asset of input.registry.assets) {
    if (assetsById.has(asset.assetId)) return blocked("ALLOCATED_USAGE_ALLOCATION_MISMATCH", [], pack);
    assetsById.set(asset.assetId, asset);
  }
  const selected = input.allocation.assetIds.map((assetId) => assetsById.get(assetId));
  if (selected.some((asset) => !asset)) return blocked("ALLOCATED_USAGE_ALLOCATION_MISMATCH", [], pack);
  const assets = selected as UsageEvidenceAsset[];
  if (!sameStrings(input.allocation.sourceIds, [...new Set(assets.map(({ sourceId }) => sourceId))])) {
    return blocked("ALLOCATED_USAGE_ALLOCATION_MISMATCH", assets, pack);
  }

  const genericEligible = input.registry.assets.filter(isEligibleAsset);
  const genericEligibleIds = new Set(genericEligible.map(({ assetId }) => assetId));
  const genericEligibleById = new Map(genericEligible.map((asset) => [asset.assetId, asset]));
  if (!isEligiblePack(pack, genericEligibleIds, genericEligibleById)) {
    return blocked("ALLOCATED_USAGE_PACK_NOT_ELIGIBLE", assets, pack);
  }
  for (const asset of assets) {
    if (!validIdentifier(asset.assetId) || !validIdentifier(asset.sourceId)
      || !isUsageEvidenceAssetProductionMaterializable(asset, input.allocation.useCase)) {
      return blocked("ALLOCATED_USAGE_ASSET_NOT_ELIGIBLE", assets, pack);
    }
    if (asset.boundProductKey && asset.boundProductKey !== input.productKey) {
      return blocked("ALLOCATED_USAGE_PRODUCT_BINDING_MISMATCH", assets, pack);
    }
  }
  return {
    materializable: true,
    safeCode: "",
    pack,
    assets,
    evidenceTypes: evidenceTypes(assets),
  };
}

export function assertUsageAllocationProductionMaterializable(input: {
  registry: UsageEvidenceRegistry;
  allocation: UsageEvidenceAllocation;
  productKey: string;
  useCase: string;
}) {
  const result = assessUsageAllocationProductionMaterializability(input);
  if (!result.materializable) throw new Error(result.safeCode);
  return result;
}

export async function resolveProductionMaterializableUsageAssets(input: {
  assets: UsageEvidenceAsset[];
  assetRoot: string;
}) {
  let root: string;
  try {
    root = await realpath(resolve(input.assetRoot));
    if (!(await stat(root)).isDirectory()) throw new Error("ALLOCATED_USAGE_ASSET_ROOT_NOT_AVAILABLE");
  } catch (error) {
    if (knownMaterializationError(error)) throw error;
    throw new Error("ALLOCATED_USAGE_ASSET_ROOT_NOT_AVAILABLE");
  }
  const selected: Array<{ asset: UsageEvidenceAsset; sourcePath: string; sha256: string }> = [];
  for (const asset of input.assets) {
    if (!asset.sourceRelativeReference || isAbsolute(asset.sourceRelativeReference)) {
      throw new Error("ALLOCATED_USAGE_ASSET_PATH_OUTSIDE_ROOT");
    }
    const lexicalPath = resolve(root, asset.sourceRelativeReference);
    assertContained(root, lexicalPath);
    let sourcePath: string;
    try {
      sourcePath = await realpath(lexicalPath);
      assertContained(root, sourcePath);
      if (!(await stat(sourcePath)).isFile()) throw new Error("ALLOCATED_USAGE_ASSET_NOT_AVAILABLE");
    } catch (error) {
      if (knownMaterializationError(error)) throw error;
      throw new Error("ALLOCATED_USAGE_ASSET_NOT_AVAILABLE");
    }
    const bytes = await readFile(sourcePath).catch(() => { throw new Error("ALLOCATED_USAGE_ASSET_NOT_AVAILABLE"); });
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (!isSha256(asset.derivedSha256) || sha256 !== asset.derivedSha256) {
      throw new Error("ALLOCATED_USAGE_ASSET_HASH_MISMATCH");
    }
    if (!supportedImage(bytes, sourcePath)) throw new Error("ALLOCATED_USAGE_ASSET_MEDIA_TYPE_INVALID");
    selected.push({ asset, sourcePath, sha256 });
  }
  return selected;
}

export async function preflightDaily69MaterializationEligibility(input: {
  active: OperationalAllocation[];
  reserve: OperationalAllocation[];
  registry: UsageEvidenceRegistry;
  assetRoot: string;
  requiredActive?: number;
  requiredReserve?: number;
}): Promise<Daily69MaterializationPreflight> {
  const requiredActive = input.requiredActive ?? 69;
  const requiredReserve = input.requiredReserve ?? 14;
  const fileChecks = new Map<string, Promise<void>>();
  const blockedQueueIds = new Set<string>();
  const blockedProductKeys = new Set<string>();
  const blockedEvidenceTypes = new Set<string>();
  const safeReasonCodes = new Set<string>();

  const inspect = async (entry: OperationalAllocation, kind: "active" | "reserve") => {
    const productKey = entry.productKey || entry.candidate.productKey;
    const allocation = entry.usageEvidenceAllocation;
    if (!validIdentifier(productKey) || entry.candidate.productKey !== productKey) {
      recordBlock("ALLOCATED_USAGE_PRODUCT_BINDING_MISMATCH", [], entry, productKey, kind);
      return false;
    }
    if (!allocation) {
      recordBlock("USAGE_EVIDENCE_ALLOCATION_REQUIRED", [], entry, productKey, kind);
      return false;
    }
    const eligibility = assessUsageAllocationProductionMaterializability({
      registry: input.registry,
      allocation,
      productKey,
      useCase: entry.candidate.useCase,
    });
    if (!eligibility.materializable) {
      recordBlock(eligibility.safeCode, eligibility.evidenceTypes, entry, productKey, kind);
      return false;
    }
    try {
      await Promise.all(eligibility.assets.map((asset) => {
        const key = `${asset.assetId}:${asset.derivedSha256}`;
        let check = fileChecks.get(key);
        if (!check) {
          check = resolveProductionMaterializableUsageAssets({ assets: [asset], assetRoot: input.assetRoot }).then(() => undefined);
          fileChecks.set(key, check);
        }
        return check;
      }));
      return true;
    } catch (error) {
      const code = error instanceof Error && /^[A-Z0-9_:-]+$/u.test(error.message)
        ? error.message
        : "ALLOCATED_USAGE_ASSET_NOT_AVAILABLE";
      recordBlock(code, eligibility.evidenceTypes, entry, productKey, kind);
      return false;
    }
  };

  let activeMaterializable = 0;
  for (const entry of input.active) if (await inspect(entry, "active")) activeMaterializable += 1;
  let reserveMaterializable = 0;
  for (const entry of input.reserve) if (await inspect(entry, "reserve")) reserveMaterializable += 1;
  const activeBlocked = input.active.length - activeMaterializable;
  const reserveBlocked = input.reserve.length - reserveMaterializable;
  const pass = input.active.length === requiredActive
    && activeMaterializable === requiredActive
    && input.reserve.length >= requiredReserve
    && reserveMaterializable >= requiredReserve
    && activeBlocked === 0
    && reserveBlocked === 0;
  return {
    activeTotal: input.active.length,
    activeMaterializable,
    activeBlocked,
    reserveTotal: input.reserve.length,
    reserveMaterializable,
    reserveBlocked,
    requiredActive,
    requiredReserve,
    blockedQueueIds: [...blockedQueueIds].sort(),
    blockedProductKeys: [...blockedProductKeys].sort(),
    blockedEvidenceTypes: [...blockedEvidenceTypes].sort(),
    safeReasonCodes: [...safeReasonCodes].sort(),
    pass,
    safeCode: pass ? "" : "MATERIALIZABLE_CAPACITY_SHORTFALL",
    SAFE_TO_UPLOAD: false,
    PLATFORM_UPLOAD: 0,
  };

  function recordBlock(code: string, types: string[], entry: OperationalAllocation, productKey: string, kind: "active" | "reserve") {
    if (kind === "active" && entry.id) blockedQueueIds.add(entry.id);
    blockedProductKeys.add(productKey);
    for (const type of types.length ? types : ["unknown"]) blockedEvidenceTypes.add(type);
    safeReasonCodes.add(code);
  }
}

function blocked(safeCode: string, assets: UsageEvidenceAsset[], pack?: UsageEvidencePack): UsageAllocationMaterializationEligibility {
  return { materializable: false, safeCode, assets, pack, evidenceTypes: evidenceTypes(assets) };
}
function evidenceTypes(assets: UsageEvidenceAsset[]) { return [...new Set(assets.map(({ sourceKind }) => sourceKind))].sort(); }
function sameStrings(left: readonly string[], right: readonly string[]) { return left.length === right.length && left.every((value, index) => value === right[index]); }
function validIdentifier(value: string) { return Boolean(value && value.length <= 256 && !/[\u0000-\u001f\u007f]/u.test(value)); }
function isSha256(value: string) { return /^[0-9a-f]{64}$/u.test(value); }
function assertContained(root: string, target: string) {
  const fromRoot = relative(root, target);
  if (fromRoot === "" || (!fromRoot.startsWith("..\\") && fromRoot !== ".." && !fromRoot.startsWith("../") && !isAbsolute(fromRoot))) return;
  throw new Error("ALLOCATED_USAGE_ASSET_PATH_OUTSIDE_ROOT");
}
function knownMaterializationError(error: unknown) { return error instanceof Error && /^[A-Z0-9_:-]+$/u.test(error.message); }
function supportedImage(bytes: Buffer, path: string) {
  const extension = extname(path).toLowerCase();
  if (extension === ".png") return validPngStructure(bytes);
  if (extension === ".jpg" || extension === ".jpeg") return validJpegStructure(bytes);
  if (extension === ".webp") return validWebpStructure(bytes);
  return false;
}
function validPngStructure(bytes: Buffer) {
  return bytes.length >= 45
    && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    && bytes.readUInt32BE(8) === 13
    && bytes.subarray(12, 16).toString("ascii") === "IHDR"
    && bytes.readUInt32BE(16) > 0
    && bytes.readUInt32BE(20) > 0
    && bytes.subarray(bytes.length - 8, bytes.length - 4).toString("ascii") === "IEND";
}
function validJpegStructure(bytes: Buffer) {
  if (bytes.length < 12 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) return false;
  let offset = 2;
  while (offset < bytes.length - 2) {
    if (bytes[offset] !== 0xff) return false;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    if (marker === undefined) return false;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 1; continue; }
    if (offset + 2 >= bytes.length) return false;
    const segmentLength = bytes.readUInt16BE(offset + 1);
    if (segmentLength < 2 || offset + 1 + segmentLength > bytes.length) return false;
    if (isJpegStartOfFrame(marker)) {
      return segmentLength >= 7 && bytes.readUInt16BE(offset + 4) > 0 && bytes.readUInt16BE(offset + 6) > 0;
    }
    offset += 1 + segmentLength;
  }
  return false;
}
function isJpegStartOfFrame(marker: number) { return marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker); }
function validWebpStructure(bytes: Buffer) {
  if (bytes.length < 30 || bytes.subarray(0, 4).toString("ascii") !== "RIFF" || bytes.readUInt32LE(4) + 8 !== bytes.length || bytes.subarray(8, 12).toString("ascii") !== "WEBP") return false;
  const chunk = bytes.subarray(12, 16).toString("ascii");
  if (chunk === "VP8X") return readUInt24LE(bytes, 24) + 1 > 0 && readUInt24LE(bytes, 27) + 1 > 0;
  if (chunk === "VP8L") {
    if (bytes[20] !== 0x2f) return false;
    const bits = bytes.readUInt32LE(21);
    return (bits & 0x3fff) + 1 > 0 && ((bits >> 14) & 0x3fff) + 1 > 0;
  }
  if (chunk === "VP8 ") return bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a && (bytes.readUInt16LE(26) & 0x3fff) > 0 && (bytes.readUInt16LE(28) & 0x3fff) > 0;
  return false;
}
function readUInt24LE(bytes: Buffer, offset: number) { return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16); }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
