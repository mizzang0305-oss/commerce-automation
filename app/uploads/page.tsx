import { buildPlatformUploadReadiness, createDefaultPlatformUploadSettings } from "@/lib/uploads";

export const dynamic = "force-dynamic";

const providerLabels = {
  youtube: "YouTube",
  tiktok: "TikTok",
  threads: "Threads"
} as const;

export default async function UploadsPage() {
  const settings = createDefaultPlatformUploadSettings();
  const readiness = buildPlatformUploadReadiness(settings);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Platform Upload Readiness</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          No live platform API calls are available from this screen. Upload settings, readiness, and plan JSON are
          approval-gated scaffolds only; YouTube, TikTok, and Threads remain disabled by default.
        </p>
      </div>

      <section className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
        Platform upload core is copy-only. It does not exchange tokens, store OAuth credentials, create upload jobs,
        create queue rows, call provider APIs, or enable public upload.
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {readiness.map((item) => (
          <article key={item.provider} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-950">{providerLabels[item.provider]}</h2>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Readiness blocked</p>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-600">
                upload_enabled=false
              </span>
            </div>

            <dl className="mt-4 space-y-2 text-sm">
              <ReadinessRow label="configured" value={item.configured} />
              <ReadinessRow label="token_ready" value={item.token_ready} />
              <ReadinessRow label="scopes_ready" value={item.scopes_ready} />
              <ReadinessRow label="quota_ready" value={item.quota_ready} />
              <ReadinessRow label="account_ready" value={item.account_ready} />
              <ReadinessRow label="policy_ready" value={item.policy_ready} />
              <ReadinessRow label="can_upload" value={item.can_upload} />
            </dl>

            <div className="mt-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Blocked reasons</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {item.blocked_reasons.map((reason) => (
                  <span key={reason} className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                    {reason}
                  </span>
                ))}
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-bold text-slate-950">Default safety settings</h2>
        <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2">
          <SettingRow label="youtube_upload_enabled" value={String(settings.youtube_upload_enabled)} />
          <SettingRow label="tiktok_upload_enabled" value={String(settings.tiktok_upload_enabled)} />
          <SettingRow label="threads_upload_enabled" value={String(settings.threads_upload_enabled)} />
          <SettingRow label="public_upload_enabled" value={String(settings.public_upload_enabled)} />
          <SettingRow label="manual_upload_only" value={String(settings.manual_upload_only)} />
          <SettingRow label="approval_required" value={String(settings.approval_required)} />
          <SettingRow label="default_visibility" value={settings.default_visibility} />
          <SettingRow label="max_daily_uploads" value={String(settings.max_daily_uploads)} />
        </dl>
      </section>
    </div>
  );
}

function ReadinessRow({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="font-medium text-slate-500">{label}</dt>
      <dd className={value ? "font-bold text-teal-700" : "font-bold text-slate-500"}>{String(value)}</dd>
    </div>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2">
      <dt className="font-medium text-slate-600">{label}</dt>
      <dd className="font-bold text-slate-950">{value}</dd>
    </div>
  );
}
