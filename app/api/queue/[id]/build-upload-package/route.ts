import { NextResponse } from "next/server";
import { getDefaultChannelProfiles } from "@/lib/channels/defaultChannels";
import { buildChannelUploadPackage } from "@/lib/channels/uploadPackage";
import { routeQueueItemToChannel } from "@/lib/channels/channelRouting";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type BuildUploadPackageBody = {
  channel_profile_id?: unknown;
};

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await readJsonBody(request);
  const preferredChannelId = typeof body.channel_profile_id === "string" ? body.channel_profile_id.trim() : "";
  const repository = getAutomationRepository();
  const [item, content, assets] = await Promise.all([
    repository.getQueueItem(id),
    repository.getGeneratedContentByQueueItem(id),
    repository.getProductAssets(id)
  ]);

  if (!item) {
    return NextResponse.json(
      {
        ok: false,
        message: "상품 큐 항목을 찾을 수 없습니다.",
        missing_reasons: ["product_queue_item"],
        created_worker_jobs: 0
      },
      { status: 404 }
    );
  }

  const channels = getDefaultChannelProfiles();
  const channel = routeQueueItemToChannel(item, channels, preferredChannelId);
  if (!channel) {
    return NextResponse.json(
      {
        ok: false,
        message: preferredChannelId
          ? "채널 프로필을 찾을 수 없거나 수동 업로드 전용 채널이 아닙니다."
          : "사용 가능한 수동 업로드 채널 프로필이 없습니다.",
        missing_reasons: ["channel_profile"],
        created_worker_jobs: 0
      },
      { status: preferredChannelId ? 404 : 400 }
    );
  }

  const result = buildChannelUploadPackage({ item, content, assets, channel });
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: result.message,
        missing_reasons: result.missing_reasons,
        created_worker_jobs: 0
      },
      { status: result.status }
    );
  }

  const savedPackage = await repository.upsertChannelUploadPackage(result.package);

  return NextResponse.json({
    ok: true,
    message: "채널 업로드 패키지를 생성했습니다. 실제 업로드 API는 호출하지 않았습니다.",
    package: savedPackage,
    checklist: result.checklist,
    created_worker_jobs: 0
  });
}

async function readJsonBody(request: Request): Promise<BuildUploadPackageBody> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body as BuildUploadPackageBody : {};
  } catch {
    return {};
  }
}
