import { NextResponse } from "next/server";
import { getCoupangProductToVideoSmokeStatus } from "@/lib/dev/coupangProductToVideoSmoke";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { denyDevRouteIfDisabled } from "@/lib/server/devRouteGuard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = denyDevRouteIfDisabled();
  if (denied) {
    return denied;
  }

  const url = new URL(request.url);
  const status = await getCoupangProductToVideoSmokeStatus(getAutomationRepository(), {
    candidate_id: url.searchParams.get("candidate_id") ?? undefined,
    queue_id: url.searchParams.get("queue_id") ?? undefined
  });

  return NextResponse.json({
    ok: true,
    step: "status",
    status
  });
}
