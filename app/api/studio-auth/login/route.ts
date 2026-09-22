import { NextRequest, NextResponse } from "next/server";
import { sameStudioOrigin, studioAuthConfig } from "@/lib/commerce-studio/auth/config";
import { createStudioRouteClient } from "@/lib/commerce-studio/auth/routeClient";

export async function POST(request: NextRequest) {
  const config = studioAuthConfig();
  if (!config.ready) return NextResponse.json({ error: "소유자 로그인이 설정되지 않았습니다." }, { status: 503 });
  if (!sameStudioOrigin(request, config.origin)) return NextResponse.json({ error: "요청 출처가 일치하지 않습니다." }, { status: 403 });
  const response = NextResponse.redirect(`${config.origin}/studio/login`, { status: 303 });
  response.headers.set("Cache-Control", "private, no-store");
  const client = createStudioRouteClient(request, response);
  if (!client) return NextResponse.json({ error: "인증 설정 오류" }, { status: 503 });
  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${config.origin}/api/studio-auth/callback`, skipBrowserRedirect: true }
  });
  if (error || !data.url) return NextResponse.json({ error: "로그인을 시작할 수 없습니다." }, { status: 502 });
  response.headers.set("Location", data.url);
  return response;
}
