import "server-only";

import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { studioAuthConfig } from "./config";

export function createStudioRouteClient(request: NextRequest, response: NextResponse) {
  const config = studioAuthConfig();
  if (!config.ready) return null;
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (entries) => entries.forEach(({ name, value, options }) => {
        request.cookies.set(name, value);
        response.cookies.set(name, value, options);
      })
    }
  });
}
