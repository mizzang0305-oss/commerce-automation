import { AlertTriangle, CalendarClock, CheckCircle2, PauseCircle } from "lucide-react";
import type {
  AutomationRun,
  AutomationSettings,
  GeneratedContent,
  ProductQueueItem,
  QueueStatus,
  WorkerHeartbeat,
  WorkerJob,
  WorkerJobStatus
} from "@/types/automation";
import type { QueueSummary } from "@/lib/repositories/types";
import type { N8nConfigStatus } from "@/lib/server/env";
import { summarizeQueueItems } from "@/lib/queueAnalytics";
import { getQueueStatusLabel, getWorkerJobStatusLabel } from "@/lib/statusLabels";
import { countKstDailyVideoRenderJobs } from "@/lib/workerDailyLimit";
import { summarizeWorkerHeartbeats, summarizeWorkerJobs } from "@/lib/workerAnalytics";
import { formatDateTime } from "@/lib/format";
import { getDailyCapacity, getDailyCapacityWarning, getNextRunAt } from "@/lib/scheduler";
import { getRecentErrors } from "@/lib/status";
import { GuardNotice } from "@/components/GuardNotice";
import { QueueTable } from "@/components/QueueTable";
import { RunActionPanel } from "@/components/RunActionPanel";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { QueueStatusChart } from "@/components/charts/QueueStatusChart";
import { WorkerJobStatusChart } from "@/components/charts/WorkerJobStatusChart";

export function DashboardView({
  settings,
  items,
  summary,
  runs,
  workerJobs = [],
  workerHeartbeats = [],
  contents = new Map(),
  diagnostics
}: {
  settings: AutomationSettings;
  items: ProductQueueItem[];
  summary: QueueSummary;
  runs: AutomationRun[];
  workerJobs?: WorkerJob[];
  workerHeartbeats?: WorkerHeartbeat[];
  contents?: Map<string, GeneratedContent | null>;
  diagnostics: N8nConfigStatus;
}) {
  const nextRunAt = getNextRunAt(settings);
  const capacityWarning = getDailyCapacityWarning(settings);
  const recentErrors = getRecentErrors(items, 5);
  const recentItems = items.slice(0, 10);
  const lastRun = runs[0];
  const recentRuns = runs
    .filter((run) => ["nightly_scout", "next_batch", "manual_batch", "retry_item"].includes(run.run_type))
    .slice(0, 5);
  const workerSummary = summarizeWorkerJobs(workerJobs);
  const heartbeatSummary = summarizeWorkerHeartbeats(workerHeartbeats, workerJobs);
  const queueAnalytics = summarizeQueueItems(items, contents);
  const todayVideoJobs = countKstDailyVideoRenderJobs(workerJobs);
  const remainingVideos = Math.max(0, settings.max_daily_videos - todayVideoJobs);
  const workerStatusChartData = (Object.entries(workerSummary.byStatus) as Array<[WorkerJobStatus, number]>)
    .map(([status, value]) => ({ label: getWorkerJobStatusLabel(status), value }));
  const queueStatusChartData = (Object.entries(queueAnalytics.byStatus) as Array<[QueueStatus, number]>)
    .filter(([, value]) => value > 0)
    .map(([status, value]) => ({ label: getQueueStatusLabel(status), value }));

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-normal text-slate-950">자동화 관제실</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              상품 제작 큐, 워커 작업, 실행 로그, 생성 파일, 수동 검토 상태를 한 화면에서 확인합니다.
              다음 배치는 n8n webhook이 아니라 web-managed worker_jobs를 생성합니다.
            </p>
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-3 lg:min-w-[420px]">
            <InfoPill label="현재 모드" value={settings.run_mode === "generate_only" ? "생성 전용(generate_only)" : settings.run_mode} />
            <InfoPill label="자동화 상태" value={settings.is_paused ? "일시 정지" : "실행 가능"} />
            <InfoPill label="마지막 실행" value={lastRun ? formatDateTime(lastRun.started_at) : "-"} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="오늘 생성된 영상 작업" value={todayVideoJobs} helper="KST 운영일 기준 video_render 작업 수" />
        <StatCard label="오늘 남은 생성 가능 수" value={remainingVideos} tone={remainingVideos === 0 ? "warning" : "success"} />
        <StatCard label="대기 작업" value={workerSummary.byStatus.pending} tone="info" />
        <StatCard label="처리 중 작업" value={workerSummary.byStatus.processing + workerSummary.byStatus.claimed} tone="info" />
        <StatCard label="완료 작업" value={workerSummary.byStatus.completed} tone="success" />
        <StatCard label="실패 작업" value={workerSummary.byStatus.failed} tone={workerSummary.byStatus.failed > 0 ? "danger" : "default"} />
        <StatCard label="재시도 대기" value={workerSummary.byStatus.retry_wait} tone={workerSummary.byStatus.retry_wait > 0 ? "warning" : "default"} />
        <StatCard label="ffmpeg 오류" value={workerSummary.ffmpegFailureCount} tone={workerSummary.ffmpegFailureCount > 0 ? "warning" : "default"} />
        <StatCard label="수동 검토 필요" value={queueAnalytics.manualReviewCount} tone={queueAnalytics.manualReviewCount > 0 ? "warning" : "default"} />
        <StatCard label="영상 준비 완료" value={summary.video_ready} tone="success" />
        <StatCard label="제휴 링크 누락" value={queueAnalytics.missingAffiliateUrlCount} tone={queueAnalytics.missingAffiliateUrlCount > 0 ? "warning" : "default"} />
        <StatCard label="고지 문구 누락" value={queueAnalytics.missingDisclosureTextCount} tone={queueAnalytics.missingDisclosureTextCount > 0 ? "warning" : "default"} />
        <StatCard label="영상 URL 누락 경고" value={queueAnalytics.videoReadyWithoutVideoUrlCount} tone={queueAnalytics.videoReadyWithoutVideoUrlCount > 0 ? "danger" : "default"} helper="영상 URL 없이 video_ready가 되면 안 됩니다." />
        <StatCard label="온라인 워커" value={heartbeatSummary.onlineCount} tone={heartbeatSummary.onlineCount > 0 ? "success" : "default"} />
        <StatCard label="오프라인 워커" value={heartbeatSummary.offlineCount} tone={heartbeatSummary.offlineCount > 0 ? "warning" : "default"} />
        <StatCard label="마지막 워커 신호" value={heartbeatSummary.lastHeartbeatAt ? formatDateTime(heartbeatSummary.lastHeartbeatAt) : "-"} />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <StatCard
          label="다음 실행"
          value={settings.is_paused ? "일시 정지" : formatDateTime(nextRunAt)}
          helper={`${settings.interval_hours}시간마다 ${settings.batch_size}개 처리`}
          icon={settings.is_paused ? <PauseCircle size={20} /> : <CalendarClock size={20} />}
        />
        <StatCard
          label="하루 생성 목표"
          value={`${settings.daily_target_count}개`}
          helper={`하루 처리 가능량 ${getDailyCapacity(settings)}개`}
          tone={capacityWarning ? "warning" : "default"}
        />
        <StatCard
          label="공개 업로드 안전"
          value={settings.youtube_upload_enabled ? "위험: 활성화" : "비활성화"}
          helper={`run_mode=${settings.run_mode}, public upload 구현 없음`}
          tone={settings.youtube_upload_enabled ? "danger" : "default"}
          icon={settings.youtube_upload_enabled ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
        />
      </section>

      {capacityWarning ? (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm font-semibold text-yellow-800">
          {capacityWarning}
        </div>
      ) : null}

      <GuardNotice settings={settings} item={items[0]} />
      <RunActionPanel settings={settings} diagnostics={diagnostics} />

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-slate-950">워커 작업 상태 차트</h2>
          <p className="mt-1 text-sm text-slate-500">대기, 처리 중, 재시도, 실패 흐름을 한눈에 봅니다.</p>
          <WorkerJobStatusChart data={workerStatusChartData} />
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-slate-950">상품 큐 상태 분포</h2>
          <p className="mt-1 text-sm text-slate-500">수동 검토와 영상 준비 완료 비율을 확인합니다.</p>
          <QueueStatusChart data={queueStatusChartData} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-slate-950">최근 실행 로그</h2>
          <div className="mt-4 space-y-3">
            {recentRuns.length === 0 ? (
              <p className="text-sm text-slate-500">최근 실행 결과가 없습니다.</p>
            ) : (
              recentRuns.map((run) => (
                <div key={run.id} className="rounded-lg bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-950">{run.run_type}</span>
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${run.status === "success" ? "bg-emerald-100 text-emerald-700" : run.status === "running" ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"}`}>
                      {run.status === "success" ? "성공" : run.status === "running" ? "실행 중" : "실패"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{run.safe_message}</p>
                  <p className="mt-2 text-xs text-slate-500">처리 {run.processed_count} / 오류 {run.error_count}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatDateTime(run.started_at)}</p>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-slate-950">최근 오류와 수동 검토</h2>
          <div className="mt-4 space-y-3">
            {recentErrors.length === 0 ? (
              <p className="text-sm text-slate-500">최근 오류가 없습니다.</p>
            ) : (
              recentErrors.map((item) => (
                <div key={item.id} className="rounded-lg bg-red-50 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={item.queue_status} />
                    <span className="text-sm font-semibold text-slate-900">{item.product_name}</span>
                  </div>
                  <p className="mt-2 text-sm text-red-700">{item.error_message || getQueueStatusLabel(item.queue_status)}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-slate-950">운영 안전 메모</h2>
        <div className="mt-4 space-y-2 text-sm text-slate-600">
          <p>영상 URL 없이 완료된 작업은 없어야 합니다.</p>
          <p>ffmpeg 오류는 로컬 PC에 ffmpeg가 설치되지 않았거나 PATH에 없는 경우 발생합니다.</p>
          <p>public upload와 YouTube/TikTok/Threads 자동 업로드는 구현되어 있지 않습니다.</p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-slate-950">최근 상품 제작 큐 10개</h2>
        <QueueTable items={recentItems} workerJobs={workerJobs} />
      </section>
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-100 px-3 py-2">
      <span className="block text-xs text-slate-500">{label}</span>
      <span className="font-bold text-slate-900">{value}</span>
    </div>
  );
}
