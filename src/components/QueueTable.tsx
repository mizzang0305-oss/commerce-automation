import Link from "next/link";
import type { ProductQueueItem, WorkerJob } from "@/types/automation";
import { formatDateTime } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { QueueActionButtons } from "@/components/QueueActionButtons";
import { EmptyState } from "@/components/EmptyState";

export function QueueTable({ items, workerJobs = [] }: { items: ProductQueueItem[]; workerJobs?: WorkerJob[] }) {
  if (items.length === 0) {
    return <EmptyState title="큐가 비어 있습니다" message="필터를 변경하거나 개발용 seed를 생성하세요." />;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="min-w-[1180px] w-full border-collapse text-left text-sm">
        <thead className="bg-slate-100 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3">Rank</th>
            <th className="px-4 py-3">Scheduled</th>
            <th className="px-4 py-3">Keyword</th>
            <th className="px-4 py-3">Product</th>
            <th className="px-4 py-3">Score</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Worker Job</th>
            <th className="px-4 py-3">YouTube</th>
            <th className="px-4 py-3">TikTok</th>
            <th className="px-4 py-3">Threads</th>
            <th className="px-4 py-3">Error</th>
            <th className="px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item) => {
            const job = workerJobs.find((workerJob) => workerJob.product_queue_id === item.id);
            const highlight =
              item.queue_status === "error"
                ? "bg-red-50"
                : item.queue_status === "manual_review"
                  ? "bg-orange-50"
                  : item.queue_status === "ready_for_manual_upload"
                    ? "bg-teal-50"
                    : "bg-white";
            return (
              <tr key={item.id} className={highlight}>
                <td className="px-4 py-4 font-semibold text-slate-700">{item.queue_rank}</td>
                <td className="px-4 py-4 text-slate-600">{formatDateTime(item.scheduled_at)}</td>
                <td className="px-4 py-4">
                  <div className="font-semibold text-slate-900">{item.keyword}</div>
                  <div className="text-xs text-slate-500">{item.theme}</div>
                </td>
                <td className="px-4 py-4">
                  <Link href={`/queue/${item.id}`} className="font-semibold text-slate-950 hover:text-teal-700">
                    {item.product_name}
                  </Link>
                  <div className="mt-1 text-xs text-slate-500">{item.category_path}</div>
                </td>
                <td className="px-4 py-4 font-bold text-slate-900">{item.product_score}</td>
                <td className="px-4 py-4"><StatusBadge status={item.queue_status} /></td>
                <td className="px-4 py-4 text-xs text-slate-600">
                  {job ? (
                    <Link href="/jobs" className="font-semibold text-teal-700">
                      {job.job_type} / {job.status}
                    </Link>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="px-4 py-4 text-xs text-slate-600">{item.youtube_upload_status}</td>
                <td className="px-4 py-4 text-xs text-slate-600">{item.tiktok_upload_status}</td>
                <td className="px-4 py-4 text-xs text-slate-600">{item.threads_post_status}</td>
                <td className="max-w-[220px] px-4 py-4 text-xs text-red-700">{item.error_message || "-"}</td>
                <td className="px-4 py-4"><QueueActionButtons item={item} compact /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
