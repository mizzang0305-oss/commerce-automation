import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { atomicWriteJson, readJson } from "./atomicJson";
import { acquireProcessLock } from "./lock";
import { DEFAULT_QUEUE_SCHEDULER_SETTINGS, validateSettings } from "./settings";
import type { LocalQueueItem, LocalRun, QueueSchedulerSettings } from "./types";
import type { RankedLiveProduct } from "@/lib/live-product-video";

export class LocalQueueRepository {
  readonly root: string;
  readonly queuePath: string;
  readonly runsPath: string;
  readonly settingsPath: string;
  constructor(root = resolve("data", "queue-scheduler-v1")) {
    this.root = root; this.queuePath = join(root, "queue.json"); this.runsPath = join(root, "runs.json"); this.settingsPath = join(root, "settings.json");
  }
  async settings(): Promise<QueueSchedulerSettings> { return validateSettings({ ...DEFAULT_QUEUE_SCHEDULER_SETTINGS, ...await readJson(this.settingsPath, {}) }); }
  async writeSettings(value: QueueSchedulerSettings): Promise<void> { await atomicWriteJson(this.settingsPath, validateSettings(value)); }
  async items(): Promise<LocalQueueItem[]> { return readJson(this.queuePath, []); }
  async runs(): Promise<LocalRun[]> { return readJson(this.runsPath, []); }
  async addRun(run: LocalRun): Promise<void> { const release = await acquireProcessLock(join(this.root, "runs.mutation.lock"), run.runId, 60_000); try { const runs = await this.runs(); runs.push(run); await atomicWriteJson(this.runsPath, runs.slice(-500)); } finally { await release(); } }

  async insertRanked(input: { ranked: RankedLiveProduct[]; queueDate: string; now: Date; dueNow?: boolean }): Promise<{ queued: LocalQueueItem[]; duplicateSkipped: number }> {
    return this.mutate(async (items, settings) => {
      const sameDay = items.filter((item) => item.queueDate === input.queueDate);
      const keys = new Set(sameDay.map((item) => item.productKey));
      const names = new Set(sameDay.map((item) => normalizeName(item.canonicalProductName)));
      const capacity = Math.max(0, settings.dailyTargetCount - sameDay.length);
      const selected: RankedLiveProduct[] = [];
      let duplicateSkipped = 0;
      if (capacity === 0) return { value: { queued: [], duplicateSkipped: input.ranked.length }, items };
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
          queueDate: input.queueDate, queueRank: rank, productKey: entry.candidate.productKey, productId: entry.candidate.rawProductId,
          rawProductName: entry.candidate.rawProductName, canonicalProductName: entry.candidate.canonicalProductName,
          sourceProvider: entry.candidate.sourceProvider, sourceKeyword: entry.candidate.sourceKeyword, productScore: entry.score.finalProductScore,
          scheduledAt: input.dueNow ? new Date(input.now.getTime() - 1_000).toISOString() : scheduledAt(input.queueDate, rank, settings),
          status: "scheduled", attemptCount: 0, leaseOwner: "", leaseAcquiredAt: "", leaseExpiresAt: "", nextAttemptAt: "",
          claimedAt: "", startedAt: "", finishedAt: "", creativeScore: null, videoQualityScore: null, videoPath: "", reviewPath: "",
          errorCode: "", safeMessage: "", reviewMetadata: { codexReview: "not_executed" }, candidate: entry.candidate, createdAt: nowIso, updatedAt: nowIso
        };
      });
      items.push(...queued); return { value: { queued, duplicateSkipped }, items };
    });
  }

  async recoverStale(now: Date): Promise<number> {
    return this.mutate(async (items) => { let count = 0; for (const item of items) { if ((item.status === "claimed" || item.status === "processing") && item.leaseExpiresAt && Date.parse(item.leaseExpiresAt) < now.getTime()) { item.status = item.attemptCount >= 2 ? "failed" : "retry_wait"; item.nextAttemptAt = now.toISOString(); item.errorCode = "STALE_LEASE_RECOVERED"; item.safeMessage = "STALE_LEASE_RECOVERED"; item.updatedAt = now.toISOString(); count += 1; } } return { value: count, items }; });
  }

  async claimDue(input: { now: Date; runId: string; limit: number; leaseMinutes: number; pilotMax: number }): Promise<LocalQueueItem[]> {
    return this.mutate(async (items) => {
      const processedToday = items.filter((item) => item.queueDate === kstDate(input.now) && item.attemptCount > 0).length;
      const remaining = Math.max(0, input.pilotMax - processedToday);
      const due = items.filter((item) => (item.status === "scheduled" && Date.parse(item.scheduledAt) <= input.now.getTime()) || (item.status === "retry_wait" && Date.parse(item.nextAttemptAt) <= input.now.getTime()))
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt) || a.queueRank - b.queueRank || a.id.localeCompare(b.id)).slice(0, Math.min(input.limit, remaining));
      const nowIso = input.now.toISOString();
      for (const item of due) { item.status = "claimed"; item.attemptCount += 1; item.claimedAt = nowIso; item.leaseOwner = input.runId; item.leaseAcquiredAt = nowIso; item.leaseExpiresAt = new Date(input.now.getTime() + input.leaseMinutes * 60_000).toISOString(); item.updatedAt = nowIso; }
      return { value: structuredClone(due), items };
    });
  }

  async markProcessing(ids: string[], now: Date): Promise<void> { await this.patch(ids, (item) => { item.status = "processing"; item.startedAt ||= now.toISOString(); }); }
  async complete(input: { id: string; videoPath: string; reviewPath: string; creativeScore: number; videoQualityScore: number; now: Date }): Promise<void> { await this.patch([input.id], (item) => { item.status = "video_ready_autoqa"; item.finishedAt = input.now.toISOString(); item.videoPath = input.videoPath; item.reviewPath = input.reviewPath; item.creativeScore = input.creativeScore; item.videoQualityScore = input.videoQualityScore; item.errorCode = ""; item.safeMessage = "MACHINE_QA_PASSED_CODEX_NOT_EXECUTED"; item.leaseOwner = ""; item.leaseExpiresAt = ""; }); }
  async fail(input: { id: string; code: string; retryable: boolean; now: Date; settings: QueueSchedulerSettings }): Promise<"retry_wait" | "failed" | "blocked"> { let result: "retry_wait" | "failed" | "blocked" = "blocked"; await this.patch([input.id], (item) => { if (input.retryable && item.attemptCount < input.settings.maxAttempts) { result = "retry_wait"; item.status = result; item.nextAttemptAt = new Date(input.now.getTime() + input.settings.retryBackoffMinutes * 60_000).toISOString(); } else { result = input.retryable ? "failed" : "blocked"; item.status = result; item.finishedAt = input.now.toISOString(); } item.errorCode = safeCode(input.code); item.safeMessage = safeCode(input.code); item.leaseOwner = ""; item.leaseExpiresAt = ""; }); return result; }

  private async patch(ids: string[], update: (item: LocalQueueItem) => void): Promise<void> { await this.mutate(async (items) => { const now = new Date().toISOString(); for (const item of items) if (ids.includes(item.id)) { update(item); item.updatedAt = now; } return { value: undefined, items }; }); }
  private async mutate<T>(fn: (items: LocalQueueItem[], settings: QueueSchedulerSettings) => Promise<{ value: T; items: LocalQueueItem[] }>): Promise<T> { const release = await acquireProcessLock(join(this.root, "queue.mutation.lock"), `mutation-${process.pid}`, 60_000); try { const [items, settings] = await Promise.all([this.items(), this.settings()]); const result = await fn(items, settings); await atomicWriteJson(this.queuePath, result.items); return result.value; } finally { await release(); } }
}

function scheduledAt(queueDate: string, rank: number, settings: QueueSchedulerSettings): string { const slot = Math.floor((rank - 1) / settings.batchSize); return new Date(`${queueDate}T${String(Math.min(settings.endHour, settings.startHour + slot * settings.intervalHours)).padStart(2, "0")}:00:00+09:00`).toISOString(); }
function normalizeName(value: string) { return value.toLowerCase().replace(/[^가-힣a-z0-9]/gu, ""); }
function safeCode(value: string) { return /^[A-Z0-9_:-]+$/u.test(value) ? value : "QUEUE_ITEM_FAILED"; }
export function kstDate(date = new Date()): string { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date); }
