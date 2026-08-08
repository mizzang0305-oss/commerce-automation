import type { LocalQueueItem, LocalRun, QueueSchedulerSettings } from "@/lib/queue-scheduler";

const GB = 1024 ** 3;

export function estimateDaily69Disk(input: { videoSizesBytes: number[]; freeBytes: number; dailyTargetCount?: number; reserveFloorGb?: number }) {
  const sizes = input.videoSizesBytes.filter((value) => Number.isFinite(value) && value > 0).sort((left, right) => left - right);
  const p95VideoBytes = percentile95(sizes);
  const dailyTargetCount = input.dailyTargetCount ?? 69;
  const reserveFloorBytes = (input.reserveFloorGb ?? 20) * GB;
  const estimatedWorkingBytes = Math.ceil(p95VideoBytes * dailyTargetCount * 2.5);
  const requiredFreeBytes = Math.max(reserveFloorBytes, estimatedWorkingBytes + reserveFloorBytes);
  return {
    sampleCount: sizes.length, p95VideoBytes, estimatedWorkingBytes, requiredFreeBytes, freeBytes: input.freeBytes,
    freeGb: roundGb(input.freeBytes), requiredFreeGb: roundGb(requiredFreeBytes), ready: sizes.length > 0 && input.freeBytes >= requiredFreeBytes,
    blocker: sizes.length === 0 ? "DISK_P95_SAMPLE_NOT_AVAILABLE" : input.freeBytes < requiredFreeBytes ? "DISK_CAPACITY_INSUFFICIENT" : ""
  };
}

export function auditDaily69Composition(items: LocalQueueItem[], settings: QueueSchedulerSettings) {
  const duplicates = items.length - new Set(items.map((item) => item.productKey)).size;
  const categories = frequency(items.map((item) => categoryKey(item.candidate.categoryPath || item.candidate.category)));
  const families = frequency(items.map((item) => familyKey(item)));
  const assets = frequency(items.map((item) => item.candidate.productImageUrls[0] || "missing"));
  const maxCategory = Math.max(0, ...categories.values());
  const maxFamily = Math.max(0, ...families.values());
  const maxAssetReuse = Math.max(0, ...assets.values());
  const threeConsecutiveHooks = items.some((item, index) => index >= 2 && item.candidate.useCase === items[index - 1].candidate.useCase && item.candidate.useCase === items[index - 2].candidate.useCase);
  return {
    duplicates, maxCategory, maxFamily, maxAssetReuse, threeConsecutiveHooks,
    categoryReady: maxCategory <= Math.floor(settings.dailyTargetCount * settings.maxCategoryRatio),
    familyReady: maxFamily <= Math.floor(settings.dailyTargetCount * settings.maxProductFamilyRatio),
    assetReady: !assets.has("missing") && maxAssetReuse <= settings.maxExactAssetReuse,
    hookReady: !threeConsecutiveHooks
  };
}

export function batchDurationP95(runs: LocalRun[]) {
  return percentile95(runs.filter((run) => run.type === "scheduled_batch" && ["success", "partial", "failed"].includes(run.status)).map((run) => Number(run.metrics.durationSeconds)).filter((value) => Number.isFinite(value) && value > 0));
}

export type Daily69ActivationEvidence = {
  activeCount: number; reserveCount: number; canaryCompleted: number; canaryTarget: number; schedulerPass: boolean;
  controlCenterPass: boolean; sheetsLivePass: boolean; controlRunnerPass: boolean; pauseResumePass: boolean;
  projectionPass: boolean; duplicateCount: number; activeLeaseCount: number; diskPass: boolean; batchP95Seconds: number;
  uploadCalls: number; postCalls: number; driveCalls: number; productionWrites: number;
};

export function decideDaily69Activation(evidence: Daily69ActivationEvidence) {
  const gates = {
    active69: evidence.activeCount === 69, reserve14: evidence.reserveCount >= 14,
    canary9: evidence.canaryCompleted === 9 && evidence.canaryTarget === 9, scheduler: evidence.schedulerPass,
    controlCenter: evidence.controlCenterPass, sheetsLive: evidence.sheetsLivePass, controlRunner: evidence.controlRunnerPass,
    pauseResume: evidence.pauseResumePass, projection: evidence.projectionPass, duplicate0: evidence.duplicateCount === 0,
    leases0: evidence.activeLeaseCount === 0, disk: evidence.diskPass, batchP95UnderHour: evidence.batchP95Seconds > 0 && evidence.batchP95Seconds < 3600,
    externalMutation0: evidence.uploadCalls === 0 && evidence.postCalls === 0 && evidence.driveCalls === 0 && evidence.productionWrites === 0
  };
  const armed = Object.values(gates).every(Boolean);
  return { armed, gates, decision: armed ? "DAILY_69_NO_UPLOAD_CONTROL_CENTER_PROVEN_AND_ARMED" : "DAILY_69_ACTIVATION_HELD" } as const;
}

function percentile95(values: number[]) { if (values.length === 0) return 0; const sorted = [...values].sort((left, right) => left - right); return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)]; }
function frequency(values: string[]) { const result = new Map<string, number>(); for (const value of values) result.set(value, (result.get(value) ?? 0) + 1); return result; }
function categoryKey(value: string) { return value.toLowerCase().split(/[>\/]/u)[0].replace(/[^가-힣a-z0-9]/gu, "") || "uncategorized"; }
function familyKey(item: LocalQueueItem) { return `${categoryKey(item.candidate.categoryPath)}:${item.canonicalProductName.toLowerCase().replace(/[^가-힣a-z0-9]/gu, "").slice(0, 24)}`; }
function roundGb(value: number) { return Math.round(value / GB * 100) / 100; }
