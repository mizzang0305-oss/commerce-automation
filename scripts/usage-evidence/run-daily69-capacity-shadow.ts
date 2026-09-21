import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { DAILY_69_NO_UPLOAD_SETTINGS, LocalQueueRepository, QUEUE_SCHEDULER_FLAGS, runNightlyScout } from "../../src/lib/queue-scheduler";
import { evaluateV3MarginalPacks, selectV3Registry, SUPPORTED_USAGE_EVIDENCE_USE_CASES, usageEvidenceCapacityUnits, validateUsageEvidenceRegistry, type UsageEvidenceAllocation, type UsageEvidenceRegistry } from "../../src/lib/usage-evidence";

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1]?.trim() : "";
  if (!value) throw new Error(`${name.slice(2).toUpperCase().replace(/-/gu, "_")}_REQUIRED`);
  return value;
}

function optionalArgument(name: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1]?.trim() ?? "" : "";
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^가-힣a-z0-9]/gu, "");
}

function categoryKey(categoryPath: string, category: string): string {
  return normalize((categoryPath || category).split(/[>\/]/u)[0] || "uncategorized") || "uncategorized";
}

function familyKey(name: string, categoryPath: string, category: string): string {
  return `${categoryKey(categoryPath, category)}:${normalize(name).slice(0, 24)}`;
}

function increment(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function maxCount(counts: Map<string, number>): number {
  return Math.max(0, ...counts.values());
}

async function main() {
  const root = resolve(argument("--root"));
  const registryPath = resolve(argument("--registry"));
  if (!["daily69-asset-capacity-", "daily69-source-packs-v3-"].some((prefix) => basename(root).startsWith(prefix))) throw new Error("SHADOW_ROOT_NAME_INVALID");
  const now = new Date(process.argv.includes("--now") ? argument("--now") : new Date().toISOString());
  if (Number.isNaN(now.getTime())) throw new Error("SHADOW_NOW_INVALID");
  const registryStarted = performance.now();
  const registry = validateUsageEvidenceRegistry(JSON.parse(await readFile(registryPath, "utf8")));
  const registryLoadMs = Math.round((performance.now() - registryStarted) * 1_000) / 1_000;
  const repository = new LocalQueueRepository(root);
  await repository.writeSettings({ ...DAILY_69_NO_UPLOAD_SETTINGS, enabled: false, isPaused: true });

  const discoveryStarted = performance.now();
  const first = await runNightlyScout({ repository, now, usageEvidenceRegistry: registry, shadowMode: true });
  const discoverySeconds = Math.round((performance.now() - discoveryStarted) / 10) / 100;
  const firstItems = await repository.items();
  const firstReserve = await repository.reserveCandidates();
  const firstProjection = firstItems.map((item) => ({ productKey: item.productKey, rank: item.queueRank, useCase: item.candidate.useCase, allocation: item.usageEvidenceAllocation }));
  const firstReserveProjection = firstReserve.map((entry) => ({ productKey: entry.candidate.productKey, useCase: entry.candidate.useCase, allocation: entry.usageEvidenceAllocation }));
  const firstSnapshotDigest = digest({ active: firstProjection, reserve: firstReserveProjection });

  const candidateRegistryPath = optionalArgument("--candidate-registry");
  const selectedRegistryOutput = optionalArgument("--selected-registry-output");
  let v3Marginal: ReturnType<typeof evaluateV3MarginalPacks> | null = null;
  let selectedRegistry: UsageEvidenceRegistry | null = null;
  if (candidateRegistryPath) {
    const candidateRegistry = validateUsageEvidenceRegistry(JSON.parse(await readFile(resolve(candidateRegistryPath), "utf8")));
    v3Marginal = evaluateV3MarginalPacks({
      ranked: first.ranked,
      baselineRegistry: registry,
      candidateRegistry,
      settings: DAILY_69_NO_UPLOAD_SETTINGS,
      rawCount: Number(first.run.metrics.discovered ?? first.ranked.length),
      normalizedCount: Number(first.run.metrics.normalized ?? first.ranked.length)
    });
    if (v3Marginal.result === "TARGET_REACHED") {
      selectedRegistry = selectV3Registry(candidateRegistry, v3Marginal.selectedPackIds);
      if (!selectedRegistryOutput) throw new Error("SELECTED_REGISTRY_OUTPUT_REQUIRED");
      await mkdir(dirname(resolve(selectedRegistryOutput)), { recursive: true });
      await writeFile(resolve(selectedRegistryOutput), `${JSON.stringify(selectedRegistry, null, 2)}\n`, "utf8");
    }
  }

  const activeKeys = new Set(firstItems.map((item) => item.productKey));
  const reserveKeys = new Set(firstReserve.map((entry) => entry.candidate.productKey));
  const categoryCounts = new Map<string, number>();
  const familyCounts = new Map<string, number>();
  const packUses = new Map<string, number>();
  const assetUses = new Map<string, number>();
  const sourceVideoUses = new Map<string, number>();
  const assetById = new Map(registry.assets.map((asset) => [asset.assetId, asset]));
  const allocations = [...firstItems.map((item) => item.usageEvidenceAllocation), ...firstReserve.map((entry) => entry.usageEvidenceAllocation)].filter((value): value is UsageEvidenceAllocation => Boolean(value));
  for (const item of firstItems) {
    increment(categoryCounts, categoryKey(item.candidate.categoryPath, item.candidate.category));
    increment(familyCounts, familyKey(item.candidate.canonicalProductName, item.candidate.categoryPath, item.candidate.category));
  }
  for (const allocation of allocations) {
    increment(packUses, allocation.packId);
    for (const assetId of allocation.assetIds) increment(assetUses, assetId);
    const videoSources = new Set(allocation.assetIds.map((assetId) => assetById.get(assetId)).filter((asset) => asset?.sourceKind === "derived_frame_pack" || asset?.sourceKind === "derived_clip" || asset?.sourceKind === "owner_reviewed_video" || asset?.sourceKind === "sanitized_local_video").map((asset) => asset!.sourceId));
    for (const sourceId of videoSources) increment(sourceVideoUses, sourceId);
  }
  const sequenceFingerprints = allocations.map((allocation) => allocation.sequenceFingerprint);
  const sequenceViolations = sequenceFingerprints.filter((value, index) => index >= 2 && value === sequenceFingerprints[index - 1] && value === sequenceFingerprints[index - 2]).length;
  const batchPackViolations = firstItems.reduce((count, _item, index) => index % 3 === 0 && firstItems.slice(index, index + 3).length === 3 && new Set(firstItems.slice(index, index + 3).map((entry) => entry.usageEvidenceAllocation?.packId)).size === 1 ? count + 1 : count, 0);
  const expectedSlots = Array.from({ length: 69 }, (_, index) => `slot-${String(index + 1).padStart(3, "0")}`);
  const expectedRanks = Array.from({ length: 69 }, (_, index) => index + 1);
  const hourFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", hour: "2-digit", hourCycle: "h23" });
  const hourlyGroups = new Map<string, number>();
  for (const item of firstItems) increment(hourlyGroups, hourFormatter.format(new Date(item.scheduledAt)));
  const categoryLimit = Math.floor(69 * DAILY_69_NO_UPLOAD_SETTINGS.maxCategoryRatio);
  const familyLimit = Math.floor(69 * DAILY_69_NO_UPLOAD_SETTINGS.maxProductFamilyRatio);
  const activeValidation = {
    slots: JSON.stringify(firstItems.map((item) => item.slotId)) === JSON.stringify(expectedSlots),
    ranks: JSON.stringify(firstItems.map((item) => item.queueRank)) === JSON.stringify(expectedRanks),
    hourlyGroupCount: hourlyGroups.size,
    hourlyGroupSizePass: hourlyGroups.size === 23 && [...hourlyGroups.values()].every((count) => count === 3),
    distinctProductKeys: activeKeys.size,
    categoryMax: maxCount(categoryCounts),
    categoryLimit,
    categoryCapPass: maxCount(categoryCounts) <= categoryLimit,
    familyMax: maxCount(familyCounts),
    familyLimit,
    familyCapPass: maxCount(familyCounts) <= familyLimit,
    assetAllocations: firstItems.filter((item) => item.usageEvidenceAllocation).length,
    maxAssetReuse: maxCount(assetUses),
    maxPackReuse: maxCount(packUses),
    maxSourceVideoReuse: maxCount(sourceVideoUses),
    packReuseViolations: [...packUses.values()].filter((count) => count > registry.maxUsagePackReuse).length,
    assetReuseViolations: [...assetUses.values()].filter((count) => count > 5).length,
    sourceReuseViolations: [...sourceVideoUses.values()].filter((count) => count > registry.maxSameSourceVideoDaily).length,
    sequenceViolations,
    batchPackViolations,
    unsupportedUseCases: firstItems.filter((item) => item.candidate.useCase === "unsupported").length
  };
  const reserveValidation = {
    count: firstReserve.length,
    distinct: reserveKeys.size === firstReserve.length,
    duplicateWithActive: [...reserveKeys].filter((key) => activeKeys.has(key)).length,
    assetCompatible: firstReserve.filter((entry) => entry.usageEvidenceAllocation).length,
    policyReady: firstReserve.filter((entry) => entry.score.eligible && Boolean(entry.candidate.selectedAffiliateUrl) && entry.candidate.productImageUrls.length > 0).length
  };
  const ready = first.run.status === "success"
    && firstItems.length === 69
    && firstReserve.length >= 14
    && activeValidation.slots
    && activeValidation.ranks
    && activeValidation.hourlyGroupSizePass
    && activeValidation.distinctProductKeys === 69
    && activeValidation.categoryCapPass
    && activeValidation.familyCapPass
    && activeValidation.assetAllocations === 69
    && activeValidation.packReuseViolations === 0
    && activeValidation.assetReuseViolations === 0
    && activeValidation.sourceReuseViolations === 0
    && activeValidation.sequenceViolations === 0
    && activeValidation.batchPackViolations === 0
    && activeValidation.unsupportedUseCases === 0
    && reserveValidation.distinct
    && reserveValidation.duplicateWithActive === 0
    && reserveValidation.assetCompatible === firstReserve.length
    && reserveValidation.policyReady === firstReserve.length;

  let secondApiCallCount: number | null = null;
  let secondSnapshotDigest: string | null = null;
  if (ready) {
    const second = await runNightlyScout({ repository, now, usageEvidenceRegistry: registry, shadowMode: true });
    secondApiCallCount = Number(second.run.metrics.apiCallCount ?? -1);
    const secondItems = await repository.items();
    const secondReserve = await repository.reserveCandidates();
    secondSnapshotDigest = digest({
      active: secondItems.map((item) => ({ productKey: item.productKey, rank: item.queueRank, useCase: item.candidate.useCase, allocation: item.usageEvidenceAllocation })),
      reserve: secondReserve.map((entry) => ({ productKey: entry.candidate.productKey, useCase: entry.candidate.useCase, allocation: entry.usageEvidenceAllocation }))
    });
  }

  const byUseCase = Object.fromEntries(Object.keys(SUPPORTED_USAGE_EVIDENCE_USE_CASES).map((useCase) => {
    const definition = SUPPORTED_USAGE_EVIDENCE_USE_CASES[useCase as keyof typeof SUPPORTED_USAGE_EVIDENCE_USE_CASES];
    const candidates = first.ranked.filter((entry) => entry.candidate.useCase === useCase);
    const active = firstItems.filter((item) => item.candidate.useCase === useCase).length;
    const reserve = firstReserve.filter((entry) => entry.candidate.useCase === useCase).length;
    const packs = registry.packs.filter((pack) => pack.useCase === useCase);
    return [useCase, { candidateCount: new Set(candidates.map((entry) => entry.candidate.productKey)).size, packCount: packs.length, capacityUnits: packs.reduce((sum, pack) => sum + pack.dailyReuseLimit, 0), keywordCount: definition.keywords.length, active, reserve, blockedCount: candidates.filter((entry) => !entry.score.eligible).length }];
  }));
  const unsupported = first.ranked.filter((entry) => entry.candidate.useCase === "unsupported");
  const assetUnavailable = first.ranked.filter((entry) => entry.score.blockers.includes("USAGE_EVIDENCE_NOT_AVAILABLE"));
  const idempotent = ready && secondApiCallCount === 0 && firstSnapshotDigest === secondSnapshotDigest;
  const marginalAnalysisReady = v3Marginal?.result === "TARGET_REACHED" && Boolean(selectedRegistry);
  const reportResult = v3Marginal ? (marginalAnalysisReady ? "MARGINAL_ANALYSIS_PASS" : "MARGINAL_ANALYSIS_FAIL") : ready && idempotent ? "PASS" : "FAIL";
  const report = {
    schemaVersion: v3Marginal ? "daily69-usage-source-packs-shadow-v3" : "daily69-usage-capacity-shadow-v2",
    generatedAt: new Date().toISOString(),
    queueRoot: basename(root),
    taskState: { enabled: false, isPaused: true },
    capacity: { supportedUseCases: new Set(registry.packs.map((pack) => pack.useCase)).size, packs: registry.packs.length, units: usageEvidenceCapacityUnits(registry), uniqueAssets: registry.assets.length },
    gap: {
      requiredActive: 69,
      requiredReserve: 14,
      currentActive: firstItems.length,
      currentReserve: firstReserve.length,
      shortfall: Math.max(0, 69 - firstItems.length),
      byUseCase,
      byCategory: Object.fromEntries([...categoryCounts].map(([key, count]) => [digest(key).slice(0, 12), count])),
      byProductFamily: Object.fromEntries([...familyCounts].map(([key, count]) => [digest(key).slice(0, 12), count])),
      unsupportedCandidates: { count: unsupported.length, keyHashes: unsupported.slice(0, 20).map((entry) => digest(entry.candidate.productKey).slice(0, 16)) },
      assetUnavailableCandidates: { count: assetUnavailable.length, keyHashes: assetUnavailable.slice(0, 20).map((entry) => digest(entry.candidate.productKey).slice(0, 16)) },
      recommendedUseCases: Object.entries(byUseCase).filter(([, value]) => value.candidateCount > 0).sort((left, right) => right[1].candidateCount - left[1].candidateCount).map(([useCase]) => useCase)
    },
    selection: { active: firstItems.length, reserve: firstReserve.length, activeKeyHash: digest([...activeKeys].sort()), reserveKeyHash: digest([...reserveKeys].sort()) },
    limits: { providerCalls: Number(first.run.metrics.apiCallCount ?? 0), rawDiscoveries: Number(first.run.metrics.discovered ?? 0), maxProviderCalls: 30, maxRawDiscoveries: 240, categoryRatio: 0.35, familyRatio: 0.1, assetReuse: 5, packReuse: registry.maxUsagePackReuse, sequenceConsecutive: registry.maxSameSequenceConsecutive, sourceVideoDaily: registry.maxSameSourceVideoDaily },
    diagnostics: { assetCapacityRejected: Number(first.run.metrics.assetCapacityRejected ?? 0), sequenceCapacityRejected: Number(first.run.metrics.sequenceCapacityRejected ?? 0), categoryCapacityRejected: Number(first.run.metrics.categoryCapacityRejected ?? 0), familyCapacityRejected: Number(first.run.metrics.familyCapacityRejected ?? 0), useCaseMismatchRejected: Number(first.run.metrics.useCaseMismatchRejected ?? 0), activeShortfall: Number(first.run.metrics.activeShortfall ?? 69), reserveShortfall: Number(first.run.metrics.reserveShortfall ?? 14) },
    activeValidation,
    reserveValidation,
    performance: { registryLoadMs, allocationMs: Number(first.run.metrics.allocationMs ?? 0), discoverySeconds },
    idempotency: { secondScoutExecuted: ready, secondApiCallCount, firstSnapshotDigest, secondSnapshotDigest, unchanged: idempotent },
    v3Marginal,
    selectedV3Registry: selectedRegistry ? { packs: selectedRegistry.packs.filter((pack) => pack.packGeneration === "v3_motion").length, packIds: v3Marginal?.selectedPackIds ?? [], pathStored: false } : null,
    writes: { ...QUEUE_SCHEDULER_FLAGS, CONTROL_COMMAND_EXECUTION: 0, VIDEO_RENDER: 0, TTS: 0, ASR: 0, WHISPERX: 0, WORKER_CHANGE: 0, SCHEDULER_CHANGE: 0 },
    result: reportResult
  };
  await mkdir(join(root, "capacity"), { recursive: true });
  await writeFile(join(root, "capacity", "usage-capacity-gap.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report));
  if (report.result !== "PASS" && report.result !== "MARGINAL_ANALYSIS_PASS") process.exitCode = 2;
}

void main().catch((error: unknown) => {
  const message = error instanceof Error && /^[A-Z0-9_:-]+$/u.test(error.message) ? error.message : "DAILY_69_CAPACITY_SHADOW_FAILED";
  console.error(JSON.stringify({ result: "ERROR", safeError: message, ...QUEUE_SCHEDULER_FLAGS }));
  process.exitCode = 1;
});
