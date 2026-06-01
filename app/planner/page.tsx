import { CalendarClock, CheckCircle2, ShieldCheck } from "lucide-react";
import { getDefaultChannelProfiles } from "@/lib/channels/defaultChannels";
import { getDefaultEventCalendar } from "@/lib/events/defaultEvents";
import { getUpcomingEvents } from "@/lib/events/eventMatching";
import { buildDailyProductionPlan } from "@/lib/planner/dailyProductionPlanner";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { StatCard } from "@/components/StatCard";

export const dynamic = "force-dynamic";

export default async function PlannerPage() {
  const repository = getAutomationRepository();
  const today = new Date();
  const todayText = today.toISOString().slice(0, 10);
  const [settings, candidates, productionHistory, channelPackages] = await Promise.all([
    repository.getSettings(),
    repository.getProductCandidates(),
    repository.getProductionHistory(),
    repository.getChannelUploadPackages()
  ]);
  const events = getDefaultEventCalendar(today.getUTCFullYear());
  const channels = getDefaultChannelProfiles();
  const upcomingEvents = getUpcomingEvents(events, today, 30);
  const uploadPackageCountsByChannel = new Map<string, { manual_ready: number; uploaded: number; needs_fix: number }>();
  channelPackages.forEach((entry) => {
    const current = uploadPackageCountsByChannel.get(entry.channel_profile_id) ?? {
      manual_ready: 0,
      uploaded: 0,
      needs_fix: 0
    };
    if (entry.status === "manual_ready" || entry.status === "uploaded" || entry.status === "needs_fix") {
      current[entry.status] += 1;
    }
    uploadPackageCountsByChannel.set(entry.channel_profile_id, current);
  });
  const plan = buildDailyProductionPlan({
    date: todayText,
    candidates,
    events,
    channelProfiles: channels,
    targetCount: Math.min(settings.daily_target_count, settings.max_daily_videos),
    productionHistory,
    now: today
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">제작 플래너</h1>
        <p className="mt-2 text-sm text-slate-500">
          7~30일 안에 다가오는 이벤트를 기준으로 후보 상품을 선별하고, 수동 업로드용 채널 프로필에 배정합니다.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="오늘 제작 목표" value={plan.plan.target_video_count} />
        <StatCard label="이벤트 매칭 후보" value={plan.items.length} tone={plan.items.length > 0 ? "success" : "default"} />
        <StatCard label="다가오는 이벤트" value={upcomingEvents.length} />
        <StatCard label="수동 전용 채널" value={channels.filter((channel) => channel.manual_upload_only).length} tone="success" />
      </section>

      <section className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
        YouTube 자동 업로드는 비활성화 상태입니다. 이 화면은 제작 우선순위와 업로드 패키지 라우팅만 계산하며 worker job은 만들지 않습니다.
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <CalendarClock size={18} className="text-teal-700" aria-hidden="true" />
            <h2 className="text-base font-bold text-slate-950">오늘 제작 계획</h2>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">순위</th>
                  <th className="px-3 py-2">후보</th>
                  <th className="px-3 py-2">이벤트</th>
                  <th className="px-3 py-2">채널</th>
                  <th className="px-3 py-2">근거</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {plan.items.map((item) => {
                  const candidate = candidates.find((entry) => entry.id === item.product_candidate_id);
                  const channel = channels.find((entry) => entry.id === item.target_channel_id);
                  return (
                    <tr key={item.id} className="align-top">
                      <td className="px-3 py-3 font-semibold text-slate-900">{item.rank}</td>
                      <td className="px-3 py-3">
                        <span className="font-semibold text-slate-900">{candidate?.product_name ?? item.product_candidate_id}</span>
                        <span className="mt-1 block text-xs text-slate-500">{candidate?.category || "카테고리 없음"}</span>
                      </td>
                      <td className="px-3 py-3 text-slate-700">{item.event_key}</td>
                      <td className="px-3 py-3 text-slate-700">{channel?.channel_name ?? item.target_channel_id}</td>
                      <td className="max-w-xl px-3 py-3 text-slate-600">{item.reason}</td>
                    </tr>
                  );
                })}
                {plan.items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-sm text-slate-500">
                      오늘 조건을 통과한 이벤트 제작 후보가 없습니다.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-teal-700" aria-hidden="true" />
              <h2 className="text-base font-bold text-slate-950">채널 안전 상태</h2>
            </div>
            <ul className="mt-4 space-y-3 text-sm text-slate-600">
              <li className="flex items-start gap-2">
                <CheckCircle2 size={16} className="mt-0.5 text-emerald-600" aria-hidden="true" />
                모든 기본 채널은 manual_upload_only=true입니다.
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 size={16} className="mt-0.5 text-emerald-600" aria-hidden="true" />
                upload_enabled=false로 자동 업로드가 실행되지 않습니다.
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 size={16} className="mt-0.5 text-emerald-600" aria-hidden="true" />
                worker job 생성은 기존 next-batch 경로만 사용합니다.
              </li>
            </ul>
            <div className="mt-4 border-t border-slate-100 pt-4">
              <h3 className="text-sm font-bold text-slate-900">채널별 수동 업로드 준비 패키지</h3>
              <div className="mt-3 space-y-2">
                {channels.map((channel) => (
                  <div key={channel.id} className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 text-sm">
                    <span className="font-semibold text-slate-700">{channel.channel_name}</span>
                    <div className="flex flex-wrap justify-end gap-1">
                      <PackageCountBadge label="준비" value={uploadPackageCountsByChannel.get(channel.id)?.manual_ready ?? 0} />
                      <PackageCountBadge label="완료" value={uploadPackageCountsByChannel.get(channel.id)?.uploaded ?? 0} />
                      <PackageCountBadge label="수정" value={uploadPackageCountsByChannel.get(channel.id)?.needs_fix ?? 0} tone="warning" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-base font-bold text-slate-950">다가오는 이벤트</h2>
            <div className="mt-3 space-y-3">
              {upcomingEvents.slice(0, 6).map((event) => (
                <div key={event.id} className="rounded-md border border-slate-100 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-slate-900">{event.event_name}</span>
                    <span className="text-xs font-semibold text-teal-700">{event.starts_at.slice(0, 10)}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{event.target_keywords.join(", ")}</p>
                </div>
              ))}
              {upcomingEvents.length === 0 ? (
                <p className="text-sm text-slate-500">7~30일 window에 들어온 active 이벤트가 없습니다.</p>
              ) : null}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function PackageCountBadge({
  label,
  value,
  tone = "default"
}: {
  label: string;
  value: number;
  tone?: "default" | "warning";
}) {
  return (
    <span className={`rounded-full bg-white px-2 py-0.5 text-xs font-bold ring-1 ${
      tone === "warning" ? "text-yellow-800 ring-yellow-200" : "text-teal-700 ring-teal-100"
    }`}>
      {label} {value}개
    </span>
  );
}
