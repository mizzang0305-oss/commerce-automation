import { NextResponse } from "next/server";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const repository = getAutomationRepository();
  const item = await repository.getQueueItem(id);

  if (!item) {
    return NextResponse.json({ ok: false, message: "상품 큐 항목을 찾을 수 없습니다." }, { status: 404 });
  }

  const content = await repository.getGeneratedContentByQueueItem(id);
  return NextResponse.json({ item, content });
}
