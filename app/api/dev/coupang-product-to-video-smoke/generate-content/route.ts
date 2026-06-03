import { NextResponse } from "next/server";
import { POST as generateQueueContent } from "../../../queue/[id]/generate-content/route";
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
  if (!queueId) {
    return NextResponse.json(
      {
        ok: false,
        step: "generate-content",
        error_code: "MISSING_QUEUE_ID",
        message: "queue_id가 필요합니다.",
        created_worker_jobs: 0
      },
      { status: 400 }
    );
  }

  const response = await generateQueueContent(
    new Request(request.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restore_scheduled: true })
    }),
    { params: Promise.resolve({ id: queueId }) }
  );
  const payload = await response.json();
  const status = await getCoupangProductToVideoSmokeStatus(getAutomationRepository(), { queue_id: queueId });

  return NextResponse.json(
    {
      ...payload,
      step: "generate-content",
      queue_id: queueId,
      status,
      created_worker_jobs: payload.created_worker_jobs ?? 0
    },
    { status: response.status }
  );
}
