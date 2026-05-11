import { NextResponse } from "next/server";
import type { AutomationRunStatus, ProductQueueItem } from "@/types/automation";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { verifyCallbackRequest } from "@/lib/server/callbackAuth";
import { sanitizeCallbackBody } from "@/lib/server/n8nCallback";
import { sanitizeN8nText } from "@/lib/server/n8nResponse";
import { createAutomationRun } from "@/lib/server/runLog";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = verifyCallbackRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status });
  }

  const body = sanitizeCallbackBody((await request.json()) as Record<string, unknown>);
  const repository = getAutomationRepository();
  const item = (body.item || {}) as Partial<ProductQueueItem>;
  const updated = item.id
    ? await repository.updateQueueItemById(item.id, item)
    : item.raw_coupang_url
      ? await repository.updateQueueItemByRawUrl(item.raw_coupang_url, item)
      : null;
  const status = body.status === "success" ? "success" : "failed";

  await repository.appendRun(
    createAutomationRun({
      request_id: typeof body.request_id === "string" ? body.request_id : undefined,
      run_type: "retry_item",
      status: status as AutomationRunStatus,
      processed_count: updated ? 1 : 0,
      error_count: status === "failed" ? 1 : 0,
      log: sanitizeN8nText(JSON.stringify(body)),
      safe_message:
        typeof body.error_message === "string" && body.error_message
          ? body.error_message
          : updated
            ? "item callback 결과를 큐에 반영했습니다."
            : "item callback 대상 큐를 찾지 못했습니다."
    })
  );

  return NextResponse.json({ ok: true, message: "callback 결과를 반영했습니다.", updated: Boolean(updated) });
}
