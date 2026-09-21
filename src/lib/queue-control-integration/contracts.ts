import type { LocalQueueItem, LocalQueueStatus, QueueControlState, QueueSchedulerSettings, ReserveCandidate } from "@/lib/queue-scheduler";

export const QUEUE_PROJECTION_EXTRA_HEADERS = [
  "Slot ID", "Local Revision", "Queue Date", "Queue Rank", "Projection Source", "Projection Revision",
  "Artifact Reference ID", "Safe Media Metadata", "Product Key Hash", "Lease State", "Repair Count",
  "Fallback Count", "Updated At ISO", "Namespace"
] as const;

export const RESERVE_SHEET_NAME = "예비상품";
export const RESERVE_HEADERS = [
  "Queue Date", "Reserve Rank", "Product Name", "Use Case", "Category", "Score", "Product Key Hash",
  "Claimed Slot", "Claimed At", "Inserted At", "Projection Revision", "Namespace"
] as const;

export const SYNC_SHEET_NAME = "동기화상태";
export const SYNC_HEADERS = [
  "Namespace", "Source", "Local Revision", "Projection Revision", "Snapshot Hash", "Projected At",
  "Queue Count", "Reserve Count", "Paused", "Enabled", "Upload Enabled", "Projection Status"
] as const;

export type QueueProjectionSnapshot = {
  namespace: string;
  settings: QueueSchedulerSettings;
  items: LocalQueueItem[];
  reserve: ReserveCandidate[];
  state: QueueControlState;
};

export type QueueControlMutation = "hold" | "skip" | "release_hold" | "retry";

export const MUTABLE_ITEM_STATUSES: ReadonlySet<LocalQueueStatus> = new Set([
  "scheduled", "retry_wait", "manual_review", "blocked", "failed", "hold"
]);
