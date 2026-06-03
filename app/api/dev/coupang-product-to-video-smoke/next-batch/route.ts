import { NextResponse } from "next/server";
import { POST as runNextBatch } from "../../../run/next-batch/route";
import { getCoupangProductToVideoSmokeStatus } from "@/lib/dev/coupangProductToVideoSmoke";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { denyDevRouteIfDisabled } from "@/lib/server/devRouteGuard";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = denyDevRouteIfDisabled();
  if (denied) {
    return denied;
  }

  const body = await request.json().catch(() => ({}));
  const queueId = typeof body.queue_id === "string" ? body.queue_id.trim() : "";
  const response = await runNextBatch();
  const payload = await response.json();
  const status = await getCoupangProductToVideoSmokeStatus(getAutomationRepository(), { queue_id: queueId });

  return NextResponse.json(
    {
      ...payload,
      step: "next-batch",
      queue_id: queueId,
      status
    },
    { status: response.status }
  );
}
