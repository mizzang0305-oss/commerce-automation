"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState
} from "@tanstack/react-table";
import type { ProductQueueItem, QueueStatus, WorkerJob } from "@/types/automation";
import { formatDateTime } from "@/lib/format";
import { getQueueStatusLabel, getWorkerJobStatusLabel, getWorkerJobTypeLabel } from "@/lib/statusLabels";
import { StatusBadge } from "@/components/StatusBadge";
import { QueueActionButtons } from "@/components/QueueActionButtons";
import { EmptyState } from "@/components/EmptyState";

type QueueRow = ProductQueueItem & {
  workerJob?: WorkerJob;
};

const queueStatuses: Array<QueueStatus | "all"> = [
  "all",
  "scheduled",
  "processing",
  "video_ready",
  "manual_review",
  "error",
  "hold",
  "skipped"
];

export function QueueTable({ items, workerJobs = [] }: { items: ProductQueueItem[]; workerJobs?: WorkerJob[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<QueueStatus | "all">("all");
  const [issueFilter, setIssueFilter] = useState<"all" | "missing_affiliate" | "missing_video" | "manual_review">("all");
  const [sorting, setSorting] = useState<SortingState>([{ id: "queue_rank", desc: false }]);
  const workerJobByQueueId = useMemo(
    () => new Map(workerJobs.map((job) => [job.product_queue_id, job])),
    [workerJobs]
  );
  const rows = useMemo(
    () =>
      items
        .map((item) => ({ ...item, workerJob: workerJobByQueueId.get(item.id) }))
        .filter((item) => status === "all" || item.queue_status === status)
        .filter((item) => {
          if (issueFilter === "missing_affiliate") {
            return !item.selected_affiliate_url;
          }
          if (issueFilter === "missing_video") {
            return item.queue_status === "video_ready" && !item.video_url;
          }
          if (issueFilter === "manual_review") {
            return item.queue_status === "manual_review";
          }
          return true;
        })
        .filter((item) => {
          const query = search.trim().toLowerCase();
          if (!query) {
            return true;
          }
          return [
            item.id,
            item.keyword,
            item.theme,
            item.product_name,
            item.category_path,
            item.error_message,
            item.workerJob?.status ?? "",
            item.workerJob?.job_type ?? ""
          ].some((value) => value.toLowerCase().includes(query));
        }),
    [items, issueFilter, search, status, workerJobByQueueId]
  );

  const columns = useMemo<ColumnDef<QueueRow>[]>(
    () => [
      {
        accessorKey: "queue_rank",
        header: "순위",
        cell: ({ row }) => <span className="font-semibold text-slate-700">{row.original.queue_rank}</span>
      },
      {
        accessorKey: "scheduled_at",
        header: "예약 시간",
        cell: ({ row }) => <span className="text-slate-600">{formatDateTime(row.original.scheduled_at)}</span>
      },
      {
        accessorKey: "keyword",
        header: "키워드",
        cell: ({ row }) => (
          <div>
            <div className="font-semibold text-slate-900">{row.original.keyword}</div>
            <div className="text-xs text-slate-500">{row.original.theme}</div>
          </div>
        )
      },
      {
        accessorKey: "product_name",
        header: "상품",
        cell: ({ row }) => (
          <div>
            <Link href={`/queue/${row.original.id}`} className="font-semibold text-slate-950 hover:text-teal-700">
              {row.original.product_name}
            </Link>
            <div className="mt-1 text-xs text-slate-500">{row.original.category_path}</div>
          </div>
        )
      },
      {
        accessorKey: "product_score",
        header: "점수",
        cell: ({ row }) => <span className="font-bold text-slate-900">{row.original.product_score}</span>
      },
      {
        accessorKey: "queue_status",
        header: "상태",
        cell: ({ row }) => <StatusBadge status={row.original.queue_status} />
      },
      {
        id: "worker",
        header: "워커 작업",
        cell: ({ row }) =>
          row.original.workerJob ? (
            <Link href="/jobs" className="font-semibold text-teal-700">
              {getWorkerJobTypeLabel(row.original.workerJob.job_type)} / {getWorkerJobStatusLabel(row.original.workerJob.status)}
            </Link>
          ) : (
            <span className="text-slate-400">-</span>
          )
      },
      {
        accessorKey: "error_message",
        header: "오류",
        cell: ({ row }) => <span className="line-clamp-2 text-xs text-red-700">{row.original.error_message || "-"}</span>
      },
      {
        id: "actions",
        header: "작업",
        enableSorting: false,
        cell: ({ row }) => <QueueActionButtons item={row.original} compact />
      }
    ],
    []
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } }
  });

  if (items.length === 0) {
    return <EmptyState title="큐가 비어 있습니다" message="필터를 변경하거나 개발 seed를 생성하세요." />;
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm lg:grid-cols-[1fr_180px_220px]">
        <label className="text-sm font-semibold text-slate-700">
          검색
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="상품명, 키워드, 오류 검색"
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-teal-600"
          />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          상태
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as QueueStatus | "all")}
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-teal-600"
          >
            {queueStatuses.map((item) => (
              <option key={item} value={item}>
                {item === "all" ? "전체" : getQueueStatusLabel(item)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700">
          이슈
          <select
            value={issueFilter}
            onChange={(event) => setIssueFilter(event.target.value as typeof issueFilter)}
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-teal-600"
          >
            <option value="all">전체</option>
            <option value="missing_affiliate">제휴 링크 누락</option>
            <option value="manual_review">수동 검토</option>
            <option value="missing_video">video_url 누락</option>
          </select>
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-[1180px] w-full border-collapse text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase text-slate-500">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="px-4 py-3">
                    {header.column.getCanSort() ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="font-semibold text-slate-600 hover:text-slate-950"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === "asc" ? " ↑" : header.column.getIsSorted() === "desc" ? " ↓" : ""}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-slate-100">
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-slate-500">
                  현재 필터에 해당하는 상품이 없습니다.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className={getRowTone(row.original.queue_status)}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-4">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <TablePagination
        pageIndex={table.getState().pagination.pageIndex}
        pageCount={table.getPageCount()}
        canPrevious={table.getCanPreviousPage()}
        canNext={table.getCanNextPage()}
        onPrevious={() => table.previousPage()}
        onNext={() => table.nextPage()}
      />
    </div>
  );
}

function getRowTone(status: QueueStatus) {
  if (status === "error") {
    return "bg-red-50";
  }
  if (status === "manual_review") {
    return "bg-orange-50";
  }
  if (status === "ready_for_manual_upload") {
    return "bg-teal-50";
  }
  return "bg-white";
}

function TablePagination({
  pageIndex,
  pageCount,
  canPrevious,
  canNext,
  onPrevious,
  onNext
}: {
  pageIndex: number;
  pageCount: number;
  canPrevious: boolean;
  canNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
      <span>
        페이지 {pageIndex + 1} / {Math.max(1, pageCount)}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onPrevious}
          disabled={!canPrevious}
          className="rounded-md border border-slate-200 px-3 py-1.5 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
        >
          이전
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canNext}
          className="rounded-md border border-slate-200 px-3 py-1.5 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
        >
          다음
        </button>
      </div>
    </div>
  );
}
