import { AlertTriangle, CalendarClock, CheckCircle2, PauseCircle } from "lucide-react";
import type { AutomationRun, AutomationSettings, ProductQueueItem } from "@/types/automation";
import type { QueueSummary } from "@/lib/repositories/types";
import type { N8nConfigStatus } from "@/lib/server/env";
import { formatDateTime } from "@/lib/format";
import { getDailyCapacity, getDailyCapacityWarning, getNextRunAt } from "@/lib/scheduler";
import { getRecentErrors } from "@/lib/status";
import { GuardNotice } from "@/components/GuardNotice";
import { QueueTable } from "@/components/QueueTable";
import { RunActionPanel } from "@/components/RunActionPanel";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";

export function DashboardView({
  settings,
  items,
  summary,
  runs,
  diagnostics
}: {
  settings: AutomationSettings;
  items: ProductQueueItem[];
  summary: QueueSummary;
  runs: AutomationRun[];
  diagnostics: N8nConfigStatus;
}) {
  const nextRunAt = getNextRunAt(settings);
  const capacityWarning = getDailyCapacityWarning(settings);
  const recentErrors = getRecentErrors(items, 5);
  const recentItems = items.slice(0, 10);
  const lastRun = runs[0];
  const recentWebhookRuns = runs
    .filter((run) => ["nightly_scout", "next_batch", "manual_batch", "retry_item"].includes(run.run_type))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-normal text-slate-950">
              Commerce Automation Control Center
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              쿠팡 상품 큐, 콘텐츠 생성, n8n 실행 로그, 수동 업로드 준비 상태를 한 화면에서 확인하는
              운영 관제실입니다.
            </p>
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-3 lg:min-w-[420px]">
            <InfoPill label="현재 모드" value={settings.run_mode} />
            <InfoPill label="자동화 상태" value={settings.is_paused ? "일시정지" : "실행 가능"} />
            <InfoPill label="마지막 실행" value={lastRun ? formatDateTime(lastRun.started_at) : "-"} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="오늘 큐" value={summary.total} helper="기본 목표 69개" icon={<CalendarClock size={20} />} />
        <StatCard label="처리 예정" value={summary.scheduled} tone="info" />
        <StatCard label="처리 중" value={summary.processing} tone="info" />
        <StatCard label="video_ready" value={summary.video_ready} tone="success" />
        <StatCard label="blog_draft_created" value={summary.blog_draft_created} tone="success" />
        <StatCard label="ready_for_manual_upload" value={summary.ready_for_manual_upload} tone="success" />
        <StatCard label="manual_review" value={summary.manual_review} tone="warning" />
        <StatCard label="error" value={summary.error} tone={summary.error > 0 ? "danger" : "default"} />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <StatCard
          label="다음 실행"
          value={settings.is_paused ? "일시정지" : formatDateTime(nextRunAt)}
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
          label="YouTube 안전"
          value={settings.youtube_upload_enabled ? "활성" : "비활성"}
          helper={`공개 업로드 제한 ${settings.max_daily_uploads}개, 승인 필요 ${
            settings.approval_required ? "YES" : "NO"
          }`}
          tone={settings.youtube_upload_enabled ? "warning" : "default"}
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

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-slate-950">최근 실행 결과</h2>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {recentWebhookRuns.length === 0 ? (
            <p className="text-sm text-slate-500">최근 webhook 실행 결과가 없습니다.</p>
          ) : (
            recentWebhookRuns.map((run) => (
              <div key={run.id} className="rounded-lg bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-slate-950">{run.run_type}</span>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${
                      run.status === "success"
                        ? "bg-emerald-100 text-emerald-700"
                        : run.status === "running"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-red-100 text-red-700"
                    }`}
                  >
                    {run.status}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500">request_id: {run.request_id ?? "-"}</p>
                <p className="mt-2 text-sm text-slate-700">{run.safe_message}</p>
                <p className="mt-2 text-xs text-slate-500">
                  processed {run.processed_count} / errors {run.error_count}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {formatDateTime(run.started_at)} - {formatDateTime(run.finished_at)}
                </p>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-slate-950">최근 오류</h2>
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
                  <p className="mt-2 text-sm text-red-700">{item.error_message}</p>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-slate-950">운영 안내</h2>
          <div className="mt-4 space-y-2 text-sm text-slate-600">
            <p>현재 자동 업로드는 비활성화되어 있습니다.</p>
            <p>영상과 블로그 초안은 자동 생성되며, 유튜브 공개 업로드는 승인 후 진행됩니다.</p>
            <p>Webhook URL, API Key, Secret, OAuth Secret은 클라이언트로 전달하지 않습니다.</p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-slate-950">최근 생성 상품 10개</h2>
        <QueueTable items={recentItems} />
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
