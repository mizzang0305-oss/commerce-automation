"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

const BULK_NOTE_TEMPLATES = [
  "Video, thumbnail, subtitle, and upload package checked.",
  "Subtitle timing needs operator review.",
  "Thumbnail missing or needs review.",
  "Upload package missing or needs review.",
  "Product image quality needs review.",
  "Copy or disclosure text needs review.",
  "Playback length needs review."
];

const REVIEW_QUEUES: Array<{ label: string; filters: Partial<ArtifactFilters> }> = [
  { label: "Pending Review", filters: { qa_status: "pending", missing: "all" } },
  { label: "Needs Fix", filters: { qa_status: "needs_fix", missing: "all" } },
  { label: "Missing Assets", filters: { qa_status: "all", missing: "has_warnings" } },
  { label: "Has Warnings", filters: { qa_status: "all", missing: "has_warnings" } },
  { label: "Passed", filters: { qa_status: "passed", missing: "all" } },
  { label: "Rejected", filters: { qa_status: "rejected", missing: "all" } }
];

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
  const searchRef = useRef<HTMLInputElement>(null);
  const searchFocusedRef = useRef(false);
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

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (document.activeElement === searchRef.current && !searchFocusedRef.current) {
        // JSDOM can leave activeElement on a blurred input; use the explicit focus flag as the source of truth.
      } else if (isTypingTarget(document.activeElement)) {
        return;
      }
      if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setSelectedIds([]);
        searchRef.current?.blur();
        return;
      }
      if (event.key === "j") {
        event.preventDefault();
        moveSelected(1);
        return;
      }
      if (event.key === "k") {
        event.preventDefault();
        moveSelected(-1);
        return;
      }
      if (event.key === "x" && selected) {
        event.preventDefault();
        toggleSelected(selected.id);
        return;
      }
      const shortcutStatus: Record<string, ArtifactQaStatus> = {
        p: "passed",
        f: "needs_fix",
        r: "rejected",
        u: "pending"
      };
      const nextStatus = shortcutStatus[event.key];
      if (nextStatus) {
        event.preventDefault();
        void updateQaStatus(nextStatus);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  async function reloadArtifacts(signal?: AbortSignal) {
    try {
      const params = new URLSearchParams(filters);
      const response = await fetch(`/api/artifacts?${params.toString()}`, { signal });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        setMessage(typeof payload.message === "string" ? payload.message : "Artifact list could not be loaded.");
        return;
      }
      const nextArtifacts = (payload.artifacts ?? []) as ArtifactSummary[];
      setVisibleArtifacts(nextArtifacts);
      setVisibleSummary(payload.summary ?? summary);
      setSelectedIds((current) => current.filter((id) => nextArtifacts.some((artifact) => artifact.id === id)));
      if (!nextArtifacts.some((artifact) => artifact.id === selectedId)) {
        setSelectedId(nextArtifacts[0]?.id ?? "");
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        setMessage("Artifact list could not be loaded.");
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
    setMessage("QA status only changed. No platform upload was executed.");
    moveSelected(1);
    setSelectedIds([]);
    await reloadArtifacts();
  }

  async function updateBulkQaStatus() {
    if (selectedIds.length === 0) {
      setMessage("No artifacts selected.");
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
    setMessage("QA status only changed. No platform upload was executed.");
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

  function applyReviewQueue(nextFilters: Partial<ArtifactFilters>) {
    setFilters((current) => ({ ...current, ...nextFilters }));
  }

  function moveSelected(direction: 1 | -1) {
    if (visibleArtifacts.length === 0) {
      return;
    }
    const currentIndex = Math.max(0, visibleArtifacts.findIndex((artifact) => artifact.id === selected?.id));
    const nextIndex = Math.min(visibleArtifacts.length - 1, Math.max(0, currentIndex + direction));
    setSelectedId(visibleArtifacts[nextIndex]?.id ?? "");
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

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-sm font-bold text-slate-700">Review queues</span>
            {REVIEW_QUEUES.map((queue) => (
              <button
                key={queue.label}
                type="button"
                onClick={() => applyReviewQueue(queue.filters)}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                {queue.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs font-semibold text-slate-500">
            Shortcuts: j/k move, x select, p pass, f needs_fix, r reject, u pending, / search, Esc clear. QA actions never upload.
          </p>
        </div>

        <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_auto_auto_auto_auto]">
          <input
            ref={searchRef}
            value={filters.search}
            onChange={(event) => updateFilter("search", event.target.value)}
            onFocus={() => {
              searchFocusedRef.current = true;
            }}
            onBlur={() => {
              searchFocusedRef.current = false;
            }}
            placeholder="Search product, queue id, or URL"
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

        <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[auto_auto_minmax(180px,240px)_1fr_auto]">
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
          <label className="text-xs font-bold uppercase text-slate-500">
            Bulk note template
            <select
              value=""
              onChange={(event) => setBulkNote(event.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold normal-case text-slate-800"
            >
              <option value="">Select template</option>
              {BULK_NOTE_TEMPLATES.map((template) => (
                <option key={template} value={template}>
                  {template}
                </option>
              ))}
            </select>
          </label>
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

function isTypingTarget(element: Element | null) {
  if (!element) {
    return false;
  }
  if (element instanceof HTMLElement && !element.matches(":focus")) {
    return false;
  }
  const tagName = element.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || element.getAttribute("contenteditable") === "true";
}
