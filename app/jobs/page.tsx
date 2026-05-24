import Link from "next/link";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import type { WorkerJobStatus } from "@/types/automation";

export const dynamic = "force-dynamic";

const statuses: Array<WorkerJobStatus | "all"> = [
  "all",
  "pending",
  "claimed",
  "processing",
  "completed",
  "failed",
  "retry_wait",
  "cancelled"
];

export default async function JobsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = scalar(params.status) as WorkerJobStatus | "all" | undefined;
  const jobs = await getAutomationRepository().getWorkerJobs({ status: status || "all" });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Worker Jobs</h1>
        <p className="mt-2 text-sm text-slate-500">Claimed work, render results, retries, and failures.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {statuses.map((item) => (
          <Link
            key={item}
            href={item === "all" ? "/jobs" : `/jobs?status=${item}`}
            className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
              (status || "all") === item
                ? "border-teal-700 bg-teal-50 text-teal-800"
                : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            {item}
          </Link>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-[1100px] w-full border-collapse text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Job</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Queue item</th>
              <th className="px-4 py-3">Worker</th>
              <th className="px-4 py-3">Retry</th>
              <th className="px-4 py-3">Error</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  No worker jobs match this filter.
                </td>
              </tr>
            ) : (
              jobs.map((job) => (
                <tr key={job.id}>
                  <td className="px-4 py-4 font-semibold text-slate-950">{job.id}</td>
                  <td className="px-4 py-4 text-slate-600">{job.job_type}</td>
                  <td className="px-4 py-4">
                    <JobStatusBadge status={job.status} />
                  </td>
                  <td className="px-4 py-4">
                    {job.product_queue_id ? (
                      <Link href={`/queue/${job.product_queue_id}`} className="font-semibold text-teal-700">
                        {job.product_queue_id}
                      </Link>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-4 py-4 text-slate-600">{job.claimed_by || "-"}</td>
                  <td className="px-4 py-4 text-slate-600">
                    {job.retry_count}/{job.max_retries}
                  </td>
                  <td className="max-w-[260px] px-4 py-4 text-xs text-red-700">{job.error_message || "-"}</td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-2">
                      <button className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-500" disabled>
                        retry
                      </button>
                      <button className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-500" disabled>
                        fail
                      </button>
                      <button className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-500" disabled>
                        cancel
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function scalar(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function JobStatusBadge({ status }: { status: WorkerJobStatus }) {
  const className =
    status === "completed"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : status === "failed" || status === "cancelled"
        ? "bg-red-50 text-red-700 ring-red-200"
        : status === "retry_wait"
          ? "bg-amber-50 text-amber-700 ring-amber-200"
          : "bg-slate-50 text-slate-700 ring-slate-200";

  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${className}`}>{status}</span>;
}
