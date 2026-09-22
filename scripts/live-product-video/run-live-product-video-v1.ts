import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import {
  adaptLiveProductToVideoInput,
  buildLiveProductKeywordContexts,
  LIVE_PRODUCT_VIDEO_FLAGS,
  normalizeLiveProduct,
  rankLiveProducts,
  resolveExactProductReference,
  resolveOwnerReviewedUsageEvidence,
  searchLiveCoupangProducts,
  selectDistinctLiveProductSlots,
  selectLiveProductTargetCount,
  supportsUsageEvidence,
  type LiveProductCandidate,
  type LiveProductKeywordContext,
  type LiveProductUseCase,
  type RankedLiveProduct
} from "../../src/lib/live-product-video";
import { readCoupangPartnersEnv } from "../../src/lib/coupang/partnersAuthConfig";

const DEFAULT_MAX_FINAL_PRODUCTS = 3;
const MAX_CANDIDATE_ATTEMPTS_PER_SLOT = 3;
const SEARCH_LIMIT_PER_KEYWORD = 6;

async function main(): Promise<void> {
  const started = performance.now();
  const settings = readRunSettings();
  const runId = process.env.LIVE_PRODUCT_VIDEO_RUN_ID?.trim() || `run-${new Date().toISOString().replace(/[-:TZ.]/gu, "").slice(0, 14)}`;
  const root = resolveLiveOutputRoot(runId);
  const maxProducts = settings.targetCount;
  await mkdir(root, { recursive: true });
  const runtime = readRuntime();
  const providerReadiness = readCoupangPartnersEnv(process.env).readiness;
  const providerConfigured = providerReadiness.provider_enabled && providerReadiness.access_key_present && providerReadiness.secret_key_present && providerReadiness.customer_id_or_partner_id_present;
  console.log(JSON.stringify({ event: "live_product_video_start", runId, providerConfigured, runtimeConfigured: runtime.configured, maxProducts, ...LIVE_PRODUCT_VIDEO_FLAGS }));
  if (!providerConfigured) return blocked(root, "LIVE_COUPANG_PROVIDER_BLOCKED", "COUPANG_PROVIDER_NOT_CONFIGURED", 0, started);

  const discoveryStarted = performance.now();
  const { window, contexts } = buildLiveProductKeywordContexts();
  if (contexts.length < maxProducts) return blocked(root, "LIVE_COUPANG_PROVIDER_BLOCKED", "LIVE_DISCOVERY_KEYWORD_PLAN_INSUFFICIENT", 0, started);
  const providerResults = [];
  for (const context of contexts) providerResults.push(await searchLiveCoupangProducts({ context, limit: SEARCH_LIMIT_PER_KEYWORD }));
  const apiCallCount = providerResults.reduce((sum, result) => sum + result.apiCallCount, 0);
  const raw = providerResults.flatMap((result) => result.products);
  if (raw.length === 0) {
    const blocker = providerResults.map((result) => result.blocker).find(Boolean) ?? "COUPANG_PARTNERS_SEARCH_EMPTY";
    return blocked(root, "LIVE_COUPANG_PROVIDER_BLOCKED", blocker, apiCallCount, started);
  }
  const candidates = raw.map(normalizeLiveProduct);
  const discoverySeconds = seconds(discoveryStarted);
  const rankingStarted = performance.now();
  const ranked = rankLiveProducts({ candidates, keywordContexts: contexts, usageEvidenceAvailable: supportsUsageEvidence });
  const runnableRanked = ranked.filter((entry) => settings.allowedUseCases.has(entry.candidate.useCase) && !settings.excludedProductIds.has(entry.candidate.productKey));
  const distinctSelection = selectDistinctLiveProductSlots({ ranked: runnableRanked, maxAttemptsPerSlot: MAX_CANDIDATE_ATTEMPTS_PER_SLOT });
  const targetSelection = selectLiveProductTargetCount({ candidates: runnableRanked, targetCount: maxProducts });
  const selection = maxProducts === DEFAULT_MAX_FINAL_PRODUCTS && settings.usesDefaultSelection
    ? distinctSelection
    : {
        selected: targetSelection.selected,
        attempts: { target: Math.min(runnableRanked.filter((entry) => entry.score.eligible).length, MAX_CANDIDATE_ATTEMPTS_PER_SLOT) },
        rejected: runnableRanked.filter((entry) => !entry.score.eligible).map((entry) => ({ productKey: entry.candidate.productKey, reasons: entry.score.blockers }))
      };
  const rankingMs = Math.round(performance.now() - rankingStarted);
  await writeJson(join(root, "discovery.json"), buildDiscoveryManifest({ providerConfigured, contexts, window, rawCount: raw.length, candidates, ranked, providerResults, apiCallCount, discoverySeconds, selectedCount: selection.selected.length }));
  await writeJson(join(root, "candidate-ranking.json"), ranked);
  if (!runtime.configured) return blocked(root, "BLOCKED_FOR_OWNER_DECISION", "LOCAL_VIDEO_RUNTIME_NOT_CONFIGURED", apiCallCount, started);
  if (selection.selected.length !== maxProducts) return blocked(root, "LIVE_PRODUCT_TO_VIDEO_V1_PARTIAL", "LIVE_PRODUCT_SLOT_UNFILLED", apiCallCount, started, { selection, discoverySeconds, rankingMs });

  const assetStarted = performance.now();
  const useCases = ["vehicle_organization", "desk_organization", "laundry_drying"] as const;
  const pools = maxProducts === DEFAULT_MAX_FINAL_PRODUCTS && settings.usesDefaultSelection
    ? useCases.map((useCase) => runnableRanked.filter((entry) => entry.candidate.useCase === useCase && entry.score.eligible).slice(0, MAX_CANDIDATE_ATTEMPTS_PER_SLOT))
    : [runnableRanked.filter((entry) => entry.score.eligible).slice(0, MAX_CANDIDATE_ATTEMPTS_PER_SLOT)];
  const prepared: Array<Awaited<ReturnType<typeof prepareCandidate>> | null> = Array.from({ length: maxProducts }, () => null);
  const offsets = Array.from({ length: maxProducts }, () => 0);
  const slotAttempts: Record<string, number> = {};
  const candidateRejections: Array<{ productKey: string; reason: string; phase: "asset_resolution" | "video_qa" }> = [];
  const advanceSlot = async (slotIndex: number): Promise<boolean> => {
    const pool = pools[slotIndex];
    while (offsets[slotIndex] < pool.length && offsets[slotIndex] < MAX_CANDIDATE_ATTEMPTS_PER_SLOT) {
      const entry = pool[offsets[slotIndex]];
      offsets[slotIndex] += 1;
      slotAttempts[entry.candidate.useCase] = offsets[slotIndex];
      try {
        prepared[slotIndex] = await prepareCandidate(entry, root, slotIndex + 1, offsets[slotIndex], runtime, runId);
        return true;
      } catch (error) {
        candidateRejections.push({ productKey: entry.candidate.productKey, reason: safeError(error), phase: "asset_resolution" });
      }
    }
    prepared[slotIndex] = null;
    return false;
  };
  for (let slotIndex = 0; slotIndex < maxProducts; slotIndex += 1) await advanceSlot(slotIndex);
  if (prepared.some((entry) => !entry)) return blocked(root, "LIVE_PRODUCT_TO_VIDEO_V1_PARTIAL", "LIVE_PRODUCT_SLOT_UNFILLED", apiCallCount, started, { selection, slotAttempts, candidateRejections, discoverySeconds, rankingMs, assetResolutionSeconds: seconds(assetStarted) });

  const videoStarted = performance.now();
  const videoRuns: Array<{ runRoot: string; exitCode: number; machinePassed: number }> = [];
  let videoManifest: Record<string, unknown> | null = null;
  let videoRunRoot = "";
  let machinePassed = 0;
  for (let round = 1; round <= MAX_CANDIDATE_ATTEMPTS_PER_SLOT; round += 1) {
    const current = prepared.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    if (current.length !== maxProducts) break;
    const inputManifestPath = join(root, `video-inputs-round-${round}.json`);
    await writeJson(inputManifestPath, { version: "live-product-video-input-v1", products: current.map((entry) => entry.input), ...LIVE_PRODUCT_VIDEO_FLAGS });
    const videoRunId = `${runId}-video-round-${round}`;
    let child: Awaited<ReturnType<typeof runV2>>;
    try {
      child = await runV2({ inputManifestPath, videoRunId, runtime });
    } catch (error) {
      return blocked(root, "BLOCKED_FOR_OWNER_DECISION", error, apiCallCount, started, { selection, slotAttempts, candidateRejections, discoverySeconds, rankingMs, videoRuns });
    }
    videoRunRoot = resolveVideoOutputRoot(videoRunId);
    videoManifest = await readOptionalJson(join(videoRunRoot, "run-manifest.json"));
    machinePassed = Number(videoManifest?.machineQaPassed ?? 0);
    videoRuns.push({ runRoot: videoRunRoot, exitCode: child.code, machinePassed });
    if (machinePassed === maxProducts) break;
    const items = Array.isArray(videoManifest?.items) ? videoManifest.items.filter(isRecord) : [];
    let replacementAvailable = true;
    for (let slotIndex = 0; slotIndex < prepared.length; slotIndex += 1) {
      const currentProduct = prepared[slotIndex];
      if (!currentProduct) { replacementAvailable = false; continue; }
      const item = items.find((entry) => entry.productKey === currentProduct.ranked.candidate.productKey);
      if (item?.machineQaPassed === true) continue;
      const reasons = Array.isArray(item?.blockers) ? item.blockers.filter((value): value is string => typeof value === "string") : [];
      candidateRejections.push({ productKey: currentProduct.ranked.candidate.productKey, reason: reasons[0] ?? "VIDEO_AUTO_QA_FAILED", phase: "video_qa" });
      prepared[slotIndex] = null;
      if (!await advanceSlot(slotIndex)) replacementAvailable = false;
    }
    if (!replacementAvailable) break;
  }
  const videoSeconds = seconds(videoStarted);
  const assetResolutionSeconds = seconds(assetStarted) - videoSeconds;
  const finalPrepared = prepared.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  const decision = machinePassed === maxProducts
    ? "LIVE_PRODUCT_TO_AUTONOMOUS_VIDEO_V1_AWAITING_CODEX_VISUAL_REVIEW"
    : machinePassed > 0 ? "LIVE_PRODUCT_TO_VIDEO_V1_PARTIAL" : "BLOCKED_FOR_OWNER_DECISION";
  const finalSummary = {
    version: "live-product-to-video-v1",
    runId,
    decision,
    provider: "coupang_partners_product_search",
    providerConfigured,
    actualExternalCalls: apiCallCount,
    apiCallCount,
    credentialsExposed: false,
    rawCandidateCount: raw.length,
    normalizedCount: candidates.length,
    eligibleCount: ranked.filter((entry) => entry.score.eligible).length,
    selectedCount: finalPrepared.length,
    slotAttempts,
    candidateRejections,
    selected: finalPrepared.map((entry) => ({ candidate: entry.ranked.candidate, score: entry.ranked.score, exactProductReference: { ...entry.reference, localPath: undefined }, genericUsageEvidence: { assetId: entry.input.product.realUseAsset?.assetId, identityType: "generic_usage_example" }, exactProductUse: false, overclaim: false })),
    videoRunRoot,
    videoRuns,
    machineQaPassed: machinePassed,
    machineQaItems: Array.isArray(videoManifest?.items) ? videoManifest.items.filter(isRecord) : [],
    visualReviewExecuted: false,
    finalAutomatedQaPassed: 0,
    performance: { discoverySeconds, rankingMs, assetResolutionSeconds, videoSeconds, totalSeconds: seconds(started) },
    humanOwnerReviewStatus: "not_requested",
    publishReady: false,
    ...LIVE_PRODUCT_VIDEO_FLAGS
  };
  await writeJson(join(root, "final-summary.json"), finalSummary);
  console.log(JSON.stringify({ event: "live_product_video_machine_complete", runId, decision, apiCallCount, rawCandidates: raw.length, eligible: finalSummary.eligibleCount, selected: finalPrepared.length, machinePassed, visualReviewExecuted: false, ...LIVE_PRODUCT_VIDEO_FLAGS }));
  if (machinePassed !== maxProducts) process.exitCode = 2;
}

type Runtime = ReturnType<typeof readRuntime>;

async function prepareCandidate(ranked: RankedLiveProduct, root: string, slot: number, attempt: number, runtime: Runtime, runId: string) {
  const slotRoot = join(root, `slot-${String(slot).padStart(2, "0")}`, `candidate-attempt-${attempt}`);
  const usage = await resolveOwnerReviewedUsageEvidence({ candidate: ranked.candidate, assetRoot: runtime.assetRoot });
  if (!usage) throw new Error("USAGE_EVIDENCE_NOT_AVAILABLE");
  const reference = await resolveExactProductReference({
    candidate: ranked.candidate,
    outputDir: join(slotRoot, "product-reference"),
    pythonExe: runtime.python,
    visualQaScript: resolve("tools", "video-automation", "visual_qa.py")
  });
  const input = adaptLiveProductToVideoInput({ candidate: ranked.candidate, exactReference: reference, usageEvidence: usage, runId });
  await writeJson(join(slotRoot, "product.json"), { ...ranked.candidate, exactProductReference: { ...reference, localPathPresent: true }, genericUsageEvidence: { assetId: usage.assetId, identityType: usage.identityType, ownerReviewStatus: usage.ownerReviewStatus }, exactProductUse: false, overclaim: false });
  await writeJson(join(slotRoot, "product-score.json"), ranked.score);
  return { ranked, reference, input };
}

function buildDiscoveryManifest(input: {
  providerConfigured: boolean;
  contexts: LiveProductKeywordContext[];
  window: unknown;
  rawCount: number;
  candidates: LiveProductCandidate[];
  ranked: RankedLiveProduct[];
  providerResults: Awaited<ReturnType<typeof searchLiveCoupangProducts>>[];
  apiCallCount: number;
  discoverySeconds: number;
  selectedCount: number;
}) {
  const rejected = input.ranked.filter((entry) => !entry.score.eligible);
  return {
    version: "live-coupang-discovery-v1",
    provider: "coupang_partners_product_search",
    configured: input.providerConfigured,
    eventWindow: input.window,
    keywords: input.contexts.map((entry) => entry.keyword),
    discovered: input.rawCount,
    normalized: input.candidates.length,
    eligible: input.ranked.filter((entry) => entry.score.eligible).length,
    selected: input.selectedCount,
    policyBlocked: rejected.filter((entry) => entry.score.blockers.includes("POLICY_BLOCKED")).length,
    imageBlocked: rejected.filter((entry) => entry.score.blockers.includes("PRODUCT_IMAGE_NOT_READY")).length,
    affiliateBlocked: rejected.filter((entry) => entry.score.blockers.includes("AFFILIATE_NOT_READY")).length,
    duplicateBlocked: rejected.filter((entry) => entry.score.blockers.includes("DUPLICATE_PRODUCT")).length,
    usageEvidenceBlocked: rejected.filter((entry) => entry.score.blockers.includes("USAGE_EVIDENCE_NOT_AVAILABLE")).length,
    apiCallCount: input.apiCallCount,
    searchFailures: input.providerResults.filter((result) => !result.ok).map((result) => result.blocker),
    rejected: rejected.map((entry) => ({ productKey: entry.candidate.productKey, reasons: entry.score.blockers })),
    discoverySeconds: input.discoverySeconds,
    credentialsExposed: false,
    authorizationHeadersExposed: false,
    ...LIVE_PRODUCT_VIDEO_FLAGS
  };
}

function readRuntime() {
  const values = {
    assetRoot: process.env.VIDEO_AUTOMATION_ASSET_ROOT?.trim() ?? "",
    python: process.env.VIDEO_AUTOMATION_PYTHON?.trim() ?? "",
    ttsCommand: process.env.VIDEO_AUTOMATION_TTS_COMMAND?.trim() ?? "",
    asrPython: process.env.VIDEO_AUTOMATION_ASR_PYTHON?.trim() ?? "",
    asrScript: process.env.VIDEO_AUTOMATION_ASR_SCRIPT?.trim() ?? "",
    asrModel: process.env.VIDEO_AUTOMATION_ASR_MODEL?.trim() ?? ""
  };
  return { ...values, configured: Object.values(values).every(Boolean) };
}

async function runV2(input: { inputManifestPath: string; videoRunId: string; runtime: Runtime }) {
  return new Promise<{ code: number }>((resolvePromise, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "scripts/video-automation/run-autonomous-video-review-v2.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        LIVE_PRODUCT_VIDEO_INPUT_MANIFEST: input.inputManifestPath,
        VIDEO_AUTOMATION_RUN_ID: input.videoRunId,
        VIDEO_AUTOMATION_V2_MODE: "batch"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { if (stdout.length < 65_536) stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { if (stderr.length < 8_192) stderr += chunk.toString("utf8"); });
    child.once("error", reject);
    child.once("close", (code) => {
      for (const line of stdout.split(/\r?\n/u).filter(Boolean)) {
        try {
          const event = JSON.parse(line) as Record<string, unknown>;
          console.log(JSON.stringify({ ...event, outputRoot: event.outputRoot ? "local_artifact_created" : undefined }));
        } catch { /* ignore non-JSON child output */ }
      }
      if (code !== 0 && code !== 2) reject(new Error(stderr.includes("LOCAL_PROCESS_TIMEOUT") ? "LIVE_VIDEO_PIPELINE_TIMEOUT" : "LIVE_VIDEO_PIPELINE_FAILED"));
      else resolvePromise({ code: code ?? 1 });
    });
  });
}

type RunSettings = {
  targetCount: number;
  allowedUseCases: Set<LiveProductUseCase>;
  excludedProductIds: Set<string>;
  usesDefaultSelection: boolean;
};

function readRunSettings(): RunSettings {
  const targetCount = readBoundedInteger(process.env.LIVE_PRODUCT_VIDEO_TARGET_COUNT, DEFAULT_MAX_FINAL_PRODUCTS, 1, DEFAULT_MAX_FINAL_PRODUCTS, "LIVE_PRODUCT_VIDEO_TARGET_COUNT_INVALID");
  const allowedValues = readCsv(process.env.LIVE_PRODUCT_VIDEO_ALLOWED_USE_CASES, ["vehicle_organization", "desk_organization", "laundry_drying"]);
  if (!allowedValues.every(isSupportedLiveUseCase)) throw new Error("LIVE_PRODUCT_VIDEO_ALLOWED_USE_CASES_INVALID");
  const allowedUseCases = new Set<LiveProductUseCase>(allowedValues);
  if (allowedUseCases.size === 0) throw new Error("LIVE_PRODUCT_VIDEO_ALLOWED_USE_CASES_INVALID");
  const excludedProductIds = new Set(readJsonStringArray(process.env.LIVE_PRODUCT_VIDEO_EXCLUDED_PRODUCT_IDS, "LIVE_PRODUCT_VIDEO_EXCLUDED_PRODUCT_IDS_INVALID"));
  return {
    targetCount,
    allowedUseCases,
    excludedProductIds,
    usesDefaultSelection: targetCount === DEFAULT_MAX_FINAL_PRODUCTS
      && excludedProductIds.size === 0
      && allowedUseCases.size === 3
  };
}

function readBoundedInteger(raw: string | undefined, fallback: number, minimum: number, maximum: number, safeError: string) {
  if (!raw?.trim()) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(safeError);
  return parsed;
}

function readCsv(raw: string | undefined, fallback: string[]) {
  if (!raw?.trim()) return fallback;
  return [...new Set(raw.split(",").map((value) => value.trim()).filter(Boolean))];
}

function readJsonStringArray(raw: string | undefined, safeError: string) {
  if (!raw?.trim()) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !entry.trim())) throw new Error(safeError);
    return [...new Set(value.map((entry) => entry.trim()))];
  } catch {
    throw new Error(safeError);
  }
}

function isSupportedLiveUseCase(value: string): value is Exclude<LiveProductUseCase, "unsupported"> {
  return value === "vehicle_organization" || value === "desk_organization" || value === "laundry_drying";
}

function resolveLiveOutputRoot(runId: string) {
  const configuredRoot = process.env.LIVE_PRODUCT_VIDEO_OUTPUT_ROOT?.trim();
  return configuredRoot
    ? resolve(configuredRoot, "live-product-video", runId)
    : resolve("data", "live-product-video", runId);
}

function resolveVideoOutputRoot(runId: string) {
  const configuredRoot = process.env.VIDEO_AUTOMATION_OUTPUT_ROOT?.trim();
  return configuredRoot
    ? resolve(configuredRoot, "video-automation", runId)
    : resolve("data", "video-automation", runId);
}

async function blocked(root: string, decision: string, blocker: unknown, apiCallCount: number, started: number, details: Record<string, unknown> = {}) {
  const summary = { version: "live-product-to-video-v1", decision, blockers: [safeError(blocker)], apiCallCount, credentialsExposed: false, visualReviewExecuted: false, humanOwnerReviewStatus: "not_requested", publishReady: false, totalSeconds: seconds(started), ...details, ...LIVE_PRODUCT_VIDEO_FLAGS };
  await writeJson(join(root, "final-summary.json"), summary);
  console.log(JSON.stringify({ event: "live_product_video_blocked", decision, blockers: summary.blockers, apiCallCount, ...LIVE_PRODUCT_VIDEO_FLAGS }));
  process.exitCode = 2;
}

async function readOptionalJson(path: string): Promise<Record<string, unknown> | null> {
  try { return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>; } catch { return null; }
}
async function writeJson(path: string, value: unknown) { await mkdir(dirname(resolve(path)), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
function seconds(started: number) { return Math.round((performance.now() - started) / 10) / 100; }
function safeError(error: unknown) { const value = error instanceof Error ? error.message : String(error); return /^[A-Z0-9_:-]+$/u.test(value) ? value : "LIVE_PRODUCT_VIDEO_FAILED"; }
void main().catch((error: unknown) => { console.error(JSON.stringify({ event: "live_product_video_failed", safeError: safeError(error), ...LIVE_PRODUCT_VIDEO_FLAGS })); process.exitCode = 1; });
