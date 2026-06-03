import { NextResponse } from "next/server";
import { POST as buildUploadPackage } from "../../../queue/[id]/build-upload-package/route";
import {
  getCoupangProductToVideoSmokeStatus,
  getDefaultSmokeChannelProfileId
} from "@/lib/dev/coupangProductToVideoSmoke";
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
  const channelProfileId =
    typeof body.channel_profile_id === "string" && body.channel_profile_id.trim()
      ? body.channel_profile_id.trim()
      : getDefaultSmokeChannelProfileId();

  if (!queueId) {
    return NextResponse.json(
      {
        ok: false,
        step: "build-upload-package",
        error_code: "MISSING_QUEUE_ID",
        message: "queue_id가 필요합니다.",
        created_worker_jobs: 0
      },
      { status: 400 }
    );
  }

  const response = await buildUploadPackage(
    new Request(request.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel_profile_id: channelProfileId })
    }),
    { params: Promise.resolve({ id: queueId }) }
  );
  const payload = await response.json();
  const status = await getCoupangProductToVideoSmokeStatus(getAutomationRepository(), { queue_id: queueId });

  return NextResponse.json(
    {
      ...payload,
      step: "build-upload-package",
      queue_id: queueId,
      channel_profile_id: channelProfileId,
      status
    },
    { status: response.status }
  );
}
