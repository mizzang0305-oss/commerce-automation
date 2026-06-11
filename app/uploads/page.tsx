import { YouTubeDashboardSmokeFlow } from "@/components/YouTubeDashboardSmokeFlow";
import { buildPlatformUploadReadiness, createDefaultPlatformUploadSettings } from "@/lib/uploads";
import {
  APPROVE_YOUTUBE_PRIVATE_UPLOAD,
  RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE,
  YOUTUBE_PRIVATE_SMOKE_VIDEO_PATH,
  buildYouTubeLocalTokenProviderStatus,
  buildYouTubeUploadReadiness
} from "@/lib/uploads/youtube";
import {
  buildYouTubeReadinessGateViews,
  buildYouTubeReadinessSummaryView,
  type UploadReadinessGateStatus,
  type UploadReadinessGateView
} from "@/lib/uploads/youtube/readinessViewModel";
import path from "path";

export const dynamic = "force-dynamic";

const providerLabels = {
  youtube: "YouTube",
  tiktok: "TikTok",
  threads: "Threads"
} as const;

const statusLabels: Record<UploadReadinessGateStatus, string> = {
  pass: "통과",
  blocked: "차단",
  warning: "주의",
  not_configured: "미설정"
};

const statusClasses: Record<UploadReadinessGateStatus, string> = {
  pass: "border-teal-200 bg-teal-50 text-teal-800",
  blocked: "border-rose-200 bg-rose-50 text-rose-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  not_configured: "border-slate-200 bg-slate-50 text-slate-700"
};

export default async function UploadsPage() {
  const settings = createDefaultPlatformUploadSettings();
  const readiness = buildPlatformUploadReadiness(settings);
  const youtubeReadiness = buildYouTubeUploadReadiness();
  const youtubeTokenReadiness = buildYouTubeLocalTokenProviderStatus();
  const youtubeGateViews = buildYouTubeReadinessGateViews({
    readiness: youtubeReadiness,
    tokenReadiness: youtubeTokenReadiness,
    settings
  });
  const youtubeSummary = buildYouTubeReadinessSummaryView(youtubeGateViews, youtubeReadiness.can_upload);
  const defaultYouTubeSmokeVideoPath = path.join(process.cwd(), YOUTUBE_PRIVATE_SMOKE_VIDEO_PATH);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">업로드 준비 대시보드</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          이 화면은 YouTube 비공개 smoke readiness를 한국어로 진단하고, 실행 차단 사유와 다음 조치를 보여줍니다.
          TikTok과 Threads는 readiness-only 상태이며 자동 업로드는 구현되어 있지 않습니다.
        </p>
      </div>

      <section className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
        대시보드는 DB write, R2 upload, queue row, worker job, upload package, public upload를 만들지 않습니다. 실제
        YouTube 실행은 readiness와 두 승인 문구가 모두 통과할 때만 서버 API에서 별도 차단 게이트를 통과해야 합니다.
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">YouTube private smoke readiness</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">{youtubeSummary.current_step_ko}</h2>
            <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-700">{youtubeSummary.last_blocker_ko}</p>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">{youtubeSummary.next_action_ko}</p>
          </div>
          <span
            className={
              youtubeSummary.status_tone === "ready"
                ? "rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-bold text-teal-800"
                : "rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-bold text-rose-800"
            }
          >
            can_upload={String(youtubeSummary.can_upload)}
          </span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {youtubeGateViews.map((gate) => (
            <ReadinessGateCard key={gate.key} gate={gate} />
          ))}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="font-bold text-slate-950">정확한 승인 문구</p>
            <p className="mt-2 text-slate-600">두 문구는 복사 가능한 텍스트일 뿐이며, 화면에서 직접 입력해야 합니다.</p>
            <code className="mt-3 block rounded bg-white px-2 py-1 text-xs font-bold text-slate-800">
              {RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE}
            </code>
            <code className="mt-2 block rounded bg-white px-2 py-1 text-xs font-bold text-slate-800">
              {APPROVE_YOUTUBE_PRIVATE_UPLOAD}
            </code>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="font-bold text-slate-950">안전 표시</p>
            <dl className="mt-3 space-y-2">
              <SettingRow label="token_value_displayed" value="false" />
              <SettingRow label="authorization_header_displayed" value="false" />
              <SettingRow label="public_visibility_available" value="false" />
              <SettingRow label="dashboard_creates_worker_job" value="false" />
            </dl>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {readiness.map((item) => (
          <article key={item.provider} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-950">{providerLabels[item.provider]}</h2>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">플랫폼 공통 readiness</p>
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
        <h2 className="text-sm font-bold text-slate-950">기본 안전 설정</h2>
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

      <YouTubeDashboardSmokeFlow
        defaultVideoPath={defaultYouTubeSmokeVideoPath}
        readinessCanUpload={youtubeReadiness.can_upload}
        readinessBlockedReasons={youtubeReadiness.blocked_reasons}
      />

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-950">YouTube Local Token Provider</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-500">
              로컬 토큰 provider는 파일 위치와 readiness 메타데이터만 확인합니다. refresh token, access token,
              client secret, raw auth header는 표시하지 않습니다.
            </p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700">
            token value hidden
          </span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">토큰 provider readiness</p>
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

function ReadinessGateCard({ gate }: { gate: UploadReadinessGateView }) {
  return (
    <article className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-bold text-slate-950">{gate.label_ko}</h3>
        <span className={`rounded-full border px-2 py-1 text-xs font-bold ${statusClasses[gate.status]}`}>
          {statusLabels[gate.status]}
        </span>
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-700">{gate.operator_summary_ko}</p>
      <p className="mt-2 text-sm text-slate-500">{gate.fix_hint_ko}</p>
      {gate.safe_details?.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {gate.safe_details.map((detail) => (
            <span key={detail} className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-600">
              {detail}
            </span>
          ))}
        </div>
      ) : null}
    </article>
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
    <div className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2">
      <dt className="font-medium text-slate-600">{label}</dt>
      <dd className="break-all text-right font-bold text-slate-950">{value}</dd>
    </div>
  );
}
