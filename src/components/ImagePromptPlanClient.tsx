"use client";

import { useMemo, useState } from "react";
import type { LocalImageGenerationPackage } from "@/lib/image-generation-bridge/types";
import type { CommerceImagePromptPlan } from "@/lib/image-prompts/types";
import type { CommerceImageVideoPlan } from "@/lib/video-plans/types";

function SideEffectBadge({ label, value }: { label: string; value: boolean }) {
  return (
    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
      {label}={String(value)}
    </span>
  );
}

export function ImagePromptPlanClient({
  plan,
  imageVideoPlan,
  localImagePackage
}: {
  plan: CommerceImagePromptPlan;
  imageVideoPlan?: CommerceImageVideoPlan | null;
  localImagePackage?: LocalImageGenerationPackage | null;
}) {
  const [message, setMessage] = useState("");
  const planJson = useMemo(() => JSON.stringify(plan, null, 2), [plan]);
  const videoPlanJson = useMemo(() => JSON.stringify(imageVideoPlan?.video_plan ?? {}, null, 2), [imageVideoPlan]);
  const fullPlanJson = useMemo(() => JSON.stringify(imageVideoPlan ?? { image_plan: plan }, null, 2), [imageVideoPlan, plan]);
  const localPackageJson = useMemo(() => JSON.stringify(localImagePackage ?? {}, null, 2), [localImagePackage]);
  const manifestJson = useMemo(() => JSON.stringify(localImagePackage?.manifest ?? {}, null, 2), [localImagePackage]);

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
          {imageVideoPlan ? (
            <>
              <SideEffectBadge label="external_api_called" value={imageVideoPlan.side_effects.external_api_called} />
              <SideEffectBadge label="db_written" value={imageVideoPlan.side_effects.db_written} />
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                approval_required={String(imageVideoPlan.approval_required)}
              </span>
            </>
          ) : null}
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

      {imageVideoPlan ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-teal-700">15-second storyboard</p>
              <h2 className="mt-1 text-base font-bold text-slate-950">Video Plan Preview</h2>
              <p className="mt-1 text-sm text-slate-500">
                {imageVideoPlan.video_plan.format} / {imageVideoPlan.video_plan.duration_sec}s / copy-only planning output
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void copyText(videoPlanJson, "Video plan JSON")}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                Copy video plan JSON
              </button>
              <button
                type="button"
                onClick={() => void copyText(JSON.stringify(imageVideoPlan.video_plan.shot_list, null, 2), "Storyboard")}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                Copy storyboard
              </button>
              <button
                type="button"
                onClick={() => void copyText(imageVideoPlan.video_plan.narration_script, "Narration")}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                Copy narration
              </button>
              <button
                type="button"
                onClick={() => void copyText(imageVideoPlan.video_plan.subtitle_lines.join("\n"), "Subtitle lines")}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                Copy subtitle lines
              </button>
              <button
                type="button"
                onClick={() => void copyText(imageVideoPlan.video_plan.cta, "CTA")}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                Copy CTA
              </button>
              <button
                type="button"
                onClick={() => void copyText(fullPlanJson, "Full image and video plan JSON")}
                className="rounded-md border border-teal-300 px-3 py-1.5 text-xs font-bold text-teal-800 hover:bg-teal-50"
              >
                Copy full image and video plan JSON
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {imageVideoPlan.video_plan.shot_list.map((shot) => (
              <article key={shot.index} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Shot {shot.index} / {shot.start_sec}-{shot.end_sec}s / {shot.image_asset_type}
                </p>
                <h3 className="mt-1 text-sm font-bold text-slate-950">{shot.overlay_text}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-700">{shot.visual_direction}</p>
                <p className="mt-2 text-xs text-slate-500">Narration: {shot.narration}</p>
                <p className="mt-1 text-xs text-slate-500">Subtitle: {shot.subtitle}</p>
              </article>
            ))}
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-md bg-slate-50 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">CTA</p>
              <p className="mt-1 text-sm text-slate-700">{imageVideoPlan.video_plan.cta}</p>
            </div>
            <div className="rounded-md bg-slate-50 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Affiliate disclosure reminder</p>
              <p className="mt-1 text-sm text-slate-700">{imageVideoPlan.video_plan.affiliate_disclosure_reminder}</p>
            </div>
          </div>
        </section>
      ) : null}

      {localImagePackage ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-teal-700">approval-gated copy-only bridge</p>
              <h2 className="mt-1 text-base font-bold text-slate-950">Local Image Generation Package</h2>
              <p className="mt-1 text-sm text-slate-500">
                Copy prompts, manifest JSON, and QA notes for a separately approved local image workflow. This UI does not
                generate files, call Google Drive APIs, write DB rows, or create worker jobs.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void copyText(localPackageJson, "Local package JSON")}
                className="rounded-md border border-teal-300 px-3 py-1.5 text-xs font-bold text-teal-800 hover:bg-teal-50"
              >
                Copy local package JSON
              </button>
              <button
                type="button"
                onClick={() => void copyText(manifestJson, "Manifest JSON")}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                Copy manifest JSON
              </button>
              <button
                type="button"
                onClick={() => void copyText(localImagePackage.prompt_markdown, "Prompt markdown")}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                Copy prompt markdown
              </button>
              <button
                type="button"
                onClick={() => void copyText(localImagePackage.qa_checklist.join("\n"), "QA checklist")}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                Copy QA checklist
              </button>
              <button
                type="button"
                onClick={() => void copyText(localImagePackage.manual_generation_steps.join("\n"), "Manual steps")}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                Copy manual steps
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <SideEffectBadge label="local_file_written" value={localImagePackage.side_effects.local_file_written} />
            <SideEffectBadge label="google_drive_api_called" value={localImagePackage.side_effects.google_drive_api_called} />
            <SideEffectBadge label="external_api_called" value={localImagePackage.side_effects.external_api_called} />
            <SideEffectBadge label="db_written" value={localImagePackage.side_effects.db_written} />
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
              approval_required={String(localImagePackage.approval_required)}
            </span>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-md bg-slate-50 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Local output path suggestion</p>
              <p className="mt-1 break-all text-sm font-semibold text-slate-700">{localImagePackage.local_output_path_suggestion}</p>
            </div>
            <div className="rounded-md bg-slate-50 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Google Drive sync path suggestion</p>
              <p className="mt-1 break-all text-sm font-semibold text-slate-700">
                {localImagePackage.google_drive_sync_path_suggestion}
              </p>
              <p className="mt-2 text-xs text-slate-500">Sync folder suggestion only. No Google Drive API or OAuth call is made.</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {localImagePackage.assets.map((asset) => (
              <article key={asset.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-teal-700">{asset.asset_type}</p>
                <h3 className="mt-1 text-sm font-bold text-slate-950">{asset.suggested_filename}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-700">{asset.purpose}</p>
                <p className="mt-2 text-xs text-slate-500">Use after manual approval: {asset.usage_targets.join(", ")}</p>
              </article>
            ))}
          </div>

          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
            {localImagePackage.future_import_instruction}
          </div>
        </section>
      ) : null}
    </section>
  );
}
