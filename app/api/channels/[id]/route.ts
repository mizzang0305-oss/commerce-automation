import { NextResponse } from "next/server";
import {
  getYouTubeChannelReadiness,
  sanitizeChannelProfilePatch
} from "@/lib/channels/channelProfileAdmin";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const repository = getAutomationRepository();
  const profile = await repository.getChannelProfile(id);

  if (!profile) {
    return channelNotFound();
  }

  return NextResponse.json({
    ok: true,
    channel_profile: profile,
    youtube: getYouTubeChannelReadiness()
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const repository = getAutomationRepository();
  const body = await readJsonBody(request);
  const patch = sanitizeChannelProfilePatch(body);
  const updated = await repository.updateChannelProfile(id, {
    ...patch,
    upload_enabled: false,
    manual_upload_only: true
  });

  if (!updated) {
    return channelNotFound();
  }

  return NextResponse.json({
    ok: true,
    message: "채널 프로필을 저장했습니다. 자동 업로드는 비활성화 상태로 유지됩니다.",
    channel_profile: updated,
    youtube: getYouTubeChannelReadiness(),
    created_worker_jobs: 0
  });
}

function channelNotFound() {
  return NextResponse.json(
    {
      ok: false,
      error_code: "CHANNEL_PROFILE_NOT_FOUND",
      message: "채널 프로필을 찾을 수 없습니다.",
      created_worker_jobs: 0
    },
    { status: 404 }
  );
}

async function readJsonBody(request: Request) {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}
