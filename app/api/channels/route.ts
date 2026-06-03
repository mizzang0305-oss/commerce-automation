import { NextResponse } from "next/server";
import { getYouTubeChannelReadiness } from "@/lib/channels/channelProfileAdmin";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";

export const dynamic = "force-dynamic";

export async function GET() {
  const repository = getAutomationRepository();
  const channelProfiles = await repository.getChannelProfiles();

  return NextResponse.json({
    ok: true,
    channel_profiles: channelProfiles,
    youtube: {
      ...getYouTubeChannelReadiness(),
      message: "채널 프로필은 수동 업로드 패키지 라우팅용이며 자동 업로드를 실행하지 않습니다."
    }
  });
}
