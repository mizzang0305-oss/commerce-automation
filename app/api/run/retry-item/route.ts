import { NextResponse } from "next/server";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { buildN8nPayload, callN8nWebhook, getN8nConfigStatus } from "@/lib/server/n8nClient";
import { createAutomationRun } from "@/lib/server/runLog";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { id } = await request.json();
  const repository = getAutomationRepository();
  const item = await repository.getQueueItem(id);

  if (!item) {
    return NextResponse.json({ ok: false, message: "상품 큐 항목을 찾을 수 없습니다." }, { status: 404 });
  }

  const settings = await repository.getSettings();
  const payload = buildN8nPayload("retry_item", { settings, item });
  const config = getN8nConfigStatus();

  if (!config.retryItemConfigured || !config.secretConfigured) {
    const message = "n8n Webhook 설정이 없어 실행할 수 없습니다.";
    await repository.appendRun(
      createAutomationRun({
        request_id: payload.request_id,
        run_type: "retry_item",
        status: "failed",
        log: message,
        safe_message: message
      })
    );
    return NextResponse.json({ ok: false, message, request_id: payload.request_id }, { status: 503 });
  }

  const result = await callN8nWebhook("retry_item", payload);
  await repository.appendRun(
    createAutomationRun({
      request_id: result.requestId,
      n8n_run_id: result.runId,
      http_status: result.httpStatus,
      run_type: "retry_item",
      status: result.ok ? "success" : "failed",
      processed_count: result.processedCount || (result.ok ? 1 : 0),
      error_count: result.errorCount,
      log: result.log,
      safe_message: result.message
    })
  );

  return NextResponse.json(
    {
      ok: result.ok,
      message: result.message,
      request_id: result.requestId,
      response_status: result.httpStatus,
      safe_summary: result.safeSummary
    },
    { status: result.ok ? 200 : 503 }
  );
}
