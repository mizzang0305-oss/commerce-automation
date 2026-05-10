import type { QueueStatus } from "@/types/automation";
import { queueStatusBadgeClasses, queueStatusLabels } from "@/lib/status";

export function StatusBadge({ status }: { status: QueueStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${queueStatusBadgeClasses[status]}`}
    >
      {queueStatusLabels[status]}
    </span>
  );
}
