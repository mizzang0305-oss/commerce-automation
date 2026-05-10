import { NextResponse } from "next/server";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { createAutomationRun } from "@/lib/server/runLog";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { id } = await request.json();
  const repository = getAutomationRepository();
  const item = await repository.skipQueueItem(id);

  if (!item) {
    return NextResponse.json({ ok: false, message: "상품 큐 항목을 찾을 수 없습니다." }, { status: 404 });
  }

  await repository.appendRun(
    createAutomationRun({
      run_type: "skip_item",
      status: "success",
      processed_count: 1,
      log: `큐 항목 ${item.id}을 제외로 변경했습니다. 외부 업로드나 Webhook 성공으로 기록하지 않았습니다.`,
      safe_message: "상품이 제외 상태로 변경되었습니다."
    })
  );

  return NextResponse.json({ ok: true, message: "상품이 제외 상태로 변경되었습니다.", item });
}
