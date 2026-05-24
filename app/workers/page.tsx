import { formatDateTime } from "@/lib/format";
import { getWorkerJobTypeLabel } from "@/lib/statusLabels";
import { summarizeWorkerHeartbeats } from "@/lib/workerAnalytics";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { StatCard } from "@/components/StatCard";

export const dynamic = "force-dynamic";

export default async function WorkersPage() {
  const repository = getAutomationRepository();
  const [workers, jobs] = await Promise.all([repository.getWorkerHeartbeats(), repository.getWorkerJobs()]);
  const summary = summarizeWorkerHeartbeats(workers, jobs);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">워커 상태</h1>
        <p className="mt-2 text-sm text-slate-500">Python Worker의 heartbeat, 현재 작업, 처리 실적을 확인합니다.</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="등록된 워커" value={summary.total} />
        <StatCard label="온라인 워커" value={summary.onlineCount} tone={summary.onlineCount > 0 ? "success" : "default"} />
        <StatCard label="오프라인/신호 지연" value={summary.offlineCount} tone={summary.offlineCount > 0 ? "warning" : "default"} />
        <StatCard label="마지막 워커 신호" value={summary.lastHeartbeatAt ? formatDateTime(summary.lastHeartbeatAt) : "-"} />
      </section>

      {summary.staleWorkers.length > 0 ? (
        <section className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm font-semibold text-yellow-800">
          heartbeat가 오래된 워커가 있습니다: {summary.staleWorkers.map((worker) => worker.worker_id).join(", ")}
        </section>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-[900px] w-full border-collapse text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">워커 ID</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3">마지막 heartbeat</th>
              <th className="px-4 py-3">현재 작업</th>
              <th className="px-4 py-3">처리 작업</th>
              <th className="px-4 py-3">실패 작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {workers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  아직 수신된 워커 신호가 없습니다. Python Worker를 실행하면 이곳에 표시됩니다.
                </td>
              </tr>
            ) : (
              workers.map((worker) => {
                const workerStats = summary.byWorker[worker.worker_id] ?? { totalJobs: 0, failedJobs: 0 };
                return (
                  <tr key={worker.worker_id}>
                    <td className="px-4 py-4 font-semibold text-slate-950">{worker.worker_id}</td>
                    <td className="px-4 py-4">
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                        {worker.status === "online" ? "온라인" : "오프라인"}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-600">{worker.last_heartbeat_at ? formatDateTime(worker.last_heartbeat_at) : "-"}</td>
                    <td className="px-4 py-4 text-slate-600">
                      {worker.current_job_id
                        ? `${getWorkerJobTypeLabel(worker.current_job_type || "video_render")} / ${worker.current_job_id}`
                        : "-"}
                    </td>
                    <td className="px-4 py-4 text-slate-600">{workerStats.totalJobs}</td>
                    <td className="px-4 py-4 text-slate-600">{workerStats.failedJobs}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
