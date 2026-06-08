import { ShieldCheck, ShieldX } from "lucide-react";
import type { buildProductionReadinessSummary } from "@/lib/ops/productionReadiness";

type ProductionReadinessSummary = ReturnType<typeof buildProductionReadinessSummary>;

export function ProductionReadinessPanel({ readiness }: { readiness: ProductionReadinessSummary }) {
  const stateLabel = readiness.production_pilot_ready ? "Production Pilot: Ready" : "Production Pilot: Not Ready";
  const stateTone = readiness.production_pilot_ready
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : "border-amber-200 bg-amber-50 text-amber-800";

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-950">Production Readiness</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            This screen does not deploy, write env values, run production smoke, or trigger platform uploads.
          </p>
        </div>
        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-bold ${stateTone}`}>
          {readiness.production_pilot_ready ? <ShieldCheck size={16} /> : <ShieldX size={16} />}
          {stateLabel}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <ReadinessMetric label="Configured env" value={`${readiness.env.configured}/${readiness.env.required}`} />
        <ReadinessMetric label="Missing required" value={readiness.env.missing_required} />
        <ReadinessMetric label="Forbidden configured" value={readiness.env.forbidden_configured} />
        <ReadinessMetric label="Manual pending" value={readiness.manual.pending} />
        <ReadinessMetric label="Approval required" value={readiness.approval_required ? "YES" : "NO"} />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-4">
        {readiness.env_groups.map((group) => (
          <div key={group.key} className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900">{group.label}</h3>
              <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                {group.status}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              Configured {group.configured}/{group.required}; missing {group.missing}.
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-5">
        {readiness.manual_groups.map((group) => (
          <div key={group.key} className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900">{group.label}</h3>
              <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                {group.status}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              Completed {group.completed}; pending {group.pending}.
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-4">
        {readiness.sections.map((section) => (
          <div key={section.key} className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900">{section.label}</h3>
              <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                {section.status}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-600">{section.summary}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-md border border-slate-200 p-3">
          <h3 className="text-sm font-bold text-slate-900">Safety Locks</h3>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            <li>Deploy command executed: {String(readiness.safety.deploy_command_executed).toUpperCase()}</li>
            <li>Vercel CLI invoked: {String(readiness.safety.vercel_cli_invoked).toUpperCase()}</li>
            <li>Raw secret values printed: {String(readiness.safety.raw_secret_values_printed).toUpperCase()}</li>
            <li>Platform upload disabled: {String(readiness.safety.platform_upload_disabled).toUpperCase()}</li>
            <li>YouTube auto upload enabled: {String(readiness.safety.youtube_auto_upload_enabled).toUpperCase()}</li>
            <li>Public upload enabled: {String(readiness.safety.public_upload_enabled).toUpperCase()}</li>
            <li>Upload enabled: {String(readiness.safety.upload_enabled).toUpperCase()}</li>
            <li>Manual upload only: {String(readiness.safety.manual_upload_only).toUpperCase()}</li>
            <li>OAuth token storage enabled: {String(readiness.safety.oauth_token_storage_enabled).toUpperCase()}</li>
            <li>YouTube private smoke adapter implemented: {String(readiness.safety.youtube_private_smoke_adapter_implemented).toUpperCase()}</li>
          </ul>
        </div>
        <div className="rounded-md border border-slate-200 p-3">
          <h3 className="text-sm font-bold text-slate-900">Blocked Actions</h3>
          <p className="mt-2 text-sm text-slate-600">{readiness.blocked_actions.join(", ")}</p>
        </div>
      </div>

      {readiness.not_ready_reasons.length > 0 ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
          <h3 className="text-sm font-bold text-amber-900">Not Ready Reasons</h3>
          <ul className="mt-2 space-y-1 text-sm text-amber-800">
            {readiness.not_ready_reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 rounded-md border border-slate-200 p-3">
        <h3 className="text-sm font-bold text-slate-900">Data Persistence Readiness</h3>
        <ul className="mt-2 grid gap-1 text-sm text-slate-600 sm:grid-cols-2">
          <li>Migration 008 SQL verification: {yesNo(readiness.data_persistence.migration_008_sql_verification_pass)}</li>
          <li>Artifact QA persistence: {yesNo(readiness.data_persistence.artifact_qa_persistence_pass)}</li>
          <li>Columns verified: {yesNo(readiness.data_persistence.artifact_qa_columns_verification_pass)}</li>
          <li>Indexes verified: {yesNo(readiness.data_persistence.artifact_qa_indexes_verification_pass)}</li>
          <li>RLS/policy verified: {yesNo(readiness.data_persistence.artifact_qa_rls_policy_verification_pass)}</li>
          <li>Smoke row verified: {yesNo(readiness.data_persistence.smoke_row_verification_pass)}</li>
        </ul>
        <p className="mt-2 text-xs leading-5 text-slate-500">{readiness.data_persistence.note}</p>
      </div>
    </section>
  );
}

function ReadinessMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-slate-100 px-3 py-2">
      <span className="block text-xs font-semibold text-slate-500">{label}</span>
      <span className="text-lg font-bold text-slate-950">{value}</span>
    </div>
  );
}

function yesNo(value: boolean) {
  return value ? "YES" : "NO";
}
