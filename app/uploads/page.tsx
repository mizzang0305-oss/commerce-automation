import { buildPlatformUploadReadiness, createDefaultPlatformUploadSettings } from "@/lib/uploads";
import {
  APPROVE_YOUTUBE_PRIVATE_UPLOAD,
  buildYouTubeLocalTokenProviderStatus,
  buildYouTubeUploadReadiness
} from "@/lib/uploads/youtube";

export const dynamic = "force-dynamic";

const providerLabels = {
  youtube: "YouTube",
  tiktok: "TikTok",
  threads: "Threads"
} as const;

export default async function UploadsPage() {
  const settings = createDefaultPlatformUploadSettings();
  const readiness = buildPlatformUploadReadiness(settings);
  const youtubeReadiness = buildYouTubeUploadReadiness();
  const youtubeTokenReadiness = buildYouTubeLocalTokenProviderStatus();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Platform Upload Readiness</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          Platform uploads remain disabled by default. YouTube supports only a server-side, approval-gated private or
          unlisted smoke path after token, quota, account, policy, local video, and exact confirmation gates pass.
          TikTok and Threads remain readiness-only.
        </p>
      </div>

      <section className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
        This screen does not run uploads. The YouTube execute API remains server-only and approval-gated; it does not
        create upload jobs, queue rows, DB writes, R2 uploads, or public uploads.
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

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-950">YouTube Upload Adapter</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-500">
              YouTube uploads are disabled by default. This adapter only gates private/unlisted upload preparation after
              token readiness, quota readiness, policy readiness, local mp4 readiness, separate smoke approval, and exact
              operator confirmation. Public upload is blocked.
            </p>
            <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-700">
              OAuth tokens are not entered or shown on this screen. No refresh token, access token, or raw auth header is displayed.
            </p>
          </div>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
            public upload blocked
          </span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">YouTube readiness</p>
            <dl className="mt-3 space-y-2 text-sm">
              <ReadinessRow label="configured" value={youtubeReadiness.configured} />
              <ReadinessRow label="token_ready" value={youtubeReadiness.token_ready} />
              <ReadinessRow label="scopes_ready" value={youtubeReadiness.scopes_ready} />
              <ReadinessRow label="quota_ready" value={youtubeReadiness.quota_ready} />
              <ReadinessRow label="account_ready" value={youtubeReadiness.account_ready} />
              <ReadinessRow label="policy_ready" value={youtubeReadiness.policy_ready} />
              <ReadinessRow label="upload_enabled" value={youtubeReadiness.upload_enabled} />
              <ReadinessRow label="can_upload" value={youtubeReadiness.can_upload} />
            </dl>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Blocked reasons</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {youtubeReadiness.blocked_reasons.map((reason) => (
                <span key={reason} className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-600">
                  {reason}
                </span>
              ))}
            </div>
            <div className="mt-4 rounded-md bg-white p-3 text-sm text-slate-700">
              <p className="font-bold text-slate-950">Exact confirmation phrase</p>
              <code className="mt-2 block rounded bg-slate-100 px-2 py-1 text-xs font-bold text-slate-800">
                {APPROVE_YOUTUBE_PRIVATE_UPLOAD}
              </code>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-md border border-slate-200 p-3">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700">
              Visibility
              <select className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" defaultValue="private">
                <option value="private">private</option>
                <option value="unlisted">unlisted</option>
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Confirmation
              <input
                className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder={APPROVE_YOUTUBE_PRIVATE_UPLOAD}
                aria-label="YouTube private upload confirmation"
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled
              className="rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-bold text-slate-500"
            >
              Prepare request
            </button>
            <button
              type="button"
              disabled
              className="rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-bold text-slate-500"
            >
              Execute upload
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700"
            >
              Copy request JSON
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700"
            >
              Copy blocked reasons
            </button>
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-600">
            Live upload smoke is not run unless token readiness, quota readiness, private/unlisted visibility, exact
            confirmation, and separate smoke approval are all present.
          </p>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-950">YouTube Local Token Provider</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-500">
              Local token readiness checks only metadata and file placement. Token values, refresh tokens, access tokens,
              client secrets, and raw authorization headers are never displayed here.
            </p>
          </div>
          <a
            href="/docs/YOUTUBE_LOCAL_TOKEN_PROVIDER.md"
            className="text-sm font-bold text-slate-700 underline underline-offset-4"
          >
            Setup docs
          </a>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Token provider readiness</p>
            <dl className="mt-3 space-y-2 text-sm">
              <ReadinessRow label="configured" value={youtubeTokenReadiness.configured} />
              <ReadinessRow label="token_file_path_configured" value={youtubeTokenReadiness.token_file_path_configured} />
              <ReadinessRow label="token_file_inside_repo" value={youtubeTokenReadiness.token_file_inside_repo} />
              <ReadinessRow
                label="token_file_gitignored_or_outside_repo"
                value={youtubeTokenReadiness.token_file_gitignored_or_outside_repo}
              />
              <ReadinessRow label="token_file_exists" value={youtubeTokenReadiness.token_file_exists} />
              <ReadinessRow label="token_ready" value={youtubeTokenReadiness.token_ready} />
              <ReadinessRow label="scopes_ready" value={youtubeTokenReadiness.scopes_ready} />
            </dl>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Blocked reasons</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {youtubeTokenReadiness.blocked_reasons.map((reason) => (
                <span key={reason} className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-600">
                  {reason}
                </span>
              ))}
            </div>
            <p className="mt-4 rounded-md bg-white p-3 text-sm font-semibold text-slate-700">
              {youtubeTokenReadiness.safe_summary}
            </p>
          </div>
        </div>
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
