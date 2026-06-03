"use client";

import { useMemo, useState } from "react";
import type { GeneratedContent, ProductQueueItem } from "@/types/automation";
import type { RenderPlanOverride, RenderPlanShotOverride } from "@/lib/video/renderPlanOverride";
import type { RenderPlan } from "@/lib/video/renderPlanTypes";
import { buildStoryboardRenderPlan } from "@/lib/video/storyboardTemplatePlanner";

export function RenderPlanOverrideEditor({
  item,
  content,
  onSaved
}: {
  item: ProductQueueItem;
  content: GeneratedContent | null;
  onSaved: (override: RenderPlanOverride) => void;
}) {
  const basePlan = useMemo(() => {
    const result = buildStoryboardRenderPlan(item, content);
    return result.ok ? result.render_plan : null;
  }, [item, content]);
  const [shots, setShots] = useState<RenderPlanShotOverride[]>(() => buildEditableShots(basePlan, content));
  const [updatedBy, setUpdatedBy] = useState(content?.render_plan_override?.updated_by ?? "");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  if (!basePlan) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-slate-950">Render plan lightweight override</h2>
        <p className="mt-2 text-sm text-slate-500">
          Override editing is available after product image, affiliate URL, script, and disclosure are ready.
        </p>
      </section>
    );
  }

  async function saveOverride() {
    setStatus("loading");
    setMessage("");
    try {
      const response = await fetch(`/api/queue/${item.id}/render-plan-override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shots, updated_by: updatedBy })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        setStatus("error");
        setMessage(typeof payload.safe_error === "string" ? payload.safe_error : "Render plan override could not be saved.");
        return;
      }
      if (isRenderPlanOverride(payload.render_plan_override)) {
        onSaved(payload.render_plan_override);
      }
      setStatus("success");
      setMessage("Render plan override saved. No worker jobs were created.");
    } catch {
      setStatus("error");
      setMessage("Render plan override request failed.");
    }
  }

  function updateShot(index: number, patch: Partial<RenderPlanShotOverride>) {
    setShots((current) => current.map((shot, shotIndex) => shotIndex === index ? { ...shot, ...patch } : shot));
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-950">Render plan lightweight override</h2>
          <p className="mt-2 text-sm text-slate-500">
            Adjust shot captions, voice text, and duration before the next batch. Image URLs, affiliate links, disclosure, uploads, and worker execution are not editable here.
          </p>
          <p className="mt-2 text-xs font-bold text-slate-600">
            Override save creates 0 worker jobs. Next-batch is still the only worker job creation path.
          </p>
          <p className="mt-1 text-xs font-bold text-slate-600">
            External video APIs and platform uploads remain disabled.
          </p>
        </div>
        <button
          type="button"
          onClick={saveOverride}
          disabled={status === "loading"}
          className="focus-ring rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {status === "loading" ? "Saving..." : "Save render plan override"}
        </button>
      </div>

      <label className="mt-4 block text-sm font-semibold text-slate-700">
        Updated by
        <input
          value={updatedBy}
          onChange={(event) => setUpdatedBy(event.target.value)}
          className="focus-ring mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900"
          placeholder="operator"
        />
      </label>

      <div className="mt-4 grid gap-4">
        {shots.map((shot, index) => (
          <div key={shot.shot_id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-950">{shot.shot_id}</h3>
              <span className="text-xs font-bold text-slate-500">2-8 seconds</span>
            </div>
            <label className="mt-3 block text-sm font-semibold text-slate-700">
              Caption
              <input
                value={shot.caption ?? ""}
                onChange={(event) => updateShot(index, { caption: event.target.value })}
                maxLength={80}
                className="focus-ring mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900"
              />
            </label>
            <label className="mt-3 block text-sm font-semibold text-slate-700">
              Voice text
              <textarea
                value={shot.voice_text ?? ""}
                onChange={(event) => updateShot(index, { voice_text: event.target.value })}
                maxLength={160}
                rows={2}
                className="focus-ring mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900"
              />
            </label>
            <label className="mt-3 block text-sm font-semibold text-slate-700">
              Duration seconds
              <input
                value={shot.duration_seconds ?? ""}
                onChange={(event) => updateShot(index, { duration_seconds: Number(event.target.value) })}
                type="number"
                min={2}
                max={8}
                className="focus-ring mt-1 w-32 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900"
              />
            </label>
          </div>
        ))}
      </div>

      {message ? (
        <p className={`mt-4 rounded-lg px-3 py-2 text-sm font-semibold ${
          status === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
        }`}>
          {message}
        </p>
      ) : null}
    </section>
  );
}

function isRenderPlanOverride(value: unknown): value is RenderPlanOverride {
  return Boolean(value && typeof value === "object" && Array.isArray((value as { shots?: unknown }).shots));
}

function buildEditableShots(
  basePlan: RenderPlan | null,
  content: GeneratedContent | null
): RenderPlanShotOverride[] {
  if (!basePlan) {
    return [];
  }
  return basePlan.shots.map((shot) => {
    const existing = content?.render_plan_override?.shots?.find((entry) => entry.shot_id === shot.shot_id);
    return {
      shot_id: shot.shot_id,
      caption: existing?.caption ?? shot.caption,
      voice_text: existing?.voice_text ?? shot.voice_text,
      duration_seconds: existing?.duration_seconds ?? shot.duration_sec
    };
  });
}
