"use client";

import { useEffect, useMemo, useState } from "react";

type ArtifactQaStatus = "pending" | "passed" | "needs_fix" | "rejected";

type ArtifactSummary = {
  id: string;
  product_queue_id: string;
  product_name: string;
  video_url: string;
  thumbnail_url: string;
  subtitle_url: string;
  upload_package_url: string;
  video_exists: boolean;
  thumbnail_exists: boolean;
  subtitle_exists: boolean;
  upload_package_exists: boolean;
  asset_types: string[];
  missing_asset_types: string[];
  qa_status: ArtifactQaStatus;
  qa_note: string;
  created_at: string;
};

type ArtifactSummaryCounts = {
  total: number;
  pending: number;
  passed: number;
  needs_fix: number;
  rejected: number;
  missing_video: number;
  missing_thumbnail: number;
  missing_subtitle: number;
  missing_upload_package: number;
};

type ArtifactFilters = {
  qa_status: string;
  asset_type: string;
  missing: string;
  search: string;
  sort: string;
};

export function ArtifactQaClient({
  artifacts,
  summary
}: {
  artifacts: ArtifactSummary[];
  summary: ArtifactSummaryCounts;
}) {
  const [visibleArtifacts, setVisibleArtifacts] = useState(artifacts);
  const [visibleSummary, setVisibleSummary] = useState(summary);
  const [selectedId, setSelectedId] = useState(artifacts[0]?.id ?? "");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [bulkNote, setBulkNote] = useState("");
  const [bulkStatus, setBulkStatus] = useState<ArtifactQaStatus>("passed");
  const [message, setMessage] = useState("");
  const [filters, setFilters] = useState<ArtifactFilters>({
    qa_status: "all",
    asset_type: "all",
    missing: "all",
    search: "",
    sort: "newest"
  });
  const selected = useMemo(
    () => visibleArtifacts.find((artifact) => artifact.id === selectedId) ?? visibleArtifacts[0] ?? null,
    [visibleArtifacts, selectedId]
  );

  useEffect(() => {
    const controller = new AbortController();
    reloadArtifacts(controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  async function reloadArtifacts(signal?: AbortSignal) {
    try {
      const params = new URLSearchParams(filters);
      const response = await fetch(`/api/artifacts?${params.toString()}`, { signal });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        setMessage(typeof payload.message === "string" ? payload.message : "Artifact 목록을 불러오지 못했습니다.");
        return;
      }
      const nextArtifacts = payload.artifacts ?? [];
      setVisibleArtifacts(nextArtifacts);
      setVisibleSummary(payload.summary ?? summary);
      setSelectedIds((current) => current.filter((id) => nextArtifacts.some((artifact: ArtifactSummary) => artifact.id === id)));
      if (!nextArtifacts.some((artifact: ArtifactSummary) => artifact.id === selectedId)) {
        setSelectedId(nextArtifacts[0]?.id ?? "");
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        setMessage("Artifact 목록을 불러오지 못했습니다.");
      }
    }
  }

  async function updateQaStatus(status: ArtifactQaStatus) {
    if (!selected) {
      return;
    }
    const response = await fetch(`/api/artifacts/${selected.id}/qa`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qa_status: status, qa_note: note })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      setMessage(typeof payload.message === "string" ? payload.message : "QA update failed.");
      return;
    }
    setMessage(`QA status updated to ${status}. Upload triggered: ${String(payload.upload_triggered).toUpperCase()}.`);
    await reloadArtifacts();
  }

  async function updateBulkQaStatus() {
    if (selectedIds.length === 0) {
      setMessage("선택된 artifact가 없습니다.");
      return;
    }
    const response = await fetch("/api/artifacts/bulk-qa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artifact_ids: selectedIds, qa_status: bulkStatus, qa_note: bulkNote })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      setMessage(typeof payload.message === "string" ? payload.message : "Bulk QA update failed.");
      return;
    }
    setMessage(
      `Bulk QA updated ${payload.updated_count}/${payload.requested_count}. Upload triggered: ${String(payload.upload_triggered).toUpperCase()}.`
    );
    setSelectedIds([]);
    await reloadArtifacts();
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function toggleAllVisible() {
    setSelectedIds((current) =>
      current.length === visibleArtifacts.length ? [] : visibleArtifacts.map((artifact) => artifact.id)
    );
  }

  function updateFilter(key: keyof ArtifactFilters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
      <section className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <QaMetric label="Pending" value={visibleSummary.pending} />
          <QaMetric label="Passed" value={visibleSummary.passed} />
          <QaMetric label="Needs fix" value={visibleSummary.needs_fix} />
          <QaMetric label="Rejected" value={visibleSummary.rejected} />
          <QaMetric label="Missing video" value={visibleSummary.missing_video} />
          <QaMetric label="Missing thumbnail" value={visibleSummary.missing_thumbnail} />
          <QaMetric label="Missing subtitle" value={visibleSummary.missing_subtitle} />
          <QaMetric label="Missing package" value={visibleSummary.missing_upload_package} />
        </div>

        <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_auto_auto_auto_auto]">
          <input
            value={filters.search}
            onChange={(event) => updateFilter("search", event.target.value)}
            placeholder="상품명, queue id, URL 검색"
            className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-600"
          />
          <FilterSelect label="QA" value={filters.qa_status} onChange={(value) => updateFilter("qa_status", value)} options={["all", "pending", "passed", "needs_fix", "rejected"]} />
          <FilterSelect label="Asset" value={filters.asset_type} onChange={(value) => updateFilter("asset_type", value)} options={["all", "video", "thumbnail", "subtitle", "upload_package"]} />
          <FilterSelect
            label="Missing"
            value={filters.missing}
            onChange={(value) => updateFilter("missing", value)}
            options={["all", "none", "missing_video", "missing_thumbnail", "missing_subtitle", "missing_upload_package", "has_warnings"]}
          />
          <FilterSelect label="Sort" value={filters.sort} onChange={(value) => updateFilter("sort", value)} options={["newest", "oldest", "qa_status", "asset_type"]} />
        </div>

        <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[auto_auto_1fr_auto]">
          <select
            value={bulkStatus}
            onChange={(event) => setBulkStatus(event.target.value as ArtifactQaStatus)}
            className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800"
          >
            <option value="passed">passed</option>
            <option value="needs_fix">needs_fix</option>
            <option value="rejected">rejected</option>
            <option value="pending">pending</option>
          </select>
          <span className="self-center text-sm font-semibold text-slate-600">{selectedIds.length} selected</span>
          <input
            value={bulkNote}
            onChange={(event) => setBulkNote(event.target.value)}
            placeholder="Bulk QA note"
            className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-600"
          />
          <button
            type="button"
            onClick={updateBulkQaStatus}
            className="rounded-md bg-slate-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800"
          >
            Apply bulk QA
          </button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-[1040px] w-full border-collapse text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">
                  <button type="button" onClick={toggleAllVisible} className="font-bold text-slate-600">
                    Select
                  </button>
                </th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Assets</th>
                <th className="px-4 py-3">QA</th>
                <th className="px-4 py-3">Queue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleArtifacts.map((artifact) => (
                <tr key={artifact.id} className={artifact.id === selected?.id ? "bg-teal-50" : "bg-white"}>
                  <td className="px-4 py-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(artifact.id)}
                      onChange={() => toggleSelected(artifact.id)}
                      aria-label={`Select ${artifact.product_name || artifact.product_queue_id}`}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                  </td>
                  <td className="px-4 py-4">
                    <button
                      type="button"
                      onClick={() => setSelectedId(artifact.id)}
                      className="text-left font-semibold text-slate-950 hover:text-teal-700"
                    >
                      {artifact.product_name || artifact.product_queue_id}
                    </button>
                  </td>
                  <td className="px-4 py-4 text-slate-600">
                    video {yesNo(artifact.video_exists)} / thumbnail {yesNo(artifact.thumbnail_exists)} / subtitle{" "}
                    {yesNo(artifact.subtitle_exists)} / package {yesNo(artifact.upload_package_exists)}
                  </td>
                  <td className="px-4 py-4">
                    <QaBadge status={artifact.qa_status} />
                  </td>
                  <td className="px-4 py-4 text-xs text-slate-500">{artifact.product_queue_id}</td>
                </tr>
              ))}
              {visibleArtifacts.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-sm text-slate-500" colSpan={5}>
                    No artifacts match the current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <aside className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Artifact Detail</h2>
          <p className="mt-1 text-sm text-slate-600">QA status is for manual upload readiness only. It never uploads.</p>
        </div>
        {selected ? (
          <>
            <dl className="space-y-2 text-sm">
              <DetailLink label="Video" value={selected.video_url} />
              <DetailLink label="Thumbnail" value={selected.thumbnail_url} />
              <DetailLink label="Subtitle" value={selected.subtitle_url} />
              <DetailLink label="Upload package" value={selected.upload_package_url} />
            </dl>
            <label className="block text-sm font-semibold text-slate-700">
              QA note
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={4}
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-teal-600"
              />
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <QaButton label="Pass" onClick={() => updateQaStatus("passed")} />
              <QaButton label="Needs fix" onClick={() => updateQaStatus("needs_fix")} />
              <QaButton label="Reject" onClick={() => updateQaStatus("rejected")} />
              <QaButton label="Reset pending" onClick={() => updateQaStatus("pending")} />
            </div>
            {message ? <p className="text-sm font-semibold text-slate-700">{message}</p> : null}
          </>
        ) : (
          <p className="text-sm text-slate-500">No artifacts found.</p>
        )}
      </aside>
    </div>
  );
}

function QaMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <span className="block text-xs font-semibold text-slate-500">{label}</span>
      <span className="text-xl font-bold text-slate-950">{value}</span>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs font-bold uppercase text-slate-500">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 block rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold normal-case text-slate-800"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function QaBadge({ status }: { status: ArtifactQaStatus }) {
  const classes = {
    pending: "bg-slate-50 text-slate-700 ring-slate-200",
    passed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    needs_fix: "bg-amber-50 text-amber-700 ring-amber-200",
    rejected: "bg-red-50 text-red-700 ring-red-200"
  };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${classes[status]}`}>{status}</span>;
}

function DetailLink({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase text-slate-400">{label}</dt>
      <dd className="mt-1 break-all text-slate-700">
        {value ? (
          <a href={value} target="_blank" rel="noreferrer" className="text-teal-700 underline">
            {value}
          </a>
        ) : (
          "Missing"
        )}
      </dd>
    </div>
  );
}

function QaButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
    >
      {label}
    </button>
  );
}

function yesNo(value: boolean) {
  return value ? "YES" : "NO";
}
