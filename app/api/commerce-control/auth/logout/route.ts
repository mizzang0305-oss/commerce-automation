import { NextResponse } from "next/server";
import { expiredSessionCookieHeader } from "@/lib/commerce-control/auth";

export async function POST() {
  return NextResponse.json({ ok: true }, { headers: { "Set-Cookie": expiredSessionCookieHeader() } });
}
