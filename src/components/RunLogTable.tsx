import type { AutomationRun } from "@/types/automation";
import { formatDateTime, formatDuration } from "@/lib/format";
import { EmptyState } from "@/components/EmptyState";

export function RunLogTable({ runs }: { runs: AutomationRun[] }) {
  if (runs.length === 0) {
    return <EmptyState title="실행 로그가 없습니다" message="수동 실행이나 개발용 액션을 실행하면 여기에 기록됩니다." />;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="min-w-[900px] w-full border-collapse text-left text-sm">
        <thead className="bg-slate-100 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3">유형</th>
            <th className="px-4 py-3">Channel</th>
            <th className="px-4 py-3">상태</th>
            <th className="px-4 py-3">처리</th>
            <th className="px-4 py-3">오류</th>
            <th className="px-4 py-3">시작</th>
            <th className="px-4 py-3">소요 시간</th>
            <th className="px-4 py-3">안전 메시지</th>
            <th className="px-4 py-3">로그</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {runs.map((run) => (
            <tr key={run.id} className={run.status === "failed" ? "bg-red-50" : "bg-white"}>
              <td className="px-4 py-4 font-semibold text-slate-900">{run.run_type}</td>
              <td className="px-4 py-4 text-slate-700">{run.channelKey ?? "-"}</td>
              <td className="px-4 py-4">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${run.status === "success" ? "bg-emerald-100 text-emerald-700" : run.status === "running" ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"}`}>
                  {run.status === "success" ? "성공" : run.status === "running" ? "실행 중" : "실패"}
                </span>
              </td>
              <td className="px-4 py-4">{run.processed_count}</td>
              <td className="px-4 py-4">{run.error_count}</td>
              <td className="px-4 py-4">{formatDateTime(run.started_at)}</td>
              <td className="px-4 py-4">{formatDuration(run.started_at, run.finished_at)}</td>
              <td className="max-w-[240px] px-4 py-4 text-slate-700">{run.safe_message}</td>
              <td className="max-w-[320px] px-4 py-4 text-xs text-slate-500">{run.log}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
