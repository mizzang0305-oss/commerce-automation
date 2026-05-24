import { getAutomationRepository } from "@/lib/repositories/automationRepository";

export const dynamic = "force-dynamic";

export default async function WorkersPage() {
  const workers = await getAutomationRepository().getWorkerHeartbeats();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Workers</h1>
        <p className="mt-2 text-sm text-slate-500">Python worker heartbeat and current job status.</p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-[760px] w-full border-collapse text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Worker ID</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Last heartbeat</th>
              <th className="px-4 py-3">Current job</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {workers.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  No worker heartbeat has been received yet.
                </td>
              </tr>
            ) : (
              workers.map((worker) => (
                <tr key={worker.worker_id}>
                  <td className="px-4 py-4 font-semibold text-slate-950">{worker.worker_id}</td>
                  <td className="px-4 py-4">
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                      {worker.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-slate-600">{worker.last_heartbeat_at || "-"}</td>
                  <td className="px-4 py-4 text-slate-600">
                    {worker.current_job_id ? `${worker.current_job_type} / ${worker.current_job_id}` : "-"}
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
