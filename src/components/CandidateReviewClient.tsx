"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState
} from "@tanstack/react-table";
import type { ProductCandidate } from "@/types/automation";
import type { CandidateReadiness } from "@/lib/candidatePromotion";
import { formatDateTime } from "@/lib/format";

type CandidateRow = ProductCandidate & {
  readiness: CandidateReadiness;
};

type CandidateReviewClientProps = {
  candidates: ProductCandidate[];
  readiness: Record<string, CandidateReadiness>;
};

export function CandidateReviewClient({ candidates, readiness }: CandidateReviewClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [affiliateFilter, setAffiliateFilter] = useState<"all" | "yes" | "no">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | CandidateReadiness["status"]>("all");
  const [sorting, setSorting] = useState<SortingState>([{ id: "created_at", desc: true }]);
  const rows = useMemo<CandidateRow[]>(
    () =>
      candidates
        .map((candidate) => ({
          ...candidate,
          readiness: readiness[candidate.id] ?? {
            can_promote: false,
            status: "missing_affiliate",
            label: "확인 필요",
            reasons: ["검수 상태를 계산하지 못했습니다."],
            duplicate_queue_id: "",
            duplicate_source: ""
          }
        }))
        .filter((candidate) => {
          const query = search.trim().toLowerCase();
          if (!query) {
            return true;
          }
          return [
            candidate.product_name,
            candidate.raw_coupang_url,
            candidate.selected_affiliate_url,
            getPayloadString(candidate, "source"),
            getPayloadString(candidate, "category_path")
          ].some((value) => value.toLowerCase().includes(query));
        })
        .filter((candidate) => {
          if (affiliateFilter === "all") {
            return true;
          }
          const hasAffiliate = Boolean(candidate.selected_affiliate_url.trim());
          return affiliateFilter === "yes" ? hasAffiliate : !hasAffiliate;
        })
        .filter((candidate) => statusFilter === "all" || candidate.readiness.status === statusFilter),
    [affiliateFilter, candidates, readiness, search, statusFilter]
  );
  const [selectedId, setSelectedId] = useState(candidates[0]?.id ?? "");
  const selected = rows.find((candidate) => candidate.id === selectedId) ?? rows[0] ?? null;
  const [promoteState, setPromoteState] = useState<{ status: "idle" | "loading" | "success" | "error"; message: string }>({
    status: "idle",
    message: ""
  });
  const columns = useMemo<ColumnDef<CandidateRow>[]>(
    () => [
      {
        accessorKey: "product_name",
        header: "후보 상품",
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => setSelectedId(row.original.id)}
            className="text-left font-semibold text-slate-950 hover:text-teal-700"
          >
            {row.original.product_name || "상품명 없음"}
            <span className="mt-1 block text-xs font-normal text-slate-500">{row.original.id}</span>
          </button>
        )
      },
      {
        id: "source",
        header: "소스",
        cell: ({ row }) => (
          <span>
            {getPayloadString(row.original, "source") || "-"}
            <span className="mt-1 block text-xs text-slate-500">{getPayloadString(row.original, "category_path") || "-"}</span>
          </span>
        )
      },
      {
        accessorKey: "selected_affiliate_url",
        header: "제휴 링크",
        cell: ({ row }) =>
          row.original.selected_affiliate_url ? (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
              있음
            </span>
          ) : (
            <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200">
              없음
            </span>
          )
      },
      {
        id: "readiness",
        header: "검수 상태",
        cell: ({ row }) => <ReadinessBadge readiness={row.original.readiness} />
      },
      {
        accessorKey: "created_at",
        header: "수집 시각",
        cell: ({ row }) => <span className="text-xs text-slate-500">{formatDateTime(row.original.created_at)}</span>
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

  async function promoteSelectedCandidate() {
    if (!selected) {
      return;
    }
    setPromoteState({ status: "loading", message: "승격 중입니다." });
    const response = await fetch(`/api/candidates/${selected.id}/promote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      setPromoteState({
        status: "error",
        message: typeof payload.message === "string" ? payload.message : "후보 승격에 실패했습니다."
      });
      return;
    }
    setPromoteState({
      status: "success",
      message: "후보를 상품 큐로 승격했습니다. worker job은 다음 배치 실행 시 생성됩니다."
    });
    router.refresh();
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.8fr)]">
      <section className="space-y-3">
        <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm lg:grid-cols-[1fr_180px_180px]">
          <label className="text-sm font-semibold text-slate-700">
            검색
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="상품명, URL, 소스 검색"
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-teal-600"
            />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            제휴 링크
            <select
              value={affiliateFilter}
              onChange={(event) => setAffiliateFilter(event.target.value as typeof affiliateFilter)}
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-teal-600"
            >
              <option value="all">전체</option>
              <option value="yes">있음</option>
              <option value="no">없음</option>
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700">
            검수 상태
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-teal-600"
            >
              <option value="all">전체</option>
              <option value="ready">승격 가능</option>
              <option value="missing_affiliate">링크 누락</option>
              <option value="missing_name">상품명 누락</option>
              <option value="duplicate">중복 의심</option>
            </select>
          </label>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-[920px] w-full border-collapse text-left text-sm">
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
                        {header.column.getIsSorted() === "asc" ? " ▲" : header.column.getIsSorted() === "desc" ? " ▼" : ""}
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
                    조건에 맞는 후보가 없습니다.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className={row.original.id === selected?.id ? "bg-teal-50" : "bg-white"}
                  >
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
      </section>

      <CandidateDetailPanel
        candidate={selected}
        promoteState={promoteState}
        onPromote={promoteSelectedCandidate}
      />
    </div>
  );
}

function CandidateDetailPanel({
  candidate,
  promoteState,
  onPromote
}: {
  candidate: CandidateRow | null;
  promoteState: { status: "idle" | "loading" | "success" | "error"; message: string };
  onPromote: () => void;
}) {
  if (!candidate) {
    return (
      <aside className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
        선택된 후보가 없습니다.
      </aside>
    );
  }

  const payloadSummary = sanitizePayload(candidate.payload);
  return (
    <aside className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-950">{candidate.product_name || "상품명 없음"}</h2>
          <ReadinessBadge readiness={candidate.readiness} />
        </div>
        <p className="mt-1 break-all text-xs text-slate-500">{candidate.id}</p>
      </div>

      <dl className="space-y-3 text-sm">
        <DetailRow label="원본 URL" value={candidate.raw_coupang_url || "-"} />
        <DetailRow label="제휴 링크" value={candidate.selected_affiliate_url || "없음"} />
        <DetailRow label="소스" value={getPayloadString(candidate, "source") || "-"} />
        <DetailRow label="카테고리" value={getPayloadString(candidate, "category_path") || "-"} />
        <DetailRow label="수집 시각" value={formatDateTime(candidate.created_at)} />
      </dl>

      <div className="rounded-lg bg-slate-50 p-3">
        <h3 className="text-sm font-bold text-slate-800">승격 체크</h3>
        <ul className="mt-2 space-y-1 text-sm text-slate-600">
          {candidate.readiness.reasons.map((reason) => (
            <li key={reason}>- {reason}</li>
          ))}
          <li>- 고지 문구와 영상 대본이 없으면 영상 생성 전 수동 검토가 필요합니다.</li>
          <li>- 승격 후 바로 영상 생성되지 않습니다. worker job은 다음 배치에서 생성됩니다.</li>
        </ul>
      </div>

      <div>
        <h3 className="text-sm font-bold text-slate-800">payload 요약</h3>
        <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
          {JSON.stringify(payloadSummary, null, 2)}
        </pre>
      </div>

      <button
        type="button"
        onClick={onPromote}
        disabled={!candidate.readiness.can_promote || promoteState.status === "loading"}
        className="w-full rounded-md bg-teal-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {promoteState.status === "loading" ? "승격 중" : "상품 큐로 승격"}
      </button>
      {promoteState.message ? (
        <p className={`text-sm font-semibold ${promoteState.status === "error" ? "text-red-700" : "text-teal-700"}`}>
          {promoteState.message}
        </p>
      ) : null}
    </aside>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase text-slate-400">{label}</dt>
      <dd className="mt-1 break-all text-slate-700">{value}</dd>
    </div>
  );
}

function ReadinessBadge({ readiness }: { readiness: CandidateReadiness }) {
  const className =
    readiness.status === "ready"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : readiness.status === "duplicate"
        ? "bg-amber-50 text-amber-700 ring-amber-200"
        : "bg-red-50 text-red-700 ring-red-200";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${className}`}>
      {readiness.label}
    </span>
  );
}

function getPayloadString(candidate: ProductCandidate, key: string) {
  const value = candidate.payload[key];
  return typeof value === "string" ? value.trim() : "";
}

function sanitizePayload(payload: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(payload)
      .filter(([key]) => !/(secret|token|key|authorization|password)/i.test(key))
      .slice(0, 20)
  );
}
