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
import type { WorkerJob, WorkerJobStatus, WorkerJobType } from "@/types/automation";
import { getWorkerJobStatusLabel, getWorkerJobTypeLabel } from "@/lib/statusLabels";

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

const jobTypes: Array<WorkerJobType | "all"> = ["all", "video_render", "sheet_sync"];

export function JobsTable({ jobs }: { jobs: WorkerJob[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<WorkerJobStatus | "all">("all");
  const [jobType, setJobType] = useState<WorkerJobType | "all">("all");
  const [issueFilter, setIssueFilter] = useState<"all" | "ffmpeg" | "missing_video" | "retry_wait">("all");
  const [sorting, setSorting] = useState<SortingState>([{ id: "created_at", desc: true }]);
  const rows = useMemo(
    () =>
      jobs
        .filter((job) => status === "all" || job.status === status)
        .filter((job) => jobType === "all" || job.job_type === jobType)
        .filter((job) => {
          if (issueFilter === "ffmpeg") {
            return job.error_message.toLowerCase().includes("ffmpeg");
          }
          if (issueFilter === "missing_video") {
            return job.job_type === "video_render" && job.status === "completed" && !String(job.result.video_url ?? "").trim();
          }
          if (issueFilter === "retry_wait") {
            return job.status === "retry_wait";
          }
          return true;
        })
        .filter((job) => {
          const query = search.trim().toLowerCase();
          if (!query) {
            return true;
          }
          return [
            job.id,
            job.job_type,
            job.status,
            job.product_queue_id,
            job.claimed_by,
            job.error_message
          ].some((value) => value.toLowerCase().includes(query));
        }),
    [jobType, issueFilter, jobs, search, status]
  );
  const columns = useMemo<ColumnDef<WorkerJob>[]>(
    () => [
      {
        accessorKey: "id",
        header: "작업 ID",
        cell: ({ row }) => <span className="font-semibold text-slate-950">{row.original.id}</span>
      },
      {
        accessorKey: "job_type",
        header: "작업 유형",
        cell: ({ row }) => <span>{getWorkerJobTypeLabel(row.original.job_type)}({row.original.job_type})</span>
      },
      {
        accessorKey: "status",
        header: "상태",
        cell: ({ row }) => <JobStatusBadge status={row.original.status} />
      },
      {
        accessorKey: "product_queue_id",
        header: "상품 큐",
        cell: ({ row }) =>
          row.original.product_queue_id ? (
            <Link href={`/queue/${row.original.product_queue_id}`} className="font-semibold text-teal-700">
              {row.original.product_queue_id}
            </Link>
          ) : (
            <span className="text-slate-400">-</span>
          )
      },
      {
        accessorKey: "claimed_by",
        header: "워커",
        cell: ({ row }) => <span>{row.original.claimed_by || "-"}</span>
      },
      {
        accessorKey: "retry_count",
        header: "재시도",
        cell: ({ row }) => (
          <span>
            {row.original.retry_count}/{row.original.max_retries}
          </span>
        )
      },
      {
        accessorKey: "created_at",
        header: "생성 시각",
        cell: ({ row }) => <span className="text-xs text-slate-500">{row.original.created_at || "-"}</span>
      },
      {
        accessorKey: "error_message",
        header: "오류",
        cell: ({ row }) => <span className="line-clamp-2 text-xs text-red-700">{row.original.error_message || "-"}</span>
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

  return (
    <div className="space-y-3">
      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm lg:grid-cols-[1fr_170px_170px_200px]">
        <label className="text-sm font-semibold text-slate-700">
          검색
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="작업 ID, 큐 ID, 오류 검색"
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-teal-600"
          />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          상태
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as WorkerJobStatus | "all")}
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-teal-600"
          >
            {statuses.map((item) => (
              <option key={item} value={item}>
                {item === "all" ? "전체" : getWorkerJobStatusLabel(item)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700">
          유형
          <select
            value={jobType}
            onChange={(event) => setJobType(event.target.value as WorkerJobType | "all")}
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-teal-600"
          >
            {jobTypes.map((item) => (
              <option key={item} value={item}>
                {item === "all" ? "전체" : getWorkerJobTypeLabel(item)}
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
            <option value="retry_wait">재시도 대기</option>
            <option value="ffmpeg">ffmpeg 오류</option>
            <option value="missing_video">video_url 없는 완료</option>
          </select>
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-[1100px] w-full border-collapse text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase text-slate-500">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="px-4 py-3">
                    <button
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                      className="font-semibold text-slate-600 hover:text-slate-950"
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === "asc" ? " ↑" : header.column.getIsSorted() === "desc" ? " ↓" : ""}
                    </button>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-slate-100">
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-slate-500">
                  현재 필터에 해당하는 워커 작업이 없습니다.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-4 text-slate-600">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
        <span>
          페이지 {table.getState().pagination.pageIndex + 1} / {Math.max(1, table.getPageCount())}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="rounded-md border border-slate-200 px-3 py-1.5 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            이전
          </button>
          <button
            type="button"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="rounded-md border border-slate-200 px-3 py-1.5 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            다음
          </button>
        </div>
      </div>
    </div>
  );
}

function JobStatusBadge({ status }: { status: WorkerJobStatus }) {
  const className =
    status === "completed"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : status === "failed" || status === "cancelled"
        ? "bg-red-50 text-red-700 ring-red-200"
        : status === "retry_wait"
          ? "bg-amber-50 text-amber-700 ring-amber-200"
          : "bg-slate-50 text-slate-700 ring-slate-200";

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${className}`}>
      {getWorkerJobStatusLabel(status)}
    </span>
  );
}
