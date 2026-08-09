import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
  buildLiveProductKeywordContexts,
  normalizeLiveProduct,
  rankLiveProducts,
  searchLiveCoupangProducts,
  type LiveCoupangProviderResult,
  type LiveProductKeywordContext
} from "../../src/lib/live-product-video";
import {
  DAILY_69_NO_UPLOAD_SETTINGS,
  LocalQueueRepository,
  runNightlyScout,
  type LocalQueueItem,
  type ReserveCandidate
} from "../../src/lib/queue-scheduler";
import {
  appendSlot069,
  assertSlot069ProviderBudget,
  buildAvailabilityEvidence,
  buildDirectRecoveryKeywords,
  buildProductBoundAllocation,
  findSingleMissingSelectedPack,
  isStableReplacementEvidence,
  replaceSelectedProductBoundPack,
  supplementalIdempotencyPassed,
  validateSlot069Pack,
  validateUsageEvidenceRegistry,
  V5_SLOT069_LIMITS,
  V5_SLOT069_NO_DOWNSTREAM_EXECUTION,
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

type Args = { worktreeRoot: string; envFile: string; outputRoot: string };
type MarginalRow = { packId: string; productKey: string; selected: boolean; zeroGainReason: string | null };
type PreviousSummary = {
  decision: string;
  marginal: { selectedPackIds: string[]; rows: MarginalRow[] };
  acceptance: { active: number; reserve: number; distinct: number };
};
type ProductPlanRow = {
  productKey: string;
  productKeyHash: string;
  referenceRelativePath: string;
  sourceProductImageSha256: string;
  productCompositeMode: string;
};
type ProductPlan = { selected: ProductPlanRow[] };
type ReviewFile = { packs: Array<{ packId: string; status: string; specificNotes: string[]; blockCodes: string[] }> };

async function main() {
  const args = parseArgs();
  validateArgs(args);
  process.chdir(args.worktreeRoot);
  const originalEnvironment = captureEnvironment();
  try {
    const envLoad = injectProcessOnlyCoupangProviderEnv(await readFile(args.envFile, "utf8"));
    for (const [key, value] of Object.entries(CAPACITY_PROOF_SAFETY_ENV)) process.env[key] = value;
    if (!buildSafeProviderPreflight(process.env).LIVE_PROVIDER_CONFIGURED) throw new Error("BLOCKED_LIVE_PROVIDER_NOT_CONFIGURED");

    const dataRoot = dirname(args.outputRoot);
    const previousSummaryPath = join(args.outputRoot, "selected-proof", "final-summary.json");
    const selectedRegistryPath = join(args.outputRoot, "selected-registry", "registry.json");
    const candidateRegistryPath = join(args.outputRoot, "candidate-registry", "registry.json");
    const productPlanPath = join(args.outputRoot, "candidate-registry", "product-plan.json");
    const reviewsPath = join(args.outputRoot, "candidate-registry", "codex-reviews.json");
    const previous = JSON.parse(await readFile(previousSummaryPath, "utf8")) as PreviousSummary;
    const selectedRegistry = validateUsageEvidenceRegistry(JSON.parse(await readFile(selectedRegistryPath, "utf8")));
    const candidateRegistry = validateUsageEvidenceRegistry(JSON.parse(await readFile(candidateRegistryPath, "utf8")));
    const productPlan = JSON.parse(await readFile(productPlanPath, "utf8")) as ProductPlan;
    const reviews = JSON.parse(await readFile(reviewsPath, "utf8")) as ReviewFile;
    const latestSelected = await latestNamespace(dataRoot, "daily69-coupang-image-skill-v5-selected-");
    const activePath = join(latestSelected, "queue.json");
    const reservePath = join(latestSelected, "reserve-pool.json");
    const active = JSON.parse(await readFile(activePath, "utf8")) as LocalQueueItem[];
    const reserve = JSON.parse(await readFile(reservePath, "utf8")) as ReserveCandidate[];
    if (previous.acceptance.active !== 68 || previous.acceptance.reserve !== 14 || previous.acceptance.distinct !== 82 || active.length !== 68 || reserve.length !== 14) throw new Error("V5_SLOT069_ORIGINAL_PROOF_INVALID");
    const immutableBefore = await digestFiles([previousSummaryPath, selectedRegistryPath, candidateRegistryPath, productPlanPath, reviewsPath, activePath, reservePath]);
    const missing = findSingleMissingSelectedPack({ selectedPackIds: previous.marginal.selectedPackIds, registry: selectedRegistry, active });

    const directRoot = await latestNamespace(dataRoot, "daily69-coupang-image-skill-v5-slot069-");
    const directEvidence = JSON.parse(await readFile(join(directRoot, "direct-recovery.json"), "utf8")) as { exactProductReappeared: boolean; calls: { total: number } };
    if (directEvidence.exactProductReappeared || directEvidence.calls.total !== 2) throw new Error("V5_SLOT069_DIRECT_FAILURE_EVIDENCE_REQUIRED");

    const activeKeys = new Set(active.map((item) => item.productKey));
    const reserveKeys = new Set(reserve.map((item) => item.candidate.productKey));
    const selectedBoundKeys = new Set(selectedRegistry.packs.filter((pack) => pack.packKind === "product_bound_synthetic_pack" && pack.boundProductKey).map((pack) => pack.boundProductKey!));
    const candidateAssets = new Map(candidateRegistry.assets.map((asset) => [asset.assetId, asset]));
    const pool = previous.marginal.rows
      .filter((row) => !row.selected && row.zeroGainReason === "MINIMAL_BALANCED_TARGET_REACHED")
      .map((row) => candidateRegistry.packs.find((pack) => pack.packId === row.packId))
      .filter((pack): pack is UsageEvidencePack => Boolean(pack?.boundProductKey))
      .filter((pack) => !activeKeys.has(pack.boundProductKey!) && !reserveKeys.has(pack.boundProductKey!) && !selectedBoundKeys.has(pack.boundProductKey!))
      .filter((pack) => validateSlot069PackCandidate(pack, candidateAssets, productPlan, reviews))
      .sort((left, right) => Number(right.identityFidelityScore ?? 0) - Number(left.identityFidelityScore ?? 0) || left.packId.localeCompare(right.packId))
      .slice(0, V5_SLOT069_LIMITS.provisionalReplacementPacks);
    if (!pool.length) throw new Error("V5_SLOT069_STABLE_LIVE_CANDIDATE_NOT_FOUND");

    const now = new Date();
    const template = buildLiveProductKeywordContexts(now).contexts[0];
    if (!template) throw new Error("V5_SLOT069_KEYWORD_CONTEXT_NOT_AVAILABLE");
    const results: LiveCoupangProviderResult[] = [];
    let selectedPack: UsageEvidencePack | null = null;
    let selectedRanked: ReturnType<typeof rankLiveProducts>[number] | null = null;
    let confirmationKeyword = "";
    const executedQueries: string[] = [];
    for (const pack of pool) {
      const contexts = buildDirectRecoveryKeywords(pack).map((keyword) => contextForKeyword(template, keyword));
      for (const context of contexts) {
        if (summarizeProviderCalls(results).total >= V5_SLOT069_LIMITS.replacementSearchCalls) break;
        const result = await searchLiveCoupangProducts({ context, limit: 10, allowDeeplink: false });
        results.push(result);
        executedQueries.push(context.keyword);
        const exact = result.products.find((product) => normalizeLiveProduct(product).productKey === pack.boundProductKey);
        if (exact) {
          const candidate = normalizeLiveProduct({ ...exact, sourceRequestId: `safe-${shortHash(exact.sourceRequestId, 12)}` });
          const ranked = rankLiveProducts({ candidates: [candidate], keywordContexts: contexts, usageEvidenceAvailable: (value) => value.productKey === pack.boundProductKey })[0] ?? null;
          if (ranked?.score.eligible && ranked.score.policySafetyScore === 100 && ranked.score.imageReadinessScore === 100 && ranked.score.affiliateReadinessScore === 100 && ranked.candidate.productImageUrls.length && ranked.candidate.selectedAffiliateUrl) {
            selectedPack = pack;
            selectedRanked = ranked;
            confirmationKeyword = context.keyword;
          }
        }
        if (selectedPack || classifyProviderFailure([result])) break;
      }
      if (selectedPack) break;
    }
    const replacementCalls = summarizeProviderCalls(results);
    const totalCalls = assertSlot069ProviderBudget({ direct: directEvidence.calls.total, replacement: replacementCalls.total, proof: 0 });
    const recoveryRoot = join(dataRoot, `daily69-coupang-image-skill-v5-slot069-${timestamp(now)}`);
    await mkdir(recoveryRoot, { recursive: false });
    if (!selectedPack || !selectedRanked) {
      await writeJson(join(recoveryRoot, "replacement-search.json"), { schemaVersion: "daily69-coupang-image-skill-v5-slot069-replacement-search", candidatePackIds: pool.map((pack) => pack.packId), queries: executedQueries, calls: replacementCalls, result: "V5_SLOT069_STABLE_LIVE_CANDIDATE_NOT_FOUND", writes: V5_SLOT069_NO_DOWNSTREAM_EXECUTION });
      await assertSafeArtifacts(recoveryRoot, args.envFile, envLoad.loadedKeys);
      console.log(JSON.stringify({ decision: "V5_SLOT069_STABLE_LIVE_CANDIDATE_NOT_FOUND", providerCalls: totalCalls, ...V5_SLOT069_NO_DOWNSTREAM_EXECUTION }));
      return 3;
    }

    const marginalRow = previous.marginal.rows.find((row) => row.packId === selectedPack!.packId)!;
    const availability = buildAvailabilityEvidence({
      productKey: selectedPack.boundProductKey!,
      observedInPrepare: productPlan.selected.some((product) => product.productKey === selectedPack!.boundProductKey),
      observedInRun1: marginalRow.zeroGainReason !== "PRODUCT_NOT_PRESENT_IN_LIVE_CANDIDATES",
      observedInRun2: active.some((item) => item.productKey === selectedPack!.boundProductKey),
      observedInTargetedRecovery: true,
      sourceKeywords: [confirmationKeyword],
      lastObservedAt: now.toISOString()
    });
    if (!isStableReplacementEvidence(availability)) throw new Error("V5_SLOT069_REPLACEMENT_AVAILABILITY_NOT_STABLE");
    const replacementPack: UsageEvidencePack = {
      ...selectedPack,
      availabilityEvidence: availability,
      replacementOfPackId: missing.pack.packId,
      replacementOfProductKey: missing.pack.boundProductKey,
      replacementReason: "SELECTED_PRODUCT_NOT_STABLE_IN_LIVE_SEARCH"
    };
    const replacement = replaceSelectedProductBoundPack({ candidateRegistry, selectedPackIds: previous.marginal.selectedPackIds, missingPackId: missing.pack.packId, replacementPack });
    const recoveryRegistry = validateUsageEvidenceRegistry({ ...replacement.selectedRegistry, generatedAt: now.toISOString() });
    const registeredReplacement = recoveryRegistry.packs.find((pack) => pack.packId === replacementPack.packId)!;
    if (!validateSlot069Pack({ pack: registeredReplacement, registry: recoveryRegistry, productKey: selectedRanked.candidate.productKey })) throw new Error("V5_SLOT069_REPLACEMENT_PACK_NOT_READY");
    const allocation = buildProductBoundAllocation({ pack: registeredReplacement, assets: new Map(recoveryRegistry.assets.map((asset) => [asset.assetId, asset])), productKey: selectedRanked.candidate.productKey });
    const recoveredQueue = appendSlot069({ active, reserve, entry: selectedRanked, allocation, now });
    const backgroundEvidence = await verifyBackgrounds(args.outputRoot, registeredReplacement.useCase);

    await writeJson(join(recoveryRoot, "settings.json"), { ...DAILY_69_NO_UPLOAD_SETTINGS, maxProviderCalls: V5_SLOT069_LIMITS.maximumProviderCalls, enabled: false, isPaused: true });
    await writeJson(join(recoveryRoot, "queue.json"), recoveredQueue);
    await writeJson(join(recoveryRoot, "reserve-pool.json"), reserve);
    await writeJson(join(recoveryRoot, "selected-registry.json"), recoveryRegistry);
    const acceptance = validateLiveCapacityAcceptance({ active: recoveredQueue, reserve, registry: recoveryRegistry, settings: DAILY_69_NO_UPLOAD_SETTINGS });
    const beforeSecond = snapshots(recoveredQueue, reserve);
    const repository = new LocalQueueRepository(recoveryRoot);
    const secondScout = acceptance.pass ? await runNightlyScout({ repository, now, usageEvidenceRegistry: recoveryRegistry, shadowMode: true }) : null;
    const afterSecond = snapshots(await repository.items(), await repository.reserveCandidates());
    const idempotency = {
      secondScoutExecuted: Boolean(secondScout),
      safeMessage: secondScout?.run.safeMessage ?? "NOT_EXECUTED",
      apiCalls: Number(secondScout?.run.metrics.apiCallCount ?? -1),
      newActive: secondScout?.queued.length ?? -1,
      newReserve: Number(secondScout?.run.metrics.reserveAdded ?? 0),
      activeUnchanged: beforeSecond.active === afterSecond.active,
      reserveUnchanged: beforeSecond.reserve === afterSecond.reserve,
      allocationUnchanged: beforeSecond.allocations === afterSecond.allocations
    };
    const idempotencyPass = supplementalIdempotencyPassed(idempotency);
    const decision = acceptance.pass && idempotencyPass
      ? "COUPANG_IMAGE_SKILL_USAGE_SCENES_V5_PROVEN_DAILY69_CAPACITY"
      : "COUPANG_IMAGE_SKILL_USAGE_SCENES_V5_PARTIAL";
    const review = reviews.packs.find((entry) => entry.packId === registeredReplacement.packId)!;
    await writeJson(join(recoveryRoot, "replacement-search.json"), {
      schemaVersion: "daily69-coupang-image-skill-v5-slot069-replacement-search",
      cachedCandidatesInspected: pool.length,
      targetedCandidates: 1,
      stableCandidates: 1,
      candidatePackIds: pool.map((pack) => pack.packId),
      selectedReplacementPackId: registeredReplacement.packId,
      selectedProductKeyHash: shortHash(selectedRanked.candidate.productKey, 16),
      queries: executedQueries,
      calls: replacementCalls,
      confirmationKeyword,
      confirmationRequestMarkerSafe: selectedRanked.candidate.sourceRequestId,
      productKeyMatched: true,
      availability,
      existingReferenceReused: true,
      existingBackgroundsReused: backgroundEvidence,
      existingCompositeScenesReused: 4,
      existingMachineQa: "pass",
      existingCodexReview: review,
      newPackGenerated: false,
      writes: V5_SLOT069_NO_DOWNSTREAM_EXECUTION
    });
    await writeJson(join(recoveryRoot, "final-summary.json"), {
      schemaVersion: "daily69-coupang-image-skill-v5-slot069-final-summary",
      decision,
      recoveryMode: "STABILITY_AWARE_REPLACEMENT_PACK",
      supplementalRecovery: true,
      originalProof: { namespace: basename(latestSelected), active: 68, reserve: 14, distinct: 82, unchanged: true },
      missing: { packId: missing.pack.packId, productKeyHash: shortHash(missing.pack.boundProductKey!, 16), useCase: missing.pack.useCase, directRecovery: "FAIL" },
      replacement: {
        packId: registeredReplacement.packId,
        productKeyHash: shortHash(selectedRanked.candidate.productKey, 16),
        useCase: registeredReplacement.useCase,
        existingEligiblePackReused: true,
        generated: false,
        backgroundGenerations: 0,
        newComposites: 0,
        identityScore: registeredReplacement.identityFidelityScore,
        machineQa: "pass",
        codexReview: "pass",
        specificNotes: review.specificNotes,
        humanOwnerReviewPromoted: false,
        publishEligible: 0
      },
      availability,
      registry: { historicalMissingPackPreservedInCandidateRegistry: true, missingPackSelected: false, replacementPackSelected: true, selectedProductBoundPackCount: recoveryRegistry.packs.filter((pack) => pack.packKind === "product_bound_synthetic_pack").length, standbyPack: null },
      supplementalContribution: { active: 1, reserve: 0, distinct: 1 },
      acceptance,
      idempotency,
      providerBudget: { direct: directEvidence.calls.total, replacement: replacementCalls.total, proof: 0, reserve: 0, total: totalCalls, maximum: V5_SLOT069_LIMITS.maximumProviderCalls },
      writes: V5_SLOT069_NO_DOWNSTREAM_EXECUTION
    });
    const immutableAfter = await digestFiles([previousSummaryPath, selectedRegistryPath, candidateRegistryPath, productPlanPath, reviewsPath, activePath, reservePath]);
    if (immutableBefore !== immutableAfter) throw new Error("V5_SLOT069_HISTORICAL_EVIDENCE_MUTATED");
    await assertSafeArtifacts(recoveryRoot, args.envFile, envLoad.loadedKeys);
    console.log(JSON.stringify({ decision, recoveryMode: "STABILITY_AWARE_REPLACEMENT_PACK", namespace: basename(recoveryRoot), providerCalls: totalCalls, replacementCalls: replacementCalls.total, backgroundGenerations: 0, newComposites: 0, active: acceptance.active, reserve: acceptance.reserve, distinct: acceptance.distinct, slot069: acceptance.slots && acceptance.ranks, secondScoutApiCalls: idempotency.apiCalls, ...V5_SLOT069_NO_DOWNSTREAM_EXECUTION }));
    return decision === "COUPANG_IMAGE_SKILL_USAGE_SCENES_V5_PROVEN_DAILY69_CAPACITY" ? 0 : 4;
  } finally {
    restoreEnvironment(originalEnvironment);
  }
}

function validateSlot069PackCandidate(pack: UsageEvidencePack, assets: Map<string, UsageEvidenceRegistry["assets"][number]>, productPlan: ProductPlan, reviews: ReviewFile) {
  const plan = productPlan.selected.find((entry) => entry.productKey === pack.boundProductKey);
  const review = reviews.packs.find((entry) => entry.packId === pack.packId);
  return Boolean(plan?.sourceProductImageSha256 && plan.referenceRelativePath && pack.assetIds.every((assetId) => assets.has(assetId)) && review?.status === "pass" && review.specificNotes.length >= 3 && review.blockCodes.length === 0);
}

async function verifyBackgrounds(outputRoot: string, useCase: string) {
  const roles = ["problem_context", "usage_background", "organized_after", "detail_background"];
  const hashes: Record<string, string> = {};
  for (const role of roles) {
    const data = await readFile(join(outputRoot, "backgrounds", useCase, `${role}.png`));
    if (data.length < 24 || data.subarray(1, 4).toString("ascii") !== "PNG") throw new Error("V5_SLOT069_BACKGROUND_NOT_READY");
    hashes[role] = sha256(data);
  }
  return { useCase, count: roles.length, hashes };
}

function parseArgs(): Args { return { worktreeRoot: resolve(required("--worktree-root")), envFile: resolve(required("--env-file")), outputRoot: resolve(required("--output-root")) }; }
function validateArgs(args: Args) { for (const value of Object.values(args)) if (!isAbsolute(value)) throw new Error("ABSOLUTE_RUNTIME_INPUT_REQUIRED"); const outputRelative = relative(args.worktreeRoot, args.outputRoot); if (!outputRelative || outputRelative.startsWith("..") || isAbsolute(outputRelative) || !/^data(?:[\\/]|$)/u.test(outputRelative)) throw new Error("OUTPUT_ROOT_MUST_BE_IGNORED_WORKTREE_DATA"); const envRelative = relative(args.worktreeRoot, args.envFile); if (!envRelative.startsWith("..") && !isAbsolute(envRelative)) throw new Error("ENV_FILE_MUST_BE_EXTERNAL_TO_WORKTREE"); }
async function latestNamespace(dataRoot: string, prefix: string) { const names = (await readdir(dataRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix)).map((entry) => entry.name).sort(); if (!names.length) throw new Error("V5_SLOT069_PRIOR_NAMESPACE_NOT_FOUND"); return join(dataRoot, names[names.length - 1]); }
function contextForKeyword(template: LiveProductKeywordContext, keyword: string): LiveProductKeywordContext { return { ...template, keyword, plan: { ...template.plan, primaryKeywords: [keyword] } }; }
function required(name: string) { const index = process.argv.indexOf(name); const value = index >= 0 ? process.argv[index + 1]?.trim() : ""; if (!value) throw new Error(`MISSING_ARGUMENT_${name.replace(/^-+/u, "").replace(/-/gu, "_").toUpperCase()}`); return value; }
async function writeJson(path: string, value: unknown) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function snapshots(active: LocalQueueItem[], reserve: ReserveCandidate[]) { return { active: sha256(JSON.stringify(active)), reserve: sha256(JSON.stringify(reserve)), allocations: sha256(JSON.stringify([...active.map((item) => item.usageEvidenceAllocation), ...reserve.map((item) => item.usageEvidenceAllocation)])) }; }
async function digestFiles(paths: string[]) { return sha256((await Promise.all(paths.map((path) => readFile(path)))).map((value) => sha256(value)).join(":")); }
async function assertSafeArtifacts(root: string, envFile: string, loadedKeys: string[]) { const sensitive = loadedKeys.map((key) => process.env[key] ?? "").filter((value) => value.length >= 6); const envVariants = [envFile, envFile.replace(/\\/gu, "/")]; const findings = new Set<string>(); for (const file of await allFiles(root)) { const text = await readFile(file, "utf8"); if (/authorization|signature|access[_ -]?key|secret[_ -]?key|google.*credential|youtube.*token/iu.test(text)) findings.add("SECRET_OR_HEADER_LABEL"); if (sensitive.some((value) => text.includes(value))) findings.add("SENSITIVE_VALUE"); if (envVariants.some((value) => text.includes(value))) findings.add("ENV_FILE_PATH"); } if (findings.size) throw new Error(`V5_SLOT069_RUNTIME_ARTIFACT_SECURITY_FAILED:${[...findings].sort().join(",")}`); }
async function allFiles(root: string): Promise<string[]> { const result: string[] = []; for (const entry of await readdir(root, { withFileTypes: true })) { const path = join(root, entry.name); if (entry.isDirectory()) result.push(...await allFiles(path)); else if (entry.isFile()) result.push(path); } return result; }
function sha256(value: string | Buffer) { return createHash("sha256").update(value).digest("hex"); }
function shortHash(value: string, length: number) { return sha256(value).slice(0, length); }
function timestamp(date: Date) { return date.toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14); }
function captureEnvironment() { return new Map(Object.entries(process.env)); }
function restoreEnvironment(snapshot: Map<string, string | undefined>) { for (const key of Object.keys(process.env)) if (!snapshot.has(key)) delete process.env[key]; for (const [key, value] of snapshot) if (value === undefined) delete process.env[key]; else process.env[key] = value; }

void main().then((code) => { process.exitCode = code; }).catch((error) => { console.error(JSON.stringify({ result: "V5_SLOT069_REPLACEMENT_FAILED", blocker: error instanceof Error ? error.message : "UNKNOWN", ...V5_SLOT069_NO_DOWNSTREAM_EXECUTION })); process.exitCode = 2; });
