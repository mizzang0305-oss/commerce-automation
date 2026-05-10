import { QueueFilters } from "@/components/QueueFilters";
import { QueueTable } from "@/components/QueueTable";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import type { QueueStatus } from "@/types/automation";

export const dynamic = "force-dynamic";

export default async function QueuePage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const date = scalar(params.date);
  const status = scalar(params.status);
  const uploadStatus = scalar(params.upload_status);
  const keyword = scalar(params.keyword);
  const theme = scalar(params.theme);
  const priority = scalar(params.priority);
  const items = await getAutomationRepository().getQueue({
    date: date || undefined,
    status: (status as QueueStatus | "all" | undefined) || undefined,
    upload_status: uploadStatus || undefined,
    keyword: keyword || undefined,
    theme: theme || undefined,
    priority: priority === "issues-first" ? "issues-first" : undefined
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">상품 큐</h1>
        <p className="mt-2 text-sm text-slate-500">예약, 처리, 검수, 오류 상태를 필터링하고 상품별 액션을 실행합니다.</p>
      </div>
      <QueueFilters defaults={{ date, status, upload_status: uploadStatus, keyword, theme, priority }} />
      <QueueTable items={items} />
    </div>
  );
}

function scalar(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
