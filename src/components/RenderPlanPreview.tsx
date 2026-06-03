import type { GeneratedContent, ProductQueueItem } from "@/types/automation";
import { formatShotTime, summarizeRenderPlanPreview } from "@/lib/video/renderPlanPreview";
import { buildStoryboardRenderPlan } from "@/lib/video/storyboardTemplatePlanner";

export function RenderPlanPreview({
  item,
  content
}: {
  item: ProductQueueItem;
  content: GeneratedContent | null;
}) {
  const planResult = buildStoryboardRenderPlan(item, content);
  const renderPlan = planResult.ok ? planResult.render_plan : null;
  const summary = summarizeRenderPlanPreview(renderPlan, item, content);
  const attached = summary.mode === "render_plan";

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-950">Render plan preview</h2>
          <p className="mt-2 text-sm text-slate-500">
            Shot plan is preview-only here. Worker jobs are still created only by next-batch, and the Python Worker remains the renderer.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PreviewPill label={`render_plan_attached=${attached ? "true" : "false"}`} ok={attached} />
          <PreviewPill label={`shots=${summary.shot_count}`} ok={summary.shot_count > 0} />
          <PreviewPill label={`duration=${summary.total_duration_sec}s`} ok={summary.total_duration_sec > 0} />
        </div>
      </div>

      {summary.mode === "legacy_fallback" ? (
        <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <p className="text-sm font-bold text-yellow-900">
            Legacy render fallback will be used until the missing inputs are fixed.
          </p>
          <p className="mt-2 text-sm text-yellow-800">
            A render_plan is attached only when product image, affiliate URL, script, and disclosure text are ready.
          </p>
        </div>
      ) : null}

      {summary.gaps.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {summary.gaps.map((gap) => (
            <span key={gap} className="rounded-full bg-yellow-50 px-2.5 py-1 text-xs font-bold text-yellow-800 ring-1 ring-yellow-200">
              {gapLabel(gap)}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
          Render plan inputs and shot rows are ready for next-batch payload attachment.
        </p>
      )}

      {summary.rows.length ? (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">Shot</th>
                <th className="py-2 pr-4">Timing</th>
                <th className="py-2 pr-4">Layout</th>
                <th className="py-2 pr-4">Caption</th>
                <th className="py-2 pr-4">Voice</th>
                <th className="py-2 pr-4">Readiness</th>
              </tr>
            </thead>
            <tbody>
              {summary.rows.map((row) => (
                <tr key={`${row.shot_index}-${row.shot_id}`} className="border-b border-slate-100 align-top">
                  <td className="py-3 pr-4">
                    <p className="font-bold text-slate-950">{row.shot_id}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">#{row.shot_index}</p>
                  </td>
                  <td className="py-3 pr-4 text-slate-700">
                    {formatShotTime(row.start_time_sec)} → {formatShotTime(row.start_time_sec + Math.max(0, row.duration_sec))}
                    <span className="block text-xs font-semibold text-slate-500">{row.duration_sec}s</span>
                  </td>
                  <td className="py-3 pr-4 text-slate-700">{row.layout}</td>
                  <td className="max-w-xs py-3 pr-4 text-slate-700">{row.caption || "-"}</td>
                  <td className="max-w-sm py-3 pr-4 text-slate-700">{row.voice_text || "-"}</td>
                  <td className="py-3 pr-4">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${
                        row.readiness_status === "ready"
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                          : "bg-yellow-50 text-yellow-800 ring-yellow-200"
                      }`}
                    >
                      {row.readiness_status}
                    </span>
                    {row.missing_reasons.length ? (
                      <p className="mt-2 max-w-xs text-xs font-semibold text-yellow-800">
                        {row.missing_reasons.map(gapLabel).join(", ")}
                      </p>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function PreviewPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${
        ok ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-100 text-slate-700 ring-slate-200"
      }`}
    >
      {label}
    </span>
  );
}

function gapLabel(gap: string) {
  const labels: Record<string, string> = {
    no_render_plan: "no_render_plan",
    missing_product_name: "product_name",
    missing_affiliate_url: "selected_affiliate_url",
    missing_image: "thumbnail_url",
    missing_script: "video_script",
    missing_disclosure: "disclosure_text",
    empty_shots: "empty_shots",
    invalid_duration: "invalid_duration",
    missing_caption: "missing_caption",
    missing_voice_text: "missing_voice_text",
    too_long_caption: "too_long_caption",
    unsafe_claim_warning: "unsafe_claim_warning"
  };
  return labels[gap] ?? gap;
}
