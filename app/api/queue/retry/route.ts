import { NextResponse } from "next/server";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { buildN8nPayload, callN8nWebhook } from "@/lib/server/n8nClient";
import { createAutomationRun } from "@/lib/server/runLog";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { id } = await request.json();
  const repository = getAutomationRepository();
  const item = await repository.retryQueueItem(id);

  if (!item) {
    return NextResponse.json({ ok: false, message: "상품 큐 항목을 찾을 수 없습니다." }, { status: 404 });
  }

  const settings = await repository.getSettings();
  const result = await callN8nWebhook("retry_item", buildN8nPayload("retry_item", { settings, item }));

  await repository.appendRun(
    createAutomationRun({
      run_type: "retry_item",
      status: result.ok ? "success" : "failed",
      processed_count: result.ok ? 1 : 0,
      log: result.log,
      safe_message: result.message
    })
  );

  return NextResponse.json({ ok: result.ok, message: result.message, item }, { status: result.ok ? 200 : 503 });
}
