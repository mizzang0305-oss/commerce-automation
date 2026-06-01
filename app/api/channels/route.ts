import { NextResponse } from "next/server";
import { getDefaultChannelProfiles } from "@/lib/channels/defaultChannels";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    channel_profiles: getDefaultChannelProfiles(),
    youtube: {
      upload_enabled: false,
      manual_upload_only: true,
      message: "채널 프로필은 수동 업로드 패키지 라우팅용이며 자동 업로드를 실행하지 않습니다."
    }
  });
}
