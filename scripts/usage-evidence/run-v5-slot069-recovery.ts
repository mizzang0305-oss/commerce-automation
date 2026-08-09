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
  attachAvailabilityEvidence,
  buildAvailabilityEvidence,
  buildDirectRecoveryKeywords,
  buildProductBoundAllocation,
  findSingleMissingSelectedPack,
  supplementalIdempotencyPassed,
  validateProductBoundPackForCandidate,
  validateSlot069Pack,
  validateUsageEvidenceRegistry,
  V5_SLOT069_LIMITS,
  V5_SLOT069_NO_DOWNSTREAM_EXECUTION
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
type PreviousSummary = {
  decision: string;
  marginal: { selectedPackIds: string[]; rows: Array<{ packId: string; selected: boolean }> };
  run1: { namespace: string };
  acceptance: { active: number; reserve: number; distinct: number };
};
type ProductPlan = { selected: Array<{ productKey: string }> };

async function main() {
  const args = parseArgs();
  validateArgs(args);
  process.chdir(args.worktreeRoot);
  const originalEnvironment = captureEnvironment();
  try {
    const envLoad = injectProcessOnlyCoupangProviderEnv(await readFile(args.envFile, "utf8"));
    for (const [key, value] of Object.entries(CAPACITY_PROOF_SAFETY_ENV)) process.env[key] = value;
    const preflight = buildSafeProviderPreflight(process.env);
    if (!preflight.LIVE_PROVIDER_CONFIGURED) throw new Error("BLOCKED_LIVE_PROVIDER_NOT_CONFIGURED");

    const dataRoot = dirname(args.outputRoot);
    const summaryPath = join(args.outputRoot, "selected-proof", "final-summary.json");
    const selectedRegistryPath = join(args.outputRoot, "selected-registry", "registry.json");
    const candidatePlanPath = join(args.outputRoot, "candidate-registry", "product-plan.json");
    const previous = JSON.parse(await readFile(summaryPath, "utf8")) as PreviousSummary;
    const selectedRegistry = validateUsageEvidenceRegistry(JSON.parse(await readFile(selectedRegistryPath, "utf8")));
    const productPlan = JSON.parse(await readFile(candidatePlanPath, "utf8")) as ProductPlan;
    const latestSelected = await latestNamespace(dataRoot, "daily69-coupang-image-skill-v5-selected-");
    const activePath = join(latestSelected, "queue.json");
    const reservePath = join(latestSelected, "reserve-pool.json");
    const active = JSON.parse(await readFile(activePath, "utf8")) as LocalQueueItem[];
    const reserve = JSON.parse(await readFile(reservePath, "utf8")) as ReserveCandidate[];
    if (previous.decision !== "COUPANG_IMAGE_SKILL_USAGE_SCENES_V5_PARTIAL"
      || previous.acceptance.active !== 68 || previous.acceptance.reserve !== 14 || previous.acceptance.distinct !== 82
      || active.length !== 68 || reserve.length !== 14) throw new Error("V5_SLOT069_ORIGINAL_PROOF_INVALID");

    const immutableBefore = await digestFiles([summaryPath, selectedRegistryPath, activePath, reservePath]);
    const missing = findSingleMissingSelectedPack({ selectedPackIds: previous.marginal.selectedPackIds, registry: selectedRegistry, active });
    const missingKey = missing.pack.boundProductKey!;
    const directKeywords = buildDirectRecoveryKeywords(missing.pack);
    const now = new Date();
    const template = buildLiveProductKeywordContexts(now).contexts[0];
    if (!template) throw new Error("V5_SLOT069_KEYWORD_CONTEXT_NOT_AVAILABLE");
    const results: LiveCoupangProviderResult[] = [];
    const contexts: LiveProductKeywordContext[] = [];
    let exactProduct: LiveCoupangProviderResult["products"][number] | null = null;
    let confirmationKeyword = "";
    for (const keyword of directKeywords) {
      const context = contextForKeyword(template, keyword);
      contexts.push(context);
      const result = await searchLiveCoupangProducts({ context, limit: 10, allowDeeplink: false });
      results.push(result);
      exactProduct = result.products.find((product) => normalizeLiveProduct(product).productKey === missingKey) ?? null;
      if (exactProduct) { confirmationKeyword = keyword; break; }
      if (classifyProviderFailure([result])) break;
    }
    const directCalls = summarizeProviderCalls(results);
    assertSlot069ProviderBudget({ direct: directCalls.total, replacement: 0, proof: 0 });

    const stamp = timestamp(now);
    const recoveryRoot = join(dataRoot, `daily69-coupang-image-skill-v5-slot069-${stamp}`);
    await mkdir(recoveryRoot, { recursive: false });
    if (!exactProduct) {
      await writeJson(join(recoveryRoot, "direct-recovery.json"), {
        schemaVersion: "daily69-coupang-image-skill-v5-slot069-direct-recovery",
        missingPackId: missing.pack.packId,
        missingProductKeyHash: shortHash(missingKey, 16),
        missingUseCase: missing.pack.useCase,
        queries: contexts.map((context) => context.keyword),
        calls: directCalls,
        exactProductReappeared: false,
        result: "MISSING_SELECTED_PRODUCT_UNAVAILABLE",
        providerFailure: classifyProviderFailure(results),
        writes: V5_SLOT069_NO_DOWNSTREAM_EXECUTION
      });
      await assertSafeArtifacts(recoveryRoot, args.envFile, envLoad.loadedKeys);
      console.log(JSON.stringify({ decision: "V5_SLOT069_STABLE_LIVE_CANDIDATE_NOT_FOUND", recoveryMode: "DIRECT_RECOVERY_FAILED", providerCalls: directCalls.total, maximumProviderCalls: V5_SLOT069_LIMITS.maximumProviderCalls, ...V5_SLOT069_NO_DOWNSTREAM_EXECUTION }));
      return 3;
    }

    const freshCandidate = normalizeLiveProduct({
      ...exactProduct,
      sourceRequestId: `safe-${shortHash(exactProduct.sourceRequestId, 12)}`
    });
    const ranked = rankLiveProducts({
      candidates: [freshCandidate],
      keywordContexts: contexts,
      usageEvidenceAvailable: (candidate) => candidate.productKey === missingKey
    }).find((entry) => entry.candidate.productKey === missingKey);
    if (!ranked || !ranked.score.eligible
      || ranked.score.policySafetyScore !== 100
      || ranked.score.imageReadinessScore !== 100
      || ranked.score.affiliateReadinessScore !== 100
      || ranked.candidate.productImageUrls.length === 0
      || !ranked.candidate.selectedAffiliateUrl) throw new Error("V5_SLOT069_DIRECT_PRODUCT_NOT_READY");
    if (!validateProductBoundPackForCandidate(missing.pack, ranked.candidate.productKey).matched) throw new Error("PRODUCT_BOUND_USAGE_PACK_MISMATCH");

    const run1Root = join(dataRoot, previous.run1.namespace);
    const run1Queue = JSON.parse(await readFile(join(run1Root, "queue.json"), "utf8")) as LocalQueueItem[];
    const availability = buildAvailabilityEvidence({
      productKey: missingKey,
      observedInPrepare: productPlan.selected.some((product) => product.productKey === missingKey),
      observedInRun1: run1Queue.some((item) => item.productKey === missingKey),
      observedInRun2: active.some((item) => item.productKey === missingKey),
      observedInTargetedRecovery: true,
      sourceKeywords: [confirmationKeyword],
      lastObservedAt: now.toISOString()
    });
    const recoveryRegistry = validateUsageEvidenceRegistry(attachAvailabilityEvidence({ registry: selectedRegistry, packId: missing.pack.packId, evidence: availability }));
    const recoveredPack = recoveryRegistry.packs.find((pack) => pack.packId === missing.pack.packId)!;
    if (!validateSlot069Pack({ pack: recoveredPack, registry: recoveryRegistry, productKey: missingKey })) throw new Error("V5_SLOT069_RECOVERED_PACK_NOT_READY");
    const allocation = buildProductBoundAllocation({ pack: recoveredPack, assets: new Map(recoveryRegistry.assets.map((asset) => [asset.assetId, asset])), productKey: missingKey });
    const recoveredQueue = appendSlot069({ active, reserve, entry: ranked, allocation, now });

    await writeJson(join(recoveryRoot, "settings.json"), { ...DAILY_69_NO_UPLOAD_SETTINGS, maxProviderCalls: V5_SLOT069_LIMITS.maximumProviderCalls, enabled: false, isPaused: true });
    await writeJson(join(recoveryRoot, "queue.json"), recoveredQueue);
    await writeJson(join(recoveryRoot, "reserve-pool.json"), reserve);
    await writeJson(join(recoveryRoot, "selected-registry.json"), recoveryRegistry);
    const acceptance = validateLiveCapacityAcceptance({ active: recoveredQueue, reserve, registry: recoveryRegistry, settings: DAILY_69_NO_UPLOAD_SETTINGS });
    const beforeSecond = snapshots(recoveredQueue, reserve);
    const repository = new LocalQueueRepository(recoveryRoot);
    const secondScout = acceptance.pass ? await runNightlyScout({ repository, now, usageEvidenceRegistry: recoveryRegistry, shadowMode: true }) : null;
    const afterActive = await repository.items();
    const afterReserve = await repository.reserveCandidates();
    const afterSecond = snapshots(afterActive, afterReserve);
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
    await writeJson(join(recoveryRoot, "direct-recovery.json"), {
      schemaVersion: "daily69-coupang-image-skill-v5-slot069-direct-recovery",
      missingPackId: missing.pack.packId,
      missingProductKeyHash: shortHash(missingKey, 16),
      missingCanonicalProductName: missing.pack.canonicalProductName,
      missingUseCase: missing.pack.useCase,
      expectedContribution: missing.expectedContribution,
      presentInPrepare: availability.observedInPrepare,
      presentInRun1: availability.observedInRun1,
      presentInRun2: availability.observedInRun2,
      selectedInMarginal: previous.marginal.rows.some((row) => row.packId === missing.pack.packId && row.selected),
      queries: contexts.map((context) => context.keyword),
      calls: directCalls,
      exactProductReappeared: true,
      confirmationKeyword,
      confirmationRequestMarkerSafe: freshCandidate.sourceRequestId,
      productKeyMatched: true,
      bindingPass: allocation.productKey === missingKey && allocation.packId === missing.pack.packId,
      availability,
      result: "DIRECT_RECOVERY_PASS",
      providerFailure: classifyProviderFailure(results),
      writes: V5_SLOT069_NO_DOWNSTREAM_EXECUTION
    });
    await writeJson(join(recoveryRoot, "final-summary.json"), {
      schemaVersion: "daily69-coupang-image-skill-v5-slot069-final-summary",
      decision,
      recoveryMode: "EXISTING_PACK_DIRECT_RECOVERY",
      supplementalRecovery: true,
      originalProof: { namespace: basename(latestSelected), active: 68, reserve: 14, distinct: 82, unchanged: true },
      missing: { packId: missing.pack.packId, productKeyHash: shortHash(missingKey, 16), useCase: missing.pack.useCase },
      directRecovery: { queries: contexts.map((context) => context.keyword), calls: directCalls, exactProductReappeared: true, bindingPass: true },
      replacement: { generated: false, packId: null, newComposites: 0, backgroundGenerations: 0 },
      availability,
      supplementalContribution: { active: 1, reserve: 0, distinct: 1 },
      acceptance,
      idempotency,
      providerBudget: { direct: directCalls.total, replacement: 0, proof: 0, reserve: 0, total: directCalls.total, maximum: V5_SLOT069_LIMITS.maximumProviderCalls },
      selectedProductBoundPackCount: recoveryRegistry.packs.filter((pack) => pack.packKind === "product_bound_synthetic_pack").length,
      historicalMissingPackPreserved: true,
      missingPackSelected: true,
      replacementPackSelected: false,
      standbyPack: null,
      writes: V5_SLOT069_NO_DOWNSTREAM_EXECUTION
    });
    const immutableAfter = await digestFiles([summaryPath, selectedRegistryPath, activePath, reservePath]);
    if (immutableBefore !== immutableAfter) throw new Error("V5_SLOT069_HISTORICAL_EVIDENCE_MUTATED");
    await assertSafeArtifacts(recoveryRoot, args.envFile, envLoad.loadedKeys);
    console.log(JSON.stringify({ decision, recoveryMode: "EXISTING_PACK_DIRECT_RECOVERY", namespace: basename(recoveryRoot), providerCalls: directCalls.total, active: acceptance.active, reserve: acceptance.reserve, distinct: acceptance.distinct, slot069: acceptance.slots && acceptance.ranks, secondScoutApiCalls: idempotency.apiCalls, ...V5_SLOT069_NO_DOWNSTREAM_EXECUTION }));
    return decision === "COUPANG_IMAGE_SKILL_USAGE_SCENES_V5_PROVEN_DAILY69_CAPACITY" ? 0 : 4;
  } finally {
    restoreEnvironment(originalEnvironment);
  }
}

function parseArgs(): Args {
  return {
    worktreeRoot: resolve(required("--worktree-root")),
    envFile: resolve(required("--env-file")),
    outputRoot: resolve(required("--output-root"))
  };
}

function validateArgs(args: Args) {
  for (const value of Object.values(args)) if (!isAbsolute(value)) throw new Error("ABSOLUTE_RUNTIME_INPUT_REQUIRED");
  const outputRelative = relative(args.worktreeRoot, args.outputRoot);
  if (!outputRelative || outputRelative.startsWith("..") || isAbsolute(outputRelative) || !/^data(?:[\\/]|$)/u.test(outputRelative)) throw new Error("OUTPUT_ROOT_MUST_BE_IGNORED_WORKTREE_DATA");
  const envRelative = relative(args.worktreeRoot, args.envFile);
  if (!envRelative.startsWith("..") && !isAbsolute(envRelative)) throw new Error("ENV_FILE_MUST_BE_EXTERNAL_TO_WORKTREE");
}

async function latestNamespace(dataRoot: string, prefix: string) {
  const names = (await readdir(dataRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix)).map((entry) => entry.name).sort();
  if (!names.length) throw new Error("V5_SLOT069_PRIOR_NAMESPACE_NOT_FOUND");
  return join(dataRoot, names[names.length - 1]);
}

function contextForKeyword(template: LiveProductKeywordContext, keyword: string): LiveProductKeywordContext {
  return { ...template, keyword, plan: { ...template.plan, primaryKeywords: [keyword] } };
}

function required(name: string) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1]?.trim() : "";
  if (!value) throw new Error(`MISSING_ARGUMENT_${name.replace(/^-+/u, "").replace(/-/gu, "_").toUpperCase()}`);
  return value;
}

async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function snapshots(active: LocalQueueItem[], reserve: ReserveCandidate[]) {
  return {
    active: sha256(JSON.stringify(active)),
    reserve: sha256(JSON.stringify(reserve)),
    allocations: sha256(JSON.stringify([...active.map((item) => item.usageEvidenceAllocation), ...reserve.map((item) => item.usageEvidenceAllocation)]))
  };
}

async function digestFiles(paths: string[]) {
  return sha256((await Promise.all(paths.map((path) => readFile(path)))).map((value) => sha256(value)).join(":"));
}

async function assertSafeArtifacts(root: string, envFile: string, loadedKeys: string[]) {
  const sensitive = loadedKeys.map((key) => process.env[key] ?? "").filter((value) => value.length >= 6);
  const envVariants = [envFile, envFile.replace(/\\/gu, "/")];
  const files = await allFiles(root);
  const findings = new Set<string>();
  for (const file of files) {
    const text = await readFile(file, "utf8");
    if (/authorization|signature|access[_ -]?key|secret[_ -]?key|google.*credential|youtube.*token/iu.test(text)) findings.add("SECRET_OR_HEADER_LABEL");
    if (sensitive.some((value) => text.includes(value))) findings.add("SENSITIVE_VALUE");
    if (envVariants.some((value) => text.includes(value))) findings.add("ENV_FILE_PATH");
  }
  if (findings.size) throw new Error(`V5_SLOT069_RUNTIME_ARTIFACT_SECURITY_FAILED:${[...findings].sort().join(",")}`);
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

function sha256(value: string | Buffer) { return createHash("sha256").update(value).digest("hex"); }
function shortHash(value: string, length: number) { return sha256(value).slice(0, length); }
function timestamp(date: Date) { return date.toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14); }
function captureEnvironment() { return new Map(Object.entries(process.env)); }
function restoreEnvironment(snapshot: Map<string, string | undefined>) { for (const key of Object.keys(process.env)) if (!snapshot.has(key)) delete process.env[key]; for (const [key, value] of snapshot) if (value === undefined) delete process.env[key]; else process.env[key] = value; }

void main().then((code) => { process.exitCode = code; }).catch((error) => {
  console.error(JSON.stringify({ result: "V5_SLOT069_RECOVERY_FAILED", blocker: error instanceof Error ? error.message : "UNKNOWN", ...V5_SLOT069_NO_DOWNSTREAM_EXECUTION }));
  process.exitCode = 2;
});
