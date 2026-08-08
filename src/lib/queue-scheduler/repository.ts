import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { atomicWriteJson, readJson } from "./atomicJson";
import { acquireProcessLock } from "./lock";
import { DEFAULT_QUEUE_SCHEDULER_SETTINGS, validateSettings } from "./settings";
import type { LocalQueueItem, LocalRun, QueueSchedulerSettings, ReserveCandidate } from "./types";
import type { RankedLiveProduct } from "@/lib/live-product-video";

export class LocalQueueRepository {
  readonly root: string;
  readonly queuePath: string;
  readonly runsPath: string;
  readonly settingsPath: string;
  readonly reservePath: string;
  constructor(root = resolveDefaultQueueRoot()) {
    this.root = root; this.queuePath = join(root, "queue.json"); this.runsPath = join(root, "runs.json"); this.settingsPath = join(root, "settings.json"); this.reservePath = join(root, "reserve-pool.json");
  }
  async settings(): Promise<QueueSchedulerSettings> { return validateSettings({ ...DEFAULT_QUEUE_SCHEDULER_SETTINGS, ...await readJson(this.settingsPath, {}) }); }
  async writeSettings(value: QueueSchedulerSettings): Promise<void> { await atomicWriteJson(this.settingsPath, validateSettings(value)); }
  async items(): Promise<LocalQueueItem[]> { return readJson(this.queuePath, []); }
  async runs(): Promise<LocalRun[]> { return readJson(this.runsPath, []); }
  async reserveCandidates(): Promise<ReserveCandidate[]> { return readJson(this.reservePath, []); }
  async addRun(run: LocalRun): Promise<void> { const release = await acquireProcessLock(join(this.root, "runs.mutation.lock"), run.runId, 60_000); try { const runs = await this.runs(); runs.push(run); await atomicWriteJson(this.runsPath, runs.slice(-500)); } finally { await release(); } }

  async insertRanked(input: { ranked: RankedLiveProduct[]; queueDate: string; now: Date; dueNow?: boolean }): Promise<{ queued: LocalQueueItem[]; duplicateSkipped: number; reserveAdded: number; reserveCount: number }> {
    return this.mutate(async (items, settings) => {
      const sameDay = items.filter((item) => item.queueDate === input.queueDate);
      const keys = new Set(sameDay.map((item) => item.productKey));
      const names = new Set(sameDay.map((item) => normalizeName(item.canonicalProductName)));
      const capacity = Math.max(0, settings.dailyTargetCount - sameDay.length);
      const selected: RankedLiveProduct[] = [];
      let duplicateSkipped = 0;
      if (capacity === 0) return { value: { queued: [], duplicateSkipped: input.ranked.length, reserveAdded: 0, reserveCount: (await this.reserveCandidates()).length }, items };
      for (const entry of input.ranked) {
        const name = normalizeName(entry.candidate.canonicalProductName);
        if (!entry.score.eligible || keys.has(entry.candidate.productKey) || names.has(name)) { duplicateSkipped += 1; continue; }
        keys.add(entry.candidate.productKey); names.add(name); selected.push(entry);
        if (selected.length >= capacity) break;
      }
      const nowIso = input.now.toISOString();
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
          errorCode: "", safeMessage: "", reviewMetadata: { codexReview: "not_executed" }, candidate: entry.candidate, createdAt: nowIso, updatedAt: nowIso
        };
      });
      const selectedKeys = new Set(selected.map((entry) => entry.candidate.productKey));
      const currentReserve = await this.reserveCandidates();
      const reserveKeys = new Set(currentReserve.map((entry) => entry.candidate.productKey));
      const reserveAdditions: ReserveCandidate[] = input.ranked
        .filter((entry) => entry.score.eligible && !selectedKeys.has(entry.candidate.productKey) && !keys.has(entry.candidate.productKey) && !reserveKeys.has(entry.candidate.productKey))
        .map((entry) => ({ ...entry, insertedAt: nowIso, claimedBySlot: "", claimedAt: "" }));
      if (reserveAdditions.length) await atomicWriteJson(this.reservePath, [...currentReserve, ...reserveAdditions]);
      items.push(...queued); return { value: { queued, duplicateSkipped, reserveAdded: reserveAdditions.length, reserveCount: currentReserve.length + reserveAdditions.length }, items };
    });
  }

  async recoverStale(now: Date): Promise<number> {
    return this.mutate(async (items) => { let count = 0; for (const item of items) { if ((item.status === "claimed" || item.status === "processing") && item.leaseExpiresAt && Date.parse(item.leaseExpiresAt) < now.getTime()) { item.status = item.attemptCount >= 2 ? "failed" : "retry_wait"; item.nextAttemptAt = now.toISOString(); item.errorCode = "STALE_LEASE_RECOVERED"; item.safeMessage = "STALE_LEASE_RECOVERED"; item.updatedAt = now.toISOString(); count += 1; } } return { value: count, items }; });
  }

  async claimDue(input: { now: Date; runId: string; limit: number; leaseMinutes: number; pilotMax: number }): Promise<LocalQueueItem[]> {
    return this.mutate(async (items) => {
      const due = items.filter((item) => item.queueDate === kstDate(input.now) && item.queueRank <= input.pilotMax && ((item.status === "scheduled" && Date.parse(item.scheduledAt) <= input.now.getTime()) || (item.status === "retry_wait" && Date.parse(item.nextAttemptAt) <= input.now.getTime())))
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt) || a.queueRank - b.queueRank || a.id.localeCompare(b.id)).slice(0, input.limit);
      const nowIso = input.now.toISOString();
      for (const item of due) { item.status = "claimed"; item.attemptCount += 1; item.claimedAt = nowIso; item.leaseOwner = input.runId; item.leaseAcquiredAt = nowIso; item.leaseExpiresAt = new Date(input.now.getTime() + input.leaseMinutes * 60_000).toISOString(); item.updatedAt = nowIso; }
      return { value: structuredClone(due), items };
    });
  }

  async markProcessing(ids: string[], now: Date): Promise<void> { await this.patch(ids, (item) => { item.status = "processing"; item.startedAt ||= now.toISOString(); }); }
  async complete(input: { id: string; videoPath: string; reviewPath: string; creativeScore: number; videoQualityScore: number; now: Date }): Promise<void> { await this.patch([input.id], (item) => { item.status = "video_ready_autoqa"; item.finishedAt = input.now.toISOString(); item.videoPath = input.videoPath; item.reviewPath = input.reviewPath; item.creativeScore = input.creativeScore; item.videoQualityScore = input.videoQualityScore; item.errorCode = ""; item.safeMessage = "MACHINE_QA_PASSED_CODEX_NOT_EXECUTED"; item.leaseOwner = ""; item.leaseExpiresAt = ""; const active = [...(item.candidateHistory ?? [])].reverse().find((entry) => entry.outcome === "active"); if (active) { active.outcome = "passed"; active.finishedAt = input.now.toISOString(); active.schedulerAttempts = item.attemptCount; } }); }
  async fail(input: { id: string; code: string; retryable: boolean; now: Date; settings: QueueSchedulerSettings }): Promise<"retry_wait" | "failed" | "blocked"> { let result: "retry_wait" | "failed" | "blocked" = "blocked"; await this.patch([input.id], (item) => { if (input.retryable && item.attemptCount < input.settings.maxAttempts) { result = "retry_wait"; item.status = result; item.nextAttemptAt = new Date(input.now.getTime() + input.settings.retryBackoffMinutes * 60_000).toISOString(); } else { result = input.retryable ? "failed" : "blocked"; item.status = result; item.finishedAt = input.now.toISOString(); } item.errorCode = safeCode(input.code); item.safeMessage = safeCode(input.code); item.leaseOwner = ""; item.leaseExpiresAt = ""; }); return result; }

  async replaceWithReserve(input: { id: string; reason: string; now: Date }): Promise<LocalQueueItem | null> {
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
        productScore: replacement.score.finalProductScore, candidate: replacement.candidate,
        productCandidateAttempt: productCandidateAttempt + 1, attemptCount: 0, status: "scheduled", scheduledAt: new Date(input.now.getTime() - 1_000).toISOString(),
        claimedAt: "", startedAt: "", finishedAt: "", leaseOwner: "", leaseAcquiredAt: "", leaseExpiresAt: "", nextAttemptAt: "",
        creativeScore: null, videoQualityScore: null, videoPath: "", reviewPath: "", errorCode: "", safeMessage: "PRODUCT_REPLACEMENT_SCHEDULED", updatedAt: nowIso
      });
      item.candidateHistory = [...history, { productKey: replacement.candidate.productKey, canonicalProductName: replacement.candidate.canonicalProductName, startedAt: nowIso, finishedAt: "", outcome: "active", reason: "RESERVE_FALLBACK", schedulerAttempts: 0, replacementOfProductKey: previousKey }];
      await Promise.all([atomicWriteJson(this.queuePath, items), atomicWriteJson(this.reservePath, reserve)]);
      return structuredClone(item);
    } finally { await release(); }
  }

  private async patch(ids: string[], update: (item: LocalQueueItem) => void): Promise<void> { await this.mutate(async (items) => { const now = new Date().toISOString(); for (const item of items) if (ids.includes(item.id)) { update(item); item.updatedAt = now; } return { value: undefined, items }; }); }
  private async mutate<T>(fn: (items: LocalQueueItem[], settings: QueueSchedulerSettings) => Promise<{ value: T; items: LocalQueueItem[] }>): Promise<T> { const release = await acquireQueueMutationLock(join(this.root, "queue.mutation.lock"), `mutation-${process.pid}`); try { const [items, settings] = await Promise.all([this.items(), this.settings()]); const result = await fn(items, settings); await atomicWriteJson(this.queuePath, result.items); return result.value; } finally { await release(); } }
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
async function acquireQueueMutationLock(path: string, runId: string): Promise<() => Promise<void>> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try { return await acquireProcessLock(path, runId, 60_000); }
    catch (error) { if ((error as Error).message !== "SCHEDULER_ALREADY_RUNNING" || attempt === 199) throw error; await new Promise((resolvePromise) => setTimeout(resolvePromise, 10)); }
  }
  throw new Error("QUEUE_MUTATION_LOCK_TIMEOUT");
}
export function kstDate(date = new Date()): string { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date); }
