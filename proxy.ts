import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { studioAuthConfig } from "@/lib/commerce-studio/auth/config";

export async function proxy(request: NextRequest) {
  const config = studioAuthConfig();
  if (!config.ready) return NextResponse.next({ request });
  let response = NextResponse.next({ request });
  const client = createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (entries) => {
        entries.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        entries.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });
  await client.auth.getClaims();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = { matcher: ["/studio/:path*", "/api/studio/:path*", "/api/studio-auth/:path*"] };
