import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
  buildLiveProductKeywordContexts,
  normalizeLiveProduct,
  rankLiveProducts,
  searchLiveCoupangProducts,
  type LiveCoupangProviderProduct,
  type LiveCoupangProviderResult,
  type RankedLiveProduct
} from "../../src/lib/live-product-video";
import type { LocalQueueItem, ReserveCandidate } from "../../src/lib/queue-scheduler/types";
import {
  buildCategoryOpportunityMatrix,
  buildOwnerMediaRequestMatrix,
  buildUnassignedSourceOpportunity,
  categoryOpportunityKeywords,
  validateUsageEvidenceRegistry,
  V4_NO_DOWNSTREAM_EXECUTION,
  type V4ProposedUseCase
} from "../../src/lib/usage-evidence";
import {
  buildSafeProviderPreflight,
  CAPACITY_PROOF_SAFETY_ENV,
  classifyProviderFailure,
  injectProcessOnlyCoupangProviderEnv,
  summarizeProviderCalls
} from "../../src/lib/usage-evidence/liveCapacityProof";
import { scanOwnerMediaInbox } from "../../src/lib/usage-evidence/ownerMediaIntakeV4";

type Arguments = {
  worktreeRoot: string;
  envFile: string;
  snapshot: string;
  queue: string;
  reserve: string;
  registry: string;
  outputRoot: string;
  maxProviderCalls: number;
  maxRawDiscoveries: number;
};

async function main() {
  const args = parseArguments();
  validatePaths(args);
  process.chdir(args.worktreeRoot);
  const previousEnv = captureEnvironment();
  try {
    const envLoad = injectProcessOnlyCoupangProviderEnv(await readFile(args.envFile, "utf8"));
    for (const [key, value] of Object.entries(CAPACITY_PROOF_SAFETY_ENV)) process.env[key] = value;
    const providerPreflight = buildSafeProviderPreflight(process.env);
    if (!providerPreflight.LIVE_PROVIDER_CONFIGURED) throw new Error("BLOCKED_LIVE_PROVIDER_NOT_CONFIGURED");

    const existingSnapshot = JSON.parse(await readFile(args.snapshot, "utf8")) as { rankedCandidates?: RankedLiveProduct[] };
    const active = JSON.parse(await readFile(args.queue, "utf8")) as LocalQueueItem[];
    const reserve = JSON.parse(await readFile(args.reserve, "utf8")) as ReserveCandidate[];
    const registry = validateUsageEvidenceRegistry(JSON.parse(await readFile(args.registry, "utf8")));
    if (!Array.isArray(existingSnapshot.rankedCandidates) || !Array.isArray(active) || !Array.isArray(reserve)) throw new Error("V4_BASELINE_ARTIFACT_NOT_READY");

    const stamp = timestamp(new Date());
    const liveRoot = join(dirname(args.outputRoot), `daily69-category-opportunity-v4-${stamp}`);
    await mkdir(join(args.outputRoot, "analysis"), { recursive: true });
    await mkdir(liveRoot, { recursive: false });

    const existingMatrix = buildCategoryOpportunityMatrix({ ranked: existingSnapshot.rankedCandidates, active, reserve });
    const discovery = existingMatrix.stopEarlyReady
      ? { results: [] as LiveCoupangProviderResult[], raw: [] as LiveCoupangProviderProduct[], ranked: [] as RankedLiveProduct[], keywords: [] as string[] }
      : await targetedDiscovery({ active, reserve, existingRanked: existingSnapshot.rankedCandidates, maxProviderCalls: args.maxProviderCalls, maxRawDiscoveries: args.maxRawDiscoveries });
    const combinedRanked = [...existingSnapshot.rankedCandidates, ...discovery.ranked];
    const matrix = buildCategoryOpportunityMatrix({ ranked: combinedRanked, active, reserve });
    const targetUseCases = [...new Set(matrix.categories.filter((entry) => entry.selected).flatMap((entry) => entry.recommendedUseCases))] as V4ProposedUseCase[];
    const sourceOpportunity = buildUnassignedSourceOpportunity({ registry, targetUseCases });
    const ownerInbox = await scanOwnerMediaInbox(process.env.USAGE_EVIDENCE_OWNER_INBOX_ROOT);
    const requestMatrix = buildOwnerMediaRequestMatrix(matrix.categories, 11);
    const calls = summarizeProviderCalls(discovery.results);
    const providerFailure = classifyProviderFailure(discovery.results);
    const decision = classifyDecision({ matrix, sourceOpportunity, ownerInbox, providerFailure });
    const targetUseCaseReport = targetUseCases.map((useCase) => {
      const opportunity = matrix.categories.find((entry) => entry.recommendedUseCases.includes(useCase));
      return {
        useCase,
        topLevelCategory: opportunity?.categoryKey ?? "",
        candidateCount: opportunity?.fullyReadyCandidates ?? 0,
        expectedActiveGain: opportunity?.potentialActiveGain ?? 0,
        existingLocalSources: sourceOpportunity.sources.filter((source) => source.newCategoryCompatibility.includes(useCase)).length,
        ownerMediaRequired: sourceOpportunity.sources.filter((source) => source.newCategoryCompatibility.includes(useCase)).length < 2,
        keywordCount: categoryOpportunityKeywords().filter((entry) => entry.useCase === useCase).length
      };
    });
    const summary = {
      schemaVersion: "category-diverse-usage-media-v4-opportunity-proof",
      decision,
      namespace: basename(liveRoot),
      baseline: { active: active.length, reserve: reserve.length, distinct: new Set([...active.map((entry) => entry.productKey), ...reserve.map((entry) => entry.candidate.productKey)]).size, activeShortfall: 69 - active.length },
      provider: {
        configured: providerPreflight.LIVE_PROVIDER_CONFIGURED,
        requestOk: providerPreflight.request_ok,
        rawValuesMasked: true,
        loadedWhitelistKeyCount: envLoad.loadedKeys.length,
        ignoredEnvKeyCount: envLoad.ignoredKeyCount,
        failure: providerFailure
      },
      discovery: { calls, raw: discovery.raw.length, normalized: discovery.ranked.length, keywords: discovery.keywords, maximumProviderCalls: args.maxProviderCalls, maximumRawDiscoveries: args.maxRawDiscoveries, budgetPass: calls.total <= args.maxProviderCalls },
      opportunity: { selectedCategories: matrix.selectedCategoryKeys, potentialAllocatableCandidates: matrix.potentialAllocatableCandidates, stopEarlyReady: matrix.stopEarlyReady },
      targetUseCases: targetUseCaseReport,
      sourceInventory: {
        validSourceCount: sourceOpportunity.validSourceCount,
        unassignedValidSources: sourceOpportunity.unassignedValidSources,
        newCategoryCompatibleSources: sourceOpportunity.newCategoryCompatibleSources,
        selectedSources: sourceOpportunity.selectedSources.length,
        rejectedPrivacy: sourceOpportunity.rejectedPrivacy,
        rejectedRights: sourceOpportunity.rejectedRights,
        rejectedStatic: sourceOpportunity.rejectedStatic
      },
      ownerInbox: {
        configured: ownerInbox.inboxConfigured,
        sourceFolders: ownerInbox.sourceFolders,
        validManifests: ownerInbox.validManifests,
        acceptedSources: ownerInbox.acceptedSources,
        blockedSources: ownerInbox.blockedSources,
        humanOwnerReviewPromoted: false,
        blocker: ownerInbox.blocker
      },
      newPacks: { total: 0, positiveGain: 0, zeroGainOmitted: 0, codexReviewed: 0 },
      run2: null,
      idempotency: null,
      policyThresholdChanges: 0,
      writes: V4_NO_DOWNSTREAM_EXECUTION
    };

    await writeJson(join(args.outputRoot, "analysis", "category-opportunity-matrix.json"), matrix);
    await writeJson(join(args.outputRoot, "analysis", "unassigned-source-opportunity.json"), sourceOpportunity);
    await writeJson(join(args.outputRoot, "analysis", "owner-media-intake-report.json"), ownerInbox);
    await writeJson(join(args.outputRoot, "analysis", "owner-sanitized-media-request-matrix.json"), requestMatrix);
    await writeJson(join(args.outputRoot, "analysis", "category-opportunity-run-summary.json"), summary);
    await writeJson(join(liveRoot, "targeted-live-candidate-snapshot.json"), {
      schemaVersion: "category-opportunity-live-candidate-snapshot-v4",
      keywords: discovery.keywords,
      calls,
      rawSafeProducts: discovery.raw,
      rankedCandidates: discovery.ranked,
      credentialsStored: false,
      requestHeadersStored: false
    });
    await writeJson(join(liveRoot, "live-opportunity-report.json"), summary);
    const security = await scanSecurityArtifacts([args.outputRoot, liveRoot], sensitiveValues(envLoad.loadedKeys), args.envFile);
    await writeJson(join(liveRoot, "security-artifact-check.json"), security);
    if (!security.pass) throw new Error("SECURITY_ARTIFACT_REDACTION_FAILED");
    console.log(JSON.stringify({ decision, providerCalls: calls.total, raw: discovery.raw.length, selectedCategories: matrix.selectedCategoryKeys.length, compatibleLocalSources: sourceOpportunity.newCategoryCompatibleSources, securityFindings: 0, ...V4_NO_DOWNSTREAM_EXECUTION }));
    return 2;
  } finally {
    restoreEnvironment(previousEnv);
  }
}

async function targetedDiscovery(input: { active: LocalQueueItem[]; reserve: ReserveCandidate[]; existingRanked: RankedLiveProduct[]; maxProviderCalls: number; maxRawDiscoveries: number }) {
  const template = buildLiveProductKeywordContexts(new Date()).contexts[0];
  if (!template) throw new Error("V4_KEYWORD_CONTEXT_NOT_AVAILABLE");
  const results: LiveCoupangProviderResult[] = [];
  const raw: LiveCoupangProviderProduct[] = [];
  const contexts = categoryOpportunityKeywords().map((entry) => ({
    ...template,
    keyword: entry.keyword,
    plan: { ...template.plan, primaryKeywords: [entry.keyword, ...template.plan.primaryKeywords.filter((keyword) => keyword !== entry.keyword)] }
  }));
  const usedKeywords: string[] = [];
  for (const context of contexts) {
    if (summarizeProviderCalls(results).total >= input.maxProviderCalls || raw.length >= input.maxRawDiscoveries) break;
    const result = await searchLiveCoupangProducts({ context, limit: Math.min(10, input.maxRawDiscoveries - raw.length), allowDeeplink: false });
    results.push(result);
    raw.push(...result.products);
    usedKeywords.push(context.keyword);
    if (result.blocker && /(HTTP_401|HTTP_403|HTTP_429|NETWORK_FAILED|RESPONSE_INVALID)$/u.test(result.blocker)) break;
    const normalized = raw.map(normalizeLiveProduct);
    const ranked = rankLiveProducts({ candidates: normalized, keywordContexts: contexts, usageEvidenceAvailable: () => true });
    const current = buildCategoryOpportunityMatrix({ ranked: [...input.existingRanked, ...ranked], active: input.active, reserve: input.reserve });
    if (current.stopEarlyReady) return { results, raw, ranked, keywords: usedKeywords };
  }
  const normalized = raw.map(normalizeLiveProduct);
  const ranked = rankLiveProducts({ candidates: normalized, keywordContexts: contexts, usageEvidenceAvailable: () => true });
  return { results, raw, ranked, keywords: usedKeywords };
}

function classifyDecision(input: {
  matrix: ReturnType<typeof buildCategoryOpportunityMatrix>;
  sourceOpportunity: ReturnType<typeof buildUnassignedSourceOpportunity>;
  ownerInbox: Awaited<ReturnType<typeof scanOwnerMediaInbox>>;
  providerFailure: string | null;
}) {
  if (input.providerFailure) return "LIVE_CATEGORY_OPPORTUNITY_INSUFFICIENT";
  const sufficientOpportunity = input.matrix.selectedCategoryKeys.length >= 3
    && input.matrix.categories.filter((entry) => entry.selected).reduce((sum, entry) => sum + entry.potentialActiveGain, 0) >= 11;
  if (!sufficientOpportunity) return "LIVE_CATEGORY_OPPORTUNITY_INSUFFICIENT";
  if (input.ownerInbox.blockedSources > 0) return "OWNER_MEDIA_INTAKE_REVIEW_BLOCKED";
  if (input.sourceOpportunity.newCategoryCompatibleSources < 2 && input.ownerInbox.acceptedSources < 2) return "OWNER_SANITIZED_MEDIA_INTAKE_REQUIRED";
  return "OWNER_MEDIA_INTAKE_REVIEW_BLOCKED";
}

async function scanSecurityArtifacts(roots: string[], secretValues: string[], envFile: string) {
  const forbidden = [
    { code: "AUTH_HEADER", pattern: /\bAuthorization\b/u },
    { code: "CEA_SIGNATURE", pattern: /CEA algorithm/u },
    { code: "ACCESS_KEY_ASSIGNMENT", pattern: /access-key=/u },
    { code: "SIGNATURE_ASSIGNMENT", pattern: /signature=/u },
    { code: "PRIVATE_KEY", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/u },
    { code: "GOOGLE_CREDENTIAL", pattern: /"type"\s*:\s*"service_account"/u },
    { code: "YOUTUBE_TOKEN", pattern: /refresh_token/u }
  ];
  const envVariants = [resolve(envFile), resolve(envFile).replace(/\\/gu, "/")];
  const findings = new Set<string>();
  let filesScanned = 0;
  for (const root of roots) {
    for (const path of await allFiles(root)) {
      if (/security-artifact-check\.json$/u.test(path)) continue;
      const text = await readFile(path, "utf8");
      filesScanned += 1;
      for (const entry of forbidden) if (entry.pattern.test(text)) findings.add(entry.code);
      if (envVariants.some((value) => text.includes(value))) findings.add("ENV_FILE_PATH");
      if (secretValues.filter((value) => value.length >= 4).some((value) => text.includes(value))) findings.add("RAW_PROVIDER_VALUE");
    }
  }
  return { schemaVersion: "usage-evidence-v4-security-artifact-check", filesScanned, findingCount: findings.size, findingCodes: [...findings].sort(), rawValuesComparedInMemoryOnly: true, envFilePathStored: false, pass: findings.size === 0 };
}

async function allFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...await allFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function parseArguments(): Arguments {
  return {
    worktreeRoot: resolve(required("--worktree-root")),
    envFile: resolve(required("--env-file")),
    snapshot: resolve(required("--snapshot")),
    queue: resolve(required("--queue")),
    reserve: resolve(required("--reserve")),
    registry: resolve(required("--registry")),
    outputRoot: resolve(required("--output-root")),
    maxProviderCalls: optionalInteger("--max-provider-calls", 20),
    maxRawDiscoveries: optionalInteger("--max-raw-discoveries", 240)
  };
}

function validatePaths(args: Arguments) {
  for (const path of [args.worktreeRoot, args.envFile, args.snapshot, args.queue, args.reserve, args.registry, args.outputRoot]) if (!isAbsolute(path)) throw new Error("ABSOLUTE_RUNTIME_INPUT_REQUIRED");
  if (args.maxProviderCalls < 0 || args.maxProviderCalls > 30) throw new Error("V4_PROVIDER_CALL_BUDGET_INVALID");
  if (args.maxRawDiscoveries < 1 || args.maxRawDiscoveries > 240) throw new Error("V4_RAW_DISCOVERY_BUDGET_INVALID");
  const outputRelative = relative(args.worktreeRoot, args.outputRoot);
  if (!outputRelative || outputRelative.startsWith("..") || isAbsolute(outputRelative) || !/^data(?:[\\/]|$)/u.test(outputRelative)) throw new Error("OUTPUT_ROOT_MUST_BE_IGNORED_WORKTREE_DATA");
  const envRelative = relative(args.worktreeRoot, args.envFile);
  if (!envRelative.startsWith("..") && !isAbsolute(envRelative)) throw new Error("ENV_FILE_MUST_BE_EXTERNAL_TO_WORKTREE");
}

function required(name: string) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1]?.trim() : "";
  if (!value) throw new Error(`${name.slice(2).replace(/-/gu, "_").toUpperCase()}_REQUIRED`);
  return value;
}

function optionalInteger(name: string, fallback: number) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value)) throw new Error(`${name.slice(2).replace(/-/gu, "_").toUpperCase()}_INVALID`);
  return value;
}

function captureEnvironment() {
  const keys = [...new Set([...Object.keys(CAPACITY_PROOF_SAFETY_ENV), "COUPANG_PARTNERS_PROVIDER_ENABLED", "COUPANG_PARTNERS_ACCESS_KEY", "COUPANG_ACCESS_KEY", "COUPANG_PARTNERS_SECRET_KEY", "COUPANG_SECRET_KEY", "COUPANG_CUSTOMER_ID", "COUPANG_PARTNER_ID", "COUPANG_PARTNERS_CUSTOMER_ID", "COUPANG_PARTNERS_BASE_URL"])] ;
  return new Map(keys.map((key) => [key, process.env[key]]));
}

function restoreEnvironment(previous: Map<string, string | undefined>) {
  for (const [key, value] of previous) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function sensitiveValues(loadedKeys: string[]) {
  return loadedKeys.filter((key) => /(?:ACCESS_KEY|SECRET_KEY|CUSTOMER_ID|PARTNER_ID)$/u.test(key)).map((key) => process.env[key] ?? "");
}

function timestamp(date: Date) {
  return date.toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14);
}

async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

void main().then((exitCode) => { process.exitCode = exitCode; }).catch((error: unknown) => {
  const safeError = error instanceof Error && /^[A-Z0-9_:-]+$/u.test(error.message) ? error.message : "V4_CATEGORY_OPPORTUNITY_FAILED";
  console.error(JSON.stringify({ result: "ERROR", safeError, ...V4_NO_DOWNSTREAM_EXECUTION }));
  process.exitCode = 1;
});
