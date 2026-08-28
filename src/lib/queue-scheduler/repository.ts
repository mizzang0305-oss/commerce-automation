import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { atomicWriteJson, readJson } from "./atomicJson";
import { acquireProcessLock } from "./lock";
import { DEFAULT_QUEUE_SCHEDULER_SETTINGS, validateSettings } from "./settings";
import type { LocalQueueItem, LocalRun, QueueControlState, QueueSchedulerSettings, ReserveCandidate } from "./types";
import { assertCodexReviewEvidence, isCodexReviewEvidenceV2, type CodexReviewSubmission } from "./codexReviewEvidence";
import type { RankedLiveProduct } from "@/lib/live-product-video";
import type { UsageCapacityPlan } from "@/lib/usage-evidence";

export class LocalQueueRepository {
  readonly root: string;
  readonly queuePath: string;
  readonly runsPath: string;
  readonly settingsPath: string;
  readonly reservePath: string;
  readonly controlStatePath: string;
  constructor(root = resolveDefaultQueueRoot()) {
    this.root = root; this.queuePath = join(root, "queue.json"); this.runsPath = join(root, "runs.json"); this.settingsPath = join(root, "settings.json"); this.reservePath = join(root, "reserve-pool.json"); this.controlStatePath = join(root, "control-state.json");
  }
  async settings(): Promise<QueueSchedulerSettings> { return validateSettings({ ...DEFAULT_QUEUE_SCHEDULER_SETTINGS, ...await readJson(this.settingsPath, {}) }); }
  async writeSettings(value: QueueSchedulerSettings): Promise<void> {
    const release = await acquireQueueMutationLock(join(this.root, "queue.mutation.lock"), `settings-${process.pid}`);
    try {
      const validated = validateSettings(value);
      const current = await this.settings();
      if (JSON.stringify(current) === JSON.stringify(validated)) return;
      await atomicWriteJson(this.settingsPath, validated);
      await this.bumpLocalRevision();
    } finally { await release(); }
  }
  async items(): Promise<LocalQueueItem[]> { return (await readJson<LocalQueueItem[]>(this.queuePath, [])).map((item) => ({ ...item, slotId: item.slotId || `slot-${String(item.queueRank).padStart(3, "0")}`, localRevision: Number(item.localRevision ?? 0) })); }
  async runs(): Promise<LocalRun[]> { return readJson(this.runsPath, []); }
  async reserveCandidates(): Promise<ReserveCandidate[]> { return readJson(this.reservePath, []); }
  async controlState(): Promise<QueueControlState> { return readJson(this.controlStatePath, { localRevision: 0, projectionRevision: 0, snapshotHash: "", projectedAt: "", source: "local_queue_scheduler" }); }
  async recordProjection(input: { localRevision: number; snapshotHash: string; projectedAt: string }): Promise<QueueControlState> {
    const release = await acquireQueueMutationLock(join(this.root, "queue.mutation.lock"), `projection-${process.pid}`);
    try {
      const state = await this.controlState();
      if (input.localRevision > state.localRevision) throw new Error("PROJECTION_REVISION_AHEAD_OF_LOCAL");
      const next = { ...state, projectionRevision: input.localRevision, snapshotHash: input.snapshotHash, projectedAt: input.projectedAt, source: "local_queue_scheduler" as const };
      await atomicWriteJson(this.controlStatePath, next);
      return next;
    } finally { await release(); }
  }
  async addRun(run: LocalRun): Promise<void> { const release = await acquireProcessLock(join(this.root, "runs.mutation.lock"), run.runId, 60_000); try { const runs = await this.runs(); runs.push(run); await atomicWriteJson(this.runsPath, runs.slice(-500)); } finally { await release(); } }

  async insertRanked(input: { ranked: RankedLiveProduct[]; queueDate: string; now: Date; dueNow?: boolean; capacityPlan?: UsageCapacityPlan }): Promise<{ queued: LocalQueueItem[]; duplicateSkipped: number; reserveAdded: number; reserveCount: number }> {
    return this.mutate(async (items, settings) => {
      const sameDay = items.filter((item) => item.queueDate === input.queueDate);
      const keys = new Set(sameDay.map((item) => item.productKey));
      const names = new Set(sameDay.map((item) => normalizeName(item.canonicalProductName)));
      const capacity = Math.max(0, settings.dailyTargetCount - sameDay.length);
      const selected: RankedLiveProduct[] = [];
      let duplicateSkipped = 0;
      if (capacity === 0) return { value: { queued: [], duplicateSkipped: input.ranked.length, reserveAdded: 0, reserveCount: (await this.reserveCandidates()).length }, items };
      const candidates = input.capacityPlan?.active ?? (settings.mode === "no_upload_daily_69"
        ? selectDailyDiverseRanked(input.ranked, settings, sameDay)
        : input.ranked);
      for (const entry of candidates) {
        const name = normalizeName(entry.candidate.canonicalProductName);
        if (!entry.score.eligible || keys.has(entry.candidate.productKey) || names.has(name)) { duplicateSkipped += 1; continue; }
        keys.add(entry.candidate.productKey); names.add(name); selected.push(entry);
        if (selected.length >= capacity) break;
      }
      const nowIso = input.now.toISOString();
      const allocationByProduct = new Map((input.capacityPlan?.allocations ?? []).map((allocation) => [allocation.productKey, allocation]));
      const queued = selected.map((entry, index): LocalQueueItem => {
        const rank = sameDay.length + index + 1;
        return {
          id: `localq-${input.queueDate.replace(/-/gu, "")}-${String(rank).padStart(3, "0")}-${randomUUID().slice(0, 8)}`,
          slotId: `slot-${String(rank).padStart(3, "0")}`,
          queueDate: input.queueDate, queueRank: rank, productKey: entry.candidate.productKey, productId: entry.candidate.rawProductId,
          rawProductName: entry.candidate.rawProductName, canonicalProductName: entry.candidate.canonicalProductName,
          sourceProvider: entry.candidate.sourceProvider, sourceKeyword: entry.candidate.sourceKeyword, productScore: entry.score.finalProductScore,
          scheduledAt: input.dueNow ? new Date(input.now.getTime() - 1_000).toISOString() : scheduledAt(input.queueDate, rank, settings),
          status: "scheduled", attemptCount: 0, productCandidateAttempt: 1, maxProductCandidates: settings.maxProductCandidates,
          candidateHistory: [{ productKey: entry.candidate.productKey, canonicalProductName: entry.candidate.canonicalProductName, startedAt: nowIso, finishedAt: "", outcome: "active", reason: "PRIMARY_SELECTED", schedulerAttempts: 0, replacementOfProductKey: "" }],
          leaseOwner: "", leaseAcquiredAt: "", leaseExpiresAt: "", nextAttemptAt: "",
          claimedAt: "", startedAt: "", finishedAt: "", creativeScore: null, videoQualityScore: null, videoPath: "", reviewPath: "",
          errorCode: "", safeMessage: "", reviewMetadata: { codexReview: "not_executed" }, candidate: entry.candidate, usageEvidenceAllocation: allocationByProduct.get(entry.candidate.productKey), createdAt: nowIso, updatedAt: nowIso, localRevision: 0
        };
      });
      const selectedKeys = new Set(selected.map((entry) => entry.candidate.productKey));
      const currentReserve = await this.reserveCandidates();
      const reserveKeys = new Set(currentReserve.map((entry) => entry.candidate.productKey));
      const reservePool = input.capacityPlan?.reserve ?? input.ranked;
      const reserveAdditions: ReserveCandidate[] = reservePool
        .filter((entry) => entry.score.eligible && !selectedKeys.has(entry.candidate.productKey) && !keys.has(entry.candidate.productKey) && !reserveKeys.has(entry.candidate.productKey))
        .map((entry) => ({ ...entry, insertedAt: nowIso, claimedBySlot: "", claimedAt: "", queueDate: input.queueDate, usageEvidenceAllocation: allocationByProduct.get(entry.candidate.productKey) }));
      if (reserveAdditions.length) await atomicWriteJson(this.reservePath, [...currentReserve, ...reserveAdditions]);
      items.push(...queued); return { value: { queued, duplicateSkipped, reserveAdded: reserveAdditions.length, reserveCount: currentReserve.length + reserveAdditions.length }, items };
    });
  }

  async recoverStale(now: Date): Promise<number> {
    return this.mutate(async (items) => { let count = 0; for (const item of items) { if ((item.status === "claimed" || item.status === "processing") && item.leaseExpiresAt && Date.parse(item.leaseExpiresAt) < now.getTime()) { item.status = item.attemptCount >= 2 ? "failed" : "retry_wait"; item.nextAttemptAt = now.toISOString(); item.errorCode = "STALE_LEASE_RECOVERED"; item.safeMessage = "STALE_LEASE_RECOVERED"; item.updatedAt = now.toISOString(); count += 1; } } return { value: count, items }; });
  }

  async claimDue(input: { now: Date; runId: string; limit: number; leaseMinutes: number; pilotMax: number }): Promise<LocalQueueItem[]> {
    return this.mutate(async (items) => {
      const settings = await this.settings();
      const today = items.filter((item) => item.queueDate === kstDate(input.now));
      const logicalCap = Math.min(input.pilotMax, settings.processingDailyCap);
      const due = today.filter((item) => item.queueRank <= logicalCap && ((item.status === "scheduled" && Date.parse(item.scheduledAt) <= input.now.getTime()) || (item.status === "retry_wait" && Date.parse(item.nextAttemptAt) <= input.now.getTime())))
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt) || a.queueRank - b.queueRank || a.id.localeCompare(b.id)).slice(0, input.limit);
      const nowIso = input.now.toISOString();
      for (const item of due) { item.status = "claimed"; item.attemptCount += 1; item.claimedAt = nowIso; item.leaseOwner = input.runId; item.leaseAcquiredAt = nowIso; item.leaseExpiresAt = new Date(input.now.getTime() + input.leaseMinutes * 60_000).toISOString(); item.updatedAt = nowIso; }
      return { value: structuredClone(due), items };
    });
  }

  async markProcessing(ids: string[], now: Date): Promise<void> { await this.patch(ids, (item) => { item.status = "processing"; item.startedAt ||= now.toISOString(); }); }
  async complete(input: { id: string; videoPath: string; reviewPath: string; creativeScore: number; videoQualityScore: number; now: Date }): Promise<void> { await this.patch([input.id], (item) => { item.status = "video_ready_machine_qa"; item.finishedAt = input.now.toISOString(); item.videoPath = input.videoPath; item.reviewPath = input.reviewPath; item.creativeScore = input.creativeScore; item.videoQualityScore = input.videoQualityScore; item.errorCode = ""; item.safeMessage = "MACHINE_QA_PASSED_CODEX_NOT_EXECUTED"; item.leaseOwner = ""; item.leaseAcquiredAt = ""; item.leaseExpiresAt = ""; const active = [...(item.candidateHistory ?? [])].reverse().find((entry) => entry.outcome === "active"); if (active) { active.outcome = "passed"; active.finishedAt = input.now.toISOString(); active.schedulerAttempts = item.attemptCount; } }); }
  async recordCodexVisualReviews(input: { reviews: CodexReviewSubmission[]; now: Date }): Promise<number> {
    if (input.reviews.length === 0) throw new Error("CODEX_VISUAL_REVIEW_INPUT_INVALID");
    if (input.reviews.some((review) => !isCodexReviewEvidenceV2(review) && review.passed)) {
      throw new Error("CODEX_VISUAL_REVIEW_EXACT_EVIDENCE_REQUIRED");
    }
    return this.mutate(async (items) => {
      const identities = input.reviews.map((review) => isCodexReviewEvidenceV2(review) ? review.queueId : `legacy:${review.productKey}`);
      if (new Set(identities).size !== identities.length) throw new Error("CODEX_VISUAL_REVIEW_DUPLICATE_QUEUE_ITEM");
      const planned: Array<{ item: LocalQueueItem; review: CodexReviewSubmission }> = [];
      for (const review of input.reviews) {
        const matches = isCodexReviewEvidenceV2(review)
          ? items.filter((item) => item.id === review.queueId)
          : items.filter((item) => item.productKey === review.productKey && ["video_ready_machine_qa", "video_ready_autoqa", "manual_review"].includes(item.status));
        if (matches.length === 0) throw new Error("CODEX_VISUAL_REVIEW_QUEUE_ITEM_NOT_FOUND");
        if (matches.length !== 1) throw new Error("CODEX_VISUAL_REVIEW_QUEUE_ITEM_AMBIGUOUS");
        const [item] = matches;
        if (!["video_ready_machine_qa", "video_ready_autoqa", "manual_review"].includes(item.status)) throw new Error("CODEX_VISUAL_REVIEW_QUEUE_STATE_CONFLICT");
        if (isCodexReviewEvidenceV2(review)) await assertCodexReviewEvidence({ evidence: review, item, queueRoot: this.root, now: input.now });
        planned.push({ item, review });
      }
      for (const { item, review } of planned) {
        const passed = isCodexReviewEvidenceV2(review) ? review.reviewResult === "pass" : false;
        item.reviewMetadata = {
          codexReview: passed ? "pass" : "block",
          ...(isCodexReviewEvidenceV2(review) ? { evidence: structuredClone(review) } : {})
        };
        item.status = passed ? "video_ready_autoqa" : "manual_review";
        item.safeMessage = passed ? "CODEX_VISUAL_REVIEW_PASSED_NO_UPLOAD" : "CODEX_VISUAL_REVIEW_BLOCKED";
        item.updatedAt = input.now.toISOString();
      }
      return { value: planned.length, items };
    });
  }
  async fail(input: { id: string; code: string; retryable: boolean; now: Date; settings: QueueSchedulerSettings }): Promise<"retry_wait" | "failed" | "blocked"> { let result: "retry_wait" | "failed" | "blocked" = "blocked"; await this.patch([input.id], (item) => { if (input.retryable && item.attemptCount < input.settings.maxAttempts) { result = "retry_wait"; item.status = result; item.nextAttemptAt = new Date(input.now.getTime() + input.settings.retryBackoffMinutes * 60_000).toISOString(); } else { result = input.retryable ? "failed" : "blocked"; item.status = result; item.finishedAt = input.now.toISOString(); } item.errorCode = safeCode(input.code); item.safeMessage = safeCode(input.code); item.leaseOwner = ""; item.leaseExpiresAt = ""; }); return result; }

  async replaceWithReserve(input: { id: string; reason: string; now: Date; expectedRevision?: number }): Promise<LocalQueueItem | null> {
    const release = await acquireQueueMutationLock(join(this.root, "queue.mutation.lock"), `reserve-${process.pid}`);
    try {
      const [items, settings, reserve] = await Promise.all([this.items(), this.settings(), this.reserveCandidates()]);
      const item = items.find((entry) => entry.id === input.id);
      if (!item) throw new Error("QUEUE_SLOT_NOT_FOUND");
      const history = item.candidateHistory ?? [];
      const productCandidateAttempt = item.productCandidateAttempt ?? 1;
      if (productCandidateAttempt >= (item.maxProductCandidates ?? settings.maxProductCandidates)) return null;
      const usedKeys = new Set(items.flatMap((entry) => [entry.productKey, ...(entry.candidateHistory ?? []).map((historyEntry) => historyEntry.productKey)]));
      const compatible = reserve.filter((entry) => !entry.claimedBySlot && !usedKeys.has(entry.candidate.productKey) && entry.score.eligible);
      const replacement = compatible.sort((left, right) => Number(right.candidate.useCase === item.candidate.useCase) - Number(left.candidate.useCase === item.candidate.useCase) || right.score.finalProductScore - left.score.finalProductScore || left.candidate.productKey.localeCompare(right.candidate.productKey))[0];
      if (!replacement) return null;
      const nowIso = input.now.toISOString();
      const previousKey = item.productKey;
      const active = [...history].reverse().find((entry) => entry.outcome === "active");
      if (active) { active.outcome = "replaced"; active.finishedAt = nowIso; active.reason = safeCode(input.reason); active.schedulerAttempts = item.attemptCount; }
      replacement.claimedBySlot = item.slotId || `slot-${String(item.queueRank).padStart(3, "0")}`;
      replacement.claimedAt = nowIso;
      Object.assign(item, {
        productKey: replacement.candidate.productKey, productId: replacement.candidate.rawProductId,
        rawProductName: replacement.candidate.rawProductName, canonicalProductName: replacement.candidate.canonicalProductName,
        sourceProvider: replacement.candidate.sourceProvider, sourceKeyword: replacement.candidate.sourceKeyword,
        productScore: replacement.score.finalProductScore, candidate: replacement.candidate, usageEvidenceAllocation: replacement.usageEvidenceAllocation,
        productCandidateAttempt: productCandidateAttempt + 1, attemptCount: 0, status: "scheduled", scheduledAt: new Date(input.now.getTime() - 1_000).toISOString(),
        claimedAt: "", startedAt: "", finishedAt: "", leaseOwner: "", leaseAcquiredAt: "", leaseExpiresAt: "", nextAttemptAt: "",
        creativeScore: null, videoQualityScore: null, videoPath: "", reviewPath: "", errorCode: "", safeMessage: "PRODUCT_REPLACEMENT_SCHEDULED", updatedAt: nowIso
      });
      item.candidateHistory = [...history, { productKey: replacement.candidate.productKey, canonicalProductName: replacement.candidate.canonicalProductName, startedAt: nowIso, finishedAt: "", outcome: "active", reason: "RESERVE_FALLBACK", schedulerAttempts: 0, replacementOfProductKey: previousKey }];
      const revision = await this.bumpLocalRevision();
      item.localRevision = revision;
      await Promise.all([atomicWriteJson(this.queuePath, items), atomicWriteJson(this.reservePath, reserve)]);
      return structuredClone(item);
    } finally { await release(); }
  }

  async setPaused(paused: boolean): Promise<QueueSchedulerSettings> {
    const current = await this.settings();
    const next = { ...current, isPaused: paused };
    await this.writeSettings(next);
    return next;
  }

  async mutateItem(input: { id: string; expectedRevision: number; action: "hold" | "skip" | "release_hold" | "retry"; now: Date; reason?: string }): Promise<LocalQueueItem> {
    await this.mutate(async (items) => {
      const item = items.find((entry) => entry.id === input.id);
      if (!item) throw new Error("QUEUE_SLOT_NOT_FOUND");
      if (input.expectedRevision !== undefined && item.localRevision !== input.expectedRevision) throw new Error("STALE_CONTROL_COMMAND");
      if (item.localRevision !== input.expectedRevision) throw new Error("STALE_CONTROL_COMMAND");
      const nowIso = input.now.toISOString();
      if (input.action === "hold") {
        if (["claimed", "processing", "video_ready_machine_qa", "video_ready_autoqa", "skipped"].includes(item.status)) throw new Error("CONTROL_COMMAND_STATE_CONFLICT");
        item.controlPreviousStatus = item.status;
        item.status = "hold";
        item.holdReason = safeCode(input.reason || "OWNER_HOLD");
      } else if (input.action === "skip") {
        if (["claimed", "processing", "video_ready_machine_qa", "video_ready_autoqa"].includes(item.status)) throw new Error("CONTROL_COMMAND_STATE_CONFLICT");
        item.status = "skipped";
        item.finishedAt = nowIso;
      } else if (input.action === "release_hold") {
        if (item.status !== "hold") throw new Error("CONTROL_COMMAND_STATE_CONFLICT");
        item.status = item.controlPreviousStatus === "retry_wait" ? "retry_wait" : "scheduled";
        item.controlPreviousStatus = undefined;
        item.holdReason = "";
      } else {
        if (!["failed", "blocked", "manual_review"].includes(item.status)) throw new Error("CONTROL_COMMAND_STATE_CONFLICT");
        item.status = "scheduled";
        item.scheduledAt = new Date(input.now.getTime() - 1_000).toISOString();
        item.nextAttemptAt = "";
        item.finishedAt = "";
        item.errorCode = "";
        item.safeMessage = "OWNER_RETRY_SCHEDULED";
        item.leaseOwner = "";
        item.leaseExpiresAt = "";
      }
      item.updatedAt = nowIso;
      return { value: undefined, items };
    });
    const item = (await this.items()).find((entry) => entry.id === input.id);
    if (!item) throw new Error("QUEUE_SLOT_NOT_FOUND");
    return item;
  }

  private async patch(ids: string[], update: (item: LocalQueueItem) => void): Promise<void> { await this.mutate(async (items) => { const now = new Date().toISOString(); for (const item of items) if (ids.includes(item.id)) { update(item); item.updatedAt = now; } return { value: undefined, items }; }); }
  private async mutate<T>(fn: (items: LocalQueueItem[], settings: QueueSchedulerSettings) => Promise<{ value: T; items: LocalQueueItem[] }>): Promise<T> {
    const release = await acquireQueueMutationLock(join(this.root, "queue.mutation.lock"), `mutation-${process.pid}`);
    try {
      const [items, settings] = await Promise.all([this.items(), this.settings()]);
      const before = new Map(items.map((item) => [item.id, JSON.stringify(item)]));
      const result = await fn(items, settings);
      const changed = result.items.filter((item) => before.get(item.id) !== JSON.stringify(item));
      const removed = result.items.length !== before.size;
      if (changed.length > 0 || removed) {
        const revision = await this.bumpLocalRevision();
        for (const item of changed) item.localRevision = revision;
        await atomicWriteJson(this.queuePath, result.items);
      }
      return result.value;
    } finally { await release(); }
  }

  private async bumpLocalRevision(): Promise<number> {
    const state = await this.controlState();
    const localRevision = state.localRevision + 1;
    await atomicWriteJson(this.controlStatePath, { ...state, localRevision, source: "local_queue_scheduler" });
    return localRevision;
  }
}

export function resolveDefaultQueueRoot(): string {
  const explicit = process.env.QUEUE_SCHEDULER_ROOT?.trim();
  if (explicit) return resolve(explicit);
  const base = resolve("data", "queue-scheduler-v1");
  const pointer = join(base, "active-pilot.json");
  if (!existsSync(pointer)) return base;
  try {
    const value = JSON.parse(readFileSync(pointer, "utf8")) as { root?: unknown };
    return typeof value.root === "string" && value.root.trim() ? resolve(value.root) : base;
  } catch { return base; }
}

function scheduledAt(queueDate: string, rank: number, settings: QueueSchedulerSettings): string { const slot = Math.floor((rank - 1) / settings.batchSize); return new Date(`${queueDate}T${String(Math.min(settings.endHour, settings.startHour + slot * settings.intervalHours)).padStart(2, "0")}:00:00+09:00`).toISOString(); }
function normalizeName(value: string) { return value.toLowerCase().replace(/[^가-힣a-z0-9]/gu, ""); }
function safeCode(value: string) { return /^[A-Z0-9_:-]+$/u.test(value) ? value : "QUEUE_ITEM_FAILED"; }
function selectDailyDiverseRanked(ranked: RankedLiveProduct[], settings: QueueSchedulerSettings, existing: LocalQueueItem[]) {
  const categoryMax = Math.max(1, Math.floor(settings.dailyTargetCount * settings.maxCategoryRatio));
  const familyMax = Math.max(1, Math.floor(settings.dailyTargetCount * settings.maxProductFamilyRatio));
  const categoryCounts = countBy(existing, (item) => categoryKey(item.candidate.categoryPath || item.candidate.category));
  const familyCounts = countBy(existing, (item) => familyKey(item.candidate.canonicalProductName, item.candidate.categoryPath));
  const useCaseCounts = countBy(existing, (item) => item.candidate.useCase);
  const selected: RankedLiveProduct[] = [];
  const remaining = ranked.filter((entry) => entry.score.eligible);
  while (remaining.length > 0) {
    const lastTwo = selected.slice(-2).map((entry) => entry.candidate.useCase);
    const valid = remaining.map((entry, index) => ({ entry, index })).filter(({ entry }) => {
      const category = categoryKey(entry.candidate.categoryPath || entry.candidate.category);
      const family = familyKey(entry.candidate.canonicalProductName, entry.candidate.categoryPath);
      const repeatedHook = lastTwo.length === 2 && lastTwo.every((value) => value === entry.candidate.useCase);
      return !repeatedHook && (categoryCounts.get(category) ?? 0) < categoryMax && (familyCounts.get(family) ?? 0) < familyMax;
    });
    const index = valid.sort((left, right) => (useCaseCounts.get(left.entry.candidate.useCase) ?? 0) - (useCaseCounts.get(right.entry.candidate.useCase) ?? 0) || left.index - right.index)[0]?.index ?? -1;
    if (index < 0) break;
    const [entry] = remaining.splice(index, 1);
    selected.push(entry);
    increment(categoryCounts, categoryKey(entry.candidate.categoryPath || entry.candidate.category));
    increment(familyCounts, familyKey(entry.candidate.canonicalProductName, entry.candidate.categoryPath));
    increment(useCaseCounts, entry.candidate.useCase);
  }
  return selected;
}
function categoryKey(value: string) { return normalizeName(value.split(/[>\/]/u)[0] || "uncategorized") || "uncategorized"; }
function familyKey(name: string, categoryPath: string) { return `${categoryKey(categoryPath)}:${normalizeName(name).slice(0, 24)}`; }
function countBy<T>(values: T[], key: (value: T) => string) { const counts = new Map<string, number>(); for (const value of values) increment(counts, key(value)); return counts; }
function increment(counts: Map<string, number>, key: string) { counts.set(key, (counts.get(key) ?? 0) + 1); }
async function acquireQueueMutationLock(path: string, runId: string): Promise<() => Promise<void>> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try { return await acquireProcessLock(path, runId, 60_000); }
    catch (error) { if ((error as Error).message !== "SCHEDULER_ALREADY_RUNNING" || attempt === 199) throw error; await new Promise((resolvePromise) => setTimeout(resolvePromise, 10)); }
  }
  throw new Error("QUEUE_MUTATION_LOCK_TIMEOUT");
}
export function kstDate(date = new Date()): string { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date); }
