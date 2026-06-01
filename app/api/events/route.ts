import { NextResponse } from "next/server";
import { getDefaultEventCalendar } from "@/lib/events/defaultEvents";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const year = Number(url.searchParams.get("year")) || new Date().getFullYear();
  return NextResponse.json({
    ok: true,
    events: getDefaultEventCalendar(year)
  });
}
