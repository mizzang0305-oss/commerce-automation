"use client";

import { useMemo, useState } from "react";
import type { LocalImageGenerationPackage } from "@/lib/image-generation-bridge/types";
import type { ImageQaImportPlan } from "@/lib/image-qa-import/types";
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
  localImagePackage,
  imageQaImportPlan
}: {
  plan: CommerceImagePromptPlan;
  imageVideoPlan?: CommerceImageVideoPlan | null;
  localImagePackage?: LocalImageGenerationPackage | null;
  imageQaImportPlan?: ImageQaImportPlan | null;
}) {
  const [message, setMessage] = useState("");
  const [importManifestText, setImportManifestText] = useState(imageQaImportPlan?.import_manifest_json ?? "");
  const planJson = useMemo(() => JSON.stringify(plan, null, 2), [plan]);
  const videoPlanJson = useMemo(() => JSON.stringify(imageVideoPlan?.video_plan ?? {}, null, 2), [imageVideoPlan]);
  const fullPlanJson = useMemo(() => JSON.stringify(imageVideoPlan ?? { image_plan: plan }, null, 2), [imageVideoPlan, plan]);
  const localPackageJson = useMemo(() => JSON.stringify(localImagePackage ?? {}, null, 2), [localImagePackage]);
  const manifestJson = useMemo(() => JSON.stringify(localImagePackage?.manifest ?? {}, null, 2), [localImagePackage]);
  const imageQaImportPlanJson = useMemo(() => JSON.stringify(imageQaImportPlan ?? {}, null, 2), [imageQaImportPlan]);
  const selectedImageAssetJson = useMemo(
    () => JSON.stringify(imageQaImportPlan?.selected_image_asset_plan ?? {}, null, 2),
    [imageQaImportPlan]
  );
  const nextStepJson = useMemo(
    () => JSON.stringify({
      next_step_after_qa: imageQaImportPlan?.next_step_after_qa ?? [],
      next_step: imageQaImportPlan?.selected_image_asset_plan.next_step ?? "manual_review",
      ready_for_slideshow_plan: imageQaImportPlan?.selected_image_asset_plan.ready_for_slideshow_plan ?? false,
      side_effects: imageQaImportPlan?.side_effects ?? {}
    }, null, 2),
    [imageQaImportPlan]
  );

  async function copyText(text: string, label: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text).catch(() => undefined);
    }
    setMessage(`${label} copied. No image, video, upload, queue, or worker job was created.`);
  }

  function previewImportPlan() {
    setMessage("QA import plan preview refreshed. No local file was read, no DB row was written, and no upload was started.");
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

      {imageQaImportPlan ? (
        <section className="rounded-lg border border-indigo-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">plan-only import bridge</p>
              <h2 className="mt-1 text-base font-bold text-slate-950">Image QA Import Bridge</h2>
              <p className="mt-1 text-sm text-slate-500">
                This bridge creates QA/import planning text for manually generated images. It does not upload files, read
                local files, write DB rows, call Google Drive APIs, upload to R2, generate video, or create worker jobs.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={previewImportPlan}
                className="rounded-md border border-indigo-300 px-3 py-1.5 text-xs font-bold text-indigo-800 hover:bg-indigo-50"
              >
                Preview QA import plan
              </button>
              <button
                type="button"
                onClick={() => void copyText(importManifestText, "Import manifest JSON")}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                Copy import manifest JSON
              </button>
              <button
                type="button"
                onClick={() => void copyText(selectedImageAssetJson, "Selected image asset JSON")}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                Copy selected image asset JSON
              </button>
              <button
                type="button"
                onClick={() => void copyText(imageQaImportPlan.qa_markdown, "QA markdown")}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                Copy QA markdown
              </button>
              <button
                type="button"
                onClick={() => void copyText(nextStepJson, "Next-step JSON")}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                Copy next-step JSON
              </button>
              <button
                type="button"
                onClick={() => void copyText(imageQaImportPlanJson, "Import plan JSON download text")}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                Download import plan JSON
              </button>
              <button
                type="button"
                onClick={() => void copyText(imageQaImportPlan.qa_markdown, "QA markdown download text")}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                Download QA markdown
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <SideEffectBadge label="external_api_called" value={imageQaImportPlan.side_effects.external_api_called} />
            <SideEffectBadge label="scraped_live_web" value={imageQaImportPlan.side_effects.scraped_live_web} />
            <SideEffectBadge label="image_generated" value={imageQaImportPlan.side_effects.image_generated} />
            <SideEffectBadge label="video_generated" value={imageQaImportPlan.side_effects.video_generated} />
            <SideEffectBadge label="uploaded" value={imageQaImportPlan.side_effects.uploaded} />
            <SideEffectBadge label="db_written" value={imageQaImportPlan.side_effects.db_written} />
            <SideEffectBadge label="file_uploaded" value={imageQaImportPlan.side_effects.file_uploaded} />
            <SideEffectBadge label="local_file_read" value={imageQaImportPlan.side_effects.local_file_read} />
            <SideEffectBadge label="local_file_written" value={imageQaImportPlan.side_effects.local_file_written} />
            <SideEffectBadge label="google_drive_api_called" value={imageQaImportPlan.side_effects.google_drive_api_called} />
            <SideEffectBadge label="r2_uploaded" value={imageQaImportPlan.side_effects.r2_uploaded} />
            <SideEffectBadge label="worker_job_created" value={imageQaImportPlan.side_effects.worker_job_created} />
            <SideEffectBadge label="queue_created" value={imageQaImportPlan.side_effects.queue_created} />
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
              approval_required={String(imageQaImportPlan.approval_required)}
            </span>
            <span className="rounded-full bg-indigo-50 px-2 py-1 text-xs font-bold text-indigo-800">
              ready_for_slideshow_plan={String(imageQaImportPlan.selected_image_asset_plan.ready_for_slideshow_plan)}
            </span>
          </div>

          <div className="mt-4">
            <label htmlFor="image-import-manifest" className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Import manifest JSON
            </label>
            <textarea
              id="image-import-manifest"
              value={importManifestText}
              onChange={(event) => setImportManifestText(event.target.value)}
              className="mt-2 min-h-48 w-full rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-700"
            />
            <p className="mt-2 text-xs text-slate-500">
              Text validation only. No local path is read and no Google Drive file lookup is performed.
            </p>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-md bg-slate-50 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Missing required asset types</p>
              <p className="mt-1 text-sm font-semibold text-slate-700">
                {imageQaImportPlan.selected_image_asset_plan.missing_required_asset_types.join(", ") || "none"}
              </p>
            </div>
            <div className="rounded-md bg-slate-50 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Next step</p>
              <p className="mt-1 text-sm font-semibold text-slate-700">
                {imageQaImportPlan.selected_image_asset_plan.next_step}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {imageQaImportPlan.assets.map((asset) => (
              <article key={asset.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">{asset.asset_type}</p>
                <h3 className="mt-1 text-sm font-bold text-slate-950">{asset.expected_filename}</h3>
                <p className="mt-2 text-xs text-slate-500">QA status: {asset.qa_status}</p>
                <p className="mt-1 break-all text-xs text-slate-500">Provided path: {asset.provided_path || "not provided"}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
