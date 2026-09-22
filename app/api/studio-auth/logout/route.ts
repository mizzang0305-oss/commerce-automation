import { NextRequest, NextResponse } from "next/server";
import { sameStudioOrigin, studioAuthConfig } from "@/lib/commerce-studio/auth/config";
import { createStudioRouteClient } from "@/lib/commerce-studio/auth/routeClient";

export async function POST(request: NextRequest) {
  const config = studioAuthConfig();
  if (!config.ready || !sameStudioOrigin(request, config.origin)) return NextResponse.json({ error: "요청 출처가 일치하지 않습니다." }, { status: 403 });
  const response = NextResponse.redirect(`${config.origin}/studio/login`, { status: 303 });
  response.headers.set("Cache-Control", "private, no-store");
  const client = createStudioRouteClient(request, response);
  if (!client) return NextResponse.json({ error: "인증 설정 오류" }, { status: 503 });
  await client.auth.signOut();
  return response;
}
