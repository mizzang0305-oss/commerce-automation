import Link from "next/link";
import { summarizeWorkerJobs, getStaleWorkerJobs } from "@/lib/workerAnalytics";
import { getWorkerJobStatusLabel, getWorkerJobTypeLabel } from "@/lib/statusLabels";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { countKstDailyVideoRenderJobs } from "@/lib/workerDailyLimit";
import type { WorkerJobStatus, WorkerJobType } from "@/types/automation";
import { StatCard } from "@/components/StatCard";
import { WorkerJobStatusChart } from "@/components/charts/WorkerJobStatusChart";
import { WorkerJobTypeChart } from "@/components/charts/WorkerJobTypeChart";
import { JobsTable } from "@/components/JobsTable";

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
  const repository = getAutomationRepository();
  const [jobs, allJobs, settings] = await Promise.all([
    repository.getWorkerJobs({ status: status || "all" }),
    repository.getWorkerJobs(),
    repository.getSettings()
  ]);
  const summary = summarizeWorkerJobs(allJobs);
  const staleJobs = getStaleWorkerJobs(allJobs);
  const todayVideoJobs = countKstDailyVideoRenderJobs(allJobs);
  const remainingVideos = Math.max(0, settings.max_daily_videos - todayVideoJobs);
  const workerStatusChartData = statuses
    .filter((item): item is WorkerJobStatus => item !== "all")
    .map((item) => ({ label: getWorkerJobStatusLabel(item), value: summary.byStatus[item] }));
  const workerTypeChartData = (Object.entries(summary.byType) as Array<[WorkerJobType, number]>)
    .map(([type, value]) => ({ label: getWorkerJobTypeLabel(type), value }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">워커 작업</h1>
        <p className="mt-2 text-sm text-slate-500">할당, 렌더 결과, 재시도, 실패 사유를 확인합니다.</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="전체 작업" value={summary.total} />
        <StatCard label="대기" value={summary.byStatus.pending} tone="info" />
        <StatCard label="처리 중" value={summary.byStatus.processing + summary.byStatus.claimed} tone="info" />
        <StatCard label="완료" value={summary.byStatus.completed} tone="success" />
        <StatCard label="실패" value={summary.byStatus.failed} tone={summary.byStatus.failed > 0 ? "danger" : "default"} />
        <StatCard label="재시도 대기" value={summary.byStatus.retry_wait} tone={summary.byStatus.retry_wait > 0 ? "warning" : "default"} />
        <StatCard label="ffmpeg 오류" value={summary.ffmpegFailureCount} tone={summary.ffmpegFailureCount > 0 ? "warning" : "default"} helper="PATH 또는 설치 문제일 수 있습니다." />
        <StatCard label="오래 처리 중" value={staleJobs.length} tone={staleJobs.length > 0 ? "warning" : "default"} />
        <StatCard label="오늘 생성된 영상 작업" value={todayVideoJobs} helper="KST 운영일 기준 video_render 작업 수" />
        <StatCard label="오늘 남은 생성 가능 수" value={remainingVideos} tone={remainingVideos === 0 ? "warning" : "success"} helper={`max_daily_videos=${settings.max_daily_videos}`} />
      </section>

      {summary.completedVideoRenderMissingVideoUrl.length > 0 ? (
        <section className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          video_render 완료 작업 중 video_url이 없는 항목이 있습니다. 이 상태는 fake success 가능성이 있으므로 즉시 확인하세요.
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-bold text-slate-950">상태별 작업 수 차트</h2>
          <p className="mt-1 text-sm text-slate-500">대기, 처리 중, 재시도 대기, 실패를 빠르게 비교합니다.</p>
          <WorkerJobStatusChart data={workerStatusChartData} />
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-bold text-slate-950">작업 유형 분포</h2>
          <p className="mt-1 text-sm text-slate-500">영상 생성과 시트 동기화 작업 비중을 확인합니다.</p>
          <WorkerJobTypeChart data={workerTypeChartData} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-bold text-slate-950">상태별 요약</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {statuses.filter((item) => item !== "all").map((item) => (
              <span key={item} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {getWorkerJobStatusLabel(item)} {summary.byStatus[item]}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-bold text-slate-950">최근 실패 사유 TOP 5</h2>
          <div className="mt-3 space-y-2">
            {summary.topFailureReasons.length === 0 ? (
              <p className="text-sm text-slate-500">최근 실패 사유가 없습니다.</p>
            ) : (
              summary.topFailureReasons.map((entry) => (
                <p key={entry.reason} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {entry.reason} <span className="font-bold">({entry.count})</span>
                </p>
              ))
            )}
          </div>
        </div>
      </section>

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
            {item === "all" ? "전체" : `${getWorkerJobStatusLabel(item)}(${item})`}
          </Link>
        ))}
      </div>

      <JobsTable jobs={jobs} />
    </div>
  );
}

function scalar(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
