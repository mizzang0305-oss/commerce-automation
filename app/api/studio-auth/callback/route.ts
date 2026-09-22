import { NextRequest, NextResponse } from "next/server";
import { allowedStudioOwner, studioAuthConfig } from "@/lib/commerce-studio/auth/config";
import { createStudioRouteClient } from "@/lib/commerce-studio/auth/routeClient";

export async function GET(request: NextRequest) {
  const config = studioAuthConfig();
  if (!config.ready || request.nextUrl.origin !== config.origin) return NextResponse.json({ error: "인증 설정 오류" }, { status: 503 });
  const response = NextResponse.redirect(`${config.origin}/studio`, { status: 303 });
  response.headers.set("Cache-Control", "private, no-store");
  const client = createStudioRouteClient(request, response);
  const code = request.nextUrl.searchParams.get("code");
  if (!client || !code || request.nextUrl.searchParams.has("error")) return NextResponse.redirect(`${config.origin}/studio/login?error=callback`);
  const exchanged = await client.auth.exchangeCodeForSession(code);
  if (exchanged.error) return NextResponse.redirect(`${config.origin}/studio/login?error=exchange`);
  const verified = await client.auth.getUser();
  if (verified.error || !allowedStudioOwner(verified.data.user, config.subjects)) {
    await client.auth.signOut();
    response.headers.set("Location", `${config.origin}/studio/login?error=unauthorized`);
  }
  return response;
}
