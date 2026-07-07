import type { QueueStatus } from "@/types/automation";
import { queueStatusLabels } from "@/lib/statusLabels";

const channels = ["all", "father_jobs", "neoman_moleulgeol", "lets_buy"] as const;

const statuses: Array<QueueStatus | "all"> = [
  "all",
  "scheduled",
  "processing",
  "content_ready",
  "video_render_started",
  "video_ready",
  "blog_draft_created",
  "ready_for_manual_upload",
  "manual_review",
  "error",
  "skipped",
  "hold"
];

export function QueueFilters({
  defaults
}: {
  defaults: {
    date?: string;
    channelKey?: string;
    status?: string;
    upload_status?: string;
    keyword?: string;
    theme?: string;
    priority?: string;
  };
}) {
  return (
    <form action="/queue" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 md:grid-cols-7">
        <label className="block">
          <span className="text-xs font-semibold text-slate-500">Channel</span>
          <select name="channelKey" defaultValue={defaults.channelKey ?? "all"} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {channels.map((channel) => (
              <option key={channel} value={channel}>
                {channel}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-500">날짜</span>
          <input name="date" type="date" defaultValue={defaults.date} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-500">상태</span>
          <select name="status" defaultValue={defaults.status ?? "all"} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status === "all" ? "전체" : queueStatusLabels[status]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-500">업로드 상태</span>
          <input name="upload_status" defaultValue={defaults.upload_status} placeholder="ready_to_upload" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-500">키워드</span>
          <input name="keyword" defaultValue={defaults.keyword} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-500">테마</span>
          <input name="theme" defaultValue={defaults.theme} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-500">정렬</span>
          <select name="priority" defaultValue={defaults.priority ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">기본 순위</option>
            <option value="issues-first">오류/수동 검토 우선</option>
          </select>
        </label>
      </div>
      <div className="mt-3 flex justify-end">
        <button className="focus-ring rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">필터 적용</button>
      </div>
    </form>
  );
}
