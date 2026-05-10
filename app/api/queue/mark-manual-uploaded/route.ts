import { NextResponse } from "next/server";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import type { Platform } from "@/types/automation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { id, platform } = (await request.json()) as { id?: string; platform?: Platform };

  if (!id || !platform || !["youtube", "tiktok", "threads"].includes(platform)) {
    return NextResponse.json({ ok: false, message: "요청 값이 올바르지 않습니다." }, { status: 400 });
  }

  const item = await getAutomationRepository().markManualUploaded(id, platform);

  if (!item) {
    return NextResponse.json({ ok: false, message: "상품 큐 항목을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    message: "운영자가 수동 업로드 완료로 표시했습니다. 실제 업로드를 실행한 것은 아닙니다.",
    item
  });
}
