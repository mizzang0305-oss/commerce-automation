import type { N8nConfigStatus } from "@/lib/server/env";

const labels: Array<[keyof N8nConfigStatus, string]> = [
  ["nightlyScoutConfigured", "Nightly scout webhook"],
  ["nextBatchConfigured", "Next batch webhook"],
  ["retryItemConfigured", "Retry item webhook"],
  ["secretConfigured", "Webhook secret"],
  ["holdItemConfigured", "Hold item webhook"],
  ["skipItemConfigured", "Skip item webhook"]
];

export function WebhookStatusCard({ diagnostics }: { diagnostics: N8nConfigStatus }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-slate-950">n8n Webhook 설정</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {labels.map(([key, label]) => (
          <div key={key} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
            <span className="text-sm text-slate-600">{label}</span>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                diagnostics[key] ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
              }`}
            >
              {diagnostics[key] ? "configured" : "설정되지 않음"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
