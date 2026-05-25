import "server-only";

import { NextResponse } from "next/server";

export function isDevRouteEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.ENABLE_DEV_TOOLS === "true";
}

export function denyDevRouteIfDisabled() {
  if (isDevRouteEnabled()) {
    return null;
  }

  return NextResponse.json({ ok: false, message: "Not found." }, { status: 404 });
}
