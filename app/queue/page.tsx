import { QueueFilters } from "@/components/QueueFilters";
import { QueueTable } from "@/components/QueueTable";
import { StatCard } from "@/components/StatCard";
import { summarizeQueueItems } from "@/lib/queueAnalytics";
import { getQueueStatusLabel } from "@/lib/statusLabels";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import type { ChannelAutomationKey, QueueStatus } from "@/types/automation";

export const dynamic = "force-dynamic";

export default async function QueuePage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const date = scalar(params.date);
  const channelKey = scalar(params.channelKey);
  const status = scalar(params.status);
  const uploadStatus = scalar(params.upload_status);
  const keyword = scalar(params.keyword);
  const theme = scalar(params.theme);
  const priority = scalar(params.priority);
  const repository = getAutomationRepository();
  const [items, workerJobs] = await Promise.all([
    repository.getQueue({
      date: date || undefined,
      channelKey: (channelKey as ChannelAutomationKey | "all" | undefined) || undefined,
      status: (status as QueueStatus | "all" | undefined) || undefined,
      upload_status: uploadStatus || undefined,
      keyword: keyword || undefined,
      theme: theme || undefined,
      priority: priority === "issues-first" ? "issues-first" : undefined
    }),
    repository.getWorkerJobs()
  ]);
  const contents = new Map(
    await Promise.all(
      items.map(async (item) => [item.id, await repository.getGeneratedContentByQueueItem(item.id)] as const)
    )
  );
  const analytics = summarizeQueueItems(items, contents);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">상품 제작 큐</h1>
        <p className="mt-2 text-sm text-slate-500">예약, 처리, 검수, 오류 상태를 필터링하고 worker job 연결 상태를 확인합니다.</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="전체 상품" value={analytics.total} />
        <StatCard label="예약됨" value={analytics.byStatus.scheduled} tone="info" />
        <StatCard label="처리 중" value={analytics.byStatus.processing} tone="info" />
        <StatCard label="영상 준비 완료" value={analytics.videoReadyCount} tone="success" />
        <StatCard label="수동 검토" value={analytics.manualReviewCount} tone={analytics.manualReviewCount > 0 ? "warning" : "default"} />
        <StatCard label="제휴 링크 누락" value={analytics.missingAffiliateUrlCount} tone={analytics.missingAffiliateUrlCount > 0 ? "warning" : "default"} />
        <StatCard label="고지 문구 누락" value={analytics.missingDisclosureTextCount} tone={analytics.missingDisclosureTextCount > 0 ? "warning" : "default"} />
        <StatCard label="video_url 누락 경고" value={analytics.videoReadyWithoutVideoUrlCount} tone={analytics.videoReadyWithoutVideoUrlCount > 0 ? "danger" : "default"} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-bold text-slate-950">상태별 개수</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(analytics.byStatus).map(([key, value]) => (
              <span key={key} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {getQueueStatusLabel(key as QueueStatus)} {value}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-bold text-slate-950">수동 검토 사유</h2>
          <div className="mt-3 space-y-2">
            {analytics.manualReviewReasons.length === 0 ? (
              <p className="text-sm text-slate-500">수동 검토 사유가 없습니다.</p>
            ) : (
              analytics.manualReviewReasons.map((entry) => (
                <p key={entry.reason} className="rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-800">
                  {entry.reason} <span className="font-bold">({entry.count})</span>
                </p>
              ))
            )}
          </div>
        </div>
      </section>

      <QueueFilters defaults={{ date, channelKey, status, upload_status: uploadStatus, keyword, theme, priority }} />
      <QueueTable items={items} workerJobs={workerJobs} />
    </div>
  );
}

function scalar(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
