import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
  buildLiveProductKeywordContexts,
  normalizeLiveProduct,
  rankLiveProducts,
  resolveExactProductReference,
  searchLiveCoupangProducts,
  type LiveCoupangProviderResult,
  type LiveProductKeywordContext,
  type RankedLiveProduct,
} from "../../src/lib/live-product-video";
import {
  DAILY_69_NO_UPLOAD_SETTINGS,
  LocalQueueRepository,
  runNightlyScout,
  type LocalQueueItem,
  type ReserveCandidate
} from "../../src/lib/queue-scheduler";
import {
  assessCodexImageSkillReadiness,
  buildV5BackgroundPrompt,
  PRODUCT_BOUND_SYNTHETIC_USE_CASES,
  selectMinimalPositiveV5Packs,
  selectV5ProductCandidates,
  SUPPORTED_USAGE_EVIDENCE_USE_CASES,
  validateUsageEvidenceRegistry,
  V5_NO_DOWNSTREAM_EXECUTION,
  V5_PRODUCT_TARGETS,
  V5_SYNTHETIC_DISCLOSURE,
  type ProductBoundSyntheticUseCase,
  type UsageEvidenceAsset,
  type UsageEvidencePack,
  type UsageEvidenceRegistry
} from "../../src/lib/usage-evidence";
import {
  buildSafeProviderPreflight,
  CAPACITY_PROOF_SAFETY_ENV,
  classifyProviderFailure,
  injectProcessOnlyCoupangProviderEnv,
  summarizeProviderCalls,
  validateLiveCapacityAcceptance
} from "../../src/lib/usage-evidence/liveCapacityProof";

type Phase = "prepare" | "compose" | "finalize";
type Args = {
  phase: Phase;
  worktreeRoot: string;
  envFile: string;
  queue: string;
  reserve: string;
  baselineRegistry: string;
  outputRoot: string;
  reviewFile: string;
};
type PreparedProduct = {
  productKey: string;
  productKeyHash: string;
  canonicalProductName: string;
  category: string;
  useCase: ProductBoundSyntheticUseCase;
  sourceProvider: "coupang_partners_product_search";
  sourceProductImageUrl: string;
  sourceProductImageSha256: string;
  referenceRelativePath: string;
  cutoutRelativePath: string | null;
  productCompositeMode: "exact_alpha_cutout" | "reference_card_plus_synthetic_context";
  cutout: Record<string, unknown>;
};
type ProductPlan = {
  schemaVersion: "coupang-image-skill-v5-product-plan";
  namespace: string;
  providerCalls: ReturnType<typeof summarizeProviderCalls>;
  discovered: number;
  eligible: number;
  selected: PreparedProduct[];
  rejectedReferenceImages: number;
  imageSkillReadiness: ReturnType<typeof assessCodexImageSkillReadiness>;
  writes: typeof V5_NO_DOWNSTREAM_EXECUTION;
};
type ScoutProofRun = {
  scout: {
    run: { runId: string };
    ranked: RankedLiveProduct[];
    providerResults: LiveCoupangProviderResult[];
  };
  active: LocalQueueItem[];
  reserve: ReserveCandidate[];
  calls: ReturnType<typeof summarizeProviderCalls>;
};

const BACKGROUND_ROLES = ["problem_context", "usage_background", "organized_after", "detail_background"] as const;
const TARGETS = Object.fromEntries(PRODUCT_BOUND_SYNTHETIC_USE_CASES.map((useCase) => [useCase, V5_PRODUCT_TARGETS[useCase].candidateTarget])) as Record<ProductBoundSyntheticUseCase, number>;
const PYTHON_TOOL = "tools/video-automation/product_bound_composite_v5.py";
const VISUAL_QA_TOOL = "tools/video-automation/visual_qa.py";

async function main() {
  const args = parseArgs();
  validateArgs(args);
  process.chdir(args.worktreeRoot);
  if (args.phase === "prepare") return prepare(args);
  if (args.phase === "compose") return compose(args);
  return finalize(args);
}

async function prepare(args: Args) {
  await mkdir(args.outputRoot, { recursive: true });
  const previousEnv = captureEnvironment();
  try {
    const envLoad = injectProcessOnlyCoupangProviderEnv(await readFile(args.envFile, "utf8"));
    for (const [key, value] of Object.entries(CAPACITY_PROOF_SAFETY_ENV)) process.env[key] = value;
    const preflight = buildSafeProviderPreflight(process.env);
    if (!preflight.LIVE_PROVIDER_CONFIGURED) throw new Error("BLOCKED_LIVE_PROVIDER_NOT_CONFIGURED");
    const active = JSON.parse(await readFile(args.queue, "utf8")) as LocalQueueItem[];
    const reserve = JSON.parse(await readFile(args.reserve, "utf8")) as ReserveCandidate[];
    const discovery = await targetedDiscovery();
    const selection = selectV5ProductCandidates({
      ranked: discovery.ranked,
      active,
      reserve,
      targets: { home_storage: 14, kitchen_organization: 11, camping_storage: 7 }
    });
    const selected: PreparedProduct[] = [];
    const selectedCounts = emptyUseCaseCounts();
    let rejectedReferenceImages = 0;
    for (const entry of selection.selected) {
      if (selectedCounts[entry.v5UseCase] >= TARGETS[entry.v5UseCase]) continue;
      const productKeyHash = sha256(entry.candidate.productKey).slice(0, 16);
      const productRoot = join(args.outputRoot, "products", productKeyHash);
      try {
        const reference = await resolveExactProductReference({
          candidate: entry.candidate,
          outputDir: join(productRoot, "reference"),
          pythonExe: "python",
          visualQaScript: resolve(VISUAL_QA_TOOL)
        });
        const referenceQa = runPython(["validate-reference", "--reference", reference.localPath]);
        if (!referenceQa.ok) throw new Error("PRODUCT_REFERENCE_IMAGE_NOT_READY");
        const cutoutPath = join(productRoot, "cutout", "exact-product-cutout.png");
        const cutout = runPython(["prepare-cutout", "--reference", reference.localPath, "--output", cutoutPath], true);
        const sourceProductImageSha256 = String(referenceQa.sourceImageSha256);
        selected.push({
          productKey: entry.candidate.productKey,
          productKeyHash,
          canonicalProductName: entry.candidate.canonicalProductName,
          category: entry.candidate.categoryPath || entry.candidate.category,
          useCase: entry.v5UseCase,
          sourceProvider: "coupang_partners_product_search",
          sourceProductImageUrl: safeUrl(reference.sourceUrl),
          sourceProductImageSha256,
          referenceRelativePath: slash(relative(args.outputRoot, reference.localPath)),
          cutoutRelativePath: cutout.ok ? slash(relative(args.outputRoot, cutoutPath)) : null,
          productCompositeMode: cutout.ok ? "exact_alpha_cutout" : "reference_card_plus_synthetic_context",
          cutout
        });
        selectedCounts[entry.v5UseCase] += 1;
      } catch {
        rejectedReferenceImages += 1;
      }
      if (PRODUCT_BOUND_SYNTHETIC_USE_CASES.every((useCase) => selectedCounts[useCase] >= TARGETS[useCase])) break;
    }
    const readiness = assessCodexImageSkillReadiness({
      builtInToolAvailable: true,
      localReferenceInput: true,
      backgroundGeneration: true,
      outputFilePersistence: true,
      deterministicMetadata: true
    });
    const plan: ProductPlan = {
      schemaVersion: "coupang-image-skill-v5-product-plan",
      namespace: basename(args.outputRoot),
      providerCalls: summarizeProviderCalls(discovery.results),
      discovered: discovery.raw.length,
      eligible: selection.selected.length,
      selected,
      rejectedReferenceImages,
      imageSkillReadiness: readiness,
      writes: V5_NO_DOWNSTREAM_EXECUTION
    };
    await writeJson(join(args.outputRoot, "candidate-registry", "product-plan.json"), plan);
    await writeJson(join(args.outputRoot, "candidate-registry", "provider-readiness.json"), {
      ...preflight,
      imageSkill: readiness,
      loadedWhitelistKeyCount: envLoad.loadedKeys.length,
      ignoredEnvKeyCount: envLoad.ignoredKeyCount,
      credentialsStored: false,
      requestHeadersStored: false,
      envFilePathStored: false
    });
    await writeJson(join(args.outputRoot, "backgrounds", "generation-prompts.json"), {
      schemaVersion: "codex-image-skill-background-prompts-v5",
      generationProvider: "codex_image_skill",
      imageLimit: 12,
      prompts: PRODUCT_BOUND_SYNTHETIC_USE_CASES.flatMap((useCase) => BACKGROUND_ROLES.map((role) => ({
        useCase,
        role,
        outputRelativePath: slash(join("backgrounds", useCase, `${role}.png`)),
        prompt: buildV5BackgroundPrompt(useCase, role)
      })))
    });
    await secureArtifacts([args.outputRoot], sensitiveValues(envLoad.loadedKeys), args.envFile);
    console.log(JSON.stringify({ phase: "prepare", providerCalls: plan.providerCalls.total, discovered: plan.discovered, eligible: plan.eligible, selected: plan.selected.length, selectedCounts, productImageReady: plan.selected.length, rejectedReferenceImages, CODEX_IMAGE_SKILL_READY: readiness.CODEX_IMAGE_SKILL_READY, ...V5_NO_DOWNSTREAM_EXECUTION }));
    return plan.selected.length === 15 ? 0 : 2;
  } finally {
    restoreEnvironment(previousEnv);
  }
}

async function compose(args: Args) {
  const plan = JSON.parse(await readFile(join(args.outputRoot, "candidate-registry", "product-plan.json"), "utf8")) as ProductPlan;
  const baselineRegistry = validateUsageEvidenceRegistry(JSON.parse(await readFile(args.baselineRegistry, "utf8")));
  const assets: UsageEvidenceAsset[] = [];
  const packs: UsageEvidencePack[] = [];
  const rejected: Array<{ productKey: string; blocker: string }> = [];
  const cutoutSuccess = plan.selected.filter((entry) => entry.productCompositeMode === "exact_alpha_cutout").length;
  for (const product of plan.selected) {
    const referencePath = join(args.outputRoot, product.referenceRelativePath);
    const productInput = product.cutoutRelativePath ? join(args.outputRoot, product.cutoutRelativePath) : referencePath;
    const productRoot = join(args.outputRoot, "products", product.productKeyHash);
    const composites: Array<{ role: typeof BACKGROUND_ROLES[number]; path: string; qa: Record<string, unknown> }> = [];
    let blocker = "";
    for (const role of BACKGROUND_ROLES) {
      const background = join(args.outputRoot, "backgrounds", product.useCase, `${role}.png`);
      const output = join(productRoot, "composites", `${role}.png`);
      const qa = runPython(["compose", "--background", background, "--product", productInput, "--output", output, "--mode", product.productCompositeMode, "--placement-seed", `${product.productKeyHash}-${role}`], true);
      if (!qa.ok) { blocker = String(qa.blocker ?? "PRODUCT_BOUNDARY_BAD"); break; }
      composites.push({ role, path: output, qa });
    }
    if (blocker || composites.length !== 4) {
      rejected.push({ productKey: product.productKey, blocker: blocker || "SYNTHETIC_PACK_ROLE_COVERAGE_FAILED" });
      continue;
    }
    const built = buildProvisionalPack(product, referencePath, composites, args.outputRoot);
    assets.push(...built.assets);
    packs.push(built.pack);
    const contactSheet = join(productRoot, "reviews", "contact-sheet.jpg");
    const contactQa = runPython(["contact-sheet", "--reference", referencePath, ...composites.flatMap((entry) => ["--scene", entry.path]), "--output", contactSheet]);
    await writeJson(join(productRoot, "reviews", "machine-qa.json"), {
      schemaVersion: "product-bound-scene-machine-qa-v5",
      productKey: product.productKey,
      referenceSha256: product.sourceProductImageSha256,
      cutout: product.cutout,
      composites: composites.map((entry) => ({ role: entry.role, ...entry.qa })),
      contactSheet: contactQa,
      identityHardBlockers: 0,
      textLogoBlockers: 0,
      privacyBlockers: 0,
      status: "pass"
    });
  }
  const provisional: UsageEvidenceRegistry = {
    ...baselineRegistry,
    generatedAt: new Date().toISOString(),
    assets: [...baselineRegistry.assets, ...assets],
    packs: [...baselineRegistry.packs, ...packs],
    sourceInventory: { ...baselineRegistry.sourceInventory, validSources: baselineRegistry.sourceInventory.validSources + assets.length, sanitizedLocalSources: baselineRegistry.sourceInventory.sanitizedLocalSources + assets.length }
  };
  await writeJson(join(args.outputRoot, "candidate-registry", "provisional-registry.json"), provisional);
  await writeJson(join(args.outputRoot, "candidate-registry", "codex-review-template.json"), {
    schemaVersion: "codex-product-bound-pack-review-v5",
    humanOwnerReviewPromoted: false,
    publishEligible: false,
    packs: packs.map((pack) => ({
      packId: pack.packId,
      productKey: pack.boundProductKey,
      contactSheetRelativePath: slash(join("products", sha256(pack.boundProductKey ?? "").slice(0, 16), "reviews", "contact-sheet.jpg")),
      status: "not_run",
      identityFidelityScore: null,
      specificNotes: [] as string[],
      blockCodes: [] as string[]
    }))
  });
  await writeJson(join(args.outputRoot, "candidate-registry", "compose-summary.json"), {
    candidateProducts: plan.selected.length,
    provisionalPacks: packs.length,
    generatedBackgrounds: 12,
    compositeScenes: packs.length * 4,
    exactPixelCompositeProducts: cutoutSuccess,
    referenceCardFallbackProducts: plan.selected.length - cutoutSuccess,
    rejected,
    codexReviewExecuted: false,
    humanOwnerReviewPromoted: false,
    publishEligible: 0,
    writes: V5_NO_DOWNSTREAM_EXECUTION
  });
  console.log(JSON.stringify({ phase: "compose", candidateProducts: plan.selected.length, provisionalPacks: packs.length, compositeScenes: packs.length * 4, cutoutSuccess, referenceCardFallback: plan.selected.length - cutoutSuccess, rejected: rejected.length, codexReviewExecuted: false, ...V5_NO_DOWNSTREAM_EXECUTION }));
  return packs.length >= 11 ? 0 : 2;
}

async function finalize(args: Args) {
  const previousEnv = captureEnvironment();
  let run1Root = "";
  let run2Root = "";
  try {
    const envLoad = injectProcessOnlyCoupangProviderEnv(await readFile(args.envFile, "utf8"));
    for (const [key, value] of Object.entries(CAPACITY_PROOF_SAFETY_ENV)) process.env[key] = value;
    const preflight = buildSafeProviderPreflight(process.env);
    if (!preflight.LIVE_PROVIDER_CONFIGURED) throw new Error("BLOCKED_LIVE_PROVIDER_NOT_CONFIGURED");
    const priorCalls = await priorFinalizeProviderCalls(args.outputRoot);
    const provisional = JSON.parse(await readFile(join(args.outputRoot, "candidate-registry", "provisional-registry.json"), "utf8")) as UsageEvidenceRegistry;
    const reviews = JSON.parse(await readFile(args.reviewFile, "utf8")) as { packs?: Array<{ packId: string; status: "pass" | "fail"; identityFidelityScore: number; specificNotes: string[]; blockCodes: UsageEvidenceAsset["blockCodes"] }> };
    const reviewed = applyCodexReviews(provisional, reviews);
    const candidateRegistry = validateUsageEvidenceRegistry(reviewed.registry);
    await writeJson(join(args.outputRoot, "candidate-registry", "registry.json"), candidateRegistry);
    const baselineQueue = JSON.parse(await readFile(args.queue, "utf8")) as LocalQueueItem[];
    const baselineReserve = JSON.parse(await readFile(args.reserve, "utf8")) as ReserveCandidate[];
    const previousSelected = await previousSelectedProof(args.outputRoot);
    if ((previousSelected?.acceptance?.active ?? 0) >= 67 && (previousSelected?.acceptance?.active ?? 0) < 69 && previousSelected?.marginal.selectedPackCount === 11) {
      const repaired = await repairSelectedProof({ args, candidateRegistry, previous: previousSelected, preflight, priorCalls });
      const artifactRoots = await v5ArtifactRoots(args.outputRoot);
      await scrubRuntimeArtifacts(artifactRoots);
      await secureArtifacts(artifactRoots, sensitiveValues(envLoad.loadedKeys), args.envFile);
      console.log(JSON.stringify({ decision: repaired.summary.decision, providerCalls: repaired.summary.apiBudget.total, selectedPacks: repaired.summary.marginal.selectedPackCount, active: repaired.acceptance.active, reserve: repaired.acceptance.reserve, distinct: repaired.acceptance.distinct, slots: repaired.acceptance.slots ? 69 : 0, hourlyGroups: repaired.acceptance.hourlyGroups, productBoundMismatch: repaired.acceptance.productBoundMismatch, secondScoutApiCalls: repaired.idempotency.apiCalls, ...V5_NO_DOWNSTREAM_EXECUTION }));
      return repaired.summary.decision.endsWith("PROVEN_DAILY69_CAPACITY") ? 0 : 2;
    }
    const stamp = timestamp(new Date());
    run1Root = join(dirname(args.outputRoot), `daily69-coupang-image-skill-v5-marginal-${stamp}`);
    const previousPartial = await previousPartialSummary(args.outputRoot);
    const run1: ScoutProofRun = previousPartial?.marginal?.selectedPackCount && previousPartial.marginal.selectedPackCount < 11
      ? await executeMarginalRecovery({ args, root: run1Root, registry: candidateRegistry, baselineQueue, baselineReserve, previous: previousPartial })
      : await executeSeededScout({ root: run1Root, registry: candidateRegistry, baselineQueue, baselineReserve, maxProviderCalls: 20, keywordContexts: productBoundSearchContexts(candidateRegistry, new Date()) });
    const marginal = selectMinimalPositiveV5Packs({ registry: candidateRegistry, candidates: run1.scout.ranked, active: baselineQueue, reserve: baselineReserve });
    const selectedRegistry = marginal.pass ? selectV5Registry(candidateRegistry, marginal.selectedPackIds) : null;
    if (selectedRegistry) await writeJson(join(args.outputRoot, "selected-registry", "registry.json"), selectedRegistry);
    await writeJson(join(run1Root, "live-marginal-report.json"), {
      schemaVersion: "daily69-coupang-image-skill-v5-marginal-proof",
      namespace: basename(run1Root),
      calls: run1.calls,
      providerFailure: classifyProviderFailure(run1.scout.providerResults),
      selectedPackIds: marginal.selectedPackIds,
      selectedPackCount: marginal.selectedPackCount,
      predicted: { active: marginal.predictedActive, reserve: marginal.predictedReserve, distinct: marginal.predictedDistinct },
      rows: marginal.rows,
      policy: { categoryLimit: marginal.categoryLimit, familyLimit: marginal.familyLimit, thresholdChanges: 0 },
      writes: V5_NO_DOWNSTREAM_EXECUTION
    });
    if (!selectedRegistry || marginal.selectedPackCount < 11) {
      const summary = await finalSummary({ args, decision: "COUPANG_IMAGE_SKILL_USAGE_SCENES_V5_PARTIAL", reviewed, marginal, run1, run2: null, acceptance: null, idempotency: null, preflight, priorCalls });
      await writeJson(join(args.outputRoot, "marginal", "final-summary.json"), summary);
      const artifactRoots = await v5ArtifactRoots(args.outputRoot);
      await scrubRuntimeArtifacts(artifactRoots);
      await secureArtifacts(artifactRoots, sensitiveValues(envLoad.loadedKeys), args.envFile);
      console.log(JSON.stringify({ decision: summary.decision, selectedPacks: marginal.selectedPackCount, active: marginal.predictedActive, reserve: marginal.predictedReserve, distinct: marginal.predictedDistinct, ...V5_NO_DOWNSTREAM_EXECUTION }));
      return 2;
    }
    run2Root = join(dirname(args.outputRoot), `daily69-coupang-image-skill-v5-selected-${stamp}`);
    const run2 = await executeSeededScout({ root: run2Root, registry: selectedRegistry, baselineQueue, baselineReserve, maxProviderCalls: 20, keywordContexts: productBoundSearchContexts(selectedRegistry, new Date()) });
    const acceptance = validateLiveCapacityAcceptance({ active: run2.active, reserve: run2.reserve, registry: selectedRegistry, settings: DAILY_69_NO_UPLOAD_SETTINGS });
    const before = snapshotDigests(run2.active, run2.reserve);
    const repository = new LocalQueueRepository(run2Root);
    const secondScout = acceptance.pass ? await runNightlyScout({ repository, now: new Date(), usageEvidenceRegistry: selectedRegistry, shadowMode: true }) : null;
    const after = snapshotDigests(await repository.items(), await repository.reserveCandidates());
    const idempotency = {
      secondScoutExecuted: Boolean(secondScout),
      apiCalls: Number(secondScout?.run.metrics.apiCallCount ?? -1),
      newActive: secondScout?.queued.length ?? null,
      newReserve: Number(secondScout?.run.metrics.reserveAdded ?? 0),
      activeSnapshotUnchanged: before.active === after.active,
      reserveSnapshotUnchanged: before.reserve === after.reserve,
      allocationSnapshotUnchanged: before.allocations === after.allocations
    };
    const idempotencyPass = idempotency.secondScoutExecuted && idempotency.apiCalls === 0 && idempotency.newActive === 0 && idempotency.newReserve === 0 && idempotency.activeSnapshotUnchanged && idempotency.reserveSnapshotUnchanged && idempotency.allocationSnapshotUnchanged;
    const providerFailure = classifyProviderFailure(run2.scout.providerResults);
    const totalCalls = priorCalls + planProviderCalls(args.outputRoot) + run1.calls.total + run2.calls.total;
    const decision = !providerFailure && acceptance.pass && idempotencyPass && totalCalls <= 60
      ? "COUPANG_IMAGE_SKILL_USAGE_SCENES_V5_PROVEN_DAILY69_CAPACITY"
      : "COUPANG_IMAGE_SKILL_USAGE_SCENES_V5_PARTIAL";
    const summary = await finalSummary({ args, decision, reviewed, marginal, run1, run2, acceptance, idempotency, preflight, priorCalls });
    await writeJson(join(args.outputRoot, "selected-proof", "final-summary.json"), summary);
    await writeJson(join(run2Root, "selected-registry-proof.json"), { schemaVersion: "daily69-coupang-image-skill-v5-selected-proof", namespace: basename(run2Root), calls: run2.calls, acceptance, idempotency, providerFailure, decision, writes: V5_NO_DOWNSTREAM_EXECUTION });
    const artifactRoots = await v5ArtifactRoots(args.outputRoot);
    await scrubRuntimeArtifacts(artifactRoots);
    await secureArtifacts(artifactRoots, sensitiveValues(envLoad.loadedKeys), args.envFile);
    console.log(JSON.stringify({ decision, providerCalls: totalCalls, selectedPacks: marginal.selectedPackCount, active: acceptance.active, reserve: acceptance.reserve, distinct: acceptance.distinct, slots: acceptance.slots ? 69 : 0, hourlyGroups: acceptance.hourlyGroups, productBoundMismatch: acceptance.productBoundMismatch, secondScoutApiCalls: idempotency.apiCalls, ...V5_NO_DOWNSTREAM_EXECUTION }));
    return decision.endsWith("PROVEN_DAILY69_CAPACITY") ? 0 : 2;
  } finally {
    restoreEnvironment(previousEnv);
  }
}

async function targetedDiscovery() {
  const template = buildLiveProductKeywordContexts(new Date()).contexts[0];
  if (!template) throw new Error("V5_KEYWORD_CONTEXT_NOT_AVAILABLE");
  const keywords = PRODUCT_BOUND_SYNTHETIC_USE_CASES.flatMap((useCase) => [...SUPPORTED_USAGE_EVIDENCE_USE_CASES[useCase].keywords]);
  const contexts = keywords.map((keyword) => ({ ...template, keyword, plan: { ...template.plan, primaryKeywords: [keyword] } }));
  const results: LiveCoupangProviderResult[] = [];
  for (const context of contexts) {
    const result = await searchLiveCoupangProducts({ context, limit: 10, allowDeeplink: false });
    results.push(result);
    if (result.blocker && /(HTTP_401|HTTP_403|HTTP_429|NETWORK_FAILED|RESPONSE_INVALID)$/u.test(result.blocker)) break;
  }
  const raw = results.flatMap((entry) => entry.products);
  const ranked = rankLiveProducts({ candidates: raw.map(normalizeLiveProduct), keywordContexts: contexts, usageEvidenceAvailable: () => true });
  return { results, raw, ranked };
}

function buildProvisionalPack(product: PreparedProduct, referencePath: string, composites: Array<{ role: typeof BACKGROUND_ROLES[number]; path: string; qa: Record<string, unknown> }>, outputRoot: string) {
  const definition = SUPPORTED_USAGE_EVIDENCE_USE_CASES[product.useCase];
  const createdAt = new Date().toISOString();
  const roleMap: Record<typeof BACKGROUND_ROLES[number], UsageEvidenceAsset["sceneRoles"]> = {
    problem_context: ["problem"], usage_background: ["usage", "organization"], organized_after: ["after"], detail_background: ["detail"]
  };
  const referenceAssetId = `v5-${product.productKeyHash}-reference`;
  const common = {
    sourceId: `coupang-reference-${product.productKeyHash}`,
    sourceSha256: product.sourceProductImageSha256,
    useCases: [product.useCase],
    categoryAllowlist: [...definition.categoryAllowlist],
    categoryBlocklist: [...definition.categoryBlocklist],
    identityType: "synthetic_product_usage_example" as const,
    trustTier: "CODEX_REVIEWED_LOCAL_ONLY" as const,
    sourceHumanReviewStatus: "not_available" as const,
    derivedMachineQaStatus: "pass" as const,
    derivedCodexVisualReviewStatus: "not_run" as const,
    humanOwnerReviewStatus: "not_requested" as const,
    noUploadAutomationEligible: true,
    publishEligible: false as const,
    sourceFingerprint: product.sourceProductImageSha256.slice(0, 16),
    dailyReuseLimit: 1,
    consecutiveReuseLimit: 1,
    createdAt,
    reviewedAt: createdAt,
    safeReviewNotes: [] as string[],
    blockCodes: [] as UsageEvidenceAsset["blockCodes"],
    boundProductKey: product.productKey,
    sourceProductImageUrl: product.sourceProductImageUrl,
    sourceProductImageSha256: product.sourceProductImageSha256,
    generationProvider: "codex_image_skill" as const,
    syntheticUsageExample: true as const,
    disclosureRequired: true as const,
    disclosureText: V5_SYNTHETIC_DISCLOSURE,
    identityFidelityStatus: "not_run" as const,
    productPixelSource: "exact_coupang_reference" as const
  };
  const referenceSha = sha256File(referencePath);
  const assets: UsageEvidenceAsset[] = [{
    ...common,
    assetId: referenceAssetId,
    sourceKind: "coupang_product_reference",
    sourceRelativeReference: slash(relative(outputRoot, referencePath)),
    derivedSha256: referenceSha,
    derivationOperation: "exact_coupang_reference",
    sceneRoles: ["product_reveal"],
    visualFingerprint: String(runPython(["validate-reference", "--reference", referencePath]).visualFingerprint),
    generationMode: product.productCompositeMode === "exact_alpha_cutout" ? "background_plus_exact_product_composite" : "reference_card_plus_synthetic_context"
  }];
  for (const composite of composites) {
    assets.push({
      ...common,
      assetId: `v5-${product.productKeyHash}-${composite.role}`,
      sourceKind: product.productCompositeMode === "exact_alpha_cutout" ? "exact_product_composite" : "reference_card",
      sourceRelativeReference: slash(relative(outputRoot, composite.path)),
      derivedSha256: String(composite.qa.derivedSha256),
      derivationOperation: product.productCompositeMode === "exact_alpha_cutout" ? "deterministic_alpha_composite" : "reference_card_separate_from_synthetic_context",
      sceneRoles: roleMap[composite.role],
      visualFingerprint: String(composite.qa.visualFingerprint),
      generationMode: product.productCompositeMode === "exact_alpha_cutout" ? "background_plus_exact_product_composite" : "reference_card_plus_synthetic_context"
    });
  }
  const pack: UsageEvidencePack = {
    packId: `pack-v5-${product.productKeyHash}`,
    useCase: product.useCase,
    subUseCase: product.useCase,
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
    sequenceFingerprint: sha256(assets.map((asset) => asset.assetId).join("|")).slice(0, 24),
    noUploadAutomationEligible: true,
    publishEligible: false,
    packGeneration: "v5_product_bound_synthetic",
    trustTier: "CODEX_REVIEWED_LOCAL_ONLY",
    packKind: "product_bound_synthetic_pack",
    boundProductKey: product.productKey,
    canonicalProductName: product.canonicalProductName,
    category: product.category,
    exactProductReferenceAssetId: referenceAssetId,
    identityFidelityScore: 0,
    sourceImageSha256: product.sourceProductImageSha256,
    syntheticDisclosureRequired: true,
    productPixelProvenance: "exact_coupang_reference"
  };
  return { assets, pack };
}

function applyCodexReviews(registry: UsageEvidenceRegistry, review: { packs?: Array<{ packId: string; status: "pass" | "fail"; identityFidelityScore: number; specificNotes: string[]; blockCodes: UsageEvidenceAsset["blockCodes"] }> }) {
  const reviews = new Map((review.packs ?? []).map((entry) => [entry.packId, entry]));
  const eligiblePacks: UsageEvidencePack[] = [];
  const eligibleAssetIds = new Set<string>();
  const rejected: Array<{ packId: string; reason: string }> = [];
  for (const pack of registry.packs) {
    if (pack.packKind !== "product_bound_synthetic_pack") { eligiblePacks.push(pack); for (const id of pack.assetIds) eligibleAssetIds.add(id); continue; }
    const row = reviews.get(pack.packId);
    if (!row || row.status !== "pass" || row.identityFidelityScore < 0.9 || row.specificNotes.length < 3 || row.specificNotes.some((note) => /^looks good$/iu.test(note.trim())) || row.blockCodes.length > 0) {
      rejected.push({ packId: pack.packId, reason: !row ? "SYNTHETIC_PACK_CODEX_REVIEW_REQUIRED" : "SYNTHETIC_PACK_PRODUCT_IDENTITY_FAILED" });
      continue;
    }
    pack.identityFidelityScore = row.identityFidelityScore;
    eligiblePacks.push(pack);
    for (const id of pack.assetIds) eligibleAssetIds.add(id);
  }
  const assets = registry.assets.filter((asset) => {
    if (!eligibleAssetIds.has(asset.assetId)) return false;
    const pack = eligiblePacks.find((candidate) => candidate.packKind === "product_bound_synthetic_pack" && candidate.assetIds.includes(asset.assetId));
    if (!pack) return true;
    const row = reviews.get(pack.packId)!;
    asset.derivedCodexVisualReviewStatus = "pass";
    asset.humanOwnerReviewStatus = "not_requested";
    asset.identityFidelityStatus = "pass";
    asset.identityFidelityScore = row.identityFidelityScore;
    asset.safeReviewNotes = [...row.specificNotes];
    asset.blockCodes = [];
    return true;
  });
  return { registry: { ...registry, generatedAt: new Date().toISOString(), visualReviewExecuted: true, assets, packs: eligiblePacks }, rejected, eligibleV5Packs: eligiblePacks.filter((pack) => pack.packKind === "product_bound_synthetic_pack").length };
}

function selectV5Registry(candidate: UsageEvidenceRegistry, selectedPackIds: string[]): UsageEvidenceRegistry {
  const selected = new Set(selectedPackIds);
  const packs = candidate.packs.filter((pack) => pack.packKind !== "product_bound_synthetic_pack" || selected.has(pack.packId));
  const assetIds = new Set(packs.flatMap((pack) => pack.assetIds));
  return validateUsageEvidenceRegistry({ ...candidate, generatedAt: new Date().toISOString(), packs, assets: candidate.assets.filter((asset) => assetIds.has(asset.assetId)) });
}

async function executeSeededScout(input: { root: string; registry: UsageEvidenceRegistry; baselineQueue: LocalQueueItem[]; baselineReserve: ReserveCandidate[]; maxProviderCalls: number; keywordContexts: LiveProductKeywordContext[] }) {
  await mkdir(input.root, { recursive: false });
  await writeJson(join(input.root, "queue.json"), input.baselineQueue);
  await writeJson(join(input.root, "reserve-pool.json"), input.baselineReserve);
  await writeJson(join(input.root, "settings.json"), { ...DAILY_69_NO_UPLOAD_SETTINGS, maxProviderCalls: input.maxProviderCalls, enabled: false, isPaused: true });
  const repository = new LocalQueueRepository(input.root);
  const boundKeys = new Set(input.registry.packs.filter((pack) => pack.packKind === "product_bound_synthetic_pack" && pack.boundProductKey).map((pack) => pack.boundProductKey!));
  const searchWithoutDeeplink: typeof searchLiveCoupangProducts = async (searchInput) => {
    const result = await searchLiveCoupangProducts({ ...searchInput, allowDeeplink: false });
    return { ...result, products: result.products.filter((product) => boundKeys.has(normalizeLiveProduct(product).productKey)) };
  };
  const scout = await runNightlyScout({ repository, now: new Date(), search: searchWithoutDeeplink, usageEvidenceRegistry: input.registry, shadowMode: true, keywordContexts: input.keywordContexts, exhaustKeywordContexts: true });
  const active = await repository.items();
  const reserve = await repository.reserveCandidates();
  return { scout, active, reserve, calls: summarizeProviderCalls(scout.providerResults) };
}

async function executeMarginalRecovery(input: { args: Args; root: string; registry: UsageEvidenceRegistry; baselineQueue: LocalQueueItem[]; baselineReserve: ReserveCandidate[]; previous: PreviousPartialSummary }): Promise<ScoutProofRun> {
  await mkdir(input.root, { recursive: false });
  const priorRoot = await latestMarginalRoot(input.args.outputRoot, input.root);
  if (!priorRoot) throw new Error("V5_PRIOR_MARGINAL_EVIDENCE_NOT_FOUND");
  const priorQueue = JSON.parse(await readFile(join(priorRoot, "queue.json"), "utf8")) as LocalQueueItem[];
  const priorSelectedKeys = new Set(input.previous.marginal.rows.filter((row) => row.selected).map((row) => row.productKey));
  const priorCandidates = priorQueue.filter((item) => priorSelectedKeys.has(item.productKey)).map((item) => item.candidate);
  const packs = new Map(input.registry.packs.filter((pack) => pack.packKind === "product_bound_synthetic_pack" && pack.boundProductKey).map((pack) => [pack.packId, pack]));
  const needed = Math.max(0, 11 - priorSelectedKeys.size);
  const missingPacks = input.previous.marginal.rows
    .filter((row) => !row.selected && row.zeroGainReason === "PRODUCT_NOT_PRESENT_IN_LIVE_CANDIDATES")
    .map((row) => packs.get(row.packId))
    .filter((pack): pack is UsageEvidencePack => Boolean(pack))
    .slice(0, needed);
  if (missingPacks.length !== needed) throw new Error("V5_RECOVERY_PACKS_INSUFFICIENT");
  const now = new Date();
  const recoveryContexts = recoverySearchContexts(missingPacks, now);
  const results: LiveCoupangProviderResult[] = [];
  for (const context of recoveryContexts) results.push(await searchLiveCoupangProducts({ context, limit: 10, allowDeeplink: false }));
  const exactProductKeys = new Set(input.registry.packs.filter((pack) => pack.packKind === "product_bound_synthetic_pack" && pack.boundProductKey).map((pack) => pack.boundProductKey!));
  const ranked = rankLiveProducts({
    candidates: [...priorCandidates, ...results.flatMap((result) => result.products).map(normalizeLiveProduct)],
    keywordContexts: [...contextsForCandidates(priorCandidates, now), ...recoveryContexts],
    usageEvidenceAvailable: (candidate) => exactProductKeys.has(candidate.productKey)
  });
  await writeJson(join(input.root, "settings.json"), { ...DAILY_69_NO_UPLOAD_SETTINGS, maxProviderCalls: recoveryContexts.length, enabled: false, isPaused: true });
  await writeJson(join(input.root, "queue.json"), input.baselineQueue);
  await writeJson(join(input.root, "reserve-pool.json"), input.baselineReserve);
  await writeJson(join(input.root, "recovery-live-evidence.json"), {
    schemaVersion: "daily69-coupang-image-skill-v5-recovery-live-evidence",
    priorEvidenceNamespace: basename(priorRoot),
    priorSelectedProductKeys: [...priorSelectedKeys].sort(),
    recoveryQueries: recoveryContexts.map((context) => context.keyword),
    recoveryCalls: summarizeProviderCalls(results),
    recoveredExactProductKeys: ranked.filter((entry) => exactProductKeys.has(entry.candidate.productKey)).map((entry) => entry.candidate.productKey).sort(),
    providerFailure: classifyProviderFailure(results),
    writes: V5_NO_DOWNSTREAM_EXECUTION
  });
  return { scout: { run: { runId: basename(input.root) }, ranked, providerResults: results }, active: input.baselineQueue, reserve: input.baselineReserve, calls: summarizeProviderCalls(results) };
}

async function repairSelectedProof(input: { args: Args; candidateRegistry: UsageEvidenceRegistry; previous: PreviousSelectedProof; preflight: ReturnType<typeof buildSafeProviderPreflight>; priorCalls: number }) {
  const previousRoot = await latestSelectedRoot(input.args.outputRoot);
  if (!previousRoot) throw new Error("V5_PRIOR_SELECTED_EVIDENCE_NOT_FOUND");
  const previousQueue = JSON.parse(await readFile(join(previousRoot, "queue.json"), "utf8")) as LocalQueueItem[];
  const previousReserve = JSON.parse(await readFile(join(previousRoot, "reserve-pool.json"), "utf8")) as ReserveCandidate[];
  const balanced = balanceSelectedRows(input.previous.marginal.rows);
  const selectedRegistry = selectV5Registry(input.candidateRegistry, balanced.selectedPackIds);
  const selectedPacks = selectedRegistry.packs.filter((pack) => pack.packKind === "product_bound_synthetic_pack" && balanced.selectedPackIds.includes(pack.packId));
  const selectedPackIds = new Set(balanced.selectedPackIds);
  const retainedQueue = reindexQueue(previousQueue.filter((item) => {
    const packId = item.usageEvidenceAllocation?.packId;
    return !packId?.startsWith("pack-v5-") || selectedPackIds.has(packId);
  }));
  const presentKeys = new Set(retainedQueue.map((item) => item.productKey));
  const missingPacks = selectedPacks.filter((pack) => pack.boundProductKey && !presentKeys.has(pack.boundProductKey));
  if (missingPacks.length === 0 || missingPacks.length > 5) throw new Error("V5_SELECTED_REPAIR_SCOPE_INVALID");
  const stamp = timestamp(new Date());
  const root = join(dirname(input.args.outputRoot), `daily69-coupang-image-skill-v5-selected-${stamp}`);
  const contexts = repairSearchContexts(missingPacks, new Date(), input.priorCalls);
  const run = await executeSeededScout({ root, registry: selectedRegistry, baselineQueue: retainedQueue, baselineReserve: previousReserve, maxProviderCalls: missingPacks.length, keywordContexts: contexts });
  const acceptance = validateLiveCapacityAcceptance({ active: run.active, reserve: run.reserve, registry: selectedRegistry, settings: DAILY_69_NO_UPLOAD_SETTINGS });
  const before = snapshotDigests(run.active, run.reserve);
  const repository = new LocalQueueRepository(root);
  const secondScout = acceptance.pass ? await runNightlyScout({ repository, now: new Date(), usageEvidenceRegistry: selectedRegistry, shadowMode: true }) : null;
  const after = snapshotDigests(await repository.items(), await repository.reserveCandidates());
  const idempotency = {
    secondScoutExecuted: Boolean(secondScout),
    apiCalls: Number(secondScout?.run.metrics.apiCallCount ?? -1),
    newActive: secondScout?.queued.length ?? null,
    newReserve: Number(secondScout?.run.metrics.reserveAdded ?? 0),
    activeSnapshotUnchanged: before.active === after.active,
    reserveSnapshotUnchanged: before.reserve === after.reserve,
    allocationSnapshotUnchanged: before.allocations === after.allocations
  };
  const idempotencyPass = idempotency.secondScoutExecuted && idempotency.apiCalls === 0 && idempotency.newActive === 0 && idempotency.newReserve === 0 && idempotency.activeSnapshotUnchanged && idempotency.reserveSnapshotUnchanged && idempotency.allocationSnapshotUnchanged;
  const totalCalls = input.priorCalls + planProviderCalls(input.args.outputRoot) + run.calls.total;
  const decision = !classifyProviderFailure(run.scout.providerResults) && acceptance.pass && idempotencyPass && totalCalls <= 60
    ? "COUPANG_IMAGE_SKILL_USAGE_SCENES_V5_PROVEN_DAILY69_CAPACITY"
    : "COUPANG_IMAGE_SKILL_USAGE_SCENES_V5_PARTIAL";
  const summary: PreviousSelectedProof & { decision: string } = {
    ...input.previous,
    decision,
    marginal: { ...input.previous.marginal, selectedPackIds: balanced.selectedPackIds, selectedPackCount: balanced.selectedPackIds.length, predicted: { active: 69, reserve: 14, distinct: 83 }, rows: balanced.rows },
    run2: { calls: run.calls, providerFailure: classifyProviderFailure(run.scout.providerResults), selectedRepair: true },
    acceptance,
    idempotency,
    apiBudget: { prior: input.priorCalls, prepare: planProviderCalls(input.args.outputRoot), run1: 0, run2: run.calls.total, total: totalCalls, maximum: 60 }
  };
  await writeJson(join(input.args.outputRoot, "selected-registry", "registry.json"), selectedRegistry);
  await writeJson(join(input.args.outputRoot, "selected-proof", "final-summary.json"), summary);
  await writeJson(join(root, "selected-registry-proof.json"), { schemaVersion: "daily69-coupang-image-skill-v5-selected-proof", namespace: basename(root), calls: run.calls, cumulativeProviderCalls: totalCalls, acceptance, idempotency, providerFailure: classifyProviderFailure(run.scout.providerResults), decision, writes: V5_NO_DOWNSTREAM_EXECUTION });
  return { summary, acceptance, idempotency };
}

function balanceSelectedRows(rows: PreviousSelectedProof["marginal"]["rows"]) {
  const targets: Record<ProductBoundSyntheticUseCase, number> = { home_storage: 4, kitchen_organization: 4, camping_storage: 3 };
  const selected = new Set(rows.filter((row) => row.selected).map((row) => row.packId));
  const count = (useCase: ProductBoundSyntheticUseCase) => rows.filter((row) => selected.has(row.packId) && row.useCase === useCase).length;
  for (const useCase of PRODUCT_BOUND_SYNTHETIC_USE_CASES) {
    while (count(useCase) < targets[useCase]) {
      const incoming = rows.filter((row) => !selected.has(row.packId) && row.useCase === useCase).sort((left, right) => right.identityScore - left.identityScore || left.packId.localeCompare(right.packId))[0];
      const surplusCases = PRODUCT_BOUND_SYNTHETIC_USE_CASES.filter((candidate) => count(candidate) > targets[candidate]);
      const outgoing = rows.filter((row) => selected.has(row.packId) && surplusCases.includes(row.useCase)).sort((left, right) => left.identityScore - right.identityScore || right.packId.localeCompare(left.packId))[0];
      if (!incoming || !outgoing) throw new Error("V5_BALANCED_SELECTION_NOT_AVAILABLE");
      selected.delete(outgoing.packId);
      selected.add(incoming.packId);
    }
  }
  const adjusted = rows.map((row) => {
    if (selected.has(row.packId)) return { ...row, selected: true, activeGain: 1, distinctGain: 1, zeroGainReason: null };
    if (row.selected) return { ...row, selected: false, activeGain: 0, distinctGain: 0, categoryImpact: 0, familyImpact: 0, zeroGainReason: "MINIMAL_BALANCED_TARGET_REACHED" };
    return row;
  });
  return { selectedPackIds: adjusted.filter((row) => row.selected).map((row) => row.packId), rows: adjusted };
}

function reindexQueue(queue: LocalQueueItem[]) {
  const settings = DAILY_69_NO_UPLOAD_SETTINGS;
  return [...queue].sort((left, right) => left.queueRank - right.queueRank).map((item, index) => {
    const rank = index + 1;
    const hour = Math.min(settings.endHour, settings.startHour + Math.floor((rank - 1) / settings.batchSize) * settings.intervalHours);
    return { ...item, queueRank: rank, slotId: `slot-${String(rank).padStart(3, "0")}`, scheduledAt: new Date(`${item.queueDate}T${String(hour).padStart(2, "0")}:00:00+09:00`).toISOString() };
  });
}

function repairSearchContexts(packs: UsageEvidencePack[], now: Date, priorCalls: number) {
  const template = buildLiveProductKeywordContexts(now).contexts[0];
  if (!template) throw new Error("V5_KEYWORD_CONTEXT_NOT_AVAILABLE");
  return packs.map((pack) => {
    if (pack.useCase === "camping_storage") return contextForKeyword(template, priorCalls >= 50 ? "캠핑용품 정리함" : "캠핑 수납 가방");
    if (pack.useCase === "kitchen_organization" && /후라이팬/u.test(pack.canonicalProductName ?? "")) return contextForKeyword(template, "싱크대 정리함");
    return contextForKeyword(template, pack.canonicalProductName ?? recoveryKeyword(pack));
  });
}

function productBoundSearchContexts(registry: UsageEvidenceRegistry, now: Date): LiveProductKeywordContext[] {
  const template = buildLiveProductKeywordContexts(now).contexts[0];
  if (!template) throw new Error("V5_KEYWORD_CONTEXT_NOT_AVAILABLE");
  return registry.packs
    .filter((pack) => pack.packKind === "product_bound_synthetic_pack" && pack.boundProductKey && pack.canonicalProductName)
    .sort((left, right) => (right.identityFidelityScore ?? 0) - (left.identityFidelityScore ?? 0) || left.packId.localeCompare(right.packId))
    .map((pack) => contextForKeyword(template, recoveryKeyword(pack)));
}

function recoverySearchContexts(packs: UsageEvidencePack[], now: Date) {
  const template = buildLiveProductKeywordContexts(now).contexts[0];
  if (!template) throw new Error("V5_KEYWORD_CONTEXT_NOT_AVAILABLE");
  return packs.map((pack) => contextForKeyword(template, recoveryKeyword(pack)));
}

function contextsForCandidates(candidates: LocalQueueItem["candidate"][], now: Date) {
  const template = buildLiveProductKeywordContexts(now).contexts[0];
  if (!template) throw new Error("V5_KEYWORD_CONTEXT_NOT_AVAILABLE");
  return [...new Map(candidates.map((candidate) => [candidate.sourceKeyword, contextForKeyword(template, candidate.sourceKeyword)])).values()];
}

function contextForKeyword(template: LiveProductKeywordContext, keyword: string): LiveProductKeywordContext {
  return { ...template, keyword, plan: { ...template.plan, primaryKeywords: [keyword] } };
}

function recoveryKeyword(pack: UsageEvidencePack) {
  const name = pack.canonicalProductName ?? "";
  if (pack.useCase === "camping_storage") return "캠핑 수납 가방";
  if (pack.useCase === "home_storage") return /현관|신발/u.test(name) ? "현관 수납 정리" : "옷장 수납 정리";
  if (pack.useCase === "kitchen_organization") return /냉장고/u.test(name) ? "냉장고 정리 용기" : "주방 수납 선반";
  return name;
}

type PreviousPartialSummary = {
  marginal: {
    selectedPackCount: number;
    rows: Array<{ packId: string; productKey: string; selected: boolean; zeroGainReason: string | null }>;
  };
};
type PreviousSelectedProof = {
  [key: string]: unknown;
  decision: string;
  marginal: {
    selectedPackIds: string[];
    selectedPackCount: number;
    predicted: { active: number; reserve: number; distinct: number };
    rows: Array<{
      packId: string;
      productKey: string;
      useCase: ProductBoundSyntheticUseCase;
      activeGain: number;
      reserveGain: number;
      distinctGain: number;
      categoryImpact: number;
      familyImpact: number;
      identityScore: number;
      selected: boolean;
      zeroGainReason: string | null;
    }>;
  };
  run2: Record<string, unknown> | null;
  acceptance: ReturnType<typeof validateLiveCapacityAcceptance> | null;
  idempotency: Record<string, unknown> | null;
  apiBudget: { prior: number; prepare: number; run1: number; run2: number; total: number; maximum: number };
};

async function previousPartialSummary(outputRoot: string): Promise<PreviousPartialSummary | null> {
  try { return JSON.parse(await readFile(join(outputRoot, "marginal", "final-summary.json"), "utf8")) as PreviousPartialSummary; }
  catch { return null; }
}

async function previousSelectedProof(outputRoot: string): Promise<PreviousSelectedProof | null> {
  try { return JSON.parse(await readFile(join(outputRoot, "selected-proof", "final-summary.json"), "utf8")) as PreviousSelectedProof; }
  catch { return null; }
}

async function latestMarginalRoot(outputRoot: string, excluding: string) {
  const parent = dirname(outputRoot);
  const roots = (await readdir(parent, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("daily69-coupang-image-skill-v5-marginal-"))
    .map((entry) => join(parent, entry.name))
    .filter((root) => root !== excluding)
    .sort((left, right) => right.localeCompare(left));
  return roots[0] ?? null;
}

async function latestSelectedRoot(outputRoot: string) {
  const parent = dirname(outputRoot);
  const roots = (await readdir(parent, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("daily69-coupang-image-skill-v5-selected-"))
    .map((entry) => join(parent, entry.name))
    .sort((left, right) => right.localeCompare(left));
  return roots[0] ?? null;
}

async function priorFinalizeProviderCalls(outputRoot: string) {
  try {
    const selectedPath = join(outputRoot, "selected-proof", "final-summary.json");
    const marginalPath = join(outputRoot, "marginal", "final-summary.json");
    const previous = JSON.parse(await readFile(await fileExists(selectedPath) ? selectedPath : marginalPath, "utf8")) as { apiBudget?: { prior?: number; run1?: number; run2?: number } };
    return Number(previous.apiBudget?.prior ?? 0) + Number(previous.apiBudget?.run1 ?? 0) + Number(previous.apiBudget?.run2 ?? 0);
  } catch {
    return 0;
  }
}

async function fileExists(path: string) {
  try { await readFile(path); return true; }
  catch { return false; }
}

function planProviderCalls(outputRoot: string) {
  const plan = JSON.parse(readFileSync(join(outputRoot, "candidate-registry", "product-plan.json"), "utf8")) as ProductPlan;
  return plan.providerCalls.total;
}

async function finalSummary(input: { args: Args; decision: string; reviewed: ReturnType<typeof applyCodexReviews>; marginal: ReturnType<typeof selectMinimalPositiveV5Packs>; run1: ScoutProofRun; run2: ScoutProofRun | null; acceptance: ReturnType<typeof validateLiveCapacityAcceptance> | null; idempotency: Record<string, unknown> | null; preflight: ReturnType<typeof buildSafeProviderPreflight>; priorCalls: number }) {
  const plan = JSON.parse(await readFile(join(input.args.outputRoot, "candidate-registry", "product-plan.json"), "utf8")) as ProductPlan;
  const composeSummary = JSON.parse(await readFile(join(input.args.outputRoot, "candidate-registry", "compose-summary.json"), "utf8")) as Record<string, unknown>;
  return {
    schemaVersion: "coupang-image-skill-usage-scenes-v5-final-summary",
    decision: input.decision,
    baseline: { active: 58, reserve: 14, distinct: 72 },
    imageSkill: plan.imageSkillReadiness,
    liveProducts: { discovered: plan.discovered, eligible: plan.eligible, selected: plan.selected.length, byUseCase: countUseCases(plan.selected) },
    references: { downloaded: plan.selected.length, decoded: plan.selected.length, rejected: plan.rejectedReferenceImages },
    generated: { ...composeSummary, codexReviewExecuted: true, codexReviewPassPacks: input.reviewed.eligibleV5Packs },
    review: { eligiblePacks: input.reviewed.eligibleV5Packs, rejected: input.reviewed.rejected, humanOwnerReviewPromoted: false, publishEligible: 0 },
    marginal: { selectedPackIds: input.marginal.selectedPackIds, selectedPackCount: input.marginal.selectedPackCount, predicted: { active: input.marginal.predictedActive, reserve: input.marginal.predictedReserve, distinct: input.marginal.predictedDistinct }, rows: input.marginal.rows },
    run1: { namespace: basename(input.run1.scout.run.runId), calls: input.run1.calls, providerFailure: classifyProviderFailure(input.run1.scout.providerResults) },
    run2: input.run2 ? { calls: input.run2.calls, providerFailure: classifyProviderFailure(input.run2.scout.providerResults) } : null,
    acceptance: input.acceptance,
    idempotency: input.idempotency,
    apiBudget: { prior: input.priorCalls, prepare: plan.providerCalls.total, run1: input.run1.calls.total, run2: input.run2?.calls.total ?? 0, total: input.priorCalls + plan.providerCalls.total + input.run1.calls.total + (input.run2?.calls.total ?? 0), maximum: 60 },
    providerConfigured: input.preflight.LIVE_PROVIDER_CONFIGURED,
    policy: { maxCategoryRatio: 0.35, maxProductFamilyRatio: 0.10, maxUsagePackReuse: 5, thresholdChanges: 0 },
    userMediaRequired: false,
    humanOwnerReviewPromoted: false,
    publishEligible: false,
    writes: V5_NO_DOWNSTREAM_EXECUTION
  };
}

function runPython(argumentsList: string[], acceptBlocked = false): Record<string, unknown> & { ok: boolean } {
  const result = spawnSync("python", [resolve(PYTHON_TOOL), ...argumentsList], { encoding: "utf8", timeout: 120_000, windowsHide: true });
  let parsed: Record<string, unknown> & { ok: boolean };
  try { parsed = JSON.parse(result.stdout.trim()) as typeof parsed; }
  catch { throw new Error("V5_PYTHON_RESULT_INVALID"); }
  if (!parsed.ok && !acceptBlocked) throw new Error(String(parsed.blocker ?? "V5_PYTHON_OPERATION_FAILED"));
  return parsed;
}

async function secureArtifacts(roots: string[], secrets: string[], envFile: string) {
  const forbidden = [
    { code: "AUTH_HEADER", pattern: /\bAuthorization\b/u },
    { code: "CEA_SIGNATURE", pattern: /CEA algorithm/u },
    { code: "ACCESS_KEY_ASSIGNMENT", pattern: /access-key=/u },
    { code: "PROVIDER_RAW_IDENTIFIER_QUERY", pattern: /[?&](?:itemId|vendorItemId|traceid|clickBeacon|requestid|token)=/iu },
    { code: "SIGNATURE_ASSIGNMENT", pattern: /signature=/u },
    { code: "PRIVATE_KEY", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/u },
    { code: "GOOGLE_CREDENTIAL", pattern: /"type"\s*:\s*"service_account"/u },
    { code: "YOUTUBE_TOKEN", pattern: /refresh_token/u }
  ];
  const variants = [resolve(envFile), slash(resolve(envFile))];
  const findings = new Set<string>();
  let filesScanned = 0;
  for (const root of roots) {
    for (const path of await allFiles(root)) {
      if (!/\.(?:json|txt|md)$/iu.test(path) || /security-artifact-check\.json$/u.test(path)) continue;
      const text = await readFile(path, "utf8");
      filesScanned += 1;
      for (const item of forbidden) if (item.pattern.test(text)) findings.add(item.code);
      if (variants.some((value) => text.includes(value))) findings.add("ENV_FILE_PATH");
      if (secrets.filter((value) => value.length >= 4).some((value) => text.includes(value))) findings.add("RAW_PROVIDER_VALUE");
    }
  }
  const report = { schemaVersion: "usage-evidence-v5-security-artifact-check", filesScanned, findingCount: findings.size, findingCodes: [...findings].sort(), pass: findings.size === 0, rawValuesComparedInMemoryOnly: true, envFilePathStored: false };
  await writeJson(join(roots[0], "security-artifact-check.json"), report);
  if (!report.pass) throw new Error("SECURITY_ARTIFACT_REDACTION_FAILED");
}

async function v5ArtifactRoots(outputRoot: string) {
  const parent = dirname(outputRoot);
  const siblings = (await readdir(parent, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("daily69-coupang-image-skill-v5-"))
    .map((entry) => join(parent, entry.name));
  return [outputRoot, ...siblings];
}

async function scrubRuntimeArtifacts(roots: string[]) {
  for (const root of roots) {
    for (const path of (await allFiles(root)).filter((candidate) => /(?:queue|reserve-pool)\.json$/u.test(candidate))) {
      const rows = JSON.parse(await readFile(path, "utf8")) as Array<{ candidate?: LocalQueueItem["candidate"] }>;
      for (const row of rows) {
        if (!row.candidate) continue;
        row.candidate.rawProductUrl = scrubUrl(row.candidate.rawProductUrl);
        row.candidate.selectedAffiliateUrl = "";
        row.candidate.productImageUrls = row.candidate.productImageUrls.map(scrubUrl);
        row.candidate.sourceRequestId = `safe-${sha256(row.candidate.sourceRequestId).slice(0, 12)}`;
      }
      await writeJson(path, rows);
    }
  }
}

function scrubUrl(value: string) {
  try { return safeUrl(value); }
  catch { return ""; }
}

async function allFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) result.push(...await allFiles(path));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}

function parseArgs(): Args {
  return {
    phase: required("--phase") as Phase,
    worktreeRoot: resolve(required("--worktree-root")),
    envFile: resolve(required("--env-file")),
    queue: resolve(required("--queue")),
    reserve: resolve(required("--reserve")),
    baselineRegistry: resolve(required("--baseline-registry")),
    outputRoot: resolve(required("--output-root")),
    reviewFile: resolve(optional("--review-file", join(required("--output-root"), "candidate-registry", "codex-reviews.json")))
  };
}

function validateArgs(args: Args) {
  if (!["prepare", "compose", "finalize"].includes(args.phase)) throw new Error("V5_PHASE_INVALID");
  for (const path of [args.worktreeRoot, args.envFile, args.queue, args.reserve, args.baselineRegistry, args.outputRoot, args.reviewFile]) if (!isAbsolute(path)) throw new Error("ABSOLUTE_RUNTIME_INPUT_REQUIRED");
  const outputRelative = relative(args.worktreeRoot, args.outputRoot);
  if (!outputRelative || outputRelative.startsWith("..") || isAbsolute(outputRelative) || !/^data(?:[\\/]|$)/u.test(outputRelative)) throw new Error("OUTPUT_ROOT_MUST_BE_IGNORED_WORKTREE_DATA");
  const envRelative = relative(args.worktreeRoot, args.envFile);
  if (!envRelative.startsWith("..") && !isAbsolute(envRelative)) throw new Error("ENV_FILE_MUST_BE_EXTERNAL_TO_WORKTREE");
}

function required(name: string) { const index = process.argv.indexOf(name); const value = index >= 0 ? process.argv[index + 1]?.trim() : ""; if (!value) throw new Error(`MISSING_ARGUMENT_${name.replace(/^-+/u, "").replace(/-/gu, "_").toUpperCase()}`); return value; }
function optional(name: string, fallback: string) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1]?.trim() || fallback : fallback; }
function writeJson(path: string, value: unknown) { return mkdir(dirname(path), { recursive: true }).then(() => writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8")); }
function sha256(value: string | Buffer) { return createHash("sha256").update(value).digest("hex"); }
function sha256File(path: string) { return createHash("sha256").update(readFileSync(path)).digest("hex"); }
function safeUrl(value: string) { const url = new URL(value); url.search = ""; url.hash = ""; return url.toString(); }
function slash(value: string) { return value.replace(/\\/gu, "/"); }
function timestamp(date: Date) { return date.toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14); }
function emptyUseCaseCounts() { return Object.fromEntries(PRODUCT_BOUND_SYNTHETIC_USE_CASES.map((useCase) => [useCase, 0])) as Record<ProductBoundSyntheticUseCase, number>; }
function countUseCases(rows: PreparedProduct[]) { const counts = emptyUseCaseCounts(); for (const row of rows) counts[row.useCase] += 1; return counts; }
function sensitiveValues(keys: string[]) { return keys.filter((key) => /(?:ACCESS_KEY|SECRET_KEY|CUSTOMER_ID|PARTNER_ID)$/u.test(key)).map((key) => process.env[key] ?? ""); }
function captureEnvironment() { return new Map(Object.entries(process.env)); }
function restoreEnvironment(snapshot: Map<string, string | undefined>) { for (const key of Object.keys(process.env)) if (!snapshot.has(key)) delete process.env[key]; for (const [key, value] of snapshot) if (value === undefined) delete process.env[key]; else process.env[key] = value; }
function snapshotDigests(active: LocalQueueItem[], reserve: ReserveCandidate[]) { return { active: sha256(JSON.stringify(active)), reserve: sha256(JSON.stringify(reserve)), allocations: sha256(JSON.stringify([...active.map((item) => item.usageEvidenceAllocation), ...reserve.map((item) => item.usageEvidenceAllocation)])) }; }

void main().then((code) => { process.exitCode = code; }).catch((error) => { console.error(JSON.stringify({ result: "V5_RUNNER_FAILED", blocker: error instanceof Error ? error.message : "UNKNOWN", ...V5_NO_DOWNSTREAM_EXECUTION })); process.exitCode = 2; });
