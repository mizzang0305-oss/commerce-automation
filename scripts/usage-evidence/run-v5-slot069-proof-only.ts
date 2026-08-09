import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
  DAILY_69_NO_UPLOAD_SETTINGS,
  LocalQueueRepository,
  runNightlyScout,
  type LocalQueueItem,
  type ReserveCandidate
} from "../../src/lib/queue-scheduler";
import {
  supplementalIdempotencyPassed,
  validateUsageEvidenceRegistry,
  V5_SLOT069_NO_DOWNSTREAM_EXECUTION,
  type UsageEvidenceRegistry
} from "../../src/lib/usage-evidence";
import { validateLiveCapacityAcceptance } from "../../src/lib/usage-evidence/liveCapacityProof";

type Args = { worktreeRoot: string; outputRoot: string };
type PriorSummary = {
  decision: string;
  recoveryMode: string;
  providerBudget: { direct: number; replacement: number; proof: number; reserve: number; total: number; maximum: number };
  [key: string]: unknown;
};

async function main() {
  const args = parseArgs();
  validateArgs(args);
  process.chdir(args.worktreeRoot);
  const dataRoot = dirname(args.outputRoot);
  const sourceRoot = await latestRecoveryWithFinalSummary(dataRoot);
  const sourceFiles = ["queue.json", "reserve-pool.json", "selected-registry.json", "settings.json", "replacement-search.json", "final-summary.json"].map((name) => join(sourceRoot, name));
  const immutableBefore = await digestFiles(sourceFiles);
  const active = JSON.parse(await readFile(join(sourceRoot, "queue.json"), "utf8")) as LocalQueueItem[];
  const reserve = JSON.parse(await readFile(join(sourceRoot, "reserve-pool.json"), "utf8")) as ReserveCandidate[];
  const registry = validateUsageEvidenceRegistry(JSON.parse(await readFile(join(sourceRoot, "selected-registry.json"), "utf8")) as UsageEvidenceRegistry);
  const prior = JSON.parse(await readFile(join(sourceRoot, "final-summary.json"), "utf8")) as PriorSummary;
  if (prior.recoveryMode !== "STABILITY_AWARE_REPLACEMENT_PACK" || prior.providerBudget.total > 12 || active.length !== 69 || reserve.length !== 14) throw new Error("V5_SLOT069_PROOF_SOURCE_INVALID");

  const now = new Date();
  const proofRoot = join(dataRoot, `daily69-coupang-image-skill-v5-slot069-${timestamp(now)}`);
  await mkdir(proofRoot, { recursive: false });
  await writeJson(join(proofRoot, "settings.json"), { ...DAILY_69_NO_UPLOAD_SETTINGS, maxProviderCalls: 12, enabled: false, isPaused: true });
  await writeJson(join(proofRoot, "queue.json"), active);
  await writeJson(join(proofRoot, "reserve-pool.json"), reserve);
  await writeJson(join(proofRoot, "selected-registry.json"), registry);
  await writeJson(join(proofRoot, "replacement-search.json"), JSON.parse(await readFile(join(sourceRoot, "replacement-search.json"), "utf8")));

  const acceptance = validateLiveCapacityAcceptance({ active, reserve, registry, settings: DAILY_69_NO_UPLOAD_SETTINGS });
  const before = snapshots(active, reserve);
  const repository = new LocalQueueRepository(proofRoot);
  const secondScout = acceptance.pass ? await runNightlyScout({ repository, now, usageEvidenceRegistry: registry, shadowMode: true }) : null;
  const after = snapshots(await repository.items(), await repository.reserveCandidates());
  const idempotency = {
    secondScoutExecuted: Boolean(secondScout),
    safeMessage: secondScout?.run.safeMessage ?? "NOT_EXECUTED",
    apiCalls: Number(secondScout?.run.metrics.apiCallCount ?? -1),
    newActive: secondScout?.queued.length ?? -1,
    newReserve: Number(secondScout?.run.metrics.reserveAdded ?? 0),
    activeUnchanged: before.active === after.active,
    reserveUnchanged: before.reserve === after.reserve,
    allocationUnchanged: before.allocations === after.allocations
  };
  const pass = acceptance.pass && supplementalIdempotencyPassed(idempotency);
  const decision = pass ? "COUPANG_IMAGE_SKILL_USAGE_SCENES_V5_PROVEN_DAILY69_CAPACITY" : "COUPANG_IMAGE_SKILL_USAGE_SCENES_V5_PARTIAL";
  const providerBudget = { ...prior.providerBudget, proof: 0, total: prior.providerBudget.direct + prior.providerBudget.replacement + prior.providerBudget.reserve };
  await writeJson(join(proofRoot, "proof-only.json"), {
    schemaVersion: "daily69-coupang-image-skill-v5-slot069-proof-only",
    sourceRecoveryNamespace: basename(sourceRoot),
    providerCalls: 0,
    acceptance,
    idempotency,
    decision,
    writes: V5_SLOT069_NO_DOWNSTREAM_EXECUTION
  });
  await writeJson(join(proofRoot, "final-summary.json"), {
    ...prior,
    decision,
    sourceRecoveryNamespace: basename(sourceRoot),
    acceptance,
    idempotency,
    providerBudget,
    writes: V5_SLOT069_NO_DOWNSTREAM_EXECUTION
  });
  const immutableAfter = await digestFiles(sourceFiles);
  if (immutableBefore !== immutableAfter) throw new Error("V5_SLOT069_HISTORICAL_EVIDENCE_MUTATED");
  console.log(JSON.stringify({ decision, recoveryMode: prior.recoveryMode, namespace: basename(proofRoot), providerCalls: providerBudget.total, proofProviderCalls: 0, active: acceptance.active, reserve: acceptance.reserve, distinct: acceptance.distinct, slot069: acceptance.slots && acceptance.ranks, secondScoutApiCalls: idempotency.apiCalls, newReserve: idempotency.newReserve, ...V5_SLOT069_NO_DOWNSTREAM_EXECUTION }));
  return pass ? 0 : 4;
}

function parseArgs(): Args { return { worktreeRoot: resolve(required("--worktree-root")), outputRoot: resolve(required("--output-root")) }; }
function validateArgs(args: Args) { for (const value of Object.values(args)) if (!isAbsolute(value)) throw new Error("ABSOLUTE_RUNTIME_INPUT_REQUIRED"); const outputRelative = relative(args.worktreeRoot, args.outputRoot); if (!outputRelative || outputRelative.startsWith("..") || isAbsolute(outputRelative) || !/^data(?:[\\/]|$)/u.test(outputRelative)) throw new Error("OUTPUT_ROOT_MUST_BE_IGNORED_WORKTREE_DATA"); }
async function latestRecoveryWithFinalSummary(dataRoot: string) { const names = (await readdir(dataRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory() && entry.name.startsWith("daily69-coupang-image-skill-v5-slot069-")).map((entry) => entry.name).sort().reverse(); for (const name of names) { try { await readFile(join(dataRoot, name, "final-summary.json")); return join(dataRoot, name); } catch { /* continue */ } } throw new Error("V5_SLOT069_RECOVERY_PROOF_NOT_FOUND"); }
function required(name: string) { const index = process.argv.indexOf(name); const value = index >= 0 ? process.argv[index + 1]?.trim() : ""; if (!value) throw new Error(`MISSING_ARGUMENT_${name.replace(/^-+/u, "").replace(/-/gu, "_").toUpperCase()}`); return value; }
async function writeJson(path: string, value: unknown) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function snapshots(active: LocalQueueItem[], reserve: ReserveCandidate[]) { return { active: sha256(JSON.stringify(active)), reserve: sha256(JSON.stringify(reserve)), allocations: sha256(JSON.stringify([...active.map((item) => item.usageEvidenceAllocation), ...reserve.map((item) => item.usageEvidenceAllocation)])) }; }
async function digestFiles(paths: string[]) { return sha256((await Promise.all(paths.map((path) => readFile(path)))).map((value) => sha256(value)).join(":")); }
function sha256(value: string | Buffer) { return createHash("sha256").update(value).digest("hex"); }
function timestamp(date: Date) { return date.toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14); }

void main().then((code) => { process.exitCode = code; }).catch((error) => { console.error(JSON.stringify({ result: "V5_SLOT069_PROOF_ONLY_FAILED", blocker: error instanceof Error ? error.message : "UNKNOWN", ...V5_SLOT069_NO_DOWNSTREAM_EXECUTION })); process.exitCode = 2; });
