"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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
  missing_asset_types: string[];
  qa_status: "pending" | "passed" | "needs_fix" | "rejected";
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

export function ArtifactQaClient({
  artifacts,
  summary
}: {
  artifacts: ArtifactSummary[];
  summary: ArtifactSummaryCounts;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(artifacts[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const selected = useMemo(
    () => artifacts.find((artifact) => artifact.id === selectedId) ?? artifacts[0] ?? null,
    [artifacts, selectedId]
  );

  async function updateQaStatus(status: ArtifactSummary["qa_status"]) {
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
    router.refresh();
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
      <section className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <QaMetric label="Pending" value={summary.pending} />
          <QaMetric label="Passed" value={summary.passed} />
          <QaMetric label="Needs fix" value={summary.needs_fix} />
          <QaMetric label="Rejected" value={summary.rejected} />
          <QaMetric label="Missing video" value={summary.missing_video} />
          <QaMetric label="Missing thumbnail" value={summary.missing_thumbnail} />
          <QaMetric label="Missing subtitle" value={summary.missing_subtitle} />
          <QaMetric label="Missing package" value={summary.missing_upload_package} />
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-[980px] w-full border-collapse text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Assets</th>
                <th className="px-4 py-3">QA</th>
                <th className="px-4 py-3">Queue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {artifacts.map((artifact) => (
                <tr key={artifact.id} className={artifact.id === selected?.id ? "bg-teal-50" : "bg-white"}>
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

function QaBadge({ status }: { status: ArtifactSummary["qa_status"] }) {
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
