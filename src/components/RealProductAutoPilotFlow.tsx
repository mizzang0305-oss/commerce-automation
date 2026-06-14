"use client";

import { useState } from "react";

type AutoPilotState = {
  status: "idle" | "loading" | "ready" | "blocked";
  summary: string;
  details?: {
    ok?: boolean;
    error_code?: string | null;
    message?: string;
    blocked_reasons?: string[];
    next_auto_action?: string | null;
    selected_product?: {
      candidate_id?: string;
      product_name?: string;
      queue_id?: string | null;
      affiliate_url_present?: boolean;
      thumbnail_url_present?: boolean;
      score?: number;
    } | null;
    prepared_video_asset_summary?: {
      asset_id?: string;
      provider?: string;
      server_accessible?: boolean;
      mime_type?: string;
      size_bytes?: number | null;
      url_host?: string | null;
      signed_url_present?: boolean;
      prepared_video_asset_url_present?: boolean;
      storage_key_present?: boolean;
    } | null;
    package_prepare?: {
      ready?: boolean;
      package_id?: string | null;
      visibility?: string;
      domain_ready?: boolean;
      prepared_video_asset_ref_used?: boolean;
      blocked_reasons?: string[];
    } | null;
    side_effects?: Record<string, unknown>;
  };
};

export function RealProductAutoPilotFlow() {
  const [state, setState] = useState<AutoPilotState>({
    status: "idle",
    summary: "Real product auto pilot has not run yet.",
  });

  async function runAutoPilot(mode: "dry_run" | "prepare_only") {
    setState({
      status: "loading",
      summary: mode === "prepare_only"
        ? "Preparing a private product package without upload execution."
        : "Finding a real product candidate and domain-ready video asset.",
    });
    try {
      const response = await fetch("/api/uploads/youtube/real-product-pilot/auto-prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ mode, visibility: "private" }),
      });
      const body = await response.json() as AutoPilotState["details"];
      setState({
        status: response.ok && body?.ok ? "ready" : "blocked",
        summary: body?.message ?? "Real product auto pilot returned a safe response.",
        details: body,
      });
    } catch {
      setState({
        status: "blocked",
        summary: "Real product auto pilot failed with a safe client error.",
      });
    }
  }

  return (
    <section className="rounded-lg border border-indigo-200 bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">real product auto pilot</p>
          <h2 className="mt-1 text-lg font-bold text-slate-950">Auto-select real product and prepare private package</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            This flow reads candidates, queue items, and product assets, then selects a non-smoke real Coupang product
            with a server-accessible video/mp4 asset. It prepares metadata only. It does not execute YouTube upload,
            create jobs, write DB rows, upload to R2, or expose token material.
          </p>
        </div>
        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-800">
          prepare-only
        </span>
      </div>

      <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <p className="font-bold">Safety boundary</p>
        <p className="mt-1">
          Local paths, smoke/test candidates, garbled product names, public visibility, and missing affiliate URLs are
          blocked. Execute remains a separate manually approved YouTube step.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => runAutoPilot("dry_run")}
          disabled={state.status === "loading"}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 disabled:bg-slate-100 disabled:text-slate-400"
        >
          Find real product automatically
        </button>
        <button
          type="button"
          onClick={() => runAutoPilot("prepare_only")}
          disabled={state.status === "loading"}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 disabled:bg-slate-100 disabled:text-slate-400"
        >
          Prepare real product private package
        </button>
        <button
          type="button"
          disabled
          className="rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-sm font-bold text-slate-400"
        >
          Execute disabled here
        </button>
      </div>

      <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">result</p>
          <span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-slate-700">{state.status}</span>
        </div>
        <p className="mt-2 text-sm font-semibold text-slate-800">{state.summary}</p>
        {state.details ? (
          <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2">
            <InfoRow label="ok" value={String(state.details.ok ?? false)} />
            <InfoRow label="error_code" value={state.details.error_code ?? "none"} />
            <InfoRow label="blocked_reasons" value={(state.details.blocked_reasons ?? []).join(", ") || "none"} />
            <InfoRow label="next_auto_action" value={state.details.next_auto_action ?? "none"} />
            <InfoRow label="candidate_id" value={state.details.selected_product?.candidate_id ?? "not selected"} />
            <InfoRow label="product_name" value={state.details.selected_product?.product_name ?? "not selected"} />
            <InfoRow label="queue_id" value={state.details.selected_product?.queue_id ?? "not linked"} />
            <InfoRow label="affiliate_url_present" value={String(state.details.selected_product?.affiliate_url_present ?? false)} />
            <InfoRow label="asset_id" value={state.details.prepared_video_asset_summary?.asset_id ?? "not ready"} />
            <InfoRow label="asset_provider" value={state.details.prepared_video_asset_summary?.provider ?? "not ready"} />
            <InfoRow label="asset_url_host" value={state.details.prepared_video_asset_summary?.url_host ?? "hidden"} />
            <InfoRow label="server_accessible" value={String(state.details.prepared_video_asset_summary?.server_accessible ?? false)} />
            <InfoRow label="mime_type" value={state.details.prepared_video_asset_summary?.mime_type ?? "not ready"} />
            <InfoRow label="size_bytes" value={String(state.details.prepared_video_asset_summary?.size_bytes ?? "not ready")} />
            <InfoRow label="package_ready" value={String(state.details.package_prepare?.ready ?? false)} />
            <InfoRow label="package_id" value={state.details.package_prepare?.package_id ?? "not created"} />
            <InfoRow label="visibility" value={state.details.package_prepare?.visibility ?? "private"} />
            <InfoRow label="youtube_execute_called" value={String(state.details.side_effects?.youtube_execute_called ?? false)} />
            <InfoRow label="youtube_upload_executed" value={String(state.details.side_effects?.youtube_upload_executed ?? false)} />
            <InfoRow label="db_written" value={String(state.details.side_effects?.db_written ?? false)} />
            <InfoRow label="r2_uploaded" value={String(state.details.side_effects?.r2_uploaded ?? false)} />
            <InfoRow label="worker_job_created" value={String(state.details.side_effects?.worker_job_created ?? false)} />
          </dl>
        ) : null}
      </div>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2">
      <dt className="font-medium text-slate-600">{label}</dt>
      <dd className="break-all text-right font-bold text-slate-950">{value}</dd>
    </div>
  );
}
