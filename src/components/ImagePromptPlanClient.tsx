"use client";

import { useMemo, useState } from "react";
import type { CommerceImagePromptPlan } from "@/lib/image-prompts/types";

function SideEffectBadge({ label, value }: { label: string; value: boolean }) {
  return (
    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
      {label}={String(value)}
    </span>
  );
}

export function ImagePromptPlanClient({ plan }: { plan: CommerceImagePromptPlan }) {
  const [message, setMessage] = useState("");
  const planJson = useMemo(() => JSON.stringify(plan, null, 2), [plan]);

  async function copyText(text: string, label: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text).catch(() => undefined);
    }
    setMessage(`${label} copied. No image, video, upload, queue, or worker job was created.`);
  }

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-teal-950">{plan.product_name}</h2>
            <p className="mt-1 text-sm text-teal-800">
              Source keyword: {plan.source_keyword || "not provided"} / Category: {plan.category_path || "not provided"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void copyText(planJson, "JSON")}
            className="rounded-md border border-teal-300 bg-white px-3 py-2 text-sm font-bold text-teal-800 hover:bg-teal-100"
          >
            Copy JSON
          </button>
        </div>
        {message ? <p className="mt-3 text-sm font-bold text-teal-900">{message}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <SideEffectBadge label="image_generated" value={plan.side_effects.image_generated} />
          <SideEffectBadge label="video_generated" value={plan.side_effects.video_generated} />
          <SideEffectBadge label="uploaded" value={plan.side_effects.uploaded} />
          <SideEffectBadge label="worker_job_created" value={plan.side_effects.worker_job_created} />
          <SideEffectBadge label="queue_created" value={plan.side_effects.queue_created} />
        </div>
      </div>

      {plan.risk_flags.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          Risk flags: {plan.risk_flags.join(", ")}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {plan.image_assets.map((asset) => (
          <article key={asset.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-teal-700">{asset.type}</p>
                <h3 className="mt-1 text-base font-bold text-slate-950">{asset.purpose}</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Aspect {asset.recommended_aspect_ratio} / Targets {asset.usage_targets.join(", ")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void copyText(asset.prompt, asset.copy_label)}
                  aria-label={`Copy prompt ${asset.type}`}
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  {asset.copy_label}
                </button>
                <button
                  type="button"
                  onClick={() => void copyText(asset.negative_prompt, "Negative prompt")}
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  Copy negative prompt
                </button>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Prompt</p>
                <p className="mt-1 rounded-md bg-slate-50 p-3 text-sm leading-6 text-slate-700">{asset.prompt}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Negative prompt</p>
                <p className="mt-1 rounded-md bg-slate-50 p-3 text-sm leading-6 text-slate-700">{asset.negative_prompt}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Safety notes</p>
                <ul className="mt-2 space-y-1 text-sm text-slate-600">
                  {asset.safety_notes.slice(0, 4).map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
