"use client";

import { useState } from "react";
import {
  APPROVE_SINGLE_SERVER_ACCESSIBLE_VIDEO_ASSET_REGISTRATION,
  RUN_REAL_PRODUCT_VIDEO_ASSET_GENERATION
} from "@/lib/uploads/youtube/oneProductVideoAssetEntryPoint";

type VideoAssetState = {
  status: "idle" | "loading" | "ready" | "blocked";
  summary: string;
  details?: {
    ok?: boolean;
    error_code?: string | null;
    message?: string;
    blocked_reasons?: string[];
    next_action?: string | null;
    candidate?: {
      candidate_id?: string;
      product_name?: string;
      affiliate_url_present?: boolean;
      image_ready?: boolean;
      smoke_or_test_candidate?: boolean;
    } | null;
    generated_video_asset?: {
      local_video_path_present?: boolean;
      local_only?: boolean;
      domain_ready?: boolean;
      mime_type?: string;
      size_bytes?: number;
    } | null;
    prepared_video_asset_summary?: {
      asset_id?: string;
      provider?: string;
      server_accessible?: boolean;
      mime_type?: string;
      size_bytes?: number | null;
      signed_url_present?: boolean;
      prepared_video_asset_url_present?: boolean;
      storage_key_present?: boolean;
    } | null;
    registration_plan?: {
      product_candidate_id?: string;
      product_assets_rows_planned?: number;
      write_executed?: boolean;
    } | null;
    side_effects?: Record<string, unknown>;
  };
};

const defaultCandidateId = "candidate-490aa6d25e8ea89d";

export function RealProductVideoAssetEntryPointPanel() {
  const [candidateId, setCandidateId] = useState(defaultCandidateId);
  const [state, setState] = useState<VideoAssetState>({
    status: "idle",
    summary: "No one-product video asset check has run yet."
  });

  async function run(mode: "dry_run" | "generate_local_only" | "register_server_asset") {
    setState({
      status: "loading",
      summary: "Checking one-product video asset readiness without upload execution."
    });
    const approval = mode === "generate_local_only"
      ? RUN_REAL_PRODUCT_VIDEO_ASSET_GENERATION
      : mode === "register_server_asset"
        ? APPROVE_SINGLE_SERVER_ACCESSIBLE_VIDEO_ASSET_REGISTRATION
        : "";
    try {
      const response = await fetch("/api/uploads/youtube/real-product-pilot/video-asset/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          mode,
          candidate_id: candidateId,
          approval,
          prepared_video_asset: mode === "register_server_asset"
            ? {
                asset_id: `${candidateId}-server-video-asset`,
                provider: "external_https",
                mime_type: "video/mp4",
                size_bytes: 1,
                server_accessible: false
              }
            : undefined
        })
      });
      const body = await response.json() as VideoAssetState["details"];
      setState({
        status: response.ok && body?.ok ? "ready" : "blocked",
        summary: body?.message ?? "One-product video asset entrypoint returned a safe response.",
        details: body
      });
    } catch {
      setState({
        status: "blocked",
        summary: "One-product video asset entrypoint failed with a safe client error."
      });
    }
  }

  return (
    <section className="rounded-lg border border-violet-200 bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-violet-700">one-product video asset entrypoint</p>
          <h2 className="mt-1 text-lg font-bold text-slate-950">One-product video asset entrypoint</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            This panel checks whether a real Coupang candidate can enter an approval-gated server-accessible video/mp4
            asset flow. It does not run YouTube Execute, create worker jobs, create queue rows, upload to R2, or expose
            raw affiliate, image, token, or asset URLs.
          </p>
        </div>
        <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-bold text-violet-800">
          contract-only
        </span>
      </div>

      <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <p className="font-bold">Safety boundary</p>
        <p className="mt-1">
          YouTube Execute is not available here. Local video generation remains local-only until a separate
          server-accessible registration step provides a valid asset reference.
        </p>
      </div>

      <label className="mt-4 block text-sm font-bold text-slate-700" htmlFor="one-product-video-candidate-id">
        candidate_id
      </label>
      <input
        id="one-product-video-candidate-id"
        aria-label="candidate_id"
        value={candidateId}
        onChange={(event) => setCandidateId(event.target.value)}
        className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => run("dry_run")}
          disabled={state.status === "loading"}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 disabled:bg-slate-100 disabled:text-slate-400"
        >
          Check candidate video asset readiness
        </button>
        <button
          type="button"
          onClick={() => run("generate_local_only")}
          disabled={state.status === "loading"}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 disabled:bg-slate-100 disabled:text-slate-400"
        >
          Generate local-only video contract
        </button>
        <button
          type="button"
          onClick={() => run("register_server_asset")}
          disabled={state.status === "loading"}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 disabled:bg-slate-100 disabled:text-slate-400"
        >
          Register server asset contract
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
            <InfoRow label="next_action" value={state.details.next_action ?? "none"} />
            <InfoRow label="candidate_id" value={state.details.candidate?.candidate_id ?? "not selected"} />
            <InfoRow label="product_name" value={state.details.candidate?.product_name ?? "not selected"} />
            <InfoRow label="affiliate_url_present" value={String(state.details.candidate?.affiliate_url_present ?? false)} />
            <InfoRow label="image_ready" value={String(state.details.candidate?.image_ready ?? false)} />
            <InfoRow label="local_video_generated" value={String(state.details.generated_video_asset?.local_video_path_present ?? false)} />
            <InfoRow label="server_accessible_asset_ready" value={String(state.details.prepared_video_asset_summary?.server_accessible ?? false)} />
            <InfoRow label="asset_id" value={state.details.prepared_video_asset_summary?.asset_id ?? "not ready"} />
            <InfoRow label="provider" value={state.details.prepared_video_asset_summary?.provider ?? "not ready"} />
            <InfoRow label="mime_type" value={state.details.prepared_video_asset_summary?.mime_type ?? "not ready"} />
            <InfoRow label="size_bytes" value={String(state.details.prepared_video_asset_summary?.size_bytes ?? "not ready")} />
            <InfoRow label="product_assets_rows_planned" value={String(state.details.registration_plan?.product_assets_rows_planned ?? 0)} />
            <InfoRow label="write_executed" value={String(state.details.registration_plan?.write_executed ?? false)} />
            <InfoRow label="youtube_execute_called" value={String(state.details.side_effects?.youtube_execute_called ?? false)} />
            <InfoRow label="r2_uploaded" value={String(state.details.side_effects?.r2_uploaded ?? false)} />
            <InfoRow label="db_written" value={String(state.details.side_effects?.db_written ?? false)} />
            <InfoRow label="raw_url_printed" value="false" />
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
