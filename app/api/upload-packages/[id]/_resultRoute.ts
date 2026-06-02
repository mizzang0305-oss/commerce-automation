import { NextResponse } from "next/server";
import { buildManualUploadResultPackage, type ManualUploadResultAction } from "@/lib/channels/uploadResult";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";

export type UploadPackageResultRouteContext = {
  params: Promise<{ id: string }>;
};

export async function handleManualUploadResult(
  request: Request,
  context: UploadPackageResultRouteContext,
  action: ManualUploadResultAction
) {
  const { id } = await context.params;
  const repository = getAutomationRepository();
  const currentPackage = await repository.getChannelUploadPackage(id);

  if (!currentPackage) {
    return NextResponse.json(
      {
        ok: false,
        message: "업로드 패키지를 찾을 수 없습니다.",
        missing_reasons: ["upload_package"],
        created_worker_jobs: 0
      },
      { status: 404 }
    );
  }

  const result = buildManualUploadResultPackage({
    currentPackage,
    action,
    body: await readJsonBody(request)
  });

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
    message: getResultMessage(action),
    package: savedPackage,
    created_worker_jobs: 0
  });
}

async function readJsonBody(request: Request) {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function getResultMessage(action: ManualUploadResultAction) {
  if (action === "uploaded") {
    return "수동 업로드 완료 상태를 기록했습니다. 실제 플랫폼 업로드 API는 호출하지 않았습니다.";
  }
  if (action === "skipped") {
    return "업로드 패키지를 스킵 상태로 기록했습니다. 실제 플랫폼 업로드 API는 호출하지 않았습니다.";
  }
  return "업로드 패키지를 수정 필요 상태로 기록했습니다. 실제 플랫폼 업로드 API는 호출하지 않았습니다.";
}
