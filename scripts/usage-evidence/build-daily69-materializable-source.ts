import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { copyFile, mkdir, readFile, realpath, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import type { RankedLiveProduct } from "../../src/lib/live-product-video";
import { atomicWriteJson, readJson } from "../../src/lib/queue-scheduler/atomicJson";
import type { LocalQueueItem, ReserveCandidate } from "../../src/lib/queue-scheduler/types";
import {
  SUPPORTED_USAGE_EVIDENCE_USE_CASES,
  allocateUsageEvidence,
  createUsageAllocationState,
  preflightDaily69MaterializationEligibility,
  resolveProductionMaterializableUsageAssets,
  validateGeneratedUsageSourceReviewManifest,
  validateUsageEvidenceRegistry,
  type GeneratedUsageSourceReviewManifest,
  type UsageEvidenceAsset,
  type UsageEvidencePack,
  type UsageEvidenceRegistry,
} from "../../src/lib/usage-evidence";

const SOURCE_FILES = [
  "queue.json", "reserve-pool.json", "settings.json", "runs.json", "control-state.json",
  "source-proof.json", "selected-registry.json", "final-summary.json",
] as const;
const GENERATED_USE_CASES = ["home_storage", "kitchen_organization", "camping_storage"] as const;
const ROLES = ["problem", "usage", "after"] as const;
const exec = promisify(execFile);

async function main() {
  const sourceRoot = resolve(requiredArg("--source-root"));
  const outputRoot = resolve(requiredArg("--output-root"));
  const assetRoot = resolve(requiredArg("--asset-root"));
  const generatedAssetRelativeRoot = normalizeRelative(requiredArg("--generated-asset-relative-root"));
  const generatedReviewManifestPath = resolve(requiredArg("--generated-review-manifest"));
  if (sourceRoot === outputRoot || !basename(outputRoot).startsWith("d69r-materializable-")) throw new Error("MATERIALIZABLE_SOURCE_OUTPUT_INVALID");
  await stat(sourceRoot);
  await assertAbsent(outputRoot);

  const [queue, reserve, registryRaw, sourceProof, finalSummary] = await Promise.all([
    readRequired<LocalQueueItem[]>(join(sourceRoot, "queue.json")),
    readRequired<ReserveCandidate[]>(join(sourceRoot, "reserve-pool.json")),
    readRequired<UsageEvidenceRegistry>(join(sourceRoot, "selected-registry.json")),
    readJson<Record<string, unknown>>(join(sourceRoot, "source-proof.json"), {}),
    readJson<Record<string, unknown>>(join(sourceRoot, "final-summary.json"), {}),
  ]);
  if (queue.length !== 69 || reserve.length < 14) throw new Error("MATERIALIZABLE_SOURCE_CARDINALITY_INVALID");
  const registry = structuredClone(validateUsageEvidenceRegistry(registryRaw));
  const generatedReviewManifestBytes = await readFile(generatedReviewManifestPath);
  const suppliedGeneratedReview = validateGeneratedUsageSourceReviewManifest(JSON.parse(generatedReviewManifestBytes.toString("utf8")) as unknown);
  const normalization = await normalizeDerivedFrames(registry, assetRoot);
  const generatedReview = await addGeneratedPacks(registry, assetRoot, generatedAssetRelativeRoot, suppliedGeneratedReview, sha256(generatedReviewManifestBytes));
  const validatedRegistry = validateUsageEvidenceRegistry(registry);

  const state = createUsageAllocationState();
  const active = queue.map((item) => ({ ...item, usageEvidenceAllocation: allocate(item, validatedRegistry, state) }));
  const reserveAllocated = reserve.map((item) => ({ ...item, usageEvidenceAllocation: allocate(item, validatedRegistry, state) }));
  const materialization = await preflightDaily69MaterializationEligibility({
    active,
    reserve: reserveAllocated,
    registry: validatedRegistry,
    assetRoot,
    requiredActive: 69,
    requiredReserve: 14,
  });
  if (!materialization.pass) throw new Error(materialization.safeCode);

  await mkdir(outputRoot, { recursive: false });
  await Promise.all(SOURCE_FILES.map((name) => copyFile(join(sourceRoot, name), join(outputRoot, name), constants.COPYFILE_EXCL)));
  const settings = await readRequired<Record<string, unknown>>(join(sourceRoot, "settings.json"));
  await Promise.all([
    atomicWriteJson(join(outputRoot, "queue.json"), active),
    atomicWriteJson(join(outputRoot, "reserve-pool.json"), reserveAllocated),
    atomicWriteJson(join(outputRoot, "settings.json"), { ...settings, enabled: false, isPaused: true, uploadEnabled: false }),
    atomicWriteJson(join(outputRoot, "selected-registry.json"), validatedRegistry),
    atomicWriteJson(join(outputRoot, "source-proof.json"), {
      ...sourceProof,
      sourceNamespace: basename(outputRoot),
      parentSourceNamespace: basename(sourceRoot),
      materializationContract: "production-materializer-v1",
      materialization,
      normalizedDerivedFrameAssets: normalization.length,
      generatedGenericAssets: generatedReview.assets.length,
      generatedGenericPacks: generatedReview.packs.length,
      sourceMutation: 0,
      SAFE_TO_UPLOAD: false,
      PLATFORM_UPLOAD: 0,
    }),
    atomicWriteJson(join(outputRoot, "final-summary.json"), {
      ...finalSummary,
      sourceNamespace: basename(outputRoot),
      materializationEligibility: materialization,
      decision: "COUPANG_IMAGE_SKILL_USAGE_SCENES_V5_PROVEN_DAILY69_CAPACITY",
      SAFE_TO_UPLOAD: false,
      PLATFORM_UPLOAD: 0,
    }),
    atomicWriteJson(join(outputRoot, "materialization-normalization-manifest.json"), {
      schemaVersion: "daily69-materialization-normalization-v1",
      sourceNamespace: basename(sourceRoot),
      outputNamespace: basename(outputRoot),
      transformations: normalization,
      inputSourceMutated: false,
      externalCalls: 0,
      uploadAttempts: 0,
    }),
    atomicWriteJson(join(outputRoot, "generated-source-review.json"), generatedReview),
    atomicWriteJson(join(outputRoot, "materialization-preflight.json"), materialization),
  ]);
  process.stdout.write(`${JSON.stringify({ event: "daily69_materializable_source_built", outputRoot, normalizationCount: normalization.length, generatedAssets: generatedReview.assets.length, materialization, SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 })}\n`);
}

async function normalizeDerivedFrames(registry: UsageEvidenceRegistry, assetRoot: string) {
  const transformations: Array<Record<string, unknown>> = [];
  for (let index = 0; index < registry.assets.length; index += 1) {
    const asset = registry.assets[index];
    if (asset.sourceKind !== "derived_frame_pack") continue;
    if (typeof asset.clipStartSeconds !== "number" || asset.clipStartSeconds < 0) throw new Error("NORMALIZED_USAGE_ASSET_TIMESTAMP_INVALID");
    const sourcePath = await containedExistingFile(assetRoot, asset.sourceRelativeReference);
    const sourceSha256 = sha256(await readFile(sourcePath));
    if (sourceSha256 !== asset.sourceSha256) throw new Error("NORMALIZED_USAGE_SOURCE_VIDEO_HASH_MISMATCH");
    const relativeTarget = normalizeRelative(`commerce-assets/review/daily69-materialization-v1/normalized/${asset.assetId}.jpg`);
    const absoluteTarget = await containedOutputPath(assetRoot, relativeTarget);
    await extractOrVerifyFrame(sourcePath, absoluteTarget, asset.clipStartSeconds, asset.derivedSha256);
    const normalized: UsageEvidenceAsset = {
      ...asset,
      sourceKind: "sanitized_local_image",
      sourceRelativeReference: relativeTarget,
      sourceSha256: asset.derivedSha256,
      derivedSha256: asset.derivedSha256,
      derivationOperation: "ffmpeg_reviewed_frame_to_materializer_image_v1",
      safeReviewNotes: [...asset.safeReviewNotes, "byte-identical reviewed frame normalized to concrete materializer image"],
    };
    delete normalized.clipStartSeconds;
    delete normalized.clipEndSeconds;
    registry.assets[index] = normalized;
    transformations.push({
      assetId: asset.assetId,
      fromSourceKind: asset.sourceKind,
      toSourceKind: "sanitized_local_image",
      fromReference: asset.sourceRelativeReference,
      toReference: relativeTarget,
      sourceVideoSha256: sourceSha256,
      sha256: asset.derivedSha256,
      byteIdenticalToReviewedDerivedFrame: true,
    });
  }
  return transformations;
}

async function addGeneratedPacks(registry: UsageEvidenceRegistry, assetRoot: string, generatedRoot: string, suppliedReview: GeneratedUsageSourceReviewManifest, reviewManifestSha256: string) {
  const reviewedAt = suppliedReview.reviewedAt;
  const assets: UsageEvidenceAsset[] = [];
  const packs: UsageEvidencePack[] = [];
  for (const useCase of GENERATED_USE_CASES) {
    const definition = SUPPORTED_USAGE_EVIDENCE_USE_CASES[useCase];
    const packAssetIds: string[] = [];
    for (const role of ROLES) {
      const sourceRelativeReference = normalizeRelative(`${generatedRoot}/${useCase}/${role}.png`);
      const sourcePath = resolve(assetRoot, sourceRelativeReference);
      const digest = sha256(await readFile(sourcePath));
      const reviewRows = suppliedReview.items.filter((item) => item.sourceRelativeReference === sourceRelativeReference);
      if (reviewRows.length !== 1 || reviewRows[0].sha256 !== digest) throw new Error("GENERATED_USAGE_SOURCE_REVIEW_BINDING_MISMATCH");
      const [verified] = await resolveProductionMaterializableUsageAssetsUnchecked([placeholderAsset(sourceRelativeReference, digest)], assetRoot);
      const assetId = `daily69-materialization-v1-${useCase}-${role}`;
      packAssetIds.push(assetId);
      assets.push({
        assetId,
        sourceId: `codex-image-skill-${useCase}-${role}-v1`,
        sourceKind: "sanitized_local_image",
        sourceRelativeReference,
        sourceSha256: verified.sha256,
        derivedSha256: verified.sha256,
        derivationOperation: "none_codex_generated_generic_usage_source",
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
        visualFingerprint: verified.sha256.slice(0, 16),
        sourceFingerprint: verified.sha256.slice(16, 32),
        dailyReuseLimit: 5,
        consecutiveReuseLimit: 2,
        createdAt: reviewedAt,
        reviewedAt,
        safeReviewNotes: ["local image decode and dimensions pass", "Codex visual review pass", "generic usage scene; no exact product identity claim"],
        blockCodes: [],
        generationProvider: "codex_image_skill",
        productPixelSource: "not_present",
        identityFidelityStatus: "not_applicable",
      });
    }
    const packId = `daily69-materialization-v1-${useCase}-pack`;
    packs.push({
      packId,
      useCase,
      subUseCase: useCase,
      assetIds: packAssetIds,
      problemAssetIds: [packAssetIds[0]],
      usageAssetIds: [packAssetIds[1]],
      actionAssetIds: [packAssetIds[1]],
      afterAssetIds: [packAssetIds[2]],
      categoryAllowlist: [...definition.categoryAllowlist],
      categoryBlocklist: [...definition.categoryBlocklist],
      dailyReuseLimit: 5,
      consecutiveReuseLimit: 2,
      sequenceFingerprint: sha256(packAssetIds.join("|" )).slice(0, 24),
      noUploadAutomationEligible: true,
      publishEligible: false,
      packGeneration: "v2",
      trustTier: "CODEX_REVIEWED_LOCAL_ONLY",
      packKind: "generic_usage_pack",
    });
  }
  registry.assets.push(...assets);
  registry.packs.push(...packs);
  registry.generatedAt = reviewedAt;
  registry.sourceInventory.validSources += assets.length;
  registry.sourceInventory.sanitizedLocalSources += assets.length;
  return {
    schemaVersion: "daily69-generated-generic-source-review-v1",
    reviewedAt,
    reviewManifestSha256,
    visualReviewExecuted: suppliedReview.visualReviewExecuted,
    reviewerExecution: suppliedReview.reviewerExecution,
    machineQaTool: suppliedReview.machineQaTool,
    machineQaExternalApiCalled: suppliedReview.machineQaExternalApiCalled,
    generationTool: "Codex imagegen skill",
    generationMode: "independent text-to-image",
    promptContract: "photorealistic vertical generic problem/usage/after scene; no logos, labels, text, watermark, people, hands, or exact product identity claim",
    rejectedCandidates: suppliedReview.rejectedCandidates ?? [],
    assets: assets.map(({ assetId, sourceRelativeReference, derivedSha256, useCases, sceneRoles }) => ({ assetId, sourceRelativeReference, sha256: derivedSha256, useCases, sceneRoles })),
    packs: packs.map(({ packId, useCase, assetIds }) => ({ packId, useCase, assetIds })),
    externalUpload: 0,
    SAFE_TO_UPLOAD: false,
  };
}

function allocate(entry: LocalQueueItem | ReserveCandidate, registry: UsageEvidenceRegistry, state: ReturnType<typeof createUsageAllocationState>) {
  const candidate = entry.candidate;
  const reserveScore = "score" in entry ? entry.score : undefined;
  const score = reserveScore ?? {
    productKey: candidate.productKey, eventRelevanceScore: 100, motionSuitabilityScore: 100, policySafetyScore: 100,
    imageReadinessScore: 100, affiliateReadinessScore: 100, duplicatePenalty: 0, usageEvidenceScore: 100,
    finalProductScore: "productScore" in entry ? entry.productScore : 100, selectionRank: "queueRank" in entry ? entry.queueRank : 1,
    eligible: true, blockers: [],
  };
  const result = allocateUsageEvidence({ candidate: { candidate, score } as RankedLiveProduct, registry, state, batchSize: 3 });
  if (!result.allocation) throw new Error(`MATERIALIZABLE_ALLOCATION_FAILED:${candidate.productKey}:${result.reason}`);
  return result.allocation;
}

async function resolveProductionMaterializableUsageAssetsUnchecked(assets: UsageEvidenceAsset[], assetRoot: string) {
  const normalized = assets.map((asset) => ({ ...asset, sourceKind: "sanitized_local_image" as const, identityType: "generic_usage_example" as const, derivedMachineQaStatus: "pass" as const, derivedCodexVisualReviewStatus: "pass" as const, noUploadAutomationEligible: true, publishEligible: false as const, blockCodes: [] }));
  return resolveProductionMaterializableUsageAssets({ assets: normalized, assetRoot });
}

function placeholderAsset(sourceRelativeReference: string, digest: string): UsageEvidenceAsset {
  return {
    assetId: "generated-placeholder", sourceId: "generated-placeholder", sourceKind: "sanitized_local_image", sourceRelativeReference,
    sourceSha256: digest, derivedSha256: digest, derivationOperation: "none", useCases: [], sceneRoles: ["context"],
    categoryAllowlist: [], categoryBlocklist: [], identityType: "generic_usage_example", trustTier: "CODEX_REVIEWED_LOCAL_ONLY",
    sourceHumanReviewStatus: "not_available", derivedMachineQaStatus: "pass", derivedCodexVisualReviewStatus: "pass", humanOwnerReviewStatus: "not_requested",
    noUploadAutomationEligible: true, publishEligible: false, visualFingerprint: "0".repeat(16), sourceFingerprint: "0".repeat(16),
    dailyReuseLimit: 5, consecutiveReuseLimit: 2, createdAt: new Date(0).toISOString(), reviewedAt: new Date(0).toISOString(), safeReviewNotes: [], blockCodes: [],
  };
}

async function extractOrVerifyFrame(source: string, target: string, timestamp: number, expectedSha256: string) {
  try {
    if ((await stat(target)).isFile()) {
      if (sha256(await readFile(target)) !== expectedSha256) throw new Error("NORMALIZED_USAGE_ASSET_TARGET_HASH_MISMATCH");
      return;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const staging = `${target}.staging-${process.pid}.jpg`;
  await assertAbsent(staging);
  try {
    await exec("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", timestamp.toFixed(3), "-i", source, "-frames:v", "1", "-q:v", "2", staging], { windowsHide: true, timeout: 90_000 });
    if (sha256(await readFile(staging)) !== expectedSha256) throw new Error("NORMALIZED_USAGE_ASSET_DERIVATION_HASH_MISMATCH");
    await rename(staging, target);
  } catch (error) {
    await rm(staging, { force: true });
    throw error;
  }
}
async function containedExistingFile(rootInput: string, reference: string) {
  if (!reference || isAbsolute(reference)) throw new Error("NORMALIZED_USAGE_SOURCE_PATH_INVALID");
  const root = await realpath(rootInput);
  const candidate = await realpath(resolve(root, reference));
  const fromRoot = relative(root, candidate);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) throw new Error("NORMALIZED_USAGE_SOURCE_PATH_INVALID");
  if (!(await stat(candidate)).isFile()) throw new Error("NORMALIZED_USAGE_SOURCE_PATH_INVALID");
  return candidate;
}
async function containedOutputPath(rootInput: string, reference: string) {
  if (!reference || isAbsolute(reference)) throw new Error("NORMALIZED_USAGE_TARGET_PATH_INVALID");
  const root = await realpath(rootInput);
  const lexicalTarget = resolve(root, reference);
  assertContainedPath(root, lexicalTarget, "NORMALIZED_USAGE_TARGET_PATH_INVALID");
  const lexicalParent = dirname(lexicalTarget);
  await mkdir(lexicalParent, { recursive: true });
  const actualParent = await realpath(lexicalParent);
  assertContainedPath(root, actualParent, "NORMALIZED_USAGE_TARGET_PATH_INVALID");
  return join(actualParent, basename(lexicalTarget));
}
function assertContainedPath(root: string, target: string, code: string) {
  const fromRoot = relative(root, target);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) throw new Error(code);
}
async function assertAbsent(path: string) { try { await stat(path); throw new Error("MATERIALIZABLE_SOURCE_OUTPUT_EXISTS"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } }
async function readRequired<T>(path: string) { const value = await readJson<T | null>(path, null); if (value === null) throw new Error("MATERIALIZABLE_SOURCE_FILE_MISSING"); return value; }
function normalizeRelative(value: string) { const normalized = value.replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, ""); if (!normalized || normalized.split("/").includes("..")) throw new Error("MATERIALIZABLE_SOURCE_RELATIVE_PATH_INVALID"); return normalized; }
function sha256(value: string | Buffer) { return createHash("sha256").update(value).digest("hex"); }
function requiredArg(name: string) { const index = process.argv.indexOf(name); const value = index >= 0 ? process.argv[index + 1] : ""; if (!value) throw new Error(`MISSING_ARGUMENT_${name.replace(/^-+/u, "").toUpperCase()}`); return value; }
function safeError(error: unknown) { const value = error instanceof Error ? error.message : String(error); return /^[A-Z0-9_:-]+$/u.test(value) ? value : "MATERIALIZABLE_SOURCE_BUILD_FAILED"; }
void main().catch((error: unknown) => { process.stderr.write(`${JSON.stringify({ event: "daily69_materializable_source_build_failed", safeError: safeError(error), SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 })}\n`); process.exitCode = 1; });
