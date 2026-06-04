"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function CandidateCollectorPanel() {
  const router = useRouter();
  const [keywords, setKeywords] = useState("차량 정리함\n여름 주방용품\n생활 선물");
  const [limit, setLimit] = useState(3);
  const [state, setState] = useState<{ status: "idle" | "loading" | "success" | "error"; message: string }>({
    status: "idle",
    message: ""
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "loading", message: "Collecting candidates." });
    const response = await fetch("/api/candidates/collect-coupang", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "dry_run",
        keywords: keywords.split(/\r?\n/).map((keyword) => keyword.trim()).filter(Boolean),
        limit_per_keyword: limit
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      setState({ status: "error", message: typeof payload.message === "string" ? payload.message : "Collector failed." });
      return;
    }
    setState({
      status: "success",
      message: `Created ${payload.created_count} candidates. Queue created: ${String(payload.queue_created).toUpperCase()}, worker jobs created: ${String(payload.worker_jobs_created).toUpperCase()}.`
    });
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <h2 className="text-base font-bold text-slate-950">Coupang Collector MVP</h2>
        <p className="mt-1 text-sm text-slate-600">
          Dry-run collection creates product candidates only. It does not create queue items, worker jobs, render plans,
          upload packages, or platform uploads.
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-[1fr_160px]">
        <label className="text-sm font-semibold text-slate-700">
          Keywords
          <textarea
            value={keywords}
            onChange={(event) => setKeywords(event.target.value)}
            rows={3}
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-teal-600"
          />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Limit per keyword
          <input
            type="number"
            min={1}
            max={10}
            value={limit}
            onChange={(event) => setLimit(Number(event.target.value))}
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-teal-600"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={state.status === "loading"}
          className="rounded-md bg-teal-700 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Run dry-run collector
        </button>
        {state.message ? (
          <span className={state.status === "error" ? "text-sm font-semibold text-red-700" : "text-sm font-semibold text-slate-600"}>
            {state.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}
