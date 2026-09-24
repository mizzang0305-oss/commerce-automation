import type { StudioModel } from "./model";

type Cursor = StudioModel["snapshotCursor"];

export function compareStudioSnapshotCursor(current: Cursor, incoming: Cursor): "newer" | "same" | "stale" | "conflict" {
  if (!current) return incoming ? "newer" : "same";
  if (!incoming) return "stale";
  if (current.environmentId !== incoming.environmentId || current.hostId !== incoming.hostId) return "conflict";
  if (incoming.sourceSequence < current.sourceSequence) return "stale";
  if (incoming.sourceSequence > current.sourceSequence) return "newer";
  return current.eventId === incoming.eventId && current.sourceRevision === incoming.sourceRevision ? "same" : "conflict";
}

export function studioSnapshotIsStale(model: StudioModel, now: number): boolean {
  if (model.sourceStale) return true;
  if (!model.receivedAt) return false;
  const received = Date.parse(model.receivedAt);
  const observed = Date.parse(model.observedAt);
  return !Number.isFinite(received) || !Number.isFinite(observed) ||
    now - received > 180_000 || now - observed > 180_000;
}

export function studioRetryDelay(failures: number, retryAfter: string | null, now: number): number | null {
  const backoff = Math.min(300_000, 30_000 * 2 ** Math.min(Math.max(failures - 1, 0), 4));
  if (retryAfter === null) return backoff;
  const seconds = /^\d+(?:\.\d+)?$/u.test(retryAfter.trim()) ? Number(retryAfter.trim()) : NaN;
  const requested = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - now;
  if (!Number.isFinite(requested) || requested < 0 || requested > 2_147_483_647) return null;
  return Math.max(backoff, requested);
}
