import { NextResponse } from "next/server";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import type { QueueStatus } from "@/types/automation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const items = await getAutomationRepository().getQueue({
    date: url.searchParams.get("date") || undefined,
    status: (url.searchParams.get("status") as QueueStatus | "all" | null) || undefined,
    upload_status: url.searchParams.get("upload_status") || undefined,
    keyword: url.searchParams.get("keyword") || undefined,
    theme: url.searchParams.get("theme") || undefined,
    priority: url.searchParams.get("priority") === "issues-first" ? "issues-first" : undefined,
    limit: limitParam ? Number(limitParam) : undefined
  });

  return NextResponse.json({ items });
}
