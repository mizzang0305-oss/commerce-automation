import { NextResponse } from "next/server";
import { getYouTubeChannelReadiness } from "@/lib/channels/channelProfileAdmin";
import { getDefaultEventCalendar } from "@/lib/events/defaultEvents";
import { buildDailyProductionPlan } from "@/lib/planner/dailyProductionPlanner";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";

export const dynamic = "force-dynamic";

function parsePlanDate(request: Request) {
  const url = new URL(request.url);
  const requestedDate = url.searchParams.get("date")?.trim();
  if (requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
    return requestedDate;
  }
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const repository = getAutomationRepository();
  const planDate = parsePlanDate(request);
  const planNow = new Date(`${planDate}T00:00:00.000Z`);
  const [settings, candidates, productionHistory, channelProfiles] = await Promise.all([
    repository.getSettings(),
    repository.getProductCandidates(),
    repository.getProductionHistory(),
    repository.getChannelProfiles()
  ]);
  const events = getDefaultEventCalendar(planNow.getUTCFullYear());
  const result = buildDailyProductionPlan({
    date: planDate,
    candidates,
    events,
    channelProfiles,
    targetCount: settings.daily_target_count,
    productionHistory,
    now: planNow
  });

  return NextResponse.json({
    ok: true,
    plan: result.plan,
    items: result.items,
    matches: result.matches,
    excluded: result.excluded,
    events: events.filter((event) => event.status === "active"),
    channel_profiles: channelProfiles,
    youtube: {
      ...getYouTubeChannelReadiness(),
      message: "YouTube 자동 업로드는 비활성화 상태입니다. R2 업로드 패키지를 수동 검수 후 사용합니다."
    },
    safety: {
      worker_jobs_created: 0,
      public_upload_enabled: false,
      channel_upload_enabled: result.channel_safety.youtube_upload_enabled,
      manual_upload_only: result.channel_safety.manual_upload_only
    }
  });
}
