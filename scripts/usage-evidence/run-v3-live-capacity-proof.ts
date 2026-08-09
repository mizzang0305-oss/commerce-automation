import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
  DAILY_69_NO_UPLOAD_SETTINGS,
  LocalQueueRepository,
  QUEUE_SCHEDULER_FLAGS,
  runNightlyScout
} from "../../src/lib/queue-scheduler";
import {
  evaluateV3MarginalPacks,
  selectV3Registry,
  type UsageEvidenceRegistry
} from "../../src/lib/usage-evidence";
import {
  buildSafeLiveCandidateSnapshot,
  buildSafeProviderPreflight,
  CAPACITY_PROOF_SAFETY_ENV,
  classifyProviderFailure,
  injectProcessOnlyCoupangProviderEnv,
  summarizeProviderCalls,
  validateLiveCapacityAcceptance,
  verifyV3LocalArtifacts
} from "../../src/lib/usage-evidence/liveCapacityProof";

const SAFETY_WRITES = Object.freeze({
  ...QUEUE_SCHEDULER_FLAGS,
  CONTROL_COMMAND_EXECUTION: 0,
  VIDEO_RENDER: 0,
  TTS: 0,
  ASR: 0,
  WHISPERX: 0,
  WORKER_CHANGE: 0,
  SCHEDULER_CHANGE: 0
});

type ProofArguments = {
  worktreeRoot: string;
  envFile: string;
  baselineRegistry: string;
  candidateRegistry: string;
  outputRoot: string;
  priorProviderCalls: number;
};

async function main() {
  const args = parseArguments();
  validatePaths(args);
  process.chdir(args.worktreeRoot);
  const previousEnv = captureEnvironment();
  let proofRoot = "";
  let run1Root = "";
  let run2Root = "";
  try {
    const envLoad = injectProcessOnlyCoupangProviderEnv(await readFile(args.envFile, "utf8"));
    for (const [key, value] of Object.entries(CAPACITY_PROOF_SAFETY_ENV)) process.env[key] = value;
    const stamp = timestamp(new Date());
    proofRoot = join(args.outputRoot, `v3-live-capacity-proof-${stamp}`);
    await mkdir(proofRoot, { recursive: false });

    const providerPreflight = buildSafeProviderPreflight(process.env);
    await writeJson(join(proofRoot, "provider-readiness.json"), {
      ...providerPreflight,
      loaded_whitelist_key_count: envLoad.loadedKeys.length,
      ignored_env_key_count: envLoad.ignoredKeyCount,
      env_file_path_stored: false
    });

    const artifactRoot = dirname(args.candidateRegistry);
    const artifacts = await verifyV3LocalArtifacts({
      baselineRegistryPath: args.baselineRegistry,
      candidateRegistryPath: args.candidateRegistry,
      artifactRoot
    });
    await writeJson(join(proofRoot, "artifact-preflight.json"), artifacts.report);

    if (!artifacts.report.ready) {
      const summary = blockedSummary("V3_LOCAL_ARTIFACT_NOT_READY", providerPreflight, artifacts.report);
      await finishProof({ proofRoot, roots: [proofRoot], summary, secrets: sensitiveProviderValues(envLoad.loadedKeys), envFile: args.envFile });
      return 2;
    }
    if (!providerPreflight.LIVE_PROVIDER_CONFIGURED) {
      const summary = blockedSummary("BLOCKED_LIVE_PROVIDER_NOT_CONFIGURED", providerPreflight, artifacts.report);
      await finishProof({ proofRoot, roots: [proofRoot], summary, secrets: sensitiveProviderValues(envLoad.loadedKeys), envFile: args.envFile });
      return 2;
    }

    run1Root = join(args.outputRoot, `daily69-v3-live-marginal-${stamp}`);
    const run1 = await executeScoutRun({
      root: run1Root,
      registry: artifacts.baselineRegistry,
      now: new Date(),
      maxProviderCalls: Math.min(30, 60 - args.priorProviderCalls)
    });
    const marginal = evaluateV3MarginalPacks({
      ranked: run1.scout.ranked,
      baselineRegistry: artifacts.baselineRegistry,
      candidateRegistry: artifacts.candidateRegistry,
      settings: DAILY_69_NO_UPLOAD_SETTINGS,
      rawCount: run1.snapshot.counters.raw,
      normalizedCount: run1.snapshot.counters.normalized
    });
    const run1Failure = classifyProviderFailure(run1.scout.providerResults);
    let selectedRegistry: UsageEvidenceRegistry | null = null;
    if (marginal.result === "TARGET_REACHED" && marginal.selectedPackIds.length > 0) {
      selectedRegistry = selectV3Registry(artifacts.candidateRegistry, marginal.selectedPackIds);
      await writeJson(join(run1Root, "selected-registry.json"), selectedRegistry);
    }
    const run1Report = {
      schemaVersion: "daily69-v3-live-marginal-proof",
      namespace: basename(run1Root),
      provider: { configured: true, failure: run1Failure },
      calls: run1.calls,
      counters: run1.snapshot.counters,
      baseline: marginal.baseline,
      candidatePacksEvaluated: artifacts.report.v3_candidate_packs,
      selectedPackIds: marginal.selectedPackIds,
      selectedPackCount: marginal.selectedPackIds.length,
      zeroGainPackIds: marginal.zeroGainPackIds,
      zeroGainCount: marginal.zeroGainPackIds.length,
      gains: marginal.steps,
      packEvaluations: marginal.packEvaluations,
      predicted: marginal.final,
      selectedRegistry: selectedRegistry ? {
        packs: selectedRegistry.packs.length,
        v3Packs: selectedRegistry.packs.filter((pack) => pack.packGeneration === "v3_motion").length,
        assets: selectedRegistry.assets.length,
        publishEligible: selectedRegistry.assets.filter((asset) => asset.publishEligible).length + selectedRegistry.packs.filter((pack) => pack.publishEligible).length
      } : null,
      result: run1Failure ?? marginal.result,
      writes: SAFETY_WRITES
    };
    await writeJson(join(run1Root, "live-marginal-report.json"), run1Report);

    if (run1Failure || marginal.result !== "TARGET_REACHED" || !selectedRegistry) {
      const decision = classifyRun1Decision(run1Failure, marginal);
      const summary = {
        schemaVersion: "daily69-v3-configured-live-proof-summary",
        decision,
        providerConfigured: true,
        artifactReady: true,
        run1: safeRunReference(run1Root, run1.calls, marginal.final.active, marginal.final.reserve, marginal.final.distinct, run1Report.result),
        run2: null,
        idempotency: null,
        apiBudget: { prior: args.priorProviderCalls, current: run1.calls.total, total: args.priorProviderCalls + run1.calls.total, maximum: 60, pass: args.priorProviderCalls + run1.calls.total <= 60 },
        writes: SAFETY_WRITES
      };
      await finishProof({ proofRoot, roots: [proofRoot, run1Root], summary, secrets: sensitiveProviderValues(envLoad.loadedKeys), envFile: args.envFile });
      return 2;
    }

    run2Root = join(args.outputRoot, `daily69-v3-selected-proof-${stamp}`);
    const remainingCalls = 60 - args.priorProviderCalls - run1.calls.total;
    if (remainingCalls < 1) throw new Error("PROVIDER_CALL_BUDGET_EXHAUSTED");
    const run2 = await executeScoutRun({ root: run2Root, registry: selectedRegistry, now: new Date(), maxProviderCalls: Math.min(30, remainingCalls) });
    const acceptance = validateLiveCapacityAcceptance({
      active: run2.active,
      reserve: run2.reserve,
      registry: selectedRegistry,
      settings: DAILY_69_NO_UPLOAD_SETTINGS
    });
    const before = snapshotDigests(run2.active, run2.reserve);
    let secondScout: Awaited<ReturnType<typeof runNightlyScout>> | null = null;
    let after = before;
    if (acceptance.pass) {
      const repository = new LocalQueueRepository(run2Root);
      secondScout = await runNightlyScout({ repository, now: new Date(), usageEvidenceRegistry: selectedRegistry, shadowMode: true });
      after = snapshotDigests(await repository.items(), await repository.reserveCandidates());
    }
    const run2Failure = classifyProviderFailure(run2.scout.providerResults);
    const secondCalls = secondScout ? summarizeProviderCalls(secondScout.providerResults) : { search: 0, deeplink: 0, total: 0 };
    const idempotency = {
      secondScoutExecuted: Boolean(secondScout),
      secondScoutApiCalls: Number(secondScout?.run.metrics.apiCallCount ?? -1),
      newActive: secondScout?.queued.length ?? null,
      newReserve: Number(secondScout?.run.metrics.reserveAdded ?? 0),
      activeSnapshotUnchanged: before.active === after.active,
      reserveSnapshotUnchanged: before.reserve === after.reserve,
      allocationSnapshotUnchanged: before.allocations === after.allocations,
      status: secondScout?.run.safeMessage ?? "NOT_RUN",
      calls: secondCalls
    };
    const idempotencyPass = idempotency.secondScoutExecuted
      && idempotency.secondScoutApiCalls === 0
      && idempotency.newActive === 0
      && idempotency.newReserve === 0
      && idempotency.activeSnapshotUnchanged
      && idempotency.reserveSnapshotUnchanged
      && idempotency.allocationSnapshotUnchanged;
    const currentCalls = run1.calls.total + run2.calls.total + secondCalls.total;
    const totalCalls = args.priorProviderCalls + currentCalls;
    const result = !run2Failure && acceptance.pass && idempotencyPass && totalCalls <= 60
      ? "SANITIZED_USAGE_SOURCE_PACKS_V3_PROVEN_DAILY69_CAPACITY"
      : run2Failure ?? "LIVE_PROVIDER_OPERATIONAL_BLOCKED";
    const run2Report = {
      schemaVersion: "daily69-v3-selected-registry-proof",
      namespace: basename(run2Root),
      calls: run2.calls,
      counters: run2.snapshot.counters,
      acceptance,
      idempotency,
      providerFailure: run2Failure,
      result,
      writes: SAFETY_WRITES
    };
    await writeJson(join(run2Root, "selected-registry-proof.json"), run2Report);
    const summary = {
      schemaVersion: "daily69-v3-configured-live-proof-summary",
      decision: result,
      providerConfigured: true,
      artifactReady: true,
      run1: safeRunReference(run1Root, run1.calls, marginal.final.active, marginal.final.reserve, marginal.final.distinct, marginal.result),
      selectedPacks: marginal.selectedPackIds,
      gains: marginal.steps,
      packEvaluations: marginal.packEvaluations,
      run2: safeRunReference(run2Root, run2.calls, acceptance.active, acceptance.reserve, acceptance.distinct, result),
      acceptance,
      idempotency,
      apiBudget: { prior: args.priorProviderCalls, run1: run1.calls.total, run2: run2.calls.total, secondScout: secondCalls.total, current: currentCalls, total: totalCalls, maximum: 60, pass: totalCalls <= 60 },
      writes: SAFETY_WRITES
    };
    await finishProof({ proofRoot, roots: [proofRoot, run1Root, run2Root], summary, secrets: sensitiveProviderValues(envLoad.loadedKeys), envFile: args.envFile });
    return result === "SANITIZED_USAGE_SOURCE_PACKS_V3_PROVEN_DAILY69_CAPACITY" ? 0 : 2;
  } finally {
    restoreEnvironment(previousEnv);
  }
}

async function executeScoutRun(input: { root: string; registry: UsageEvidenceRegistry; now: Date; maxProviderCalls: number }) {
  await mkdir(input.root, { recursive: false });
  const repository = new LocalQueueRepository(input.root);
  await repository.writeSettings({ ...DAILY_69_NO_UPLOAD_SETTINGS, maxProviderCalls: input.maxProviderCalls, enabled: false, isPaused: true });
  const scout = await runNightlyScout({ repository, now: input.now, usageEvidenceRegistry: input.registry, shadowMode: true });
  const active = await repository.items();
  const reserve = await repository.reserveCandidates();
  const snapshot = buildSafeLiveCandidateSnapshot({ raw: scout.rawCandidates, normalized: scout.normalizedCandidates, ranked: scout.ranked });
  await mkdir(join(input.root, "capacity"), { recursive: true });
  await writeJson(join(input.root, "capacity", "full-live-candidate-snapshot.json"), snapshot);
  return { scout, active, reserve, snapshot, calls: summarizeProviderCalls(scout.providerResults) };
}

async function finishProof(input: { proofRoot: string; roots: string[]; summary: unknown; secrets: string[]; envFile: string }) {
  await writeJson(join(input.proofRoot, "final-summary.json"), input.summary);
  const security = await scanSecurityArtifacts(input.roots, input.secrets, input.envFile);
  await writeJson(join(input.proofRoot, "security-artifact-check.json"), security);
  if (!security.pass) throw new Error("SECURITY_ARTIFACT_REDACTION_FAILED");
  console.log(JSON.stringify({ result: (input.summary as { decision?: string }).decision ?? "UNKNOWN", proofRootStored: false, securityFindings: 0, ...SAFETY_WRITES }));
}

async function scanSecurityArtifacts(roots: string[], secrets: string[], envFile: string) {
  const forbidden = [
    { code: "AUTH_HEADER", pattern: /\bAuthorization\b/u },
    { code: "CEA_SIGNATURE", pattern: /CEA algorithm/u },
    { code: "ACCESS_KEY_ASSIGNMENT", pattern: /access-key=/u },
    { code: "SIGNATURE_ASSIGNMENT", pattern: /signature=/u },
    { code: "PRIVATE_KEY", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/u },
    { code: "GOOGLE_CREDENTIAL", pattern: /"type"\s*:\s*"service_account"/u },
    { code: "YOUTUBE_TOKEN", pattern: /refresh_token/u }
  ];
  const envPathVariants = [resolve(envFile), resolve(envFile).replace(/\\/gu, "/")];
  const secretValues = [...new Set(secrets.filter((value) => value.length >= 4))];
  const findingCodes = new Set<string>();
  let filesScanned = 0;
  for (const root of roots) {
    for (const path of await findAllFiles(root)) {
      const text = await readFile(path, "utf8");
      filesScanned += 1;
      for (const entry of forbidden) if (entry.pattern.test(text)) findingCodes.add(entry.code);
      if (envPathVariants.some((value) => text.includes(value))) findingCodes.add("ENV_FILE_PATH");
      if (secretValues.some((value) => text.includes(value))) findingCodes.add("RAW_PROVIDER_VALUE");
    }
  }
  return {
    schemaVersion: "usage-evidence-v3-security-artifact-check",
    filesScanned,
    findingCount: findingCodes.size,
    findingCodes: [...findingCodes].sort(),
    rawValuesComparedInMemoryOnly: true,
    envFilePathStored: false,
    pass: findingCodes.size === 0
  };
}

async function findAllFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...await findAllFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function blockedSummary(decision: string, provider: ReturnType<typeof buildSafeProviderPreflight>, artifacts: { ready: boolean }) {
  return {
    schemaVersion: "daily69-v3-configured-live-proof-summary",
    decision,
    providerConfigured: provider.LIVE_PROVIDER_CONFIGURED,
    providerBlocker: provider.blocker,
    artifactReady: artifacts.ready,
    run1: null,
    run2: null,
    idempotency: null,
    apiBudget: { total: 0, maximum: 60, pass: true },
    writes: SAFETY_WRITES
  };
}

function classifyRun1Decision(failure: string | null, marginal: ReturnType<typeof evaluateV3MarginalPacks>) {
  if (failure === "LIVE_PROVIDER_AUTH_REJECTED" || failure === "LIVE_PROVIDER_PERMISSION_REJECTED") return "LIVE_PROVIDER_AUTHORIZATION_BLOCKED";
  if (failure) return "LIVE_PROVIDER_OPERATIONAL_BLOCKED";
  if (marginal.final.active >= 60 && marginal.final.active <= 68) return "SANITIZED_USAGE_SOURCE_PACKS_V3_LIVE_PARTIAL";
  if (marginal.selectedPackIds.length === 0) return "V3_USAGE_PACKS_LIVE_MARGINAL_INSUFFICIENT";
  return "LIVE_V3_MARGINAL_CAPACITY_INSUFFICIENT";
}

function safeRunReference(root: string, calls: { search: number; deeplink: number; total: number }, active: number, reserve: number, distinct: number, result: string) {
  return { namespace: basename(root), calls, active, reserve, distinct, result };
}

function snapshotDigests(active: Awaited<ReturnType<LocalQueueRepository["items"]>>, reserve: Awaited<ReturnType<LocalQueueRepository["reserveCandidates"]>>) {
  return {
    active: digest(active.map((item) => ({ productKey: item.productKey, slotId: item.slotId, rank: item.queueRank }))),
    reserve: digest(reserve.map((entry) => entry.candidate.productKey)),
    allocations: digest({
      active: active.map((item) => item.usageEvidenceAllocation),
      reserve: reserve.map((entry) => entry.usageEvidenceAllocation)
    })
  };
}

function parseArguments(): ProofArguments {
  return {
    worktreeRoot: resolve(requiredArgument("--worktree-root")),
    envFile: resolve(requiredArgument("--env-file")),
    baselineRegistry: resolve(requiredArgument("--baseline-registry")),
    candidateRegistry: resolve(requiredArgument("--candidate-registry")),
    outputRoot: resolve(requiredArgument("--output-root")),
    priorProviderCalls: optionalIntegerArgument("--prior-provider-calls", 0)
  };
}

function requiredArgument(name: string) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1]?.trim() : "";
  if (!value) throw new Error(`${name.slice(2).replace(/-/gu, "_").toUpperCase()}_REQUIRED`);
  return value;
}

function validatePaths(args: ProofArguments) {
  for (const value of [args.worktreeRoot, args.envFile, args.baselineRegistry, args.candidateRegistry, args.outputRoot]) if (!isAbsolute(value)) throw new Error("ABSOLUTE_RUNTIME_INPUT_REQUIRED");
  if (args.priorProviderCalls < 0 || args.priorProviderCalls > 60) throw new Error("PRIOR_PROVIDER_CALLS_INVALID");
  const outputRelative = relative(args.worktreeRoot, args.outputRoot);
  if (!outputRelative || outputRelative.startsWith("..") || isAbsolute(outputRelative) || !/^data(?:[\\/]|$)/u.test(outputRelative)) throw new Error("OUTPUT_ROOT_MUST_BE_IGNORED_WORKTREE_DATA");
  const envRelative = relative(args.worktreeRoot, args.envFile);
  if (!envRelative.startsWith("..") && !isAbsolute(envRelative)) throw new Error("ENV_FILE_MUST_BE_EXTERNAL_TO_WORKTREE");
}

function captureEnvironment() {
  const keys = [...new Set([...Object.keys(CAPACITY_PROOF_SAFETY_ENV),
    "COUPANG_PARTNERS_PROVIDER_ENABLED", "COUPANG_PARTNERS_ACCESS_KEY", "COUPANG_ACCESS_KEY",
    "COUPANG_PARTNERS_SECRET_KEY", "COUPANG_SECRET_KEY", "COUPANG_CUSTOMER_ID", "COUPANG_PARTNER_ID",
    "COUPANG_PARTNERS_CUSTOMER_ID", "COUPANG_PARTNERS_BASE_URL"])] ;
  return new Map(keys.map((key) => [key, process.env[key]]));
}

function restoreEnvironment(previous: Map<string, string | undefined>) {
  for (const [key, value] of previous) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function sensitiveProviderValues(loadedKeys: string[]) {
  return loadedKeys
    .filter((key) => /(?:ACCESS_KEY|SECRET_KEY|CUSTOMER_ID|PARTNER_ID)$/u.test(key))
    .map((key) => process.env[key] ?? "");
}

function timestamp(date: Date) {
  return date.toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14);
}

function optionalIntegerArgument(name: string, fallback: number) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value)) throw new Error(`${name.slice(2).replace(/-/gu, "_").toUpperCase()}_INVALID`);
  return value;
}

function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

void main().then((exitCode) => {
  process.exitCode = exitCode;
}).catch((error: unknown) => {
  const safeError = error instanceof Error && /^[A-Z0-9_:-]+$/u.test(error.message) ? error.message : "V3_LIVE_CAPACITY_PROOF_FAILED";
  console.error(JSON.stringify({ result: "ERROR", safeError, ...SAFETY_WRITES }));
  process.exitCode = 1;
});
