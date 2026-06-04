import { NextResponse } from "next/server";
import { collectCoupangCandidates } from "@/lib/collectors/coupangCollectorMvp";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const result = await collectCoupangCandidates(getAutomationRepository(), body);

  return NextResponse.json({
    ...result,
    queue_created: false,
    worker_jobs_created: false
  });
}
