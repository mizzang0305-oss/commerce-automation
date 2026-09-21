import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type { RankedLiveProduct } from "../../src/lib/live-product-video";
import { DAILY_69_NO_UPLOAD_SETTINGS, LocalQueueRepository, QUEUE_SCHEDULER_FLAGS } from "../../src/lib/queue-scheduler";
import { evaluateV3MarginalPacks, planUsageEvidenceCapacity, usageEvidenceCapacityUnits, validateUsageEvidenceRegistry, type UsageEvidenceRegistry } from "../../src/lib/usage-evidence";

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1]?.trim() : "";
  if (!value) throw new Error(`${name.slice(2).toUpperCase().replace(/-/gu, "_")}_REQUIRED`);
  return value;
}

async function loadRegistry(path: string): Promise<UsageEvidenceRegistry> {
  return validateUsageEvidenceRegistry(JSON.parse(await readFile(resolve(path), "utf8")));
}

async function main() {
  const baselineRoot = resolve(argument("--baseline-root"));
  const outputRoot = resolve(argument("--output-root"));
  const baselineRegistry = await loadRegistry(argument("--baseline-registry"));
  const candidateRegistry = await loadRegistry(argument("--candidate-registry"));
  const repository = new LocalQueueRepository(baselineRoot);
  const queue = await repository.items();
  const reserve = await repository.reserveCandidates();
  const ranked: RankedLiveProduct[] = [
    ...queue.map((item) => ({
      candidate: item.candidate,
      score: {
        productKey: item.productKey,
        eventRelevanceScore: item.productScore,
        motionSuitabilityScore: 100,
        policySafetyScore: 100,
        imageReadinessScore: 100,
        affiliateReadinessScore: 100,
        duplicatePenalty: 0,
        usageEvidenceScore: 100,
        finalProductScore: item.productScore,
        selectionRank: item.queueRank,
        eligible: true,
        blockers: []
      }
    })),
    ...reserve.map((entry, index) => ({ ...entry, score: { ...entry.score, selectionRank: queue.length + index + 1 } }))
  ];
  const gapPath = join(baselineRoot, "capacity", "usage-capacity-gap.json");
  const baselineGap = JSON.parse(await readFile(gapPath, "utf8")) as { gap?: { currentActive?: number; currentReserve?: number }; limits?: { rawDiscoveries?: number }; diagnostics?: { normalizedCount?: number } };
  const runs = JSON.parse(await readFile(join(baselineRoot, "runs.json"), "utf8")) as Array<{ metrics?: { normalized?: number; eligible?: number } }>;
  const latestRun = runs[runs.length - 1];
  const marginal = evaluateV3MarginalPacks({ ranked, baselineRegistry, candidateRegistry, settings: DAILY_69_NO_UPLOAD_SETTINGS, rawCount: ranked.length, normalizedCount: ranked.length });
  const candidatePlan = planUsageEvidenceCapacity({ ranked, registry: candidateRegistry, settings: DAILY_69_NO_UPLOAD_SETTINGS });
  const videoSources = new Set(candidateRegistry.assets.filter((asset) => ["owner_reviewed_video", "sanitized_local_video", "derived_clip", "derived_frame_pack"].includes(asset.sourceKind)).map((asset) => asset.sourceId));
  const nominalUnits = usageEvidenceCapacityUnits(candidateRegistry);
  const byUseCase = Object.fromEntries([...new Set(ranked.map((entry) => entry.candidate.useCase))].sort().map((useCase) => [useCase, {
    candidates: ranked.filter((entry) => entry.candidate.useCase === useCase).length,
    active: candidatePlan.active.filter((entry) => entry.candidate.useCase === useCase).length,
    reserve: candidatePlan.reserve.filter((entry) => entry.candidate.useCase === useCase).length
  }]));
  const byCategory = Object.fromEntries([...new Set(ranked.map((entry) => entry.candidate.category))].sort().map((category) => [category, {
    candidates: ranked.filter((entry) => entry.candidate.category === category).length,
    active: candidatePlan.active.filter((entry) => entry.candidate.category === category).length
  }]));
  const byPack = Object.fromEntries(candidateRegistry.packs.map((pack) => [pack.packId, candidatePlan.allocations.filter((allocation) => allocation.packId === pack.packId).length]));
  const effective = {
    schemaVersion: "usage-evidence-effective-capacity-v3",
    generatedAt: new Date().toISOString(),
    authority: "PERSISTED_72_ITEM_REPLAY_DIAGNOSTIC_ONLY",
    fullCandidateSnapshotAvailable: false,
    persistedSnapshot: {
      root: basename(baselineRoot),
      active: queue.length,
      reserve: reserve.length,
      distinct: new Set(ranked.map((entry) => entry.candidate.productKey)).size,
      observedLiveActive: baselineGap.gap?.currentActive ?? null,
      observedLiveReserve: baselineGap.gap?.currentReserve ?? null,
      observedRawDiscoveries: baselineGap.limits?.rawDiscoveries ?? null,
      observedNormalizedCandidates: latestRun?.metrics?.normalized ?? baselineGap.diagnostics?.normalizedCount ?? null,
      observedPolicyEligible: latestRun?.metrics?.eligible ?? null
    },
    capacity: {
      nominalCapacityUnits: nominalUnits,
      roleBalancedCapacityUnits: nominalUnits,
      assetConstrainedCapacityUnits: Math.min(nominalUnits, Math.floor(candidateRegistry.assets.length * 5 / 3)),
      sourceConstrainedCapacityUnits: Math.min(nominalUnits, videoSources.size * candidateRegistry.maxSameSourceVideoDaily),
      sequenceConstrainedCapacityUnits: nominalUnits,
      candidateMatchedCapacity: candidatePlan.active.length + candidatePlan.reserve.length,
      activeAllocatable: candidatePlan.active.length,
      reserveAllocatable: candidatePlan.reserve.length,
      effectiveAllocatableProducts: candidatePlan.active.length + candidatePlan.reserve.length,
      shortfall: Math.max(0, DAILY_69_NO_UPLOAD_SETTINGS.dailyTargetCount + DAILY_69_NO_UPLOAD_SETTINGS.minimumReserveCount - candidatePlan.active.length - candidatePlan.reserve.length),
      byUseCase,
      byCategory,
      byPack
    },
    marginal,
    limitation: "The historical live run persisted only 58 active and 14 reserve candidates, not the complete ranked candidate set. Live marginal authority requires a fresh bounded discovery namespace.",
    result: candidateRegistry.assets.filter((asset) => asset.sourceKind === "derived_clip").length >= 24
      && candidateRegistry.packs.filter((pack) => pack.packGeneration === "v3_motion").length >= 12
      ? "PASS_WITH_LIVE_MARGINAL_REQUIRED"
      : "FAIL",
    writes: { ...QUEUE_SCHEDULER_FLAGS, VIDEO_RENDER: 0, TTS: 0, ASR: 0, WHISPERX: 0, WORKER_CHANGE: 0, SCHEDULER_CHANGE: 0 }
  };
  await mkdir(outputRoot, { recursive: true });
  await writeFile(join(outputRoot, "marginal-pack-gain.json"), `${JSON.stringify(marginal, null, 2)}\n`, "utf8");
  await writeFile(join(outputRoot, "effective-capacity-report.json"), `${JSON.stringify(effective, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(effective));
  if (effective.result === "FAIL") process.exitCode = 2;
}

void main().catch((error: unknown) => {
  const message = error instanceof Error && /^[A-Z0-9_:-]+$/u.test(error.message) ? error.message : "V3_CAPACITY_SIMULATION_FAILED";
  console.error(JSON.stringify({ result: "ERROR", safeError: message, ...QUEUE_SCHEDULER_FLAGS }));
  process.exitCode = 1;
});
